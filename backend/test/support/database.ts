import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inArray, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { type Db, tcProducts } from '../../src/db/schema.js';

const TABLES = [
  'tc_users',
  'tc_sessions',
  'tc_throttle',
  'tc_products',
  'tc_settings',
  'tc_calls',
  'tc_call_meta',
  'tc_proposals',
  'tc_audit',
  'tc_external_sales',
  'tc_accepted_dossiers',
  'tc_bonus_rules',
];

export function testDatabaseUrl(): string {
  return process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@127.0.0.1:54329/touche_test';
}

export function openDb(url: string): { db: Db; close(): Promise<void> } {
  const db = drizzle(url);
  return { db, close: () => db.$client.end() };
}

/** The seed migrations' rows, as a fresh database has them: the Touché catalogue, settings and bonus rule (0001), then the
 *  BEL.NCO catalogue (0007). Only their INSERT statements are replayed; the schema changes are already applied. */
const SEEDS = ['0001_seed_catalogue.sql', '0007_belnco_brand.sql'];

export async function resetDatabase(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE ${sql.raw(TABLES.map((t) => `"${t}"`).join(', '))} RESTART IDENTITY CASCADE`);
  for (const file of SEEDS) {
    const seed = readFileSync(resolve(import.meta.dirname, '../../drizzle', file), 'utf8');
    for (const statement of seed.split('--> statement-breakpoint')) {
      if (/^\s*INSERT INTO/.test(statement)) await db.execute(sql.raw(statement));
    }
  }
}

/** The BEL.NCO products the catalogue sells (every one but the sold-out tinted serum). */
const SOLD: string[] = (
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../shared/test/fixtures/belnco.json'), 'utf8')) as Array<{ id: string; enabled: boolean }>
)
  .filter((p) => p.enabled)
  .map((p) => p.id);

/** What Gestion does once the brand-aware API is live: 0007 seeds BEL.NCO switched off, this switches its products on. */
export async function launchBelnco(db: Db): Promise<void> {
  await db
    .update(tcProducts)
    .set({ data: sql`jsonb_set(${tcProducts.data}, '{enabled}', 'true'::jsonb)` })
    .where(inArray(tcProducts.id, SOLD));
}
