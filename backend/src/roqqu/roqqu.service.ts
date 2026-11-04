import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
}

const REQUEST_TIMEOUT_MS = 15000;

// Sole boundary to Roqqu API Services. Header and body formats follow
// ROQQU_API_REFERENCE.md per endpoint:
// - Auth header is environment-selected: x-staging-api-key (staging) or
//   x-api-key (live). The retrigger doc names x-api-key; on staging the
//   staging header is used instead (verified staging behavior) — flagged.
// - Content types: JSON for generate-wallet; x-www-form-urlencoded for
//   balances, get-addresses, requery and retrigger.
@Injectable()
export class RoqquService {
  private readonly baseUrl: string;
  private readonly env: RoqquEnv;
  private readonly stagingKey?: string;
  private readonly liveKey?: string;

  constructor(configService: ConfigService) {
    this.baseUrl =
      configService.get<string>('ROQQU_BASE_URL') ?? 'https://service.roqqu.com/v1';
    this.env = (configService.get<string>('ROQQU_ENV') ?? 'staging') as RoqquEnv;
    this.stagingKey = configService.get<string>('ROQQU_STAGING_API_KEY');
    this.liveKey = configService.get<string>('ROQQU_API_KEY');
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
    const headers: Record<string, string> = { [name]: key };
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
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      throw new RoqquError(
        `Roqqu request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    let payload: any = null;
    try {
      payload = await res.json();
    } catch {
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
  async generateWallet(network: string, customer: RoqquWalletCustomer) {
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
