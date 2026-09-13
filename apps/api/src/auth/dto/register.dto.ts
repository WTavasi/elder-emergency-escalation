import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Role } from '@prisma/client';

/**
 * Self-registration is limited to caregivers and family members.
 *
 * Elders are registered by a caregiver, because that is who actually sets the account
 * up and because the consent record has to name who consented on whose behalf.
 * Emergency responders and administrators are created by an administrator, since both
 * roles carry authority over other people's emergencies.
 */
export const SELF_REGISTERABLE_ROLES = [Role.CAREGIVER, Role.FAMILY_MEMBER] as const;

export class RegisterDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'phone must be in international format, for example +254712345678',
  })
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(160)
  email?: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(200)
  password: string;

  @IsIn(SELF_REGISTERABLE_ROLES as unknown as string[], {
    message: 'role must be CAREGIVER or FAMILY_MEMBER. Elders are registered by a caregiver.',
  })
  role: (typeof SELF_REGISTERABLE_ROLES)[number];
}
