import { countedCalls, summary, type ActivityCall } from './analytics.js';
import { BRANDS, BRAND_LABELS, BRAND_PREFIXES, brandOf, type Brand } from './brands.js';

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
 *  Forms typed before the check are read too: a separator after the store letters (`TOU-1763816`), a leading `#`, a
 *  trailing dot. Digits are never joined across a separator (`1763816-2` is not an order). `prefix` comes from
 *  configuration, validated as 2–6 capital letters. */
export function parseOrderReference(raw: string, prefix = 'TOU'): { reference: string; id: number } | null {
  const value = normalizeOrderReference(raw).replace(/^#+/, '').replace(/\.+$/, '');
  const digits = value.startsWith(prefix) ? value.slice(prefix.length).replace(/^[-_.#]+/, '') : value;
  if (!/^\d{4,12}$/.test(digits)) return null;
  const id = Number(digits);
  // One order, one reference: leading zeros typed by mistake (TOU01763816) are the same order as TOU1763816.
  return Number.isSafeInteger(id) && id > 0 ? { reference: prefix + String(id), id } : null;
}

/** The brand whose full store prefix starts the typed reference (`bel…` is BEL.NCO), or null while none does. */
export function referenceBrand(raw: string, prefixes: Record<Brand, string> = BRAND_PREFIXES): Brand | null {
  const value = normalizeOrderReference(raw).replace(/^#+/, '');
  return BRANDS.find((b) => value.startsWith(prefixes[b])) ?? null;
}

/** A reference read against the call's brand: a typed prefix names its own store (`TOU…` stays Touché on a BEL.NCO
 *  call), a number alone takes the call's store prefix. */
export function parseBrandReference(
  raw: string,
  brand: Brand,
  prefixes: Record<Brand, string> = BRAND_PREFIXES,
): { reference: string; id: number; brand: Brand } | null {
  const store = referenceBrand(raw, prefixes) ?? brand;
  const parsed = parseOrderReference(raw, prefixes[store]);
  return parsed ? { ...parsed, brand: store } : null;
}

export const orderReferenceHint = (brand: Brand): string =>
  brand === 'touche'
    ? ORDER_REFERENCE_HINT
    : `Une référence commence par ${BRAND_PREFIXES[brand]} suivie du numéro de commande, par exemple ${BRAND_PREFIXES[brand]}1763838.`;

export const referenceBrandMismatch = (reference: Brand, call: Brand): string =>
  `Cette référence est une commande ${BRAND_LABELS[reference]} : l’appel est un appel ${BRAND_LABELS[call]}. Changez la marque de l’appel ou corrigez la référence.`;

const ACCEPTED = new Set(['duo', 'trio', 'routine']);
const GROUPS: OrderStateGroup[] = ['delivered', 'shipping', 'pending', 'failed', 'unknown'];
const byGroup = () => ({ delivered: 0, shipping: 0, pending: 0, failed: 0, unknown: 0 }) as Record<OrderStateGroup, number>;

/** Delivery of the accepted upsells (voided calls left out), in orders and in money: `extra` is the supplement the
 *  upsell added, `total` the value of the whole order after it. rate = delivered ÷ (delivered + not delivered), in
 *  orders; valueRate the same in supplement. */
export function upsellDelivery(calls: ActivityCall[]) {
  const count = byGroup(), extra = byGroup(), total = byGroup();
  // Why an order has no state: no reference typed, not yet synchronised, unknown to EcoManager, not a reference, or a
  // state EcoManager named in a way the groups do not know.
  const unknownWhy = { noRef: 0, syncing: 0, notFound: 0, unrecognized: 0, other: 0 };
  for (const c of calls) {
    if (!ACCEPTED.has(c.outcome) || c.voided_at) continue;
    const group = GROUPS.includes(c.order_state_group as OrderStateGroup) ? (c.order_state_group as OrderStateGroup) : 'unknown';
    count[group]++;
    extra[group] += c.extra || 0;
    total[group] += c.offered_total || 0;
    if (group !== 'unknown') continue;
    if (!c.meta?.orderRef?.trim()) unknownWhy.noRef++;
    else if (c.order_check === 'not-found') unknownWhy.notFound++;
    else if (c.order_check === 'unrecognized') unknownWhy.unrecognized++;
    else if (c.order_check === 'verified') unknownWhy.other++;
    else unknownWhy.syncing++;
  }
  const settled = count.delivered + count.failed, settledExtra = extra.delivered + extra.failed;
  return {
    ...count,
    rate: settled > 0 ? count.delivered / settled : null,
    deliveredExtra: extra.delivered,
    extra,
    total,
    valueRate: settledExtra > 0 ? extra.delivered / settledExtra : null,
    unknownWhy,
  };
}

/** One column of Pilotage's « Par marque »: the overview's figures (`summary`) and the delivery card's
 *  (`upsellDelivery`), with the same definitions. Rates are null when nothing is measured. */
export type BrandFigures = {
  closed: number;
  orders: number;
  won: number;
  extra: number;
  acceptRate: number | null;
  delivered: number;
  deliveredExtra: number;
  failed: number;
  failedExtra: number;
  deliveryRate: number | null;
};

function brandFigures(calls: ActivityCall[], orders?: number): BrandFigures {
  const s = summary(calls), d = upsellDelivery(calls);
  return {
    closed: s.closed,
    orders: orders ?? s.refs,
    won: s.won,
    extra: s.extra,
    acceptRate: s.acceptRate,
    delivered: d.delivered,
    deliveredExtra: d.extra.delivered,
    failed: d.failed,
    failedExtra: d.extra.failed,
    deliveryRate: d.rate,
  };
}

/** Each brand's figures side by side, and their total (voided calls left out; a call without a brand is Touché).
 *  Every count of a brand column sums to the total. A dossier is an order of its brand's store, so the total of
 *  orders is the sum of each brand's distinct references. */
export function byBrand(calls: ActivityCall[]): Record<Brand | 'total', BrandFigures> {
  const counted = countedCalls(calls);
  const columns = Object.fromEntries(BRANDS.map((b) => [b, brandFigures(counted.filter((c) => brandOf(c) === b))])) as Record<Brand, BrandFigures>;
  return { ...columns, total: brandFigures(counted, BRANDS.reduce((sum, b) => sum + columns[b].orders, 0)) };
}
