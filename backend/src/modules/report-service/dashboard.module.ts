import { Module } from '@nestjs/common';
import { DashboardController } from './controllers/dashboard.controller';
import { LegalController } from './controllers/legal.controller';
import { DashboardService } from './services/dashboard.service';

@Module({
  controllers: [DashboardController, LegalController],
  providers: [DashboardService],
})
export class DashboardModule {}
