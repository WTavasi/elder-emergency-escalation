import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AlertsModule } from './alerts/alerts.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { RolesGuard } from './auth/guards/roles.guard';
import { EscalationModule } from './escalation/escalation.module';
import { HealthModule } from './health/health.module';
import { NotificationsModule } from './notifications/notifications.module';
import { PrismaModule } from './prisma/prisma.module';
import { RealtimeModule } from './realtime/realtime.module';
import { RedisModule } from './redis/redis.module';
import { RetentionModule } from './retention/retention.module';
import { SeverityModule } from './severity/severity.module';
import { RateLimitGuard } from './common/guards/rate-limit.guard';
import { validateEnv } from './config/env.schema';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
    }),
    PrismaModule,
    RedisModule,
    RealtimeModule,
    AuthModule,
    SeverityModule,
    NotificationsModule,
    EscalationModule,
    AlertsModule,
    DashboardModule,
    HealthModule,
    RetentionModule,
  ],
  providers: [
    // Authentication first, then role checks, so a role guard always has a user to
    // inspect. Both are global: a new route is protected unless it declares @Public().
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    // Last, so the request has been authenticated and a signed-in caller is counted by
    // user id rather than by address. A route with no @Throttle passes straight
    // through, so this is opt-in per route rather than a blanket limit.
    { provide: APP_GUARD, useClass: RateLimitGuard },
  ],
})
export class AppModule {}
