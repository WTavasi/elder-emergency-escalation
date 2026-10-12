import { IsEmail, IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/**
 * The parts of an account its owner may change. The phone number is not one of them:
 * it is the sign-in handle and the number every chain calls, so changing it needs the
 * same SMS proof as signing up, which is a separate piece of work.
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
