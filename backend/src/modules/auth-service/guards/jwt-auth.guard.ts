import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../../shared/decorators/public.decorator';
import { AccessRevocationService } from '../services/access-revocation.service';
import { DEACTIVATED } from '../services/auth.service';
import { TokenService } from '../services/token.service';

interface RequestWithAuth {
  headers: Record<string, string | string[] | undefined>;
  user?: { userId: string; role: string };
}

/**
 * Applied globally, so a new route is protected unless it says otherwise. Forgetting
 * to add a guard is a likely mistake; forgetting to add @Public() is a visible one.
 *
 * The access token is trusted without a database lookup, which keeps the alert path
 * free of an extra query. A deactivated account is the exception, caught by one Redis
 * lookup instead (see AccessRevocationService), so it stops working the moment it is
 * deactivated rather than when its token expires.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
    private readonly revocations: AccessRevocationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const header = request.headers.authorization;
    const raw = Array.isArray(header) ? header[0] : header;

    if (!raw?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const payload = await this.tokens.verifyAccess(raw.slice('Bearer '.length).trim());
    if (await this.revocations.isRevoked(payload.sub)) {
      throw new UnauthorizedException(DEACTIVATED);
    }
    request.user = { userId: payload.sub, role: payload.role };
    return true;
  }
}
