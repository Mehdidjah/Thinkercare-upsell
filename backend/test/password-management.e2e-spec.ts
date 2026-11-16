import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';
import { hashPassword } from '../src/auth/crypto.js';
import { resetPassword } from '../src/cli/reset-password.js';
import { tcAudit, tcUsers, type Db } from '../src/db/schema.js';
import { type TestContext, createTestApp } from './support/context.js';
import { resetDatabase, testDatabaseUrl } from './support/database.js';
import { deskGet, deskPost } from './support/desk.js';
import { createUser, loginCookie } from './support/users.js';

const ADMIN = 'test-admin-password-2026';
const INITIAL = 'test-initial-password-2026';
const PERSONAL = 'test-personal-password-2026';
const REPLACEMENT = 'test-replacement-password-2026';
const key = randomBytes(32).toString('hex');
let ctx: TestContext;
let admin: string;
let advisor: string;
let advisorId: string;
let adminId: string;

beforeAll(async () => { ctx = await createTestApp({ accountPasswordKey: key }); });
afterAll(() => ctx.close());
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });
beforeEach(async () => {
  await resetDatabase(ctx.db);
  adminId = (await createUser(ctx.db, { username: 'direction', password: ADMIN, role: 'admin' })).id;
  admin = await loginCookie(ctx, 'direction', ADMIN);
  expect((await deskPost(ctx, { action: 'user', username: 'conseil.test', label: 'Conseillère test', password: INITIAL }, { cookie: admin })).status).toBe(200);
  const [row] = await ctx.db.select().from(tcUsers).where(eq(tcUsers.username, 'conseil.test'));
  advisorId = row!.id;
  advisor = await loginCookie(ctx, 'conseil.test', INITIAL);
});
const reveal = (adminPassword = ADMIN, cookie = admin, id = advisorId, ip?: string) =>
  deskPost(ctx, { action: 'user-password', id, adminPassword }, { cookie, ip });
const reset = () => deskPost(ctx, { action: 'reset-user', id: advisorId, password: REPLACEMENT }, { cookie: admin });
const login = (password: string) => deskPost(ctx, { action: 'login', username: 'conseil.test', password });

describe('saved advisor passwords', () => {
  it('stores encrypted credentials and exposes only availability in the ordinary dashboard', async () => {
    const [row] = await ctx.db.select().from(tcUsers).where(eq(tcUsers.id, advisorId));
    expect(row!.password_hash).toBe(await hashPassword(INITIAL, row!.salt));
    expect(row!.password_ciphertext).toMatch(/^v1\./);
    expect(JSON.stringify(row)).not.toContain(INITIAL);
    const bootstrap = await deskGet(ctx, '', admin);
    const account = bootstrap.body.users.find((u: { id: string }) => u.id === advisorId);
    expect(account.password_available).toBe(true);
    expect(account.password_updated_at).toMatch(/Z$/);
    for (const field of ['password', 'salt', 'password_hash', 'password_ciphertext']) expect(account).not.toHaveProperty(field);
    expect(bootstrap.body.password_viewing_enabled).toBe(true);
    const shown = await reveal();
    expect(shown.status).toBe(200);
    expect(shown.headers['cache-control']).toBe('no-store');
    expect(shown.body).toEqual({ password: INITIAL });
    const audit = await ctx.db.select().from(tcAudit).where(eq(tcAudit.action, 'account.password_viewed'));
    expect(audit).toHaveLength(1);
    expect(audit[0]!.target).toBe(advisorId);
    expect(JSON.stringify(audit)).not.toContain(INITIAL);
    expect(JSON.stringify(audit)).not.toContain(ADMIN);
  });
  it('persists a personal change for future login and admin viewing', async () => {
    const other = await loginCookie(ctx, 'conseil.test', INITIAL);
    const changed = await deskPost(ctx, { action: 'password', current: INITIAL, next: PERSONAL }, { cookie: advisor });
    expect(changed.status).toBe(200);
    expect((await login(INITIAL)).status).toBe(401);
    expect((await login(PERSONAL)).status).toBe(200);
    expect((await deskGet(ctx, '', other)).status).toBe(401);
    expect((await deskGet(ctx, '', advisor)).status).toBe(200);
    expect((await reveal()).body).toEqual({ password: PERSONAL });
    expect(JSON.stringify(await ctx.db.select().from(tcAudit))).not.toContain(PERSONAL);
  });
  it('admin replacement changes the viewable password and revokes old access', async () => {
    expect((await reset()).status).toBe(200);
    expect((await deskGet(ctx, '', advisor)).status).toBe(401);
    expect((await login(INITIAL)).status).toBe(401);
    expect((await login(REPLACEMENT)).status).toBe(200);
    expect((await reveal()).body).toEqual({ password: REPLACEMENT });
  });
  it('requires an active admin session and fresh administrator password', async () => {
    expect((await reveal('wrong-password')).status).toBe(403);
    expect((await reveal(ADMIN, advisor)).status).toBe(403);
    expect((await reveal(ADMIN, '')).status).toBe(401);
    expect((await reveal(ADMIN, admin, adminId)).status).toBe(403);
    expect((await deskPost(ctx, { action: 'reset-user', id: advisorId, password: REPLACEMENT }, { cookie: advisor })).status).toBe(403);
    expect((await reveal()).body).toEqual({ password: INITIAL });
  });
  it('limits administrator reauthentication across changing IP addresses', async () => {
    for (let i = 0; i < 10; i++) expect((await reveal('wrong-password', admin, advisorId, `198.51.100.${i + 1}`)).status).toBe(403);
    expect((await reveal(ADMIN, admin, advisorId, '198.51.100.99')).status).toBe(429);
  });
  it('does not fabricate passwords for legacy accounts', async () => {
    await ctx.db.update(tcUsers).set({ password_ciphertext: null, password_updated_at: null }).where(eq(tcUsers.id, advisorId));
    expect((await reveal()).body).toEqual({ password: null });
    expect((await login(INITIAL)).status).toBe(200);
    await reset();
    expect((await reveal()).body).toEqual({ password: REPLACEMENT });
  });
  it('CLI recovery updates the encrypted copy and removes it if no key is configured', async () => {
    vi.stubEnv('ACCOUNT_PASSWORD_KEY', key);
    const recovered = await resetPassword(testDatabaseUrl(), 'conseil.test');
    expect((await reveal()).body).toEqual({ password: recovered.password });
    vi.stubEnv('ACCOUNT_PASSWORD_KEY', '');
    const legacy = await resetPassword(testDatabaseUrl(), 'conseil.test');
    expect((await reveal()).body).toEqual({ password: null });
    expect((await login(legacy.password)).status).toBe(200);
  });
  it('keeps password changes working when viewing is not configured and clears stale copies', async () => {
    const unconfigured = await createTestApp({ accountPasswordKey: undefined });
    try {
      expect((await deskPost(unconfigured, { action: 'password', current: INITIAL, next: PERSONAL }, { cookie: advisor })).status).toBe(200);
      expect((await login(PERSONAL)).status).toBe(200);
      expect((await reveal()).body).toEqual({ password: null });
      expect((await deskGet(unconfigured, '', admin)).body.password_viewing_enabled).toBe(false);
      expect((await deskPost(unconfigured, { action: 'user-password', id: advisorId, adminPassword: ADMIN }, { cookie: admin })).status).toBe(503);
    } finally { await unconfigured.close(); }
  });
  it('rejects an old-password login finishing after an admin reset', async () => {
    const authDb = Reflect.get(ctx.app.get(AuthService), 'db') as Db;
    const original = authDb.transaction.bind(authDb);
    let release!: () => void;
    let reached!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const paused = new Promise<void>(resolve => { reached = resolve; });
    vi.spyOn(authDb, 'transaction').mockImplementationOnce(async (...args: Parameters<Db['transaction']>) => {
      reached(); await gate; return original(...args);
    });
    const pending = login(INITIAL).then(response => response);
    try { await paused; expect((await reset()).status).toBe(200); }
    finally { release(); }
    expect((await pending).status).toBe(401);
    expect((await login(REPLACEMENT)).status).toBe(200);
  });
});
