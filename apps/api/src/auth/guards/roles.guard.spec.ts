import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';
import type { ExecutionContext } from '@nestjs/common';

const contextFor = (user?: { role: Role }): ExecutionContext =>
  ({
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const guardRequiring = (roles: Role[] | undefined): RolesGuard => {
  const reflector = new Reflector();
  jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
  return new RolesGuard(reflector);
};

describe('RolesGuard', () => {
  it('allows any authenticated user when no roles are declared', () => {
    expect(guardRequiring(undefined).canActivate(contextFor({ role: Role.ELDER }))).toBe(true);
    expect(guardRequiring([]).canActivate(contextFor({ role: Role.ELDER }))).toBe(true);
  });

  it('allows a user holding a required role', () => {
    const guard = guardRequiring([Role.ADMINISTRATOR, Role.CAREGIVER]);
    expect(guard.canActivate(contextFor({ role: Role.CAREGIVER }))).toBe(true);
  });

  it('refuses a user without a required role', () => {
    const guard = guardRequiring([Role.ADMINISTRATOR]);
    expect(() => guard.canActivate(contextFor({ role: Role.FAMILY_MEMBER }))).toThrow(
      ForbiddenException,
    );
  });

  it('refuses when no user is attached at all', () => {
    const guard = guardRequiring([Role.ADMINISTRATOR]);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });
});
