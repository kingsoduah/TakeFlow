import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WebhookOutcomeDto {
  @ApiProperty({
    enum: ['processed', 'duplicate', 'ignored', 'pending-verification'],
    description:
      'processed = verified and reconciled; duplicate = already handled; ' +
      'ignored = non-payment event; pending-verification = deposit could not be confirmed yet',
    example: 'processed',
  })
  result!: 'processed' | 'duplicate' | 'ignored' | 'pending-verification';

  @ApiPropertyOptional({ example: 'evt_01HZX...' })
  eventId?: string;
}
