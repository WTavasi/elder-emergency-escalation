import { Module } from '@nestjs/common';
import { EscalationController } from './escalation.controller';
import { EscalationListener } from './escalation.listener';
import { EscalationService } from './escalation.service';
import { EscalationSweepService } from './escalation-sweep.service';
import { EscalationTimerService } from './escalation-timer.service';
import { NotificationsModule } from '../notifications/notifications.module';

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
