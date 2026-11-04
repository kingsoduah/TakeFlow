import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaNeon } from '@prisma/adapter-neon';
import { PrismaClient } from '@prisma/client';

// Runtime database client. Uses the pooled Neon connection (DATABASE_URL)
// through the serverless driver adapter, per the Neon Prisma guide.
// Migrations and other CLI commands use DATABASE_URL_UNPOOLED via
// prisma7.config.ts and never touch this client.
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(configService: ConfigService) {
    const connectionString = configService.getOrThrow<string>('DATABASE_URL');
    super({ adapter: new PrismaNeon({ connectionString }) });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
