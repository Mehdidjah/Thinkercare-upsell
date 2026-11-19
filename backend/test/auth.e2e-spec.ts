import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256Hex } from '../src/auth/crypto.js';
import { tcSessions, tcThrottle, tcUsers } from '../src/db/schema.js';
import { type TestContext, createTestApp } from './support/context.js';
import { resetDatabase } from './support/database.js';
import { deskGet, deskPost } from './support/desk.js';
import { createUser, loginCookie } from './support/users.js';

const USER = 'direction';
const PASSWORD = 'mot-de-passe-solide-2026';
const BAD = { error: 'Identifiant ou mot de passe incorrect.' };

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx.db);
  await createUser(ctx.db, { username: USER, password: PASSWORD, role: 'admin' });
});

const login = (username: string, password: string, ip?: string) =>
  deskPost(ctx, { action: 'login', username, password }, { ip });

describe('login', () => {
  it('login sets the exact session cookie', async () => {
    const res = await login(USER, PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['set-cookie']![0]).toMatch(
      /^__Host-touche-session=[a-f0-9]{64}; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=28800$/,
    );
  });
  it('the database stores a hash of the token, not the token', async () => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    const token = cookie.split('=')[1]!;
    const rows = await ctx.db.select().from(tcSessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.token_hash).toBe(sha256Hex(token));
    expect(rows[0]!.token_hash).not.toBe(token);
  });
  it('username is trimmed and lower-cased', async () => {
    expect((await login('  DIRECTION ', PASSWORD)).status).toBe(200);
  });
  it('wrong password is 401', async () => {
    const res = await login(USER, 'faux');
    expect(res.status).toBe(401);
    expect(res.body).toEqual(BAD);
  });
  it('unknown user gets the same 401', async () => {
    const res = await login('inconnu', PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(BAD);
  });
  it('a NUL character in the username is an unknown user, still throttled', async () => {
    const res = await login(USER + '\u0000', PASSWORD, '198.51.100.9');
    expect(res.status).toBe(401);
    expect(res.body).toEqual(BAD);
    expect((await ctx.db.select().from(tcThrottle)).map((t) => t.count)).toEqual([1]);
  });
  it('inactive account cannot log in', async () => {
    await createUser(ctx.db, { username: 'dormant', password: PASSWORD, role: 'advisor', active: 0 });
    const res = await login('dormant', PASSWORD);
    expect(res.status).toBe(401);
    expect(res.body).toEqual(BAD);
  });
  it('a deactivated account loses its live session', async () => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    await ctx.db.execute(sql`UPDATE tc_users SET active = 0 WHERE username = ${USER}`);
    expect((await deskGet(ctx, '', cookie)).status).toBe(401);
  });
  it('an expired session is rejected', async () => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    await ctx.db.execute(sql`UPDATE tc_sessions SET expires_at = now() - interval '1 minute'`);
    expect((await deskGet(ctx, '', cookie)).status).toBe(401);
  });
  it('the 21st attempt from one IP in 15 minutes is 429', async () => {
    for (let i = 0; i < 20; i++) {
      const res = await login(USER, 'faux', '198.51.100.7');
      expect(res.status).toBe(401);
    }
    const res = await login(USER, 'faux', '198.51.100.7');
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
  });
  it('throttle buckets are per client IP', async () => {
    for (let i = 0; i < 21; i++) await login(USER, 'faux', '198.51.100.7');
    expect((await login(USER, PASSWORD, '198.51.100.8')).status).toBe(200);
  });
  it('an account with a legacy hash logs in', async () => {
    await ctx.db.insert(tcUsers).values({
      id: randomUUID(),
      username: 'ancien',
      label: 'Ancien',
      role: 'advisor',
      salt: '0123456789abcdef0123456789abcdef',
      password_hash: '7baf5bc003348084535b2583042d7c16d0829cb3c960f350c50ebf60ddbbf480',
    });
    expect((await login('ancien', 'Touché-2026-direction!')).status).toBe(200);
  });
});

describe('logout and password', () => {
  it.each(['advisor', 'manager', 'admin'] as const)('logout revokes a %s session and clears the cookie', async (role) => {
    await ctx.db.update(tcUsers).set({ role }).where(eq(tcUsers.username, USER));
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    const res = await deskPost(ctx, { action: 'logout' }, { cookie });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['set-cookie']![0]).toBe(
      '__Host-touche-session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    );
    expect(await ctx.db.select().from(tcSessions).where(eq(tcSessions.token_hash, sha256Hex(cookie.split('=')[1]!)))).toHaveLength(0);
    expect((await deskGet(ctx, '', cookie)).status).toBe(401);
  });
  it('password change requires the current password', async () => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    const res = await deskPost(ctx, { action: 'password', current: 'faux', next: 'un-nouveau-mot-de-passe' }, { cookie });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Mot de passe actuel incorrect.' });
  });
  it('a one-character password can be saved and used to log in', async () => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    const res = await deskPost(ctx, { action: 'password', current: PASSWORD, next: 'x' }, { cookie });
    expect(res.status).toBe(200);
    expect((await login(USER, 'x')).status).toBe(200);
    expect((await login(USER, PASSWORD)).status).toBe(401);
  });
  it.each(['', 'x'.repeat(201)])('rejects an empty or oversized new password', async next => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    const res = await deskPost(ctx, { action: 'password', current: PASSWORD, next }, { cookie });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/^Vérifiez les champs du formulaire : /);
    expect((await login(USER, PASSWORD)).status).toBe(200);
  });
  it('password change revokes other sessions only', async () => {
    const a = await loginCookie(ctx, USER, PASSWORD);
    const b = await loginCookie(ctx, USER, PASSWORD);
    const next = 'un-nouveau-mot-de-passe';
    const res = await deskPost(ctx, { action: 'password', current: PASSWORD, next }, { cookie: a });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(await ctx.db.select().from(tcSessions)).toHaveLength(1);
    expect((await deskPost(ctx, { action: 'password', current: next, next: PASSWORD }, { cookie: b })).status).toBe(401);
    expect((await deskPost(ctx, { action: 'nope' }, { cookie: a })).status).toBe(400);
    expect((await login(USER, PASSWORD)).status).toBe(401);
    expect((await login(USER, next)).status).toBe(200);
  });
});

describe('signing out without a live session', () => {
  it.each([
    ['an ended session', 'revoked'],
    ['no cookie at all', ''],
  ])('logout with %s answers 200 and clears the cookie', async (_name, kind) => {
    let cookie = '';
    if (kind === 'revoked') {
      cookie = await loginCookie(ctx, USER, PASSWORD);
      await ctx.db.delete(tcSessions);
    }
    const res = await deskPost(ctx, { action: 'logout' }, { cookie });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['set-cookie']![0]).toBe(
      '__Host-touche-session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    );
  });
  it('any other action without a session is still 401', async () => {
    const res = await deskPost(ctx, { action: 'password', current: 'a', next: 'b' });
    expect(res.status).toBe(401);
  });
});

describe('account check on writes (expectedUserId)', () => {
  const CHANGED = {
    error: 'Ce poste est maintenant connecté avec un autre compte. Rechargez la page pour continuer avec ce compte.',
    code: 'account-changed',
  };
  it('a write sent for another account is 409 and changes nothing', async () => {
    const other = await createUser(ctx.db, { username: 'conseil.lina', password: PASSWORD, role: 'advisor' });
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    const res = await deskPost(ctx, { action: 'password', current: PASSWORD, next: 'nouveau', expectedUserId: other.id }, { cookie });
    expect(res.status).toBe(409);
    expect(res.body).toEqual(CHANGED);
    expect((await login(USER, PASSWORD)).status).toBe(200);
    const signedOut = await deskPost(ctx, { action: 'logout', expectedUserId: other.id }, { cookie });
    expect(signedOut.status).toBe(409);
    expect(signedOut.body).toEqual(CHANGED);
    expect((await deskGet(ctx, '', cookie)).status).toBe(200);
  });
  it('the signed-in account id is accepted on any action, and old clients may omit it', async () => {
    const [me] = await ctx.db.select().from(tcUsers).where(eq(tcUsers.username, USER));
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    const res = await deskPost(ctx, { action: 'password', current: PASSWORD, next: 'nouveau', expectedUserId: me!.id }, { cookie });
    expect(res.status).toBe(200);
    const unknown = await deskPost(ctx, { action: 'nope', expectedUserId: me!.id }, { cookie });
    expect(unknown.status).toBe(400);
    expect(unknown.body).toEqual({ error: 'Action inconnue.' });
    expect((await deskPost(ctx, { action: 'logout', expectedUserId: me!.id }, { cookie })).status).toBe(200);
  });
  it.each([42, null, 'x'.repeat(65)])('a malformed expectedUserId (%s) is 400', async (expectedUserId) => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    const res = await deskPost(ctx, { action: 'logout', expectedUserId }, { cookie });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Données invalides.' });
  });
  it('login does not take expectedUserId', async () => {
    const res = await deskPost(ctx, { action: 'login', username: USER, password: PASSWORD, expectedUserId: 'x' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Vérifiez les champs du formulaire : Requête — champ non pris en charge.' });
  });
});
