import { canManageWorkspace } from '@touche/domain';
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { dateRangeValid, reportScope, shiftDay } from '@touche/domain';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { DeskError } from '../common/http.js';
import type { Db } from '../db/schema.js';
import {
  tcAudit,
  tcCallMeta,
  tcCalls,
  tcProposals,
  tcUsers,
} from '../db/schema.js';
import type { DeskUser } from './desk.types.js';

const voider = alias(tcUsers, 'voider');

@Injectable()
export class ReportingService {
  constructor(@InjectDrizzle() private readonly db: Db) {}

  async audit(user: DeskUser) {
    if (!canManageWorkspace(user))
      throw new DeskError(403, 'Accès direction requis.');
    const events = await this.db
      .select({
        id: tcAudit.id,
        at: tcAudit.at,
        action: tcAudit.action,
        target: tcAudit.target,
        detail: tcAudit.detail,
        user_id: tcAudit.user_id,
        label: tcUsers.label,
      })
      .from(tcAudit)
      .leftJoin(tcUsers, eq(tcUsers.id, tcAudit.user_id))
      .orderBy(desc(tcAudit.at))
      .limit(200);
    return { events, limit: 200 as const };
  }

  /** Port of activity.server.ts lines 52-65: closed calls of a period, 500 per page, keyset cursor. */
  async analytics(user: DeskUser, query: URLSearchParams) {
    if (!canManageWorkspace(user))
      throw new DeskError(403, 'Le pilotage est réservé à la direction.');
    const from = query.get('from') || '';
    const to = query.get('to') || '';
    if (!dateRangeValid(from, to)) {
      throw new DeskError(
        400,
        'Choisissez une période valide de 366 jours maximum.',
      );
    }
    const { userId } = reportScope(user);
    const filters = [
      gte(tcCalls.created_at, new Date(from + 'T00:00:00+01:00')),
      lt(tcCalls.created_at, new Date(shiftDay(to, 1) + 'T00:00:00+01:00')),
    ];
    if (userId !== null) filters.push(eq(tcCalls.user_id, userId));
    // H5: voided calls are listed only on request (`voided=1`, sent by desks that know void-call);
    // an older Pilotage tab would otherwise count them in its figures.
    if (query.get('voided') !== '1') filters.push(isNull(tcCalls.voided_at));
    const operator = query.get('operator');
    if (operator) {
      if (operator.length > 80) throw new DeskError(400, 'Filtre invalide.');
      filters.push(eq(tcCalls.user_id, operator));
    }
    const cursor = query.get('cursor');
    if (cursor) {
      const [date, key] = cursor.split('|');
      if (
        !date ||
        !key ||
        !/^\d{4}-\d{2}-\d{2}T/.test(date) ||
        key.length > 80 ||
        Number.isNaN(Date.parse(date)) ||
        // An impossible day (2026-02-30) still parses but PostgreSQL rejects the cast: the
        // cursor must be exactly the ISO string the previous page emitted.
        new Date(date).toISOString() !== date
      ) {
        throw new DeskError(400, 'Page invalide.');
      }
      filters.push(
        or(
          sql`${tcCalls.created_at} < ${date}::timestamptz`,
          and(
            sql`${tcCalls.created_at} = ${date}::timestamptz`,
            sql`${tcCalls.id} COLLATE "C" < ${key}`,
          ),
        )!,
      );
    }
    const rows = await this.db
      .select({
        ...getTableColumns(tcCalls),
        voided_by_label: voider.label,
        callback_done: tcCallMeta.callback_done,
        meta_data: tcCallMeta.data,
        order_check: tcCallMeta.order_check,
        order_state_group: tcCallMeta.order_state_group,
        order_state_name: tcCallMeta.order_state_name,
        order_state_at: tcCallMeta.order_state_at,
        ecomanager_order_id: tcCallMeta.ecomanager_order_id,
      })
      .from(tcCalls)
      .leftJoin(tcCallMeta, eq(tcCallMeta.call_id, tcCalls.id))
      .leftJoin(voider, eq(voider.id, tcCalls.voided_by))
      .where(and(...filters))
      .orderBy(desc(tcCalls.created_at), sql`${tcCalls.id} COLLATE "C" DESC`)
      .limit(501);
    const current = rows.slice(0, 500);
    const last = current[current.length - 1];
    const proposals = current.length
      ? await this.db
          .select({
            call_id: tcProposals.call_id,
            snapshot: tcProposals.snapshot,
          })
          .from(tcProposals)
          .where(
            inArray(
              tcProposals.call_id,
              current.map((r) => r.id),
            ),
          )
          .orderBy(asc(tcProposals.created_at), asc(tcProposals.id))
      : [];
    const calls = current.map(({ meta_data, ...rest }) => ({
      ...rest,
      meta: meta_data ?? {},
      proposals: proposals
        .filter((p) => p.call_id === rest.id)
        .map((p) => p.snapshot),
    }));
    return {
      calls,
      nextCursor:
        rows.length > 500 && last
          ? last.created_at.toISOString() + '|' + last.id
          : null,
      from,
      to,
      timeZone: 'Africa/Algiers',
      source: 'manual',
      schemaVersion: 3,
    };
  }

  /** Port of activity.server.ts line 67: open reminders of active calls, oldest callback first, scoped to the user. */
  async reminders(user: DeskUser) {
    const { userId } = reportScope(user);
    const reminders = await this.db
      .select({
        id: tcCalls.id,
        user_id: tcCalls.user_id,
        operator: tcCalls.operator,
        base_id: tcCalls.base_id,
        outcome: tcCalls.outcome,
        created_at: tcCalls.created_at,
        callback_at: tcCallMeta.callback_at,
        order_ref: tcCallMeta.order_ref,
        brand: tcCalls.brand,
        meta: tcCallMeta.data,
      })
      .from(tcCalls)
      .innerJoin(tcCallMeta, eq(tcCallMeta.call_id, tcCalls.id))
      .where(
        and(
          isNotNull(tcCallMeta.callback_at),
          eq(tcCallMeta.callback_done, 0),
          isNull(tcCalls.voided_at),
          userId === null ? undefined : eq(tcCalls.user_id, userId),
        ),
      )
      .orderBy(asc(tcCallMeta.callback_at))
      .limit(500);
    return { reminders, limit: 500 as const };
  }
}
