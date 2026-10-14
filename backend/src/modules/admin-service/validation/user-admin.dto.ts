import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Role } from '@prisma/client';
import { E164, E164_MESSAGE } from '../../auth-service/validation/phone';

/**
 * The roles an administrator creates. Caregivers and family members sign themselves up
 * and elders are registered by their caregiver, because each of those has a consent
 * that has to name who gave it. Responders and administrators are staff, set up by staff.
 */
export const ADMIN_CREATED_ROLES = [Role.EMERGENCY_RESPONDER, Role.ADMINISTRATOR] as const;

/** Where a responder works: a named area and a circle round a point. */
export class CoverageDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  areaName: string;

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

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.5)
  @Max(100)
  radiusKm: number;
}

export class ListUsersDto {
  /** Part of a name, phone number or email address. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsIn(['active', 'deactivated'])
  status?: 'active' | 'deactivated';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  /** Up to a thousand, which is what an export asks for. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  pageSize?: number;
}

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name: string;

  @Matches(E164, { message: E164_MESSAGE })
  phone: string;

  @IsOptional()
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(160)
  email?: string;

  @IsIn(ADMIN_CREATED_ROLES, {
    message: 'role must be EMERGENCY_RESPONDER or ADMINISTRATOR',
  })
  role: (typeof ADMIN_CREATED_ROLES)[number];

  /**
   * A first password, given to the person by the administrator and never sent by SMS.
   * They change it from their account, or reset it with a code in the app.
   */
  @IsString()
  @MinLength(8, { message: 'the password must be at least 8 characters' })
  @MaxLength(200)
  password: string;

  /** Required for a responder, because dispatch matches responders by area. */
  @ValidateIf((dto: CreateUserDto) => dto.role === Role.EMERGENCY_RESPONDER)
  @ValidateNested()
  @Type(() => CoverageDto)
  coverage?: CoverageDto;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  /** Null removes it. */
  @IsOptional()
  @Transform(({ value }) => (value === '' ? null : value))
  @ValidateIf((dto: UpdateUserDto) => dto.email !== null)
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => CoverageDto)
  coverage?: CoverageDto;
}

/** Several accounts at once, from the table's selection. */
export class UserIdsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('all', { each: true })
  ids: string[];
}
