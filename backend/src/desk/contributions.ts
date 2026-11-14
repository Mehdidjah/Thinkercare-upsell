import { shiftDay, type ContributionRow } from '@touche/domain';
import { sql } from 'drizzle-orm';
import type { Db } from '../db/schema.js';

/**
 * PostgreSQL port of the legacy `contributionSql`. Ranking runs over every user of the window;
 * the optional user filter applies afterwards. `from`/`to` are Algiers `YYYY-MM-DD` days.
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
   ORDER BY CASE WHEN c.outcome IN ('duo','trio') AND c.extra > 0 THEN 0
                 WHEN c.outcome IN ('duo','trio','initial','refused') AND c.offered_total > 0 THEN 1 ELSE 2 END,
            c.created_at, c.id COLLATE "C") AS sale_rank
 FROM tc_calls c LEFT JOIN tc_call_meta m ON m.call_id = c.id
 WHERE c.created_at >= ${start}::timestamptz AND c.created_at < ${end}::timestamptz
), tagged AS (
 SELECT *,
  CASE WHEN sale_rank = 1 AND outcome IN ('duo','trio','initial','refused') AND offered_total > 0 THEN 1 ELSE 0 END AS confirmed,
  CASE WHEN sale_rank = 1 AND outcome IN ('duo','trio') AND extra > 0 AND offered_total > base_total THEN 1 ELSE 0 END AS upsell
 FROM ranked
)
SELECT user_id, day, COUNT(*)::int AS calls, SUM(confirmed)::int AS confirmations, SUM(upsell)::int AS upsells,
 SUM(CASE WHEN confirmed = 1 THEN base_total ELSE 0 END)::int AS initial_dzd,
 SUM(CASE WHEN confirmed = 1 THEN offered_total ELSE 0 END)::int AS confirmed_dzd,
 SUM(CASE WHEN confirmed = 1 THEN offered_total - base_total ELSE 0 END)::int AS uplift_dzd,
 SUM(CASE WHEN upsell = 1 AND ref IS NULL THEN 1 ELSE 0 END)::int AS without_ref,
 SUM(CASE WHEN sale_rank > 1 AND outcome IN ('duo','trio') AND extra > 0 THEN 1 ELSE 0 END)::int AS duplicates
FROM tagged
${filter}
GROUP BY user_id, day ORDER BY day, user_id`);
  return result.rows as unknown as ContributionRow[];
}
