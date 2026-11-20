import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Db } from '../../src/db/schema.js';

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
