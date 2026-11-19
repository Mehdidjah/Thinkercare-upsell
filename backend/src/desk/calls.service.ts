import { canManageWorkspace } from '@touche/domain';
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { ItemSnapshot, Product, Proposal, OrderItem, Tier } from '@touche/domain';
import {
  basketOffer,
  basketProblem,
  isPack,
  money,
  offerProblem,
  physicalCount,
  pricedTotal,
  proposalOriginals,
  quantityOf,
  itemsTotal,
  sameOrder,
  orderSignature,
} from '@touche/domain';
import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../common/db-errors.js';
import { DeskError } from '../common/http.js';
import type { Db, Tx } from '../db/schema.js';
import {
  tcAcceptedDossiers,
  tcAudit,
  tcCallMeta,
  tcCalls,
  tcProposals,
  tcSettings,
} from '../db/schema.js';
import { auditRow } from './audit.js';
import { loadProducts, snapshot } from './catalogue.js';
import type { DeskUser } from './desk.types.js';
import { VOID_WINDOW_MINUTES } from './features.js';
import {
  completeReminderSchema,
  proposalSchema,
  reopenReminderSchema,
  saveCallSchema,
  voidCallSchema,
} from './schemas.js';

// Keep baseId for older clients and reports; baseIds is the complete original order.
function withQuantities(items: Product[], quantities: Record<string, number> = {}): OrderItem[] {
  if (Object.keys(quantities).some(id => !items.some(item => item.id === id))) {
    throw new DeskError(400, 'Une quantité ne correspond pas aux produits sélectionnés.');
  }
  return items.map(item => ({ ...item, quantity: quantities[item.id] ?? 1 }));
}

// M3: the customer's own order stands even if one of its products was disabled since.
function originalOrder(all: Product[], baseId: string, baseIds?: string[], quantities?: Record<string, number>): OrderItem[] {
  const ids = baseIds || [baseId];
  if (ids[0] !== baseId || new Set(ids).size !== ids.length) {
    throw new DeskError(400, 'Composition de la commande initiale invalide.');
  }
  return withQuantities(ids.map((id) => {
    const product = all.find((p) => p.id === id);
    if (!product) throw new DeskError(400, 'Produit initial indisponible dans le catalogue.');
    return product;
  }), quantities);
}

function preservesOriginals(initial: OrderItem[], basket: OrderItem[], upgradeId?: string): boolean {
  return upgradeId ? initial.length === 1 && quantityOf(basket[0]) >= quantityOf(initial[0])
    : initial.every((p, i) => basket[i]?.id === p.id && quantityOf(basket[i]) >= quantityOf(p));
}

const addedLines = (initial: OrderItem[], basket: OrderItem[]) => basket.filter(p => {
  const before = initial.find(x => x.id === p.id);
  return !before || quantityOf(p) > quantityOf(before);
});

/**
 * How the desk handles a catalogue change. Desks that read the error `code` reload the catalogue in
 * place and send `expectedUserId`; an older open tab does neither, so its message must also say to
 * reload the page.
 */
export type DeskClient = { reloadsCatalogue: boolean };
const NEW_DESK: DeskClient = { reloadsCatalogue: true };

/** M3: only what an accepted offer adds must still be on sale. */
function requireAvailable(added: OrderItem[], client: DeskClient): void {
  const disabled = added.find((p) => !p.enabled);
  if (disabled) {
    throw new DeskError(
      400,
      `« ${disabled.name} » n’est plus disponible dans le catalogue : retirez-le de l’offre et présentez-la de nouveau.` +
        (client.reloadsCatalogue ? '' : ' Rechargez la page pour mettre le catalogue à jour.'),
      'product-disabled',
    );
  }
}

/** H2: 409 with the amount the offer is now worth. */
function priceChanged(offer: number, client: DeskClient): DeskError {
  return new DeskError(
    409,
    `Le tarif a changé : cette offre vaut maintenant ${money(offer)}. ` +
      (client.reloadsCatalogue
        ? 'Le catalogue a été mis à jour, annoncez le nouveau montant.'
        : 'Rechargez la page pour mettre les prix à jour, puis annoncez le nouveau montant.'),
    'price-changed',
  );
}

/** Presented snapshots keep price, quantity and category: enough for the shared pricing rules. */
const snapshotOrder = (items: ItemSnapshot[]) => items as unknown as OrderItem[];

/**
 * A presented offer as an order with its own catalogue: its products, packs keeping the components
 * stored at presentation, so the basket rules do not depend on later catalogue edits.
 */
function presentedOrder(items: ItemSnapshot[]): { basket: OrderItem[]; catalogue: Product[] } {
  const basket = items.map((p) => ({ ...p, components: p.components?.map((c) => c.id) }));
  const catalogue = [...basket, ...items.flatMap((p) => p.components ?? [])];
  return { basket: basket as unknown as OrderItem[], catalogue: catalogue as unknown as Product[] };
}

/** The unit count an accepted outcome stands for: duo 2, trio 3, routine 4 or more. */
function countMatches(outcome: string, count: number): boolean {
  return outcome === 'duo' ? count === 2 : outcome === 'trio' ? count === 3 : outcome === 'routine' ? count >= 4 : true;
}

/** A call cannot have started more than 7 days before it is recorded (unchanged by M4). */
const MAX_CALL_AGE_MS = 7 * 86_400_000;

@Injectable()
export class CallsService {
  constructor(@InjectDrizzle() private readonly db: Db) {}

  /** Port of activity.server.ts lines 15-34. */
  async presentOffer(
    user: DeskUser,
    body: unknown,
    client: DeskClient = NEW_DESK,
  ): Promise<{ ok: true; proposal: Proposal; duplicate?: true }> {
    const v = proposalSchema.parse(body);
    const all = await loadProducts(this.db);
    const [old] = await this.db
      .select({ user_id: tcProposals.user_id, snapshot: tcProposals.snapshot })
      .from(tcProposals)
      .where(eq(tcProposals.id, v.id))
      .limit(1);
    if (old) {
      if (old.user_id !== user.id) throw new DeskError(403, 'Accès non autorisé.');
      return { ok: true, proposal: old.snapshot, duplicate: true };
    }
    const [owner] = await this.db
      .select({ user_id: tcProposals.user_id, snapshot: tcProposals.snapshot })
      .from(tcProposals)
      .where(eq(tcProposals.call_id, v.callId))
      .limit(1);
    if (owner && owner.user_id !== user.id) {
      throw new DeskError(403, 'Cet appel appartient à une autre conseillère.');
    }
    const [closed] = await this.db
      .select({ id: tcCalls.id })
      .from(tcCalls)
      .where(eq(tcCalls.id, v.callId))
      .limit(1);
    if (closed) throw new DeskError(409, 'Appel déjà clôturé. Ouvrez un nouvel appel.');
    const [count] = await this.db
      .select({ n: sql<number>`COUNT(*)::int` })
      .from(tcProposals)
      .where(eq(tcProposals.call_id, v.callId));
    if ((count?.n || 0) >= 20) throw new DeskError(400, 'Vingt offres maximum par appel.');
    const base = all.find((p) => p.id === v.baseId);
    const basket = v.productIds.map((i) => all.find((p) => p.id === i));
    if (!base || basket.some((p) => !p) || new Set(v.productIds).size !== v.productIds.length) {
      throw new DeskError(400, 'Produits invalides ou désactivés.');
    }
    const b = withQuantities(basket as Product[], v.quantities);
    const initial = originalOrder(all, v.baseId, v.baseIds, v.baseQuantities);
    if (
      owner &&
      orderSignature(proposalOriginals(owner.snapshot)) !== orderSignature(initial)
    ) {
      throw new DeskError(
        409,
        'La commande initiale ne peut plus changer après une offre présentée.',
      );
    }
    const first = b[0]!;
    if (first.id !== (v.upgradeId || v.baseId)) {
      throw new DeskError(400, 'Le panier ne correspond pas au produit initial.');
    }
    if (v.upgradeId && (!isPack(first) || !first.components?.includes(base.id))) {
      throw new DeskError(400, 'Pack de remplacement non compatible avec le produit initial.');
    }
    if (!preservesOriginals(initial, b, v.upgradeId)) {
      throw new DeskError(400, 'Tous les produits de la commande initiale doivent être conservés.');
    }
    requireAvailable(addedLines(initial, b), client);
    const problem = basketProblem(b, all);
    if (problem) throw new DeskError(400, problem);
    if (sameOrder(initial, b) && !v.upgradeId) {
      throw new DeskError(400, 'Ajoutez un complément pertinent avant de présenter une offre.');
    }
    const conditional = addedLines(initial, b).filter((p) => !p.recommendable);
    if (conditional.some((p) => !v.verifiedProducts?.includes(p.id))) {
      throw new DeskError(
        400,
        'Confirmez les vérifications spécifiques de la référence avant de la proposer.',
      );
    }
    // H2: the catalogue changed under the call; the desk reloads it in place and keeps the call.
    // Checked before M5, so a desk with stale prices first gets the current ones.
    const serverOffer = basketOffer(b, v.tier, all);
    if (serverOffer !== v.agreedTotal) throw priceChanged(serverOffer, client);
    // M5: an add-on offer must raise the order.
    const lowOffer = offerProblem(initial, b, v.tier, all);
    if (lowOffer) throw new DeskError(400, lowOffer);
    const createdAt = new Date();
    const proposal: Proposal = {
      id: v.id,
      call_id: v.callId,
      user_id: user.id,
      created_at: createdAt.toISOString(),
      base: snapshot(initial[0], all),
      originals: initial.map((p) => snapshot(p, all)),
      products: b.map((p) => snapshot(p, all)),
      // The list-price sum; the offer and the initial value price complete hair-pack sets at the pack price.
      catalogueTotal: itemsTotal(b),
      offerTotal: v.agreedTotal,
      extra: v.agreedTotal - pricedTotal(initial, all),
      tier: v.tier,
      delivery: v.delivery,
      version: 3,
    };
    await this.db.transaction(async (tx) => {
      await tx.insert(tcProposals).values({
        id: v.id,
        call_id: v.callId,
        user_id: user.id,
        created_at: createdAt,
        snapshot: proposal,
      });
      await tx
        .insert(tcAudit)
        .values(auditRow(user, 'offer.presented', v.id, { callId: v.callId }));
    });
    return { ok: true, proposal };
  }

  /** Port of api.server.ts lines 53-100, with the 2026-11-19 recording rules (H2-H4, M3-M5). */
  async saveCall(
    user: DeskUser,
    body: unknown,
    client: DeskClient = NEW_DESK,
  ): Promise<{ ok: true; duplicate?: true; outcome?: string; closedReminderId?: string }> {
    const v = saveCallSchema.parse(body);
    // A retry of a call already recorded answers as before, whatever the catalogue became since.
    const retry = await this.existingCall(user, v.id);
    if (retry) return retry;
    if (
      new Set(v.productIds).size !== v.productIds.length ||
      v.productIds[0] !== (v.upgradeId || v.baseId)
    ) {
      throw new DeskError(400, 'Composition du panier invalide.');
    }
    const accepted = ['duo', 'trio', 'routine'].includes(v.outcome);
    if (accepted && (!v.consent || !v.checked)) {
      throw new DeskError(
        400,
        'Confirmez l’accord de la cliente et la vérification de la compatibilité.',
      );
    }
    // H4: an accepted sale names the offer the customer accepted (every desk version sends it).
    if (accepted && !v.meta?.acceptedProposalId) {
      throw new DeskError(400, 'Marquez l’offre comme présentée avant de confirmer la vente.');
    }
    const all = await loadProducts(this.db);
    const basket = v.productIds.map((id) => all.find((p) => p.id === id));
    if (basket.some((x) => !x)) {
      throw new DeskError(400, 'Un produit du panier est introuvable dans le catalogue.');
    }
    const b = withQuantities(basket as Product[], v.quantities);
    const first = b[0]!;
    const initial = originalOrder(all, v.baseId, v.baseIds, v.baseQuantities);
    if (!preservesOriginals(initial, b, v.upgradeId)) {
      throw new DeskError(400, 'Tous les produits de la commande initiale doivent être conservés.');
    }
    const altered = !!v.upgradeId || !sameOrder(initial, b);
    if (accepted && !altered) {
      throw new DeskError(
        400,
        'Une vente additionnelle doit ajouter un produit à la commande initiale.',
      );
    }
    // H3: same pack rule as present-offer; a non-recommendable pack needs its verification only
    // when it is sold (checked with the other added lines below), never to record another outcome.
    // A sale checks the pack it was presented with (below).
    const packFits = (pack: OrderItem) => isPack(pack) && !!pack.components?.includes(v.baseId);
    if (v.upgradeId && !accepted && !packFits(first)) {
      throw new DeskError(400, 'Pack de remplacement non compatible avec le produit initial.');
    }
    // Preserve existing orders; new additions must pass pack-content and duplicate checks. An
    // accepted sale is checked below on the presented offer instead (its stored pack contents).
    const problem = altered && !accepted ? basketProblem(b, all) : null;
    if (problem) throw new DeskError(400, problem);
    if (accepted) {
      const added = addedLines(initial, b);
      requireAvailable(added, client);
      if (added.some((p) => !p.recommendable && !v.verifiedProducts?.includes(p.id))) {
        throw new DeskError(
          400,
          'Cette référence nécessite une vérification de sa fiche avant ajout automatique.',
        );
      }
    }
    const [clinical] = await this.db
      .select({ data: tcSettings.data })
      .from(tcSettings)
      .where(eq(tcSettings.id, 'clinical'))
      .limit(1);
    const cv = (clinical ? clinical.data : {}) as { validated?: unknown; version?: unknown };
    const pilot = !(cv.validated && cv.version === 3);
    const now = new Date();
    let presentation: Proposal | null = null;
    // The latest offer presented on this call (all of them belong to its adviser).
    const [lastShown] = await this.db
      .select({ user_id: tcProposals.user_id, snapshot: tcProposals.snapshot })
      .from(tcProposals)
      .where(eq(tcProposals.call_id, v.id))
      .orderBy(desc(tcProposals.created_at), desc(tcProposals.id))
      .limit(1);
    if (lastShown && lastShown.user_id !== user.id) {
      throw new DeskError(403, 'Appel appartenant à un autre compte.');
    }
    if (
      lastShown &&
      orderSignature(proposalOriginals(lastShown.snapshot)) !== orderSignature(initial)
    ) {
      throw new DeskError(
        409,
        'La commande initiale ne peut plus changer après une offre présentée.',
      );
    }
    let startedAt: string | undefined;
    if (v.meta) {
      // M4: a desk clock ahead of the server is clamped to the server time, not refused.
      const started = Date.parse(v.meta.startedAt);
      if (!Number.isFinite(started) || started < now.getTime() - MAX_CALL_AGE_MS) {
        throw new DeskError(400, 'Horodatage de début invalide. Ouvrez un nouvel appel.');
      }
      startedAt = started > now.getTime() ? now.toISOString() : v.meta.startedAt;
      if (accepted && !v.meta.eligible) {
        throw new DeskError(400, 'Une vente additionnelle doit être déclarée éligible.');
      }
      if (v.outcome === 'callback' && !v.meta.callbackAt) {
        throw new DeskError(400, 'Indiquez la date du rappel.');
      }
      if (
        v.meta.callbackAt &&
        (Date.parse(v.meta.callbackAt) < Date.now() - 300000 ||
          Date.parse(v.meta.callbackAt) > Date.now() + 366 * 86400000)
      ) {
        throw new DeskError(400, 'Choisissez un rappel futur dans les 12 prochains mois.');
      }
      if (accepted) {
        const [row] = await this.db
          .select({
            snapshot: tcProposals.snapshot,
            user_id: tcProposals.user_id,
            call_id: tcProposals.call_id,
          })
          .from(tcProposals)
          .where(eq(tcProposals.id, v.meta.acceptedProposalId!))
          .limit(1);
        if (!row || row.user_id !== user.id || row.call_id !== v.id) {
          throw new DeskError(400, 'Offre présentée introuvable pour cet appel.');
        }
        presentation = row.snapshot;
        // H2: the sale is checked against what was presented, at the prices presented; a
        // catalogue edited since then no longer blocks it. Only a different request is refused.
        if (
          presentation.base.id !== v.baseId ||
          !sameOrder(proposalOriginals(presentation), initial) ||
          orderSignature(presentation.products) !== orderSignature(b) ||
          presentation.tier !== v.tier ||
          presentation.delivery !== v.delivery ||
          (v.agreedTotal !== undefined && v.agreedTotal !== presentation.offerTotal)
        ) {
          throw new DeskError(
            409,
            'La composition ou le tarif a changé. Présentez de nouveau l’offre exacte.',
          );
        }
        // Pack contents and the unit count come from the presented offer too, so a pack edited in
        // the catalogue after the presentation does not block the sale.
        const shown = presentedOrder(presentation.products);
        if (v.upgradeId && !packFits(shown.basket[0]!)) {
          throw new DeskError(400, 'Pack de remplacement non compatible avec le produit initial.');
        }
        const shownProblem = basketProblem(shown.basket, shown.catalogue);
        if (shownProblem) throw new DeskError(400, shownProblem);
        if (!countMatches(v.outcome, physicalCount(shown.basket, shown.catalogue))) {
          throw new DeskError(
            400,
            'Le résultat doit correspondre aux soins physiques, composants des packs inclus.',
          );
        }
        // M5: an accepted add-on must raise the order. Singles keep their presented prices; a complete hair-pack set takes
        // the current pack price, on both sides (the same rule as the stored initial value below).
        const lowOffer = offerProblem(
          snapshotOrder(proposalOriginals(presentation)),
          snapshotOrder(presentation.products),
          presentation.tier as Tier,
          all,
        );
        if (lowOffer) throw new DeskError(400, lowOffer);
      }
      if (v.meta.orderRef && accepted) {
        const [duplicate] = await this.db
          .select({ id: tcCalls.id })
          .from(tcCalls)
          .innerJoin(tcCallMeta, eq(tcCallMeta.call_id, tcCalls.id))
          .where(
            and(
              eq(tcCallMeta.order_ref, v.meta.orderRef.toUpperCase()),
              inArray(tcCalls.outcome, ['duo', 'trio', 'routine']),
              isNull(tcCalls.voided_at),
            ),
          )
          .limit(1);
        if (duplicate) {
          throw new DeskError(
            409,
            'Un ajout accepté existe déjà pour cette référence de dossier. Vérifiez le journal pour éviter un double comptage.',
          );
        }
      }
    }
    // Stored amounts: an accepted sale keeps the presented snapshot; a refusal keeps the last
    // presented offer; other outcomes use the current catalogue (a price change never blocks them).
    const locked = presentation ?? (v.outcome === 'refused' ? (lastShown?.snapshot ?? null) : null);
    const sameBasket = !!locked && orderSignature(locked.products) === orderSignature(b);
    const snapshots: ItemSnapshot[] = sameBasket ? locked.products : b.map((p) => snapshot(p, all));
    const originals = locked ? proposalOriginals(locked) : initial.map((p) => snapshot(p, all));
    // The initial order at its pack-aware value: frozen snapshot prices for singles, the current pack price for a set.
    const lockedBase = pricedTotal(originals, all);
    const lockedSum = sameBasket ? locked.catalogueTotal : itemsTotal(b);
    const offer = presentation
      ? presentation.offerTotal
      : ['initial', 'refused'].includes(v.outcome)
        ? lockedBase
        : 0;
    const meta = v.meta;
    let closedReminderId: string | undefined;
    // One transaction: a unique violation on tc_accepted_dossiers (concurrent double-accept)
    // propagates, rolls every write back, and DeskExceptionFilter answers 409.
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(tcCalls).values({
          id: v.id,
          user_id: user.id,
          operator: user.label,
          created_at: now,
          outcome: v.outcome,
          base_id: v.baseId,
          products: snapshots,
          catalogue_total: lockedSum,
          base_total: lockedBase,
          offered_total: offer,
          delivery: v.delivery,
          tier: v.tier,
          extra: accepted ? offer - lockedBase : 0,
          refusal: v.refusal,
          pilot: pilot ? 1 : 0,
        });
        await tx
          .insert(tcAudit)
          .values(auditRow(user, 'call.closed', v.id, { outcome: v.outcome }));
        if (meta || initial.length > 1 || initial.some(p => quantityOf(p) > 1)) {
          const data = {
            ...meta,
            ...(startedAt ? { startedAt } : {}),
            orderRef: meta?.orderRef.toUpperCase() || '',
            team: user.team || '',
            original: locked?.base || snapshot(initial[0], all),
            originals,
            ruleVersion: 'touche-v3',
            completedAt: now.toISOString(),
          };
          await tx.insert(tcCallMeta).values({
            call_id: v.id,
            data,
            callback_at: meta?.callbackAt ? new Date(meta.callbackAt) : null,
            order_ref: data.orderRef,
            customer_stage: meta?.customerStage || 'unknown',
            team: user.team || '',
            version: meta ? 3 : 1,
          });
        }
        if (accepted && meta?.orderRef) {
          await tx.insert(tcAcceptedDossiers).values({
            order_ref: meta.orderRef.toUpperCase(),
            call_id: v.id,
            user_id: user.id,
          });
        }
        // M2: the follow-up call made from a reminder closes that reminder once the customer was
        // reached; with no answer the reminder stays open (a callback follow-up opens its own).
        if (meta?.linkedCallId && meta.linkedCallId !== v.id && v.outcome !== 'noanswer') {
          closedReminderId = await this.closeLinkedReminder(tx, user, meta.linkedCallId, v.id);
        }
      });
    } catch (error) {
      // A concurrent save of the same id passed the existing-call check too and committed first:
      // answer exactly as the check would have (owner's retry is a duplicate, anyone else 409).
      if (isUniqueViolation(error, 'tc_calls_pkey')) {
        const duplicate = await this.existingCall(user, v.id);
        if (duplicate) return duplicate;
      }
      throw error;
    }
    return closedReminderId ? { ok: true, closedReminderId } : { ok: true };
  }

  /** Closes the linked call's open reminder when this user may handle it; returns its id if closed. */
  private async closeLinkedReminder(
    tx: Tx,
    user: DeskUser,
    linkedCallId: string,
    callId: string,
  ): Promise<string | undefined> {
    const [linked] = await tx
      .select({ user_id: tcCalls.user_id })
      .from(tcCalls)
      .innerJoin(tcCallMeta, eq(tcCallMeta.call_id, tcCalls.id))
      .where(
        and(
          eq(tcCalls.id, linkedCallId),
          isNull(tcCalls.voided_at),
          isNotNull(tcCallMeta.callback_at),
          eq(tcCallMeta.callback_done, 0),
        ),
      )
      .limit(1);
    if (!linked || (linked.user_id !== user.id && !canManageWorkspace(user))) return undefined;
    const closed = await tx
      .update(tcCallMeta)
      .set({ callback_done: 1 })
      .where(and(eq(tcCallMeta.call_id, linkedCallId), eq(tcCallMeta.callback_done, 0)))
      .returning({ id: tcCallMeta.call_id });
    if (!closed.length) return undefined;
    await tx.insert(tcAudit).values(auditRow(user, 'reminder.closed', linkedCallId, { callId }));
    return linkedCallId;
  }

  /**
   * Existing-call check of save-call: the owner's retry is a duplicate, another account's id is 409.
   * The duplicate answer names the outcome stored the first time, so the desk shows what was
   * recorded rather than the button clicked on the retry (additive field: older desks ignore it).
   */
  private async existingCall(
    user: DeskUser,
    id: string,
  ): Promise<{ ok: true; duplicate: true; outcome: string } | null> {
    const [existing] = await this.db
      .select({ id: tcCalls.id, user_id: tcCalls.user_id, outcome: tcCalls.outcome })
      .from(tcCalls)
      .where(eq(tcCalls.id, id))
      .limit(1);
    if (!existing) return null;
    if (existing.user_id !== user.id) throw new DeskError(409, 'Identifiant déjà utilisé.');
    return { ok: true, duplicate: true, outcome: existing.outcome };
  }

  /** A call with a reminder this user may handle: 404, 403 or 400 otherwise. */
  private async reminderCall(user: DeskUser, id: string) {
    const [row] = await this.db
      .select({
        user_id: tcCalls.user_id,
        voided_at: tcCalls.voided_at,
        callback_at: tcCallMeta.callback_at,
      })
      .from(tcCalls)
      .leftJoin(tcCallMeta, eq(tcCallMeta.call_id, tcCalls.id))
      .where(eq(tcCalls.id, id))
      .limit(1);
    if (!row) throw new DeskError(404, 'Appel introuvable.');
    if (!canManageWorkspace(user) && row.user_id !== user.id) {
      throw new DeskError(403, 'Accès non autorisé.');
    }
    if (!row.callback_at) throw new DeskError(400, 'Cet appel n’a pas de rappel.');
    return row;
  }

  /** Port of activity.server.ts lines 35-39; closing twice is answered without a second audit row. */
  async completeReminder(user: DeskUser, body: unknown): Promise<{ ok: true; alreadyDone?: true }> {
    const v = completeReminderSchema.parse(body);
    await this.reminderCall(user, v.callId);
    return this.db.transaction(async (tx) => {
      const closed = await tx
        .update(tcCallMeta)
        .set({ callback_done: 1 })
        .where(and(eq(tcCallMeta.call_id, v.callId), eq(tcCallMeta.callback_done, 0)))
        .returning({ id: tcCallMeta.call_id });
      if (!closed.length) return { ok: true as const, alreadyDone: true as const };
      await tx.insert(tcAudit).values(auditRow(user, 'reminder.closed', v.callId));
      return { ok: true as const };
    });
  }

  /** Undoes complete-reminder (M2). A voided call's reminder stays closed. */
  async reopenReminder(user: DeskUser, body: unknown): Promise<{ ok: true; alreadyOpen?: true }> {
    const v = reopenReminderSchema.parse(body);
    const row = await this.reminderCall(user, v.id);
    if (row.voided_at) {
      throw new DeskError(
        409,
        'Ce résultat a été annulé : son rappel ne peut pas être rouvert.',
        'already-voided',
      );
    }
    return this.db.transaction(async (tx) => {
      const reopened = await tx
        .update(tcCallMeta)
        .set({ callback_done: 0 })
        .where(and(eq(tcCallMeta.call_id, v.id), eq(tcCallMeta.callback_done, 1)))
        .returning({ id: tcCallMeta.call_id });
      if (!reopened.length) return { ok: true as const, alreadyOpen: true as const };
      await tx.insert(tcAudit).values(auditRow(user, 'reminder.reopened', v.id));
      return { ok: true as const };
    });
  }

  /**
   * H5: void a recorded outcome. Nothing is deleted: the call, its meta, its proposals and its
   * dossier row stay, flagged; the dossier reference is freed for the correct sale and the call
   * no longer counts in contributions, bonus, progress or reminders.
   */
  async voidCall(user: DeskUser, body: unknown) {
    const v = voidCallSchema.parse(body);
    return this.db.transaction(async (tx) => {
      const [call] = await tx.select().from(tcCalls).where(eq(tcCalls.id, v.id)).for('update');
      if (!call) throw new DeskError(404, 'Appel introuvable.');
      const manager = canManageWorkspace(user);
      if (!manager && call.user_id !== user.id) throw new DeskError(403, 'Accès non autorisé.');
      if (call.voided_at) throw new DeskError(409, 'Ce résultat est déjà annulé.', 'already-voided');
      if (!manager && Date.now() - call.created_at.getTime() > VOID_WINDOW_MINUTES * 60_000) {
        throw new DeskError(
          403,
          'Ce résultat ne peut plus être annulé par la conseillère : demandez à la direction.',
        );
      }
      const [meta] = await tx
        .select()
        .from(tcCallMeta)
        .where(eq(tcCallMeta.call_id, v.id))
        .for('update');
      const [dossier] = await tx
        .select()
        .from(tcAcceptedDossiers)
        .where(eq(tcAcceptedDossiers.call_id, v.id))
        .for('update');
      const voidedAt = new Date();
      await tx
        .update(tcCalls)
        .set({ voided_at: voidedAt, voided_by: user.id, void_reason: v.reason })
        .where(eq(tcCalls.id, v.id));
      if (dossier && !dossier.voided_at) {
        await tx
          .update(tcAcceptedDossiers)
          .set({ voided_at: voidedAt })
          .where(eq(tcAcceptedDossiers.call_id, v.id));
      }
      const reminderClosed = !!meta?.callback_at && !meta.callback_done;
      if (reminderClosed) {
        await tx.update(tcCallMeta).set({ callback_done: 1 }).where(eq(tcCallMeta.call_id, v.id));
      }
      const linkedCallId = (meta?.data as { linkedCallId?: unknown } | undefined)?.linkedCallId;
      const reopenedReminderId =
        typeof linkedCallId === 'string' && linkedCallId !== v.id
          ? await this.reopenClosedBy(tx, user, v.id, linkedCallId)
          : undefined;
      await tx.insert(tcAudit).values(
        auditRow(user, 'call.voided', v.id, {
          reason: v.reason,
          call,
          meta: meta ?? null,
          dossier: dossier ?? null,
          reminderClosed,
          reopenedReminderId: reopenedReminderId ?? null,
        }),
      );
      return {
        ok: true as const,
        call: {
          id: v.id,
          voided_at: voidedAt.toISOString(),
          voided_by: user.id,
          void_reason: v.reason,
        },
        ...(reopenedReminderId ? { reopenedReminderId } : {}),
      };
    });
  }

  /**
   * M2 undone by H5: the reminder that the voided call's save closed is open again, provided its
   * own call is not voided and it is still closed by that save (not reopened or handled since).
   * Locks the reminder's call then its meta, the order voidCall uses, so concurrent voids queue.
   */
  private async reopenClosedBy(
    tx: Tx,
    user: DeskUser,
    callId: string,
    reminderId: string,
  ): Promise<string | undefined> {
    const [reminder] = await tx
      .select({ voided_at: tcCalls.voided_at })
      .from(tcCalls)
      .where(eq(tcCalls.id, reminderId))
      .for('update');
    if (!reminder || reminder.voided_at) return undefined;
    const [reminderMeta] = await tx
      .select({ callback_done: tcCallMeta.callback_done })
      .from(tcCallMeta)
      .where(eq(tcCallMeta.call_id, reminderId))
      .for('update');
    if (reminderMeta?.callback_done !== 1) return undefined;
    const [last] = await tx
      .select({ action: tcAudit.action, detail: tcAudit.detail })
      .from(tcAudit)
      .where(
        and(
          eq(tcAudit.target, reminderId),
          inArray(tcAudit.action, ['reminder.closed', 'reminder.reopened']),
        ),
      )
      .orderBy(desc(tcAudit.at))
      .limit(1);
    if (last?.action !== 'reminder.closed' || (last.detail as { callId?: unknown }).callId !== callId) {
      return undefined;
    }
    await tx.update(tcCallMeta).set({ callback_done: 0 }).where(eq(tcCallMeta.call_id, reminderId));
    await tx
      .insert(tcAudit)
      .values(auditRow(user, 'reminder.reopened', reminderId, { callId, reason: 'void' }));
    return reminderId;
  }
}
