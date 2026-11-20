import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Env } from '../src/config/env.js';
import { type TestContext, createTestApp } from './support/context.js';
import { resetDatabase } from './support/database.js';
import { deskGet } from './support/desk.js';
import { createUser, loginCookie } from './support/users.js';

const PASSWORD = 'mot-de-passe-solide-2026';

/** EcoManager settings for a test app; `baseUrl` points at a fake server when a test needs one. */
function ecomanager(baseUrl = 'http://127.0.0.1:9', extra: Partial<NonNullable<Env['ecomanager']>> = {}): Partial<Env> {
  return { ecomanager: { token: 'test-token', baseUrl, prefix: 'TOU', timeoutMs: 300, syncIntervalMs: 0, ...extra } };
}

let on: TestContext;
let off: TestContext;

beforeAll(async () => {
  on = await createTestApp(ecomanager());
  off = await createTestApp();
});
afterAll(async () => {
  await on.close();
  await off.close();
});
beforeEach(async () => {
  await resetDatabase(on.db);
  await createUser(on.db, { username: 'direction', password: PASSWORD, role: 'admin', label: 'Direction' });
});

describe('order-check feature', () => {
  it('lists order-check only when a token is configured', async () => {
    const withToken = await deskGet(on, '?compact=1', await loginCookie(on, 'direction', PASSWORD));
    expect(withToken.body.features).toContain('order-check');
    const without = await deskGet(off, '?compact=1', await loginCookie(off, 'direction', PASSWORD));
    expect(without.body.features).not.toContain('order-check');
  });
});
