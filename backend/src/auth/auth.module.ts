import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';

@Module({
  // Registered without a secret on purpose: access and refresh tokens are signed with
  // different secrets, passed per call, so one leaked secret cannot mint the other.
  imports: [JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, PasswordService, TokenService],
  exports: [PasswordService, TokenService],
})
export class AuthModule {}
