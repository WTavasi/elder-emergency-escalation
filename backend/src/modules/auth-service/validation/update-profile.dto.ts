import { IsEmail, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/**
 * The parts of an account its owner may change freely. The phone number is not one of
 * them: it is the sign-in handle and the number every chain calls, so it changes through
 * POST /auth/me/phone/code and POST /auth/me/phone, with a code to the new number.
 */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  name?: string;

  /** An address to set, or null to remove the one on the account. */
  @IsOptional()
  @ValidateIf((dto: UpdateProfileDto) => dto.email !== null)
  @IsEmail({}, { message: 'email must be a valid address' })
  @MaxLength(160)
  email?: string | null;
}
