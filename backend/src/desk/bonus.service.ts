import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import {
  BRANDS,
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
  type Brand,
  type OrderStateGroup,
} from '@touche/domain';
import { and, asc, desc, eq, lte, sql } from 'drizzle-orm';
import { DeskError } from '../common/http.js';
import type { Db } from '../db/schema.js';
import { tcAudit, tcBonusRules, tcUsers } from '../db/schema.js';
import { auditRow } from './audit.js';
import { contributions, DELIVERED_FROM, type UpsellSale, upsellSales } from './contributions.js';
import type { DeskUser } from './desk.types.js';
import { bonusRuleSchema } from './schemas.js';

const STATE_GROUPS: OrderStateGroup[] = ['delivered', 'shipping', 'pending', 'failed', 'unknown'];
/** « Mes upsells » lists at most this many sales, the most recent first. */
const MAX_LISTED = 300;
const units = (sales: UpsellSale[]) => sales.reduce((sum, u) => sum + u.units, 0);
/** `units` split by the brand of the call: the brands sum to it. */
const unitsByBrand = (sales: UpsellSale[]) =>
  Object.fromEntries(BRANDS.map((b) => [b, units(sales.filter((u) => u.brand === b))])) as Record<Brand, number>;
/** A sale whose order was delivered before the call (often a mistyped reference): it never counts, so « à vérifier ». */
const stateOf = (u: UpsellSale): OrderStateGroup =>
  u.order_state_group === 'delivered' && u.delivered_at !== null && u.delivered_at < u.created_at
    ? 'unknown'
    : u.order_state_group && STATE_GROUPS.includes(u.order_state_group)
      ? u.order_state_group
      : 'unknown';
/** Units by state group of their order (« à vérifier », `unknown`, includes an order delivered before the call). */
const byState = (sales: UpsellSale[]) => {
  const counts = Object.fromEntries(STATE_GROUPS.map((g) => [g, 0])) as Record<OrderStateGroup, number>;
  for (const u of sales) counts[stateOf(u)] += u.units;
  return counts;
};

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
    // From DELIVERED_FROM the prime counts the upsells delivered in the month; before, the month's sales, as they were paid.
    const basis: 'sold' | 'delivered' = month < DELIVERED_FROM ? 'sold' : 'delivered';
    if (action === 'my-progress') {
      // `sold` keeps the month's sales by call date, whatever the basis.
      const [rows, sold, delivered] = await Promise.all([
        contributions(this.db, b.from, b.to, user.id),
        upsellSales(this.db, b.from, b.to, 'sold', user.id),
        basis === 'delivered' ? upsellSales(this.db, b.from, b.to, 'delivered', user.id) : Promise.resolve([]),
      ]);
      const total = sumContributions(rows);
      // The days of the count: Algiers delivery days, or call days for a month paid on sales.
      const byDay = new Map<string, number>();
      if (basis === 'delivered') for (const u of delivered) byDay.set(u.delivered_day!, (byDay.get(u.delivered_day!) ?? 0) + u.units);
      else for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + Number(r.upsells));
      const stateCounts = byState(sold);
      const stateCountsByBrand = Object.fromEntries(BRANDS.map((br) => [br, byState(sold.filter((u) => u.brand === br))])) as Record<Brand, typeof stateCounts>;
      // « Mes upsells »: sold this month or delivered this month; `counts` when the month's prime counts it.
      const counted = new Set((basis === 'delivered' ? delivered : sold).map((u) => u.id));
      const listed = [...new Map([...sold, ...delivered].map((u) => [u.id, u])).values()].sort(
        (x, y) => y.created_at.localeCompare(x.created_at) || x.id.localeCompare(y.id),
      );
      return {
        month,
        today,
        timezone: 'Africa/Algiers',
        source: 'manual',
        basis,
        user: { id: user.id, label: user.label },
        rule: {
          effectiveMonth: rule.effectiveMonth,
          threshold: rule.threshold,
          rateDzd: rule.rateDzd,
          mode: rule.mode,
        },
        progress: bonusEstimate(basis === 'delivered' ? units(delivered) : total.upsells, rule),
        todayUpsells: byDay.get(today) ?? 0,
        daily: [...byDay]
          .sort(([x], [y]) => x.localeCompare(y))
          .map(([day, upsells]) => ({ day, upsells })),
        sold: total.upsells,
        // `sold` and the delivered count of the prime split by brand (null on a month paid on sales: the count is `sold`).
        soldByBrand: total.upsellsByBrand,
        deliveredByBrand: basis === 'delivered' ? unitsByBrand(delivered) : null,
        stateCounts,
        // `stateCounts` for each brand's sales (« Par marque » on « Ma progression »): the brands sum to it.
        stateCountsByBrand,
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
      basis === 'delivered' ? upsellSales(this.db, b.from, b.to, 'delivered') : Promise.resolve(null),
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
      // The prime is on the upsells delivered in the month; `upsells` stays the month's sales (the prime's count before
      // DELIVERED_FROM, when `delivered` is null).
      const mine = delivered?.filter((x) => x.user_id === u.id) ?? null;
      const d = mine ? units(mine) : null;
      return {
        ...u,
        // `upsellsByBrand` (period and month) and `deliveredByBrand` split `upsells` and `delivered` by brand.
        period: sumContributions(pr),
        monthly: {
          ...m,
          delivered: d,
          deliveredByBrand: mine ? unitsByBrand(mine) : null,
          bonus: bonusEstimate(isFrontline(u.role) ? (d ?? m.upsells) : 0, rule),
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
      basis,
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
