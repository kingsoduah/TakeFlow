import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhookProcessingStatus } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../prisma/prisma.service.js';
import { ReconciliationService } from '../reconciliation/reconciliation.service.js';
import { RoqquError, RoqquService } from '../roqqu/roqqu.service.js';
import { encryptWebhookBody } from './webhook-crypto.js';
import { WebhooksService } from './webhooks.service.js';

const WEBHOOK_KEY = 'test-webhook-key-0123456789abcdef';
const IV = '00112233445566778899aabbccddeeff';

function encryptedBody(payload: unknown) {
  return {
    hash: encryptWebhookBody({
      plaintext: JSON.stringify(payload),
      ivHex: IV,
      apiKey: WEBHOOK_KEY,
    }),
  };
}

const baseMeta = {
  address: '0xrecv',
  network: 'erc20',
  token: 'USDT',
  value: '1500.00',
  hash: '0xhash1',
  status: 1,
};

describe('WebhooksService', () => {
  const prismaMock = {
    webhookEvent: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    transaction: { findUnique: vi.fn() },
  };
  const roqquMock = { getDeposit: vi.fn(), requeryTransaction: vi.fn() };
  const reconMock = { reconcileVerifiedDeposit: vi.fn() };
  const config = { get: (key: string) => (key === 'ROQQU_WEBHOOK_API_KEY' ? WEBHOOK_KEY : undefined) };
  let service: WebhooksService;

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.webhookEvent.findUnique.mockResolvedValue(null);
    service = new WebhooksService(
      prismaMock as unknown as PrismaService,
      roqquMock as unknown as RoqquService,
      reconMock as unknown as ReconciliationService,
      config as unknown as ConfigService,
    );
  });

  it('rejects a body without a hash (400)', async () => {
    const error = await service.processIncoming({ nope: true }, IV).catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(prismaMock.webhookEvent.create).not.toHaveBeenCalled();
  });

  it('rejects an undecryptable payload (400) and audits it', async () => {
    const error = await service
      .processIncoming({ hash: 'aabbccdd' }, IV)
      .catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(prismaMock.webhookEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventId: null,
          processingStatus: WebhookProcessingStatus.FAILED,
        }),
      }),
    );
  });

  it('ignores token_sent without reconciling', async () => {
    prismaMock.webhookEvent.create.mockResolvedValue({ eventId: 'evt-1' });
    const result = await service.processIncoming(
      encryptedBody({ event_id: 'evt-1', event_type: 'token_sent', meta_data: baseMeta }),
      IV,
    );
    expect(result).toEqual({ result: 'ignored', eventId: 'evt-1' });
    expect(reconMock.reconcileVerifiedDeposit).not.toHaveBeenCalled();
    expect(prismaMock.webhookEvent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { eventId: 'evt-1' } }),
    );
  });

  it('processes a valid token_received end to end', async () => {
    prismaMock.webhookEvent.create.mockResolvedValue({ eventId: 'evt-2' });
    roqquMock.getDeposit.mockResolvedValue({
      status: 'success',
      message: 'transaction retrieved',
      data: {
        ref: '4829',
        status: 1,
        email: 'm@b.c',
        value: 1500,
        network: 'erc20',
        token: 'usdt',
        address: '0xrecv',
        sender: '0xsend',
        tx_hash: '0xhash1',
      },
    });
    roqquMock.requeryTransaction.mockResolvedValue({
      status: 'success',
      message: 'Transaction confirmed in Block.',
      data: null,
    });
    reconMock.reconcileVerifiedDeposit.mockResolvedValue({
      status: 'matched',
      transactionId: 'tx-1',
      invoiceId: 'inv-1',
    });

    const result = await service.processIncoming(
      encryptedBody({
        event_id: 'evt-2',
        event_type: 'token_received',
        meta_data: baseMeta,
        datetime: '2026-11-04T12:00:00Z',
      }),
      IV,
    );
    expect(result).toEqual({ result: 'processed', eventId: 'evt-2' });
    expect(reconMock.reconcileVerifiedDeposit).toHaveBeenCalledWith(
      expect.objectContaining({
        transactionHash: '0xhash1',
        receivingAddress: '0xrecv',
        asset: 'USDT',
      }),
    );
  });

  it('uses the deposit record created_at as the deposit time, else the webhook datetime', async () => {
    const deposit = {
      ref: '4829',
      status: 1,
      email: 'm@b.c',
      value: 1500,
      network: 'erc20',
      token: 'usdt',
      address: '0xrecv',
      sender: '0xsend',
      tx_hash: '0xhash1',
    };
    roqquMock.requeryTransaction.mockResolvedValue({
      status: 'success',
      message: 'Transaction confirmed in Block.',
      data: null,
    });
    reconMock.reconcileVerifiedDeposit.mockResolvedValue({ status: 'matched' });

    prismaMock.webhookEvent.create.mockResolvedValue({ eventId: 'evt-t1' });
    roqquMock.getDeposit.mockResolvedValue({
      status: 'success',
      message: 'transaction retrieved',
      data: { ...deposit, created_at: '2026-11-05T15:01:10.000Z' },
    });
    await service.processIncoming(
      encryptedBody({
        event_id: 'evt-t1',
        event_type: 'token_received',
        meta_data: baseMeta,
        datetime: '2026-11-05T15:09:00Z',
      }),
      IV,
    );
    expect(reconMock.reconcileVerifiedDeposit).toHaveBeenLastCalledWith(
      expect.objectContaining({
        depositedAt: new Date('2026-11-05T15:01:10.000Z'),
        occurredAt: new Date('2026-11-05T15:09:00Z'),
      }),
    );

    prismaMock.webhookEvent.create.mockResolvedValue({ eventId: 'evt-t2' });
    roqquMock.getDeposit.mockResolvedValue({
      status: 'success',
      message: 'transaction retrieved',
      data: deposit,
    });
    await service.processIncoming(
      encryptedBody({
        event_id: 'evt-t2',
        event_type: 'token_received',
        meta_data: baseMeta,
        datetime: '2026-11-05T15:09:00Z',
      }),
      IV,
    );
    expect(reconMock.reconcileVerifiedDeposit).toHaveBeenLastCalledWith(
      expect.objectContaining({ depositedAt: new Date('2026-11-05T15:09:00Z') }),
    );
  });

  it('treats redelivery of a finished event as duplicate without reprocessing', async () => {
    prismaMock.webhookEvent.findUnique.mockResolvedValue({
      eventId: 'evt-3',
      processingStatus: WebhookProcessingStatus.PROCESSED,
    });
    const result = await service.processIncoming(
      encryptedBody({ event_id: 'evt-3', event_type: 'token_received', meta_data: baseMeta }),
      IV,
    );
    expect(result).toEqual({ result: 'duplicate', eventId: 'evt-3' });
    expect(roqquMock.getDeposit).not.toHaveBeenCalled();
    expect(reconMock.reconcileVerifiedDeposit).not.toHaveBeenCalled();
  });

  it('leaves unverifiable deposits pending without reconciling', async () => {
    prismaMock.webhookEvent.create.mockResolvedValue({ eventId: 'evt-4' });
    roqquMock.getDeposit.mockRejectedValue(new RoqquError('tx_hash details not found'));
    const result = await service.processIncoming(
      encryptedBody({ event_id: 'evt-4', event_type: 'token_received', meta_data: baseMeta }),
      IV,
    );
    expect(result).toEqual({ result: 'pending-verification', eventId: 'evt-4' });
    expect(reconMock.reconcileVerifiedDeposit).not.toHaveBeenCalled();
  });

  it('rejects deposits whose details mismatch the webhook (400, failed)', async () => {
    prismaMock.webhookEvent.create.mockResolvedValue({ eventId: 'evt-5' });
    roqquMock.getDeposit.mockResolvedValue({
      status: 'success',
      message: 'transaction retrieved',
      data: {
        ref: '4829',
        status: 1,
        email: 'm@b.c',
        value: 9999,
        network: 'erc20',
        token: 'usdt',
        address: '0xrecv',
        sender: '0xsend',
        tx_hash: '0xhash1',
      },
    });
    const error = await service
      .processIncoming(
        encryptedBody({ event_id: 'evt-5', event_type: 'token_received', meta_data: baseMeta }),
        IV,
      )
      .catch((e) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect(reconMock.reconcileVerifiedDeposit).not.toHaveBeenCalled();
  });
});
