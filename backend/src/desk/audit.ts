import { randomUUID } from 'node:crypto';
import { tcAudit } from '../db/schema.js';
import type { DeskUser } from './desk.types.js';

/** Build an audit row; always insert it inside the caller's transaction. */
export function auditRow(
  user: DeskUser,
  action: string,
  target: string,
  detail: unknown = {},
): typeof tcAudit.$inferInsert {
  return {
    id: randomUUID(),
    user_id: user.id,
    at: new Date(),
    action,
    target,
    detail,
  };
}
