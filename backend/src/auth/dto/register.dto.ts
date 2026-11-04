import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'Ada Lovelace', maxLength: 120 })
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  fullName!: string;

  @ApiProperty({ example: 'ada@example.com', maxLength: 254, format: 'email' })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  email!: string;

  // bcrypt truncates beyond 72 bytes; reject longer passwords explicitly.
  @ApiProperty({
    example: 'password-S1',
    minLength: 8,
    maxLength: 72,
    description: '8-72 bytes; bcrypt truncates longer input',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
