import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/db/migrate.js';
import { openDb, resetDatabase, testDatabaseUrl } from './support/database.js';

const fixture: Array<{ id: string } & Record<string, unknown>> = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../shared/test/fixtures/catalogue.json'), 'utf8'),
);
const belnco: Array<{ id: string } & Record<string, unknown>> = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../shared/test/fixtures/belnco.json'), 'utf8'),
);
// 0007 seeds BEL.NCO switched off: the code running when it applies offers every enabled row, whatever its brand.
const seeded = [...fixture, ...belnco.map((p) => ({ ...p, enabled: false }))];
/** 0007 seeded the BEL.NCO pack as the « DOUBLE cleansing ritual »; 0010 made it the fixture's « Pack Cleansing ». Its copy
 *  aside, the 0007 row is the fixture's. */
const PACK_COPY = ['name', 'short', 'description', 'priceSource', 'pitch', 'cautions', 'checkedAt'];
const seedView = (p: unknown) => {
  const row = p as { id: string } & Record<string, unknown>;
  return row.id === 'bel-ritual' ? Object.fromEntries(Object.entries(row).filter(([k]) => !PACK_COPY.includes(k))) : row;
};
const ritualName = async () => (await db.execute(sql`SELECT data->>'name' AS name FROM tc_products WHERE id = 'bel-ritual'`)).rows;

const handle = openDb(testDatabaseUrl());
const { db } = handle;

async function count(table: string): Promise<number> {
  const result = await db.execute(sql`SELECT COUNT(*)::int AS n FROM ${sql.identifier(table)}`);
  return (result.rows[0] as { n: number }).n;
}

/** Applies one migration file's statements, as the migrator would, without the files that came after it. */
async function applyFile(file: string): Promise<void> {
  const text = readFileSync(resolve(import.meta.dirname, '../drizzle', file), 'utf8');
  for (const statement of text.split('--> statement-breakpoint')) if (statement.trim()) await db.execute(sql.raw(statement));
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
    expect(rows.map((r) => r.id)).toEqual(seeded.map((p) => p.id));
    rows.forEach((row, i) => expect(seedView(row.data)).toEqual(seedView(seeded[i])));
    expect(await ritualName()).toEqual([{ name: 'DOUBLE cleansing ritual' }]);
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

  it('a voided dossier frees its reference and every row stays', async () => {
    await db.execute(sql`INSERT INTO tc_accepted_dossiers (order_ref, call_id, user_id) VALUES ('DOS-1', 'c1', 'u1')`);
    await db.execute(sql`UPDATE tc_accepted_dossiers SET voided_at = now() WHERE call_id = 'c1'`);
    await db.execute(sql`INSERT INTO tc_accepted_dossiers (order_ref, call_id, user_id) VALUES ('DOS-1', 'c2', 'u1')`);
    await expect(
      db.execute(sql`INSERT INTO tc_accepted_dossiers (order_ref, call_id, user_id) VALUES ('DOS-1', 'c3', 'u1')`),
    ).rejects.toMatchObject({ cause: { code: '23505', constraint: 'tc_accepted_dossiers_active_ref' } });
    await expect(
      db.execute(sql`INSERT INTO tc_accepted_dossiers (order_ref, call_id, user_id) VALUES ('DOS-2', 'c2', 'u1')`),
    ).rejects.toMatchObject({ cause: { code: '23505' } });
    expect(await count('tc_accepted_dossiers')).toBe(2);
  });

  it('0006 adds order state columns and keeps existing meta rows', async () => {
    await db.execute(sql`INSERT INTO tc_users (id, username, label, role, salt, password_hash) VALUES ('u1', 'lina', 'Lina', 'advisor', 's', 'h')`);
    await db.execute(
      sql`INSERT INTO tc_calls (id, user_id, operator, created_at, outcome, base_id, products, catalogue_total, base_total, offered_total, extra, tier)
          VALUES ('c1', 'u1', 'Lina', now(), 'duo', 'antiacne', '[]', 3300, 1800, 3000, 1200, 'duo')`,
    );
    await db.execute(sql`INSERT INTO tc_call_meta (call_id, data, order_ref) VALUES ('c1', '{}', 'TOU1763816')`);
    const row = (await db.execute(sql`SELECT * FROM tc_call_meta WHERE call_id = 'c1'`)).rows[0] as Record<string, unknown>;
    expect(row).toMatchObject({
      order_ref: 'TOU1763816', order_check: '', ecomanager_order_id: null, order_state_group: null,
      order_state_name: null, order_state_at: null, order_synced_at: null,
    });
    const indexes = (await db.execute(sql`SELECT indexname FROM pg_indexes WHERE tablename = 'tc_call_meta'`)).rows.map((r) => (r as { indexname: string }).indexname);
    expect(indexes).toEqual(expect.arrayContaining(['tc_meta_ecomanager_order', 'tc_meta_order_sync']));
  });

  it('migrations are idempotent', async () => {
    await expect(runMigrations(testDatabaseUrl())).resolves.toBeUndefined();
    expect(await count('tc_products')).toBe(42);
  });

  it('0007 applies over a 0006 database: calls become Touché, an edited bel- row is kept, an unknown brand is refused', async () => {
    const journal = JSON.parse(readFileSync(resolve(import.meta.dirname, '../drizzle/meta/_journal.json'), 'utf8'));
    const entry = journal.entries.find((e: { tag: string }) => e.tag === '0007_belnco_brand');
    expect(entry.when).toBeGreaterThan(1795193493255);
    await db.execute(sql`ALTER TABLE tc_calls DROP CONSTRAINT tc_calls_brand_check`);
    await db.execute(sql`ALTER TABLE tc_calls DROP COLUMN brand`);
    await db.execute(sql`DELETE FROM tc_products WHERE id LIKE 'bel-%'`);
    await db.execute(sql`INSERT INTO tc_users (id, username, label, role, salt, password_hash) VALUES ('u1', 'lina', 'Lina', 'advisor', 's', 'h')`);
    await db.execute(sql`INSERT INTO tc_calls (id, user_id, operator, created_at, outcome, base_id, products, catalogue_total, base_total, offered_total, extra, tier)
      VALUES ('c1', 'u1', 'Lina', now(), 'duo', 'antiacne', '[]', 3300, 1800, 3000, 1200, 'duo')`);
    await db.execute(sql`INSERT INTO tc_call_meta (call_id, data, order_ref) VALUES ('c1', '{}', 'TOU1763816')`);
    await db.execute(sql`INSERT INTO tc_products (id, data) VALUES ('bel-oil', ${JSON.stringify({ ...belnco[0], name: 'Huile éditée en Gestion' })}::jsonb)`);
    // 0007 alone: the migrator only applies files newer than the last one recorded (0008 since 2026-11-21).
    await applyFile('0007_belnco_brand.sql');
    expect((await db.execute(sql`SELECT brand FROM tc_calls WHERE id = 'c1'`)).rows).toEqual([{ brand: 'touche' }]);
    expect((await db.execute(sql`SELECT data->>'name' AS name FROM tc_products WHERE id = 'bel-oil'`)).rows).toEqual([{ name: 'Huile éditée en Gestion' }]);
    expect((await db.execute(sql`SELECT COUNT(*)::int AS n FROM tc_products WHERE id LIKE 'bel-%'`)).rows).toEqual([{ n: 10 }]);
    await expect(db.execute(sql`UPDATE tc_calls SET brand = 'shein' WHERE id = 'c1'`)).rejects.toMatchObject({ cause: { code: '23514' } });
  });

  it('0007 seeds BEL.NCO switched off, so code that can’t tell brands apart still offers Touché rows only', async () => {
    const journal = JSON.parse(readFileSync(resolve(import.meta.dirname, '../drizzle/meta/_journal.json'), 'utf8'));
    const entry = journal.entries.find((e: { tag: string }) => e.tag === '0007_belnco_brand');
    await db.execute(sql`ALTER TABLE tc_calls DROP CONSTRAINT tc_calls_brand_check`);
    await db.execute(sql`ALTER TABLE tc_calls DROP COLUMN brand`);
    await db.execute(sql`DELETE FROM tc_products WHERE id LIKE 'bel-%'`);
    // 0007 alone: the migrator only applies files newer than the last one recorded (0008 since 2026-11-21).
    await applyFile('0007_belnco_brand.sql');
    // The API and desk from before BEL.NCO read every row and offer the enabled ones: grid, suggestions, picker, server.
    const rows = (await db.execute(sql`SELECT id, data FROM tc_products ORDER BY position`)).rows as Array<{ id: string; data: { enabled: boolean } }>;
    expect(rows.filter((r) => r.data.enabled).map((r) => r.id)).toEqual(fixture.filter((p) => p.enabled).map((p) => p.id));
    expect(rows.filter((r) => r.id.startsWith('bel-')).map((r) => seedView(r.data))).toEqual(belnco.map((p) => seedView({ ...p, enabled: false })));
    expect(await ritualName()).toEqual([{ name: 'DOUBLE cleansing ritual' }]);
  });

  it('0008 removes the prickly pear oil and the ritual (hand-made copies too), keeps a row a call names switched off, and launches the 7 other BEL.NCO products', async () => {
    const journal = JSON.parse(readFileSync(resolve(import.meta.dirname, '../drizzle/meta/_journal.json'), 'utf8'));
    const entry = journal.entries.find((e: { tag: string }) => e.tag === '0008_belnco_launch');
    expect(entry.when).toBeGreaterThan(1795209817154);
    // Copies added by hand in Gestion, filed as Touché; the second one is named by a saved call.
    await db.execute(sql`INSERT INTO tc_products (id, data) VALUES ('produit-aaaa1111', ${JSON.stringify({ ...fixture[0], id: 'produit-aaaa1111', name: '100% Pure Prickly Pear Oil' })}::jsonb), ('produit-bbbb2222', ${JSON.stringify({ ...fixture[0], id: 'produit-bbbb2222', name: 'DOUBLE cleansing ritual ' })}::jsonb)`);
    await db.execute(sql`INSERT INTO tc_users (id, username, label, role, salt, password_hash) VALUES ('u1', 'lina', 'Lina', 'advisor', 's', 'h')`);
    await db.execute(sql`INSERT INTO tc_calls (id, user_id, operator, created_at, outcome, base_id, products, catalogue_total, base_total, offered_total, extra, tier)
      VALUES ('c1', 'u1', 'Lina', now(), 'duo', 'antiacne', ${JSON.stringify([{ id: 'antiacne', name: 'x', price: 1800 }, { id: 'produit-bbbb2222', name: 'y', price: 3100 }])}::jsonb, 4900, 1800, 4500, 2700, 'duo')`);
    // 0008 alone: the migrator only applies files newer than the last one recorded (0009 since 2026-11-21).
    await applyFile('0008_belnco_launch.sql');
    const rows = (await db.execute(sql`SELECT id, data FROM tc_products ORDER BY position`)).rows as Array<{ id: string; data: { enabled: boolean } }>;
    const ids = rows.map((r) => r.id), on = rows.filter((r) => r.data.enabled).map((r) => r.id);
    for (const gone of ['bel-pear', 'bel-ritual', 'produit-aaaa1111']) expect(ids, gone).not.toContain(gone);
    expect(rows.find((r) => r.id === 'produit-bbbb2222')?.data.enabled).toBe(false);
    expect(on.filter((id) => id.startsWith('bel-'))).toEqual(['bel-oil', 'bel-gel', 'bel-spf30', 'bel-clarifying', 'bel-retinol', 'bel-moist', 'bel-uv50']);
    expect(rows.find((r) => r.id === 'bel-tinted')?.data.enabled).toBe(false);
    // Touché is untouched.
    expect(on.filter((id) => !id.startsWith('bel-'))).toEqual(fixture.filter((p) => p.enabled).map((p) => p.id));
  });

  it('0009 adds the delivery date to call meta, after 0008, and keeps existing rows without one', async () => {
    const journal = JSON.parse(readFileSync(resolve(import.meta.dirname, '../drizzle/meta/_journal.json'), 'utf8'));
    const entry = journal.entries.find((e: { tag: string }) => e.tag === '0009_delivered_at');
    expect(entry.when).toBeGreaterThan(1795219200000);
    await db.execute(sql`ALTER TABLE tc_call_meta DROP COLUMN delivered_at`);
    await db.execute(sql`INSERT INTO tc_users (id, username, label, role, salt, password_hash) VALUES ('u1', 'lina', 'Lina', 'advisor', 's', 'h')`);
    await db.execute(sql`INSERT INTO tc_calls (id, user_id, operator, created_at, outcome, base_id, products, catalogue_total, base_total, offered_total, extra, tier)
      VALUES ('c1', 'u1', 'Lina', now(), 'duo', 'antiacne', '[]', 3300, 1800, 3000, 1200, 'duo')`);
    await db.execute(sql`INSERT INTO tc_call_meta (call_id, data, order_ref, order_check, order_state_group, order_state_name, order_state_at)
      VALUES ('c1', '{}', 'TOU1763816', 'verified', 'delivered', 'Livrée', '2026-11-20T09:00:00Z')`);
    await applyFile('0009_delivered_at.sql');
    const row = (await db.execute(sql`SELECT * FROM tc_call_meta WHERE call_id = 'c1'`)).rows[0] as Record<string, unknown>;
    expect(row).toMatchObject({ order_state_group: 'delivered', order_state_name: 'Livrée', delivered_at: null });
    const column = (await db.execute(sql`SELECT data_type FROM information_schema.columns WHERE table_name = 'tc_call_meta' AND column_name = 'delivered_at'`)).rows;
    expect(column).toEqual([{ data_type: 'timestamp with time zone' }]);
  });

  it('0010 brings the BEL.NCO pack back as the « Pack Cleansing » once 0008 removed the ritual: on, the oil and the gel at 3 100 DA, after 0009', async () => {
    const journal = JSON.parse(readFileSync(resolve(import.meta.dirname, '../drizzle/meta/_journal.json'), 'utf8'));
    const entry = journal.entries.find((e: { tag: string }) => e.tag === '0010_belnco_pack_cleansing');
    expect(entry.when).toBeGreaterThan(1795219942460);
    expect(journal.entries.at(-1).tag).toBe('0010_belnco_pack_cleansing');
    // A database as 0008 left it (a fresh one too: 0007 seeds the ritual, nothing names it, 0008 deletes it).
    await applyFile('0008_belnco_launch.sql');
    expect(await ritualName()).toEqual([]);
    await applyFile('0010_belnco_pack_cleansing.sql');
    const rows = (await db.execute(sql`SELECT id, data FROM tc_products ORDER BY position`)).rows as Array<{ id: string; data: { enabled: boolean } }>;
    const pack = rows.find((r) => r.id === 'bel-ritual')!;
    expect(pack.data).toEqual(belnco.find((p) => p.id === 'bel-ritual'));
    expect(pack.data).toMatchObject({
      name: 'Pack Cleansing : Cleansing Oil + Cleansing Gel', short: 'Pack Cleansing', brand: 'belnco', category: 'Pack', components: ['bel-oil', 'bel-gel'],
      price: 3100, size: '2 × 250 ml', image: '/assets/products/bel-ritual.webp', enabled: true, recommendable: true,
    });
    // The seven others stay on, the pack comes after them; the prickly pear oil stays out, the tinted serum off, Touché untouched.
    const on = rows.filter((r) => r.data.enabled).map((r) => r.id);
    expect(on.filter((id) => id.startsWith('bel-'))).toEqual(['bel-oil', 'bel-gel', 'bel-spf30', 'bel-clarifying', 'bel-retinol', 'bel-moist', 'bel-uv50', 'bel-ritual']);
    expect(rows.map((r) => r.id)).not.toContain('bel-pear');
    expect(rows.find((r) => r.id === 'bel-tinted')?.data.enabled).toBe(false);
    expect(on.filter((id) => !id.startsWith('bel-'))).toEqual(fixture.filter((p) => p.enabled).map((p) => p.id));
  });

  it('0010 turns a ritual 0008 kept switched off (a call names it) into the « Pack Cleansing » in place; a second run changes nothing; the call keeps the name it recorded', async () => {
    await db.execute(sql`INSERT INTO tc_users (id, username, label, role, salt, password_hash) VALUES ('u1', 'lina', 'Lina', 'advisor', 's', 'h')`);
    await db.execute(sql`INSERT INTO tc_calls (id, user_id, operator, created_at, outcome, base_id, products, catalogue_total, base_total, offered_total, extra, tier, brand)
      VALUES ('c1', 'u1', 'Lina', now(), 'duo', 'bel-oil', ${JSON.stringify([{ id: 'bel-ritual', name: 'DOUBLE cleansing ritual', price: 3100 }])}::jsonb, 3100, 1700, 3100, 1400, 'catalogue', 'belnco')`);
    await applyFile('0008_belnco_launch.sql');
    const kept = (await db.execute(sql`SELECT position, data FROM tc_products WHERE id = 'bel-ritual'`)).rows as Array<{ position: number; data: { enabled: boolean; name: string } }>;
    expect(kept.map((r) => [r.data.name, r.data.enabled])).toEqual([['DOUBLE cleansing ritual', false]]);
    await applyFile('0010_belnco_pack_cleansing.sql');
    await applyFile('0010_belnco_pack_cleansing.sql');
    const rows = (await db.execute(sql`SELECT position, data FROM tc_products WHERE id = 'bel-ritual'`)).rows as Array<{ position: number; data: unknown }>;
    expect(rows).toEqual([{ position: kept[0]!.position, data: belnco.find((p) => p.id === 'bel-ritual') }]);
    expect((await db.execute(sql`SELECT products->0->>'name' AS name FROM tc_calls WHERE id = 'c1'`)).rows).toEqual([{ name: 'DOUBLE cleansing ritual' }]);
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
