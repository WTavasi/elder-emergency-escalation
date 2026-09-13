import { Module } from '@nestjs/common';
import { EscalationController } from './escalation.controller';
import { EscalationListener } from './escalation.listener';
import { EscalationService } from './escalation.service';
import { EscalationTimerService } from './escalation-timer.service';

@Module({
  controllers: [EscalationController],
  providers: [EscalationService, EscalationTimerService, EscalationListener],
  exports: [EscalationService, EscalationTimerService],
})
export class EscalationModule {}
