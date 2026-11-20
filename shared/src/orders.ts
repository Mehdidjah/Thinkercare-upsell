import type { ActivityCall } from './analytics.js';

/** EcoManager order rules shared by the desk and the API: references, state groups, upsell delivery. */

export type OrderStateGroup = 'pending' | 'shipping' | 'delivered' | 'failed' | 'unknown';

export const ORDER_STATE_GROUP_LABELS: Record<OrderStateGroup, string> = {
  pending: 'Pas encore expédiée',
  shipping: 'En cours de livraison',
  delivered: 'Livrée',
  failed: 'Non livrée',
  unknown: 'État inconnu',
};

/** How a call's order was checked: not yet, found, EcoManager unreachable, unknown to EcoManager, not a reference. */
export type OrderCheckStatus = '' | 'verified' | 'unverified' | 'not-found' | 'unrecognized';

export const ORDER_CHECK_LABELS: Record<OrderCheckStatus, string> = {
  '': 'Non vérifiée',
  verified: 'Vérifiée',
  unverified: 'À vérifier',
  'not-found': 'Introuvable dans EcoManager',
  unrecognized: 'Référence non reconnue',
};

export const ORDER_REFERENCE_HINT =
  'Une référence commence par TOU suivie du numéro de commande, par exemple TOU1763816.';

const plain = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

const GROUP_BY_NAME: Record<string, OrderStateGroup> = {
  'en confirmation': 'pending',
  'en preparation': 'pending',
  'en dispatch': 'pending',
  'en livraison': 'shipping',
  livree: 'delivered',
  encaissee: 'delivered',
  'en retour': 'failed',
  retournee: 'failed',
  annulee: 'failed',
};

const GROUP_BY_ID: Record<number, OrderStateGroup> = {
  1: 'pending',
  2: 'pending',
  3: 'pending',
  4: 'shipping',
  5: 'delivered',
  6: 'failed',
  7: 'delivered',
  8: 'failed',
  9: 'failed',
};

/** The group of an EcoManager order state, by its name first (ids may differ between accounts), then by its id. */
export function orderStateGroup(state: { id?: number | null; name?: string | null }): OrderStateGroup {
  const byName = state.name ? GROUP_BY_NAME[plain(state.name)] : undefined;
  if (byName) return byName;
  if (!state.name && typeof state.id === 'number' && GROUP_BY_ID[state.id]) return GROUP_BY_ID[state.id];
  return 'unknown';
}

/** States an order does not leave: no refresh is needed once there. « En retour » still becomes « Retournée ». */
export const FINAL_ORDER_STATES = ['Livrée', 'Encaissée', 'Retournée', 'Annulée'];
const FINAL = new Set(FINAL_ORDER_STATES.map(plain));
export const isFinalOrderState = (name: string | null | undefined): boolean => !!name && FINAL.has(plain(name));

export const normalizeOrderReference = (raw: string): string => raw.replace(/\s+/g, '').toUpperCase();

/** `TOU1763816`, `tou 1763816` or just `1763816` (read as the store's order number); anything else is not a reference.
 *  `prefix` comes from configuration, validated as 2–6 capital letters. */
export function parseOrderReference(raw: string, prefix = 'TOU'): { reference: string; id: number } | null {
  const value = normalizeOrderReference(raw);
  const digits = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  if (!/^\d{4,12}$/.test(digits)) return null;
  const id = Number(digits);
  return Number.isSafeInteger(id) ? { reference: prefix + digits, id } : null;
}

const ACCEPTED = new Set(['duo', 'trio', 'routine']);

/** Delivery of the accepted upsells (voided calls left out): rate = delivered ÷ (delivered + not delivered). */
export function upsellDelivery(calls: ActivityCall[]) {
  const r = { delivered: 0, shipping: 0, pending: 0, failed: 0, unknown: 0, rate: null as number | null, deliveredExtra: 0 };
  for (const c of calls) {
    if (!ACCEPTED.has(c.outcome) || c.voided_at) continue;
    const group = (c.order_state_group || 'unknown') as OrderStateGroup;
    if (group === 'delivered') {
      r.delivered++;
      r.deliveredExtra += c.extra || 0;
    } else if (group === 'shipping') r.shipping++;
    else if (group === 'pending') r.pending++;
    else if (group === 'failed') r.failed++;
    else r.unknown++;
  }
  r.rate = r.delivered + r.failed > 0 ? r.delivered / (r.delivered + r.failed) : null;
  return r;
}
