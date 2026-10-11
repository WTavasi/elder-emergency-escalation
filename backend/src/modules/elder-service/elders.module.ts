import { Module } from '@nestjs/common';
import { AuthModule } from '../auth-service/auth.module';
import { NotificationsModule } from '../notification-service/notifications.module';
import { EldersController } from './controllers/elders.controller';
import { AddressSearchService } from './services/address-search.service';
import { ChainService } from './services/chain.service';
import { EldersService } from './services/elders.service';

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [EldersController],
  providers: [EldersService, ChainService, AddressSearchService],
})
export class EldersModule {}
