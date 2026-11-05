import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Ada Lovelace' })
  fullName!: string;

  @ApiProperty({ example: 'ada@example.com' })
  email!: string;

  @ApiProperty({ example: '2026-11-04T18:00:00.000Z' })
  createdAt!: Date;

  @ApiProperty({ example: '2026-11-04T18:00:00.000Z' })
  updatedAt!: Date;
}

export class MeDto extends UserDto {
  @ApiProperty({
    example: 'NGN',
    enum: ['NGN', 'USD', 'GBP', 'EUR', 'GHS'],
    description:
      'Personal dashboard currency: the saved choice, else the currency of the first invoice, else USD',
  })
  displayCurrency!: string;
}

export class AuthResponseDto {
  @ApiProperty({ type: UserDto })
  user!: UserDto;

  @ApiProperty({
    description: 'JWT bearer token; send as Authorization: Bearer <token>',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;
}
