// Phase 3 e2e: clients + invoices against the connected Neon DB.
// Unique test data; businesses are deleted in afterAll (cascade removes
// their clients and invoices), then the users.
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Clients + Invoices (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const userA = { fullName: 'P3 User A', email: `p3.a.${suffix}@example.com`, password: 'password-A1' };
  const userB = { fullName: 'P3 User B', email: `p3.b.${suffix}@example.com`, password: 'password-B1' };
  const authA: { token?: string } = {};
  const authB: { token?: string } = {};
  const ids = { bizA: '', bizB: '', clientA: '', invDraft: '', invPending: '' };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

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
    const regA = await server().post('/api/v1/auth/register').send(userA).expect(201);
    authA.token = regA.body.accessToken;
    const regB = await server().post('/api/v1/auth/register').send(userB).expect(201);
    authB.token = regB.body.accessToken;
    const bizA = await server()
      .post('/api/v1/businesses')
      .set('Authorization', `Bearer ${authA.token}`)
      .send({ businessName: 'P3 Biz A' })
      .expect(201);
    ids.bizA = bizA.body.id;
    const bizB = await server()
      .post('/api/v1/businesses')
      .set('Authorization', `Bearer ${authB.token}`)
      .send({ businessName: 'P3 Biz B' })
      .expect(201);
    ids.bizB = bizB.body.id;
  });

  afterAll(async () => {
    await prisma.business.deleteMany({ where: { id: { in: [ids.bizA, ids.bizB] } } });
    await prisma.user.deleteMany({ where: { email: { in: [userA.email, userB.email] } } });
    await app.close();
  });

  const asA = () => ({ Authorization: `Bearer ${authA.token}` });
  const asB = () => ({ Authorization: `Bearer ${authB.token}` });
  const clients = (biz: string) => `/api/v1/businesses/${biz}/clients`;
  const invoices = (biz: string) => `/api/v1/businesses/${biz}/invoices`;
  const server = () => request(app.getHttpServer());

  const invoicePayload = (overrides = {}) => ({
    amount: '1500.00',
    currency: 'USD',
    cryptoAsset: 'USDT',
    network: 'trc20',
    dueDate: '2026-12-31T00:00:00.000Z',
    ...overrides,
  });

  it('creates a client for business A (201)', async () => {
    const res = await server()
      .post(clients(ids.bizA))
      .set(asA())
      .send({ name: 'Globex Corp', email: 'ap@globex.example' })
      .expect(201);
    expect(res.body.name).toBe('Globex Corp');
    ids.clientA = res.body.id;
  });

  it('rejects an invalid client email (400)', async () => {
    await server()
      .post(clients(ids.bizA))
      .set(asA())
      .send({ name: 'Bad', email: 'not-an-email' })
      .expect(400);
  });

  it("user B cannot read or use business A's client (404 isolation)", async () => {
    await server().get(`${clients(ids.bizA)}/${ids.clientA}`).set(asB()).expect(404);
    await server()
      .post(invoices(ids.bizB))
      .set(asB())
      .send(invoicePayload({ clientId: ids.clientA }))
      .expect(404);
  });

  it('updates and retrieves the client', async () => {
    const upd = await server()
      .patch(`${clients(ids.bizA)}/${ids.clientA}`)
      .set(asA())
      .send({ name: 'Globex Corp Ltd' })
      .expect(200);
    expect(upd.body.name).toBe('Globex Corp Ltd');
    const list = await server().get(clients(ids.bizA)).set(asA()).expect(200);
    expect(list.body.map((c: any) => c.id)).toContain(ids.clientA);
  });

  it('creates a draft invoice linked to the client', async () => {
    const res = await server()
      .post(invoices(ids.bizA))
      .set(asA())
      .send(invoicePayload({ clientId: ids.clientA, description: 'Website build' }))
      .expect(201);
    expect(res.body.status).toBe('DRAFT');
    expect(Number(res.body.amount)).toBe(1500);
    expect(Number(res.body.amountOutstanding)).toBe(1500);
    expect(Number(res.body.amountReceived)).toBe(0);
    expect(res.body.invoiceNumber).toMatch(/^INV-/);
    expect(res.body.paymentReference).toMatch(/^pay_/);
    expect(res.body.client.id).toBe(ids.clientA);
    ids.invDraft = res.body.id;
  });

  it('rejects invalid money and currency input (400)', async () => {
    await server()
      .post(invoices(ids.bizA))
      .set(asA())
      .send(invoicePayload({ amount: 'abc' }))
      .expect(400);
    await server()
      .post(invoices(ids.bizA))
      .set(asA())
      .send(invoicePayload({ amount: '-5' }))
      .expect(400);
    await server()
      .post(invoices(ids.bizA))
      .set(asA())
      .send(invoicePayload({ currency: 'usdollar' }))
      .expect(400);
  });

  it('rejects PAID status at creation and duplicate numbers (400/409)', async () => {
    await server()
      .post(invoices(ids.bizA))
      .set(asA())
      .send(invoicePayload({ status: 'PAID' }))
      .expect(400);
    const numbered = await server()
      .post(invoices(ids.bizA))
      .set(asA())
      .send(invoicePayload({ invoiceNumber: `P3-DUP-${suffix}` }))
      .expect(201);
    expect(numbered.body.invoiceNumber).toBe(`P3-DUP-${suffix}`);
    await server()
      .post(invoices(ids.bizA))
      .set(asA())
      .send(invoicePayload({ invoiceNumber: `P3-DUP-${suffix}` }))
      .expect(409);
    // Cleanup: numbered invoice is a DRAFT, deletable.
    await server()
      .delete(`${invoices(ids.bizA)}/${numbered.body.id}`)
      .set(asA())
      .expect(204);
  });

  it('issues the draft (DRAFT to PENDING) and filters by status', async () => {
    await server()
      .patch(`${invoices(ids.bizA)}/${ids.invDraft}`)
      .set(asA())
      .send({ status: 'PENDING' })
      .expect(200);
    const filtered = await server()
      .get(`${invoices(ids.bizA)}?status=PENDING`)
      .set(asA())
      .expect(200);
    expect(filtered.body.total).toBeGreaterThanOrEqual(1);
    expect(filtered.body.data.map((i: any) => i.id)).toContain(ids.invDraft);
    expect(filtered.body.limit).toBe(50);
    const other = await server()
      .get(`${invoices(ids.bizA)}?status=DRAFT`)
      .set(asA())
      .expect(200);
    expect(other.body.data.map((i: any) => i.id)).not.toContain(ids.invDraft);
    ids.invPending = ids.invDraft;
  });

  it('rejects manual PAID assignment and deleting issued invoices', async () => {
    await server()
      .patch(`${invoices(ids.bizA)}/${ids.invPending}`)
      .set(asA())
      .send({ status: 'PAID' })
      .expect(400);
    await server()
      .delete(`${invoices(ids.bizA)}/${ids.invPending}`)
      .set(asA())
      .expect(400);
  });

  it("user B cannot touch business A's invoices (404 isolation)", async () => {
    await server().get(`${invoices(ids.bizA)}/${ids.invPending}`).set(asB()).expect(404);
    await server()
      .patch(`${invoices(ids.bizA)}/${ids.invPending}`)
      .set(asB())
      .send({ description: 'Hijacked' })
      .expect(404);
  });

  it('deleting the client nulls invoice references, not records', async () => {
    await server().delete(`${clients(ids.bizA)}/${ids.clientA}`).set(asA()).expect(204);
    const inv = await server()
      .get(`${invoices(ids.bizA)}/${ids.invPending}`)
      .set(asA())
      .expect(200);
    expect(inv.body.client).toBeNull();
    expect(Number(inv.body.amountOutstanding)).toBe(1500);
  });
});
