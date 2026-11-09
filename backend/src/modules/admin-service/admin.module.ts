import { Module } from '@nestjs/common';
import { AuthModule } from '../auth-service/auth.module';
import { NotificationsModule } from '../notification-service/notifications.module';
import { PolicyController } from './controllers/policy.controller';
import { UsersController } from './controllers/users.controller';
import { PolicyAdminService } from './services/policy-admin.service';
import { UserAdminService } from './services/user-admin.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [UsersController, PolicyController],
  providers: [UserAdminService, PolicyAdminService],
})
export class AdminModule {}
