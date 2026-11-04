import { Module } from '@nestjs/common';
import { BusinessesModule } from '../businesses/businesses.module.js';
import { ClientsController } from './clients.controller.js';
import { ClientsService } from './clients.service.js';

@Module({
  imports: [BusinessesModule],
  controllers: [ClientsController],
  providers: [ClientsService],
})
export class ClientsModule {}
