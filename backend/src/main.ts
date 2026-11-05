import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { API_KEY_HEADER } from './api-keys/api-key.constants.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const env = app.get(ConfigService);

  // Lets req.ip (used by the public rate limiter) read the client address
  // from X-Forwarded-For, but only through the configured number of proxies.
  const trustProxyHops = env.get<number>('TRUST_PROXY_HOPS') ?? 0;
  if (trustProxyHops > 0) {
    app.getHttpAdapter().getInstance().set('trust proxy', trustProxyHops);
  }

  // CORS for the frontend. Only the listed origins get CORS headers; with
  // no list, CORS stays off. API key calls come from shop servers, which do
  // not need CORS.
  const frontendOrigins = env.get<string[]>('FRONTEND_ORIGINS') ?? [];
  if (frontendOrigins.length > 0) {
    app.enableCors({
      origin: frontendOrigins,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Retry-After'],
      maxAge: 600,
    });
  }

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

  const config = new DocumentBuilder()
    .setTitle('TakeFlow API')
    .setDescription('Crypto receivables management and payment reconciliation API')
    .setVersion('1.0')
    .addBearerAuth()
    .addApiKey({ type: 'apiKey', in: 'header', name: API_KEY_HEADER }, 'api-key')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  // NOTE: @nestjs/swagger's built-in UI middleware does not serve under this
  // stack's Express 5 router (404 on /docs*), so the OpenAPI document is
  // served as JSON from a plain Express route instead. Revisit the hosted UI
  // when upstream Express 5 support lands.
  app.getHttpAdapter().get('/api/v1/docs-json', (_req, res) => res.json(document));

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
}
// Plain call (no top-level await) to match the entry pattern Vercel detects
// for NestJS. A startup failure is still an unhandled rejection, which stops
// the process.
bootstrap();
