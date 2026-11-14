import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createAdmin } from '../src/cli/create-admin.js';
import { tcUsers } from '../src/db/schema.js';
import { type TestContext, createTestApp } from './support/context.js';
import { resetDatabase, testDatabaseUrl } from './support/database.js';
import { loginCookie } from './support/users.js';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(() => resetDatabase(ctx.db));

describe('create-admin', () => {
  it('creates the first direction account and returns its password once', async () => {
    const created = await createAdmin(testDatabaseUrl(), 'direction', 'Direction Touché');
    expect(created.username).toBe('direction');
    expect(created.password).toHaveLength(32);
    const rows = await ctx.db.select().from(tcUsers);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.role).toBe('admin');
    expect(rows[0]!.label).toBe('Direction Touché');
    expect(await loginCookie(ctx, 'direction', created.password)).toMatch(/^__Host-touche-session=[a-f0-9]{64}$/);
  });
  it('refuses when a direction account exists', async () => {
    await createAdmin(testDatabaseUrl(), 'direction', 'Direction Touché');
    await expect(createAdmin(testDatabaseUrl(), 'autre', 'Autre direction')).rejects.toThrow(
      'Un compte direction existe déjà. Aucun compte n’a été modifié.',
    );
    expect(await ctx.db.select().from(tcUsers)).toHaveLength(1);
  });
  it('rejects an invalid username', async () => {
    await expect(createAdmin(testDatabaseUrl(), 'A!', 'Direction Touché')).rejects.toThrow(/^Usage:/);
  });
});
