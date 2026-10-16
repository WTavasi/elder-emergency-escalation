import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { NotificationsModule } from '../notification-service/notifications.module';
import { AuthController } from './controllers/auth.controller';
import { AccessRevocationService } from './services/access-revocation.service';
import { AuthService } from './services/auth.service';
import { GoogleIdentityService } from './services/google-identity.service';
import { PasswordService } from './services/password.service';
import { PhoneVerificationService } from './services/phone-verification.service';
import { TokenService } from './services/token.service';

@Module({
  // Registered without a secret on purpose: access and refresh tokens are signed with
  // different secrets, passed per call, so one leaked secret cannot mint the other.
  imports: [JwtModule.register({}), NotificationsModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    TokenService,
    PhoneVerificationService,
    GoogleIdentityService,
    AccessRevocationService,
  ],
  exports: [PasswordService, TokenService, PhoneVerificationService, AccessRevocationService],
})
export class AuthModule {}
