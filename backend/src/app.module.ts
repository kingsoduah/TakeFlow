import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { BusinessesModule } from './businesses/businesses.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { DocsModule } from './docs/docs.module.js';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { InvoicesModule } from './invoices/invoices.module.js';
import { ReconciliationModule } from './reconciliation/reconciliation.module.js';
import { RoqquModule } from './roqqu/roqqu.module.js';
import { TransactionsModule } from './transactions/transactions.module.js';
import { WalletsModule } from './wallets/wallets.module.js';
import { WebhooksModule } from './webhooks/webhooks.module.js';
import { PrismaModule } from './prisma/prisma.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // Repo-root .env.local (managed by `neon env pull`) first, then local
      // backend/.env overrides. DB vars live in .env.local; backend/.env
      // must not define placeholder DB URLs that could shadow them.
      envFilePath: ['../.env.local', '.env'],
      validate: validateEnv,
    }),
    HealthModule,
    PrismaModule,
    AuthModule,
    BusinessesModule,
    ClientsModule,
    InvoicesModule,
    WalletsModule,
    TransactionsModule,
    ReconciliationModule,
    RoqquModule,
    WebhooksModule,
    DocsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
