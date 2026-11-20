import { Logger } from '@nestjs/common';
import { type OrderStateGroup, orderStateGroup, parseOrderReference } from '@touche/domain';
import type { EcoManagerEnv } from '../config/env.js';
import { ECOMANAGER_WINDOWS, type Lane, RateLimiter } from './rate-limiter.js';

/** What ThinkerCare keeps of an EcoManager order: never the customer's name, phone, e-mail or address. */
export type EcoOrder = {
  id: number;
  reference: string;
  stateId: number | null;
  stateName: string | null;
  stateGroup: OrderStateGroup;
  confirmationStateName: string | null;
  updatedAt: string | null;
};

export type OrderLookup =
  | { status: 'found'; order: EcoOrder }
  | { status: 'not-found' }
  | { status: 'unavailable'; reason: 'timeout' | 'rate-limited' | 'server' | 'network' };

type Deps = { fetch?: typeof fetch; now?: () => number; sleep?: (ms: number) => Promise<void> };

const FOUND_TTL = 10 * 60_000;
const NOT_FOUND_TTL = 2 * 60_000;
const MAX_CACHE = 2_000;
const MAX_QUEUE_WAIT = 10_000;
const MAX_RETRY_AFTER = 10_000;

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** EcoManager dates have no zone ("2026-11-20 14:59:32"): they are Algiers time (UTC+1, no daylight saving). */
function algiersIso(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)) return raw.replace(' ', 'T') + '+01:00';
  return Number.isNaN(Date.parse(raw)) ? null : raw;
}

/** Reads orders from the EcoManager shop API, within its quotas, with a short cache. Process-wide singleton. */
export class EcoManagerClient {
  private readonly logger = new Logger('EcoManager');
  private readonly fetch: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly limiter: RateLimiter;
  private readonly cache = new Map<number, { result: OrderLookup; expires: number }>();
  private readonly inflight = new Map<number, Promise<OrderLookup>>();

  constructor(private readonly cfg: EcoManagerEnv, deps: Deps = {}) {
    this.fetch = deps.fetch ?? globalThis.fetch.bind(globalThis);
    this.now = deps.now ?? Date.now;
    this.sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.limiter = new RateLimiter(ECOMANAGER_WINDOWS, this.now, this.sleep);
  }

  get prefix(): string {
    return this.cfg.prefix;
  }

  /** The order behind a reference typed by an adviser (`TOU1763816` or `1763816`). */
  async lookup(reference: string, lane: Lane = 'live'): Promise<OrderLookup> {
    const parsed = parseOrderReference(reference, this.cfg.prefix);
    if (!parsed) return { status: 'not-found' };
    const cached = this.cache.get(parsed.id);
    if (cached && cached.expires > this.now()) return cached.result;
    const running = this.inflight.get(parsed.id);
    if (running) return running;
    const request = this.request(parsed, lane).finally(() => this.inflight.delete(parsed.id));
    this.inflight.set(parsed.id, request);
    return request;
  }

  /** An order state received from a webhook: later lookups answer from it. */
  remember(order: EcoOrder): void {
    this.store(order.id, { status: 'found', order }, FOUND_TTL);
  }

  /** The fields kept from an EcoManager order JSON (single-order answer or webhook payload). */
  toEcoOrder(json: unknown): EcoOrder | null {
    const body = json && typeof json === 'object' && 'data' in json ? (json as { data: unknown }).data : json;
    if (!body || typeof body !== 'object') return null;
    const o = body as Record<string, unknown>;
    const id = typeof o.id === 'number' ? o.id : Number(o.id);
    const reference = text(o.reference)?.toUpperCase();
    if (!Number.isSafeInteger(id) || !reference) return null;
    const stateId = typeof o.order_state_id === 'number' ? o.order_state_id : null;
    const stateName = text(o.order_state_name);
    return {
      id,
      reference,
      stateId,
      stateName,
      stateGroup: orderStateGroup({ id: stateId, name: stateName }),
      confirmationStateName: text(o.confirmation_state_name),
      updatedAt: algiersIso(o.updated_at),
    };
  }

  private async request(parsed: { reference: string; id: number }, lane: Lane): Promise<OrderLookup> {
    for (let attempt = 0; ; attempt++) {
      if (!(await this.limiter.take(MAX_QUEUE_WAIT, lane))) return { status: 'unavailable', reason: 'rate-limited' };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
      let response: Response;
      try {
        response = await this.fetch(`${this.cfg.baseUrl}/api/shop/v2/orders/${parsed.id}`, {
          headers: { Authorization: `Bearer ${this.cfg.token}`, Accept: 'application/json' },
          signal: controller.signal,
        });
      } catch {
        return { status: 'unavailable', reason: controller.signal.aborted ? 'timeout' : 'network' };
      } finally {
        clearTimeout(timer);
      }
      if (response.status === 404) return this.store(parsed.id, { status: 'not-found' }, NOT_FOUND_TTL);
      if (response.status === 429) {
        if (attempt > 0) return { status: 'unavailable', reason: 'rate-limited' };
        const seconds = Number(response.headers.get('retry-after'));
        await this.sleep(Math.min(Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 2_000, MAX_RETRY_AFTER));
        continue;
      }
      if (!response.ok) {
        // Never log the token or the body (it may hold customer data).
        this.logger.warn(`EcoManager a répondu ${response.status} pour une commande.`);
        return { status: 'unavailable', reason: 'server' };
      }
      let order: EcoOrder | null = null;
      try {
        order = this.toEcoOrder(await response.json());
      } catch {
        return { status: 'unavailable', reason: 'server' };
      }
      if (!order || order.reference !== parsed.reference) return this.store(parsed.id, { status: 'not-found' }, NOT_FOUND_TTL);
      return this.store(parsed.id, { status: 'found', order }, FOUND_TTL);
    }
  }

  private store(id: number, result: OrderLookup, ttl: number): OrderLookup {
    this.cache.delete(id);
    this.cache.set(id, { result, expires: this.now() + ttl });
    while (this.cache.size > MAX_CACHE) this.cache.delete(this.cache.keys().next().value!);
    return result;
  }
}
