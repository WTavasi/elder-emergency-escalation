import { Module } from '@nestjs/common';
import { AlertsController } from './alerts.controller';
import { AlertsService } from './alerts.service';
import { EscalationModule } from '../escalation/escalation.module';
import { SeverityModule } from '../severity/severity.module';

@Module({
  imports: [SeverityModule, EscalationModule],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
