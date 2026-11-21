import { type Brand, type ContributionRow, type OrderStateGroup, shiftDay } from '@touche/domain';
import { type SQL, sql } from 'drizzle-orm';
import type { Db } from '../db/schema.js';

/** Algiers `YYYY-MM-DD` days `from`..`to` as a UTC window [start, end). */
function window(from: string, to: string) {
  return {
    start: new Date(from + 'T00:00:00+01:00').toISOString(),
    end: new Date(shiftDay(to, 1) + 'T00:00:00+01:00').toISOString(),
  };
}

/** The dossier a call belongs to: its reference (case and spaces ignored), or the call alone without one. */
const dossier = (call: string, meta: string) =>
  sql.raw(`CASE WHEN NULLIF(TRIM(${meta}.order_ref), '') IS NOT NULL THEN 'ref:' || UPPER(TRIM(${meta}.order_ref)) ELSE 'call:' || ${call}.id END`);

/**
 * The `ranked` and `tagged` CTEs over the calls `scope` selects (`c` the call, `m` its meta). Voided calls never enter:
 * they neither earn nor block the dossier's rank. `upsell` is the call's added units when it is its dossier's sale.
 */
function rankedSales(scope: SQL) {
  // Unit price and pack components stay per item; multiply each snapshot by its quantity.
  // Missing quantities on historical snapshots retain the original value of one.
  const itemUnits = sql`GREATEST(1, COALESCE((item->>'quantity')::int, 1)) *
    CASE WHEN jsonb_typeof(item->'components') = 'array' AND jsonb_array_length(item->'components') > 0
      THEN (SELECT SUM(GREATEST(1, COALESCE((component->>'quantity')::int, 1)))
            FROM jsonb_array_elements(item->'components') AS component)
      ELSE 1 END`;
  return sql`ranked AS (
 SELECT c.id, c.user_id, c.created_at, c.outcome, c.base_total, c.offered_total, c.extra, c.brand,
  COALESCE(m.order_ref, '') AS order_ref, m.order_state_group, m.order_state_name,
  CASE WHEN m.order_state_group = 'delivered' THEN COALESCE(m.delivered_at, m.order_state_at) END AS delivered_on,
  NULLIF(UPPER(TRIM(m.order_ref)), '') AS ref,
  to_char(c.created_at AT TIME ZONE 'Africa/Algiers', 'YYYY-MM-DD') AS day,
  ROW_NUMBER() OVER (
   PARTITION BY ${dossier('c', 'm')}
   ORDER BY CASE WHEN c.outcome IN ('duo','trio','routine') AND c.extra > 0 THEN 0
                 WHEN c.outcome IN ('duo','trio','routine','initial','refused') AND c.offered_total > 0 THEN 1 ELSE 2 END,
            c.created_at, c.id COLLATE "C") AS sale_rank,
  GREATEST(0,
   (CASE c.outcome WHEN 'duo' THEN 2 WHEN 'trio' THEN 3
    WHEN 'routine' THEN (SELECT COALESCE(SUM(${itemUnits}), 0)
                         FROM jsonb_array_elements(c.products) AS item)
    ELSE 0 END)
   - CASE WHEN jsonb_typeof(m.data->'originals') = 'array' AND jsonb_array_length(m.data->'originals') > 0
          THEN (SELECT SUM(${itemUnits})
                FROM jsonb_array_elements(m.data->'originals') AS item)
          WHEN c.products->0->>'id' = c.base_id AND jsonb_typeof(c.products->0->'components') = 'array'
          THEN (SELECT ${itemUnits} FROM (SELECT c.products->0 AS item) AS original_item) ELSE 1 END
  ) AS added_units
 FROM tc_calls c LEFT JOIN tc_call_meta m ON m.call_id = c.id
 WHERE ${scope}
  AND c.voided_at IS NULL
), tagged AS (
 SELECT *,
  CASE WHEN sale_rank = 1 AND outcome IN ('duo','trio','routine','initial','refused') AND offered_total > 0 THEN 1 ELSE 0 END AS confirmed,
  CASE WHEN sale_rank = 1 AND outcome IN ('duo','trio','routine') AND extra > 0 AND offered_total > base_total THEN added_units ELSE 0 END AS upsell
 FROM ranked
)`;
}

/**
 * PostgreSQL port of the legacy `contributionSql`. Ranking runs over every user of the window;
 * the optional user filter applies afterwards. `from`/`to` are Algiers `YYYY-MM-DD` days.
 *
 * Upsell rule: one upsell per physical product added to the customer's initial order (pack
 * components count as physical products). An accepted duo adds 1 product, a trio adds 2; a
 * single product replaced by its pack of 2 adds 1, plus 1 per further product; an initial pack
 * of 2 or two separate initial products completed into a trio add 1. Only the dossier's rank-1 call counts, and only when it is
 * an accepted routine with a positive extra and an offer above the initial order. `without_ref` and
 * `duplicates` are expressed in the same unit (added products). A voided call counts nowhere:
 * it neither earns nor blocks the dossier's rank.
 */
export async function contributions(
  db: Db,
  from: string,
  to: string,
  userId?: string,
): Promise<ContributionRow[]> {
  const { start, end } = window(from, to);
  const filter = userId === undefined ? sql`` : sql`WHERE user_id = ${userId}`;
  const result = await db.execute(sql`
WITH ${rankedSales(sql`c.created_at >= ${start}::timestamptz AND c.created_at < ${end}::timestamptz`)}
SELECT user_id, day, COUNT(*)::int AS calls, SUM(confirmed)::int AS confirmations, SUM(upsell)::int AS upsells,
 SUM(CASE WHEN confirmed = 1 THEN base_total ELSE 0 END)::int AS initial_dzd,
 SUM(CASE WHEN confirmed = 1 THEN offered_total ELSE 0 END)::int AS confirmed_dzd,
 SUM(CASE WHEN confirmed = 1 THEN offered_total - base_total ELSE 0 END)::int AS uplift_dzd,
 SUM(CASE WHEN ref IS NULL THEN upsell ELSE 0 END)::int AS without_ref,
 SUM(CASE WHEN sale_rank > 1 AND outcome IN ('duo','trio','routine') AND extra > 0 THEN added_units ELSE 0 END)::int AS duplicates
FROM tagged
${filter}
GROUP BY user_id, day ORDER BY day, user_id`);
  return result.rows as unknown as ContributionRow[];
}

/** One upsell sale (a dossier's sale with added units) and the state of its order. */
export type UpsellSale = {
  id: string;
  user_id: string;
  created_at: string;
  order_ref: string;
  brand: Brand;
  outcome: string;
  units: number;
  extra: number;
  order_state_group: OrderStateGroup | null;
  order_state_name: string | null;
  /** The Algiers day the order was delivered (its delivery date, else its state date until the backfill), or null. */
  delivered_day: string | null;
  delivered_at: string | null;
};

/**
 * Upsell sales, with the unit rule of `contributions`, in the Algiers days `from`..`to`:
 * - `sold`: sold in the window (by call date), ranked within the window, as `contributions` counts `upsells`;
 * - `delivered`: delivered in the window (Algiers day of `delivered_at`, else `order_state_at`), whatever the call date.
 *   Their dossiers are ranked over all their calls, so an order delivered once is one sale, paid once.
 */
export async function upsellSales(
  db: Db,
  from: string,
  to: string,
  by: 'sold' | 'delivered',
  userId?: string,
): Promise<UpsellSale[]> {
  const { start, end } = window(from, to);
  const deliveredIn = (meta: string) =>
    sql`${sql.raw(meta)}.order_state_group = 'delivered'
      AND COALESCE(${sql.raw(meta)}.delivered_at, ${sql.raw(meta)}.order_state_at) >= ${start}::timestamptz
      AND COALESCE(${sql.raw(meta)}.delivered_at, ${sql.raw(meta)}.order_state_at) < ${end}::timestamptz`;
  const scope =
    by === 'sold'
      ? sql`c.created_at >= ${start}::timestamptz AND c.created_at < ${end}::timestamptz`
      : sql`${dossier('c', 'm')} IN (SELECT ${dossier('dc', 'dm')} FROM tc_calls dc JOIN tc_call_meta dm ON dm.call_id = dc.id
          WHERE dc.voided_at IS NULL AND ${deliveredIn('dm')})`;
  const result = await db.execute(sql`
WITH ${rankedSales(scope)}
SELECT id, user_id, created_at, order_ref, brand, outcome, upsell::int AS units, extra::int AS extra,
 order_state_group, order_state_name, delivered_on AS delivered_at,
 to_char(delivered_on AT TIME ZONE 'Africa/Algiers', 'YYYY-MM-DD') AS delivered_day
FROM tagged
WHERE upsell > 0
 ${by === 'delivered' ? sql`AND delivered_on >= ${start}::timestamptz AND delivered_on < ${end}::timestamptz` : sql``}
 ${userId === undefined ? sql`` : sql`AND user_id = ${userId}`}
ORDER BY created_at DESC, id`);
  const iso = (value: unknown) => (value === null || value === undefined ? null : new Date(value as string).toISOString());
  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    ...(r as unknown as UpsellSale),
    created_at: iso(r.created_at)!,
    delivered_at: iso(r.delivered_at),
    units: Number(r.units),
    extra: Number(r.extra),
  }));
}
