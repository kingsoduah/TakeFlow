// Phase 2 e2e: auth + business ownership against the connected Neon DB.
// Test users/businesses use unique emails and are deleted in afterAll, so no
// residue is left on the branch.
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module.js';
import { HttpExceptionFilter } from './../src/common/filters/http-exception.filter.js';
import { PrismaService } from './../src/prisma/prisma.service.js';

describe('Auth + Businesses (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const userA = { fullName: 'Test User A', email: `phase2.a.${suffix}@example.com`, password: 'password-A1' };
  const userB = { fullName: 'Test User B', email: `phase2.b.${suffix}@example.com`, password: 'password-B1' };
  let tokenA = '';
  let tokenB = '';
  let userIdA = '';
  let userIdB = '';
  let businessAId = '';

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
  });

  afterAll(async () => {
    // Cleanup: remove every record created by this run.
    await prisma.business.deleteMany({
      where: { ownerId: { in: [userIdA, userIdB].filter(Boolean) } },
    });
    await prisma.user.deleteMany({
      where: { email: { in: [userA.email, userB.email] } },
    });
    await app.close();
  });

  it('registers user A (201, token, no password hash)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userA)
      .expect(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.email).toBe(userA.email);
    expect(res.body.user).not.toHaveProperty('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    tokenA = res.body.accessToken;
    userIdA = res.body.user.id;
  });

  it('rejects duplicate registration (409)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userA)
      .expect(409);
  });

  it('rejects weak registration payload (400)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ fullName: 'X', email: 'not-an-email', password: 'short' })
      .expect(400);
  });

  it('logs in user A (200 + token)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: userA.email, password: userA.password })
      .expect(200);
    expect(res.body.accessToken).toBeDefined();
    tokenA = res.body.accessToken;
  });

  it('rejects wrong password (401)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: userA.email, password: 'wrong-password-9' })
      .expect(401);
  });

  it('rejects /auth/me without a token (401)', async () => {
    await request(app.getHttpServer()).get('/api/v1/auth/me').expect(401);
  });

  it('returns the authenticated profile (no password hash)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.email).toBe(userA.email);
    expect(res.body).not.toHaveProperty('passwordHash');
  });

  it('rejects business creation without a token (401)', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/businesses')
      .send({ businessName: 'Nope' })
      .expect(401);
  });

  it('creates a business for user A (201)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/businesses')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ businessName: 'Acme Agency', businessType: 'agency' })
      .expect(201);
    expect(res.body.businessName).toBe('Acme Agency');
    businessAId = res.body.id;
  });

  it('lists user A businesses including the new one', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/businesses')
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.map((b: any) => b.id)).toContain(businessAId);
  });

  it('retrieves the business by id', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/businesses/${businessAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(200);
    expect(res.body.id).toBe(businessAId);
  });

  it('updates the business name', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${businessAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ businessName: 'Acme Agency Ltd' })
      .expect(200);
    expect(res.body.businessName).toBe('Acme Agency Ltd');
  });

  it('registers and logs in user B', async () => {
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(userB)
      .expect(201);
    tokenB = reg.body.accessToken;
    userIdB = reg.body.user.id;
  });

  it("user B cannot see user A's business (404, isolation)", async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${businessAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
    const list = await request(app.getHttpServer())
      .get('/api/v1/businesses')
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(200);
    expect(list.body.map((b: any) => b.id)).not.toContain(businessAId);
  });

  it("user B cannot update or delete user A's business", async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/businesses/${businessAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ businessName: 'Hijacked' })
      .expect(404);
    await request(app.getHttpServer())
      .delete(`/api/v1/businesses/${businessAId}`)
      .set('Authorization', `Bearer ${tokenB}`)
      .expect(404);
  });

  it('deletes the business (204) and it stays gone', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/businesses/${businessAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(204);
    await request(app.getHttpServer())
      .get(`/api/v1/businesses/${businessAId}`)
      .set('Authorization', `Bearer ${tokenA}`)
      .expect(404);
  });
});
