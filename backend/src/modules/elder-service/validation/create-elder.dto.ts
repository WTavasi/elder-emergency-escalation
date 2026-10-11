import { Type } from 'class-transformer';
import {
  Equals,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { CareLevel } from '@prisma/client';
import { E164, E164_MESSAGE } from '../../auth-service/validation/phone';

/** The elder's registered home, as chosen from an address search. */
export class HomeDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-90)
  @Max(90)
  latitude: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(-180)
  @Max(180)
  longitude: number;

  /** What responders read, so it is required: a pair of decimals helps nobody at the door. */
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  label: string;
}

/**
 * An elder's account, set up by their caregiver.
 *
 * The caregiver holds the phone while it receives the code, which is the proof that the
 * number really is the elder's, and chooses the password the elder will sign in with.
 */
export class CreateElderDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @Matches(E164, { message: E164_MESSAGE })
  phone: string;

  @Matches(/^\d{6}$/, { message: 'code must be the six digits sent by SMS' })
  code: string;

  @IsString()
  @MinLength(8, { message: 'password must be at least 8 characters' })
  @MaxLength(200)
  password: string;

  @ValidateNested()
  @Type(() => HomeDto)
  home: HomeDto;

  /** A severity input. Left out means not recorded, which is scored as assisted. */
  @IsOptional()
  @IsEnum(CareLevel)
  careLevel?: CareLevel;

  /** How the caregiver is related to the elder, recorded on the consent, e.g. "daughter". */
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  relationship: string;

  /**
   * The caregiver confirms the elder agreed, or that they may agree on the elder's
   * behalf. Recorded as consent rows naming the caregiver as the one who gave it.
   */
  @Equals(true, { message: 'consent must be confirmed to register an elder' })
  consentConfirmed: boolean;
}
