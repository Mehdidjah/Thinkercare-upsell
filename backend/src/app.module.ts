import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './db/database.module.js';
import { DeskModule } from './desk/desk.module.js';
import { HealthController } from './health/health.controller.js';

@Module({
  imports: [ConfigModule, DatabaseModule, DeskModule],
  controllers: [HealthController],
})
export class AppModule {}
