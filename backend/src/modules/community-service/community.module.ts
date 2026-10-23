import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notification-service/notifications.module';
import { VolunteerAdminController } from './controllers/volunteer-admin.controller';
import { VolunteerController } from './controllers/volunteer.controller';
import { VolunteerCallsService } from './services/volunteer-calls.service';
import { VolunteerMessenger } from './services/volunteer-messenger.service';
import { VolunteersService } from './services/volunteers.service';

/**
 * Community volunteers. Stands on its own: the emergency service calls into it to ask
 * and to stand volunteers down, and nothing here calls back, so there is no cycle.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [VolunteerController, VolunteerAdminController],
  providers: [VolunteersService, VolunteerCallsService, VolunteerMessenger],
  exports: [VolunteerCallsService],
})
export class CommunityModule {}
