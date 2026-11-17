import { canManageWorkspace } from '@touche/domain';
import { Injectable } from '@nestjs/common';
import { InjectDrizzle } from '@nestjs/drizzle';
import type { ItemSnapshot, Product, Proposal } from '@touche/domain';
import {
  basketOffer,
  basketProblem,
  isPack,
  physicalCount,
  proposalOriginals,
} from '@touche/domain';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { isUniqueViolation } from '../common/db-errors.js';
import { DeskError } from '../common/http.js';
import type { Db } from '../db/schema.js';
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
import { completeReminderSchema, proposalSchema, saveCallSchema } from './schemas.js';

// Keep baseId for older clients and reports; baseIds is the complete original order.
function originalOrder(all: Product[], baseId: string, baseIds?: string[]): Product[] {
  const ids = baseIds || [baseId];
  if (ids[0] !== baseId || new Set(ids).size !== ids.length) {
    throw new DeskError(400, 'Composition de la commande initiale invalide.');
  }
  return ids.map((id) => {
    const product = all.find((p) => p.id === id && p.enabled);
    if (!product) throw new DeskError(400, 'Produit initial indisponible dans le catalogue.');
    return product;
  });
}

function preservesOriginals(initial: Product[], basket: Product[], upgradeId?: string): boolean {
  return upgradeId ? initial.length === 1 : initial.every((p, i) => basket[i]?.id === p.id);
}

const originalIds = (proposal: Proposal) => proposalOriginals(proposal).map((p) => p.id);
const sameIds = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

@Injectable()
export class CallsService {
  constructor(@InjectDrizzle() private readonly db: Db) {}

  /** Port of activity.server.ts lines 15-34. */
  async presentOffer(
    user: DeskUser,
    body: unknown,
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
    if (
      !base?.enabled ||
      basket.some((p) => !p?.enabled) ||
      new Set(v.productIds).size !== v.productIds.length
    ) {
      throw new DeskError(400, 'Produits invalides ou désactivés.');
    }
    const b = basket as Product[];
    const initial = originalOrder(all, v.baseId, v.baseIds);
    if (
      owner &&
      !sameIds(
        originalIds(owner.snapshot),
        initial.map((p) => p.id),
      )
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
    const problem = basketProblem(b, all);
    if (problem) throw new DeskError(400, problem);
    if (b.length === initial.length && !v.upgradeId) {
      throw new DeskError(400, 'Ajoutez un complément pertinent avant de présenter une offre.');
    }
    const conditional = b.slice(v.upgradeId ? 0 : initial.length).filter((p) => !p.recommendable);
    if (conditional.some((p) => !v.verifiedProducts?.includes(p.id))) {
      throw new DeskError(
        400,
        'Confirmez les vérifications spécifiques de la référence avant de la proposer.',
      );
    }
    if (basketOffer(b, v.tier) !== v.agreedTotal) {
      throw new DeskError(409, 'Le tarif a changé. Actualisez et annoncez le montant corrigé.');
    }
    const createdAt = new Date();
    const proposal: Proposal = {
      id: v.id,
      call_id: v.callId,
      user_id: user.id,
      created_at: createdAt.toISOString(),
      base: snapshot(base, all),
      originals: initial.map((p) => snapshot(p, all)),
      products: b.map((p) => snapshot(p, all)),
      catalogueTotal: b.reduce((s, p) => s + p.price, 0),
      offerTotal: v.agreedTotal,
      extra: v.agreedTotal - initial.reduce((s, p) => s + p.price, 0),
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

  /** Port of api.server.ts lines 53-100: same checks in the same order. */
  async saveCall(user: DeskUser, body: unknown): Promise<{ ok: true; duplicate?: true }> {
    const v = saveCallSchema.parse(body);
    if (
      new Set(v.productIds).size !== v.productIds.length ||
      v.productIds[0] !== (v.upgradeId || v.baseId)
    ) {
      throw new DeskError(400, 'Composition du panier invalide.');
    }
    const accepted = ['duo', 'trio'].includes(v.outcome);
    if (accepted && (!v.consent || !v.checked)) {
      throw new DeskError(
        400,
        'Confirmez l’accord de la cliente et la vérification de la compatibilité.',
      );
    }
    const all = await loadProducts(this.db);
    const basket = v.productIds.map((id) => all.find((p) => p.id === id));
    if (basket.some((x) => !x || !x.enabled)) {
      throw new DeskError(400, 'Un produit a été désactivé. Actualisez le catalogue.');
    }
    const b = basket as Product[];
    const first = b[0]!;
    const original = all.find((p) => p.id === v.baseId);
    if (!original || !original.enabled) {
      throw new DeskError(400, 'Produit initial indisponible dans le catalogue.');
    }
    const initial = originalOrder(all, v.baseId, v.baseIds);
    if (!preservesOriginals(initial, b, v.upgradeId)) {
      throw new DeskError(400, 'Tous les produits de la commande initiale doivent être conservés.');
    }
    const altered = !!v.upgradeId || b.length > initial.length;
    if (accepted && !altered) {
      throw new DeskError(
        400,
        'Une vente additionnelle doit ajouter un produit à la commande initiale.',
      );
    }
    if (
      v.upgradeId &&
      (!isPack(first) || !first.recommendable || !first.components?.includes(v.baseId))
    ) {
      throw new DeskError(400, 'Le pack de remplacement doit contenir le produit initial.');
    }
    // An existing order may already exceed the recommendation limit. New additions may not.
    const problem = altered ? basketProblem(b, all) : null;
    if (problem) throw new DeskError(400, problem);
    const count = physicalCount(b, all);
    if ((v.outcome === 'duo' && count !== 2) || (v.outcome === 'trio' && count !== 3)) {
      throw new DeskError(
        400,
        'Le résultat doit correspondre aux soins physiques, composants des packs inclus.',
      );
    }
    if (
      accepted &&
      b
        .slice(v.upgradeId ? 0 : initial.length)
        .some((p) => !p.recommendable && !v.verifiedProducts?.includes(p.id))
    ) {
      throw new DeskError(
        400,
        'Cette référence nécessite une vérification de sa fiche avant ajout automatique.',
      );
    }
    const sum = b.reduce((s, p) => s + p.price, 0);
    const base = initial.reduce((s, p) => s + p.price, 0);
    const offer = accepted
      ? basketOffer(b, v.tier)
      : ['initial', 'refused'].includes(v.outcome)
        ? base
        : 0;
    if (accepted && v.agreedTotal !== undefined && v.agreedTotal !== offer) {
      throw new DeskError(
        409,
        'Le catalogue a changé : actualisez puis faites confirmer le nouveau montant.',
      );
    }
    const [clinical] = await this.db
      .select({ data: tcSettings.data })
      .from(tcSettings)
      .where(eq(tcSettings.id, 'clinical'))
      .limit(1);
    const cv = (clinical ? clinical.data : {}) as { validated?: unknown; version?: unknown };
    const pilot = !(cv.validated && cv.version === 3);
    const retry = await this.existingCall(user, v.id);
    if (retry) return retry;
    const now = new Date();
    let presentation: Proposal | null = null;
    const [proposalOwner] = await this.db
      .select({ user_id: tcProposals.user_id, snapshot: tcProposals.snapshot })
      .from(tcProposals)
      .where(eq(tcProposals.call_id, v.id))
      .limit(1);
    if (proposalOwner && proposalOwner.user_id !== user.id) {
      throw new DeskError(403, 'Appel appartenant à un autre compte.');
    }
    if (
      proposalOwner &&
      !sameIds(
        originalIds(proposalOwner.snapshot),
        initial.map((p) => p.id),
      )
    ) {
      throw new DeskError(
        409,
        'La commande initiale ne peut plus changer après une offre présentée.',
      );
    }
    if (v.meta) {
      const startedAt = new Date(v.meta.startedAt).getTime();
      if (startedAt > Date.now() + 60000 || startedAt < Date.now() - 7 * 86400000) {
        throw new DeskError(400, 'Horodatage de début invalide. Ouvrez un nouvel appel.');
      }
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
        if (!v.meta.acceptedProposalId) {
          throw new DeskError(400, 'Marquez l’offre comme présentée avant de confirmer la vente.');
        }
        const [row] = await this.db
          .select({
            snapshot: tcProposals.snapshot,
            user_id: tcProposals.user_id,
            call_id: tcProposals.call_id,
          })
          .from(tcProposals)
          .where(eq(tcProposals.id, v.meta.acceptedProposalId))
          .limit(1);
        if (!row || row.user_id !== user.id || row.call_id !== v.id) {
          throw new DeskError(400, 'Offre présentée introuvable pour cet appel.');
        }
        presentation = row.snapshot;
        if (
          presentation.base.id !== v.baseId ||
          !sameIds(
            originalIds(presentation),
            initial.map((p) => p.id),
          ) ||
          proposalOriginals(presentation).reduce((s, p) => s + p.price, 0) !== base ||
          presentation.offerTotal !== offer ||
          presentation.tier !== v.tier ||
          presentation.delivery !== v.delivery ||
          JSON.stringify(presentation.products.map((p) => p.id)) !== JSON.stringify(v.productIds)
        ) {
          throw new DeskError(
            409,
            'La composition ou le tarif a changé. Présentez de nouveau l’offre exacte.',
          );
        }
      }
      if (v.meta.orderRef && accepted) {
        const [duplicate] = await this.db
          .select({ id: tcCalls.id })
          .from(tcCalls)
          .innerJoin(tcCallMeta, eq(tcCallMeta.call_id, tcCalls.id))
          .where(
            and(
              eq(tcCallMeta.order_ref, v.meta.orderRef.toUpperCase()),
              inArray(tcCalls.outcome, ['duo', 'trio']),
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
    const snapshots: ItemSnapshot[] = presentation
      ? presentation.products
      : b.map((p) => snapshot(p, all));
    const originals = presentation
      ? proposalOriginals(presentation)
      : initial.map((p) => snapshot(p, all));
    const lockedBase = originals.reduce((s, p) => s + p.price, 0);
    const lockedSum = presentation ? presentation.catalogueTotal : sum;
    const meta = v.meta;
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
        if (meta || initial.length > 1) {
          const data = {
            ...meta,
            orderRef: meta?.orderRef.toUpperCase() || '',
            team: user.team || '',
            original: presentation?.base || snapshot(original, all),
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
    return { ok: true };
  }

  /** Existing-call check of save-call: the owner's retry is a duplicate, another account's id is 409. */
  private async existingCall(
    user: DeskUser,
    id: string,
  ): Promise<{ ok: true; duplicate: true } | null> {
    const [existing] = await this.db
      .select({ id: tcCalls.id, user_id: tcCalls.user_id })
      .from(tcCalls)
      .where(eq(tcCalls.id, id))
      .limit(1);
    if (!existing) return null;
    if (existing.user_id !== user.id) throw new DeskError(409, 'Identifiant déjà utilisé.');
    return { ok: true, duplicate: true };
  }

  /** Port of activity.server.ts lines 35-39. */
  async completeReminder(user: DeskUser, body: unknown): Promise<{ ok: true }> {
    const v = completeReminderSchema.parse(body);
    const [row] = await this.db
      .select({ user_id: tcCalls.user_id })
      .from(tcCalls)
      .where(eq(tcCalls.id, v.callId))
      .limit(1);
    if (!row || (!canManageWorkspace(user) && row.user_id !== user.id)) {
      throw new DeskError(403, 'Accès non autorisé.');
    }
    await this.db.transaction(async (tx) => {
      await tx.update(tcCallMeta).set({ callback_done: 1 }).where(eq(tcCallMeta.call_id, v.callId));
      await tx.insert(tcAudit).values(auditRow(user, 'reminder.closed', v.callId));
    });
    return { ok: true };
  }
}
