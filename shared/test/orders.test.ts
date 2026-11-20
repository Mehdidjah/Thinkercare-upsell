import assert from 'node:assert/strict';
import { test } from 'vitest';
import * as c from '../src/index.js';

test('normalises case and spaces', () => {
  assert.deepEqual(c.parseOrderReference(' tou 1763816 '), { reference: 'TOU1763816', id: 1763816 });
  assert.equal(c.normalizeOrderReference(' tou 17 63816 '), 'TOU1763816');
});

test('digits only become a TOU reference', () => {
  assert.deepEqual(c.parseOrderReference('1763816'), { reference: 'TOU1763816', id: 1763816 });
});

test('rejects other stores and malformed input', () => {
  for (const raw of ['SHT1761073', 'TOU12', 'TOU1763816X', '', '12', 'DOS-0142', 'SHT-1761073', '1763816-2', 'TOU1763816-2', 'TOU-', '#', 'TOU--'])
    assert.equal(c.parseOrderReference(raw), null, raw);
  assert.deepEqual(c.parseOrderReference('SHT1761073', 'SHT'), { reference: 'SHT1761073', id: 1761073 });
});

test('groups every EcoManager state', () => {
  const g = (name: string | null, id?: number) => c.orderStateGroup({ name, id });
  for (const n of ['En confirmation', 'En préparation', 'En dispatch']) assert.equal(g(n), 'pending', n);
  assert.equal(g('En livraison'), 'shipping');
  for (const n of ['Livrée', 'Encaissée']) assert.equal(g(n), 'delivered', n);
  for (const n of ['En retour', 'Retournée', 'Annulée']) assert.equal(g(n), 'failed', n);
  assert.equal(g(null, 4), 'shipping');
  assert.equal(g(null, 7), 'delivered');
  assert.equal(g('Autre'), 'unknown');
  assert.equal(g('livree'), 'delivered');
  assert.equal(g(' EN LIVRAISON '), 'shipping');
  assert.equal(c.ORDER_STATE_GROUP_LABELS.failed, 'Non livrée');
});

test('final states', () => {
  for (const n of ['Livrée', 'Encaissée', 'Retournée', 'Annulée']) assert.equal(c.isFinalOrderState(n), true, n);
  for (const n of ['En retour', 'En livraison', 'En confirmation', null]) assert.equal(c.isFinalOrderState(n), false, String(n));
});

test('upsell delivery figures', () => {
  const call = (outcome: string, group: string | null, extra = 0, voided: string | null = null, total = 0) =>
    ({ outcome, order_state_group: group, extra, voided_at: voided, offered_total: total }) as unknown as c.ActivityCall;
  const calls = [
    call('duo', 'delivered', 1200, null, 3000), call('trio', 'delivered', 900, null, 2500), call('routine', 'shipping', 500, null, 2000),
    call('duo', 'pending', 400, null, 1800), call('duo', 'failed', 700, null, 2200), call('duo', null, 300, null, 1500),
    call('duo', 'delivered', 5000, '2026-11-20T10:00:00Z', 9000), call('refused', 'delivered', 0, null, 1000),
  ];
  const r = c.upsellDelivery(calls);
  assert.deepEqual([r.delivered, r.shipping, r.pending, r.failed, r.unknown, r.deliveredExtra], [2, 1, 1, 1, 1, 2100]);
  assert.equal(r.rate, 2 / 3);
  assert.equal(c.upsellDelivery([]).rate, null);
});

test('upsell delivery worth: supplement and order value by order state', () => {
  const call = (group: string | null, extra: number, total: number) =>
    ({ outcome: 'duo', order_state_group: group, extra, voided_at: null, offered_total: total }) as unknown as c.ActivityCall;
  const r = c.upsellDelivery([
    call('delivered', 1200, 3000), call('delivered', 900, 2500), call('shipping', 500, 2000), call('pending', 400, 1800),
    call('failed', 700, 2200), call(null, 300, 1500), call('autre', 100, 900),
  ]);
  assert.deepEqual(r.extra, { delivered: 2100, shipping: 500, pending: 400, failed: 700, unknown: 400 });
  assert.deepEqual(r.total, { delivered: 5500, shipping: 2000, pending: 1800, failed: 2200, unknown: 2400 });
  assert.equal(r.unknown, 2);
  assert.equal(r.valueRate, 2100 / 2800);
  assert.equal(c.upsellDelivery([call('shipping', 500, 2000)]).valueRate, null);
});

test('order check labels', () => {
  assert.equal(c.ORDER_CHECK_LABELS.unverified, 'À vérifier');
  assert.equal(c.ORDER_CHECK_LABELS['not-found'], 'Introuvable dans EcoManager');
  assert.match(c.ORDER_REFERENCE_HINT, /TOU1763816/);
});

test('leading zeros are the same order', () => {
  assert.deepEqual(c.parseOrderReference('TOU01763816'), { reference: 'TOU1763816', id: 1763816 });
  assert.deepEqual(c.parseOrderReference('001763816'), { reference: 'TOU1763816', id: 1763816 });
  assert.equal(c.parseOrderReference('TOU0000'), null);
});

test('older forms typed before the check: a separator after TOU, a leading #, a trailing dot', () => {
  for (const raw of ['TOU-1763816', 'tou_1763816', 'TOU.1763816', 'TOU#1763816', '#1763816', '#TOU1763816', 'TOU1763816.', 'TOU - 1763816'])
    assert.deepEqual(c.parseOrderReference(raw), { reference: 'TOU1763816', id: 1763816 }, raw);
});
