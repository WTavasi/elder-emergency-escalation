import { Module } from '@nestjs/common';
import { CheckInsModule } from '../check-in-service/check-ins.module';
import { NotificationsModule } from '../notification-service/notifications.module';
import { SmsRepliesController } from './controllers/sms-replies.controller';
import { EscalationModule } from './escalation.module';
import { SmsRepliesService } from './services/sms-replies.service';

/**
 * Replies to texts. Its own module because a reply can answer two different things: an
 * alert (the escalation module) or a daily check-in (the check-in module, which itself
 * depends on alerts). Inside either, it would make the two depend on each other.
 */
@Module({
  imports: [EscalationModule, NotificationsModule, CheckInsModule],
  controllers: [SmsRepliesController],
  providers: [SmsRepliesService],
})
export class SmsRepliesModule {}
