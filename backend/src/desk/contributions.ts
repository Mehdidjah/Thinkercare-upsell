import { shiftDay, type ContributionRow } from '@touche/domain';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/schema.js';

/**
 * PostgreSQL port of the legacy `contributionSql`. Ranking runs over every user of the window;
 * the optional user filter applies afterwards. `from`/`to` are Algiers `YYYY-MM-DD` days.
 *
 * Upsell rule: one upsell per physical product added to the customer's initial order (pack
 * components count as physical products). An accepted duo adds 1 product, a trio adds 2; a
 * single product replaced by its pack of 2 adds 1, plus 1 per further product; an initial pack
 * of 2 or two separate initial products completed into a trio add 1. Only the dossier's rank-1 call counts, and only when it is
 * an accepted routine with a positive extra and an offer above the initial order. `without_ref` and
 * `duplicates` are expressed in the same unit (added products).
 */
export async function contributions(
  db: Db,
  from: string,
  to: string,
  userId?: string,
): Promise<ContributionRow[]> {
  const start = new Date(from + 'T00:00:00+01:00').toISOString();
  const end = new Date(shiftDay(to, 1) + 'T00:00:00+01:00').toISOString();
  const filter = userId === undefined ? sql`` : sql`WHERE user_id = ${userId}`;
  const result = await db.execute(sql`
WITH ranked AS (
 SELECT c.id, c.user_id, c.created_at, c.outcome, c.base_total, c.offered_total, c.extra,
  NULLIF(UPPER(TRIM(m.order_ref)), '') AS ref,
  to_char(c.created_at AT TIME ZONE 'Africa/Algiers', 'YYYY-MM-DD') AS day,
  ROW_NUMBER() OVER (
   PARTITION BY CASE WHEN NULLIF(TRIM(m.order_ref), '') IS NOT NULL THEN 'ref:' || UPPER(TRIM(m.order_ref)) ELSE 'call:' || c.id END
   ORDER BY CASE WHEN c.outcome IN ('duo','trio','routine') AND c.extra > 0 THEN 0
                 WHEN c.outcome IN ('duo','trio','routine','initial','refused') AND c.offered_total > 0 THEN 1 ELSE 2 END,
            c.created_at, c.id COLLATE "C") AS sale_rank,
  GREATEST(0,
   (CASE c.outcome WHEN 'duo' THEN 2 WHEN 'trio' THEN 3
    WHEN 'routine' THEN (SELECT COALESCE(SUM(CASE WHEN jsonb_typeof(item->'components') = 'array'
                         THEN GREATEST(1, jsonb_array_length(item->'components')) ELSE 1 END), 0)
                         FROM jsonb_array_elements(c.products) AS item)
    ELSE 0 END)
   - CASE WHEN jsonb_typeof(m.data->'originals') = 'array' AND jsonb_array_length(m.data->'originals') > 0
          THEN (SELECT SUM(CASE WHEN jsonb_typeof(item->'components') = 'array'
                            THEN GREATEST(1, jsonb_array_length(item->'components')) ELSE 1 END)
                FROM jsonb_array_elements(m.data->'originals') AS item)
          WHEN c.products->0->>'id' = c.base_id AND jsonb_typeof(c.products->0->'components') = 'array'
          THEN GREATEST(1, jsonb_array_length(c.products->0->'components')) ELSE 1 END
  ) AS added_units
 FROM tc_calls c LEFT JOIN tc_call_meta m ON m.call_id = c.id
 WHERE c.created_at >= ${start}::timestamptz AND c.created_at < ${end}::timestamptz
), tagged AS (
 SELECT *,
  CASE WHEN sale_rank = 1 AND outcome IN ('duo','trio','routine','initial','refused') AND offered_total > 0 THEN 1 ELSE 0 END AS confirmed,
  CASE WHEN sale_rank = 1 AND outcome IN ('duo','trio','routine') AND extra > 0 AND offered_total > base_total THEN added_units ELSE 0 END AS upsell
 FROM ranked
)
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
