import { BullModule } from '@nestjs/bullmq';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { parseRedisUrl } from '../common/redis-url';
import { NotificationsProcessor } from './notifications.processor';
import { NOTIFICATIONS_QUEUE } from './notifications.queue';
import { NotificationsService } from './notifications.service';
import { LoggingPushProvider, LoggingSmsProvider } from './providers/logging-push.provider';
import { PUSH_PROVIDER } from './providers/push.provider';
import { SMS_PROVIDER } from './providers/sms.provider';

/**
 * Refuses to start a deployment that would only pretend to notify people.
 *
 * The logging providers are indistinguishable from working ones in the logs, which is
 * exactly what makes them dangerous outside development: an emergency system that
 * silently sends nothing is worse than one that fails loudly.
 */
function assertUsableInProduction(config: ConfigService, channel: string, provider: string): void {
  if (config.get<string>('NODE_ENV') === 'production' && provider === 'logging') {
    throw new Error(
      `${channel} is set to the logging provider, which sends nothing. Configure a real provider before running in production.`,
    );
  }
}

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: parseRedisUrl(config.getOrThrow<string>('REDIS_URL')),
      }),
    }),
    BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE }),
  ],
  providers: [
    NotificationsService,
    NotificationsProcessor,
    {
      provide: PUSH_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('PUSH_PROVIDER', 'logging');
        assertUsableInProduction(config, 'PUSH_PROVIDER', provider);
        new Logger('Notifications').log(`Push provider: ${provider}`);
        return new LoggingPushProvider();
      },
    },
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('SMS_PROVIDER', 'logging');
        assertUsableInProduction(config, 'SMS_PROVIDER', provider);
        new Logger('Notifications').log(`SMS provider: ${provider}`);
        return new LoggingSmsProvider();
      },
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
