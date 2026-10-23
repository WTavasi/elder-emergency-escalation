import { Matches } from 'class-validator';
import { E164, E164_MESSAGE } from './phone';

/**
 * An elder signing in with a code instead of a password: one sent by text to their own
 * phone, or one their caregiver made for them in the app.
 */
export class CodeSignInDto {
  @Matches(E164, { message: E164_MESSAGE })
  phone: string;

  @Matches(/^\d{6}$/, { message: 'code must be six digits' })
  code: string;
}
