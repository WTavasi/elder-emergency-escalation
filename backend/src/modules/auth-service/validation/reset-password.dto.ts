import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { E164, E164_MESSAGE } from './phone';

/** Setting a new password with a code sent by POST /auth/forgot-password. */
export class ResetPasswordDto {
  @Matches(E164, { message: E164_MESSAGE })
  phone: string;

  @Matches(/^\d{6}$/, { message: 'Enter the 6-digit code from the text.' })
  code: string;

  @IsString()
  @MinLength(8, { message: 'Use at least 8 characters for the new password.' })
  @MaxLength(200)
  newPassword: string;
}
