import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
await bootstrap();
