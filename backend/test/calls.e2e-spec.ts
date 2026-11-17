import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tcAcceptedDossiers, tcAudit, tcCallMeta, tcCalls, tcProposals } from '../src/db/schema.js';
import { EMPTY_PROFILE, type Product, type CallMeta, basketOffer, recommend, localDay } from '@touche/domain';
import { contributions } from '../src/desk/contributions.js';
import type { DeskUser } from '../src/desk/desk.types.js';
import { type TestContext, createTestApp } from './support/context.js';
import { resetDatabase } from './support/database.js';
import { deskGet, deskPost } from './support/desk.js';
import { createUser, loginCookie } from './support/users.js';

const PASSWORD = 'mot-de-passe-solide-2026';
const DOSSIER_PRECHECK =
  'Un ajout accepté existe déjà pour cette référence de dossier. Vérifiez le journal pour éviter un double comptage.';
const DOSSIER_UNIQUE =
  'Ce dossier possède déjà un ajout accepté. Aucun doublon n’a été enregistré.';
const fixtureAll = JSON.parse(
  readFileSync(resolve(import.meta.dirname, '../../shared/test/fixtures/catalogue.json'), 'utf8'),
) as Array<Record<string, unknown> & { id: string }>;
const fixture = (id: string) => structuredClone(fixtureAll.find((p) => p.id === id)!);

let ctx: TestContext;
let admin: string;
let lina: string;
let sara: string;
let linaUser: DeskUser;
let saraUser: DeskUser;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx.db);
  await createUser(ctx.db, { username: 'direction', password: PASSWORD, role: 'admin' });
  linaUser = await createUser(ctx.db, {
    username: 'conseil.lina',
    password: PASSWORD,
    role: 'advisor',
    label: 'Lina B.',
    team: 'Alger',
  });
  saraUser = await createUser(ctx.db, {
    username: 'conseil.sara',
    password: PASSWORD,
    role: 'advisor',
    label: 'Sara K.',
    team: 'Oran',
  });
  admin = await loginCookie(ctx, 'direction', PASSWORD);
  lina = await loginCookie(ctx, 'conseil.lina', PASSWORD);
  sara = await loginCookie(ctx, 'conseil.sara', PASSWORD);
});

type Body = Record<string, unknown>;
const post = (body: unknown, cookie = lina) => deskPost(ctx, body, { cookie });
const at = (ms: number) => new Date(Date.now() + ms).toISOString();
const DAY = 86_400_000;

function present(overrides: Body = {}): Body & { id: string; callId: string } {
  return {
    action: 'present-offer',
    id: randomUUID(),
    callId: randomUUID(),
    baseId: 'antiacne',
    productIds: ['antiacne', 'wcgel'],
    tier: 'duo',
    delivery: null,
    agreedTotal: 3000,
    ...overrides,
  } as Body & { id: string; callId: string };
}

function save(overrides: Body & { meta?: Body } = {}): Body & { id: string } {
  const { meta, ...rest } = overrides;
  return {
    action: 'save-call',
    id: randomUUID(),
    baseId: 'antiacne',
    productIds: ['antiacne', 'wcgel'],
    outcome: 'duo',
    tier: 'duo',
    delivery: null,
    agreedTotal: 3000,
    consent: true,
    checked: true,
    refusal: '',
    ...rest,
    meta: {
      version: 3,
      source: 'manual',
      customerStage: 'new',
      orderRef: 'dos-001',
      startedAt: at(-5 * 60_000),
      eligible: true,
      objections: ['budget'],
      ...meta,
    },
  } as Body & { id: string };
}

/** Present an offer and return its body (proposal id + call id). */
async function presented(cookie = lina, overrides: Body = {}) {
  const body = present(overrides);
  const res = await post(body, cookie);
  expect(res.status).toBe(200);
  return body;
}

const auditRows = (action: string) =>
  ctx.db.select().from(tcAudit).where(eq(tcAudit.action, action));

/** Wait until `n` sessions are blocked on a lock on `table` (the requests have reached it). */
async function waitForLockWaiters(table: string, n: number) {
  for (let i = 0; i < 250; i++) {
    const { rows } = await ctx.db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM pg_locks WHERE relation = ${table}::regclass AND NOT granted`,
    );
    if (rows[0]!.n >= n) return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`${n} sessions never waited on ${table}`);
}

describe('present-offer', () => {
  it('present-offer stores a snapshot with the server price', async () => {
    const body = present();
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body).not.toHaveProperty('duplicate');
    expect(res.body.proposal).toMatchObject({
      id: body.id,
      call_id: body.callId,
      user_id: linaUser.id,
      offerTotal: 3000,
      extra: 1200,
      catalogueTotal: 3300,
      tier: 'duo',
      delivery: null,
      version: 3,
      base: { id: 'antiacne', price: 1800 },
    });
    expect(res.body.proposal.products.map((p: { id: string }) => p.id)).toEqual([
      'antiacne',
      'wcgel',
    ]);
    const rows = await ctx.db.select().from(tcProposals).where(eq(tcProposals.id, body.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.call_id).toBe(body.callId);
    expect(rows[0]!.snapshot).toEqual(res.body.proposal);
    expect(rows[0]!.created_at.toISOString()).toBe(res.body.proposal.created_at);
    const [audit] = await auditRows('offer.presented');
    expect(audit!.target).toBe(body.id);
    expect(audit!.user_id).toBe(linaUser.id);
    expect(audit!.detail).toEqual({ callId: body.callId });
  });

  it('a stale price is 409', async () => {
    const body = present({ agreedTotal: 3100 });
    const res = await post(body);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'Le tarif a changé. Actualisez et annoncez le montant corrigé.',
    });
    expect(await ctx.db.select().from(tcProposals)).toEqual([]);
    expect(await auditRows('offer.presented')).toEqual([]);
  });

  it('retrying present-offer with the same id is idempotent', async () => {
    const body = present();
    const first = await post(body);
    expect(first.status).toBe(200);
    const again = await post(body);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ ok: true, proposal: first.body.proposal, duplicate: true });
    expect(await ctx.db.select().from(tcProposals)).toHaveLength(1);
    expect(await auditRows('offer.presented')).toHaveLength(1);
    const stolen = await post(body, sara);
    expect(stolen.status).toBe(403);
    expect(stolen.body).toEqual({ error: 'Accès non autorisé.' });
  });

  it('another adviser cannot present on someone else’s call', async () => {
    const mine = await presented(lina);
    const res = await post(present({ callId: mine.callId }), sara);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Cet appel appartient à une autre conseillère.' });
  });

  it('a single product without upgrade cannot be presented', async () => {
    const res = await post(present({ productIds: ['antiacne'], agreedTotal: 1800 }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Ajoutez un complément pertinent avant de présenter une offre.',
    });
  });

  it('twenty offers per call at most', async () => {
    const callId = randomUUID();
    for (let i = 0; i < 20; i++) {
      expect((await post(present({ callId }))).status).toBe(200);
    }
    const res = await post(present({ callId }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Vingt offres maximum par appel.' });
    expect(
      await ctx.db.select().from(tcProposals).where(eq(tcProposals.call_id, callId)),
    ).toHaveLength(20);
  });
});

describe('save-call', () => {
  it('saving an accepted duo', async () => {
    const p = await presented();
    const res = await post(save({ id: p.callId, meta: { acceptedProposalId: p.id } }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, p.callId));
    expect(call).toMatchObject({
      user_id: linaUser.id,
      operator: 'Lina B.',
      outcome: 'duo',
      base_id: 'antiacne',
      offered_total: 3000,
      base_total: 1800,
      extra: 1200,
      catalogue_total: 3300,
      delivery: null,
      tier: 'duo',
      refusal: '',
      pilot: 1,
    });
    expect(call!.products.map((x) => x.id)).toEqual(['antiacne', 'wcgel']);
    const [meta] = await ctx.db.select().from(tcCallMeta).where(eq(tcCallMeta.call_id, p.callId));
    expect(meta).toMatchObject({
      order_ref: 'DOS-001',
      team: 'Alger',
      customer_stage: 'new',
      version: 3,
      callback_at: null,
      callback_done: 0,
    });
    const data = meta!.data as Record<string, any>;
    expect(data.original.id).toBe('antiacne');
    expect(data.ruleVersion).toBe('touche-v3');
    expect(data.orderRef).toBe('DOS-001');
    expect(data.team).toBe('Alger');
    expect(data.acceptedProposalId).toBe(p.id);
    expect(data.completedAt).toBe(call!.created_at.toISOString());
    expect(await ctx.db.select().from(tcAcceptedDossiers)).toEqual([
      { order_ref: 'DOS-001', call_id: p.callId, user_id: linaUser.id },
    ]);
    const [audit] = await auditRows('call.closed');
    expect(audit!.target).toBe(p.callId);
    expect(audit!.detail).toEqual({ outcome: 'duo' });
    const late = await post(present({ callId: p.callId }));
    expect(late.status).toBe(409);
    expect(late.body).toEqual({ error: 'Appel déjà clôturé. Ouvrez un nouvel appel.' });
  });

  it('an accepted sale needs consent and the compatibility check', async () => {
    const p = await presented();
    const res = await post(
      save({ id: p.callId, consent: false, meta: { acceptedProposalId: p.id } }),
    );
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Confirmez l’accord de la cliente et la vérification de la compatibilité.',
    });
  });

  it('an accepted sale must reference the presented offer', async () => {
    const p = await presented();
    const res = await post(save({ id: p.callId }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: 'Marquez l’offre comme présentée avant de confirmer la vente.',
    });
  });

  it('a composition changed since presentation is 409', async () => {
    const p = await presented();
    const res = await post(
      save({
        id: p.callId,
        tier: 'final',
        agreedTotal: 2700,
        meta: { acceptedProposalId: p.id },
      }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'La composition ou le tarif a changé. Présentez de nouveau l’offre exacte.',
    });
    expect(await ctx.db.select().from(tcCalls)).toEqual([]);
  });

  it('a catalogue price change after presentation is 409', async () => {
    const p = await presented();
    const changed = await post(
      { action: 'product', product: { ...fixture('wcgel'), price: 1600 } },
      admin,
    );
    expect(changed.status).toBe(200);
    const res = await post(save({ id: p.callId, meta: { acceptedProposalId: p.id } }));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: 'Le catalogue a changé : actualisez puis faites confirmer le nouveau montant.',
    });
    expect(await ctx.db.select().from(tcCalls)).toEqual([]);
  });

  it('retrying save-call is idempotent', async () => {
    const p = await presented();
    const body = save({ id: p.callId, meta: { acceptedProposalId: p.id } });
    expect((await post(body)).status).toBe(200);
    const again = await post(body);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ ok: true, duplicate: true });
    expect(await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, p.callId))).toHaveLength(1);
    expect(await ctx.db.select().from(tcAcceptedDossiers)).toHaveLength(1);
    expect(await auditRows('call.closed')).toHaveLength(1);
  });

  it('a call id owned by another adviser is 409', async () => {
    const p = await presented();
    const body = save({ id: p.callId, meta: { acceptedProposalId: p.id } });
    expect((await post(body)).status).toBe(200);
    const res = await post(body, sara);
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'Identifiant déjà utilisé.' });
  });

  it('closing a call on which another adviser presented an offer is 403', async () => {
    const p = await presented(lina);
    const res = await post(
      save({ id: p.callId, outcome: 'refused', refusal: 'budget', consent: false, checked: false }),
      sara,
    );
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Appel appartenant à un autre compte.' });
    expect(await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, p.callId))).toEqual([]);
  });

  it('accepting another adviser’s presented offer on one’s own call is 400', async () => {
    const p = await presented(lina);
    const body = save({
      outcome: 'duo',
      consent: true,
      checked: true,
      meta: { acceptedProposalId: p.id },
    });
    const res = await post(body, sara);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Offre présentée introuvable pour cet appel.' });
    expect(await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, body.id))).toEqual([]);
    expect(await ctx.db.select().from(tcAcceptedDossiers)).toEqual([]);
  });

  it('a second accepted add-on on the same dossier is refused', async () => {
    const p1 = await presented();
    expect((await post(save({ id: p1.callId, meta: { acceptedProposalId: p1.id } }))).status).toBe(
      200,
    );
    const p2 = await presented();
    const res = await post(
      save({ id: p2.callId, meta: { orderRef: 'Dos-001', acceptedProposalId: p2.id } }),
    );
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: DOSSIER_PRECHECK });
    expect(await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, p2.callId))).toEqual([]);
  });

  it('concurrent double-accept on one dossier: exactly one wins, nothing partial', async () => {
    const p1 = await presented(lina);
    const p2 = await presented(sara);
    const ids = [p1.callId, p2.callId];
    // Unsynchronised, the second request arrives after the first has committed and only the
    // pre-check is exercised. Hold tc_call_meta (read only by the dossier pre-check) until both
    // saves wait on it, so both pass the pre-check and the tc_accepted_dossiers key decides.
    let both!: Promise<Array<Awaited<ReturnType<typeof post>>>>;
    await ctx.db.transaction(async (tx) => {
      await tx.execute(sql`LOCK TABLE tc_call_meta IN ACCESS EXCLUSIVE MODE`);
      both = Promise.all([
        post(
          save({ id: p1.callId, meta: { orderRef: 'DOS-777', acceptedProposalId: p1.id } }),
          lina,
        ),
        post(
          save({ id: p2.callId, meta: { orderRef: 'DOS-777', acceptedProposalId: p2.id } }),
          sara,
        ),
      ]);
      await waitForLockWaiters('tc_call_meta', 2);
    });
    const [r1, r2] = await both;
    expect([r1!.status, r2!.status].sort((a, b) => a - b)).toEqual([200, 409]);
    const [winner, winnerUser, loser] =
      r1!.status === 200 ? [p1, linaUser, r2!] : [p2, saraUser, r1!];
    // Both saves passed the pre-check, so the loser is refused by the constraint itself.
    expect(loser.body).toEqual({ error: DOSSIER_UNIQUE });
    const calls = await ctx.db.select().from(tcCalls).where(inArray(tcCalls.id, ids));
    const metas = await ctx.db.select().from(tcCallMeta).where(inArray(tcCallMeta.call_id, ids));
    expect(calls.map((c) => c.id)).toEqual([winner.callId]);
    expect(metas.map((m) => m.call_id)).toEqual([winner.callId]);
    expect(await ctx.db.select().from(tcAcceptedDossiers)).toEqual([
      { order_ref: 'DOS-777', call_id: winner.callId, user_id: winnerUser.id },
    ]);
    expect((await auditRows('call.closed')).map((a) => a.target)).toEqual([winner.callId]);
  });

  it('two identical concurrent save-call requests: one saves, the other is a duplicate', async () => {
    const body = save({ outcome: 'initial', consent: false, checked: false });
    // Hold tc_proposals (read by the ownership check, after the existing-call check) until both
    // requests wait on it, so both pass the existing-call check and the tc_calls key decides.
    let both!: Promise<Array<Awaited<ReturnType<typeof post>>>>;
    await ctx.db.transaction(async (tx) => {
      await tx.execute(sql`LOCK TABLE tc_proposals IN ACCESS EXCLUSIVE MODE`);
      both = Promise.all([post(body), post(body)]);
      await waitForLockWaiters('tc_proposals', 2);
    });
    const results = await both;
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(
      results.map((r) => r.body).sort((a, b) => Object.keys(a).length - Object.keys(b).length),
    ).toEqual([{ ok: true }, { ok: true, duplicate: true }]);
    expect(await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, body.id))).toHaveLength(1);
    expect(
      await ctx.db.select().from(tcCallMeta).where(eq(tcCallMeta.call_id, body.id)),
    ).toHaveLength(1);
    expect((await auditRows('call.closed')).map((a) => a.target)).toEqual([body.id]);
  });

  it('a concurrent save-call by another adviser on the same id is 409', async () => {
    const body = save({ outcome: 'initial', consent: false, checked: false });
    let both!: Promise<Array<Awaited<ReturnType<typeof post>>>>;
    await ctx.db.transaction(async (tx) => {
      await tx.execute(sql`LOCK TABLE tc_proposals IN ACCESS EXCLUSIVE MODE`);
      both = Promise.all([post(body, lina), post(body, sara)]);
      await waitForLockWaiters('tc_proposals', 2);
    });
    const [r1, r2] = await both;
    expect([r1!.status, r2!.status].sort((a, b) => a - b)).toEqual([200, 409]);
    const [loser, winnerUser] = r1!.status === 200 ? [r2!, linaUser] : [r1!, saraUser];
    expect(loser.body).toEqual({ error: 'Identifiant déjà utilisé.' });
    const calls = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, body.id));
    expect(calls.map((c) => c.user_id)).toEqual([winnerUser.id]);
  });

  it('a refused add-on keeps the initial value', async () => {
    const body = save({ outcome: 'refused', refusal: 'budget', consent: false, checked: false });
    const res = await post(body);
    expect(res.status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, body.id));
    expect(call).toMatchObject({
      outcome: 'refused',
      refusal: 'budget',
      offered_total: 1800,
      base_total: 1800,
      catalogue_total: 3300,
      extra: 0,
    });
    expect(await ctx.db.select().from(tcAcceptedDossiers)).toEqual([]);
  });

  it('callback dates', async () => {
    const missing = await post(save({ outcome: 'callback' }));
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ error: 'Indiquez la date du rappel.' });
    const past = await post(save({ outcome: 'callback', meta: { callbackAt: at(-DAY) } }));
    expect(past.status).toBe(400);
    expect(past.body).toEqual({ error: 'Choisissez un rappel futur dans les 12 prochains mois.' });
    const far = await post(save({ outcome: 'callback', meta: { callbackAt: at(367 * DAY) } }));
    expect(far.status).toBe(400);
    expect(far.body).toEqual({ error: 'Choisissez un rappel futur dans les 12 prochains mois.' });
    const tomorrow = at(DAY);
    const body = save({ outcome: 'callback', meta: { callbackAt: tomorrow } });
    const ok = await post(body);
    expect(ok.status).toBe(200);
    const [meta] = await ctx.db.select().from(tcCallMeta).where(eq(tcCallMeta.call_id, body.id));
    expect(meta!.callback_at!.toISOString()).toBe(tomorrow);
    expect(meta!.callback_done).toBe(0);
    expect((meta!.data as Record<string, unknown>).callbackAt).toBe(tomorrow);
  });

  it('a call started more than 7 days ago is rejected', async () => {
    const old = await post(save({ meta: { startedAt: at(-8 * DAY) } }));
    expect(old.status).toBe(400);
    expect(old.body).toEqual({ error: 'Horodatage de début invalide. Ouvrez un nouvel appel.' });
    const future = await post(save({ meta: { startedAt: at(5 * 60_000) } }));
    expect(future.status).toBe(400);
    expect(future.body).toEqual({
      error: 'Horodatage de début invalide. Ouvrez un nouvel appel.',
    });
  });

  it('pack upgrade replaces the shampoo without double billing', async () => {
    const pack = {
      baseId: 'shpousse',
      upgradeId: 'packpousse',
      productIds: ['packpousse'],
      tier: 'catalogue',
      agreedTotal: 3250,
    };
    const body = present(pack);
    const shown = await post(body);
    expect(shown.status).toBe(200);
    expect(shown.body.proposal).toMatchObject({
      offerTotal: 3250,
      extra: 1350,
      catalogueTotal: 3250,
    });
    const res = await post(
      save({ id: body.callId, ...pack, outcome: 'duo', meta: { acceptedProposalId: body.id } }),
    );
    expect(res.status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, body.callId));
    expect(call).toMatchObject({
      offered_total: 3250,
      base_total: 1900,
      catalogue_total: 3250,
      extra: 1350,
      tier: 'catalogue',
    });
  });

  it('a product the customer asks for, outside the suggestions, can be presented and saved', async () => {
    const profile = {
      ...EMPTY_PROFILE,
      concerns: ['acne'],
      severity: 'mild',
      skin: 'mixed',
      sensitive: 'no',
      routineKnown: true,
      routine: [],
      safety: ['none'],
    };
    const fixtures = fixtureAll as unknown as Product[];
    const suggested = recommend(fixtures, fixture('antiacne') as unknown as Product, profile);
    expect(suggested.length).toBeGreaterThan(0);
    expect(suggested.map((r) => r.product.id)).not.toContain('shpousse');
    const agreedTotal = basketOffer(
      [fixture('antiacne'), fixture('shpousse')] as unknown as Product[],
      'duo',
    );
    expect(agreedTotal).toBe(3400);
    const requested = { productIds: ['antiacne', 'shpousse'], agreedTotal };
    const body = present(requested);
    const shown = await post(body);
    expect(shown.status).toBe(200);
    expect(shown.body.proposal).toMatchObject({
      offerTotal: 3400,
      catalogueTotal: 3700,
      extra: 1600,
    });
    const res = await post(
      save({ id: body.callId, ...requested, meta: { acceptedProposalId: body.id } }),
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, body.callId));
    expect(call).toMatchObject({
      outcome: 'duo',
      offered_total: 3400,
      catalogue_total: 3700,
      base_total: 1800,
      extra: 1600,
    });
    expect(call!.products.map((x) => x.id)).toEqual(['antiacne', 'shpousse']);
  });
});

describe('reminders', () => {
  it('reminders are scoped and can be closed', async () => {
    const tomorrow = at(DAY);
    const mine = save({
      outcome: 'callback',
      meta: { orderRef: 'dos-101', callbackAt: tomorrow },
    });
    const theirs = save({ outcome: 'callback', meta: { orderRef: '', callbackAt: at(2 * DAY) } });
    expect((await post(mine, lina)).status).toBe(200);
    expect((await post(theirs, sara)).status).toBe(200);
    expect((await post(save({ outcome: 'initial' }), lina)).status).toBe(200);

    const own = await deskGet(ctx, '?action=reminders', lina);
    expect(own.status).toBe(200);
    expect(own.body.limit).toBe(500);
    expect(own.body.reminders).toHaveLength(1);
    const [row] = own.body.reminders;
    expect(Object.keys(row)).toEqual([
      'id',
      'user_id',
      'operator',
      'base_id',
      'outcome',
      'created_at',
      'callback_at',
      'order_ref',
      'meta',
    ]);
    expect(row).toMatchObject({
      id: mine.id,
      user_id: linaUser.id,
      operator: 'Lina B.',
      base_id: 'antiacne',
      outcome: 'callback',
      callback_at: tomorrow,
      order_ref: 'DOS-101',
    });
    expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(row.meta).toMatchObject({ callbackAt: tomorrow, orderRef: 'DOS-101', team: 'Alger' });

    const all = await deskGet(ctx, '?action=reminders', admin);
    expect(all.body.reminders.map((r: { id: string }) => r.id)).toEqual([mine.id, theirs.id]);

    const denied = await post({ action: 'complete-reminder', callId: mine.id }, sara);
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: 'Accès non autorisé.' });

    const done = await post({ action: 'complete-reminder', callId: mine.id }, lina);
    expect(done.status).toBe(200);
    expect(done.body).toEqual({ ok: true });
    expect((await deskGet(ctx, '?action=reminders', lina)).body.reminders).toEqual([]);
    const [closed] = await ctx.db
      .select()
      .from(tcAudit)
      .where(and(eq(tcAudit.action, 'reminder.closed'), eq(tcAudit.target, mine.id)));
    expect(closed!.user_id).toBe(linaUser.id);
    expect(closed!.detail).toEqual({});

    const byAdmin = await post({ action: 'complete-reminder', callId: theirs.id }, admin);
    expect(byAdmin.status).toBe(200);
    expect((await deskGet(ctx, '?action=reminders', admin)).body.reminders).toEqual([]);
  });
});

describe('multiple products in the original order', () => {
  const baseIds = ['antiacne', 'wcgel'];
  const productIds = [...baseIds, 'wcspf'];

  it('saves the complete initial order at its full price without counting an upsell', async () => {
    const body = save({
      baseIds,
      productIds: baseIds,
      outcome: 'initial',
      tier: 'catalogue',
      agreedTotal: 3300,
      consent: false,
      checked: false,
    });
    expect((await post(body)).status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, body.id));
    const [meta] = await ctx.db.select().from(tcCallMeta).where(eq(tcCallMeta.call_id, body.id));
    expect(call).toMatchObject({
      base_id: 'antiacne',
      base_total: 3300,
      offered_total: 3300,
      extra: 0,
    });
    expect(call.products.map((p) => p.id)).toEqual(baseIds);
    expect((meta.data as CallMeta).originals?.map((p) => p.id)).toEqual(baseIds);
    expect((meta.data as CallMeta).original?.id).toBe('antiacne');
    const rows = await contributions(ctx.db, localDay(new Date()), localDay(new Date()));
    expect(rows[0]).toMatchObject({
      confirmations: 1,
      upsells: 0,
      initial_dzd: 3300,
      confirmed_dzd: 3300,
    });
  });

  it('counts only the third product and its actual uplift as the accepted upsell', async () => {
    const offer = await presented(lina, { baseIds, productIds, agreedTotal: 4400 });
    const [savedProposal] = await ctx.db
      .select()
      .from(tcProposals)
      .where(eq(tcProposals.id, offer.id));
    expect(savedProposal.snapshot).toMatchObject({ extra: 1100, offerTotal: 4400 });
    expect(savedProposal.snapshot.originals?.map((p) => p.id)).toEqual(baseIds);
    expect(
      (
        await post(
          save({
            id: offer.callId,
            baseIds,
            productIds,
            outcome: 'trio',
            agreedTotal: 4400,
            meta: { acceptedProposalId: offer.id },
          }),
        )
      ).status,
    ).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, offer.callId));
    expect(call).toMatchObject({
      base_total: 3300,
      catalogue_total: 4800,
      offered_total: 4400,
      extra: 1100,
    });
    const rows = await contributions(ctx.db, localDay(new Date()), localDay(new Date()));
    expect(rows[0]).toMatchObject({
      confirmations: 1,
      upsells: 1,
      initial_dzd: 3300,
      confirmed_dzd: 4400,
      uplift_dzd: 1100,
    });
  });

  it('retains the whole initial baseline when the new product is refused', async () => {
    const offer = await presented(lina, { baseIds, productIds, agreedTotal: 4400 });
    expect(
      (
        await post(
          save({
            id: offer.callId,
            baseIds,
            productIds,
            outcome: 'refused',
            refusal: 'budget',
            agreedTotal: 4400,
          }),
        )
      ).status,
    ).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, offer.callId));
    expect(call).toMatchObject({ base_total: 3300, offered_total: 3300, extra: 0 });
  });

  it('preserves multiple initial products in reminder data', async () => {
    const body = save({
      baseIds,
      productIds: baseIds,
      outcome: 'callback',
      meta: { callbackAt: at(DAY) },
    });
    expect((await post(body)).status).toBe(200);
    const res = await deskGet(ctx, '?action=reminders', lina);
    expect(res.status).toBe(200);
    expect(
      res.body.reminders
        .find((r: { id: string }) => r.id === body.id)
        .meta.originals.map((p: { id: string }) => p.id),
    ).toEqual(baseIds);
  });

  it('allows an unchanged existing order above three care products, but rejects a new addition', async () => {
    const originals = ['antiacne', 'wcgel', 'wcspf', 'shpousse'];
    const body = save({ baseIds: originals, productIds: originals, outcome: 'initial' });
    expect((await post(body)).status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, body.id));
    expect(call).toMatchObject({ base_total: 6700, offered_total: 6700, extra: 0 });
    expect(
      (
        await post(
          save({ baseIds: originals, productIds: [...originals, 'conditioner'], outcome: 'trio' }),
        )
      ).status,
    ).toBe(400);
  });

  it('does not require new-product verification for products already in the original order', async () => {
    const res = await post(
      present({
        baseIds: ['antiacne', 'nia12'],
        productIds: ['antiacne', 'nia12', 'wcspf'],
        agreedTotal: 4800,
      }),
    );
    expect(res.status).toBe(200);
  });

  it.each([
    { baseIds: ['antiacne', 'antiacne'] },
    { baseIds: ['wcgel', 'antiacne'] },
    { baseIds: ['antiacne', 'nonexistent'] },
    { baseIds, productIds: ['antiacne', 'wcspf'] },
    { baseIds, productIds: ['antiacne', 'wcspf', 'wcgel'] },
    {
      baseId: 'shpousse',
      baseIds: ['shpousse', 'wcgel'],
      upgradeId: 'packpousse',
      productIds: ['packpousse', 'wcgel'],
    },
  ])('rejects an invalid or partially removed initial order: %j', async (overrides) => {
    expect((await post(present(overrides))).status).toBe(400);
    expect((await post(save({ ...overrides, outcome: 'initial' }))).status).toBe(400);
  });

  it('rejects an original two-product order falsely declared as an upsell', async () => {
    expect((await post(present({ baseIds, productIds: baseIds }))).status).toBe(400);
    expect((await post(save({ baseIds, productIds: baseIds }))).status).toBe(400);
  });

  it('prevents rewriting the initial baseline after an offer was presented', async () => {
    const offer = await presented(lina, { baseIds, productIds, agreedTotal: 4400 });
    expect(
      (await post(present({ callId: offer.callId, productIds, agreedTotal: 4400 }))).status,
    ).toBe(409);
    expect(
      (
        await post(
          save({
            id: offer.callId,
            productIds,
            outcome: 'trio',
            agreedTotal: 4400,
            meta: { acceptedProposalId: offer.id },
          }),
        )
      ).status,
    ).toBe(409);
    expect((await post(save({ id: offer.callId, productIds, outcome: 'refused' }))).status).toBe(
      409,
    );
    const legacy = save({ id: offer.callId, productIds, outcome: 'refused' });
    delete legacy.meta;
    expect((await post(legacy)).status).toBe(409);
  });

  it('persists the full baseline even for a client without optional call context', async () => {
    const body = save({ baseIds, productIds: baseIds, outcome: 'initial' });
    delete body.meta;
    expect((await post(body)).status).toBe(200);
    const [meta] = await ctx.db.select().from(tcCallMeta).where(eq(tcCallMeta.call_id, body.id));
    expect((meta.data as CallMeta).originals?.map((p) => p.id)).toEqual(baseIds);
    expect(meta.version).toBe(1);
  });
});
