import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, WebhookProcessingStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReconciliationService } from '../reconciliation/reconciliation.service.js';
import { RoqquError, RoqquService } from '../roqqu/roqqu.service.js';
import {
  assertDepositMeta,
  TOKEN_RECEIVED,
  TOKEN_REFUNDED,
  TOKEN_SENT,
  WebhookPayload,
} from './webhook-events.js';
import { decryptWebhookBody } from './webhook-crypto.js';

export interface WebhookOutcome {
  result: 'processed' | 'duplicate' | 'ignored' | 'pending-verification';
  eventId?: string;
}

// Requery success messages documented in ROQQU_API_REFERENCE.md. Only these
// exact confirmations count; anything else leaves the deposit pending.
const REQUERY_CONFIRMED = 'Transaction confirmed in Block.';
const REQUERY_CREDITED = 'Transaction already credited.';

function isP2002(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
  );
}

// Public (Roqqu-signed, not JWT) webhook intake. Flow:
// parse → decrypt/validate → persist RECEIVED (idempotent) → ignore
// non-deposit events → verify against Roqqu transaction endpoints →
// reconcile. Unverifiable or malformed payloads never touch invoice balances.
@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly roqqu: RoqquService,
    private readonly reconciliation: ReconciliationService,
    private readonly config: ConfigService,
  ) {}

  async processIncoming(rawBody: unknown, ivHeader: unknown): Promise<WebhookOutcome> {
    const encryptedHex = this.extractHash(rawBody);
    const ivHex = this.extractIv(ivHeader);
    const apiKey = this.config.get<string>('ROQQU_WEBHOOK_API_KEY');
    if (!apiKey) {
      throw new InternalServerErrorException('Webhook decryption is not configured');
    }

    let payload: WebhookPayload;
    try {
      const decrypted = decryptWebhookBody({ encryptedHex, ivHex, apiKey });
      payload = JSON.parse(decrypted) as WebhookPayload;
    } catch (error) {
      await this.recordFailed(
        null,
        rawBody,
        error instanceof Error ? error.message : 'Decryption failed',
      );
      throw new BadRequestException('Invalid webhook payload');
    }

    const eventId = typeof payload.event_id === 'string' ? payload.event_id : null;
    if (!eventId) {
      await this.recordFailed(null, payload, 'Missing event_id');
      throw new BadRequestException('Invalid webhook payload');
    }

    const metaHash =
      payload.meta_data && typeof payload.meta_data.hash === 'string'
        ? payload.meta_data.hash
        : undefined;

    let event = await this.findEvent(eventId);
    if (!event) {
      try {
        event = await this.prisma.webhookEvent.create({
          data: {
            eventId,
            eventType: payload.event_type,
            transactionHash: metaHash,
            processingStatus: WebhookProcessingStatus.RECEIVED,
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        if (!isP2002(error)) throw error;
        event = await this.findEvent(eventId);
      }
    }
    // A redelivered event that already reached a terminal state is acked
    // without reprocessing. RECEIVED/FAILED events resume processing.
    if (
      event &&
      (event.processingStatus === WebhookProcessingStatus.PROCESSED ||
        event.processingStatus === WebhookProcessingStatus.IGNORED ||
        event.processingStatus === WebhookProcessingStatus.DUPLICATE)
    ) {
      return { result: 'duplicate', eventId };
    }

    if (
      payload.event_type === TOKEN_SENT ||
      payload.event_type === TOKEN_REFUNDED
    ) {
      await this.mark(eventId, WebhookProcessingStatus.IGNORED);
      return { result: 'ignored', eventId };
    }

    if (payload.event_type !== TOKEN_RECEIVED) {
      await this.mark(eventId, WebhookProcessingStatus.IGNORED);
      return { result: 'ignored', eventId };
    }

    try {
      assertDepositMeta(payload.meta_data);
    } catch (error) {
      await this.mark(
        eventId,
        WebhookProcessingStatus.FAILED,
        error instanceof Error ? error.message : 'Invalid meta_data',
      );
      throw new BadRequestException('Invalid webhook payload');
    }

    const meta = payload.meta_data;
    const value = new Prisma.Decimal(String(meta.value));
    const occurredAt = this.parseDate(payload.datetime);

    const verified = await this.verifyDeposit({
      txHash: String(meta.hash),
      address: String(meta.address),
      network: String(meta.network),
      token: String(meta.token).toUpperCase(),
      value,
    });
    if (!verified.ok) {
      if (verified.fatal) {
        await this.mark(eventId, WebhookProcessingStatus.FAILED, verified.reason);
        throw new BadRequestException('Invalid webhook payload');
      }
      return { result: 'pending-verification', eventId };
    }

    await this.reconciliation.reconcileVerifiedDeposit({
      transactionHash: String(meta.hash),
      receivingAddress: String(meta.address),
      asset: String(meta.token).toUpperCase(),
      network: String(meta.network),
      amount: value,
      providerReference: verified.ref,
      providerStatus: verified.status,
      occurredAt,
      // Deposit time for the quote window: Roqqu's deposit record
      // created_at, else the webhook datetime. The time the webhook reached
      // us is never used, because deliveries can be late.
      depositedAt: verified.createdAt ?? occurredAt,
    });

    await this.mark(eventId, WebhookProcessingStatus.PROCESSED);
    return { result: 'processed', eventId };
  }

  // A deposit counts as confirmed only when: the deposit lookup succeeds,
  // address/token/network/amount/hash all match the webhook, AND the requery
  // endpoint returns a documented confirmation. The raw numeric status is
  // recorded but never interpreted.
  private async verifyDeposit(args: {
    txHash: string;
    address: string;
    network: string;
    token: string;
    value: Prisma.Decimal;
  }): Promise<
    | { ok: true; ref: string; status: number; createdAt?: Date }
    | { ok: false; fatal: boolean; reason: string }
  > {
    let deposit;
    try {
      deposit = await this.roqqu.getDeposit(args.txHash);
    } catch (error) {
      if (error instanceof RoqquError) {
        return { ok: false, fatal: false, reason: error.message };
      }
      throw error;
    }
    const d = deposit.data;
    const matches =
      d.tx_hash === args.txHash &&
      d.address === args.address &&
      d.network === args.network &&
      String(d.token).toUpperCase() === args.token &&
      new Prisma.Decimal(String(d.value)).equals(args.value);
    if (!matches) {
      return { ok: false, fatal: true, reason: 'Deposit details do not match' };
    }

    try {
      const requery = await this.roqqu.requeryTransaction(args.network, args.txHash);
      if (
        requery.message !== REQUERY_CONFIRMED &&
        requery.message !== REQUERY_CREDITED
      ) {
        return { ok: false, fatal: false, reason: requery.message };
      }
    } catch (error) {
      if (error instanceof RoqquError) {
        return { ok: false, fatal: false, reason: error.message };
      }
      throw error;
    }
    return { ok: true, ref: d.ref, status: d.status, createdAt: this.parseDate(d.created_at) };
  }

  private extractHash(rawBody: unknown): string {
    if (
      typeof rawBody === 'object' &&
      rawBody !== null &&
      typeof (rawBody as Record<string, unknown>).hash === 'string'
    ) {
      return (rawBody as Record<string, string>).hash;
    }
    throw new BadRequestException('Invalid webhook payload');
  }

  private extractIv(ivHeader: unknown): string {
    if (typeof ivHeader === 'string' && ivHeader.length > 0) {
      return ivHeader;
    }
    throw new BadRequestException('Invalid webhook payload');
  }

  private parseDate(value: unknown): Date | undefined {
    if (typeof value !== 'string') return undefined;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }

  private findEvent(eventId: string) {
    return this.prisma.webhookEvent.findUnique({ where: { eventId } });
  }

  private async mark(
    eventId: string,
    status: WebhookProcessingStatus,
    errorMessage?: string,
  ) {
    await this.prisma.webhookEvent.update({
      where: { eventId },
      data: {
        processingStatus: status,
        errorMessage,
        processedAt:
          status === WebhookProcessingStatus.PROCESSED ||
          status === WebhookProcessingStatus.IGNORED
            ? new Date()
            : undefined,
      },
    });
  }

  private async recordFailed(
    eventId: string | null,
    payload: unknown,
    errorMessage: string,
  ) {
    try {
      await this.prisma.webhookEvent.create({
        data: {
          eventId,
          processingStatus: WebhookProcessingStatus.FAILED,
          payload: (payload ?? {}) as unknown as Prisma.InputJsonValue,
          errorMessage,
        },
      });
    } catch {
      // Audit persistence must never mask the original failure.
    }
  }
}
