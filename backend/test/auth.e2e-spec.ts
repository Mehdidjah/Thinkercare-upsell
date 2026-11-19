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
  it('login sets the exact session cookie and records the sign-in time', async () => {
    const res = await login(USER, PASSWORD);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['set-cookie']![0]).toMatch(
      /^__Host-touche-session=[a-f0-9]{64}; HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=28800$/,
    );
    const [session] = await ctx.db.select().from(tcSessions);
    expect(session!.expires_at.getTime() - session!.created_at!.getTime()).toBe(28_800_000);
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
    expect((await ctx.db.select().from(tcThrottle)).map((t) => t.count)).toEqual([1, 1]);
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
});

describe('login throttle (F6)', () => {
  const IP = '198.51.100.7';
  const WAIT = { error: 'Trop de tentatives. Réessayez dans 15 minutes.' };
  const fail = async (username: string, times: number, ip = IP) => {
    for (let i = 0; i < times; i++) expect((await login(username, 'faux', ip)).status).toBe(401);
  };

  it('ten failures for one identifier from one address lock it for the rest of the window', async () => {
    await fail(USER, 10);
    const res = await login(USER, 'faux', IP);
    expect(res.status).toBe(429);
    expect(res.body).toEqual(WAIT);
    expect((await login(USER, PASSWORD, IP)).status).toBe(429);
    expect((await login('  Direction ', PASSWORD, IP)).status).toBe(429);
    expect((await login('quelquun', 'faux', IP)).status).toBe(401);
    expect((await login(USER, PASSWORD, '198.51.100.8')).status).toBe(200);
  });
  it('successful sign-ins are never counted: one office address serves everyone', async () => {
    await createUser(ctx.db, { username: 'conseil.lina', password: PASSWORD, role: 'advisor' });
    for (let i = 0; i < 25; i++) {
      expect((await login(i % 2 ? USER : 'conseil.lina', PASSWORD, IP)).status).toBe(200);
    }
    expect(await ctx.db.select().from(tcThrottle)).toEqual([]);
  });
  it('a successful sign-in clears that identifier’s failures and leaves the address its failures only', async () => {
    await fail(USER, 9);
    expect((await login(USER, PASSWORD, IP)).status).toBe(200);
    expect(await ctx.db.select({ bucket: tcThrottle.bucket, count: tcThrottle.count }).from(tcThrottle)).toEqual([
      { bucket: sha256Hex('login-ip|' + IP), count: 9 },
    ]);
    await fail(USER, 10);
    expect((await login(USER, 'faux', IP)).status).toBe(429);
  });
  it('concurrent attempts cannot pass the limit: each takes its slot before the password is checked', async () => {
    const results = await Promise.all(Array.from({ length: 15 }, () => login(USER, 'faux', IP)));
    expect(results.map((r) => r.status).sort((a, b) => a - b)).toEqual([...Array(10).fill(401), ...Array(5).fill(429)]);
    expect(results.filter((r) => r.status === 429).map((r) => r.body)).toEqual(Array(5).fill(WAIT));
    // The refused attempts gave their slots back: only the ten evaluated failures are counted.
    expect((await ctx.db.select().from(tcThrottle)).map((t) => t.count)).toEqual([10, 10]);
    expect((await login(USER, PASSWORD, IP)).status).toBe(429);
  });
  it('concurrent attempts across identifiers cannot pass the address ceiling', async () => {
    const bucket = sha256Hex('login-ip|' + IP);
    await ctx.db.insert(tcThrottle).values({ bucket, count: 95, expires_at: new Date(Date.now() + 600_000) });
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => login(`inconnu-${i}`, 'faux', IP)));
    expect(results.filter((r) => r.status === 401)).toHaveLength(5);
    expect(results.filter((r) => r.status === 429)).toHaveLength(7);
    expect((await ctx.db.select().from(tcThrottle).where(eq(tcThrottle.bucket, bucket)))[0]!.count).toBe(100);
  });
  it('an address is stopped after 100 failures, whatever the identifiers', async () => {
    await ctx.db.insert(tcThrottle).values({ bucket: sha256Hex('login-ip|' + IP), count: 99, expires_at: new Date(Date.now() + 600_000) });
    await fail('inconnu-1', 1);
    const res = await login(USER, PASSWORD, IP);
    expect(res.status).toBe(429);
    expect(res.body).toEqual({ error: 'Trop de tentatives. Réessayez dans 10 minutes.' });
    expect((await login(USER, PASSWORD, '198.51.100.8')).status).toBe(200);
  });
  it('the message gives the wait that actually remains, and an ended window starts again', async () => {
    await fail(USER, 10);
    await ctx.db.update(tcThrottle).set({ expires_at: new Date(Date.now() + 30_000) });
    expect((await login(USER, 'faux', IP)).body).toEqual({ error: 'Trop de tentatives. Réessayez dans 1 minute.' });
    await ctx.db.update(tcThrottle).set({ expires_at: new Date(Date.now() - 1000) });
    expect((await login(USER, 'faux', IP)).status).toBe(401);
    expect((await ctx.db.select().from(tcThrottle)).map((t) => t.count)).toEqual([1, 1]);
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

describe('sliding session (H1)', () => {
  const COOKIE = /^__Host-touche-session=([a-f0-9]{64}); HttpOnly; Secure; SameSite=Strict; Path=\/; Max-Age=(\d+)$/;
  const session = async () => (await ctx.db.select().from(tcSessions))[0]!;
  const shift = (expiresIn: string, signedIn: string | null) =>
    ctx.db.execute(sql`UPDATE tc_sessions SET expires_at = now() + ${expiresIn}::interval,
      created_at = ${signedIn === null ? null : sql`now() - ${signedIn}::interval`}`);

  it('activity pushes the idle expiry back to 8 hours and re-issues the cookie', async () => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    await shift('7 hours', '1 hour');
    const res = await deskGet(ctx, '?compact=1', cookie);
    expect(res.status).toBe(200);
    const [, token, maxAge] = res.headers['set-cookie']![0].match(COOKIE)!;
    expect(token).toBe(cookie.split('=')[1]);
    expect(maxAge).toBe('28800');
    expect((await session()).expires_at.getTime()).toBeGreaterThan(Date.now() + 28_790_000);
    const write = await deskPost(ctx, { action: 'nope' }, { cookie });
    expect(write.status).toBe(400);
    expect(write.headers['set-cookie']).toBeUndefined();
  });
  it('a write slides the session too', async () => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    await shift('2 hours', '6 hours');
    const res = await deskPost(ctx, { action: 'password', current: 'faux', next: 'x' }, { cookie });
    expect(res.status).toBe(400);
    expect(res.headers['set-cookie']![0]).toMatch(COOKIE);
  });
  it('an automatic refresh (X-Desk-Background: 1) never slides the session; any other request does', async () => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    await shift('7 hours', '1 hour');
    const before = await session();
    for (const query of ['?compact=1', '?action=reminders', '?action=my-progress']) {
      const res = await deskGet(ctx, query, cookie).set('X-Desk-Background', '1');
      expect(res.status, query).toBe(200);
      expect(res.headers['set-cookie'], query).toBeUndefined();
    }
    const write = await deskPost(ctx, { action: 'nope' }, { cookie }).set('X-Desk-Background', '1');
    expect(write.status).toBe(400);
    expect(write.headers['set-cookie']).toBeUndefined();
    expect(await session()).toEqual(before);
    const res = await deskGet(ctx, '?action=reminders', cookie).set('X-Desk-Background', '0');
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']![0]).toMatch(COOKIE);
    expect((await session()).expires_at.getTime()).toBeGreaterThan(Date.now() + 28_790_000);
  });
  it('requests within 5 minutes of the last extension write nothing', async () => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    const before = await session();
    const res = await deskGet(ctx, '?compact=1', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await session()).toEqual(before);
  });
  it('a session never outlives 24 hours after sign-in', async () => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    await shift('10 minutes', '23 hours');
    const res = await deskGet(ctx, '?compact=1', cookie);
    expect(res.status).toBe(200);
    const maxAge = Number(res.headers['set-cookie']![0].match(COOKIE)![2]);
    expect(maxAge).toBeGreaterThanOrEqual(3595);
    expect(maxAge).toBeLessThanOrEqual(3600);
    const { created_at, expires_at } = await session();
    expect(expires_at.getTime() - created_at!.getTime()).toBeLessThanOrEqual(86_400_000);
    await shift('2 hours', '24 hours 1 minute');
    expect((await deskGet(ctx, '?compact=1', cookie)).status).toBe(401);
  });
  it('a session opened before the upgrade keeps its fixed expiry', async () => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    await shift('1 hour', null);
    const before = await session();
    const res = await deskGet(ctx, '?compact=1', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await session()).toEqual(before);
  });
  it('signing out still clears the cookie when the same request would slide it', async () => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    await shift('7 hours', '1 hour');
    const res = await deskPost(ctx, { action: 'logout' }, { cookie });
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']).toEqual(['__Host-touche-session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0']);
    expect(await ctx.db.select().from(tcSessions)).toEqual([]);
  });
  it('the workspace announces the sliding session', async () => {
    const cookie = await loginCookie(ctx, USER, PASSWORD);
    expect((await deskGet(ctx, '?compact=1', cookie)).body.features).toEqual([
      'void-call', 'reopen-reminder', 'expected-user', 'sliding-session', 'price-codes',
    ]);
  });
});
