import { Module } from '@nestjs/common';
import { EscalationController } from './controllers/escalation.controller';
import { JourneyController } from './controllers/journey.controller';
import { SmsRepliesController } from './controllers/sms-replies.controller';
import { EscalationListener } from './consumers/escalation.listener';
import { EscalationService } from './services/escalation.service';
import { EscalationSweepService } from './workers/escalation-sweep.service';
import { EscalationTimerService } from './services/escalation-timer.service';
import { JourneyService } from './services/journey.service';
import { RoutingService } from './services/routing.service';
import { SmsRepliesService } from './services/sms-replies.service';
import { NotificationsModule } from '../notification-service/notifications.module';
import { SeverityModule } from './severity.module';

@Module({
  imports: [NotificationsModule, SeverityModule],
  controllers: [EscalationController, JourneyController, SmsRepliesController],
  providers: [
    EscalationService,
    EscalationTimerService,
    EscalationListener,
    EscalationSweepService,
    JourneyService,
    RoutingService,
    SmsRepliesService,
  ],
  exports: [EscalationService, EscalationTimerService, JourneyService],
})
export class EscalationModule {}
