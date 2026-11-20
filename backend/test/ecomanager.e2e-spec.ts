import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { eq, inArray } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { localDay } from '@touche/domain';
import type { Env } from '../src/config/env.js';
import { tcCallMeta, tcCalls } from '../src/db/schema.js';
import type { DeskUser } from '../src/desk/desk.types.js';
import { OrderSyncService } from '../src/ecomanager/sync.service.js';
import { insertCall } from './support/calls.js';
import { type TestContext, createTestApp } from './support/context.js';
import { resetDatabase } from './support/database.js';
import { deskGet, deskPost } from './support/desk.js';
import { type FakeEcoManager, ecoOrder, startFakeEcoManager } from './support/ecomanager-fake.js';
import { createUser, loginCookie } from './support/users.js';

const PASSWORD = 'mot-de-passe-solide-2026';
const SECRET = 'whsec-test-0123456789';

/** EcoManager settings for a test app pointing at the fake server. Each test uses its own order numbers: the
 *  app's client caches answers for the whole file. */
function ecomanager(baseUrl: string, extra: Partial<NonNullable<Env['ecomanager']>> = {}): Partial<Env> {
  return { ecomanager: { token: 'test-token', baseUrl, prefix: 'TOU', timeoutMs: 300, syncIntervalMs: 0, ...extra } };
}

let fake: FakeEcoManager;
let on: TestContext;
let off: TestContext;
let admin: string;
let lina: string;
let linaUser: DeskUser;

beforeAll(async () => {
  fake = await startFakeEcoManager();
  on = await createTestApp(ecomanager(fake.url, { webhookSecret: SECRET }));
  off = await createTestApp();
});
afterAll(async () => {
  await on.close();
  await off.close();
  await fake.close();
});
beforeEach(async () => {
  fake.reset();
  await resetDatabase(on.db);
  await createUser(on.db, { username: 'direction', password: PASSWORD, role: 'admin', label: 'Direction' });
  linaUser = await createUser(on.db, { username: 'conseil.lina', password: PASSWORD, role: 'advisor', label: 'Lina B.' });
  admin = await loginCookie(on, 'direction', PASSWORD);
  lina = await loginCookie(on, 'conseil.lina', PASSWORD);
});

const lookup = (ref: string, cookie = lina, ctx = on) => deskGet(ctx, '?action=order&ref=' + encodeURIComponent(ref), cookie);

describe('order-check feature', () => {
  it('lists order-check only when a token is configured', async () => {
    expect((await deskGet(on, '?compact=1', admin)).body.features).toContain('order-check');
    const without = await deskGet(off, '?compact=1', await loginCookie(off, 'direction', PASSWORD));
    expect(without.body.features).not.toContain('order-check');
  });
});

describe('order lookup (GET action=order)', () => {
  it('is off without a token', async () => {
    const res = await lookup('TOU1000001', await loginCookie(off, 'direction', PASSWORD), off);
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Vérification de commande non configurée.', code: 'order-check-off' });
  });

  it('requires a session', async () => {
    expect((await deskGet(on, '?action=order&ref=TOU1000002')).status).toBe(401);
  });

  it('rejects a malformed reference without calling EcoManager', async () => {
    const res = await lookup('DOS-0142');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Une référence commence par TOU suivie du numéro de commande, par exemple TOU1763816.', code: 'order-ref-format' });
    expect(fake.calls).toEqual([]);
  });

  it('finds a TOU order and returns no customer data', async () => {
    fake.orders.set(1000003, ecoOrder(1000003, 'En livraison'));
    const res = await lookup('tou 1000003');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      check: 'verified',
      order: {
        id: 1000003, reference: 'TOU1000003', stateGroup: 'shipping', stateLabel: 'En cours de livraison', stateName: 'En livraison',
        confirmationStateName: null, updatedAt: '2026-11-20T10:00:00+01:00',
      },
    });
    expect(JSON.stringify(res.body)).not.toMatch(/Amel|0666|example\.dz|Appartement/);
    expect(fake.calls).toEqual(['/api/shop/v2/orders/1000003']);
    expect(fake.lastAuthorization()).toBe('Bearer test-token');
  });

  it('accepts the order number alone', async () => {
    fake.orders.set(1000004, ecoOrder(1000004));
    expect((await lookup('1000004')).body.order.reference).toBe('TOU1000004');
  });

  it('unknown order is refused', async () => {
    const res = await lookup('TOU1000005');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Commande TOU1000005 introuvable dans EcoManager. Vérifiez la référence.', code: 'order-not-found' });
  });

  it('another store’s order with the same number is refused', async () => {
    fake.orders.set(1000006, ecoOrder(1000006, 'En confirmation', { reference: 'SHT1000006' }));
    expect((await lookup('TOU1000006')).body.code).toBe('order-not-found');
  });

  it('unreachable EcoManager answers unavailable', async () => {
    fake.setStatus(503);
    const res = await lookup('TOU1000007');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      order: null, check: 'unavailable',
      message: 'EcoManager ne répond pas : vous pouvez continuer, la commande sera marquée « à vérifier ».',
    });
  });

  it('limits each adviser to 30 lookups a minute', async () => {
    for (let i = 0; i < 30; i++) expect((await lookup('DOS-' + i)).status).toBe(400);
    const res = await lookup('TOU1000008');
    expect(res.status).toBe(429);
    expect(res.body.error).toBe('Trop de vérifications de commande. Patientez une minute.');
    expect((await lookup('DOS-x', admin)).status).toBe(400);
  });
});

/** Today's desk saving « Conserver la commande initiale » on `orderRef` (pass oldTab for a tab without expectedUserId). */
function saveInitial(orderRef: string, { oldTab = false } = {}) {
  const id = randomUUID();
  const body = {
    action: 'save-call', id, baseId: 'antiacne', productIds: ['antiacne'], outcome: 'initial', tier: 'catalogue', delivery: null,
    agreedTotal: 1800, consent: false, checked: false, refusal: '',
    meta: { version: 3, source: 'manual', customerStage: 'new', orderRef, startedAt: new Date(Date.now() - 60_000).toISOString(), eligible: true, objections: [] },
    ...(oldTab ? {} : { expectedUserId: linaUser.id }),
  };
  return { id, res: deskPost(on, body, { cookie: lina, ...(oldTab ? { pricing: null } : {}) }) };
}
const metaOf = async (id: string) => (await on.db.select().from(tcCallMeta).where(eq(tcCallMeta.call_id, id)))[0];

describe('order check at save (save-call)', () => {
  it('a call on an unknown order is refused', async () => {
    const { id, res } = saveInitial('TOU2000001');
    const r = await res;
    expect(r.status).toBe(404);
    expect(r.body).toEqual({ error: 'Commande TOU2000001 introuvable dans EcoManager. Vérifiez la référence.', code: 'order-not-found' });
    expect(await on.db.select().from(tcCalls).where(eq(tcCalls.id, id))).toEqual([]);
  });

  it('a verified call stores the order state under its full reference', async () => {
    fake.orders.set(2000002, ecoOrder(2000002, 'Livrée'));
    const { id, res } = saveInitial('2000002');
    expect((await res).status).toBe(200);
    expect(await metaOf(id)).toMatchObject({
      order_ref: 'TOU2000002', order_check: 'verified', ecomanager_order_id: '2000002', order_state_group: 'delivered',
      order_state_name: 'Livrée', order_state_at: new Date('2026-11-20T09:00:00.000Z'),
    });
  });

  it('a timeout saves the call as unverified', async () => {
    fake.setDelay(1_000);
    const { id, res } = saveInitial('TOU2000003');
    expect((await res).status).toBe(200);
    expect(await metaOf(id)).toMatchObject({ order_ref: 'TOU2000003', order_check: 'unverified', ecomanager_order_id: '2000003', order_state_group: null });
  });

  it('an older tab saves without a check', async () => {
    const { id, res } = saveInitial('TOU2000004', { oldTab: true });
    expect((await res).status).toBe(200);
    expect(await metaOf(id)).toMatchObject({ order_ref: 'TOU2000004', order_check: '', ecomanager_order_id: null });
    expect(fake.calls).toEqual([]);
  });

  it('a malformed reference from today’s desk is refused', async () => {
    const r = await saveInitial('DOS-0142').res;
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('order-ref-format');
  });

  it('analytics returns the order state', async () => {
    fake.orders.set(2000005, ecoOrder(2000005, 'En retour'));
    const { id, res } = saveInitial('TOU2000005');
    expect((await res).status).toBe(200);
    const day = localDay(new Date());
    const report = await deskGet(on, `?action=analytics&from=${day}&to=${day}`, admin);
    expect(report.body.calls.find((c: { id: string }) => c.id === id)).toMatchObject({
      order_check: 'verified', order_state_group: 'failed', order_state_name: 'En retour', ecomanager_order_id: '2000005',
    });
  });
});

/** EcoManager posting an order event to the webhook, signed with `secret` (or unsigned). */
function hook(order: Record<string, unknown>, { secret = SECRET as string | null, ctx = on } = {}) {
  const raw = JSON.stringify(order);
  const req = request(ctx.server).post('/api/ecomanager/webhook').set('Content-Type', 'application/json').set('X-Ecomanager-Event', 'OrderStatusChanged');
  if (secret) req.set('X-Ecomanager-Signature', createHmac('sha256', secret).update(raw).digest('hex'));
  return req.send(raw);
}

describe('order state webhook', () => {
  it('activation GET answers 200', async () => {
    const res = await request(on.server).get('/api/ecomanager/webhook');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('an unsigned or wrongly signed webhook is refused', async () => {
    expect((await hook(ecoOrder(3000000), { secret: null })).status).toBe(401);
    expect((await hook(ecoOrder(3000000), { secret: 'another-secret-0123' })).status).toBe(401);
    expect((await hook(ecoOrder(3000000), { ctx: off })).status).toBe(401);
  });

  it('a signed status change updates the saved call', async () => {
    fake.orders.set(3000001, ecoOrder(3000001, 'En confirmation'));
    const { id, res } = saveInitial('TOU3000001');
    expect((await res).status).toBe(200);
    const done = await hook(ecoOrder(3000001, 'Livrée', { updated_at: '2026-11-21 09:00:00' }));
    expect(done.status).toBe(200);
    expect(done.body).toEqual({ ok: true });
    expect(await metaOf(id)).toMatchObject({
      order_check: 'verified', order_state_group: 'delivered', order_state_name: 'Livrée', order_state_at: new Date('2026-11-21T08:00:00.000Z'),
    });
    const calls = fake.calls.length;
    expect((await lookup('TOU3000001')).body.order.stateGroup).toBe('delivered');
    expect(fake.calls.length).toBe(calls);
  });

  it('an unverified call is confirmed by its webhook', async () => {
    fake.setStatus(503);
    const { id, res } = saveInitial('TOU3000003');
    expect((await res).status).toBe(200);
    expect((await hook(ecoOrder(3000003, 'En livraison'))).status).toBe(200);
    expect(await metaOf(id)).toMatchObject({ order_check: 'verified', order_state_group: 'shipping', order_state_name: 'En livraison' });
  });

  it('a late retry of an older state does not overwrite a newer one', async () => {
    fake.orders.set(3000005, ecoOrder(3000005, 'En confirmation'));
    const { id, res } = saveInitial('TOU3000005');
    expect((await res).status).toBe(200);
    expect((await hook(ecoOrder(3000005, 'Livrée', { updated_at: '2026-11-22 10:00:00' }))).status).toBe(200);
    expect((await hook(ecoOrder(3000005, 'En livraison', { updated_at: '2026-11-21 10:00:00' }))).status).toBe(200);
    expect(await metaOf(id)).toMatchObject({ order_state_group: 'delivered', order_state_name: 'Livrée' });
    expect((await lookup('TOU3000005')).body.order.stateGroup).toBe('delivered');
  });

  it('an unknown order is acknowledged', async () => {
    expect((await hook(ecoOrder(3999999, 'Livrée'))).status).toBe(200);
    expect((await hook({ event: 'ping' })).status).toBe(200);
  });

  it('another store’s order changes nothing', async () => {
    fake.orders.set(3000002, ecoOrder(3000002, 'En confirmation'));
    const { id, res } = saveInitial('TOU3000002');
    expect((await res).status).toBe(200);
    expect((await hook(ecoOrder(3000002, 'Annulée', { reference: 'SHT3000002' }))).status).toBe(200);
    expect(await metaOf(id)).toMatchObject({ order_state_group: 'pending', order_state_name: 'En confirmation' });
  });
});

describe('catch-up of recorded calls (order sync)', () => {
  // Its own app: the catch-up only uses half of EcoManager's quota, so it gets a client whose quota the lookups above
  // have not used (same database, so the accounts and sessions are shared).
  let syncCtx: TestContext;
  beforeAll(async () => {
    syncCtx = await createTestApp(ecomanager(fake.url));
  });
  afterAll(() => syncCtx.close());
  const sync = () => syncCtx.app.get(OrderSyncService);
  const past = (order_ref: string, extra: Partial<Parameters<typeof insertCall>[1]> = {}) =>
    insertCall(on.db, { user_id: linaUser.id, created_at: new Date(Date.now() - 3 * 86_400_000), order_ref, ...extra });
  const setMeta = (id: string, values: Partial<typeof tcCallMeta.$inferInsert>) => on.db.update(tcCallMeta).set(values).where(eq(tcCallMeta.call_id, id));

  it('catches up calls recorded before the feature', async () => {
    fake.orders.set(4000001, ecoOrder(4000001, 'Livrée'));
    fake.orders.set(4000002, ecoOrder(4000002, 'En livraison'));
    const full = await past('TOU4000001');
    const digits = await past('4000002');
    const other = await past('DOS-0142');
    const unknown = await past('TOU4000009');
    const none = await past('');
    const r = await sync().runOnce();
    expect(r).toEqual({ checked: 4, updated: 4, remaining: 0 });
    expect(await metaOf(full)).toMatchObject({ order_check: 'verified', ecomanager_order_id: '4000001', order_state_group: 'delivered', order_ref: 'TOU4000001' });
    expect(await metaOf(digits)).toMatchObject({ order_check: 'verified', ecomanager_order_id: '4000002', order_state_group: 'shipping', order_ref: '4000002' });
    expect(await metaOf(other)).toMatchObject({ order_check: 'unrecognized', ecomanager_order_id: null });
    expect(await metaOf(unknown)).toMatchObject({ order_check: 'not-found' });
    expect(await metaOf(none)).toMatchObject({ order_check: '' });
    expect(fake.calls).not.toContain('/api/shop/v2/orders/142');
  });

  it('two calls on one order cost one request', async () => {
    fake.orders.set(4000003, ecoOrder(4000003, 'En confirmation'));
    const a = await past('TOU4000003');
    const b = await past('TOU4000003');
    await sync().runOnce();
    expect(fake.calls.filter((c) => c.endsWith('/4000003'))).toHaveLength(1);
    const metas = await on.db.select().from(tcCallMeta).where(inArray(tcCallMeta.call_id, [a, b]));
    expect(metas.map((m) => m.order_check)).toEqual(['verified', 'verified']);
  });

  it('a voided call is skipped', async () => {
    fake.orders.set(4000004, ecoOrder(4000004));
    const id = await past('TOU4000004');
    await on.db.update(tcCalls).set({ voided_at: new Date() }).where(eq(tcCalls.id, id));
    await sync().runOnce();
    expect(await metaOf(id)).toMatchObject({ order_check: '' });
    expect(fake.calls).toEqual([]);
  });

  it('final orders are not refreshed, others are after 24 h', async () => {
    const twoDays = new Date(Date.now() - 2 * 86_400_000);
    const delivered = await past('TOU4000005');
    await setMeta(delivered, { order_check: 'verified', ecomanager_order_id: '4000005', order_state_group: 'delivered', order_state_name: 'Livrée', order_synced_at: twoDays });
    const stale = await past('TOU4000006');
    await setMeta(stale, { order_check: 'verified', ecomanager_order_id: '4000006', order_state_group: 'shipping', order_state_name: 'En livraison', order_synced_at: twoDays });
    const fresh = await past('TOU4000007');
    await setMeta(fresh, { order_check: 'verified', ecomanager_order_id: '4000007', order_state_group: 'shipping', order_state_name: 'En livraison', order_synced_at: new Date() });
    fake.orders.set(4000006, ecoOrder(4000006, 'Retournée'));
    await sync().runOnce();
    expect(fake.calls).toEqual(['/api/shop/v2/orders/4000006']);
    expect(await metaOf(stale)).toMatchObject({ order_state_group: 'failed', order_state_name: 'Retournée' });
  });

  it('stops when EcoManager is unavailable and resumes later', async () => {
    fake.orders.set(4000008, ecoOrder(4000008));
    const a = await past('TOU4000008');
    fake.setStatus(503);
    expect(await sync().runOnce()).toEqual({ checked: 0, updated: 0, remaining: 1 });
    expect(await metaOf(a)).toMatchObject({ order_check: '' });
    fake.setStatus(0);
    expect(await sync().runOnce()).toEqual({ checked: 1, updated: 1, remaining: 0 });
    expect(await metaOf(a)).toMatchObject({ order_check: 'verified' });
  });

  it('a server error on one order does not stop the others', async () => {
    fake.orders.set(6000001, { __status: 500 });
    fake.orders.set(6000002, ecoOrder(6000002, 'Livrée'));
    const failing = await past('TOU6000001');
    const fine = await past('TOU6000002');
    await sync().runOnce();
    expect(await metaOf(fine)).toMatchObject({ order_check: 'verified', order_state_group: 'delivered' });
    expect(await metaOf(failing)).toMatchObject({ order_check: '' });
    expect((await metaOf(failing))?.order_synced_at).not.toBeNull();
  });

  it('a verified order EcoManager no longer finds is not re-checked every run', async () => {
    const id = await past('TOU6000003');
    await setMeta(id, { order_check: 'verified', ecomanager_order_id: '6000003', order_state_group: 'shipping', order_state_name: 'En livraison', order_synced_at: new Date(Date.now() - 2 * 86_400_000) });
    await sync().runOnce();
    await sync().runOnce();
    expect(fake.calls.filter((c) => c.endsWith('/6000003'))).toHaveLength(1);
    const meta = await metaOf(id);
    expect(meta).toMatchObject({ order_check: 'verified', order_state_group: 'shipping' });
    // Stamped by the run, so it waits a day like any other checked order (not only the client's 2-minute cache).
    expect(meta!.order_synced_at!.getTime()).toBeGreaterThan(Date.now() - 60_000);
  });

  it('one catch-up at a time (advisory lock)', async () => {
    fake.orders.set(4000012, ecoOrder(4000012));
    fake.setDelay(150);
    await past('TOU4000012');
    const [a, b] = await Promise.all([sync().runOnce(), sync().runOnce()]);
    expect([a.checked, b.checked].sort()).toEqual([0, 1]);
    expect(fake.calls.filter((c) => c.endsWith('/4000012'))).toHaveLength(1);
  });

  it('only managers see the sync status', async () => {
    fake.orders.set(4000010, ecoOrder(4000010, 'Livrée'));
    await past('TOU4000010');
    await past('DOS-1');
    await past('TOU4000011');
    expect((await deskGet(syncCtx, '?action=order-sync', lina)).status).toBe(403);
    expect((await deskGet(syncCtx, '?action=order-sync', admin)).body).toEqual({ total: 3, known: 0, pending: 3, notFound: 0, unrecognized: 0 });
    await sync().runOnce();
    expect((await deskGet(syncCtx, '?action=order-sync', admin)).body).toEqual({ total: 3, known: 1, pending: 0, notFound: 1, unrecognized: 1 });
    expect((await deskGet(off, '?action=order-sync', await loginCookie(off, 'direction', PASSWORD))).status).toBe(404);
  });
});

/** Present the antiacne + wcgel duo and save it as accepted on `orderRef` (today's desk unless oldTab). */
async function acceptedSale(orderRef: string, { oldTab = false } = {}) {
  const callId = randomUUID(), id = randomUUID();
  const offer = { baseId: 'antiacne', productIds: ['antiacne', 'wcgel'], tier: 'duo', delivery: null, agreedTotal: 3000 };
  const who = oldTab ? {} : { expectedUserId: linaUser.id };
  const opts = { cookie: lina, ...(oldTab ? { pricing: null } : {}) };
  expect((await deskPost(on, { action: 'present-offer', id, callId, ...offer, ...who }, opts)).status).toBe(200);
  return deskPost(on, {
    action: 'save-call', id: callId, ...offer, outcome: 'duo', consent: true, checked: true, refusal: '', ...who,
    meta: { version: 3, source: 'manual', customerStage: 'new', orderRef, startedAt: new Date(Date.now() - 60_000).toISOString(), eligible: true, objections: [], acceptedProposalId: id },
  }, opts);
}

describe('one accepted add-on per order, whatever form the reference was typed in', () => {
  const DUPLICATE = 'Un ajout accepté existe déjà pour cette référence de dossier. Vérifiez le journal pour éviter un double comptage.';
  it('a sale recorded under the bare number blocks a second sale on its TOU reference', async () => {
    await insertCall(on.db, { user_id: linaUser.id, created_at: new Date(Date.now() - 86_400_000), outcome: 'duo', order_ref: '5000001' });
    fake.orders.set(5000001, ecoOrder(5000001));
    const res = await acceptedSale('TOU5000001');
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(DUPLICATE);
  });

  it('an older tab typing the bare number after a TOU sale is blocked', async () => {
    await insertCall(on.db, { user_id: linaUser.id, created_at: new Date(Date.now() - 86_400_000), outcome: 'duo', order_ref: 'TOU5000002' });
    const res = await acceptedSale('5000002', { oldTab: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(DUPLICATE);
  });
});
