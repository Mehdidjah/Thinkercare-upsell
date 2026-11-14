import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { and, eq, lt, ne, sql } from 'drizzle-orm';
import { DeskError } from '../common/http.js';
import { loginSchema, passwordSchema } from '../desk/schemas.js';
import type { DeskUser } from '../desk/desk.types.js';
import type { Db } from '../db/schema.js';
import { tcSessions, tcThrottle, tcUsers } from '../db/schema.js';
import { DUMMY_SALT, hashPassword, newSaltHex, newSessionToken, safeEqualHex, sha256Hex } from './crypto.js';
import { SESSION_TTL_MS, readSessionToken, sessionCookie } from './session.js';

const THROTTLE_WINDOW_MS = 900_000;

@Injectable()
export class AuthService {
  constructor(@InjectDrizzle() private readonly db: Db) {}

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
      await tx.update(tcUsers).set({ salt, password_hash: passwordHash }).where(eq(tcUsers.id, user.id));
      await tx
        .delete(tcSessions)
        .where(
          and(eq(tcSessions.user_id, user.id), ne(tcSessions.token_hash, sha256Hex(readSessionToken(cookieHeader)))),
        );
    });
  }
}
