import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';

// Error for every Roqqu-side failure: transport, non-2xx, or a documented
// `{ status: 'fail', message }` body. Never carries credentials.
export class RoqquError extends Error {
  constructor(message: string, public readonly providerMessage?: string) {
    super(message);
    this.name = 'RoqquError';
  }
}

export type RoqquEnv = 'staging' | 'live';

export interface RoqquWalletCustomer {
  email: string;
  first_name: string;
  last_name: string;
}

export interface RoqquResponse<T> {
  status: 'success' | 'fail';
  message: string;
  data: T;
}

export interface DepositRecord {
  ref: string;
  status: number; // Raw numeric status: recorded, never interpreted
  genesis: number;
  email: string;
  value: number;
  network: string;
  token: string;
  address: string;
  sender: string;
  extra: string | null;
  tx_hash: string;
  created_at?: string; // ISO time Roqqu recorded the deposit (per Roqqu docs)
}

// GET /rates entry. rate is units of that currency per 1 USD; status 1 = on.
export interface FiatRateEntry {
  symbol: string;
  title?: string;
  rate: number | string;
  status: number | string;
  [extra: string]: unknown;
}

// GET /prices data, keyed by lowercase token symbol. price is a decimal
// string in USD.
export type CryptoPriceMap = Record<
  string,
  { price: string | number; change?: number | string } | undefined
>;

const REQUEST_TIMEOUT_MS = 15000;
// Market feeds back a payment page, so they fail fast.
const MARKET_TIMEOUT_MS = 8000;
// Roqqu sits behind Cloudflare, which refused requests from the hosted
// server that carried Node's default user agent ("node"). Every request
// names the client and asks for JSON.
export const ROQQU_USER_AGENT = 'TakeFlow-Backend/1.0 (+https://github.com/kingsoduah/TakeFlow)';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

// A receiving address in the right shape for the network, for demo mode
// only: Tron addresses start with T (34 base58 characters), EVM addresses
// are 0x plus 40 hex characters. Nothing can be sent to it on chain.
export function simulatedAddress(network: string): string {
  if (network === 'trc20') {
    const bytes = randomBytes(33);
    let out = 'T';
    for (const byte of bytes) out += BASE58[byte % BASE58.length];
    return out;
  }
  return `0x${randomBytes(20).toString('hex')}`;
}

// Sole boundary to Roqqu API Services. Header and body formats follow
// ROQQU_API_REFERENCE.md per endpoint:
// - Auth header is environment-selected: x-staging-api-key (staging) or
//   x-api-key (live). The retrigger doc names x-api-key; on staging the
//   staging header is used instead (verified staging behavior) — flagged.
// - Content types: JSON for generate-wallet; x-www-form-urlencoded for
//   balances, get-addresses, requery and retrigger.
@Injectable()
export class RoqquService {
  private readonly logger = new Logger(RoqquService.name);
  private readonly baseUrl: string;
  private readonly env: RoqquEnv;
  private readonly stagingKey?: string;
  private readonly liveKey?: string;
  private readonly relaySecret?: string;
  // Demo mode: addresses are simulated instead of created by Roqqu.
  readonly simulatesPayments: boolean;

  constructor(configService: ConfigService) {
    this.baseUrl =
      configService.get<string>('ROQQU_BASE_URL') ?? 'https://service.roqqu.com/v1';
    this.env = (configService.get<string>('ROQQU_ENV') ?? 'staging') as RoqquEnv;
    this.stagingKey = configService.get<string>('ROQQU_STAGING_API_KEY');
    this.liveKey = configService.get<string>('ROQQU_API_KEY');
    // Set when ROQQU_BASE_URL points at the roqqu-relay Worker (see
    // roqqu-relay/), which only relays requests carrying this secret.
    this.relaySecret = configService.get<string>('ROQQU_RELAY_SECRET');
    this.simulatesPayments = configService.get<boolean>('DEMO_PAYMENTS') === true;
  }

  private authHeader(): { name: string; key: string } {
    if (this.env === 'staging') {
      if (!this.stagingKey) {
        throw new RoqquError('Roqqu staging API key is not configured');
      }
      return { name: 'x-staging-api-key', key: this.stagingKey };
    }
    if (!this.liveKey) {
      throw new RoqquError('Roqqu live API key is not configured');
    }
    return { name: 'x-api-key', key: this.liveKey };
  }

  private async request<T>(
    path: string,
    opts: {
      method: 'GET' | 'POST';
      query?: Record<string, string | undefined>;
      form?: Record<string, string | undefined>;
      json?: unknown;
    },
  ): Promise<RoqquResponse<T>> {
    const { name, key } = this.authHeader();
    return this.send<T>(path, opts, { [name]: key }, REQUEST_TIMEOUT_MS);
  }

  // Public market data path. GET /rates and GET /prices answer without a
  // key, but on 5 Nov 2026 Roqqu's Cloudflare showed a bot check ("Just a
  // moment...") to keyless requests from the hosted server. When a key is
  // configured it is sent here too; with no key the request goes keyless.
  private async publicGet<T>(path: string): Promise<RoqquResponse<T>> {
    let auth: Record<string, string> = {};
    try {
      const { name, key } = this.authHeader();
      auth = { [name]: key };
    } catch {
      // No key configured: keyless request.
    }
    return this.send<T>(path, { method: 'GET' }, auth, MARKET_TIMEOUT_MS);
  }

  private async send<T>(
    path: string,
    opts: {
      method: 'GET' | 'POST';
      form?: Record<string, string | undefined>;
      json?: unknown;
    },
    authHeaders: Record<string, string>,
    timeoutMs: number,
  ): Promise<RoqquResponse<T>> {
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': ROQQU_USER_AGENT,
      ...(this.relaySecret ? { 'x-relay-secret': this.relaySecret } : {}),
      ...authHeaders,
    };
    let body: string | undefined;
    if (opts.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.json);
    } else if (opts.form !== undefined) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      const params = new URLSearchParams();
      for (const [k, v] of Object.entries(opts.form)) {
        if (v !== undefined) params.append(k, v);
      }
      body = params.toString();
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        method: opts.method,
        headers,
        body,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw new RoqquError(
        `Roqqu request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // A copy of the body, read only when it is not JSON, so the log shows
    // whether a block page (for example Cloudflare's) came back instead.
    const copy = typeof res.clone === 'function' ? res.clone() : null;
    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
      const snippet = copy
        ? (await copy.text().catch(() => '')).replace(/\s+/g, ' ').trim().slice(0, 200)
        : '';
      this.logger.warn(
        `Roqqu ${opts.method} ${path} returned non-JSON (HTTP ${res.status}): ${snippet}`,
      );
      throw new RoqquError(`Roqqu returned a non-JSON response (HTTP ${res.status})`);
    }
    if (!res.ok || payload?.status === 'fail') {
      throw new RoqquError(
        `Roqqu request failed: ${payload?.message ?? `HTTP ${res.status}`}`,
        payload?.message,
      );
    }
    return payload as RoqquResponse<T>;
  }

  // GET /rates (no auth). Fiat currencies with units per 1 USD.
  async getFiatRates() {
    return this.publicGet<FiatRateEntry[]>('/rates');
  }

  // GET /prices (no auth). USD price of each token, keyed by symbol.
  async getCryptoPrices() {
    return this.publicGet<CryptoPriceMap>('/prices');
  }

  // POST /balances (form). Both params optional per docs.
  async getBalances(email?: string, token?: string) {
    return this.request<Record<string, unknown>>('/balances', {
      method: 'POST',
      form: { email, token },
    });
  }

  // POST /wallets/generate-wallet (JSON). Network-level addresses: the
  // endpoint takes a network code, not an asset — one address serves
  // whatever token arrives on that network.
  async generateWallet(
    network: string,
    customer: RoqquWalletCustomer,
  ): Promise<RoqquResponse<{ address: string }>> {
    if (this.simulatesPayments) {
      return {
        status: 'success',
        message: 'simulated address (demo mode)',
        data: { address: simulatedAddress(network) },
      };
    }
    return this.request<{ address: string }>('/wallets/generate-wallet', {
      method: 'POST',
      json: { network, customer },
    });
  }

  // POST /wallets/get-addresses (form). Sent with the environment auth
  // header (the doc example omits auth; staging tests used the staging
  // header — flagged as assumed).
  async getAddresses(network: string) {
    return this.request<Array<Record<string, unknown>>>('/wallets/get-addresses', {
      method: 'POST',
      form: { network },
    });
  }

  // GET /transaction/deposit/:tx_hash
  async getDeposit(txHash: string) {
    return this.request<DepositRecord>(
      `/transaction/deposit/${encodeURIComponent(txHash)}`,
      { method: 'GET' },
    );
  }

  // GET /transaction/status/:tx_hash
  async getTransactionStatus(txHash: string) {
    return this.request<{ status: number; email: string; value: number; network: string }>(
      `/transaction/status/${encodeURIComponent(txHash)}`,
      { method: 'GET' },
    );
  }

  // POST /transaction/requery/:network (form, tx_hash in body)
  async requeryTransaction(network: string, txHash: string) {
    return this.request<null>(`/transaction/requery/${encodeURIComponent(network)}`, {
      method: 'POST',
      form: { tx_hash: txHash },
    });
  }

  // GET /webhooks (auth header per environment; doc example omits it)
  async getWebhooks() {
    return this.request<Record<string, unknown>>('/webhooks', { method: 'GET' });
  }

  // POST /webhooks/retrigger (form, transaction_hash). Documented with
  // x-api-key; on staging the environment (staging) header is used instead.
  async retriggerWebhook(transactionHash: string) {
    return this.request<{ retriggered_count: number; transaction_hash: string }>(
      '/webhooks/retrigger',
      { method: 'POST', form: { transaction_hash: transactionHash } },
    );
  }
}
