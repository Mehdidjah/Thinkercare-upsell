import { randomUUID } from 'node:crypto';
import type { ItemSnapshot } from '@touche/domain';
import type { Db } from '../../src/db/schema.js';
import { tcCallMeta, tcCalls } from '../../src/db/schema.js';

export async function insertCall(
  db: Db,
  c: {
    id?: string;
    user_id: string;
    operator?: string;
    created_at: Date;
    outcome?: string;
    base_id?: string;
    base_total?: number;
    offered_total?: number;
    extra?: number;
    catalogue_total?: number;
    tier?: string;
    order_ref?: string | null;
    /** Item snapshots as saved by the desk (pack components included); defaults to []. */
    products?: ItemSnapshot[];
  },
): Promise<string> {
  const id = c.id ?? randomUUID();
  await db.insert(tcCalls).values({
    id,
    user_id: c.user_id,
    operator: c.operator ?? 'Test',
    created_at: c.created_at,
    outcome: c.outcome ?? 'duo',
    base_id: c.base_id ?? 'antiacne',
    products: c.products ?? [],
    catalogue_total: c.catalogue_total ?? 3300,
    base_total: c.base_total ?? 1800,
    offered_total: c.offered_total ?? 3000,
    delivery: null,
    tier: c.tier ?? 'duo',
    extra: c.extra ?? 1200,
  });
  if (c.order_ref !== null) {
    const orderRef = c.order_ref ?? '';
    await db.insert(tcCallMeta).values({
      call_id: id,
      data: { version: 3, orderRef, customerStage: 'new', eligible: true },
      order_ref: orderRef,
      customer_stage: 'new',
      version: 3,
    });
  }
  return id;
}
