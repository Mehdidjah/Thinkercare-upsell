import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { failureMessage, resetPassword, resetPasswordReport } from '../src/cli/reset-password.js';
import { tcAudit, tcSessions, tcUsers } from '../src/db/schema.js';
import { type TestContext, createTestApp } from './support/context.js';
import { resetDatabase, testDatabaseUrl } from './support/database.js';
import { deskGet, deskPost } from './support/desk.js';
import { createUser, loginCookie } from './support/users.js';

const OLD_PASSWORD = 'ancien-mot-de-passe-2026';
const USAGE =
  'Usage: node backend/dist/cli/reset-password.js <identifiant>. Identifiant de 3 à 40 caractères (a-z, 0-9, . _ -).';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(() => resetDatabase(ctx.db));

const login = (username: string, password: string) =>
  deskPost(ctx, { action: 'login', username, password });
const userRow = async (username: string) =>
  (await ctx.db.select().from(tcUsers).where(eq(tcUsers.username, username)))[0]!;
const resetAudits = () =>
  ctx.db.select().from(tcAudit).where(eq(tcAudit.action, 'account.password_reset'));

async function expectFullReset(username: string, role: 'admin' | 'advisor') {
  const user = await createUser(ctx.db, { username, password: OLD_PASSWORD, role });
  await createUser(ctx.db, { username: 'conseil.temoin', password: OLD_PASSWORD, role: 'advisor' });
  const cookie = await loginCookie(ctx, username, OLD_PASSWORD);
  const bystander = await loginCookie(ctx, 'conseil.temoin', OLD_PASSWORD);
  const before = await userRow(username);
  const bystanderBefore = await userRow('conseil.temoin');

  const result = await resetPassword(testDatabaseUrl(), username);

  expect(result).toEqual({ username, password: result.password, active: true });
  expect(result.password).toMatch(/^[A-Za-z0-9_-]{32}$/);
  expect((await login(username, result.password)).status).toBe(200);
  expect((await login(username, OLD_PASSWORD)).status).toBe(401);
  expect((await deskGet(ctx, '', cookie)).status).toBe(401);
  expect((await deskGet(ctx, '', bystander)).status).toBe(200);
  // Only the target account changes: the other account keeps its exact row and its password.
  expect(await userRow('conseil.temoin')).toEqual(bystanderBefore);
  expect((await login('conseil.temoin', OLD_PASSWORD)).status).toBe(200);

  const after = await userRow(username);
  expect(after.salt).toMatch(/^[a-f0-9]{32}$/);
  expect(after.password_hash).toMatch(/^[a-f0-9]{64}$/);
  expect(after.salt).not.toBe(before.salt);
  expect(after.password_hash).not.toBe(before.password_hash);
  for (const plain of [result.password, OLD_PASSWORD]) {
    expect(after.password_hash).not.toBe(plain);
    expect(after.salt).not.toBe(plain);
  }
  expect(after.role).toBe(role);
  expect(after.active).toBe(1);

  const audits = await resetAudits();
  expect(audits).toHaveLength(1);
  expect(audits[0]).toMatchObject({ user_id: 'cli', target: user.id, detail: { via: 'cli' } });
  expect(JSON.stringify(audits[0])).not.toContain(result.password);
}

describe('reset-password', () => {
  it('resets an adviser: new password works, old password and open sessions are refused, audit row written', async () => {
    await expectFullReset('lynda', 'advisor');
  });

  it('resets the direction (admin) account the same way', async () => {
    await expectFullReset('direction', 'admin');
  });

  it('rejects an unknown username and changes nothing', async () => {
    await createUser(ctx.db, { username: 'lynda', password: OLD_PASSWORD, role: 'advisor' });
    const cookie = await loginCookie(ctx, 'lynda', OLD_PASSWORD);
    const before = await userRow('lynda');

    await expect(resetPassword(testDatabaseUrl(), 'nobody')).rejects.toThrow(
      'Compte introuvable : nobody',
    );

    expect(await resetAudits()).toHaveLength(0);
    expect(await ctx.db.select().from(tcAudit)).toHaveLength(0);
    expect(await userRow('lynda')).toEqual(before);
    expect(await ctx.db.select().from(tcSessions)).toHaveLength(1);
    expect((await deskGet(ctx, '', cookie)).status).toBe(200);
  });

  it('rejects an invalid username with the usage message', async () => {
    await expect(resetPassword(testDatabaseUrl(), 'A!')).rejects.toThrow(USAGE);
    await expect(resetPassword(testDatabaseUrl(), '')).rejects.toThrow(USAGE);
    await expect(resetPassword(testDatabaseUrl(), 'x'.repeat(41))).rejects.toThrow(USAGE);
    expect(await ctx.db.select().from(tcAudit)).toHaveLength(0);
  });

  it('resets an inactive account without reactivating it', async () => {
    const user = await createUser(ctx.db, {
      username: 'dormant',
      password: OLD_PASSWORD,
      role: 'advisor',
      active: 0,
    });
    const before = await userRow('dormant');

    const result = await resetPassword(testDatabaseUrl(), 'dormant');

    expect(result.active).toBe(false);
    expect(result.password).toHaveLength(32);
    const after = await userRow('dormant');
    expect(after.active).toBe(0);
    expect(after.password_hash).not.toBe(before.password_hash);
    expect((await login('dormant', result.password)).status).toBe(401);
    const audits = await resetAudits();
    expect(audits).toHaveLength(1);
    expect(audits[0]!.target).toBe(user.id);
  });

  it('changes nothing when a step fails, and the error shows the cause but not the hash or salt', async () => {
    await createUser(ctx.db, { username: 'lynda', password: OLD_PASSWORD, role: 'advisor' });
    const cookie = await loginCookie(ctx, 'lynda', OLD_PASSWORD);
    const before = await userRow('lynda');
    await ctx.db.execute(sql`
      CREATE FUNCTION tc_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'panne simulée'; END $$`);
    await ctx.db.execute(
      sql`CREATE TRIGGER tc_test_fail BEFORE INSERT ON tc_audit FOR EACH ROW EXECUTE FUNCTION tc_test_fail()`,
    );
    try {
      const error = await resetPassword(testDatabaseUrl(), 'lynda').catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(failureMessage(error)).toBe('panne simulée');
    } finally {
      await ctx.db.execute(sql`DROP TRIGGER tc_test_fail ON tc_audit`);
      await ctx.db.execute(sql`DROP FUNCTION tc_test_fail()`);
    }

    expect(await userRow('lynda')).toEqual(before);
    expect(await ctx.db.select().from(tcSessions)).toHaveLength(1);
    expect(await ctx.db.select().from(tcAudit)).toHaveLength(0);
    expect((await deskGet(ctx, '', cookie)).status).toBe(200);
    expect((await login('lynda', OLD_PASSWORD)).status).toBe(200);
  });

  it('prints plain error messages as they are', () => {
    expect(failureMessage(new Error('Compte introuvable : nobody'))).toBe(
      'Compte introuvable : nobody',
    );
    expect(failureMessage('texte')).toBe('texte');
  });

  it('normalises case and surrounding spaces in the username', async () => {
    await createUser(ctx.db, { username: 'lynda', password: OLD_PASSWORD, role: 'advisor' });

    const result = await resetPassword(testDatabaseUrl(), '  Lynda ');

    expect(result.username).toBe('lynda');
    expect((await login('lynda', result.password)).status).toBe(200);
  });
});

describe('reset-password report', () => {
  const done =
    'Toutes les sessions ouvertes de ce compte ont été fermées. Communiquez ce mot de passe de façon sûre et changez-le après connexion (Mon compte).';

  it('prints the account, the new password and the session notice', () => {
    expect(resetPasswordReport({ username: 'lynda', password: 'p'.repeat(32), active: true })).toBe(
      ['Compte : lynda', `Nouveau mot de passe : ${'p'.repeat(32)}`, done].join('\n'),
    );
  });

  it('adds a warning when the account is inactive', () => {
    expect(
      resetPasswordReport({ username: 'dormant', password: 'q'.repeat(32), active: false }),
    ).toBe(
      [
        'Compte : dormant',
        `Nouveau mot de passe : ${'q'.repeat(32)}`,
        done,
        'Attention : ce compte est désactivé. Réactivez-le dans Gestion pour qu’il puisse se connecter.',
      ].join('\n'),
    );
  });
});
