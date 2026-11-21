import { and, eq, sql } from 'drizzle-orm';
import { algerDay, type ItemSnapshot } from '@touche/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tcAudit, tcBonusRules, tcCallMeta, tcCalls } from '../src/db/schema.js';
import type { DeskUser } from '../src/desk/desk.types.js';
import { insertCall } from './support/calls.js';
import { type TestContext, createTestApp } from './support/context.js';
import { resetDatabase } from './support/database.js';
import { deskGet, deskPost } from './support/desk.js';
import { createUser, loginCookie } from './support/users.js';

const PASSWORD = 'mot-de-passe-solide-2026';
const thisMonth = () => algerDay().slice(0, 7);
let ctx: TestContext;
let admin: string;
let lina: string;
let adminUser: DeskUser;
let linaUser: DeskUser;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx.db);
  adminUser = await createUser(ctx.db, {
    username: 'direction',
    password: PASSWORD,
    role: 'admin',
  });
  linaUser = await createUser(ctx.db, {
    username: 'conseil.lina',
    password: PASSWORD,
    role: 'advisor',
  });
  admin = await loginCookie(ctx, 'direction', PASSWORD);
  lina = await loginCookie(ctx, 'conseil.lina', PASSWORD);
});

const now = () => new Date();
const progress = async (query = '', cookie = lina) =>
  (await deskGet(ctx, `?action=my-progress${query}`, cookie)).body;
const lineFor = async (id: string) =>
  (await deskGet(ctx, '?action=contributions', admin)).body.people.find(
    (x: { id: string }) => x.id === id,
  );

/** The EcoManager state of a call's order, as the save, the webhook and the catch-up write it. */
const setOrder = (id: string, values: Partial<typeof tcCallMeta.$inferInsert>) =>
  ctx.db.update(tcCallMeta).set({ order_check: 'verified', ...values }).where(eq(tcCallMeta.call_id, id));
/** The call's order delivered at `at` (« Livrée », or `name`). */
const deliver = (id: string, at: Date, name = 'Livrée') =>
  setOrder(id, { order_state_group: 'delivered', order_state_name: name, order_state_at: at, delivered_at: at });

/** Item snapshots shaped like the desk saves them (catalogue.ts `snapshot`). */
const item = (id: string, price: number, category: string): ItemSnapshot => ({
  id,
  name: id,
  price,
  quantity: 1,
  category,
  components: [],
});
const packPousse = (): ItemSnapshot => ({
  id: 'packpousse',
  name: 'Pack Pousse et Croissance',
  price: 3250,
  quantity: 1,
  category: 'Pack',
  components: [
    {
      id: 'shpousse',
      name: 'Shampooing Pousse et Croissance',
      price: 1900,
      quantity: 1,
      category: 'Shampoing',
    },
    {
      id: 'conditioner',
      name: 'Après-Shampooing Densité',
      price: 1700,
      quantity: 1,
      category: 'Après-shampoing',
    },
  ],
});
const serumHair = () => item('serumhair', 1900, 'Soin cuir chevelu');

describe('commission progress', () => {
  it('my-progress counts one upsell per added product: an accepted duo counts 1, a trio 2', async () => {
    const u = linaUser.id;
    await insertCall(ctx.db, { user_id: u, created_at: now(), order_ref: 'A' });
    await insertCall(ctx.db, {
      user_id: u,
      created_at: now(),
      outcome: 'trio',
      offered_total: 4400,
      extra: 2600,
      tier: 'trio',
      order_ref: 'B',
    });
    await insertCall(ctx.db, {
      user_id: u,
      created_at: now(),
      outcome: 'refused',
      extra: 0,
      order_ref: 'C',
    });
    await insertCall(ctx.db, {
      user_id: u,
      created_at: now(),
      outcome: 'initial',
      offered_total: 1800,
      extra: 0,
      order_ref: 'D',
    });
    const body = await progress();
    expect(body.sold).toBe(3);
  });

  it('a trio adds two products: two upsells, one confirmation; delivered today, both count today', async () => {
    const id = await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: now(),
      outcome: 'trio',
      tier: 'trio',
      base_id: 'antiacne',
      base_total: 1800,
      catalogue_total: 5200,
      offered_total: 4400,
      extra: 2600,
      order_ref: 'T-1',
      products: [
        item('antiacne', 1800, 'Soin ciblé'),
        item('nia10', 1900, 'Soin ciblé'),
        item('wcgel', 1500, 'Hydratant'),
      ],
    });
    expect((await progress()).sold).toBe(2);
    await deliver(id, now());
    const body = await progress();
    expect(body.sold).toBe(2);
    expect(body.progress.count).toBe(2);
    expect(body.todayUpsells).toBe(2);
    expect(body.daily).toEqual([{ day: algerDay(), upsells: 2 }]);
    const p = await lineFor(linaUser.id);
    expect(p.period).toMatchObject({ upsells: 2, confirmations: 1 });
    expect(p.monthly).toMatchObject({ upsells: 2, confirmations: 1 });
  });

  it('a pack upgrade (one product replaced by its pack of 2) counts one upsell', async () => {
    await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: now(),
      outcome: 'duo',
      tier: 'duo',
      base_id: 'shpousse',
      base_total: 1900,
      catalogue_total: 3250,
      offered_total: 3250,
      extra: 1350,
      order_ref: 'PK-1',
      products: [packPousse()],
    });
    expect((await progress()).sold).toBe(1);
  });

  it('a pack upgrade plus one more product counts two upsells', async () => {
    await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: now(),
      outcome: 'trio',
      tier: 'trio',
      base_id: 'shpousse',
      base_total: 1900,
      catalogue_total: 5150,
      offered_total: 4900,
      extra: 3000,
      order_ref: 'PK-2',
      products: [packPousse(), serumHair()],
    });
    expect((await progress()).sold).toBe(2);
  });

  it('an initial pack of 2 plus one product counts one upsell', async () => {
    await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: now(),
      outcome: 'trio',
      tier: 'trio',
      base_id: 'packpousse',
      base_total: 3250,
      catalogue_total: 5150,
      offered_total: 4900,
      extra: 1650,
      order_ref: 'PK-3',
      products: [packPousse(), serumHair()],
    });
    const body = await progress();
    expect(body.sold).toBe(1);
    expect(body.withoutReference).toBe(0);
    expect(body.duplicateExcluded).toBe(0);
  });

  it('calls that add nothing payable never count, whatever their size', async () => {
    const u = linaUser.id;
    for (const outcome of [
      'initial',
      'refused',
      'review',
      'noanswer',
      'callback',
    ]) {
      await insertCall(ctx.db, {
        user_id: u,
        created_at: now(),
        outcome,
        offered_total:
          outcome === 'initial' || outcome === 'refused' ? 1800 : 0,
        extra: 0,
        order_ref: `X-${outcome}`,
      });
    }
    // An accepted trio without a positive extra, and one whose offer does not exceed the order.
    // Both have no dossier reference (empty, then no metadata row), so "sans référence" must
    // apply the same eligibility gates as the upsell count.
    await insertCall(ctx.db, {
      user_id: u,
      created_at: now(),
      outcome: 'trio',
      extra: 0,
      order_ref: '',
    });
    await insertCall(ctx.db, {
      user_id: u,
      created_at: now(),
      outcome: 'trio',
      base_total: 1800,
      offered_total: 1800,
      extra: 600,
      order_ref: null,
    });
    const body = await progress();
    expect(body.sold).toBe(0);
    expect(body.withoutReference).toBe(0);
    expect((await lineFor(u)).period).toMatchObject({
      upsells: 0,
      withoutRef: 0,
    });
  });

  it('a dossier reference is counted once, the accepted addition wins', async () => {
    const u = linaUser.id;
    await insertCall(ctx.db, {
      user_id: u,
      created_at: now(),
      order_ref: 'DOS-9',
    });
    await insertCall(ctx.db, {
      user_id: u,
      created_at: now(),
      order_ref: 'DOS-9',
    });
    const body = await progress();
    expect(body.sold).toBe(1);
    expect(body.duplicateExcluded).toBe(1);
  });

  it('a duplicated trio dossier counts its two products once and excludes the other two', async () => {
    const u = linaUser.id;
    await insertCall(ctx.db, {
      user_id: u,
      created_at: new Date(Date.now() - 60_000),
      outcome: 'trio',
      tier: 'trio',
      offered_total: 4400,
      extra: 2600,
      order_ref: 'DOS-T',
    });
    await insertCall(ctx.db, {
      user_id: u,
      created_at: now(),
      outcome: 'trio',
      tier: 'trio',
      offered_total: 4400,
      extra: 2600,
      order_ref: ' dos-t ',
    });
    const body = await progress();
    expect(body.sold).toBe(2);
    expect(body.duplicateExcluded).toBe(2);
    expect((await lineFor(u)).period).toMatchObject({
      upsells: 2,
      duplicates: 2,
      confirmations: 1,
    });
  });

  it('upsells without a reference are counted in added products', async () => {
    const u = linaUser.id;
    await insertCall(ctx.db, {
      user_id: u,
      created_at: now(),
      outcome: 'trio',
      tier: 'trio',
      offered_total: 4400,
      extra: 2600,
      order_ref: '',
    });
    let body = await progress();
    expect(body.sold).toBe(2);
    expect(body.withoutReference).toBe(2);
    // A call with no dossier metadata at all is also without reference.
    await insertCall(ctx.db, {
      user_id: u,
      created_at: now(),
      order_ref: null,
    });
    body = await progress();
    expect(body.sold).toBe(3);
    expect(body.withoutReference).toBe(3);
    expect((await lineFor(u)).period).toMatchObject({
      upsells: 3,
      withoutRef: 3,
    });
  });

  it('upsells without a reference are flagged', async () => {
    await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: now(),
      order_ref: '',
    });
    const body = await progress();
    expect(body.withoutReference).toBe(1);
  });

  it('Algiers month boundary: 2026-11-30T23:30Z counts in December', async () => {
    await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: new Date('2026-11-30T23:30:00Z'),
      order_ref: 'Z1',
    });
    expect((await progress('&month=2026-11')).sold).toBe(0);
    expect((await progress('&month=2026-12')).sold).toBe(1);
  });

  it('pending mode estimates null, not zero', async () => {
    const body = await progress('&month=2026-11');
    expect(body.progress).toMatchObject({
      mode: 'pending',
      estimatedDzd: null,
      threshold: 60,
      rateDzd: 45,
    });
  });

  it('numbers are JSON numbers, not strings', async () => {
    const id = await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: now(),
      order_ref: 'N1',
    });
    await deliver(id, now());
    const body = await progress();
    expect(typeof body.progress.count).toBe('number');
    expect(typeof body.daily[0].upsells).toBe('number');
    expect(typeof body.sold).toBe('number');
    expect(typeof body.stateCounts.delivered).toBe('number');
    expect(typeof body.upsells[0].units).toBe('number');
    expect(typeof body.upsells[0].extra).toBe('number');
    const c = (await deskGet(ctx, '?action=contributions', admin)).body;
    const p = c.people.find((x: { id: string }) => x.id === linaUser.id);
    expect(typeof p.monthly.delivered).toBe('number');
    expect(typeof p.period.upsells).toBe('number');
    expect(typeof p.period.initialDzd).toBe('number');
    expect(p.daily.length).toBeGreaterThan(0);
    for (const k of [
      'upsells',
      'calls',
      'confirmations',
      'initial_dzd',
      'confirmed_dzd',
      'uplift_dzd',
      'without_ref',
      'duplicates',
    ]) {
      expect(typeof p.daily[0][k], k).toBe('number');
    }
  });

  it('ranks before the user filter: a duplicate dossier credits only the earliest adviser', async () => {
    const sara = await createUser(ctx.db, {
      username: 'conseil.sara',
      password: PASSWORD,
      role: 'advisor',
    });
    const saraCookie = await loginCookie(ctx, 'conseil.sara', PASSWORD);
    await insertCall(ctx.db, {
      user_id: sara.id,
      created_at: new Date(Date.now() - 60_000),
      order_ref: 'DOS-S',
    });
    await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: now(),
      order_ref: 'DOS-S',
    });
    expect((await progress('', saraCookie)).sold).toBe(1);
    const lina2 = await progress();
    expect(lina2.sold).toBe(0);
    expect(lina2.duplicateExcluded).toBe(1);
  });

  it('ranks a dossier across advisers: the accepted add-on wins over an earlier call', async () => {
    const sara = await createUser(ctx.db, {
      username: 'conseil.sara',
      password: PASSWORD,
      role: 'advisor',
    });
    const saraCookie = await loginCookie(ctx, 'conseil.sara', PASSWORD);
    const t0 = new Date(Date.now() - 60_000);
    await insertCall(ctx.db, {
      user_id: sara.id,
      created_at: t0,
      outcome: 'initial',
      offered_total: 1800,
      extra: 0,
      order_ref: 'DOS-R',
    });
    await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: now(),
      order_ref: 'DOS-R',
    });
    expect((await progress()).sold).toBe(1);
    expect((await progress('', saraCookie)).sold).toBe(0);
    const c = (await deskGet(ctx, '?action=contributions', admin)).body;
    const person = (id: string) =>
      c.people.find((x: { id: string }) => x.id === id);
    expect(person(sara.id).monthly).toMatchObject({
      upsells: 0,
      confirmations: 0,
    });
    expect(person(linaUser.id).monthly).toMatchObject({
      upsells: 1,
      confirmations: 1,
    });
  });

  it('cross-adviser ranking gives each dossier and all its added products to the rank-1 call only', async () => {
    const sara = await createUser(ctx.db, {
      username: 'conseil.sara',
      password: PASSWORD,
      role: 'advisor',
    });
    const saraCookie = await loginCookie(ctx, 'conseil.sara', PASSWORD);
    const t0 = new Date(Date.now() - 60_000);
    // DOS-A: Sara's earlier trio wins over Lina's later duo.
    await insertCall(ctx.db, {
      user_id: sara.id,
      created_at: t0,
      outcome: 'trio',
      tier: 'trio',
      offered_total: 4400,
      extra: 2600,
      order_ref: 'DOS-A',
    });
    await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: now(),
      order_ref: 'DOS-A',
    });
    // DOS-B: Lina's accepted trio wins over Sara's earlier confirmed initial order.
    await insertCall(ctx.db, {
      user_id: sara.id,
      created_at: t0,
      outcome: 'initial',
      offered_total: 1800,
      extra: 0,
      order_ref: 'DOS-B',
    });
    await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: now(),
      outcome: 'trio',
      tier: 'trio',
      offered_total: 4400,
      extra: 2600,
      order_ref: 'DOS-B',
    });
    const s = await progress('', saraCookie);
    expect(s.sold).toBe(2);
    expect(s.duplicateExcluded).toBe(0);
    const l = await progress();
    expect(l.sold).toBe(2);
    expect(l.duplicateExcluded).toBe(1);
    expect((await lineFor(sara.id)).monthly).toMatchObject({
      upsells: 2,
      confirmations: 1,
      duplicates: 0,
    });
    expect((await lineFor(linaUser.id)).monthly).toMatchObject({
      upsells: 2,
      confirmations: 1,
      duplicates: 1,
    });
  });

  it('between two accepted add-ons on one dossier, the earliest wins even when a later one adds more products', async () => {
    const sara = await createUser(ctx.db, {
      username: 'conseil.sara',
      password: PASSWORD,
      role: 'advisor',
    });
    const saraCookie = await loginCookie(ctx, 'conseil.sara', PASSWORD);
    // Lina's accepted duo comes first; Sara's later accepted trio is a duplicate of the dossier.
    await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: new Date(Date.now() - 60_000),
      outcome: 'duo',
      tier: 'duo',
      offered_total: 3000,
      extra: 1200,
      order_ref: 'DOS-X',
    });
    await insertCall(ctx.db, {
      user_id: sara.id,
      created_at: now(),
      outcome: 'trio',
      tier: 'trio',
      offered_total: 4400,
      extra: 2600,
      order_ref: 'dos-x',
    });
    const l = await progress();
    expect(l.sold).toBe(1);
    expect(l.duplicateExcluded).toBe(0);
    const s = await progress('', saraCookie);
    expect(s.sold).toBe(0);
    expect(s.duplicateExcluded).toBe(2);
    expect((await lineFor(linaUser.id)).monthly).toMatchObject({
      upsells: 1,
      confirmations: 1,
      duplicates: 0,
    });
    expect((await lineFor(sara.id)).monthly).toMatchObject({
      upsells: 0,
      confirmations: 0,
      duplicates: 2,
    });
  });

  it('my-progress cannot target another account', async () => {
    for (const key of ['operator', 'user_id', 'team']) {
      const res = await deskGet(ctx, `?action=my-progress&${key}=x`, lina);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        error:
          'La progression personnelle ne permet pas de cibler un autre compte.',
      });
    }
  });

  it('an invalid month is 400', async () => {
    const res = await deskGet(ctx, '?action=my-progress&month=2026-13', lina);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Choisissez un mois valide.' });
  });

  it('contributions are direction-only', async () => {
    const res = await deskGet(ctx, '?action=contributions', lina);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'Cet espace est réservé à la direction.',
    });
  });

  it('thirty 1 800 -> 2 700 orders give 27 000 DA of uplift, not 45 000', async () => {
    for (let i = 0; i < 30; i++) {
      await insertCall(ctx.db, {
        user_id: linaUser.id,
        created_at: now(),
        base_total: 1800,
        offered_total: 2700,
        extra: 900,
        order_ref: `R${i}`,
      });
    }
    const c = (await deskGet(ctx, '?action=contributions', admin)).body;
    const p = c.people.find((x: { id: string }) => x.id === linaUser.id);
    expect(p.period).toMatchObject({
      initialDzd: 54000,
      confirmedDzd: 81000,
      upliftDzd: 27000,
    });
  });

  it('direction accounts are listed but not bonus-eligible', async () => {
    const id = await insertCall(ctx.db, {
      user_id: adminUser.id,
      created_at: now(),
      order_ref: 'ADM',
    });
    await deliver(id, now());
    const c = (await deskGet(ctx, '?action=contributions', admin)).body;
    const a = c.people.find((x: { id: string }) => x.id === adminUser.id);
    expect(a).toBeDefined();
    expect(a.monthly.upsells).toBe(1);
    expect(a.monthly.delivered).toBe(1);
    expect(a.monthly.bonus.count).toBe(0);
  });

  it('the bonus rule uses optimistic versions', async () => {
    // A fixed far-future month: always valid, never closed, independent of today's date.
    const month = '2099-01';
    const rule = (expectedVersion: number) => ({
      action: 'bonus-rule',
      month,
      threshold: 60,
      rateDzd: 45,
      mode: 'all_month',
      expectedVersion,
      confirmed: true,
    });
    const created = await deskPost(ctx, rule(0), { cookie: admin });
    expect(created.status).toBe(200);
    expect(created.body).toEqual({ ok: true });
    const updated = await deskPost(ctx, rule(1), { cookie: admin });
    expect(updated.status).toBe(200);
    expect(updated.body).toEqual({ ok: true });
    const stale = await deskPost(ctx, rule(1), { cookie: admin });
    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({
      error: 'Cette règle vient d’être modifiée par un autre compte. Rechargez la règle enregistrée, vérifiez-la, puis enregistrez de nouveau.',
    });
    const [row] = await ctx.db
      .select()
      .from(tcBonusRules)
      .where(eq(tcBonusRules.month, month));
    expect(row!.version).toBe(2);
    const audit = await ctx.db
      .select()
      .from(tcAudit)
      .where(
        and(
          eq(tcAudit.action, 'bonus.rule.updated'),
          eq(tcAudit.target, month),
        ),
      );
    expect(audit).toHaveLength(2);
    expect(
      audit
        .map((a) => (a.detail as { version: number }).version)
        .sort((a, b) => a - b),
    ).toEqual([1, 2]);
  });

  it('a first rule (expectedVersion 0) is inserted once', async () => {
    const month = '2027-03';
    const rule = {
      action: 'bonus-rule',
      month,
      threshold: 40,
      rateDzd: 50,
      mode: 'all_month',
      expectedVersion: 0,
      confirmed: true,
    };
    expect((await deskPost(ctx, rule, { cookie: admin })).status).toBe(200);
    expect((await deskPost(ctx, rule, { cookie: admin })).status).toBe(409);
    const [row] = await ctx.db
      .select()
      .from(tcBonusRules)
      .where(eq(tcBonusRules.month, month));
    expect(row!.version).toBe(1);
  });

  it('all_month mode pays every upsell once 60 are reached', async () => {
    const month = thisMonth();
    await ctx.db
      .execute(sql`INSERT INTO tc_bonus_rules (month, threshold, rate_dzd, mode, version, updated_by, updated_at)
      VALUES (${month}, 60, 45, 'all_month', 1, '', now()) ON CONFLICT (month) DO UPDATE SET mode = 'all_month', threshold = 60, rate_dzd = 45`);
    const ids: string[] = [];
    for (let i = 0; i < 60; i++) {
      ids.push(await insertCall(ctx.db, {
        user_id: linaUser.id,
        created_at: now(),
        order_ref: `M${i}`,
      }));
    }
    // Sold is not enough: the prime counts delivered upsells.
    expect((await progress()).progress).toMatchObject({ count: 0, reached: false, estimatedDzd: 0 });
    for (const id of ids) await deliver(id, now());
    const body = await progress();
    expect(body.progress.estimatedDzd).toBe(2700);
  });

  it('the bonus is computed on added products: 30 trios reach the 60-upsell threshold', async () => {
    const month = thisMonth();
    await ctx.db
      .execute(sql`INSERT INTO tc_bonus_rules (month, threshold, rate_dzd, mode, version, updated_by, updated_at)
      VALUES (${month}, 60, 45, 'all_month', 1, '', now()) ON CONFLICT (month) DO UPDATE SET mode = 'all_month', threshold = 60, rate_dzd = 45`);
    for (let i = 0; i < 30; i++) {
      const id = await insertCall(ctx.db, {
        user_id: linaUser.id,
        created_at: now(),
        outcome: 'trio',
        tier: 'trio',
        offered_total: 4400,
        extra: 2600,
        order_ref: `TR${i}`,
      });
      await deliver(id, now());
    }
    const body = await progress();
    expect(body.progress).toMatchObject({
      count: 60,
      reached: true,
      payableCount: 60,
      estimatedDzd: 2700,
    });
    expect((await lineFor(linaUser.id)).monthly.bonus).toMatchObject({
      count: 60,
      estimatedDzd: 2700,
    });
  });

  it('closed months are read-only', async () => {
    const res = await deskPost(
      ctx,
      {
        action: 'bonus-rule',
        month: '2020-01',
        threshold: 60,
        rateDzd: 45,
        mode: 'pending',
        expectedVersion: 0,
        confirmed: true,
      },
      { cookie: admin },
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error:
        'Les règles des mois clôturés sont en lecture seule. Une correction historique demande une procédure dédiée.',
    });
  });

  it('an adviser cannot set the rule', async () => {
    const res = await deskPost(
      ctx,
      {
        action: 'bonus-rule',
        month: thisMonth(),
        threshold: 60,
        rateDzd: 45,
        mode: 'pending',
        expectedVersion: 1,
        confirmed: true,
      },
      { cookie: lina },
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: 'Seule la direction peut définir la prime.',
    });
  });
});

describe('prime on delivered upsells', () => {
  const at = (iso: string) => new Date(iso);
  let n = 0;
  /** A Touché duo (1 upsell) sold by Lina on 10 November unless told otherwise, on its own TOU order. */
  const sale = (over: Partial<Parameters<typeof insertCall>[1]> = {}) =>
    insertCall(ctx.db, { user_id: linaUser.id, created_at: at('2026-11-10T10:00:00Z'), order_ref: `TOU${8000000 + ++n}`, ...over });
  const voidCall = (id: string) => ctx.db.update(tcCalls).set({ voided_at: new Date(), voided_by: adminUser.id, void_reason: 'Erreur de saisie' }).where(eq(tcCalls.id, id));
  const sara = async () => {
    const u = await createUser(ctx.db, { username: 'conseil.sara', password: PASSWORD, role: 'advisor' });
    return { id: u.id, cookie: await loginCookie(ctx, 'conseil.sara', PASSWORD) };
  };

  it('only delivered upsells count; the month’s sales are split by the state of their order', async () => {
    const delivered = await sale({ outcome: 'trio', tier: 'trio', offered_total: 4400, extra: 2600 });
    await deliver(delivered, at('2026-11-12T09:00:00Z'));
    await setOrder(await sale(), { order_state_group: 'shipping', order_state_name: 'En livraison', order_state_at: at('2026-11-11T09:00:00Z') });
    await setOrder(await sale(), { order_state_group: 'pending', order_state_name: 'En confirmation', order_state_at: at('2026-11-10T11:00:00Z') });
    await setOrder(await sale(), { order_state_group: 'failed', order_state_name: 'Annulée', order_state_at: at('2026-11-11T09:00:00Z') });
    await sale();
    await sale({ order_ref: null });
    const body = await progress('&month=2026-11');
    expect(body.sold).toBe(7);
    expect(body.progress.count).toBe(2);
    expect(body.stateCounts).toEqual({ delivered: 2, shipping: 1, pending: 1, failed: 1, unknown: 2 });
    expect(body.daily).toEqual([{ day: '2026-11-12', upsells: 2 }]);
  });

  it('a delivered upsell counts in the month of its delivery, not the month of the call', async () => {
    await deliver(await sale({ created_at: at('2026-11-28T10:00:00Z') }), at('2026-12-02T10:00:00Z'));
    expect(await progress('&month=2026-11')).toMatchObject({ basis: 'delivered', sold: 1, progress: { count: 0 }, daily: [] });
    expect(await progress('&month=2026-12')).toMatchObject({ basis: 'delivered', sold: 0, progress: { count: 1 }, daily: [{ day: '2026-12-02', upsells: 1 }] });
  });

  it('before November 2026 the prime counted sales: a closed month still reads what it paid', async () => {
    const delivered = await sale({ created_at: at('2026-10-10T10:00:00Z') });
    await deliver(delivered, at('2026-10-15T10:00:00Z'));
    const returned = await sale({ created_at: at('2026-10-12T10:00:00Z'), outcome: 'trio', tier: 'trio', offered_total: 4400, extra: 2600 });
    await setOrder(returned, { order_state_group: 'failed', order_state_name: 'Retournée', order_state_at: at('2026-10-20T10:00:00Z') });
    const body = await progress('&month=2026-10');
    expect(body).toMatchObject({ basis: 'sold', sold: 3, progress: { count: 3 }, daily: [{ day: '2026-10-10', upsells: 1 }, { day: '2026-10-12', upsells: 2 }] });
    expect(body.upsells.map((u: { id: string; counts: boolean }) => [u.id, u.counts])).toEqual([[returned, true], [delivered, true]]);
    const c = (await deskGet(ctx, '?action=contributions&month=2026-10', admin)).body;
    expect(c.basis).toBe('sold');
    expect(c.people.find((x: { id: string }) => x.id === linaUser.id).monthly).toMatchObject({ upsells: 3, delivered: null, bonus: { count: 3 } });
    expect((await progress('&month=2026-11')).basis).toBe('delivered');
    expect((await deskGet(ctx, '?action=contributions&month=2026-11', admin)).body.basis).toBe('delivered');
  });

  it('a sale made before November 2026 was paid on the sale: delivered in November, it does not count again', async () => {
    const s = await sara();
    await deliver(await sale({ created_at: at('2026-10-28T10:00:00Z') }), at('2026-11-02T10:00:00Z'));
    // Late October in Algiers (23:30 UTC on 31 October is 1 November): Sara's sale is November's.
    await deliver(await sale({ user_id: s.id, created_at: at('2026-10-31T23:30:00Z') }), at('2026-11-03T10:00:00Z'));
    expect(await progress('&month=2026-10')).toMatchObject({ basis: 'sold', sold: 1, progress: { count: 1 } });
    expect(await progress('&month=2026-11')).toMatchObject({ sold: 0, progress: { count: 0 }, daily: [], upsells: [], upsellsTotal: 0 });
    expect(await progress('&month=2026-11', s.cookie)).toMatchObject({ sold: 1, progress: { count: 1 }, daily: [{ day: '2026-11-03', upsells: 1 }] });
    const c = (await deskGet(ctx, '?action=contributions&month=2026-11', admin)).body;
    expect(c.people.find((x: { id: string }) => x.id === linaUser.id).monthly).toMatchObject({ upsells: 0, delivered: 0, bonus: { count: 0 } });
    expect(c.people.find((x: { id: string }) => x.id === s.id).monthly).toMatchObject({ upsells: 1, delivered: 1, bonus: { count: 1 } });
  });

  it('an order delivered before the call never counts: the add-on was not in that delivery', async () => {
    // Mistyped references: orders already delivered (with their date, or only a state date until the backfill).
    const dated = await sale({ created_at: at('2026-11-21T10:00:00Z') });
    await setOrder(dated, { order_state_group: 'delivered', order_state_name: 'Encaissée', order_state_at: at('2026-11-12T10:00:00Z'), delivered_at: at('2026-11-10T10:00:00Z') });
    const undated = await sale({ created_at: at('2026-11-21T11:00:00Z') });
    await setOrder(undated, { order_state_group: 'delivered', order_state_name: 'Livrée', order_state_at: at('2026-11-15T10:00:00Z') });
    // Saved in December on an order delivered in November: November does not move.
    await deliver(await sale({ created_at: at('2026-12-05T10:00:00Z') }), at('2026-11-20T10:00:00Z'));
    const body = await progress('&month=2026-11');
    expect(body).toMatchObject({ sold: 2, progress: { count: 0 }, daily: [], stateCounts: { delivered: 0, unknown: 2 } });
    expect(body.upsells.map((u: { id: string; counts: boolean; delivered_at: string }) => [u.id, u.counts, u.delivered_at])).toEqual([
      [undated, false, '2026-11-15T10:00:00.000Z'],
      [dated, false, '2026-11-10T10:00:00.000Z'],
    ]);
    expect((await progress('&month=2026-12')).progress.count).toBe(0);
    const c = (await deskGet(ctx, '?action=contributions&month=2026-11', admin)).body;
    expect(c.people.find((x: { id: string }) => x.id === linaUser.id).monthly).toMatchObject({ upsells: 2, delivered: 0, bonus: { count: 0 } });
  });

  it('Algiers midnight: delivered at 23:30 UTC on 30 November counts on 1 December, at 22:59 UTC on 30 November', async () => {
    await deliver(await sale(), at('2026-11-30T23:30:00Z'));
    await deliver(await sale(), at('2026-11-30T22:59:59Z'));
    expect(await progress('&month=2026-11')).toMatchObject({ progress: { count: 1 }, daily: [{ day: '2026-11-30', upsells: 1 }] });
    expect(await progress('&month=2026-12')).toMatchObject({ progress: { count: 1 }, daily: [{ day: '2026-12-01', upsells: 1 }] });
  });

  it('« Encaissée » keeps the delivery date: the upsell stays in the month it was delivered', async () => {
    const id = await sale({ created_at: at('2026-11-20T10:00:00Z') });
    await setOrder(id, { order_state_group: 'delivered', order_state_name: 'Encaissée', order_state_at: at('2026-12-03T09:00:00Z'), delivered_at: at('2026-11-27T19:46:25Z') });
    expect((await progress('&month=2026-11')).progress.count).toBe(1);
    expect((await progress('&month=2026-12')).progress.count).toBe(0);
  });

  it('until the backfill, a delivered call without a delivery date counts on its state date', async () => {
    await setOrder(await sale(), { order_state_group: 'delivered', order_state_name: 'Livrée', order_state_at: at('2026-11-15T09:00:00Z') });
    expect(await progress('&month=2026-11')).toMatchObject({ progress: { count: 1 }, daily: [{ day: '2026-11-15', upsells: 1 }] });
  });

  it('« Retournée » after delivery stops counting, even with a delivery date left behind', async () => {
    const id = await sale();
    await deliver(id, at('2026-11-12T09:00:00Z'));
    expect((await progress('&month=2026-11')).progress.count).toBe(1);
    await setOrder(id, { order_state_group: 'failed', order_state_name: 'Retournée', order_state_at: at('2026-11-16T09:00:00Z'), delivered_at: null });
    expect(await progress('&month=2026-11')).toMatchObject({ progress: { count: 0 }, daily: [], stateCounts: { failed: 1, delivered: 0 } });
    await setOrder(id, { delivered_at: at('2026-11-12T09:00:00Z') });
    expect((await progress('&month=2026-11')).progress.count).toBe(0);
  });

  it('a voided call never counts, and leaves the dossier to the next sale', async () => {
    const voided = await sale({ order_ref: 'TOU8100001', created_at: at('2026-11-05T10:00:00Z') });
    const kept = await sale({ order_ref: 'TOU8100001', created_at: at('2026-11-06T10:00:00Z') });
    const alone = await sale({ order_ref: 'TOU8100002' });
    for (const id of [voided, kept, alone]) await deliver(id, at('2026-11-09T10:00:00Z'));
    await voidCall(voided);
    await voidCall(alone);
    const body = await progress('&month=2026-11');
    expect(body.progress.count).toBe(1);
    expect(body.upsells.map((u: { id: string }) => u.id)).toEqual([kept]);
  });

  it('one sale per dossier: an order delivered once pays once, to the dossier’s first accepted add-on, across months and advisers', async () => {
    const s = await sara();
    // Two accepted add-ons on one order (possible before the save refused the second): Sara's in November comes first.
    await deliver(await sale({ user_id: s.id, order_ref: 'TOU8200001', created_at: at('2026-11-30T10:00:00Z') }), at('2026-12-10T10:00:00Z'));
    const later = await sale({ order_ref: 'tou8200001 ', created_at: at('2026-12-02T10:00:00Z') });
    await deliver(later, at('2026-12-10T10:00:00Z'));
    // Lina's own duplicate within the month: the earlier call is the sale.
    const first = await sale({ order_ref: 'TOU8200002', created_at: at('2026-12-03T10:00:00Z'), outcome: 'trio', tier: 'trio', offered_total: 4400, extra: 2600 });
    const second = await sale({ order_ref: 'TOU8200002', created_at: at('2026-12-04T10:00:00Z') });
    for (const id of [first, second]) await deliver(id, at('2026-12-11T10:00:00Z'));
    expect((await progress('&month=2026-12', s.cookie)).progress.count).toBe(1);
    const lina = await progress('&month=2026-12');
    expect(lina.progress.count).toBe(2);
    expect(lina.upsells.map((u: { id: string; counts: boolean }) => [u.id, u.counts])).toEqual([[first, true], [later, false]]);
  });

  it('« Mes upsells »: her sales of the month and her upsells delivered this month, newest first, with their state; never another adviser’s', async () => {
    const s = await sara();
    const a = await sale({ created_at: at('2026-12-05T10:00:00Z') });
    await deliver(a, at('2026-12-08T10:00:00Z'));
    const b = await sale({ created_at: at('2026-11-29T10:00:00Z'), brand: 'belnco', order_ref: 'BEL8300001', base_id: 'bel-retinol', extra: 1500 });
    await deliver(b, at('2026-12-02T10:00:00Z'), 'Encaissée');
    const c = await sale({ created_at: at('2026-12-18T10:00:00Z') });
    await setOrder(c, { order_state_group: 'shipping', order_state_name: 'En livraison', order_state_at: at('2026-12-19T10:00:00Z') });
    const d = await sale({ created_at: at('2026-12-12T10:00:00Z') });
    await setOrder(d, { order_state_group: 'failed', order_state_name: 'Retournée', order_state_at: at('2026-12-15T10:00:00Z') });
    const h = await sale({ created_at: at('2026-12-03T10:00:00Z') });
    await deliver(h, at('2027-01-01T09:00:00Z'));
    await deliver(await sale({ created_at: at('2026-11-10T10:00:00Z') }), at('2026-11-15T10:00:00Z'));
    await sale({ created_at: at('2026-12-19T10:00:00Z'), outcome: 'initial', offered_total: 1800, extra: 0 });
    await voidCall(await sale({ created_at: at('2026-12-20T10:00:00Z') }));
    await deliver(await sale({ user_id: s.id, created_at: at('2026-12-06T10:00:00Z') }), at('2026-12-09T10:00:00Z'));
    const body = await progress('&month=2026-12');
    expect(body.upsells.map((u: { id: string }) => u.id)).toEqual([c, d, a, h, b]);
    expect(body.upsellsTotal).toBe(5);
    expect(body.progress.count).toBe(2);
    expect(body.upsells.find((u: { id: string }) => u.id === a)).toEqual({
      id: a, created_at: '2026-12-05T10:00:00.000Z', order_ref: expect.stringMatching(/^TOU8/), brand: 'touche', outcome: 'duo', units: 1, extra: 1200,
      order_state_group: 'delivered', order_state_name: 'Livrée', delivered_at: '2026-12-08T10:00:00.000Z', counts: true,
    });
    expect(body.upsells.find((u: { id: string }) => u.id === b)).toMatchObject({ brand: 'belnco', order_ref: 'BEL8300001', extra: 1500, order_state_name: 'Encaissée', counts: true });
    expect(body.upsells.find((u: { id: string }) => u.id === h)).toMatchObject({ order_state_group: 'delivered', delivered_at: '2027-01-01T09:00:00.000Z', counts: false });
    expect(body.upsells.find((u: { id: string }) => u.id === c)).toMatchObject({ order_state_group: 'shipping', order_state_name: 'En livraison', delivered_at: null, counts: false });
    expect(body.upsells.find((u: { id: string }) => u.id === d)).toMatchObject({ order_state_group: 'failed', delivered_at: null, counts: false });
    expect((await progress('&month=2026-12', s.cookie)).upsells).toHaveLength(1);
  });

  it('« Mes upsells » lists the 300 most recent and gives the total', async () => {
    for (let i = 0; i < 301; i++) await sale({ created_at: new Date(Date.UTC(2026, 10, 1, 8) + i * 60_000) });
    const body = await progress('&month=2026-11');
    expect(body.upsells).toHaveLength(300);
    expect(body.upsellsTotal).toBe(301);
    expect(body.upsells[0].created_at).toBe(new Date(Date.UTC(2026, 10, 1, 8) + 300 * 60_000).toISOString());
  });

  it('« Apports & primes » shows sold and delivered per adviser; the prime is computed on delivered, Touché and BEL.NCO alike', async () => {
    const s = await sara();
    await ctx.db.execute(sql`INSERT INTO tc_bonus_rules (month, threshold, rate_dzd, mode, version, updated_by, updated_at)
      VALUES ('2026-12', 2, 45, 'all_month', 1, '', now()) ON CONFLICT (month) DO UPDATE SET mode = 'all_month', threshold = 2, rate_dzd = 45`);
    await deliver(await sale({ created_at: at('2026-12-03T10:00:00Z') }), at('2026-12-06T10:00:00Z'));
    await setOrder(await sale({ created_at: at('2026-12-04T10:00:00Z') }), { order_state_group: 'shipping', order_state_name: 'En livraison', order_state_at: at('2026-12-05T10:00:00Z') });
    await deliver(await sale({ created_at: at('2026-12-07T10:00:00Z'), brand: 'belnco', order_ref: 'BEL8400001', base_id: 'bel-retinol' }), at('2026-12-09T10:00:00Z'));
    await deliver(await sale({ created_at: at('2026-11-30T10:00:00Z') }), at('2026-12-02T10:00:00Z'));
    await sale({ user_id: s.id, created_at: at('2026-12-08T10:00:00Z') });
    for (const query of ['&month=2026-12', '&month=2026-12&from=2026-12-01&to=2026-12-05']) {
      const c = (await deskGet(ctx, '?action=contributions' + query, admin)).body;
      const person = (id: string) => c.people.find((x: { id: string }) => x.id === id);
      expect(person(linaUser.id).monthly, query).toMatchObject({ upsells: 3, delivered: 3, bonus: { count: 3, reached: true, payableCount: 3, estimatedDzd: 135 } });
      expect(person(s.id).monthly, query).toMatchObject({ upsells: 1, delivered: 0, bonus: { count: 0, reached: false, estimatedDzd: 0 } });
    }
  });
});
