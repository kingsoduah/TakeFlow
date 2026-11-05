import { Module } from '@nestjs/common';
import { BusinessesModule } from '../businesses/businesses.module.js';
import { CheckoutsModule } from '../checkouts/checkouts.module.js';
import { ApiKeyGuard } from './api-key.guard.js';
import { ApiKeysController, CheckoutApiController } from './api-keys.controller.js';
import { ApiKeysService } from './api-keys.service.js';

@Module({
  imports: [BusinessesModule, CheckoutsModule],
  controllers: [ApiKeysController, CheckoutApiController],
  providers: [ApiKeysService, ApiKeyGuard],
})
export class ApiKeysModule {}
