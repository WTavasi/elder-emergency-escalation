import { IsEmail, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/**
 * A phone number or an email address, with the password.
 *
 * Phone is the handle everywhere, because an elder may not have an email address and the
 * number is how the system reaches a person. Email is accepted as well for anybody who
 * has one on their account, which is mostly the administrator at a desk. Exactly one is
 * used: given both, the phone number wins, so a client cannot widen a guess by sending
 * two handles at once.
 */
export class LoginDto {
  @ValidateIf((dto: LoginDto) => dto.email === undefined || dto.phone !== undefined)
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  phone?: string;

  @ValidateIf((dto: LoginDto) => dto.phone === undefined)
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(160)
  email?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}
