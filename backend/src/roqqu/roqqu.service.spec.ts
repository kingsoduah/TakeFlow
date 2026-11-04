import { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RoqquError, RoqquService } from './roqqu.service.js';

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
