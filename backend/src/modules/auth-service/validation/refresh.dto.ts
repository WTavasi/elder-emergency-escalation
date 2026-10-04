import { IsJWT } from 'class-validator';

export class RefreshDto {
  @IsJWT({ message: 'refreshToken must be a token issued by this API' })
  refreshToken: string;
}
