import { randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { algerDay } from '@touche/domain';
import { tcAudit, tcCallMeta, tcUsers } from '../src/db/schema.js';
import { createTestApp, type TestContext } from './support/context.js';
import { resetDatabase } from './support/database.js';
import { deskGet, deskPost } from './support/desk.js';
import { createUser, loginCookie } from './support/users.js';
import { insertCall } from './support/calls.js';

const PASSWORD = 'cm-role-test-2026';
let ctx: TestContext;
let admin: string, manager: string;
let advisorId: string;
const post = (body: unknown, cookie = manager) => deskPost(ctx, body, { cookie });
const createCm = (username = 'cm.lina', cookie = admin, role = 'cm') =>
  post({ action: 'user', username, label: 'Lina CM', password: PASSWORD, role }, cookie);
const settings = (id: string, role: string, reporting_scope = 'own') => ({ action: 'user-settings', id, label: 'Compte test', team: 'Alger', active: true, reporting_scope, role });
const roleOf = async (username: string) => (await ctx.db.select().from(tcUsers).where(eq(tcUsers.username, username)))[0]?.role;
beforeAll(async () => { ctx = await createTestApp({ accountPasswordKey: randomBytes(32).toString('hex') }); });
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx.db);
  await createUser(ctx.db, { username: 'direction', label: 'Direction Touché', password: PASSWORD, role: 'admin' });
  admin = await loginCookie(ctx, 'direction', PASSWORD);
  for (const [username, role] of [['manager.test', 'manager'], ['advisor.test', 'advisor']]) {
    expect((await post({ action: 'user', username, label: username, password: PASSWORD, role }, admin)).status).toBe(200);
  }
  advisorId = (await ctx.db.select().from(tcUsers).where(eq(tcUsers.username, 'advisor.test')))[0]!.id;
  manager = await loginCookie(ctx, 'manager.test', PASSWORD);
});

describe('cm role', () => {
  it('direction creates a CM', async () => {
    expect((await createCm()).status).toBe(200);
    expect(await roleOf('cm.lina')).toBe('cm');
    const [audit] = await ctx.db.select().from(tcAudit)
      .where(and(eq(tcAudit.action, 'account.created'), eq(tcAudit.target, 'cm.lina')));
    expect(audit?.detail).toEqual({ role: 'cm' });
  });

  it('manager creates a CM', async () => {
    expect((await createCm('cm.sara', manager)).status).toBe(200);
    expect(await roleOf('cm.sara')).toBe('cm');
  });

  it('a CM has call-center access only', async () => {
    await createCm();
    const cmId = (await ctx.db.select().from(tcUsers).where(eq(tcUsers.username, 'cm.lina')))[0]!.id;
    const cm = await loginCookie(ctx, 'cm.lina', PASSWORD);
    await insertCall(ctx.db, { user_id: cmId, created_at: new Date(), order_ref: 'CM-OWN' });
    await insertCall(ctx.db, { user_id: advisorId, created_at: new Date(), order_ref: 'AD-OTHER' });
    const bootstrap = await deskGet(ctx, '', cm);
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.body.user.role).toBe('cm');
    // Like an advisor, a CM gets no workspace-wide calls or accounts, only their own progress.
    expect(bootstrap.body.calls).toEqual([]);
    expect(bootstrap.body.users).toEqual([]);
    expect((await deskGet(ctx, '?action=my-progress', cm)).body.sold).toBe(1);
    expect((await deskGet(ctx, '?action=audit', cm)).status).toBe(403);
    expect((await post({ action: 'user', username: 'x.y', label: 'X', password: PASSWORD, role: 'advisor' }, cm)).status).toBe(403);
  });

  it("a CM's upsells count toward the bonus like an advisor's", async () => {
    await createCm();
    const cmId = (await ctx.db.select().from(tcUsers).where(eq(tcUsers.username, 'cm.lina')))[0]!.id;
    const month = algerDay().slice(0, 7);
    await ctx.db.execute(sql`INSERT INTO tc_bonus_rules (month, threshold, rate_dzd, mode, version, updated_by, updated_at)
      VALUES (${month}, 2, 45, 'all_month', 1, '', now()) ON CONFLICT (month) DO UPDATE SET mode = 'all_month', threshold = 2, rate_dzd = 45`);
    for (const [id, tag] of [[cmId, 'CM'], [advisorId, 'AD']] as const) {
      for (let i = 0; i < 2; i++) {
        const call = await insertCall(ctx.db, { user_id: id, created_at: new Date(), outcome: 'duo', offered_total: 3000, extra: 1200, order_ref: `${tag}${i}` });
        // The prime counts delivered upsells.
        await ctx.db.update(tcCallMeta).set({ order_check: 'verified', order_state_group: 'delivered', order_state_name: 'Livrée', order_state_at: new Date(), delivered_at: new Date() }).where(eq(tcCallMeta.call_id, call));
      }
    }
    const { body } = await deskGet(ctx, '?action=contributions&month=' + month, admin);
    const line = (id: string) => body.people.find((p: { id: string }) => p.id === id).monthly;
    expect(line(cmId).upsells).toBeGreaterThan(0);
    expect(line(cmId).upsells).toBe(line(advisorId).upsells);
    expect(line(cmId).delivered).toBe(2);
    expect(line(cmId).bonus).toMatchObject({ count: 2, reached: true, estimatedDzd: 90 });
    expect(line(cmId).bonus).toEqual(line(advisorId).bonus);
  });

  it('roles can be changed', async () => {
    expect((await post(settings(advisorId, 'cm'))).status).toBe(200);
    expect(await roleOf('advisor.test')).toBe('cm');
    expect((await post(settings(advisorId, 'manager', 'team'))).status).toBe(200);
    expect(await roleOf('advisor.test')).toBe('manager');
    expect((await post(settings(advisorId, 'cm'))).status).toBe(200);
    expect((await post(settings(advisorId, 'cm', 'team'))).status).toBe(400);
    expect(await roleOf('advisor.test')).toBe('cm');
  });

  it('rejects unknown roles', async () => {
    expect((await createCm('bad.one', admin, 'CM')).status).toBe(400);
    expect((await createCm('bad.two', admin, 'superuser')).status).toBe(400);
    expect(await roleOf('bad.one')).toBeUndefined();
    expect(await roleOf('bad.two')).toBeUndefined();
  });
});
