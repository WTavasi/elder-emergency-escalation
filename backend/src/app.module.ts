import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { AlertsModule } from './modules/emergency-service/alerts.module';
import { DashboardModule } from './modules/report-service/dashboard.module';
import { EldersModule } from './modules/elder-service/elders.module';
import { AuthModule } from './modules/auth-service/auth.module';
import { JwtAuthGuard } from './modules/auth-service/guards/jwt-auth.guard';
import { RolesGuard } from './modules/auth-service/guards/roles.guard';
import { EscalationModule } from './modules/emergency-service/escalation.module';
import { HealthModule } from './modules/health-service/health.module';
import { NotificationsModule } from './modules/notification-service/notifications.module';
import { PrismaModule } from './db/prisma.module';
import { RealtimeModule } from './modules/realtime-service/realtime.module';
import { RedisModule } from './shared/redis/redis.module';
import { RetentionModule } from './modules/retention-service/retention.module';
import { SeverityModule } from './modules/emergency-service/severity.module';
import { RateLimitGuard } from './shared/middleware/rate-limit.guard';
import { validateEnv } from './shared/config/env.schema';

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
    EldersModule,
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
