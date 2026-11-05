import { Module } from '@nestjs/common';
import { RoqquModule } from '../roqqu/roqqu.module.js';
import { RatesService } from './rates.service.js';

@Module({
  imports: [RoqquModule],
  providers: [RatesService],
  exports: [RatesService],
})
export class RatesModule {}
