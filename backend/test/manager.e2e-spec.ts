import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { algerDay } from '@touche/domain';
import { tcAudit, tcCalls, tcCallMeta, tcSessions, tcUsers } from '../src/db/schema.js';
import { resetPassword } from '../src/cli/reset-password.js';
import { createTestApp, type TestContext } from './support/context.js';
import { resetDatabase, testDatabaseUrl } from './support/database.js';
import { deskGet, deskPost } from './support/desk.js';
import { createUser, loginCookie } from './support/users.js';
import { insertCall } from './support/calls.js';

const PASSWORD = 'manager-test-2026';
let ctx: TestContext;
let admin: string, manager: string, advisor: string;
let adminId: string, managerId: string, advisorId: string;
const post = (body: unknown, cookie = manager) => deskPost(ctx, body, { cookie });
const settings = (id: string, role = 'advisor') => ({ action: 'user-settings', id, label: 'Compte test', team: 'Alger', active: true, reporting_scope: 'own', role });
beforeAll(async () => { ctx = await createTestApp({ accountPasswordKey: randomBytes(32).toString('hex') }); });
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx.db);
  adminId = (await createUser(ctx.db, { username: 'direction', label: 'Direction Touché', password: PASSWORD, role: 'admin' })).id;
  admin = await loginCookie(ctx, 'direction', PASSWORD);
  for (const [username, role] of [['manager.test', 'manager'], ['advisor.test', 'advisor']]) {
    expect((await post({ action: 'user', username, label: username, password: PASSWORD, role }, admin)).status).toBe(200);
  }
  managerId = (await ctx.db.select().from(tcUsers).where(eq(tcUsers.username, 'manager.test')))[0]!.id;
  advisorId = (await ctx.db.select().from(tcUsers).where(eq(tcUsers.username, 'advisor.test')))[0]!.id;
  manager = await loginCookie(ctx, 'manager.test', PASSWORD);
  advisor = await loginCookie(ctx, 'advisor.test', PASSWORD);
});

describe('manager role', () => {
  it('sees all management data and can use catalogue, protocol, bonuses and reminders', async () => {
    const id = await insertCall(ctx.db, { user_id: advisorId, created_at: new Date('2026-11-17T10:00:00Z') });
    await ctx.db.update(tcCallMeta).set({ callback_at: new Date('2026-11-18T10:00:00Z') }).where(eq(tcCallMeta.call_id, id));
    const bootstrap = await deskGet(ctx, '', manager);
    expect(bootstrap.status).toBe(200);
    expect(bootstrap.body.user.role).toBe('manager');
    expect(bootstrap.body.users).toHaveLength(3);
    expect(bootstrap.body.calls.map((c: { id: string }) => c.id)).toContain(id);
    expect(bootstrap.body.password_viewing_enabled).toBe(true);
    expect(JSON.stringify(bootstrap.body)).not.toContain('password_hash');
    expect(JSON.stringify(bootstrap.body)).not.toContain('password_ciphertext');
    const report = await deskGet(ctx, '?action=analytics&from=2026-11-01&to=2026-11-30', manager);
    expect(report.status).toBe(200);
    expect(report.body.calls.map((c: { id: string }) => c.id)).toContain(id);
    expect((await deskGet(ctx, '?action=audit', manager)).status).toBe(200);
    const month = algerDay().slice(0, 7);
    const contributions = await deskGet(ctx, '?action=contributions&month=' + month, manager);
    expect(contributions.status).toBe(200);
    expect((await post({ action: 'bonus-rule', month, threshold: 60, rateDzd: 45, mode: 'pending', confirmed: true, expectedVersion: contributions.body.monthRuleVersion })).status).toBe(200);
    expect((await post({ action: 'product', product: { ...bootstrap.body.products[0], price: 1850 } })).status).toBe(200);
    expect((await post({ action: 'clinical', validated: true, by: 'Test responsable' })).status).toBe(200);
    expect((await deskGet(ctx, '?action=reminders', manager)).status).toBe(200);
    expect((await post({ action: 'complete-reminder', callId: id })).status).toBe(200);
  });

  it('cannot change Direction access, credentials, role, or delete it', async () => {
    const [before] = await ctx.db.select().from(tcUsers).where(eq(tcUsers.id, adminId));
    const base = { ...settings(adminId), role: undefined };
    for (const body of [base, { ...base, active: false }, settings(adminId, 'manager'),
      { action: 'reset-user', id: adminId, password: 'replacement' },
      { action: 'user-password', id: adminId, adminPassword: PASSWORD },
      { action: 'remove-user', id: adminId }]) {
      expect((await post(body)).status).toBe(403);
    }
    expect((await post({ action: 'password', id: adminId, current: PASSWORD, next: 'replacement' })).status).toBe(400);
    expect((await ctx.db.select().from(tcUsers).where(eq(tcUsers.id, adminId)))[0]).toEqual(before);
    expect((await deskGet(ctx, '', admin)).status).toBe(200);
  });

  it('cannot create or promote a Direction account', async () => {
    expect((await post({ action: 'user', username: 'forged.admin', label: 'Fake direction', password: PASSWORD, role: 'admin' })).status).toBe(400);
    expect((await post(settings(advisorId, 'admin'))).status).toBe(400);
    expect((await post(settings(managerId, 'admin'))).status).toBe(400);
    expect((await ctx.db.select().from(tcUsers).where(eq(tcUsers.role, 'admin')))).toHaveLength(1);
  });

  it('can create advisors and managers and promote an advisor; old sessions are revoked', async () => {
    for (const role of ['advisor', 'manager']) {
      expect((await post({ action: 'user', username: 'new.' + role, label: 'New ' + role, password: PASSWORD, role })).status).toBe(200);
      const cookie = await loginCookie(ctx, 'new.' + role, PASSWORD);
      expect((await deskGet(ctx, '', cookie)).body.user.role).toBe(role);
    }
    expect((await post(settings(advisorId, 'manager'))).status).toBe(200);
    expect((await deskGet(ctx, '', advisor)).status).toBe(401);
    const promoted = await loginCookie(ctx, 'advisor.test', PASSWORD);
    expect((await deskGet(ctx, '?action=audit', promoted)).status).toBe(200);
  });

  it('Direction can demote a manager and revoke management access immediately', async () => {
    expect((await post(settings(managerId), admin)).status).toBe(200);
    expect((await deskGet(ctx, '?action=audit', manager)).status).toBe(401);
    const demoted = await loginCookie(ctx, 'manager.test', PASSWORD);
    expect((await deskGet(ctx, '?action=audit', demoted)).status).toBe(403);
    expect((await post({ action: 'user', username: 'forged.user', label: 'Fake', password: PASSWORD }, demoted)).status).toBe(403);
  });

  it('can view and replace non-Direction passwords, with its own password confirmation', async () => {
    expect((await post({ action: 'user-password', id: advisorId, adminPassword: 'wrong' })).status).toBe(403);
    expect((await post({ action: 'user-password', id: advisorId, adminPassword: PASSWORD })).body).toEqual({ password: PASSWORD });
    expect((await post({ action: 'reset-user', id: advisorId, password: 'new-password' })).status).toBe(200);
    expect((await deskGet(ctx, '', advisor)).status).toBe(401);
    expect((await post({ action: 'user-password', id: advisorId, adminPassword: PASSWORD })).body).toEqual({ password: 'new-password' });
    expect((await post({ action: 'password', current: PASSWORD, next: 'manager-new' })).status).toBe(200);
    expect((await post({ action: 'user-password', id: managerId, adminPassword: PASSWORD }, admin)).body).toEqual({ password: 'manager-new' });
  });

  it('cannot remove its own access or use advisor credentials to manage accounts', async () => {
    expect((await post({ ...settings(managerId, 'manager'), active: false })).status).toBe(403);
    expect((await post(settings(managerId))).status).toBe(403);
    for (const body of [settings(managerId), { action: 'reset-user', id: managerId, password: 'new' },
      { action: 'remove-user', id: managerId }, { action: 'user-password', id: adminId, adminPassword: PASSWORD }]) {
      expect((await post(body, advisor)).status).toBe(403);
    }
  });
});

describe('remove user', () => {
  it.each(['admin', 'manager'])('%s removes an account and sessions while retaining historical results', async role => {
    const cookie = role === 'admin' ? admin : manager;
    const callId = await insertCall(ctx.db, { user_id: advisorId, operator: 'advisor.test', created_at: new Date('2026-11-17T10:00:00Z') });
    const prior = (await deskGet(ctx, '?action=contributions&month=2026-11', cookie)).body.people.find((p: { id: string }) => p.id === advisorId);
    expect((await post({ action: 'remove-user', id: advisorId }, cookie)).status).toBe(200);
    const [removed] = await ctx.db.select().from(tcUsers).where(eq(tcUsers.id, advisorId));
    expect(removed!.active).toBe(0);
    expect(removed!.deleted_at).toBeInstanceOf(Date);
    expect(removed!.password_ciphertext).toBeNull();
    expect(await ctx.db.select().from(tcSessions).where(eq(tcSessions.user_id, advisorId))).toEqual([]);
    expect((await deskGet(ctx, '', advisor)).status).toBe(401);
    expect((await post({ action: 'login', username: 'advisor.test', password: PASSWORD })).status).toBe(401);
    const bootstrap = await deskGet(ctx, '', cookie);
    expect(bootstrap.body.users.some((u: { id: string }) => u.id === advisorId)).toBe(false);
    expect(await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, callId))).toHaveLength(1);
    const historical = (await deskGet(ctx, '?action=contributions&month=2026-11', cookie)).body.people.find((p: { id: string }) => p.id === advisorId);
    expect(historical.monthly).toEqual(prior.monthly);
    expect(historical.period).toEqual(prior.period);
    const [audit] = await ctx.db.select().from(tcAudit).where(eq(tcAudit.action, 'account.removed'));
    expect(audit!.target).toBe(advisorId);
    expect(JSON.stringify(audit)).not.toContain(PASSWORD);
    for (const body of [settings(advisorId), { action: 'reset-user', id: advisorId, password: 'new' },
      { action: 'user-password', id: advisorId, adminPassword: PASSWORD }, { action: 'remove-user', id: advisorId }]) {
      expect((await post(body, cookie)).status).toBe(404);
    }
    await expect(resetPassword(testDatabaseUrl(), 'advisor.test')).rejects.toThrow('Compte introuvable');
  });

  it('Direction can remove a manager, but Direction and self-deletion are protected', async () => {
    expect((await post({ action: 'remove-user', id: managerId })).status).toBe(403);
    expect((await post({ action: 'remove-user', id: adminId }, admin)).status).toBe(403);
    expect((await post({ action: 'remove-user', id: managerId }, admin)).status).toBe(200);
    expect((await deskGet(ctx, '?action=audit', manager)).status).toBe(401);
  });
});
