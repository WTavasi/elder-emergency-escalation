import { Module } from '@nestjs/common';
import { AuthModule } from '../auth-service/auth.module';
import { NotificationsModule } from '../notification-service/notifications.module';
import { UsersController } from './controllers/users.controller';
import { UserAdminService } from './services/user-admin.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [UsersController],
  providers: [UserAdminService],
})
export class AdminModule {}
