import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ROQQU_USER_AGENT, RoqquError, RoqquService } from './roqqu.service.js';

function makeService(env: 'staging' | 'live') {
  const store: Record<string, string | undefined> = {
    ROQQU_BASE_URL: 'https://service.roqqu.com/v1',
    ROQQU_ENV: env,
    ROQQU_STAGING_API_KEY: 'staging-key-123',
    ROQQU_API_KEY: 'live-key-456',
  };
  const config = { get: (key: string) => store[key] } as unknown as ConfigService;
  return new RoqquService(config);
}

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 400, json: async () => body } as unknown as Response;
}

describe('RoqquService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('sends staging header and form body for balances', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'success', message: 'ok', data: {} }));
    await makeService('staging').getBalances('a@b.c', 'usdt');

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://service.roqqu.com/v1/balances');
    expect((init.headers as Record<string, string>)['x-staging-api-key']).toBe('staging-key-123');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/x-www-form-urlencoded',
    );
    expect(init.body as string).toContain('email=a%40b.c');
    expect(init.body as string).toContain('token=usdt');
  });

  it('names the client, asks for JSON and sends the key on the market feeds', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'success', message: 'ok', data: [] }));
    await makeService('staging').getFiatRates();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('https://service.roqqu.com/v1/rates');
    expect(headers['User-Agent']).toBe(ROQQU_USER_AGENT);
    expect(headers['Accept']).toBe('application/json');
    expect(headers['x-staging-api-key']).toBe('staging-key-123');
  });

  it('sends the relay secret only when one is configured', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'success', message: 'ok', data: [] }));
    const store: Record<string, string> = {
      ROQQU_BASE_URL: 'https://relay.example.workers.dev/v1',
      ROQQU_ENV: 'staging',
      ROQQU_STAGING_API_KEY: 'staging-key-123',
      ROQQU_RELAY_SECRET: 'relay-secret-abc',
    };
    const relayed = new RoqquService({ get: (k: string) => store[k] } as unknown as ConfigService);
    await relayed.getFiatRates();
    const [relayUrl, relayInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(relayUrl).toBe('https://relay.example.workers.dev/v1/rates');
    expect((relayInit.headers as Record<string, string>)['x-relay-secret']).toBe('relay-secret-abc');

    fetchMock.mockClear();
    await makeService('staging').getFiatRates();
    const [, directInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((directInit.headers as Record<string, string>)['x-relay-secret']).toBeUndefined();
  });

  it('simulates addresses in demo mode without calling Roqqu', async () => {
    const store: Record<string, unknown> = { ROQQU_ENV: 'staging', DEMO_PAYMENTS: true };
    const demo = new RoqquService({ get: (k: string) => store[k] } as unknown as ConfigService);
    const customer = { email: 'a@b.c', first_name: 'A', last_name: 'B' };

    const tron = await demo.generateWallet('trc20', customer);
    const bsc = await demo.generateWallet('bep20', customer);
    const base = await demo.generateWallet('base', customer);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(demo.simulatesPayments).toBe(true);
    expect(tron.data.address).toMatch(/^T[1-9A-HJ-NP-Za-km-z]{33}$/);
    expect(bsc.data.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(base.data.address).toMatch(/^0x[0-9a-f]{40}$/);
    expect(makeService('staging').simulatesPayments).toBe(false);
  });

  it('still fetches the market feeds keyless when no key is configured', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'success', message: 'ok', data: {} }));
    const config = {
      get: (key: string) => (key === 'ROQQU_ENV' ? 'staging' : undefined),
    } as unknown as ConfigService;
    await new RoqquService(config).getCryptoPrices();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(url).toBe('https://service.roqqu.com/v1/prices');
    expect(headers['x-staging-api-key']).toBeUndefined();
    expect(headers['x-api-key']).toBeUndefined();
  });

  it('sends JSON body for generate-wallet with network and customer', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: 'success', message: 'ok', data: { address: '0xabc' } }),
    );
    const res = await makeService('staging').generateWallet('erc20', {
      email: 'c@d.e',
      first_name: 'Ada',
      last_name: 'Lovelace',
    });
    expect(res.data.address).toBe('0xabc');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({
      network: 'erc20',
      customer: { email: 'c@d.e', first_name: 'Ada', last_name: 'Lovelace' },
    });
  });

  it('uses x-api-key on live', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'success', message: 'ok', data: [] }));
    await makeService('live').getAddresses('erc20');
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('live-key-456');
    expect((init.headers as Record<string, string>)['x-staging-api-key']).toBeUndefined();
  });

  it('maps provider fail bodies to RoqquError', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ status: 'fail', message: 'tx_hash details not found' }, false),
    );
    const error = await makeService('staging')
      .getDeposit('0xdead')
      .catch((e) => e);
    expect(error).toBeInstanceOf(RoqquError);
    expect(error.providerMessage).toBe('tx_hash details not found');
  });

  it('maps transport failures to RoqquError without leaking keys', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));
    const error = await makeService('staging')
      .getBalances()
      .catch((e) => e);
    expect(error).toBeInstanceOf(RoqquError);
    expect(String(error.message)).not.toContain('staging-key-123');
  });

  it('refuses to call without a configured key', async () => {
    const config = { get: () => undefined } as unknown as ConfigService;
    const error = await new RoqquService(config).getBalances().catch((e) => e);
    expect(error).toBeInstanceOf(RoqquError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
