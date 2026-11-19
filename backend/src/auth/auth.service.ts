import { canManageWorkspace } from '@touche/domain';
import { Inject, Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { DeskError } from '../common/http.js';
import { loginSchema, passwordSchema, revealPasswordSchema } from '../desk/schemas.js';
import type { DeskUser } from '../desk/desk.types.js';
import type { Db } from '../db/schema.js';
import { tcAudit, tcSessions, tcThrottle, tcUsers } from '../db/schema.js';
import { ENV, type Env } from '../config/env.js';
import { auditRow } from '../desk/audit.js';
import { openPassword, sealPassword } from './password-vault.js';
import { DUMMY_SALT, hashPassword, newSaltHex, newSessionToken, safeEqualHex, sha256Hex } from './crypto.js';
import {
  SESSION_MAX_MS,
  SESSION_RENEW_MS,
  SESSION_TTL_MS,
  readSessionToken,
  sessionCookie,
} from './session.js';

const THROTTLE_WINDOW_MS = 900_000;
/** F6: failed sign-ins only, per network address and identifier, with a higher per-address ceiling. */
const LOGIN_FAILURES_PER_ACCOUNT = 10;
const LOGIN_FAILURES_PER_IP = 100;

@Injectable()
export class AuthService {
  constructor(@InjectDrizzle() private readonly db: Db, @Inject(ENV) private readonly env: Env) {}

  async resolveUser(cookieHeader?: string): Promise<DeskUser | null> {
    return (await this.resolveSession(cookieHeader))?.user ?? null;
  }

  /**
   * The signed-in user. H1: activity slides the 8 h idle expiry forward, at most every 5 minutes
   * and never past 24 h after sign-in; `cookie` is then the re-issued cookie with its new Max-Age.
   * Sessions opened before migration 0004 (no sign-in time) keep their fixed expiry.
   */
  async resolveSession(cookieHeader?: string): Promise<{ user: DeskUser; cookie?: string } | null> {
    const token = readSessionToken(cookieHeader);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const tokenHash = sha256Hex(token);
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
        expires_at: tcSessions.expires_at,
        created_at: tcSessions.created_at,
      })
      .from(tcUsers)
      .innerJoin(tcSessions, eq(tcSessions.user_id, tcUsers.id))
      .where(
        and(
          eq(tcSessions.token_hash, tokenHash),
          sql`${tcSessions.expires_at} > now()`,
          sql`(${tcSessions.created_at} IS NULL OR ${tcSessions.created_at} > now() - make_interval(secs => ${SESSION_MAX_MS / 1000}))`,
          eq(tcUsers.active, 1),
          isNull(tcUsers.deleted_at),
        ),
      )
      .limit(1);
    const row = rows[0];
    if (!row) return null;
    const { expires_at: expiresAt, created_at: createdAt, ...user } = row;
    if (!createdAt) return { user };
    const now = Date.now();
    const next = Math.min(now + SESSION_TTL_MS, createdAt.getTime() + SESSION_MAX_MS);
    if (next - expiresAt.getTime() < SESSION_RENEW_MS) return { user };
    const renewed = await this.db
      .update(tcSessions)
      .set({ expires_at: new Date(next) })
      .where(and(eq(tcSessions.token_hash, tokenHash), lt(tcSessions.expires_at, new Date(next))))
      .returning({ token_hash: tcSessions.token_hash });
    if (!renewed.length) return { user };
    return { user, cookie: sessionCookie(token, Math.floor((next - now) / 1000)) };
  }

  async login(body: unknown, clientIp: string): Promise<string> {
    const v = loginSchema.parse(body);
    const now = Date.now();
    // The identifier is already trimmed and lower-cased by the schema.
    const accountBucket = sha256Hex('login|' + clientIp + '|' + v.username);
    const ipBucket = sha256Hex('login-ip|' + clientIp);
    await this.refuseWhileThrottled(now, [
      [accountBucket, LOGIN_FAILURES_PER_ACCOUNT],
      [ipBucket, LOGIN_FAILURES_PER_IP],
    ]);
    // PostgreSQL text cannot hold NUL (22021): such a name matches no account, so skip the lookup
    // and keep the same path as an unknown user (dummy hash, failure counted, 401).
    const [row] = v.username.includes('\u0000')
      ? []
      : await this.db.select().from(tcUsers).where(eq(tcUsers.username, v.username)).limit(1);
    const hashed = await hashPassword(v.password, row?.salt ?? DUMMY_SALT);
    if (!row || !row.active || row.deleted_at || !safeEqualHex(hashed, row.password_hash)) {
      await this.countFailure(now, [accountBucket, ipBucket]);
      throw new DeskError(401, 'Identifiant ou mot de passe incorrect.');
    }
    const token = newSessionToken();
    await this.db.transaction(async (tx) => {
      // Serialize session creation with password replacement, including CLI recovery.
      const [current] = await tx.select().from(tcUsers).where(eq(tcUsers.id, row.id)).for('update');
      if (!current?.active || current.deleted_at || current.password_hash !== row.password_hash || current.salt !== row.salt) {
        throw new DeskError(401, 'Identifiant ou mot de passe incorrect.');
      }
      await tx.insert(tcSessions).values({
        token_hash: sha256Hex(token),
        user_id: row.id,
        expires_at: new Date(now + SESSION_TTL_MS),
        created_at: new Date(now),
      });
      await tx.delete(tcSessions).where(lt(tcSessions.expires_at, new Date(now)));
      await tx.delete(tcThrottle).where(lt(tcThrottle.expires_at, new Date(now)));
      // A successful sign-in clears this identifier's failures from this address.
      await tx.delete(tcThrottle).where(eq(tcThrottle.bucket, accountBucket));
    });
    return sessionCookie(token);
  }

  /** 429 while one of the buckets reached its limit, saying how long remains of its window. */
  private async refuseWhileThrottled(now: number, limits: [string, number][]): Promise<void> {
    const rows = await this.db
      .select()
      .from(tcThrottle)
      .where(and(inArray(tcThrottle.bucket, limits.map(([bucket]) => bucket)), gt(tcThrottle.expires_at, new Date(now))));
    const blocked = rows.filter((r) => limits.some(([bucket, limit]) => bucket === r.bucket && r.count >= limit));
    if (!blocked.length) return;
    const until = Math.max(...blocked.map((r) => r.expires_at.getTime()));
    const minutes = Math.max(1, Math.ceil((until - now) / 60_000));
    throw new DeskError(429, `Trop de tentatives. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`);
  }

  /** One more failure in each bucket; a window starts at its first failure and lasts 15 minutes. */
  private async countFailure(now: number, buckets: string[]): Promise<void> {
    const at = new Date(now);
    await this.db
      .insert(tcThrottle)
      .values(buckets.map((bucket) => ({ bucket, count: 1, expires_at: new Date(now + THROTTLE_WINDOW_MS) })))
      .onConflictDoUpdate({
        target: tcThrottle.bucket,
        set: {
          count: sql`CASE WHEN ${tcThrottle.expires_at} <= ${at} THEN 1 ELSE ${tcThrottle.count} + 1 END`,
          expires_at: sql`CASE WHEN ${tcThrottle.expires_at} <= ${at} THEN excluded.expires_at ELSE ${tcThrottle.expires_at} END`,
        },
      });
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
      if (!current?.active || current.deleted_at || !session || current.password_hash !== row.password_hash || current.salt !== row.salt) {
        throw new DeskError(401, 'Votre accès a changé. Reconnectez-vous avant de modifier le mot de passe.');
      }
      await tx.update(tcUsers).set({
        salt, password_hash: passwordHash,
        password_ciphertext: current.role !== 'admin' ? sealPassword(user.id, v.next, this.env.accountPasswordKey) : null,
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
    if (!canManageWorkspace(user)) throw new DeskError(403, 'Cette action est réservée à la direction.');
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
      if (!admin?.active || admin.deleted_at || !canManageWorkspace(admin) || !session || admin.password_hash !== verified.password_hash || admin.salt !== verified.salt) {
        throw new DeskError(401, 'Votre session a expiré. Reconnectez-vous.');
      }
      const [target] = await tx.select().from(tcUsers).where(eq(tcUsers.id, v.id));
      if (!target || target.deleted_at) throw new DeskError(404, 'Compte introuvable.');
      if (target.role === 'admin') throw new DeskError(403, 'Le mot de passe de la direction ne peut pas être consulté.');
      const password = target.password_ciphertext ? openPassword(target.id, target.password_ciphertext, this.env.accountPasswordKey) : null;
      await tx.insert(tcAudit).values(auditRow(user, 'account.password_viewed', target.id));
      return { password };
    });
  }
}
