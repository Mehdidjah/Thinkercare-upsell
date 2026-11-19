import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/db/migrate.js';
import { openDb, resetDatabase, testDatabaseUrl } from './support/database.js';

const fixture: Array<{ id: string } & Record<string, unknown>> = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../shared/test/fixtures/catalogue.json'), 'utf8'),
);

const handle = openDb(testDatabaseUrl());
const { db } = handle;

async function count(table: string): Promise<number> {
  const result = await db.execute(sql`SELECT COUNT(*)::int AS n FROM ${sql.identifier(table)}`);
  return (result.rows[0] as { n: number }).n;
}

describe('migrations', () => {
  beforeAll(async () => {
    await resetDatabase(db);
  });
  beforeEach(async () => {
    await resetDatabase(db);
  });
  afterAll(async () => {
    await handle.close();
  });

  it('fresh database has the seeded catalogue in fixture order', async () => {
    const result = await db.execute(sql`SELECT id, data FROM tc_products ORDER BY position`);
    const rows = result.rows as Array<{ id: string; data: unknown }>;
    expect(rows.map((r) => r.id)).toEqual(fixture.map((p) => p.id));
    rows.forEach((row, i) => expect(row.data).toEqual(fixture[i]));
  });

  it('no accounts, sessions or calls after migration', async () => {
    for (const table of ['tc_users', 'tc_sessions', 'tc_calls', 'tc_proposals', 'tc_audit', 'tc_external_sales']) {
      expect(await count(table), table).toBe(0);
    }
  });

  it('clinical setting and November 2026 pending rule are seeded', async () => {
    const clinical = await db.execute(sql`SELECT data FROM tc_settings WHERE id = 'clinical'`);
    expect((clinical.rows[0] as { data: unknown }).data).toEqual({ validated: false, by: '', at: '' });
    const rules = await db.execute(sql`SELECT * FROM tc_bonus_rules`);
    expect(rules.rows).toHaveLength(1);
    expect(rules.rows[0]).toMatchObject({ month: '2026-11', threshold: 60, rate_dzd: 45, mode: 'pending', version: 1 });
  });

  it('check constraints reject an unknown role and a zero threshold', async () => {
    await expect(
      db.execute(
        sql`INSERT INTO tc_users (id, username, label, role, salt, password_hash) VALUES ('u1', 'x', 'X', 'unknown', 's', 'h')`,
      ),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
    await expect(
      db.execute(
        sql`INSERT INTO tc_bonus_rules (month, threshold, rate_dzd, mode, updated_at) VALUES ('2026-12', 0, 10, 'pending', now())`,
      ),
    ).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('accepts the cm role beside existing advisor rows', async () => {
    await db.execute(
      sql`INSERT INTO tc_users (id, username, label, role, salt, password_hash) VALUES ('u-cm', 'cm', 'CM', 'cm', 's', 'h')`,
    );
    await db.execute(
      sql`INSERT INTO tc_users (id, username, label, role, salt, password_hash) VALUES ('u-adv', 'adv', 'Adv', 'advisor', 's', 'h')`,
    );
    await runMigrations(testDatabaseUrl());
    const result = await db.execute(sql`SELECT username, role FROM tc_users ORDER BY username`);
    expect(result.rows).toEqual([
      { username: 'adv', role: 'advisor' },
      { username: 'cm', role: 'cm' },
    ]);
  });

  it('an order reference can be accepted only once', async () => {
    await db.execute(sql`INSERT INTO tc_accepted_dossiers (order_ref, call_id, user_id) VALUES ('DOS-1', 'c1', 'u1')`);
    await expect(
      db.execute(sql`INSERT INTO tc_accepted_dossiers (order_ref, call_id, user_id) VALUES ('DOS-1', 'c2', 'u1')`),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
  });

  it('migrations are idempotent', async () => {
    await expect(runMigrations(testDatabaseUrl())).resolves.toBeUndefined();
    expect(await count('tc_products')).toBe(32);
  });

  it('jsonb keeps French typography', async () => {
    const name = 'Crème « essai » — l’été 100 %';
    await db.execute(
      sql`UPDATE tc_products SET data = jsonb_set(data, '{name}', to_jsonb(${name}::text)) WHERE id = ${fixture[0]!.id}`,
    );
    const result = await db.execute(sql`SELECT data->>'name' AS name FROM tc_products WHERE id = ${fixture[0]!.id}`);
    expect((result.rows[0] as { name: string }).name).toBe(name);
  });
});
