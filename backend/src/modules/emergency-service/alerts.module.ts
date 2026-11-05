import { Module } from '@nestjs/common';
import { AlertsController } from './controllers/alerts.controller';
import { SpeechController } from './controllers/speech.controller';
import { SpeechService } from './services/speech.service';
import { WhisperClient } from './services/whisper.client';
import { AlertsService } from './services/alerts.service';
import { AlertRankingService } from './services/alert-ranking.service';
import { EscalationModule } from './escalation.module';
import { NotificationsModule } from '../notification-service/notifications.module';
import { SeverityModule } from './severity.module';
import { CommunityModule } from '../community-service/community.module';

@Module({
  imports: [SeverityModule, EscalationModule, NotificationsModule, CommunityModule],
  controllers: [AlertsController, SpeechController],
  providers: [AlertsService, AlertRankingService, SpeechService, WhisperClient],
  exports: [AlertsService],
})
export class AlertsModule {}
