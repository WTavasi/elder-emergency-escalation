import { IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  // Phone rather than email, because an elder may not have an email address and the
  // phone number is already the system's unique handle for a person.
  @IsString()
  @MinLength(8)
  @MaxLength(20)
  phone: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  password: string;
}
