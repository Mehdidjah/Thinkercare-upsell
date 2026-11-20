import { createHmac, randomUUID } from 'node:crypto';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { localDay } from '@touche/domain';
import type { Env } from '../src/config/env.js';
import { tcCallMeta, tcCalls } from '../src/db/schema.js';
import type { DeskUser } from '../src/desk/desk.types.js';
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
