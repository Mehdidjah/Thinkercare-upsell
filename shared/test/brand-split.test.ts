import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as c from '../src/index.js';

// Pilotage « Par marque »: the figures of each brand side by side, and their total.
let n = 0;
const call = (over: Partial<c.ActivityCall> & { ref?: string } = {}): c.ActivityCall => {
  const { ref = '', ...rest } = over;
  const id = 'c' + ++n;
  return {
    id, user_id: 'u1', operator: 'Lina', created_at: '2026-11-13T10:00:00.000Z', outcome: 'duo', base_id: 'antiacne', products: [],
    catalogue_total: 3300, base_total: 1800, offered_total: 3000, extra: 1200, delivery: null, tier: 'duo', pilot: 1, refusal: '',
    meta: { version: 3, eligible: true, orderRef: ref },
    proposals: [{ id: 'p' + id, call_id: id, user_id: 'u1', created_at: '2026-11-13T10:00:00.000Z', base: { id: 'antiacne', name: 'Anti-Acné', price: 1800 }, products: [], catalogueTotal: 3300, offerTotal: 3000, extra: 1200, tier: 'duo', delivery: null, version: 3 }],
    voided_at: null, ...rest,
  };
};
const touche = [
  call({ ref: 'TOU1', order_state_group: 'delivered', extra: 1200, brand: 'touche' }),
  call({ ref: 'TOU2', outcome: 'trio', order_state_group: 'failed', extra: 900, brand: 'touche' }),
  call({ ref: 'TOU3', outcome: 'refused', extra: 0, brand: 'touche' }),
  // A second call on dossier TOU1: one more accepted upsell, the same order.
  call({ ref: 'TOU1', order_state_group: 'shipping', extra: 500, brand: 'touche' }),
  // Recorded before BEL.NCO: no brand is Touché. Not answered: closed, never eligible.
  call({ outcome: 'noanswer', extra: 0, proposals: [] }),
];
const belnco = [
  call({ ref: 'BEL1', order_state_group: 'delivered', extra: 1500, brand: 'belnco' }),
  call({ ref: 'BEL2', outcome: 'refused', extra: 0, brand: 'belnco' }),
];
const voided = call({ ref: 'TOU9', order_state_group: 'delivered', extra: 5000, brand: 'touche', voided_at: '2026-11-14T10:00:00.000Z' });
const ADDITIVE = ['closed', 'orders', 'won', 'extra', 'delivered', 'deliveredExtra', 'failed', 'failedExtra'] as const;

test('« Par marque »: each brand’s closed calls, orders, accepted upsells, supplement and deliveries, and the total; voided calls count nowhere', () => {
  const r = c.byBrand([...touche, voided, ...belnco]);
  assert.deepEqual(r.touche, { closed: 5, orders: 3, won: 3, extra: 2600, acceptRate: 75, delivered: 1, deliveredExtra: 1200, failed: 1, failedExtra: 900, deliveryRate: 0.5 });
  assert.deepEqual(r.belnco, { closed: 2, orders: 2, won: 1, extra: 1500, acceptRate: 50, delivered: 1, deliveredExtra: 1500, failed: 0, failedExtra: 0, deliveryRate: 1 });
  assert.deepEqual(r.total, { closed: 7, orders: 5, won: 4, extra: 4100, acceptRate: 4 / 6 * 100, delivered: 2, deliveredExtra: 2700, failed: 1, failedExtra: 900, deliveryRate: 2 / 3 });
});

test('« Par marque »: the brands sum to the total, and the total reads like the Pilotage KPIs and the delivery card', () => {
  const calls = [...touche, voided, ...belnco];
  const r = c.byBrand(calls);
  for (const key of ADDITIVE) assert.equal(r.touche[key] + r.belnco[key], r.total[key], key);
  const kpi = c.summary(c.countedCalls(calls)), delivery = c.upsellDelivery(calls);
  assert.deepEqual(
    [r.total.closed, r.total.orders, r.total.won, r.total.extra, r.total.acceptRate, r.total.delivered, r.total.deliveredExtra, r.total.failed, r.total.failedExtra, r.total.deliveryRate],
    [kpi.closed, kpi.refs, kpi.won, kpi.extra, kpi.acceptRate, delivery.delivered, delivery.extra.delivered, delivery.failed, delivery.extra.failed, delivery.rate],
  );
});

test('« Par marque »: a brand without any call in the period reads 0, its rates unmeasured', () => {
  const r = c.byBrand(touche);
  assert.deepEqual(r.belnco, { closed: 0, orders: 0, won: 0, extra: 0, acceptRate: null, delivered: 0, deliveredExtra: 0, failed: 0, failedExtra: 0, deliveryRate: null });
  assert.deepEqual(r.total, r.touche);
  assert.deepEqual(c.byBrand([]).total.closed, 0);
});

test('« Par marque »: a dossier is one order of its own store, so the total of orders is the sum of the brands', () => {
  // The same free-text reference typed under both brands (never a TOU or BEL reference: the save refuses those).
  const r = c.byBrand([call({ ref: 'DOS-1', brand: 'touche' }), call({ ref: 'DOS-1', brand: 'belnco' }), call({ ref: 'DOS-1', brand: 'belnco' })]);
  assert.deepEqual([r.touche.orders, r.belnco.orders, r.total.orders], [1, 1, 2]);
});
