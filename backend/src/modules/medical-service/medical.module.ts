import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notification-service/notifications.module';
import { AlertMedicalController, ElderMedicalController } from './controllers/medical.controller';
import { MedicalProfileService } from './services/medical-profile.service';
import { MedicalSealService } from './services/medical-seal.service';

@Module({
  imports: [NotificationsModule],
  controllers: [ElderMedicalController, AlertMedicalController],
  providers: [MedicalProfileService, MedicalSealService],
})
export class MedicalModule {}
