import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { hashPassword, newSaltHex } from '../auth/crypto.js';
import { tcUsers } from '../db/schema.js';

const USAGE =
  'Usage: node backend/dist/cli/create-admin.js direction "Direction Touché". Identifiant 3-40 caractères, nom 2-80 caractères.';

export async function createAdmin(
  databaseUrl: string,
  username: string,
  label: string,
): Promise<{ username: string; password: string }> {
  if (!/^[a-z0-9._-]{3,40}$/.test(username) || label.length < 2 || label.length > 80) throw new Error(USAGE);
  const password = randomBytes(24).toString('base64url');
  const salt = newSaltHex();
  const passwordHash = await hashPassword(password, salt);
  const db = drizzle(databaseUrl);
  try {
    await db.transaction(async (tx) => {
      const existing = await tx.select({ id: tcUsers.id }).from(tcUsers).where(eq(tcUsers.role, 'admin')).limit(1);
      if (existing.length > 0) throw new Error('Un compte direction existe déjà. Aucun compte n’a été modifié.');
      await tx
        .insert(tcUsers)
        .values({ id: randomUUID(), username, label, role: 'admin', salt, password_hash: passwordHash });
    });
  } finally {
    await db.$client.end();
  }
  return { username, password };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseUrl = process.env.DATABASE_URL;
  try {
    if (!databaseUrl) throw new Error('DATABASE_URL est obligatoire.');
    const created = await createAdmin(databaseUrl, process.argv[2] || 'direction', process.argv[3] || 'Direction Touché');
    console.log(`Compte : ${created.username}
Mot de passe initial : ${created.password}
Conservez le mot de passe dans votre coffre-fort et changez-le après connexion. Aucun compte existant n’a été modifié.`);
    process.exit(0);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
