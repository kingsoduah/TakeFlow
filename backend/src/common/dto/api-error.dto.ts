import { ApiProperty } from '@nestjs/swagger';

// Shape produced by HttpExceptionFilter for every error response.
export class ApiErrorDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({
    example: 'Validation failed',
    description: 'Validation messages from class-validator, or a single message',
    oneOf: [
      { type: 'string' },
      { type: 'array', items: { type: 'string' } },
    ],
  })
  message!: string | string[];

  @ApiProperty({ example: '/api/v1/businesses' })
  path!: string;

  @ApiProperty({ example: '2026-11-04T18:00:00.000Z' })
  timestamp!: string;
}
