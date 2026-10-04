import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { AuthService, type AuthResult, type UserSummary } from './auth.service';
import { CurrentUser, type AuthenticatedUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { Throttle } from '../common/guards/rate-limit.guard';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

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
}
