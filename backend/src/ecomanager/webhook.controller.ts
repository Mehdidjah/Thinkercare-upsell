import { Controller, Get, Inject, Logger, Post, Req, Res, UseFilters } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, isNull, lte, or, sql } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { DeskExceptionFilter } from '../common/desk-exception.filter.js';
import { DeskError, sendJson } from '../common/http.js';
import { ENV, type Env } from '../config/env.js';
import { type Db, tcCallMeta } from '../db/schema.js';
import { OrdersService } from './orders.service.js';
import { verifySignature } from './signature.js';

/**
 * EcoManager order events (OrderStatusChanged): keep the state of every call on that order current. Signed with
 * ECOMANAGER_WEBHOOK_SECRET; answers fast (no EcoManager request here) because EcoManager waits only 5 s. One address
 * and one secret for every store: the order's reference names its store (TOU…, BEL…).
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
    // Only a configured store's orders, and only the calls of that store's brand: another store's order with the same
    // number never touches them.
    const brand = order ? this.orders.storeFor(order) : null;
    if (order && brand) {
      this.orders.clientFor(brand)?.remember(order);
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
        .where(
          and(
            eq(tcCallMeta.ecomanager_order_id, String(order.id)),
            sql`${tcCallMeta.call_id} IN (SELECT id FROM tc_calls WHERE brand = ${brand})`,
            // A late retry of an older event never overwrites a newer state.
            order.updatedAt ? or(isNull(tcCallMeta.order_state_at), lte(tcCallMeta.order_state_at, new Date(order.updatedAt))) : undefined,
          ),
        )
        .returning({ id: tcCallMeta.call_id });
      if (updated.length) this.logger.log(`Commande ${order.reference} : ${order.stateName ?? 'état inconnu'} (${updated.length} appel(s)).`);
    }
    sendJson(res, { ok: true });
  }
}
