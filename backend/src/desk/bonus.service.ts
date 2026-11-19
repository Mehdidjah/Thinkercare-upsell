import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import {
  DEFAULT_BONUS,
  algerDay,
  bonusEstimate,
  canViewDirection,
  dateRangeValid,
  isFrontline,
  monthBounds,
  sumContributions,
  validMonth,
  type BonusRule,
} from '@touche/domain';
import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import { DeskError } from '../common/http.js';
import type { Db } from '../db/schema.js';
import { tcAudit, tcBonusRules, tcUsers } from '../db/schema.js';
import { auditRow } from './audit.js';
import { contributions } from './contributions.js';
import type { DeskUser } from './desk.types.js';
import { bonusRuleSchema } from './schemas.js';

@Injectable()
export class BonusService {
  constructor(@InjectDrizzle() private readonly db: Db) {}

  private async ruleFor(month: string): Promise<BonusRule> {
    const [row] = await this.db
      .select()
      .from(tcBonusRules)
      .where(lte(tcBonusRules.month, month))
      .orderBy(desc(tcBonusRules.month))
      .limit(1);
    return row
      ? {
          effectiveMonth: row.month,
          threshold: row.threshold,
          rateDzd: row.rate_dzd,
          mode: row.mode as BonusRule['mode'],
          version: row.version,
        }
      : { ...DEFAULT_BONUS };
  }

  /** Port of bonus.server.ts lines 8-27. */
  async get(
    user: DeskUser,
    q: URLSearchParams,
    action: 'my-progress' | 'contributions',
  ) {
    if (action === 'contributions' && !canViewDirection(user))
      throw new DeskError(403, 'Cet espace est réservé à la direction.');
    if (
      action === 'my-progress' &&
      [...q.keys()].some((k) => !['action', 'month'].includes(k))
    )
      throw new DeskError(
        403,
        'La progression personnelle ne permet pas de cibler un autre compte.',
      );
    const month = q.get('month') || algerDay().slice(0, 7);
    if (!validMonth(month))
      throw new DeskError(400, 'Choisissez un mois valide.');
    const b = monthBounds(month);
    const rule = await this.ruleFor(month);
    const today = algerDay();
    if (action === 'my-progress') {
      const rows = await contributions(this.db, b.from, b.to, user.id);
      const total = sumContributions(rows);
      return {
        month,
        today,
        timezone: 'Africa/Algiers',
        source: 'manual',
        user: { id: user.id, label: user.label },
        rule: {
          effectiveMonth: rule.effectiveMonth,
          threshold: rule.threshold,
          rateDzd: rule.rateDzd,
          mode: rule.mode,
        },
        progress: bonusEstimate(total.upsells, rule),
        todayUpsells: rows
          .filter((r) => r.day === today)
          .reduce((s, r) => s + Number(r.upsells), 0),
        daily: rows.map((r) => ({ day: r.day, upsells: Number(r.upsells) })),
        withoutReference: total.withoutRef,
        duplicateExcluded: total.duplicates,
        updatedAt: new Date().toISOString(),
      };
    }
    const from = q.get('from') || b.from;
    const to = q.get('to') || b.to;
    if (!dateRangeValid(from, to))
      throw new DeskError(
        400,
        'Choisissez une période valide de 366 jours maximum.',
      );
    const periodQuery = contributions(this.db, from, to);
    const [period, monthly, users] = await Promise.all([
      periodQuery,
      from === b.from && to === b.to
        ? periodQuery
        : contributions(this.db, b.from, b.to),
      this.db
        .select({
          id: tcUsers.id,
          label: tcUsers.label,
          role: tcUsers.role,
          active: tcUsers.active,
          team: tcUsers.team,
        })
        .from(tcUsers)
        .orderBy(asc(tcUsers.label)),
    ]);
    const people = users.map((u) => {
      const pr = period.filter((r) => r.user_id === u.id);
      const mr = monthly.filter((r) => r.user_id === u.id);
      const m = sumContributions(mr);
      return {
        ...u,
        period: sumContributions(pr),
        monthly: {
          ...m,
          bonus: bonusEstimate(isFrontline(u.role) ? m.upsells : 0, rule),
        },
        daily: pr,
      };
    });
    return {
      month,
      from,
      to,
      today,
      timezone: 'Africa/Algiers',
      source: 'manual',
      rule,
      monthRuleVersion: rule.effectiveMonth === month ? rule.version : 0,
      people,
      updatedAt: new Date().toISOString(),
    };
  }

  /** Port of bonus.server.ts lines 28-40. */
  async saveRule(user: DeskUser, body: unknown): Promise<{ ok: true }> {
    if (!canViewDirection(user))
      throw new DeskError(403, 'Seule la direction peut définir la prime.');
    const v = bonusRuleSchema.parse(body);
    if (v.month < algerDay().slice(0, 7))
      throw new DeskError(
        400,
        'Les règles des mois clôturés sont en lecture seule. Une correction historique demande une procédure dédiée.',
      );
    const now = new Date();
    await this.db.transaction(async (tx) => {
      let changed: number;
      if (v.expectedVersion === 0) {
        const rows = await tx
          .insert(tcBonusRules)
          .values({
            month: v.month,
            threshold: v.threshold,
            rate_dzd: v.rateDzd,
            mode: v.mode,
            version: 1,
            updated_by: user.id,
            updated_at: now,
          })
          .onConflictDoNothing({ target: tcBonusRules.month })
          .returning({ month: tcBonusRules.month });
        changed = rows.length;
      } else {
        const rows = await tx
          .update(tcBonusRules)
          .set({
            threshold: v.threshold,
            rate_dzd: v.rateDzd,
            mode: v.mode,
            version: sql`${tcBonusRules.version} + 1`,
            updated_by: user.id,
            updated_at: now,
          })
          .where(
            and(
              eq(tcBonusRules.month, v.month),
              eq(tcBonusRules.version, v.expectedVersion),
            ),
          )
          .returning({ month: tcBonusRules.month });
        changed = rows.length;
      }
      if (!changed)
        throw new DeskError(
          409,
          'Cette règle a changé. Actualisez avant de l’enregistrer.',
        );
      await tx.insert(tcAudit).values(
        auditRow(user, 'bonus.rule.updated', v.month, {
          threshold: v.threshold,
          rateDzd: v.rateDzd,
          mode: v.mode,
          version: v.expectedVersion + 1,
        }),
      );
    });
    return { ok: true };
  }
}
