import { Module } from '@nestjs/common';
import { BusinessesModule } from '../businesses/businesses.module.js';
import { RoqquModule } from '../roqqu/roqqu.module.js';
import { WalletsService } from './wallets.service.js';

@Module({
  imports: [BusinessesModule, RoqquModule],
  providers: [WalletsService],
  exports: [WalletsService],
})
export class WalletsModule {}
