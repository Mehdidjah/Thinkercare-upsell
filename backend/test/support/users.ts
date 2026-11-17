import { randomUUID } from 'node:crypto';
import { hashPassword, newSaltHex } from '../../src/auth/crypto.js';
import type { DeskUser } from '../../src/desk/desk.types.js';
import type { Db } from '../../src/db/schema.js';
import { tcUsers } from '../../src/db/schema.js';
import type { TestContext } from './context.js';
import { deskPost } from './desk.js';

export async function createUser(
  db: Db,
  u: {
    username: string;
    password: string;
    role: 'admin' | 'manager' | 'advisor';
    label?: string;
    team?: string;
    active?: 0 | 1;
  },
): Promise<DeskUser> {
  const salt = newSaltHex();
  const [row] = await db
    .insert(tcUsers)
    .values({
      id: randomUUID(),
      username: u.username,
      label: u.label ?? u.username,
      role: u.role,
      salt,
      password_hash: await hashPassword(u.password, salt),
      active: u.active ?? 1,
      team: u.team ?? '',
    })
    .returning({
      id: tcUsers.id,
      username: tcUsers.username,
      label: tcUsers.label,
      role: tcUsers.role,
      active: tcUsers.active,
      team: tcUsers.team,
      reporting_scope: tcUsers.reporting_scope,
    });
  return row!;
}

export async function loginCookie(ctx: TestContext, username: string, password: string, ip?: string): Promise<string> {
  const res = await deskPost(ctx, { action: 'login', username, password }, { ip });
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  const setCookie = (res.headers['set-cookie'] as unknown as string[] | string)[0]!;
  return setCookie.split(';')[0]!;
}
