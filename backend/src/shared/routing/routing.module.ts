import { Global, Module } from '@nestjs/common';
import { RoutingService } from './routing.service';

/**
 * Travel times by road. Global, like Redis, because two services that must not depend on
 * each other need it: the journeys of people on their way, and choosing volunteers.
 */
@Global()
@Module({
  providers: [RoutingService],
  exports: [RoutingService],
})
export class RoutingModule {}
