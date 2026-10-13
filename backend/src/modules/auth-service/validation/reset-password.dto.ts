import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { E164, E164_MESSAGE } from './phone';

/** Setting a new password with a code sent by POST /auth/forgot-password. */
export class ResetPasswordDto {
  @Matches(E164, { message: E164_MESSAGE })
  phone: string;

  @Matches(/^\d{6}$/, { message: 'code must be the six digits sent by SMS' })
  code: string;

  @IsString()
  @MinLength(8, { message: 'the new password must be at least 8 characters' })
  @MaxLength(200)
  newPassword: string;
}
