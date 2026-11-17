import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { hashPassword, newSaltHex } from '../auth/crypto.js';
import { sealPassword } from '../auth/password-vault.js';
import { tcAudit, tcSessions, tcUsers } from '../db/schema.js';

const USAGE =
  'Usage: node backend/dist/cli/reset-password.js <identifiant>. Identifiant de 3 à 40 caractères (a-z, 0-9, . _ -).';

export interface ResetPasswordResult {
  username: string;
  password: string;
  active: boolean;
}

/**
 * Account recovery: give the account a new random password, store only its salt + PBKDF2 hash,
 * close every open session of that account and write an audit row, all in one transaction.
 * Works for every role (including the direction account) and leaves inactive accounts inactive.
 */
export async function resetPassword(
  databaseUrl: string,
  username: string,
): Promise<ResetPasswordResult> {
  const name = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(name)) throw new Error(USAGE);
  const password = randomBytes(24).toString('base64url');
  const salt = newSaltHex();
  const passwordHash = await hashPassword(password, salt);
  const db = drizzle(databaseUrl);
  try {
    const active = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ id: tcUsers.id, active: tcUsers.active, role: tcUsers.role })
        .from(tcUsers)
        .where(and(eq(tcUsers.username, name), isNull(tcUsers.deleted_at)))
        .limit(1).for('update');
      if (!row) throw new Error('Compte introuvable : ' + name);
      await tx
        .update(tcUsers)
        .set({ salt, password_hash: passwordHash,
          password_ciphertext: row.role !== 'admin' ? sealPassword(row.id, password, process.env.ACCOUNT_PASSWORD_KEY?.trim()) : null,
          password_updated_at: new Date(),
        })
        .where(eq(tcUsers.id, row.id));
      await tx.delete(tcSessions).where(eq(tcSessions.user_id, row.id));
      await tx.insert(tcAudit).values({
        id: randomUUID(),
        user_id: 'cli',
        at: new Date(),
        action: 'account.password_reset',
        target: row.id,
        detail: { via: 'cli' },
      });
      return row.active === 1;
    });
    return { username: name, password, active };
  } finally {
    await db.$client.end();
  }
}

/** The text printed once by the command. Never contains the salt or the hash. */
export function resetPasswordReport(result: ResetPasswordResult): string {
  const lines = [
    `Compte : ${result.username}`,
    `Nouveau mot de passe : ${result.password}`,
    'Toutes les sessions ouvertes de ce compte ont été fermées. Communiquez ce mot de passe de façon sûre et changez-le après connexion (Mon compte).',
  ];
  if (!result.active) {
    lines.push(
      'Attention : ce compte est désactivé. Réactivez-le dans Gestion pour qu’il puisse se connecter.',
    );
  }
  return lines.join('\n');
}

/**
 * The error line printed on failure. A failed query's own message lists its parameters (the new
 * salt and hash), so print the database's cause instead.
 */
export function failureMessage(error: unknown): string {
  const root = error instanceof Error && error.cause instanceof Error ? error.cause : error;
  return root instanceof Error ? root.message : String(root);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const databaseUrl = process.env.DATABASE_URL;
  try {
    if (!databaseUrl) throw new Error('DATABASE_URL est obligatoire.');
    const result = await resetPassword(databaseUrl, process.argv[2] ?? '');
    console.log(resetPasswordReport(result));
    process.exit(0);
  } catch (error) {
    console.error(failureMessage(error));
    process.exit(1);
  }
}
