import { sql } from 'drizzle-orm';
import { tcCallMeta } from '../db/schema.js';
import type { EcoOrder } from './client.js';

/** `delivered_at` written with an order state: a delivered order keeps its delivery date (EcoManager's, else the one
 *  already stored, else the date of the state), any other state clears it, so an upsell returned after delivery stops
 *  counting. `stateAt` is the `order_state_at` written with it. */
export function deliveredAtFor(order: EcoOrder, stateAt: Date) {
  if (order.stateGroup !== 'delivered') return null;
  const delivered = order.deliveredAt ? new Date(order.deliveredAt).toISOString() : null;
  return sql`COALESCE(${delivered}::timestamptz, ${tcCallMeta.delivered_at}, ${stateAt.toISOString()}::timestamptz)`;
}
