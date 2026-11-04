import { Module } from '@nestjs/common';
import { RoqquController } from './roqqu.controller.js';
import { RoqquService } from './roqqu.service.js';

@Module({
  controllers: [RoqquController],
  providers: [RoqquService],
  exports: [RoqquService],
})
export class RoqquModule {}
