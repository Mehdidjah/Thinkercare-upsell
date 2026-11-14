import { drizzle } from 'drizzle-orm/node-postgres';
import { sql } from 'drizzle-orm';
import { runMigrations } from '../../src/db/migrate.js';
import { testDatabaseUrl } from './database.js';

/** The setup drops the whole public schema: refuse any database whose name does not say "test". */
function assertTestDatabase(url: string): void {
  let name = '';
  try {
    name = decodeURIComponent(new URL(url).pathname.slice(1));
  } catch {
    name = '';
  }
  if (!name.includes('test')) {
    throw new Error(
      `TEST_DATABASE_URL must name a test database (its name must contain "test"); got "${name}". Refusing to drop its schema.`,
    );
  }
}

export default async function setup(): Promise<void> {
  const url = testDatabaseUrl();
  assertTestDatabase(url);
  const db = drizzle(url);
  try {
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE`);
    await db.execute(sql`DROP SCHEMA IF EXISTS drizzle CASCADE`);
    await db.execute(sql`CREATE SCHEMA public`);
  } finally {
    await db.$client.end();
  }
  await runMigrations(url);
}
