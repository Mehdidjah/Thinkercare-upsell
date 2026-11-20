import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import { type Brand, FINAL_ORDER_STATES, parseOrderReference } from '@touche/domain';
import { and, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import type { Pool, PoolClient } from 'pg';
import { ENV, type Env } from '../config/env.js';
import { type Db, tcCallMeta, tcCalls } from '../db/schema.js';
import { OrdersService } from './orders.service.js';

/** One catch-up at a time across every API instance (Postgres advisory lock key). */
const LOCK_KEY = 74726;

/** Recorded calls (not voided) of the brands whose store is configured: a store without a token is neither checked
 *  nor counted, so its calls never hold the queue up. */
const activeOf = (brands: Brand[]) =>
  brands.length
    ? sql`${tcCallMeta.call_id} IN (SELECT id FROM tc_calls WHERE voided_at IS NULL AND brand IN (${sql.join(brands.map((b) => sql`${b}`), sql`, `)}))`
    : sql`false`;

/** The calls of one brand. */
const ofBrand = (brand: Brand) => sql`${tcCallMeta.call_id} IN (SELECT id FROM tc_calls WHERE brand = ${brand})`;

/**
 * Gives every recorded call the state of its EcoManager order, so Pilotage can count delivered upsells: calls from
 * before the order check (or from older tabs, whatever their date), calls saved « à vérifier », references that read
 * as an order once older forms are understood, and orders not in a final state whose state is more than a day old. Runs every 2 minutes in the background lane of the EcoManager client (half its quota).
 * Each call is checked in the store of its brand, with that store's client (TOU, and BEL once its token is set).
 */
@Injectable()
export class OrderSyncService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('EcoManager');
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(
    @InjectDrizzle() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly orders: OrdersService,
  ) {}

  onModuleInit(): void {
    const every = this.env.ecomanager?.syncIntervalMs ?? 0;
    if (!this.orders.enabled || every <= 0) return;
    this.timer = setInterval(() => void this.tick(), every);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const r = await this.runOnce();
      if (r.checked) this.logger.log(`Synchronisation des commandes : ${r.checked} référence(s) vérifiée(s), ${r.remaining} restante(s).`);
    } catch (error) {
      this.logger.warn(`Synchronisation des commandes interrompue : ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  private active() {
    return activeOf(this.orders.brands());
  }

  /** The calls still waiting for an order state: not checked, « à vérifier », or a non-final state older than a day. */
  private due() {
    const finals = sql.join(FINAL_ORDER_STATES.map((name) => sql`${name}`), sql`, `);
    return sql`${tcCallMeta.order_ref} <> '' AND ${this.active()} AND (
      ${tcCallMeta.order_check} IN ('', 'unverified')
      OR (${tcCallMeta.order_check} = 'verified'
        AND (${tcCallMeta.order_state_name} IS NULL OR ${tcCallMeta.order_state_name} NOT IN (${finals}))
        AND (${tcCallMeta.order_synced_at} IS NULL OR ${tcCallMeta.order_synced_at} < now() - interval '24 hours')))`;
  }

  /** Checks up to `limit` references (one EcoManager request per order, shared by every call on it). */
  async runOnce(limit = 20): Promise<{ checked: number; updated: number; remaining: number }> {
    if (!this.orders.enabled) return { checked: 0, updated: 0, remaining: 0 };
    const active = this.active();
    // The advisory lock lives on one pooled connection (session lock), held only by this run; the work itself uses
    // short separate statements so webhooks updating the same rows are never kept waiting.
    const pool = (this.db as unknown as { $client?: Pool }).$client;
    const connection: PoolClient | undefined = pool && typeof pool.connect === 'function' ? await pool.connect() : undefined;
    let checked = 0;
    let updated = 0;
    try {
      const lock = connection ? await connection.query('SELECT pg_try_advisory_lock($1) AS ok', [LOCK_KEY]) : { rows: [{ ok: true }] };
      if (!lock.rows[0]?.ok) return { checked, updated, remaining: await this.remaining() };
      try {
        await this.requeueReadable();
        // A reference is one order per store: the same text on a Touché and a BEL.NCO call is looked up in each store.
        const refs = await this.db
          .select({
            ref: tcCallMeta.order_ref,
            brand: tcCalls.brand,
            rank: sql<number>`min(CASE ${tcCallMeta.order_check} WHEN '' THEN 0 WHEN 'unverified' THEN 1 ELSE 2 END)`,
          })
          .from(tcCallMeta)
          .innerJoin(tcCalls, eq(tcCalls.id, tcCallMeta.call_id))
          .where(this.due())
          .groupBy(tcCallMeta.order_ref, tcCalls.brand)
          // Within a rank, references never tried come first: one that failed or was just checked waits its turn.
          .orderBy(sql`3`, sql`min(${tcCallMeta.order_synced_at}) NULLS FIRST`, tcCallMeta.order_ref, tcCalls.brand)
          .limit(limit);
        // A store that is down or out of quota is left for the next run; the other store's references go on.
        const stopped = new Set<Brand>();
        for (const { ref, brand } of refs) {
          const client = this.orders.clientFor(brand);
          if (!client || stopped.has(brand)) continue;
          const all = and(eq(tcCallMeta.order_ref, ref), active, ofBrand(brand));
          const unchecked = and(eq(tcCallMeta.order_ref, ref), inArray(tcCallMeta.order_check, ['', 'unverified']), active, ofBrand(brand));
          const parsed = parseOrderReference(ref, this.orders.prefixes[brand]);
          if (!parsed) {
            updated += await this.mark(unchecked, { order_check: 'unrecognized', order_synced_at: new Date() });
            checked++;
            continue;
          }
          const result = await client.lookup(parsed.reference, 'background');
          if (result.status === 'unavailable') {
            // EcoManager down or out of quota: stop this store and resume later. One order answering an error: move on.
            if (result.reason !== 'server') {
              stopped.add(brand);
              continue;
            }
            await this.mark(all, { order_synced_at: new Date() });
            continue;
          }
          if (result.status === 'not-found') {
            updated += await this.mark(unchecked, { order_check: 'not-found', order_synced_at: new Date() });
            // A call verified earlier keeps its last known state; it is checked again in a day, not on every run.
            await this.mark(and(all, eq(tcCallMeta.order_check, 'verified')), { order_synced_at: new Date() });
          } else {
            const { order } = result;
            const newer = order.updatedAt ? or(isNull(tcCallMeta.order_state_at), lte(tcCallMeta.order_state_at, new Date(order.updatedAt))) : undefined;
            await this.mark(all, { order_synced_at: new Date() });
            updated += await this.mark(and(all, newer), {
              ecomanager_order_id: String(order.id),
              order_check: 'verified',
              order_state_group: order.stateGroup,
              order_state_name: order.stateName,
              order_state_at: order.updatedAt ? new Date(order.updatedAt) : new Date(),
              order_synced_at: new Date(),
            });
          }
          checked++;
        }
      } finally {
        await connection?.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]);
      }
    } finally {
      connection?.release();
    }
    return { checked, updated, remaining: await this.remaining() };
  }

  /** Calls marked « non reconnue » whose reference now reads as an order of their brand's store (older forms such as
   *  TOU-1763816 or #1763816) go back in the queue. Few references are ever unrecognized, so this stays a small query. */
  private async requeueReadable(): Promise<void> {
    const active = this.active();
    const rows = await this.db
      .selectDistinct({ ref: tcCallMeta.order_ref, brand: tcCalls.brand })
      .from(tcCallMeta)
      .innerJoin(tcCalls, eq(tcCalls.id, tcCallMeta.call_id))
      .where(and(eq(tcCallMeta.order_check, 'unrecognized'), active));
    for (const brand of this.orders.brands()) {
      const readable = rows.filter((row) => row.brand === brand && parseOrderReference(row.ref, this.orders.prefixes[brand])).map((row) => row.ref);
      if (readable.length) await this.mark(and(inArray(tcCallMeta.order_ref, readable), eq(tcCallMeta.order_check, 'unrecognized'), active, ofBrand(brand)), { order_check: '' });
    }
  }

  private async mark(where: ReturnType<typeof and>, values: Partial<typeof tcCallMeta.$inferInsert>): Promise<number> {
    const rows = await this.db.update(tcCallMeta).set(values).where(where).returning({ id: tcCallMeta.call_id });
    return rows.length;
  }

  private async remaining(): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(DISTINCT ${tcCallMeta.order_ref})::int` })
      .from(tcCallMeta)
      .where(this.due());
    return row?.n ?? 0;
  }

  /** How far the catch-up is, over recorded calls (not voided) that name a dossier. */
  async status(): Promise<{ total: number; known: number; pending: number; notFound: number; unrecognized: number }> {
    const [row] = await this.db
      .select({
        total: sql<number>`count(*)::int`,
        known: sql<number>`(count(*) FILTER (WHERE ${tcCallMeta.order_state_group} IS NOT NULL))::int`,
        pending: sql<number>`(count(*) FILTER (WHERE ${tcCallMeta.order_check} IN ('', 'unverified')))::int`,
        notFound: sql<number>`(count(*) FILTER (WHERE ${tcCallMeta.order_check} = 'not-found'))::int`,
        unrecognized: sql<number>`(count(*) FILTER (WHERE ${tcCallMeta.order_check} = 'unrecognized'))::int`,
      })
      .from(tcCallMeta)
      .where(sql`${tcCallMeta.order_ref} <> '' AND ${this.active()}`);
    return row ?? { total: 0, known: 0, pending: 0, notFound: 0, unrecognized: 0 };
  }
}
