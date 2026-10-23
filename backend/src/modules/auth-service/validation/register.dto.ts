import {
  Equals,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';
import { E164, E164_MESSAGE } from './phone';

/**
 * Self-registration is limited to caregivers, family members and community volunteers.
 *
 * Elders are registered by a caregiver, because that is who actually sets the account
 * up and because the consent record has to name who consented on whose behalf.
 * Emergency responders and administrators are created by an administrator, since both
 * roles carry authority over other people's emergencies.
 */
export const SELF_REGISTERABLE_ROLES = [
  Role.CAREGIVER,
  Role.FAMILY_MEMBER,
  // Anybody may sign up to volunteer; nothing is sent to them until an administrator
  // approves their application, which is what keeps this from being a way in.
  Role.COMMUNITY_RESPONDER,
] as const;

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @Matches(E164, { message: E164_MESSAGE })
  phone: string;

  /** The six-digit code sent to that phone by POST /auth/verify-phone. */
  @Matches(/^\d{6}$/, { message: 'code must be the six digits sent by SMS' })
  code: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(160)
  email?: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(200)
  password: string;

  @IsIn(SELF_REGISTERABLE_ROLES as unknown as string[], {
    message:
      'role must be CAREGIVER, FAMILY_MEMBER or COMMUNITY_RESPONDER. Elders are registered by a caregiver.',
  })
  role: (typeof SELF_REGISTERABLE_ROLES)[number];

  /**
   * Agreement to the privacy notice, recorded as a consent row rather than trusted as a
   * checkbox. Must be true: there is no account without it.
   */
  @Equals(true, { message: 'the privacy notice must be accepted to create an account' })
  acceptedPrivacyNotice: boolean;
}
