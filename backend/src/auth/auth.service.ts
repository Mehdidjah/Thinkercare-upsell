import { Inject, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, lt, ne, sql } from 'drizzle-orm';
import { DeskError } from '../common/http.js';
import { loginSchema, passwordSchema, revealPasswordSchema } from '../desk/schemas.js';
import type { DeskUser } from '../desk/desk.types.js';
import type { Db } from '../db/schema.js';
import { tcAudit, tcSessions, tcThrottle, tcUsers } from '../db/schema.js';
import { ENV, type Env } from '../config/env.js';
import { auditRow } from '../desk/audit.js';
import { openPassword, sealPassword } from './password-vault.js';
import { DUMMY_SALT, hashPassword, newSaltHex, newSessionToken, safeEqualHex, sha256Hex } from './crypto.js';
import { SESSION_TTL_MS, readSessionToken, sessionCookie } from './session.js';

const THROTTLE_WINDOW_MS = 900_000;

@Injectable()
export class AuthService {
  constructor(@InjectDrizzle() private readonly db: Db, @Inject(ENV) private readonly env: Env) {}

  async resolveUser(cookieHeader?: string): Promise<DeskUser | null> {
    const token = readSessionToken(cookieHeader);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const rows = await this.db
      .select({
        id: tcUsers.id,
        username: tcUsers.username,
        label: tcUsers.label,
        role: tcUsers.role,
        active: tcUsers.active,
        team: tcUsers.team,
        reporting_scope: tcUsers.reporting_scope,
        password_updated_at: tcUsers.password_updated_at,
      })
      .from(tcUsers)
      .innerJoin(tcSessions, eq(tcSessions.user_id, tcUsers.id))
      .where(
        and(eq(tcSessions.token_hash, sha256Hex(token)), sql`${tcSessions.expires_at} > now()`, eq(tcUsers.active, 1)),
      )
      .limit(1);
    return rows[0] ?? null;
  }

  async login(body: unknown, clientIp: string): Promise<string> {
    const v = loginSchema.parse(body);
    const now = Date.now();
    const bucket = sha256Hex(clientIp + '|' + Math.floor(now / THROTTLE_WINDOW_MS));
    const [attempts] = await this.db
      .insert(tcThrottle)
      .values({ bucket, count: 1, expires_at: new Date(now + THROTTLE_WINDOW_MS) })
      .onConflictDoUpdate({ target: tcThrottle.bucket, set: { count: sql`${tcThrottle.count} + 1` } })
      .returning({ count: tcThrottle.count });
    if ((attempts?.count ?? 0) > 20) throw new DeskError(429, 'Trop de tentatives. Réessayez dans 15 minutes.');
    // PostgreSQL text cannot hold NUL (22021): such a name matches no account, so skip the lookup
    // and keep the same path as an unknown user (dummy hash, throttle already counted, 401).
    const [row] = v.username.includes('\u0000')
      ? []
      : await this.db.select().from(tcUsers).where(eq(tcUsers.username, v.username)).limit(1);
    const hashed = await hashPassword(v.password, row?.salt ?? DUMMY_SALT);
    if (!row || !row.active || !safeEqualHex(hashed, row.password_hash)) {
      throw new DeskError(401, 'Identifiant ou mot de passe incorrect.');
    }
    const token = newSessionToken();
    await this.db.transaction(async (tx) => {
      // Serialize session creation with password replacement, including CLI recovery.
      const [current] = await tx.select().from(tcUsers).where(eq(tcUsers.id, row.id)).for('update');
      if (!current?.active || current.password_hash !== row.password_hash || current.salt !== row.salt) {
        throw new DeskError(401, 'Identifiant ou mot de passe incorrect.');
      }
      await tx.insert(tcSessions).values({
        token_hash: sha256Hex(token),
        user_id: row.id,
        expires_at: new Date(now + SESSION_TTL_MS),
      });
      await tx.delete(tcSessions).where(lt(tcSessions.expires_at, new Date(now)));
      await tx.delete(tcThrottle).where(lt(tcThrottle.expires_at, new Date(now)));
    });
    return sessionCookie(token);
  }

  async logout(cookieHeader?: string): Promise<void> {
    await this.db.delete(tcSessions).where(eq(tcSessions.token_hash, sha256Hex(readSessionToken(cookieHeader))));
  }

  async changePassword(user: DeskUser, body: unknown, cookieHeader?: string): Promise<void> {
    const v = passwordSchema.parse(body);
    const [row] = await this.db
      .select({ salt: tcUsers.salt, password_hash: tcUsers.password_hash })
      .from(tcUsers)
      .where(eq(tcUsers.id, user.id))
      .limit(1);
    if (!row || !safeEqualHex(await hashPassword(v.current, row.salt), row.password_hash)) {
      throw new DeskError(400, 'Mot de passe actuel incorrect.');
    }
    const salt = newSaltHex();
    const passwordHash = await hashPassword(v.next, salt);
    await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(tcUsers).where(eq(tcUsers.id, user.id)).for('update');
      const [session] = await tx.select({ id: tcSessions.user_id }).from(tcSessions).where(and(
        eq(tcSessions.user_id, user.id), eq(tcSessions.token_hash, sha256Hex(readSessionToken(cookieHeader))),
        sql`${tcSessions.expires_at} > now()`,
      ));
      if (!current?.active || !session || current.password_hash !== row.password_hash || current.salt !== row.salt) {
        throw new DeskError(401, 'Votre accès a changé. Reconnectez-vous avant de modifier le mot de passe.');
      }
      await tx.update(tcUsers).set({
        salt, password_hash: passwordHash,
        password_ciphertext: current.role === 'advisor' ? sealPassword(user.id, v.next, this.env.accountPasswordKey) : null,
        password_updated_at: new Date(),
      }).where(eq(tcUsers.id, user.id));
      await tx
        .delete(tcSessions)
        .where(
          and(eq(tcSessions.user_id, user.id), ne(tcSessions.token_hash, sha256Hex(readSessionToken(cookieHeader)))),
        );
      await tx.insert(tcAudit).values(auditRow(user, 'account.password_changed', user.id));
    });
  }

  async revealPassword(user: DeskUser, body: unknown, cookieHeader?: string): Promise<{ password: string | null }> {
    if (user.role !== 'admin') throw new DeskError(403, 'Cette action est réservée à la direction.');
    const v = revealPasswordSchema.parse(body);
    if (!this.env.accountPasswordKey) throw new DeskError(503, 'La consultation des mots de passe n’est pas configurée.');
    const now = Date.now();
    const bucket = sha256Hex('password-view|' + user.id + '|' + Math.floor(now / THROTTLE_WINDOW_MS));
    const [attempts] = await this.db.insert(tcThrottle)
      .values({ bucket, count: 1, expires_at: new Date(now + THROTTLE_WINDOW_MS) })
      .onConflictDoUpdate({ target: tcThrottle.bucket, set: { count: sql`${tcThrottle.count} + 1` } })
      .returning({ count: tcThrottle.count });
    if ((attempts?.count ?? 0) > 10) throw new DeskError(429, 'Trop de consultations. Réessayez dans 15 minutes.');
    const [verified] = await this.db.select().from(tcUsers).where(eq(tcUsers.id, user.id));
    if (!verified || !safeEqualHex(await hashPassword(v.adminPassword, verified.salt), verified.password_hash)) {
      throw new DeskError(403, 'Votre mot de passe administrateur est incorrect.');
    }
    return this.db.transaction(async (tx) => {
      const [admin] = await tx.select().from(tcUsers).where(eq(tcUsers.id, user.id)).for('update');
      const [session] = await tx.select({ id: tcSessions.user_id }).from(tcSessions).where(and(
        eq(tcSessions.user_id, user.id), eq(tcSessions.token_hash, sha256Hex(readSessionToken(cookieHeader))),
        sql`${tcSessions.expires_at} > now()`,
      ));
      if (!admin?.active || admin.role !== 'admin' || !session || admin.password_hash !== verified.password_hash || admin.salt !== verified.salt) {
        throw new DeskError(401, 'Votre session a expiré. Reconnectez-vous.');
      }
      const [target] = await tx.select().from(tcUsers).where(eq(tcUsers.id, v.id));
      if (!target) throw new DeskError(404, 'Compte introuvable.');
      if (target.role !== 'advisor') throw new DeskError(403, 'Le mot de passe de la direction ne peut pas être consulté.');
      const password = target.password_ciphertext ? openPassword(target.id, target.password_ciphertext, this.env.accountPasswordKey) : null;
      await tx.insert(tcAudit).values(auditRow(user, 'account.password_viewed', target.id));
      return { password };
    });
  }
}
