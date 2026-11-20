import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service.js';

/** EcoManager order checks, the order-state webhook and the catch-up of recorded calls. */
@Module({
  providers: [OrdersService],
  exports: [OrdersService],
})
export class EcoManagerModule {}
