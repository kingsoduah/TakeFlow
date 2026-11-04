import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOkResponse({ description: 'Service is running' })
  check() {
    return {
      status: 'ok',
      service: 'takeflow-backend',
      timestamp: new Date().toISOString(),
    };
  }
}
