import { Module } from '@nestjs/common';
import { EscalationController } from './controllers/escalation.controller';
import { ElderServicesController } from './controllers/elder-services.controller';
import { JourneyController } from './controllers/journey.controller';
import { VoiceController } from './controllers/voice.controller';
import { EscalationListener } from './consumers/escalation.listener';
import { EscalationService } from './services/escalation.service';
import { EscalationSweepService } from './workers/escalation-sweep.service';
import { EscalationTimerService } from './services/escalation-timer.service';
import { JourneyService } from './services/journey.service';
import { StationDispatchService } from './services/station-dispatch.service';
import { VoiceService } from './services/voice.service';
import { NotificationsModule } from '../notification-service/notifications.module';
import { SeverityModule } from './severity.module';
import { CommunityModule } from '../community-service/community.module';

@Module({
  imports: [NotificationsModule, SeverityModule, CommunityModule],
  controllers: [EscalationController, JourneyController, VoiceController, ElderServicesController],
  providers: [
    EscalationService,
    EscalationTimerService,
    EscalationListener,
    EscalationSweepService,
    JourneyService,
    StationDispatchService,
    VoiceService,
  ],
  exports: [
    EscalationService,
    EscalationTimerService,
    JourneyService,
    StationDispatchService,
    VoiceService,
  ],
})
export class EscalationModule {}
