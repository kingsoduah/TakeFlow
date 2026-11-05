import { Module } from '@nestjs/common';
import { RatesModule } from '../rates/rates.module.js';
import { QuotesService } from './quotes.service.js';

@Module({
  imports: [RatesModule],
  providers: [QuotesService],
  exports: [QuotesService],
})
export class QuotesModule {}
