import { Module } from '@nestjs/common';
import { AlertsController } from './controllers/alerts.controller';
import { AlertsService } from './services/alerts.service';
import { EscalationModule } from './escalation.module';
import { NotificationsModule } from '../notification-service/notifications.module';
import { SeverityModule } from './severity.module';
import { CommunityModule } from '../community-service/community.module';

@Module({
  imports: [SeverityModule, EscalationModule, NotificationsModule, CommunityModule],
  controllers: [AlertsController],
  providers: [AlertsService],
  exports: [AlertsService],
})
export class AlertsModule {}
