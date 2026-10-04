import { Module } from '@nestjs/common';
import { EldersController } from './controllers/elders.controller';
import { EldersService } from './services/elders.service';

@Module({
  controllers: [EldersController],
  providers: [EldersService],
})
export class EldersModule {}
