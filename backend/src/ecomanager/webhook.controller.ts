import { Controller, Get, Inject, Logger, Post, Req, Res, UseFilters } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { eq } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { DeskExceptionFilter } from '../common/desk-exception.filter.js';
import { DeskError, sendJson } from '../common/http.js';
import { ENV, type Env } from '../config/env.js';
import { type Db, tcCallMeta } from '../db/schema.js';
import { OrdersService } from './orders.service.js';
import { verifySignature } from './signature.js';

/**
 * EcoManager order events (OrderStatusChanged): keep the state of every call on that order current. Signed with
 * ECOMANAGER_WEBHOOK_SECRET; answers fast (no EcoManager request here) because EcoManager waits only 5 s.
 */
@Controller('api/ecomanager')
@UseFilters(DeskExceptionFilter)
export class EcoManagerWebhookController {
  private readonly logger = new Logger('EcoManager');

  constructor(
    @InjectDrizzle() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly orders: OrdersService,
  ) {}

  /** EcoManager checks the address with a GET when the webhook is created or activated. */
  @Get('webhook')
  activate(@Res() res: Response): void {
    sendJson(res, { ok: true });
  }

  @Post('webhook')
  async receive(@Req() req: Request, @Res() res: Response): Promise<void> {
    const secret = this.env.ecomanager?.webhookSecret;
    const raw = typeof req.body === 'string' ? req.body : '';
    const signature = req.headers['x-ecomanager-signature'];
    if (!secret || !this.orders.client || !verifySignature(secret, raw, Array.isArray(signature) ? signature[0] : signature)) {
      throw new DeskError(401, 'Signature invalide.');
    }
    let order = null;
    try {
      order = this.orders.client.toEcoOrder(JSON.parse(raw));
    } catch {
      order = null;
    }
    // Only this store's orders: another store's order with the same number never touches our calls.
    if (order && order.reference === this.orders.client.prefix + order.id) {
      this.orders.client.remember(order);
      const now = new Date();
      const updated = await this.db
        .update(tcCallMeta)
        .set({
          order_check: 'verified',
          order_state_group: order.stateGroup,
          order_state_name: order.stateName,
          order_state_at: order.updatedAt ? new Date(order.updatedAt) : now,
          order_synced_at: now,
        })
        .where(eq(tcCallMeta.ecomanager_order_id, String(order.id)))
        .returning({ id: tcCallMeta.call_id });
      if (updated.length) this.logger.log(`Commande ${order.reference} : ${order.stateName ?? 'état inconnu'} (${updated.length} appel(s)).`);
    }
    sendJson(res, { ok: true });
  }
}
