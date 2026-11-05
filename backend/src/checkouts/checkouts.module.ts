import { Module } from '@nestjs/common';
import { BusinessesModule } from '../businesses/businesses.module.js';
import { CheckoutsController, ProductLinksController } from './checkouts.controller.js';
import { CheckoutsService } from './checkouts.service.js';
import { ProductLinksService } from './product-links.service.js';

@Module({
  imports: [BusinessesModule],
  controllers: [CheckoutsController, ProductLinksController],
  providers: [CheckoutsService, ProductLinksService],
  exports: [CheckoutsService],
})
export class CheckoutsModule {}
