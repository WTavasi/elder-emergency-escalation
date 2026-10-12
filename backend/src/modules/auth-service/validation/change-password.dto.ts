import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MaxLength(200)
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'the new password must be at least 8 characters' })
  @MaxLength(200)
  newPassword: string;
}
