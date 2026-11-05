import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Shop website', maxLength: 80, description: 'A label to recognise the key' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;
}

export class ApiKeyDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Shop website' })
  name!: string;

  @ApiProperty({ example: 'tfk_1a2b3c4d5e6f', description: 'Start of the key, safe to show' })
  prefix!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiPropertyOptional({ nullable: true })
  lastUsedAt!: Date | null;

  @ApiPropertyOptional({ nullable: true, description: 'Set once the key is revoked' })
  revokedAt!: Date | null;
}

export class CreatedApiKeyDto extends ApiKeyDto {
  @ApiProperty({
    example: 'tfk_1a2b3c4d5e6f_0f1e2d3c4b5a69788796a5b4c3d2e1f00f1e2d3c4b5a6978',
    description: 'The full key. Shown only in this response; store it on the shop server.',
  })
  key!: string;
}
