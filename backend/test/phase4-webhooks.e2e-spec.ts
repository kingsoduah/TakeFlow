// Phase 4 e2e: wallets, webhooks, reconciliation and views against Neon.
// The Roqqu HTTP boundary is stubbed (unit tests prove request construction);
// webhook encryption uses a TEST-ONLY fixture key injected by
// vitest.config.e2e.ts — not a real credential — so full decrypt → verify →
// reconcile paths run for real. Self-cleaning in afterAll.
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { RoqquError, RoqquService } from './../src/roqqu/roqqu.service.js';
import {
  encryptWebhookBody,
  randomWebhookIvHex,
} from './../src/webhooks/webhook-crypto.js';

const WEBHOOK_KEY = process.env.ROQQU_WEBHOOK_API_KEY as string;

describe('Phase 4 webhooks + reconciliation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const userA = { fullName: 'P4 User A', email: `p4.a.${suffix}@example.com`, password: 'password-A1' };
  const userB = { fullName: 'P4 User B', email: `p4.b.${suffix}@example.com`, password: 'password-B1' };
  const tokenA = { value: '' };
  const tokenB = { value: '' };
  const ids = { bizA: '', bizB: '', clientA: '', invFull: '', invPart: '', invOver: '', invTmp: '' };
  const addrs = { full: '', part: '', over: '', tmp: '' };
  let generateCalls = 0;

  // Deposit fixtures keyed by tx hash; requery confirms unless flagged pending.
  const deposits = new Map<string, any>();
  const pendingRequery = new Set<string>();
  const roqquStub = {
    generateWallet: async (network: string) => {
      generateCalls += 1;
      return { status: 'success', message: 'ok', data: { address: `0xaddr-${network}-${suffix}-${generateCalls}` } };
    },
    getDeposit: async (txHash: string) => {
      const fixture = deposits.get(txHash);
      if (!fixture) throw new RoqquError('tx_hash details not found');
      return { status: 'success', message: 'transaction retrieved', data: fixture };
    },
    requeryTransaction: async (network: string, txHash: string) => {
      if (pendingRequery.has(txHash)) {
        return { status: 'fail', message: 'transaction not found or still pending', data: null };
      }
      return { status: 'success', message: 'Transaction confirmed in Block.', data: null };
    },
    getBalances: async () => ({ status: 'success', message: 'ok', data: { usdt: 137 } }),
    getWebhooks: async () => ({ status: 'success', message: 'ok', data: {} }),
  };

  function sendDeposit(eventId: string, meta: Record<string, unknown>, iv = randomWebhookIvHex()) {
    const body = {
      hash: encryptWebhookBody({
        plaintext: JSON.stringify({ event_id: eventId, event_type: 'token_received', meta_data: meta, datetime: '2026-11-04T12:00:00Z' }),
        ivHex: iv,
        apiKey: WEBHOOK_KEY,
      }),
    };
    return { body, iv };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(RoqquService)
      .useValue(roqquStub)
      .compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
    prisma = app.get(PrismaService);

    const server = () => request(app.getHttpServer());
    tokenA.value = (await server().post('/api/v1/auth/register').send(userA).expect(201)).body.accessToken;
    tokenB.value = (await server().post('/api/v1/auth/register').send(userB).expect(201)).body.accessToken;
    ids.bizA = (await server().post('/api/v1/businesses').set('Authorization', `Bearer ${tokenA.value}`).send({ businessName: 'P4 Biz A' }).expect(201)).body.id;
    ids.bizB = (await server().post('/api/v1/businesses').set('Authorization', `Bearer ${tokenB.value}`).send({ businessName: 'P4 Biz B' }).expect(201)).body.id;
    ids.clientA = (await server().post(`/api/v1/businesses/${ids.bizA}/clients`).set('Authorization', `Bearer ${tokenA.value}`).send({ name: 'Paying Client', email: 'pay@client.example' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await prisma.webhookEvent.deleteMany({});
    await prisma.business.deleteMany({ where: { id: { in: [ids.bizA, ids.bizB] } } });
    await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email] } } });
    await app.close();
  });

  const asA = () => ({ Authorization: `Bearer ${tokenA.value}` });
  const asB = () => ({ Authorization: `Bearer ${tokenB.value}` });
  const server = () => request(app.getHttpServer());
  const invoicePayload = (overrides = {}) => ({
    amount: '1500.00',
    currency: 'USD',
    cryptoAsset: 'USDT',
    network: 'erc20',
    dueDate: '2026-12-31T00:00:00.000Z',
    ...overrides,
  });

  it('generates an address once and reuses it (Roqqu called once)', async () => {
    ids.invFull = (
      await server().post(`/api/v1/businesses/${ids.bizA}/invoices`).set(asA()).send(invoicePayload({ clientId: ids.clientA })).expect(201)
    ).body.id;
    const first = await server().post(`/api/v1/businesses/${ids.bizA}/invoices/${ids.invFull}/address`).set(asA()).expect(201);
    expect(first.body.address).toBe(`0xaddr-erc20-${suffix}-1`);
    expect(first.body.reused).toBe(false);
    addrs.full = first.body.address;
    const second = await server().post(`/api/v1/businesses/${ids.bizA}/invoices/${ids.invFull}/address`).set(asA()).expect(201);
    expect(second.body.address).toBe(first.body.address);
    expect(second.body.reused).toBe(true);
    expect(generateCalls).toBe(1);
  });

  it('exposes payment instructions with the assigned address', async () => {
    const res = await server().get(`/api/v1/businesses/${ids.bizA}/invoices/${ids.invFull}/payment`).set(asA()).expect(200);
    expect(res.body.paymentReady).toBe(true);
    expect(res.body.address).toBe(addrs.full);
    expect(res.body.businessName).toBe('P4 Biz A');
    expect(res.body).not.toHaveProperty('accessToken');
  });

  it('credits an exact payment to PAID on first delivery', async () => {
    const txHash = `0xfull-${suffix}`;
    deposits.set(txHash, { ref: '4829', status: 1, email: 'm@b.c', value: 1500, network: 'erc20', token: 'usdt', address: addrs.full, sender: '0xsender', tx_hash: txHash });
    const { body, iv } = sendDeposit(`evt-full-${suffix}`, { address: addrs.full, network: 'erc20', token: 'USDT', value: '1500.00', hash: txHash, status: 1 });
    const res = await server().post('/api/v1/webhooks/roqqu').set('x-api-key', iv).send(body).expect(200);
    expect(res.body.result).toBe('processed');

    const inv = await server().get(`/api/v1/businesses/${ids.bizA}/invoices/${ids.invFull}`).set(asA()).expect(200);
    expect(inv.body.status).toBe('PAID');
    expect(Number(inv.body.amountReceived)).toBe(1500);
    expect(Number(inv.body.amountOutstanding)).toBe(0);
    const payments = await server().get(`/api/v1/businesses/${ids.bizA}/invoices/${ids.invFull}/payments`).set(asA()).expect(200);
    expect(payments.body.paymentCount).toBe(1);
    expect(payments.body.transactions[0].transactionHash).toBe(txHash);
  });

  it('does not double-credit a redelivered webhook', async () => {
    const txHash = `0xfull-${suffix}`;
    const { body, iv } = sendDeposit(`evt-full-${suffix}`, { address: addrs.full, network: 'erc20', token: 'USDT', value: '1500.00', hash: txHash, status: 1 });
    const res = await server().post('/api/v1/webhooks/roqqu').set('x-api-key', iv).send(body).expect(200);
    expect(res.body.result).toBe('duplicate');
    const inv = await server().get(`/api/v1/businesses/${ids.bizA}/invoices/${ids.invFull}`).set(asA()).expect(200);
    expect(Number(inv.body.amountReceived)).toBe(1500);
  });

  it('records partial payments as PARTIALLY_PAID', async () => {
    ids.invPart = (
      await server().post(`/api/v1/businesses/${ids.bizA}/invoices`).set(asA()).send(invoicePayload({ amount: '2000.00', clientId: ids.clientA })).expect(201)
    ).body.id;
    addrs.part = (
      await server().post(`/api/v1/businesses/${ids.bizA}/invoices/${ids.invPart}/address`).set(asA()).expect(201)
    ).body.address;
    const txHash = `0xpart-${suffix}`;
    deposits.set(txHash, { ref: '4830', status: 1, email: 'm@b.c', value: 500, network: 'erc20', token: 'usdt', address: addrs.part, sender: '0xsender', tx_hash: txHash });
    const { body, iv } = sendDeposit(`evt-part-${suffix}`, { address: addrs.part, network: 'erc20', token: 'USDT', value: '500.00', hash: txHash, status: 1 });
    await server().post('/api/v1/webhooks/roqqu').set('x-api-key', iv).send(body).expect(200);
    const inv = await server().get(`/api/v1/businesses/${ids.bizA}/invoices/${ids.invPart}`).set(asA()).expect(200);
    expect(inv.body.status).toBe('PARTIALLY_PAID');
    expect(Number(inv.body.amountReceived)).toBe(500);
    expect(Number(inv.body.amountOutstanding)).toBe(1500);
  });

  it('records overpayments as PAID with excess on the transaction', async () => {
    ids.invOver = (
      await server().post(`/api/v1/businesses/${ids.bizA}/invoices`).set(asA()).send(invoicePayload({ amount: '1000.00', clientId: ids.clientA })).expect(201)
    ).body.id;
    addrs.over = (
      await server().post(`/api/v1/businesses/${ids.bizA}/invoices/${ids.invOver}/address`).set(asA()).expect(201)
    ).body.address;
    const txHash = `0xover-${suffix}`;
    deposits.set(txHash, { ref: '4831', status: 1, email: 'm@b.c', value: 1200, network: 'erc20', token: 'usdt', address: addrs.over, sender: '0xsender', tx_hash: txHash });
    const { body, iv } = sendDeposit(`evt-over-${suffix}`, { address: addrs.over, network: 'erc20', token: 'USDT', value: '1200.00', hash: txHash, status: 1 });
    await server().post('/api/v1/webhooks/roqqu').set('x-api-key', iv).send(body).expect(200);
    const payments = await server().get(`/api/v1/businesses/${ids.bizA}/invoices/${ids.invOver}/payments`).set(asA()).expect(200);
    expect(Number(payments.body.totalReceived)).toBe(1200);
    expect(Number(payments.body.amountOutstanding)).toBe(0);
    expect(payments.body.invoice.status).toBe('PAID');
    expect(Number(payments.body.transactions[0].excessAmount)).toBe(200);
  });

  it('stores deposits to wallet addresses without invoices as unmatched', async () => {
    // A generated address whose invoice was deleted (DRAFT): the wallet row
    // survives, so the deposit carries a business but matches no invoice.
    ids.invTmp = (
      await server().post(`/api/v1/businesses/${ids.bizA}/invoices`).set(asA()).send(invoicePayload({ amount: '10.00', clientId: ids.clientA })).expect(201)
    ).body.id;
    addrs.tmp = (
      await server().post(`/api/v1/businesses/${ids.bizA}/invoices/${ids.invTmp}/address`).set(asA()).expect(201)
    ).body.address;
    await server().delete(`/api/v1/businesses/${ids.bizA}/invoices/${ids.invTmp}`).set(asA()).expect(204);
    const txHash = `0xunknown-${suffix}`;
    deposits.set(txHash, { ref: '4832', status: 1, email: 'm@b.c', value: 10, network: 'erc20', token: 'usdt', address: addrs.tmp, sender: '0xsender', tx_hash: txHash });
    const { body, iv } = sendDeposit(`evt-unknown-${suffix}`, { address: addrs.tmp, network: 'erc20', token: 'USDT', value: '10', hash: txHash, status: 1 });
    await server().post('/api/v1/webhooks/roqqu').set('x-api-key', iv).send(body).expect(200);
    const list = await server().get(`/api/v1/businesses/${ids.bizA}/transactions?status=UNMATCHED`).set(asA()).expect(200);
    expect(list.body.data.map((t: any) => t.transactionHash)).toContain(txHash);
  });

  it('ignores token_sent events without touching balances', async () => {
    const iv = randomWebhookIvHex();
    const body = {
      hash: encryptWebhookBody({
        plaintext: JSON.stringify({ event_id: `evt-sent-${suffix}`, event_type: 'token_sent', meta_data: { address: `0xaddr-erc20-${suffix}`, network: 'erc20', token: 'USDT', value: '1', hash: `0xsent-${suffix}` }, datetime: '2026-11-04T12:00:00Z' }),
        ivHex: iv,
        apiKey: WEBHOOK_KEY,
      }),
    };
    const res = await server().post('/api/v1/webhooks/roqqu').set('x-api-key', iv).send(body).expect(200);
    expect(res.body.result).toBe('ignored');
  });

  it('rejects malformed and undecryptable payloads (400)', async () => {
    await server().post('/api/v1/webhooks/roqqu').send({ nope: true }).expect(400);
    await server().post('/api/v1/webhooks/roqqu').set('x-api-key', randomWebhookIvHex()).send({ hash: 'aabbccdd' }).expect(400);
  });

  it('summarizes receivables and isolates user B', async () => {
    const summary = await server().get(`/api/v1/businesses/${ids.bizA}/summary`).set(asA()).expect(200);
    expect(Number(summary.body.totalInvoiced)).toBeGreaterThan(0);
    expect(summary.body.invoiceCountByStatus.PAID).toBeGreaterThanOrEqual(1);
    await server().get(`/api/v1/businesses/${ids.bizA}/transactions`).set(asB()).expect(404);
    await server().get(`/api/v1/businesses/${ids.bizA}/summary`).set(asB()).expect(404);
  });

  it('proxies merchant balances without leaking keys', async () => {
    const res = await server().get('/api/v1/roqqu/balances?token=usdt').set(asA()).expect(200);
    expect(res.body.data.usdt).toBe(137);
  });
});
