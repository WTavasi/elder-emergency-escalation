import { Module } from '@nestjs/common';
import { EscalationController } from './controllers/escalation.controller';
import { EscalationListener } from './consumers/escalation.listener';
import { EscalationService } from './services/escalation.service';
import { EscalationSweepService } from './workers/escalation-sweep.service';
import { EscalationTimerService } from './services/escalation-timer.service';
import { NotificationsModule } from '../notification-service/notifications.module';

@Module({
  imports: [NotificationsModule],
  controllers: [EscalationController],
  providers: [
    EscalationService,
    EscalationTimerService,
    EscalationListener,
    EscalationSweepService,
  ],
  exports: [EscalationService, EscalationTimerService],
})
export class EscalationModule {}
