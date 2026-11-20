import { Module } from '@nestjs/common';
import { EcoManagerModule } from '../ecomanager/ecomanager.module.js';
import { AuthService } from '../auth/auth.service.js';
import { AdminService } from './admin.service.js';
import { BonusService } from './bonus.service.js';
import { BootstrapService } from './bootstrap.service.js';
import { CallsService } from './calls.service.js';
import { DeskController } from './desk.controller.js';
import { ReportingService } from './reporting.service.js';

@Module({
  imports: [EcoManagerModule],
  controllers: [DeskController],
  providers: [
    AuthService,
    BootstrapService,
    AdminService,
    ReportingService,
    CallsService,
    BonusService,
  ],
  exports: [AuthService, ReportingService],
})
export class DeskModule {}
