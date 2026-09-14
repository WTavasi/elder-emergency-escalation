import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { EventsGateway } from './events.gateway';
import { REALTIME_PUBLISHER } from './realtime.publisher';

/**
 * Global so the domain services can publish without importing a transport module.
 * They depend on the RealtimePublisher interface; this is the only place that knows
 * the transport is a socket.
 */
@Global()
@Module({
  imports: [AuthModule],
  providers: [EventsGateway, { provide: REALTIME_PUBLISHER, useExisting: EventsGateway }],
  exports: [REALTIME_PUBLISHER],
})
export class RealtimeModule {}
