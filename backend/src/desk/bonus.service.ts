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
  type OrderStateGroup,
} from '@touche/domain';
import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import { DeskError } from '../common/http.js';
import type { Db } from '../db/schema.js';
import { tcAudit, tcBonusRules, tcUsers } from '../db/schema.js';
import { auditRow } from './audit.js';
import { contributions, type UpsellSale, upsellSales } from './contributions.js';
import type { DeskUser } from './desk.types.js';
import { bonusRuleSchema } from './schemas.js';

const STATE_GROUPS: OrderStateGroup[] = ['delivered', 'shipping', 'pending', 'failed', 'unknown'];
/** « Mes upsells » lists at most this many sales, the most recent first. */
const MAX_LISTED = 300;
const units = (sales: UpsellSale[]) => sales.reduce((sum, u) => sum + u.units, 0);

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
      // `voided` (the journal's opt-in for voided calls) targets no account: ignored here.
      [...q.keys()].some((k) => !['action', 'month', 'voided'].includes(k))
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
      // The prime counts upsells delivered in the month (Algiers day of delivery); `sold` keeps the month's sales by call date.
      const [rows, sold, delivered] = await Promise.all([
        contributions(this.db, b.from, b.to, user.id),
        upsellSales(this.db, b.from, b.to, 'sold', user.id),
        upsellSales(this.db, b.from, b.to, 'delivered', user.id),
      ]);
      const total = sumContributions(rows);
      const byDay = new Map<string, number>();
      for (const u of delivered) byDay.set(u.delivered_day!, (byDay.get(u.delivered_day!) ?? 0) + u.units);
      const stateCounts = Object.fromEntries(STATE_GROUPS.map((g) => [g, 0])) as Record<OrderStateGroup, number>;
      for (const u of sold) stateCounts[u.order_state_group && STATE_GROUPS.includes(u.order_state_group) ? u.order_state_group : 'unknown'] += u.units;
      // « Mes upsells »: sold this month or delivered this month; `counts` when it is one of the month's delivered upsells.
      const counted = new Set(delivered.map((u) => u.id));
      const listed = [...new Map([...sold, ...delivered].map((u) => [u.id, u])).values()].sort(
        (x, y) => y.created_at.localeCompare(x.created_at) || x.id.localeCompare(y.id),
      );
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
        progress: bonusEstimate(units(delivered), rule),
        todayUpsells: byDay.get(today) ?? 0,
        daily: [...byDay]
          .sort(([x], [y]) => x.localeCompare(y))
          .map(([day, upsells]) => ({ day, upsells })),
        sold: total.upsells,
        stateCounts,
        upsells: listed.slice(0, MAX_LISTED).map((u) => ({
          id: u.id,
          created_at: u.created_at,
          order_ref: u.order_ref,
          brand: u.brand,
          outcome: u.outcome,
          units: u.units,
          extra: u.extra,
          order_state_group: u.order_state_group,
          order_state_name: u.order_state_name,
          delivered_at: u.delivered_at,
          counts: counted.has(u.id),
        })),
        upsellsTotal: listed.length,
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
    const [period, monthly, delivered, users] = await Promise.all([
      periodQuery,
      from === b.from && to === b.to
        ? periodQuery
        : contributions(this.db, b.from, b.to),
      upsellSales(this.db, b.from, b.to, 'delivered'),
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
      // The prime is on the upsells delivered in the month; `upsells` stays the month's sales.
      const d = units(delivered.filter((x) => x.user_id === u.id));
      return {
        ...u,
        period: sumContributions(pr),
        monthly: {
          ...m,
          delivered: d,
          bonus: bonusEstimate(isFrontline(u.role) ? d : 0, rule),
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
          'Cette règle vient d’être modifiée par un autre compte. Rechargez la règle enregistrée, vérifiez-la, puis enregistrez de nouveau.',
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
