import { Body, Controller, Headers, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { ApiErrorDto } from '../common/dto/api-error.dto.js';
import { WebhookOutcomeDto } from './dto/webhook-outcome.dto.js';
import { WebhooksService } from './webhooks.service.js';

// Public endpoint: Roqqu cannot present a TakeFlow JWT. Protection is the
// documented webhook verification (aes-256-ctr decryption with the
// operator-configured key + x-api-key IV), not bearer tokens.
@ApiTags('webhooks')
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post('roqqu')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Receive a Roqqu wallet-deposit webhook (public)',
    description:
      'Body is { hash } where hash is hex AES-256-CTR ciphertext. The x-api-key ' +
      'header carries the hex IV. Decryption key: first 32 characters of the ' +
      'operator-configured Roqqu webhook key. Only token_received is processed; ' +
      'token_sent and token_refunded are acknowledged and ignored. Deposits are ' +
      'verified against Roqqu before any invoice balance changes. This endpoint ' +
      'uses webhook verification, not JWT auth.',
  })
  @ApiHeader({
    name: 'x-api-key',
    required: true,
    description: 'Hex-encoded 16-byte AES IV for this delivery',
    example: '00112233445566778899aabbccddeeff',
  })
  @ApiBody({
    description: 'Encrypted webhook envelope',
    schema: {
      type: 'object',
      required: ['hash'],
      properties: {
        hash: {
          type: 'string',
          description: 'Hex-encoded AES-256-CTR ciphertext',
          example: '9f2c1d7a4b8e...',
        },
      },
    },
  })
  @ApiOkResponse({ type: WebhookOutcomeDto })
  @ApiBadRequestResponse({
    description: 'Missing/invalid hash or IV, or a payload that fails verification',
    type: ApiErrorDto,
  })
  receive(
    @Body() body: unknown,
    @Headers('x-api-key') ivHeader: string | undefined,
  ) {
    return this.webhooksService.processIncoming(body, ivHeader);
  }
}
