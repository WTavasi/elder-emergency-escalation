import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { E164, E164_MESSAGE } from './phone';

/**
 * Asking for a code at the number an account is moving to.
 *
 * The current password is asked for first, for everyone who signs in with one, so a
 * phone left unlocked is not enough to take the account to another number. An elder,
 * who may never have known the password somebody else set, is not asked: the text to
 * the old number afterwards is their safeguard.
 */
export class StartPhoneChangeDto {
  @Matches(E164, { message: E164_MESSAGE })
  phone: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password?: string;
}

/** The code that came to the new number, which is the proof the person holds it. */
export class ChangePhoneDto {
  @Matches(E164, { message: E164_MESSAGE })
  phone: string;

  @Matches(/^\d{6}$/, { message: 'code must be the six digits sent by SMS' })
  code: string;
}
