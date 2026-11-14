import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

export const MIGRATIONS_DIR = resolve(import.meta.dirname, '../../drizzle');

export async function runMigrations(databaseUrl: string): Promise<void> {
  const db = drizzle(databaseUrl);
  try {
    await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  } finally {
    await db.$client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseUrl = process.env.DATABASE_URL;
  try {
    if (!databaseUrl) throw new Error('DATABASE_URL est obligatoire.');
    await runMigrations(databaseUrl);
    console.log('Migrations appliquées.');
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
