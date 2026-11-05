import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'Use at least 8 characters for the new password.' })
  @MaxLength(200)
  newPassword: string;
}
