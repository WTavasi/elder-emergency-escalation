import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notification-service/notifications.module';
import { DevToolsController } from './controllers/dev-tools.controller';
import { DevToolsService } from './services/dev-tools.service';

@Module({
  imports: [NotificationsModule],
  controllers: [DevToolsController],
  providers: [DevToolsService],
})
export class DevToolsModule {}
