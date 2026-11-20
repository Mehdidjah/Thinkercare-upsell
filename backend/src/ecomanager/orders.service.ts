import { Inject, Injectable } from '@nestjs/common';
import { BRANDS, BRAND_PREFIXES, type Brand, ORDER_STATE_GROUP_LABELS, orderReferenceHint, parseBrandReference, referenceBrandMismatch } from '@touche/domain';
import { DeskError } from '../common/http.js';
import { ENV, type Env } from '../config/env.js';
import type { DeskUser } from '../desk/desk.types.js';
import { EcoManagerClient, type EcoOrder, type OrderLookup } from './client.js';

const PER_USER_WINDOW = 60_000;
const PER_USER_MAX = 30;

export const orderNotFound = (reference: string) =>
  new DeskError(404, `Commande ${reference} introuvable dans EcoManager. Vérifiez la référence.`, 'order-not-found');

/** What the desk receives about an order: its number, reference and state, never customer data. */
export const deskOrder = (order: EcoOrder) => ({
  id: order.id,
  reference: order.reference,
  stateGroup: order.stateGroup,
  stateLabel: ORDER_STATE_GROUP_LABELS[order.stateGroup],
  stateName: order.stateName,
  confirmationStateName: order.confirmationStateName,
  updatedAt: order.updatedAt,
});

const checkOff = () => new DeskError(404, 'Vérification de commande non configurée.', 'order-check-off');

/** EcoManager order checks for the desk: off (no client) until ECOMANAGER_API_TOKEN is set. One client per store, each
 *  with its own cache and quota: the TOU store, and the BEL store once ECOMANAGER_BEL_API_TOKEN is set too. */
@Injectable()
export class OrdersService {
  /** The TOU store (Touché). */
  readonly client: EcoManagerClient | null;
  /** The store letters of each brand's references (the TOU store's come from configuration). */
  readonly prefixes: Record<Brand, string>;
  private readonly clients: Record<Brand, EcoManagerClient | null>;
  private readonly recent = new Map<string, number[]>();

  constructor(@Inject(ENV) env: Env) {
    const eco = env.ecomanager;
    this.prefixes = { touche: eco?.prefix ?? BRAND_PREFIXES.touche, belnco: BRAND_PREFIXES.belnco };
    this.client = eco ? new EcoManagerClient(eco) : null;
    const bel = eco?.belToken ? new EcoManagerClient({ ...eco, token: eco.belToken, prefix: this.prefixes.belnco }) : null;
    this.clients = { touche: this.client, belnco: bel };
  }

  /** The TOU store is configured. */
  get enabled(): boolean {
    return this.client !== null;
  }

  clientFor(brand: Brand): EcoManagerClient | null {
    return this.clients[brand];
  }

  enabledFor(brand: Brand): boolean {
    return this.clients[brand] !== null;
  }

  /** The brands whose store is configured. */
  brands(): Brand[] {
    return BRANDS.filter((b) => this.clients[b]);
  }

  /** The configured store an order belongs to: its reference is that store's letters and the order number. */
  storeFor(order: EcoOrder): Brand | null {
    return this.brands().find((b) => this.prefixes[b] + order.id === order.reference) ?? null;
  }

  /** A lookup asked by an adviser while typing: limited to 30 a minute per account. */
  async check(user: DeskUser, raw: string, brand: Brand = 'touche'): Promise<OrderLookup & { reference: string }> {
    if (!this.clients[brand]) throw checkOff();
    const now = Date.now();
    const stamps = (this.recent.get(user.id) ?? []).filter((t) => t > now - PER_USER_WINDOW);
    if (stamps.length >= PER_USER_MAX) throw new DeskError(429, 'Trop de vérifications de commande. Patientez une minute.');
    stamps.push(now);
    this.recent.set(user.id, stamps);
    return this.verify(raw, brand);
  }

  /** The order behind a reference in the store of the call's brand, without the per-account limit (save time). A
   *  number alone is read as that store's; another store's reference is refused before EcoManager is asked. */
  async verify(raw: string, brand: Brand = 'touche'): Promise<OrderLookup & { reference: string; id: number; brand: Brand }> {
    const client = this.clients[brand];
    if (!client) throw checkOff();
    const parsed = parseBrandReference(raw, brand, this.prefixes);
    if (!parsed) throw new DeskError(400, orderReferenceHint(brand), 'order-ref-format');
    if (parsed.brand !== brand) throw new DeskError(400, referenceBrandMismatch(parsed.brand, brand), 'order-ref-brand');
    const result = await client.lookup(parsed.reference);
    // A found order is stored under EcoManager's own reference.
    return { ...result, reference: result.status === 'found' ? result.order.reference : parsed.reference, id: parsed.id, brand };
  }
}
