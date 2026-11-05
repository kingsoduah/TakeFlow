import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BusinessDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  ownerId!: string;

  @ApiProperty({ example: 'Acme Studios' })
  businessName!: string;

  @ApiPropertyOptional({ example: 'billing@acme.example', nullable: true })
  businessEmail?: string | null;

  @ApiPropertyOptional({ example: 'agency', nullable: true })
  businessType?: string | null;

  @ApiProperty({ example: 5, description: 'Quote window in minutes (2 to 5)' })
  quoteWindowMinutes!: number;

  @ApiProperty({ example: 50, description: 'Shortfall tolerance in basis points (50 = 0.5%)' })
  shortfallToleranceBps!: number;

  @ApiProperty({ example: '2026-11-04T18:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-04T18:00:00.000Z' })
  updatedAt!: Date;
}
