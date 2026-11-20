import { Inject, Injectable } from '@nestjs/common';
import { ORDER_REFERENCE_HINT, ORDER_STATE_GROUP_LABELS, parseOrderReference } from '@touche/domain';
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

/** EcoManager order checks for the desk: off (no client) until ECOMANAGER_API_TOKEN is set. */
@Injectable()
export class OrdersService {
  readonly client: EcoManagerClient | null;
  private readonly recent = new Map<string, number[]>();

  constructor(@Inject(ENV) env: Env) {
    this.client = env.ecomanager ? new EcoManagerClient(env.ecomanager) : null;
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /** A lookup asked by an adviser while typing: limited to 30 a minute per account. */
  async check(user: DeskUser, raw: string): Promise<OrderLookup & { reference: string }> {
    if (!this.client) throw new DeskError(404, 'Vérification de commande non configurée.', 'order-check-off');
    const now = Date.now();
    const stamps = (this.recent.get(user.id) ?? []).filter((t) => t > now - PER_USER_WINDOW);
    if (stamps.length >= PER_USER_MAX) throw new DeskError(429, 'Trop de vérifications de commande. Patientez une minute.');
    stamps.push(now);
    this.recent.set(user.id, stamps);
    return this.verify(raw);
  }

  /** The order behind a reference, without the per-account limit (save time, catch-up). */
  async verify(raw: string): Promise<OrderLookup & { reference: string }> {
    if (!this.client) throw new DeskError(404, 'Vérification de commande non configurée.', 'order-check-off');
    const parsed = parseOrderReference(raw, this.client.prefix);
    if (!parsed) throw new DeskError(400, ORDER_REFERENCE_HINT, 'order-ref-format');
    return { ...(await this.client.lookup(parsed.reference)), reference: parsed.reference };
  }
}
