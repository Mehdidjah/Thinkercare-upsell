import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tcAudit, tcCalls, tcSessions, tcUsers } from '../src/db/schema.js';
import { type TestContext, createTestApp } from './support/context.js';
import { resetDatabase } from './support/database.js';
import { deskGet, deskPost } from './support/desk.js';
import { createUser, loginCookie } from './support/users.js';

const PASSWORD = 'mot-de-passe-solide-2026';
const FORM = 'Vérifiez les champs du formulaire : ';
const fixtureAll = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../shared/test/fixtures/catalogue.json'), 'utf8'),
) as Array<Record<string, unknown> & { id: string }>;
const fixture = (id: string) => structuredClone(fixtureAll.find((p) => p.id === id)!);

let ctx: TestContext;
let admin: string;
let adviser: string;
let adviserUser: Awaited<ReturnType<typeof createUser>>;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx.db);
  await createUser(ctx.db, {
    username: 'direction',
    password: PASSWORD,
    role: 'admin',
  });
  adviserUser = await createUser(ctx.db, {
    username: 'conseil.lina',
    password: PASSWORD,
    role: 'advisor',
    team: 'Alger',
  });
  admin = await loginCookie(ctx, 'direction', PASSWORD);
  adviser = await loginCookie(ctx, 'conseil.lina', PASSWORD);
});

const post = (body: unknown, cookie = admin) => deskPost(ctx, body, { cookie });
const insertCall = (id: string, createdAt: string) =>
  ctx.db.insert(tcCalls).values({
    id,
    user_id: adviserUser.id,
    operator: 'Lina',
    created_at: new Date(createdAt),
    outcome: 'duo',
    base_id: 'antiacne',
    products: [{ id: 'antiacne', name: 'Sérum Anti-Acné', price: 1800 }],
    catalogue_total: 1800,
    base_total: 1800,
    offered_total: 1800,
    delivery: null,
    tier: 'duo',
    extra: 0,
  });

describe('bootstrap', () => {
  it('admin bootstrap returns the 32 products in catalogue order, calls, clinical and accounts', async () => {
    const res = await deskGet(ctx, '', admin);
    expect(res.status).toBe(200);
    expect(res.body.products).toHaveLength(32);
    expect(res.body.products.map((p: { id: string }) => p.id)).toEqual(fixtureAll.map((p) => p.id));
    expect(res.body.clinical).toEqual({ validated: false, by: '', at: '' });
    expect(res.body.user.username).toBe('direction');
    expect(res.body.users).toHaveLength(2);
    for (const u of res.body.users) {
      expect(u).not.toHaveProperty('salt');
      expect(u).not.toHaveProperty('password_hash');
    }
    expect(res.body.calls).toEqual([]);
  });
  it('adviser bootstrap never includes calls or colleagues', async () => {
    await insertCall(randomUUID(), '2026-11-01T10:00:00Z');
    const res = await deskGet(ctx, '', adviser);
    expect(res.status).toBe(200);
    expect(res.body.calls).toEqual([]);
    expect(res.body.users).toEqual([]);
    expect(res.body.products).toHaveLength(32);
  });
  it('admin calls come newest first with parsed products', async () => {
    const older = randomUUID();
    const newer = randomUUID();
    await insertCall(older, '2026-11-01T10:00:00Z');
    await insertCall(newer, '2026-11-02T10:00:00Z');
    const res = await deskGet(ctx, '', admin);
    expect(res.body.calls.map((c: { id: string }) => c.id)).toEqual([newer, older]);
    expect(Array.isArray(res.body.calls[0].products)).toBe(true);
    expect(res.body.calls[0].created_at).toMatch(/Z$/);
    expect(res.body.calls[0].created_at).toBe('2026-11-02T10:00:00.000Z');
  });
});

describe('product', () => {
  it('product upsert round-trips French text exactly', async () => {
    const product = {
      ...fixture('antiacne'),
      name: 'Crème « essai » — l’été 100 %',
      description: 'L’essai, « testé ».',
    };
    const res = await post({ action: 'product', product });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const got = await deskGet(ctx, '', admin);
    expect(got.body.products.find((p: { id: string }) => p.id === 'antiacne')).toEqual(product);
    expect(got.body.products).toHaveLength(32);
    const [row] = await ctx.db
      .select()
      .from(tcAudit)
      .where(eq(tcAudit.action, 'catalogue.updated'));
    expect(row!.target).toBe('antiacne');
    expect(row!.detail).toEqual({ price: 1800, enabled: true });
  });
  it('a new product goes to the end of the catalogue', async () => {
    const product = { ...fixture('antiacne'), id: 'produit-test' };
    expect((await post({ action: 'product', product })).status).toBe(200);
    const got = await deskGet(ctx, '', admin);
    expect(got.body.products).toHaveLength(33);
    expect(got.body.products.at(-1).id).toBe('produit-test');
  });
  it('foreign image hosts are rejected', async () => {
    const res = await post({
      action: 'product',
      product: { ...fixture('antiacne'), image: 'https://evil.example/x.png' },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.startsWith(FORM)).toBe(true);
  });
  it('a pack cannot contain itself', async () => {
    const product = {
      ...fixture('antiacne'),
      id: 'pack-test',
      category: 'Pack',
      components: ['pack-test', 'antiacne'],
    };
    const res = await post({ action: 'product', product });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Composition de pack invalide.' });
  });
  it('a recommendable pack needs two components', async () => {
    const product = {
      ...fixture('antiacne'),
      id: 'pack-test',
      category: 'Pack',
      recommendable: true,
      components: ['antiacne'],
    };
    const res = await post({ action: 'product', product });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Renseignez les composants vérifiés avant d’autoriser ce pack.',
    });
  });
  it('an adviser cannot edit the catalogue', async () => {
    const res = await post({ action: 'product', product: fixture('antiacne') }, adviser);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'Cette action est réservée à la direction.',
    });
  });
});

describe('clinical', () => {
  it('clinical validation needs a named person', async () => {
    const bad = await post({ action: 'clinical', validated: true, by: 'A' });
    expect(bad.status).toBe(400);
    expect(bad.body).toEqual({
      error: 'Indiquez le responsable ayant effectivement validé le protocole.',
    });
    const ok = await post({
      action: 'clinical',
      validated: true,
      by: 'Dr Benali',
    });
    expect(ok.status).toBe(200);
    const got = await deskGet(ctx, '', admin);
    expect(got.body.clinical.validated).toBe(true);
    expect(got.body.clinical.by).toBe('Dr Benali');
    expect(got.body.clinical.version).toBe(3);
  });
});

describe('accounts', () => {
  it('creating an adviser', async () => {
    const body = {
      action: 'user',
      username: 'Nouvelle.Conseillere',
      label: 'Nouvelle',
      password: 'un-mot-de-passe-long-1',
    };
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const [row] = await ctx.db
      .select()
      .from(tcUsers)
      .where(eq(tcUsers.username, 'nouvelle.conseillere'));
    expect(row!.role).toBe('advisor');
    expect(
      (await loginCookie(ctx, 'nouvelle.conseillere', 'un-mot-de-passe-long-1')).length,
    ).toBeGreaterThan(10);
    const dup = await post(body);
    expect(dup.status).toBe(400);
    expect(dup.body).toEqual({ error: 'Cet identifiant existe déjà.' });
    const [audit] = await ctx.db
      .select()
      .from(tcAudit)
      .where(eq(tcAudit.action, 'account.created'));
    expect(audit!.target).toBe('nouvelle.conseillere');
  });
  it('reset-user replaces the password and revokes sessions; direction accounts are refused', async () => {
    const res = await post({
      action: 'reset-user',
      id: adviserUser.id,
      password: 'nouveau-mot-de-passe-2027',
    });
    expect(res.status).toBe(200);
    expect((await deskGet(ctx, '', adviser)).status).toBe(401);
    expect(await loginCookie(ctx, 'conseil.lina', 'nouveau-mot-de-passe-2027')).toBeTruthy();
    const [admRow] = await ctx.db.select().from(tcUsers).where(eq(tcUsers.username, 'direction'));
    const refused = await post({
      action: 'reset-user',
      id: admRow!.id,
      password: 'nouveau-mot-de-passe-2027',
    });
    expect(refused.status).toBe(400);
    expect(refused.body).toEqual({
      error: 'Utilisez le changement de votre propre mot de passe pour la direction.',
    });
    const missing = await post({
      action: 'reset-user',
      id: 'inconnu',
      password: 'nouveau-mot-de-passe-2027',
    });
    expect(missing.status).toBe(400);
  });
  it('user-settings rules', async () => {
    const base = {
      action: 'user-settings',
      id: adviserUser.id,
      label: 'Lina B.',
      team: 'Oran',
      active: true,
      reporting_scope: 'own',
    };
    const ok = await post(base);
    expect(ok.status).toBe(200);
    const [row] = await ctx.db.select().from(tcUsers).where(eq(tcUsers.id, adviserUser.id));
    expect([row!.label, row!.team, row!.active]).toEqual(['Lina B.', 'Oran', 1]);
    const scope = await post({ ...base, reporting_scope: 'team' });
    expect(scope.status).toBe(400);
    expect(scope.body).toEqual({
      error:
        'Une conseillère accède uniquement à sa progression personnelle. Le pilotage des équipes est réservé à la direction.',
    });
    const unknown = await post({ ...base, id: 'inconnu' });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: 'Compte introuvable.' });
    const [admRow] = await ctx.db.select().from(tcUsers).where(eq(tcUsers.username, 'direction'));
    const self = await post({
      ...base,
      id: admRow!.id,
      active: false,
      reporting_scope: 'team',
    });
    expect(self.status).toBe(400);
    expect(self.body).toEqual({
      error: 'Le compte direction ne peut pas être désactivé ici.',
    });
    const off = await post({ ...base, active: false });
    expect(off.status).toBe(200);
    expect(
      await ctx.db.select().from(tcSessions).where(eq(tcSessions.user_id, adviserUser.id)),
    ).toEqual([]);
    const denied = await post(base, adviser);
    expect(denied.status).toBe(401);
  });
  it('user-settings is refused to an adviser', async () => {
    const res = await post(
      {
        action: 'user-settings',
        id: adviserUser.id,
        label: 'Lina',
        team: '',
        active: true,
        reporting_scope: 'own',
      },
      adviser,
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Accès direction requis.' });
  });
});

describe('audit log', () => {
  it('admin sees the newest 200, adviser is refused', async () => {
    const rows = Array.from({ length: 205 }, (_, i) => ({
      id: randomUUID(),
      user_id: adviserUser.id,
      action: 'x.y',
      target: `t${i}`,
      at: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
      detail: { i },
    }));
    await ctx.db.insert(tcAudit).values(rows);
    const res = await deskGet(ctx, '?action=audit', admin);
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(200);
    expect(res.body.events).toHaveLength(200);
    expect(res.body.events[0].target).toBe('t204');
    expect(res.body.events[0].label).toBe('conseil.lina');
    expect(res.body.events[0].user_id).toBe(adviserUser.id);
    expect(res.body.events[0].detail).toEqual({ i: 204 });
    expect(Object.keys(res.body.events[0]).sort()).toEqual([
      'action',
      'at',
      'detail',
      'id',
      'label',
      'target',
      'user_id',
    ]);
    expect(res.body.events[0].at).toBe('2026-01-01T00:03:24.000Z');
    const denied = await deskGet(ctx, '?action=audit', adviser);
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: 'Accès direction requis.' });
  });

  it('shows the actor id when it is not an account (password reset from the command line)', async () => {
    await ctx.db.insert(tcAudit).values({
      id: randomUUID(),
      user_id: 'cli',
      action: 'account.password_reset',
      target: adviserUser.id,
      at: new Date(),
      detail: { via: 'cli' },
    });
    const res = await deskGet(ctx, '?action=audit', admin);
    expect(res.status).toBe(200);
    expect(res.body.events[0]).toMatchObject({
      user_id: 'cli',
      label: null,
      action: 'account.password_reset',
    });
  });
});
