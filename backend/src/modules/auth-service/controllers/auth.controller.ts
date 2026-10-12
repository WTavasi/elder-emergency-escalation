import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { AuthService, type AuthResult, type UserSummary } from '../services/auth.service';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../../shared/decorators/current-user.decorator';
import { Public } from '../../../shared/decorators/public.decorator';
import { Throttle } from '../../../shared/middleware/rate-limit.guard';
import { ChangePasswordDto } from '../validation/change-password.dto';
import { LoginDto } from '../validation/login.dto';
import { RefreshDto } from '../validation/refresh.dto';
import { RegisterDto } from '../validation/register.dto';
import { StartVerificationDto } from '../validation/start-verification.dto';
import { UpdateProfileDto } from '../validation/update-profile.dto';
import { PhoneVerificationService } from '../services/phone-verification.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly verification: PhoneVerificationService,
  ) {}

  /**
   * Sends a sign-up code to a phone. Always answers 202 with nothing in the body,
   * whether or not a code went out, so it cannot be used to learn who is registered.
   * Limited per address here and per number inside the service.
   */
  @Public()
  @Throttle(10, 3600)
  @HttpCode(HttpStatus.ACCEPTED)
  @Post('verify-phone')
  async verifyPhone(@Body() dto: StartVerificationDto): Promise<void> {
    await this.verification.start(dto.phone);
  }

  @Public()
  // Registration is the most expensive thing an anonymous caller can ask for, and a
  // person only does it once.
  @Throttle(5, 3600)
  @Post('register')
  register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.auth.register(dto);
  }

  @Public()
  // Brute force is the threat. Twenty attempts in five minutes is far below anything
  // useful for guessing a password, and comfortably above what a demonstration run or
  // a person mistyping theirs will reach: an emergency system that locks its operators
  // out during a rehearsal has traded a real failure for a theoretical one.
  @Throttle(20, 300)
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto): Promise<AuthResult> {
    return this.auth.login(dto);
  }

  @Public()
  // Higher still, because a legitimate client refreshes on a schedule and several tabs
  // or devices belonging to one person share an address.
  @Throttle(60, 300)
  @HttpCode(HttpStatus.OK)
  @Post('refresh')
  refresh(@Body() dto: RefreshDto): Promise<AuthResult> {
    return this.auth.refresh(dto.refreshToken);
  }

  @HttpCode(HttpStatus.NO_CONTENT)
  @Post('logout')
  logout(@CurrentUser() user: AuthenticatedUser): Promise<void> {
    return this.auth.logout(user.userId);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserSummary> {
    return this.auth.me(user.userId);
  }

  /** The signed-in person changing their own name or email. */
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserSummary> {
    return this.auth.updateProfile(user.userId, dto);
  }

  /**
   * Returns fresh tokens, because changing the password ends every other session. Limited
   * like sign-in, since it is a password guess against the current one.
   */
  @Throttle(10, 300)
  @HttpCode(HttpStatus.OK)
  @Post('change-password')
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
  ): Promise<AuthResult> {
    return this.auth.changePassword(user.userId, dto);
  }
}
