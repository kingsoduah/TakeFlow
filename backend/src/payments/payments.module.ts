import { Module } from '@nestjs/common';
import { CheckoutsModule } from '../checkouts/checkouts.module.js';
import { QuotesModule } from '../quotes/quotes.module.js';
import { RatesModule } from '../rates/rates.module.js';
import { WalletsModule } from '../wallets/wallets.module.js';
import { PublicPaymentsController } from './public-payments.controller.js';
import { PublicPaymentsService } from './public-payments.service.js';

@Module({
  imports: [QuotesModule, RatesModule, WalletsModule, CheckoutsModule],
  controllers: [PublicPaymentsController],
  providers: [PublicPaymentsService],
  exports: [PublicPaymentsService],
})
export class PaymentsModule {}
