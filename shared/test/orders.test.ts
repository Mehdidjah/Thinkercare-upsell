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
  for (const raw of ['SHT1761073', 'TOU12', 'TOU1763816X', '', '12', 'TOU-1763816'])
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
  const call = (outcome: string, group: string | null, extra = 0, voided: string | null = null) =>
    ({ outcome, order_state_group: group, extra, voided_at: voided }) as unknown as c.ActivityCall;
  const calls = [
    call('duo', 'delivered', 1200), call('trio', 'delivered', 900), call('routine', 'shipping', 500),
    call('duo', 'pending', 400), call('duo', 'failed', 700), call('duo', null, 300),
    call('duo', 'delivered', 5000, '2026-11-20T10:00:00Z'), call('refused', 'delivered', 0),
  ];
  const r = c.upsellDelivery(calls);
  assert.deepEqual({ ...r, rate: undefined }, { delivered: 2, shipping: 1, pending: 1, failed: 1, unknown: 1, rate: undefined, deliveredExtra: 2100 });
  assert.equal(r.rate, 2 / 3);
  assert.equal(c.upsellDelivery([]).rate, null);
});

test('order check labels', () => {
  assert.equal(c.ORDER_CHECK_LABELS.unverified, 'À vérifier');
  assert.equal(c.ORDER_CHECK_LABELS['not-found'], 'Introuvable dans EcoManager');
  assert.match(c.ORDER_REFERENCE_HINT, /TOU1763816/);
});
