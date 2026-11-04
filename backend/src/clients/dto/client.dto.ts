import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ClientDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ format: 'uuid' })
  businessId!: string;

  @ApiProperty({ example: 'Paystack Nigeria' })
  name!: string;

  @ApiPropertyOptional({ example: 'payables@client.example', nullable: true })
  email?: string | null;

  @ApiProperty({ example: '2026-11-04T18:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-04T18:00:00.000Z' })
  updatedAt!: Date;
}
