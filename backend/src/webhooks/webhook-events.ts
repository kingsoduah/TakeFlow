// Official Roqqu wallet-deposit (coin) webhook events. Payment-link events
// are a separate mechanism and are NOT handled here.
export const TOKEN_RECEIVED = 'token_received';
export const TOKEN_SENT = 'token_sent';
export const TOKEN_REFUNDED = 'token_refunded';

export interface WebhookMetaData {
  address: string;
  extra?: string | null;
  network: string;
  token: string;
  value: string | number;
  hash: string;
  status?: number;
  customer?: unknown;
  address_total_received?: string | number;
  genesis?: number;
}

export interface WebhookPayload {
  event_id: string;
  event_type: string;
  meta_data: WebhookMetaData;
  datetime: string;
}

const REQUIRED_META = ['address', 'network', 'token', 'value', 'hash'] as const;

export function assertDepositMeta(meta: unknown): asserts meta is WebhookMetaData {
  if (typeof meta !== 'object' || meta === null) {
    throw new Error('Webhook meta_data must be an object');
  }
  for (const field of REQUIRED_META) {
    const value = (meta as Record<string, unknown>)[field];
    if (typeof value !== 'string' && typeof value !== 'number') {
      throw new Error(`Webhook meta_data.${field} is required`);
    }
    if (typeof value === 'string' && value.trim() === '') {
      throw new Error(`Webhook meta_data.${field} must not be empty`);
    }
  }
}
