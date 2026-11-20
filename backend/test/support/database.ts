import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Product } from '@touche/domain';
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

export async function resetDatabase(db: Db): Promise<void> {
  await db.execute(sql`TRUNCATE ${sql.raw(TABLES.map((t) => `"${t}"`).join(', '))} RESTART IDENTITY CASCADE`);
  const seed = readFileSync(resolve(import.meta.dirname, '../../drizzle/0001_seed_catalogue.sql'), 'utf8');
  for (const statement of seed.split('--> statement-breakpoint')) {
    if (statement.trim()) await db.execute(sql.raw(statement));
  }
}

/** The BEL.NCO rows of shared/test/fixtures/belnco.json, after the Touché seed; a row already there is kept. */
export async function seedBelnco(db: Db): Promise<void> {
  const bel = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../shared/test/fixtures/belnco.json'), 'utf8')) as Product[];
  await db
    .insert(tcProducts)
    .values(bel.map((p) => ({ id: p.id, data: p })))
    .onConflictDoNothing({ target: tcProducts.id });
}
