import { BullModule } from '@nestjs/bullmq';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { parseRedisUrl } from '../common/redis-url';
import { NotificationsProcessor } from './notifications.processor';
import { NOTIFICATIONS_QUEUE } from './notifications.queue';
import { NotificationsService } from './notifications.service';
import { AfricasTalkingSmsProvider } from './providers/africas-talking-sms.provider';
import { FcmPushProvider } from './providers/fcm-push.provider';
import { createFcmMessaging } from './providers/firebase.factory';
import { LoggingPushProvider, LoggingSmsProvider } from './providers/logging-push.provider';
import { PUSH_PROVIDER, type PushProvider } from './providers/push.provider';
import { SMS_PROVIDER, type SmsProvider } from './providers/sms.provider';

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
      useFactory: (config: ConfigService): PushProvider => {
        const choice = config.get<string>('PUSH_PROVIDER', 'logging');
        assertUsableInProduction(config, 'PUSH_PROVIDER', choice);
        new Logger('Notifications').log(`Push provider: ${choice}`);

        return choice === 'fcm'
          ? new FcmPushProvider(
              createFcmMessaging(config),
              config.get<number>('PROVIDER_TIMEOUT_MS', 10_000),
            )
          : new LoggingPushProvider();
      },
    },
    {
      provide: SMS_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService): SmsProvider => {
        const choice = config.get<string>('SMS_PROVIDER', 'logging');
        assertUsableInProduction(config, 'SMS_PROVIDER', choice);

        if (choice === 'africastalking') {
          const username = config.getOrThrow<string>('AT_USERNAME');
          new Logger('Notifications').log(
            `SMS provider: africastalking (${username === 'sandbox' ? 'sandbox, delivers to the simulator only' : 'live'})`,
          );
          return new AfricasTalkingSmsProvider(config);
        }

        new Logger('Notifications').log('SMS provider: logging');
        return new LoggingSmsProvider();
      },
    },
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
