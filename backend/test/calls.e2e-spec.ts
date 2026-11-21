import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { tcAcceptedDossiers, tcAudit, tcCallMeta, tcCalls, tcProposals } from '../src/db/schema.js';
import { EMPTY_PROFILE, type Product, type CallMeta, type OrderItem, basketOffer, recommend, localDay, money, offerProblem } from '@touche/domain';
import { contributions } from '../src/desk/contributions.js';
import { productStats } from '@touche/domain';
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
/** The seeded catalogue, as the shared pricing rules read it. */
const catalogue = fixtureAll as unknown as Product[];

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

  it('a stale price is 409 with the new amount and the price-changed code', async () => {
    const res = await post(present({ agreedTotal: 3100, expectedUserId: linaUser.id }));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: `Le tarif a changé : cette offre vaut maintenant ${money(3000)}. Le catalogue a été mis à jour, annoncez le nouveau montant.`,
      code: 'price-changed',
    });
    // An older open tab ignores `code` and keeps its prices until the page is reloaded.
    const oldTab = await post(present({ agreedTotal: 3100 }));
    expect(oldTab.status).toBe(409);
    expect(oldTab.body).toEqual({
      error: `Le tarif a changé : cette offre vaut maintenant ${money(3000)}. Rechargez la page pour mettre les prix à jour, puis annoncez le nouveau montant.`,
      code: 'price-changed',
    });
    for (const r of [res, oldTab]) expect(r.body.error).not.toMatch(/Actualisez/);
    expect(await ctx.db.select().from(tcProposals)).toEqual([]);
    expect(await auditRows('offer.presented')).toEqual([]);
  });

  it('a catalogue price edited during the call names the new offer amount (H2)', async () => {
    expect((await post({ action: 'product', product: { ...fixture('wcgel'), price: 1600 } }, admin)).status).toBe(200);
    const res = await post(present({ expectedUserId: linaUser.id }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('price-changed');
    expect(res.body.error).toBe(
      `Le tarif a changé : cette offre vaut maintenant ${money(3100)}. Le catalogue a été mis à jour, annoncez le nouveau montant.`,
    );
    expect((await post(present({ agreedTotal: 3100 }))).status).toBe(200);
  });

  it('a stale price is reported before the raise-the-order check (H2 before M5)', async () => {
    const order = { baseId: 'serumspf', baseQuantities: { serumspf: 3 }, quantities: { serumspf: 3, wcgel: 1 }, productIds: ['serumspf', 'wcgel'], tier: 'final' };
    const stale = await post(present({ ...order, agreedTotal: 8400, expectedUserId: linaUser.id }));
    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({
      error: `Le tarif a changé : cette offre vaut maintenant ${money(8500)}. Le catalogue a été mis à jour, annoncez le nouveau montant.`,
      code: 'price-changed',
    });
    const current = await post(present({ ...order, agreedTotal: 8500, expectedUserId: linaUser.id }));
    expect(current.status).toBe(400);
    expect(current.body.error).toContain(money(8500));
    expect(current.body).not.toHaveProperty('code');
  });

  it('an offer that does not raise the order is refused with the shared message (M5)', async () => {
    const order = { baseId: 'serumspf', baseQuantities: { serumspf: 3 }, quantities: { serumspf: 3, wcgel: 1 }, productIds: ['serumspf', 'wcgel'] };
    const initial = [{ ...fixture('serumspf'), quantity: 3 }] as unknown as OrderItem[];
    const basket = [...initial, { ...fixture('wcgel'), quantity: 1 }] as unknown as OrderItem[];
    const message = offerProblem(initial, basket, 'final', catalogue);
    expect(message).toContain(money(8500));
    const res = await post(present({ ...order, tier: 'final', agreedTotal: 8500 }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: message });
    expect(await ctx.db.select().from(tcProposals)).toEqual([]);
    expect((await post(present({ ...order, tier: 'duo', agreedTotal: 9500 }))).status).toBe(200);
  });

  it('a product added to the offer must still be available, the customer’s own products need not be (M3)', async () => {
    const off = (id: string) => post({ action: 'product', product: { ...fixture(id), enabled: false } }, admin);
    expect((await off('antiacne')).status).toBe(200);
    expect((await post(present())).status).toBe(200);
    expect((await off('wcgel')).status).toBe(200);
    const res = await post(present({ expectedUserId: linaUser.id }));
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: '« Water Complex Gel » n’est plus disponible dans le catalogue : retirez-le de l’offre et présentez-la de nouveau.',
      code: 'product-disabled',
    });
    const oldTab = await post(present());
    expect(oldTab.status).toBe(400);
    expect(oldTab.body).toEqual({
      error: '« Water Complex Gel » n’est plus disponible dans le catalogue : retirez-le de l’offre et présentez-la de nouveau. Rechargez la page pour mettre le catalogue à jour.',
      code: 'product-disabled',
    });
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
      { order_ref: 'DOS-001', call_id: p.callId, user_id: linaUser.id, voided_at: null },
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

  it('a catalogue price change after presentation does not block the presented sale (H2)', async () => {
    const p = await presented();
    for (const [id, price] of [['wcgel', 1600], ['antiacne', 1900]] as const) {
      expect((await post({ action: 'product', product: { ...fixture(id), price } }, admin)).status).toBe(200);
    }
    const res = await post(save({ id: p.callId, meta: { acceptedProposalId: p.id } }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, p.callId));
    expect(call).toMatchObject({ offered_total: 3000, base_total: 1800, catalogue_total: 3300, extra: 1200 });
    expect(call!.products.map((x) => [x.id, x.price])).toEqual([['antiacne', 1800], ['wcgel', 1500]]);
    const [meta] = await ctx.db.select().from(tcCallMeta).where(eq(tcCallMeta.call_id, p.callId));
    expect((meta!.data as CallMeta).originals?.map((x) => x.price)).toEqual([1800]);
  });

  it('a sale that differs from the presented snapshot is still 409, whatever the catalogue', async () => {
    const p = await presented();
    expect((await post({ action: 'product', product: { ...fixture('wcgel'), price: 1600 } }, admin)).status).toBe(200);
    for (const change of [{ agreedTotal: 3100 }, { delivery: 400 }, { tier: 'final', agreedTotal: 2700 }]) {
      const res = await post(save({ id: p.callId, ...change, meta: { acceptedProposalId: p.id } }));
      expect(res.status).toBe(409);
      expect(res.body).toEqual({ error: 'La composition ou le tarif a changé. Présentez de nouveau l’offre exacte.' });
    }
    expect(await ctx.db.select().from(tcCalls)).toEqual([]);
  });

  it('a price change never blocks a non-sale outcome; a refusal keeps the presented amounts (H2)', async () => {
    const p = await presented();
    for (const [id, price] of [['wcgel', 1600], ['antiacne', 1900]] as const) {
      expect((await post({ action: 'product', product: { ...fixture(id), price } }, admin)).status).toBe(200);
    }
    const refused = await post(save({ id: p.callId, outcome: 'refused', refusal: 'budget', consent: false, checked: false }));
    expect(refused.status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, p.callId));
    expect(call).toMatchObject({ outcome: 'refused', offered_total: 1800, base_total: 1800, catalogue_total: 3300, extra: 0 });
    for (const outcome of ['initial', 'noanswer', 'review'] as const) {
      const body = save({ outcome, consent: false, checked: false });
      expect((await post(body)).status).toBe(200);
      const [row] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, body.id));
      expect(row).toMatchObject({ base_total: 1900, catalogue_total: 3500, offered_total: outcome === 'initial' ? 1900 : 0, extra: 0 });
    }
  });

  it('pack contents and the unit count of a sale come from the presented offer, not the catalogue edited since', async () => {
    const edit = async (id: string, components: string[]) =>
      expect((await post({ action: 'product', product: { ...fixture(id), components } }, admin)).status).toBe(200);
    // Shampoo + Pack Anti-chute (2 products): a trio. The pack then gains the shampoo and a third product.
    const offer = { baseId: 'shpousse', productIds: ['shpousse', 'packanti'], tier: 'duo' };
    const agreedTotal = basketOffer([fixture('shpousse'), fixture('packanti')] as unknown as Product[], 'duo', catalogue);
    const p = await presented(lina, { ...offer, agreedTotal });
    await edit('packanti', ['shanti', 'serumhair', 'shpousse']);
    const trio = await post(save({ id: p.callId, ...offer, agreedTotal, outcome: 'trio', meta: { orderRef: 'DOS-PACK', acceptedProposalId: p.id } }));
    expect(trio.status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, p.callId));
    const [shown] = await ctx.db.select().from(tcProposals).where(eq(tcProposals.id, p.id));
    expect(call!.products).toEqual(shown!.snapshot.products);
    expect(call!.products[1]!.components!.map((c) => c.id)).toEqual(['shanti', 'serumhair']);
    // A pack upgrade presented while the pack held the shampoo stays sellable once it no longer does.
    const upgrade = { baseId: 'shpousse', upgradeId: 'packpousse', productIds: ['packpousse'], tier: 'catalogue', agreedTotal: 3250 };
    const u = await presented(lina, upgrade);
    await edit('packpousse', ['conditioner', 'serumhair', 'shanti']);
    expect((await post(save({ id: u.callId, ...upgrade, outcome: 'duo', meta: { orderRef: 'DOS-UP', acceptedProposalId: u.id } }))).status).toBe(200);
    // The presented offer itself must still match the outcome.
    const d = await presented();
    const wrong = await post(save({ id: d.callId, outcome: 'trio', meta: { acceptedProposalId: d.id } }));
    expect(wrong.status).toBe(400);
    expect(wrong.body).toEqual({ error: 'Le résultat doit correspondre aux soins physiques, composants des packs inclus.' });
  });

  it('an accepted sale on a stored offer that does not raise the order is refused (M5)', async () => {
    const callId = randomUUID();
    const id = randomUUID();
    const item = (x: string, quantity = 1) => ({ id: x, name: x, price: fixture(x).price as number, quantity, category: fixture(x).category as string, components: [] });
    const snapshot = {
      id, call_id: callId, user_id: linaUser.id, created_at: new Date().toISOString(),
      base: item('serumspf', 3), originals: [item('serumspf', 3)], products: [item('serumspf', 3), item('wcgel')],
      catalogueTotal: 10350, offerTotal: 8500, extra: -350, tier: 'final', delivery: null, version: 3,
    };
    await ctx.db.insert(tcProposals).values({ id, call_id: callId, user_id: linaUser.id, created_at: new Date(), snapshot });
    const res = await post(save({
      id: callId, baseId: 'serumspf', baseQuantities: { serumspf: 3 }, quantities: { serumspf: 3, wcgel: 1 },
      productIds: ['serumspf', 'wcgel'], tier: 'final', agreedTotal: 8500, outcome: 'routine', meta: { acceptedProposalId: id },
    }));
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(offerProblem(snapshot.originals as unknown as OrderItem[], snapshot.products as unknown as OrderItem[], 'final', catalogue));
    expect(await ctx.db.select().from(tcCalls)).toEqual([]);
  });

  it('a disabled product blocks only a sale that adds it (M3)', async () => {
    const p = await presented();
    const off = (id: string) => post({ action: 'product', product: { ...fixture(id), enabled: false } }, admin);
    expect((await off('antiacne')).status).toBe(200);
    expect((await off('wcgel')).status).toBe(200);
    const unavailable = '« Water Complex Gel » n’est plus disponible dans le catalogue : retirez-le de l’offre et présentez-la de nouveau.';
    const sale = await post(save({ id: p.callId, expectedUserId: linaUser.id, meta: { acceptedProposalId: p.id } }));
    expect(sale.status).toBe(400);
    expect(sale.body).toEqual({ error: unavailable, code: 'product-disabled' });
    const oldTab = await post(save({ id: p.callId, meta: { acceptedProposalId: p.id } }));
    expect(oldTab.status).toBe(400);
    expect(oldTab.body).toEqual({ error: unavailable + ' Rechargez la page pour mettre le catalogue à jour.', code: 'product-disabled' });
    for (const outcome of ['refused', 'initial', 'noanswer', 'review', 'callback'] as const) {
      const body = save({ outcome, refusal: outcome === 'refused' ? 'budget' : '', consent: false, checked: false, meta: outcome === 'callback' ? { callbackAt: at(DAY) } : {} });
      const res = await post(body);
      expect(res.status, outcome).toBe(200);
    }
    const kept = save({ productIds: ['antiacne'], outcome: 'initial', consent: false, checked: false });
    delete kept.meta;
    expect((await post(kept)).status).toBe(200);
  });

  it('an accepted sale without call context is refused; old saved rows still report (H4)', async () => {
    const p = await presented();
    const legacy = save({ id: p.callId });
    delete legacy.meta;
    const res = await post(legacy);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Marquez l’offre comme présentée avant de confirmer la vente.' });
    const today = localDay(new Date());
    const old = await ctx.db.insert(tcCalls).values({
      id: randomUUID(), user_id: linaUser.id, operator: 'Lina B.', created_at: new Date(), outcome: 'duo', base_id: 'antiacne',
      products: [{ id: 'antiacne', name: 'Sérum Anti-Acné', price: 1800 }, { id: 'wcgel', name: 'Water Complex Gel', price: 1500 }],
      catalogue_total: 3300, base_total: 1800, offered_total: 3000, delivery: null, tier: 'duo', extra: 1200,
    }).returning({ id: tcCalls.id });
    const report = await deskGet(ctx, `?action=analytics&from=${today}&to=${today}`, admin);
    expect(report.status).toBe(200);
    expect(report.body.calls.find((c: { id: string }) => c.id === old[0]!.id)).toMatchObject({ meta: {}, proposals: [] });
    const progress = await deskGet(ctx, '?action=my-progress', lina);
    expect(progress.body).toMatchObject({ sold: 1, withoutReference: 1 });
  });

  it('a retry of a recorded call is a duplicate even after the catalogue changed', async () => {
    const p = await presented();
    const body = save({ id: p.callId, meta: { acceptedProposalId: p.id } });
    expect((await post(body)).status).toBe(200);
    expect((await post({ action: 'product', product: { ...fixture('wcgel'), price: 1600, enabled: false } }, admin)).status).toBe(200);
    const again = await post(body);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ ok: true, duplicate: true, outcome: 'duo' });
  });

  it('retrying save-call is idempotent', async () => {
    const p = await presented();
    const body = save({ id: p.callId, meta: { acceptedProposalId: p.id } });
    expect((await post(body)).status).toBe(200);
    const again = await post(body);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ ok: true, duplicate: true, outcome: 'duo' });
    expect(await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, p.callId))).toHaveLength(1);
    expect(await ctx.db.select().from(tcAcceptedDossiers)).toHaveLength(1);
    expect(await auditRows('call.closed')).toHaveLength(1);
  });

  it('a retry with another outcome answers with the outcome stored the first time', async () => {
    const body = save({ outcome: 'initial', consent: false, checked: false });
    expect((await post(body)).status).toBe(200);
    const again = await post({ ...body, outcome: 'noanswer' });
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ ok: true, duplicate: true, outcome: 'initial' });
    const [row] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, body.id));
    expect(row!.outcome).toBe('initial');
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
      { order_ref: 'DOS-777', call_id: winner.callId, user_id: winnerUser.id, voided_at: null },
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
    ).toEqual([{ ok: true }, { ok: true, duplicate: true, outcome: 'initial' }]);
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

  it('a start time over 7 days old is rejected; an older call within the week is kept', async () => {
    for (const startedAt of [at(-8 * DAY), at(-7 * DAY - 60_000)]) {
      const old = await post(save({ outcome: 'initial', consent: false, checked: false, meta: { startedAt } }));
      expect(old.status).toBe(400);
      expect(old.body).toEqual({ error: 'Horodatage de début invalide. Ouvrez un nouvel appel.' });
    }
    for (const startedAt of [at(-7 * DAY + 60_000), at(-DAY - 60_000)]) {
      const body = save({ outcome: 'initial', consent: false, checked: false, meta: { startedAt } });
      expect((await post(body)).status).toBe(200);
      const [meta] = await ctx.db.select().from(tcCallMeta).where(eq(tcCallMeta.call_id, body.id));
      expect((meta!.data as CallMeta).startedAt).toBe(startedAt);
    }
  });

  it('a desk clock ahead of the server is clamped to the server time, not refused (M4)', async () => {
    const p = await presented();
    const res = await post(save({ id: p.callId, meta: { startedAt: at(2 * 60 * 60_000), acceptedProposalId: p.id } }));
    expect(res.status).toBe(200);
    const [meta] = await ctx.db.select().from(tcCallMeta).where(eq(tcCallMeta.call_id, p.callId));
    const data = meta!.data as CallMeta & { completedAt: string };
    expect(Date.parse(data.startedAt!)).toBeLessThanOrEqual(Date.parse(data.completedAt));
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

  it('a verified pack that is not suggested automatically can be presented, sold or refused (H3)', async () => {
    const pack = { baseId: 'shpso', upgradeId: 'packpso', productIds: ['packpso'], tier: 'catalogue', agreedTotal: 3450, verifiedProducts: ['packpso'] };
    const unverified = { ...pack, verifiedProducts: undefined };
    expect((await post(present(unverified))).status).toBe(400);
    const declined = await presented(lina, pack);
    const refused = await post(save({ ...unverified, id: declined.callId, outcome: 'refused', refusal: 'budget', consent: false, checked: false }));
    expect(refused.status).toBe(200);
    for (const outcome of ['noanswer', 'initial', 'review'] as const) {
      expect((await post(save({ ...unverified, outcome, consent: false, checked: false }))).status, outcome).toBe(200);
    }
    const sold = await presented(lina, pack);
    const missing = await post(save({ ...unverified, id: sold.callId, outcome: 'duo', meta: { acceptedProposalId: sold.id } }));
    expect(missing.status).toBe(400);
    expect(missing.body).toEqual({ error: 'Cette référence nécessite une vérification de sa fiche avant ajout automatique.' });
    const ok = await post(save({ ...pack, id: sold.callId, outcome: 'duo', meta: { orderRef: 'DOS-PSO', acceptedProposalId: sold.id } }));
    expect(ok.status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, sold.callId));
    expect(call).toMatchObject({ offered_total: 3450, base_total: 1900, extra: 1550 });
    const wrong = await post(save({ ...pack, baseId: 'antiacne', outcome: 'noanswer', consent: false, checked: false }));
    expect(wrong.status).toBe(400);
    expect(wrong.body).toEqual({ error: 'Pack de remplacement non compatible avec le produit initial.' });
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
      fixtures,
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

describe('hair-pack products chosen separately', () => {
  // Shampooing Pousse 1900 + Après-Shampooing 1700 = 3600 at list price, 3250 as Pack Pousse et Croissance.
  const pair = { baseId: 'shpousse', productIds: ['shpousse', 'conditioner'] };

  it.each(['catalogue', 'duo', 'final'])('presents the pair at the pack price (%s)', async (tier) => {
    const res = await post(present({ ...pair, tier, agreedTotal: 3250 }));
    expect(res.status).toBe(200);
    expect(res.body.proposal).toMatchObject({
      offerTotal: 3250,
      extra: 1350,
      catalogueTotal: 3600,
      tier,
      base: { id: 'shpousse', price: 1900 },
    });
    expect(res.body.proposal.products.map((p: { id: string }) => p.id)).toEqual(['shpousse', 'conditioner']);
  });

  it('refuses the discounted list-price amount of the pair and names the pack price', async () => {
    const res = await post(present({ ...pair, tier: 'duo', agreedTotal: 3300, expectedUserId: linaUser.id }));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: `Le tarif a changé : cette offre vaut maintenant ${money(3250)}. Le catalogue a été mis à jour, annoncez le nouveau montant.`,
      code: 'price-changed',
    });
    expect(await ctx.db.select().from(tcProposals)).toEqual([]);
  });

  it('tells a tab opened before this rule to reload the page: reloading its catalogue would not change its amount', async () => {
    const body = present({ ...pair, tier: 'duo', agreedTotal: 3300, expectedUserId: linaUser.id });
    for (const pricing of [null, 'list-price', 'hair-pack-sets']) {
      const res = await deskPost(ctx, body, { cookie: lina, pricing });
      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: `Le tarif a changé : cette offre vaut maintenant ${money(3250)}. Rechargez la page pour mettre les prix à jour, puis annoncez le nouveau montant.`,
        code: 'price-changed',
      });
    }
    expect(await ctx.db.select().from(tcProposals)).toEqual([]);
  });

  it('saves the accepted pair at the pack price and keeps the list-price catalogue total', async () => {
    const offer = await presented(lina, { ...pair, tier: 'duo', agreedTotal: 3250 });
    const res = await post(
      save({ ...pair, id: offer.callId, tier: 'duo', agreedTotal: 3250, outcome: 'duo', meta: { acceptedProposalId: offer.id } }),
    );
    expect(res.status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, offer.callId));
    expect(call).toMatchObject({
      outcome: 'duo',
      offered_total: 3250,
      base_total: 1900,
      extra: 1350,
      catalogue_total: 3600,
      tier: 'duo',
    });
    expect(call!.products.map((x) => x.id)).toEqual(['shpousse', 'conditioner']);
  });

  it('values an initial order that already contains the pair at the pack price', async () => {
    const body = save({
      ...pair,
      baseIds: pair.productIds,
      outcome: 'initial',
      tier: 'catalogue',
      agreedTotal: 3250,
      consent: false,
      checked: false,
    });
    expect((await post(body)).status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, body.id));
    expect(call).toMatchObject({
      outcome: 'initial',
      base_total: 3250,
      offered_total: 3250,
      extra: 0,
      catalogue_total: 3600,
    });
    expect(call!.products.map((x) => x.id)).toEqual(['shpousse', 'conditioner']);
    const rows = await contributions(ctx.db, localDay(new Date()), localDay(new Date()));
    expect(rows[0]).toMatchObject({ confirmations: 1, upsells: 0, initial_dzd: 3250, confirmed_dzd: 3250 });
  });

  // An initial pair + Sérum Anti-Chute at the final price: (3250 × 11 + 1900 × 9) / 1100 → 4900 (list-price discount: 4500).
  const trio = { ...pair, baseIds: pair.productIds, productIds: [...pair.productIds, 'serumhair'], tier: 'final', agreedTotal: 4900 };

  it('prices a third product on top of an initial pair from the pack value, presented and accepted', async () => {
    const offer = await presented(lina, trio);
    const [shown] = await ctx.db.select().from(tcProposals).where(eq(tcProposals.id, offer.id));
    expect(shown!.snapshot).toMatchObject({ offerTotal: 4900, extra: 1650, catalogueTotal: 5500 });
    const res = await post(save({ ...trio, id: offer.callId, outcome: 'trio', meta: { acceptedProposalId: offer.id } }));
    expect(res.status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, offer.callId));
    expect(call).toMatchObject({ offered_total: 4900, base_total: 3250, extra: 1650, catalogue_total: 5500 });
    const rows = await contributions(ctx.db, localDay(new Date()), localDay(new Date()));
    expect(rows[0]).toMatchObject({ upsells: 1, initial_dzd: 3250, confirmed_dzd: 4900, uplift_dzd: 1650 });
  });

  it('a refusal after that offer keeps the initial pair at the pack price', async () => {
    const offer = await presented(lina, trio);
    const res = await post(save({ ...trio, id: offer.callId, outcome: 'refused', refusal: 'budget', consent: false, checked: false }));
    expect(res.status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, offer.callId));
    expect(call).toMatchObject({ outcome: 'refused', base_total: 3250, offered_total: 3250, extra: 0, catalogue_total: 5500 });
  });

  // A sale or a refusal of a presented offer records the amounts that were presented, whatever the catalogue became since.
  const editPack = (changes: Body) => post({ action: 'product', product: { ...fixture('packpousse'), ...changes } }, admin);
  const acceptTrio = (offer: { id: string; callId: string }, overrides: Body = {}) =>
    post(save({ ...trio, id: offer.callId, outcome: 'trio', meta: { acceptedProposalId: offer.id }, ...overrides }));

  it.each([3100, 5000])('a pack price edited to %i after the presentation keeps the presented amounts of the sale', async (price) => {
    const offer = await presented(lina, trio);
    expect((await editPack({ price })).status).toBe(200);
    const res = await acceptTrio(offer);
    expect(res.status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, offer.callId));
    expect(call).toMatchObject({ offered_total: 4900, base_total: 3250, extra: 1650, catalogue_total: 5500 });
    const rows = await contributions(ctx.db, localDay(new Date()), localDay(new Date()));
    expect(rows[0]).toMatchObject({ upsells: 1, initial_dzd: 3250, confirmed_dzd: 4900, uplift_dzd: 1650 });
  });

  it('a pack whose contents change after the presentation does not block the presented sale', async () => {
    const offer = await presented(lina, trio);
    expect((await editPack({ components: ['shpousse', 'conditioner', 'serumhair'] })).status).toBe(200);
    const res = await acceptTrio(offer);
    expect(res.status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, offer.callId));
    expect(call).toMatchObject({ offered_total: 4900, base_total: 3250, extra: 1650 });
  });

  it('a refusal after a pack price edit keeps the presented value of the initial order', async () => {
    const offer = await presented(lina, trio);
    expect((await editPack({ price: 3100 })).status).toBe(200);
    const res = await post(save({ ...trio, id: offer.callId, outcome: 'refused', refusal: 'budget', consent: false, checked: false }));
    expect(res.status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, offer.callId));
    expect(call).toMatchObject({ outcome: 'refused', base_total: 3250, offered_total: 3250, extra: 0 });
  });

  it('an offer presented before pack pricing is recorded with the amounts it was presented with', async () => {
    // Before this rule the initial pair counted at its 3 600 DA list sum and the trio at the final price was 4 500 DA.
    const offer = await presented(lina, trio);
    const [shown] = await ctx.db.select().from(tcProposals).where(eq(tcProposals.id, offer.id));
    await ctx.db
      .update(tcProposals)
      .set({ snapshot: { ...shown!.snapshot, offerTotal: 4500, extra: 900 } })
      .where(eq(tcProposals.id, offer.id));
    const res = await acceptTrio(offer, { agreedTotal: 4500 });
    expect(res.status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, offer.callId));
    expect(call).toMatchObject({ offered_total: 4500, base_total: 3600, extra: 900 });
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
      'brand',
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

  it('allows an unchanged existing order above three care products, but rejects a false trio outcome', async () => {
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


describe('accepted routines above three physical products', () => {
  it.each([
    { baseId: 'antiacne', baseIds: ['antiacne'], productIds: ['antiacne', 'wcgel', 'wcspf', 'total'], expectedUnits: 3, expectedOffer: 6100, expectedBase: 1800 },
    { baseId: 'antiacne', baseIds: ['antiacne', 'wcgel', 'wcspf', 'shpousse'], productIds: ['antiacne', 'wcgel', 'wcspf', 'shpousse', 'conditioner'], expectedUnits: 1, expectedOffer: 7700, expectedBase: 6700 },
    { baseId: 'packpousse', baseIds: ['packpousse'], productIds: ['packpousse', 'antiacne', 'wcgel'], expectedUnits: 2, expectedOffer: 6300, expectedBase: 3250 },
    { baseId: 'shpousse', baseIds: ['shpousse'], upgradeId: 'packpousse', productIds: ['packpousse', 'antiacne', 'wcgel'], expectedUnits: 3, expectedOffer: 6300, expectedBase: 1900 },
  ])('presents, saves and counts every added product: $productIds', async ({expectedUnits, expectedOffer, expectedBase, ...selection}) => {
    const offer = await presented(lina, { ...selection, agreedTotal: expectedOffer });
    const body = save({ ...selection, id: offer.callId, outcome: 'routine', agreedTotal: expectedOffer, meta: { acceptedProposalId: offer.id } });
    expect((await post(body)).status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, offer.callId));
    expect(call).toMatchObject({ outcome: 'routine', offered_total: expectedOffer, base_total: expectedBase, extra: expectedOffer - expectedBase });
    expect(call.products.map(p => p.id)).toEqual(selection.productIds);
    const rows = await contributions(ctx.db, localDay(new Date()), localDay(new Date()));
    expect(rows[0]).toMatchObject({ confirmations: 1, upsells: expectedUnits, initial_dzd: expectedBase, confirmed_dzd: expectedOffer, uplift_dzd: expectedOffer - expectedBase });
    const progress = await deskGet(ctx, '?action=my-progress', lina);
    expect(progress.body.sold).toBe(expectedUnits);
    const duplicate = await presented(lina, { ...selection, agreedTotal: expectedOffer });
    expect((await post(save({ ...body, id: duplicate.callId, meta: { acceptedProposalId: duplicate.id } }))).status).toBe(409);
  });

  it('keeps consent, accurate outcome, exact price and verification checks for larger routines', async () => {
    const selection = { productIds: ['antiacne', 'wcgel', 'wcspf', 'total'], agreedTotal: 6100 };
    const offer = await presented(lina, selection);
    const body = save({ ...selection, id: offer.callId, outcome: 'routine', meta: { acceptedProposalId: offer.id } });
    for (const override of [{consent: false}, {checked: false}, {outcome: 'trio'}]) {
      expect((await post({...body, ...override})).status).toBe(400);
    }
    expect((await post({...body, agreedTotal: 6000})).status).toBe(409);
    expect((await post(present({productIds: ['antiacne', 'wcgel', 'wcspf', 'nia12'], agreedTotal: 6100}))).status).toBe(400);
    expect((await post(present({productIds: ['antiacne', 'packpousse', 'conditioner', 'wcgel']}))).status).toBe(400);
    expect((await post(save({ outcome: 'routine' }))).status).toBe(400);
  });
});


describe('catalogue-price acceptance without a discount', () => {
  it('saves the accepted 3300 DA price and counts the full 1500 DA uplift', async () => {
    const offer = await presented(lina, { tier: 'catalogue', agreedTotal: 3300 });
    const res = await post(save({
      id: offer.callId,
      tier: 'catalogue',
      agreedTotal: 3300,
      meta: { acceptedProposalId: offer.id },
    }));
    expect(res.status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, offer.callId));
    expect(call).toMatchObject({
      outcome: 'duo', tier: 'catalogue', catalogue_total: 3300,
      base_total: 1800, offered_total: 3300, extra: 1500,
    });
    const [row] = await contributions(ctx.db, localDay(new Date()), localDay(new Date()));
    expect(row).toMatchObject({ confirmations: 1, upsells: 1, confirmed_dzd: 3300, uplift_dzd: 1500 });
  });

  it('requires the catalogue price to be presented again when switching from a discount', async () => {
    const discounted = await presented();
    const body = save({
      id: discounted.callId,
      tier: 'catalogue',
      agreedTotal: 3300,
      meta: { acceptedProposalId: discounted.id },
    });
    expect((await post(body)).status).toBe(409);
    expect(await ctx.db.select().from(tcCalls)).toEqual([]);
    const fullPrice = await presented(lina, { callId: discounted.callId, tier: 'catalogue', agreedTotal: 3300 });
    expect((await post({ ...body, meta: { ...body.meta as Body, acceptedProposalId: fullPrice.id } })).status).toBe(200);
  });
});

describe('quantities in original orders and accepted offers', () => {
  it.each([
    { baseId: 'antiacne', productIds: ['antiacne'], baseQuantities: { antiacne: 1 }, quantities: { antiacne: 2 }, tier: 'catalogue', outcome: 'duo', agreedTotal: 3600, baseTotal: 1800, units: 1 },
    { baseId: 'antiacne', productIds: ['antiacne'], baseQuantities: { antiacne: 2 }, quantities: { antiacne: 3 }, tier: 'duo', outcome: 'trio', agreedTotal: 5000, baseTotal: 3600, units: 1 },
    { baseId: 'antiacne', productIds: ['antiacne', 'wcgel'], baseQuantities: { antiacne: 2 }, quantities: { antiacne: 2, wcgel: 3 }, tier: 'duo', outcome: 'routine', agreedTotal: 7400, baseTotal: 3600, units: 3 },
    { baseId: 'packpousse', productIds: ['packpousse', 'wcgel'], baseQuantities: { packpousse: 2 }, quantities: { packpousse: 2, wcgel: 2 }, tier: 'catalogue', outcome: 'routine', agreedTotal: 9500, baseTotal: 6500, units: 2 },
    { baseId: 'shpousse', upgradeId: 'packpousse', productIds: ['packpousse', 'antiacne'], baseQuantities: { shpousse: 2 }, quantities: { packpousse: 2, antiacne: 2 }, tier: 'duo', outcome: 'routine', agreedTotal: 9800, baseTotal: 3800, units: 4 },
  ])('persists quantities, exact amounts and added units: $baseId / $quantities', async ({ outcome, baseTotal, units, ...selection }) => {
    const offer = await presented(lina, selection);
    const result = await post(save({ ...selection, id: offer.callId, outcome, meta: { acceptedProposalId: offer.id } }));
    expect(result.status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, offer.callId));
    expect(call).toMatchObject({ base_total: baseTotal, offered_total: selection.agreedTotal, extra: selection.agreedTotal - baseTotal });
    for (const item of call.products) expect(item.quantity).toBe(selection.quantities[item.id as keyof typeof selection.quantities]);
    const { body: report } = await deskGet(ctx, `?action=analytics&from=${localDay(new Date())}&to=${localDay(new Date())}`, admin);
    expect(productStats(report.calls).reduce((sum, p) => sum + p.units, 0)).toBe(units);
    const { body: progress } = await deskGet(ctx, '?action=my-progress', lina);
    expect(progress.sold).toBe(units);
    const { body: dashboard } = await deskGet(ctx, '?action=contributions', admin);
    expect(dashboard.people.find((p: { id: string }) => p.id === linaUser.id).period).toMatchObject({ upsells: units, initialDzd: baseTotal, confirmedDzd: selection.agreedTotal });
  });

  it('accepts one more unit of the ordered product at the usual offer and counts it for its adviser (UNIT)', async () => {
    // The desk's « + Une unité » on the initial line: Anti-Acné × 1 ordered, × 2 offered at the first offer.
    const agreedTotal = basketOffer([{ ...fixture('antiacne'), quantity: 2 } as unknown as OrderItem], 'duo', catalogue);
    expect(agreedTotal).toBe(3300); // priceOffer(3 600 DA, duo, 2 units)
    const selection = { baseId: 'antiacne', baseIds: ['antiacne'], productIds: ['antiacne'], baseQuantities: { antiacne: 1 }, quantities: { antiacne: 2 }, tier: 'duo', agreedTotal };
    const offer = present(selection);
    const shown = await post(offer);
    expect(shown.status).toBe(200);
    expect(shown.body.proposal).toMatchObject({ catalogueTotal: 3600, offerTotal: 3300, extra: 1500 });
    expect(shown.body.proposal.products).toEqual([expect.objectContaining({ id: 'antiacne', quantity: 2 })]);
    const result = await post(save({ ...selection, id: offer.callId, outcome: 'duo', meta: { acceptedProposalId: offer.id } }));
    expect(result.status).toBe(200);
    expect((await deskGet(ctx, '?action=my-progress', lina)).body.sold).toBe(1);
    expect((await deskGet(ctx, '?action=my-progress', sara)).body.sold).toBe(0);
    const { body: dashboard } = await deskGet(ctx, '?action=contributions', admin);
    expect(dashboard.people.find((p: { id: string }) => p.id === linaUser.id).period).toMatchObject({ upsells: 1, initialDzd: 1800, confirmedDzd: 3300 });
  });

  it.each([0, -1, 1.5, 100, '2', null])('rejects an invalid quantity (%s) in either order', async quantity => {
    expect((await post(present({ quantities: { antiacne: quantity } }))).status).toBe(400);
    expect((await post(save({ baseQuantities: { antiacne: quantity } }))).status).toBe(400);
  });

  it('rejects unknown quantity keys, repeated lines and decreases below the original quantity', async () => {
    expect((await post(present({ quantities: { unknown: 2 } }))).status).toBe(400);
    expect((await post(present({ baseQuantities: { wcgel: 2 } }))).status).toBe(400);
    expect((await post(present({ productIds: ['antiacne', 'antiacne'] }))).status).toBe(400);
    expect((await post(present({ baseQuantities: { antiacne: 2 }, quantities: { antiacne: 1 } }))).status).toBe(400);
    expect((await post(save({ baseQuantities: { antiacne: 2 }, quantities: { antiacne: 1 } }))).status).toBe(400);
  });

  it('locks the original quantity once an offer is presented', async () => {
    const offer = await presented(lina, { baseQuantities: { antiacne: 2 }, quantities: { antiacne: 2, wcgel: 1 }, agreedTotal: 4700 });
    const changed = { baseQuantities: { antiacne: 1 }, quantities: { antiacne: 2, wcgel: 1 }, agreedTotal: 4700 };
    expect((await post(present({ ...changed, callId: offer.callId }))).status).toBe(409);
    expect((await post(save({ ...changed, id: offer.callId, outcome: 'trio', meta: { acceptedProposalId: offer.id } }))).status).toBe(409);
  });

  it('requires a new presentation when quantities change, even with the same products and total', async () => {
    const selection = { productIds: ['antiacne', 'wcgel', 'wcspf'], agreedTotal: 5800 };
    const offer = await presented(lina, { ...selection, quantities: { antiacne: 1, wcgel: 2, wcspf: 1 } });
    const changed = { ...selection, quantities: { antiacne: 1, wcgel: 1, wcspf: 2 } };
    const body = save({ ...changed, id: offer.callId, outcome: 'routine', meta: { acceptedProposalId: offer.id } });
    expect((await post(body)).status).toBe(409);
    const next = await presented(lina, { ...changed, callId: offer.callId });
    expect((await post({ ...body, meta: { ...body.meta as Body, acceptedProposalId: next.id } })).status).toBe(200);
  });

  it('preserves original quantities without an upsell or metadata from an older client', async () => {
    const body = save({ baseQuantities: { antiacne: 3 }, quantities: { antiacne: 3 }, productIds: ['antiacne'], outcome: 'initial', tier: 'catalogue', agreedTotal: 5400 });
    delete body.meta;
    expect((await post(body)).status).toBe(200);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, body.id));
    expect(call).toMatchObject({ base_total: 5400, offered_total: 5400, extra: 0 });
    const [meta] = await ctx.db.select().from(tcCallMeta).where(eq(tcCallMeta.call_id, body.id));
    expect(meta.data).toMatchObject({ originals: [{ id: 'antiacne', quantity: 3 }] });
    expect((await deskGet(ctx, '?action=my-progress', lina)).body.sold).toBe(0);
  });
});

describe('dossier reference', () => {
  it('every outcome saved from today\'s desk needs a dossier reference; an older open tab still saves', async () => {
    for (const orderRef of ['', '   ']) {
      const res = await post(save({ outcome: 'initial', productIds: ['antiacne'], tier: 'catalogue', agreedTotal: 1800, consent: false, checked: false, expectedUserId: linaUser.id, meta: { orderRef } }));
      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'Renseignez la référence du dossier avant d’enregistrer le résultat.', code: 'order-ref-required' });
    }
    const ok = await post(save({ outcome: 'initial', productIds: ['antiacne'], tier: 'catalogue', agreedTotal: 1800, consent: false, checked: false, expectedUserId: linaUser.id, meta: { orderRef: 'DOS-REQ-1' } }));
    expect(ok.status).toBe(200);
    const oldTab = await post(save({ outcome: 'initial', productIds: ['antiacne'], tier: 'catalogue', agreedTotal: 1800, consent: false, checked: false, meta: { orderRef: '' } }));
    expect(oldTab.status).toBe(200);
  });
});
