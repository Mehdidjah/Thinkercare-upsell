import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { localDay } from '@touche/domain';
import { tcCallMeta, tcCalls, tcProducts, tcProposals } from '../src/db/schema.js';
import { type TestContext, createTestApp } from './support/context.js';
import { resetDatabase } from './support/database.js';
import { deskGet, deskPost } from './support/desk.js';
import { createUser, loginCookie } from './support/users.js';

// BEL.NCO as a second brand (docs/superpowers/specs/2026-11-20-belnco-brand-design.md): the database holds both
// catalogues, the BEL.NCO rows seeded by migration 0007.
const PASSWORD = 'mot-de-passe-solide-2026';
const load = (file: string) =>
  JSON.parse(readFileSync(resolve(import.meta.dirname, '../../shared/test/fixtures', file), 'utf8')) as Array<
    Record<string, unknown> & { id: string }
  >;

let ctx: TestContext;
let admin: string;
let lina: string;
let linaUser: Awaited<ReturnType<typeof createUser>>;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx.db);
  await createUser(ctx.db, { username: 'direction', password: PASSWORD, role: 'admin' });
  linaUser = await createUser(ctx.db, { username: 'conseil.lina', password: PASSWORD, role: 'advisor', team: 'Alger' });
  admin = await loginCookie(ctx, 'direction', PASSWORD);
  lina = await loginCookie(ctx, 'conseil.lina', PASSWORD);
});

const touche = load('catalogue.json'), bel = load('belnco.json');
describe('bootstrap by desk', () => {
  it('only a desk announcing X-Desk-Brands gets the BEL.NCO rows', async () => {
    const old = await deskGet(ctx, '?compact=1', lina);
    expect(old.body.products.map((p: { id: string }) => p.id)).toEqual(touche.map((p) => p.id));
    const now = await deskGet(ctx, '?compact=1', lina, { 'X-Desk-Brands': '1' });
    expect(now.body.products.map((p: { id: string }) => p.id)).toEqual([...touche, ...bel].map((p) => p.id));
  });
  it('the login bootstrap follows the same header', async () => {
    const login = { action: 'login', username: 'conseil.lina', password: PASSWORD, bootstrap: true };
    const res = await deskPost(ctx, login, { headers: { 'X-Desk-Brands': '1' } });
    expect(res.body.bootstrap.products).toHaveLength(42);
    const old = await deskPost(ctx, login);
    expect(old.body.bootstrap.products.map((p: { id: string }) => p.id)).toEqual(touche.map((p) => p.id));
  });
  it('Gestion saves a BEL.NCO product with its brand, rules and belnco.com source', async () => {
    const product = { ...bel.find((p) => p.id === 'bel-retinol')!, price: 2000 };
    expect((await deskPost(ctx, { action: 'product', product }, { cookie: admin })).status).toBe(200);
    const [row] = await ctx.db.select().from(tcProducts).where(eq(tcProducts.id, 'bel-retinol'));
    expect(row!.data).toEqual(product);
  });
});

const NEVER = 'Retinol Complex Serum et Clarifying Serum ne s’utilisent jamais dans la même routine : gardez l’un ou l’autre.';
const offer = (o: Record<string, unknown>) => ({ action: 'present-offer', id: randomUUID(), callId: randomUUID(), tier: 'duo', delivery: null, expectedUserId: linaUser.id, ...o });
const meta = (o: Record<string, unknown> = {}) => ({ version: 3, source: 'manual', customerStage: 'new', orderRef: 'BEL1763838', startedAt: new Date(Date.now() - 60_000).toISOString(), eligible: false, objections: [], ...o });

describe('one brand per call on the server', () => {
  it('lists the brands feature', async () => {
    expect((await deskGet(ctx, '?compact=1', lina)).body.features).toContain('brands');
  });
  it('a BEL.NCO offer is priced like Touché and its snapshot carries the brand', async () => {
    const res = await deskPost(ctx, offer({ brand: 'belnco', baseId: 'bel-retinol', productIds: ['bel-retinol', 'bel-moist'], agreedTotal: 3300 }), { cookie: lina });
    expect(res.status).toBe(200);
    expect(res.body.proposal).toMatchObject({ brand: 'belnco', offerTotal: 3300, extra: 1400, version: 3 });
    expect((await deskPost(ctx, offer({ brand: 'belnco', baseId: 'bel-oil', productIds: ['bel-oil', 'bel-gel'], agreedTotal: 3100 }), { cookie: lina })).status).toBe(200);
  });
  it('refuses a Touché offer with a BEL.NCO product, and tells an older tab to reload', async () => {
    const body = offer({ baseId: 'antiacne', productIds: ['antiacne', 'bel-moist'], agreedTotal: 3200 });
    const now = await deskPost(ctx, body, { cookie: lina });
    expect(now.status).toBe(400);
    expect(now.body).toEqual({ error: '« RICH MOISTURIZER » est une référence BEL.NCO : un appel Touché ne propose que des références Touché.', code: 'brand-mixed' });
    const { expectedUserId: _x, ...old } = body;
    const oldTab = await deskPost(ctx, { ...old, id: randomUUID() }, { cookie: lina, pricing: null });
    expect(oldTab.body.error).toBe('« RICH MOISTURIZER » est une référence BEL.NCO : un appel Touché ne propose que des références Touché. Rechargez la page pour mettre le catalogue à jour.');
    expect(await ctx.db.select().from(tcProposals)).toEqual([]);
  });
  it('an older tab sends no brand: its offer is a Touché offer', async () => {
    const { expectedUserId: _x, ...old } = offer({ baseId: 'antiacne', productIds: ['antiacne', 'wcgel'], agreedTotal: 3000 });
    const res = await deskPost(ctx, old, { cookie: lina, pricing: null });
    expect(res.status).toBe(200);
    expect(res.body.proposal.brand).toBe('touche');
  });
  it('refuses products that do not match the call’s brand', async () => {
    const res = await deskPost(ctx, offer({ brand: 'belnco', baseId: 'antiacne', productIds: ['antiacne', 'wcgel'], agreedTotal: 3000 }), { cookie: lina });
    expect(res.body.error).toBe('« Sérum Anti-Acné » est une référence Touché : un appel BEL.NCO ne propose que des références BEL.NCO.');
  });
  it('never presents the retinol with the acid serum', async () => {
    const res = await deskPost(ctx, offer({ brand: 'belnco', baseId: 'bel-retinol', productIds: ['bel-retinol', 'bel-clarifying'], agreedTotal: 3500 }), { cookie: lina });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(NEVER);
  });
  it('save-call refuses a mixed initial order, whatever the outcome', async () => {
    const res = await deskPost(ctx, { action: 'save-call', id: randomUUID(), baseId: 'antiacne', baseIds: ['antiacne', 'bel-moist'], productIds: ['antiacne', 'bel-moist'], outcome: 'noanswer', tier: 'catalogue', delivery: null, consent: false, checked: false, refusal: '', expectedUserId: linaUser.id, meta: meta({ orderRef: 'TOU1763816' }) }, { cookie: lina });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('« RICH MOISTURIZER » est une référence BEL.NCO : un appel Touché ne propose que des références Touché.');
  });
  it('save-call refuses a TOU dossier on a BEL.NCO call', async () => {
    const res = await deskPost(ctx, { action: 'save-call', id: randomUUID(), brand: 'belnco', baseId: 'bel-retinol', productIds: ['bel-retinol'], outcome: 'noanswer', tier: 'catalogue', delivery: null, consent: false, checked: false, refusal: '', expectedUserId: linaUser.id, meta: meta({ orderRef: 'TOU1763816' }) }, { cookie: lina });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Cette référence est une commande Touché : l’appel est un appel BEL.NCO. Changez la marque de l’appel ou corrigez la référence.', code: 'order-ref-brand' });
  });
});

describe('recorded brand', () => {
  it('a saved call keeps its brand and rule version; an older tab’s call is Touché', async () => {
    const shown = await deskPost(ctx, offer({ brand: 'belnco', baseId: 'bel-retinol', productIds: ['bel-retinol', 'bel-moist'], agreedTotal: 3300 }), { cookie: lina });
    const callId = shown.body.proposal.call_id;
    const saved = await deskPost(ctx, { action: 'save-call', id: callId, brand: 'belnco', baseId: 'bel-retinol', productIds: ['bel-retinol', 'bel-moist'], outcome: 'duo', tier: 'duo', delivery: null, agreedTotal: 3300, consent: true, checked: true, refusal: '', expectedUserId: linaUser.id, meta: meta({ eligible: true, acceptedProposalId: shown.body.proposal.id }) }, { cookie: lina });
    expect(saved.status).toBe(200);
    expect((await ctx.db.select({ brand: tcCalls.brand }).from(tcCalls).where(eq(tcCalls.id, callId)))[0]!.brand).toBe('belnco');
    const [m] = await ctx.db.select().from(tcCallMeta).where(eq(tcCallMeta.call_id, callId));
    expect(m).toMatchObject({ order_ref: 'BEL1763838', data: expect.objectContaining({ ruleVersion: 'belnco-v1' }) });
    const oldId = randomUUID();
    await deskPost(ctx, { action: 'save-call', id: oldId, baseId: 'antiacne', productIds: ['antiacne'], outcome: 'noanswer', tier: 'catalogue', delivery: null, consent: false, checked: false, refusal: '', meta: meta({ orderRef: 'TOU1763816' }) }, { cookie: lina, pricing: null });
    expect((await ctx.db.select({ brand: tcCalls.brand }).from(tcCalls).where(eq(tcCalls.id, oldId)))[0]!.brand).toBe('touche');
    const day = localDay(new Date());
    const report = await deskGet(ctx, `?action=analytics&from=${day}&to=${day}`, admin);
    expect(report.body.calls.find((c: { id: string }) => c.id === callId).brand).toBe('belnco');
  });
  it('a reminder carries the brand of its call', async () => {
    const id = randomUUID();
    await deskPost(ctx, { action: 'save-call', id, brand: 'belnco', baseId: 'bel-retinol', productIds: ['bel-retinol'], outcome: 'callback', tier: 'catalogue', delivery: null, consent: false, checked: false, refusal: '', expectedUserId: linaUser.id, meta: meta({ callbackAt: new Date(Date.now() + 86_400_000).toISOString() }) }, { cookie: lina });
    const res = await deskGet(ctx, '?action=reminders', lina);
    expect(res.body.reminders[0]).toMatchObject({ id, brand: 'belnco' });
  });
});
