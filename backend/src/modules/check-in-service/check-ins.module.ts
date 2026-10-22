import { Module } from '@nestjs/common';
import { AlertsModule } from '../emergency-service/alerts.module';
import { NotificationsModule } from '../notification-service/notifications.module';
import { CheckInsController } from './controllers/check-ins.controller';
import { CheckInClockService } from './services/check-in-clock.service';
import { CheckInMessenger } from './services/check-in-messenger.service';
import { CheckInsService } from './services/check-ins.service';

@Module({
  imports: [AlertsModule, NotificationsModule],
  controllers: [CheckInsController],
  providers: [CheckInsService, CheckInClockService, CheckInMessenger],
  exports: [CheckInsService],
})
export class CheckInsModule {}
