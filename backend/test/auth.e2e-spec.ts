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
  it('logout deletes the session and clears the cookie', async () => {
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
    expect((await deskPost(ctx, { action: 'logout' }, { cookie: b })).status).toBe(401);
    expect((await deskPost(ctx, { action: 'nope' }, { cookie: a })).status).toBe(400);
    expect((await login(USER, PASSWORD)).status).toBe(401);
    expect((await login(USER, next)).status).toBe(200);
  });
});
