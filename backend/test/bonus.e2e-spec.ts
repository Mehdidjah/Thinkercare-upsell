import { and, eq, sql } from 'drizzle-orm';
import { algerDay } from '@touche/domain';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tcAudit, tcBonusRules } from '../src/db/schema.js';
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

describe('commission progress', () => {
  it('my-progress counts one upsell per accepted duo or trio with a positive extra', async () => {
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
    expect(body.progress.count).toBe(2);
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
    expect(body.progress.count).toBe(1);
    expect(body.duplicateExcluded).toBe(1);
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
    expect((await progress('&month=2026-11')).progress.count).toBe(0);
    expect((await progress('&month=2026-12')).progress.count).toBe(1);
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
    await insertCall(ctx.db, {
      user_id: linaUser.id,
      created_at: now(),
      order_ref: 'N1',
    });
    const body = await progress();
    expect(typeof body.progress.count).toBe('number');
    expect(typeof body.daily[0].upsells).toBe('number');
    const c = (await deskGet(ctx, '?action=contributions', admin)).body;
    const p = c.people.find((x: { id: string }) => x.id === linaUser.id);
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
    expect((await progress('', saraCookie)).progress.count).toBe(1);
    const lina2 = await progress();
    expect(lina2.progress.count).toBe(0);
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
    expect((await progress()).progress.count).toBe(1);
    expect((await progress('', saraCookie)).progress.count).toBe(0);
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
    await insertCall(ctx.db, {
      user_id: adminUser.id,
      created_at: now(),
      order_ref: 'ADM',
    });
    const c = (await deskGet(ctx, '?action=contributions', admin)).body;
    const a = c.people.find((x: { id: string }) => x.id === adminUser.id);
    expect(a).toBeDefined();
    expect(a.monthly.upsells).toBe(1);
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
      error: 'Cette règle a changé. Actualisez avant de l’enregistrer.',
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
    for (let i = 0; i < 60; i++) {
      await insertCall(ctx.db, {
        user_id: linaUser.id,
        created_at: now(),
        order_ref: `M${i}`,
      });
    }
    const body = await progress();
    expect(body.progress.estimatedDzd).toBe(2700);
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
