import { Module } from '@nestjs/common';
import { ReconciliationModule } from '../reconciliation/reconciliation.module.js';
import { RoqquModule } from '../roqqu/roqqu.module.js';
import { WebhooksController } from './webhooks.controller.js';
import { WebhooksService } from './webhooks.service.js';

@Module({
  imports: [RoqquModule, ReconciliationModule],
  controllers: [WebhooksController],
  providers: [WebhooksService],
})
export class WebhooksModule {}
