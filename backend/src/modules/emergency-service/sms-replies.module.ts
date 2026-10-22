import { Module } from '@nestjs/common';
import { CheckInsModule } from '../check-in-service/check-ins.module';
import { CommunityModule } from '../community-service/community.module';
import { NotificationsModule } from '../notification-service/notifications.module';
import { SmsRepliesController } from './controllers/sms-replies.controller';
import { EscalationModule } from './escalation.module';
import { SmsRepliesService } from './services/sms-replies.service';

/**
 * Replies to texts. Its own module because a reply can answer three different things: an
 * alert (the escalation module), a daily check-in (the check-in module, which itself
 * depends on alerts) or a call to a community volunteer. Inside any one of them, it would
 * make them depend on each other.
 */
@Module({
  imports: [EscalationModule, NotificationsModule, CheckInsModule, CommunityModule],
  controllers: [SmsRepliesController],
  providers: [SmsRepliesService],
})
export class SmsRepliesModule {}
