import { Module } from '@nestjs/common';
import { QuotesModule } from '../quotes/quotes.module.js';
import { ReconciliationService } from './reconciliation.service.js';

@Module({
  imports: [QuotesModule],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
