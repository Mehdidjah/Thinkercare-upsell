import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service.js';
import { OrderSyncService } from './sync.service.js';
import { EcoManagerWebhookController } from './webhook.controller.js';

/** EcoManager order checks, the order-state webhook and the catch-up of recorded calls. */
@Module({
  controllers: [EcoManagerWebhookController],
  providers: [OrdersService, OrderSyncService],
  exports: [OrdersService, OrderSyncService],
})
export class EcoManagerModule {}
