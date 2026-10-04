import { Module } from '@nestjs/common';
import { EldersController } from './elders.controller';
import { EldersService } from './elders.service';

@Module({
  controllers: [EldersController],
  providers: [EldersService],
})
export class EldersModule {}
