import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../src/config/env.js';
import { type TestContext, createTestApp } from './support/context.js';
import { resetDatabase } from './support/database.js';
import { deskGet } from './support/desk.js';
import { type FakeEcoManager, ecoOrder, startFakeEcoManager } from './support/ecomanager-fake.js';
import { createUser, loginCookie } from './support/users.js';

const PASSWORD = 'mot-de-passe-solide-2026';

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

beforeAll(async () => {
  fake = await startFakeEcoManager();
  on = await createTestApp(ecomanager(fake.url));
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
  await createUser(on.db, { username: 'conseil.lina', password: PASSWORD, role: 'advisor', label: 'Lina B.' });
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
