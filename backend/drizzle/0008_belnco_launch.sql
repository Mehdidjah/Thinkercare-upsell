-- 2026-11-21, the owner's request: « 100% PURE PRICKLY PEAR OIL » and the « DOUBLE cleansing ritual » leave the catalogue,
-- with any copy of them added by hand in Gestion. A row that a saved call, its details or an offer names is switched off
-- instead of deleted, so that history still reads. Double cleansing is now the Cleansing Oil then the Cleansing Gel.
UPDATE "tc_products" SET "data" = jsonb_set("data", '{enabled}', 'false'::jsonb)
WHERE "id" IN ('bel-pear', 'bel-ritual') OR upper(trim("data"->>'name')) IN ('100% PURE PRICKLY PEAR OIL', 'DOUBLE CLEANSING RITUAL');--> statement-breakpoint
DELETE FROM "tc_products" p
WHERE (p."id" IN ('bel-pear', 'bel-ritual') OR upper(trim(p."data"->>'name')) IN ('100% PURE PRICKLY PEAR OIL', 'DOUBLE CLEANSING RITUAL'))
  AND NOT EXISTS (SELECT 1 FROM "tc_calls" c WHERE c."base_id" = p."id" OR c."products"::text LIKE '%"' || p."id" || '"%')
  AND NOT EXISTS (SELECT 1 FROM "tc_call_meta" m WHERE m."data"::text LIKE '%"' || p."id" || '"%')
  AND NOT EXISTS (SELECT 1 FROM "tc_proposals" r WHERE r."snapshot"::text LIKE '%"' || p."id" || '"%');--> statement-breakpoint
-- The other BEL.NCO products go live; the sold-out Tinted Serum stays off. The API serving while this applies is brand-aware.
UPDATE "tc_products" SET "data" = jsonb_set("data", '{enabled}', 'true'::jsonb)
WHERE "id" IN ('bel-oil', 'bel-gel', 'bel-spf30', 'bel-clarifying', 'bel-retinol', 'bel-moist', 'bel-uv50');
