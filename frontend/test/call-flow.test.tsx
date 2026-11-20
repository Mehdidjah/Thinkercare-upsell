import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EMPTY_PROFILE, MAX_ITEM_QUANTITY, money, manualAddCheck, offerProblem, reviewStop, searchIds, type Product, type Profile } from '@touche/domain';
import { CallModelContext, type CallModel, type CallRequest } from '../src/ui/call/callModel';
import { SavedPanel } from '../src/ui/call/SavedPanel';
import { CallNotices } from '../src/ui/call/CallNotices';
import { StepOrder } from '../src/ui/call/StepOrder';
import { StepNeeds } from '../src/ui/call/StepNeeds';
import { StepRoutine } from '../src/ui/call/StepRoutine';
import { CallClose } from '../src/ui/call/CallClose';
import { OfferBar } from '../src/ui/call/OfferBar';
import { OfferTotals } from '../src/ui/call/OfferTotals';
import { ProductPicker } from '../src/ui/call/ProductPicker';
import { PackUpgrades } from '../src/ui/call/PackUpgrades';
import { CallContextPanel } from '../src/ui/call/CallContextPanel';
import { CopyFallback } from '../src/ui/call/CopyFallback';
import { SalesCoach } from '../src/ui/call/SalesCoach';
import { Photo } from '../src/ui/shared/Photo';
import { readQuantity, typeQuantity, settleQuantity } from '../src/ui/QuantityControl';
import { CallView } from '../src/ui/call/CallView';
import { CallHeading } from '../src/ui/call/CallHeading';
import { catalogueNoticeText } from '../src/ui/call/CallNotices';
import { RoutineRail } from '../src/ui/call/RoutineRail';
import { SpecificChecks } from '../src/ui/call/SpecificChecks';
import * as cs from '../src/ui/call/callState';

// Call screens rendered from a plain model (no DOM library), plus the source guards of the call flow.
const catalogue: Product[] = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/catalogue.json', import.meta.url), 'utf8'));
const noop = () => {};
function model(extra: Partial<CallModel>): CallModel {
  const base = catalogue.find(p => p.id === 'antiacne')!;
  return { step: 0, toStep: noop, demo: false, saved: false, busy: false, presenting: false, savedOutcome: '', savedAt: '', canVoid: false, voidCall: async () => '', newCall: noop, startExample: noop, exitExample: noop, hasParkedCall: false,
    orderRef: '', setOrderRef: noop, orderRefAsked: false, orderCheck: null, checkOrder: noop, customerStage: 'unknown', setCustomerStage: noop, linkedCallId: '', products: catalogue, visible: catalogue.slice(0, 2), nearby: [], search: '', setSearch: noop, scope: 'Tous', setScope: noop, category: 'Tous', setCategory: noop,
    baseId: base.id, baseIds: [base.id], base, initial: [{ ...base, quantity: 1 }], baseTotal: base.price, orderLocked: false, changeInitial: noop, changeInitialQuantity: () => true, duplicate: null,
    domain: 'face', profile: face, changeProfile: noop, toggleConcern: noop, blocked: null, stop: null, notes: [], missing: [],
    upgrades: [], heldPacks: [], upgrade: undefined, upgradeId: '', chooseUpgrade: noop, clearUpgrade: noop, adds: [], requestedIds: [], verifiedProducts: [], toggleVerified: noop, setDetail: noop,
    candidates: [], requests: [], requestApproximate: false, requestSearch: '', setRequestSearch: noop, confirmId: '', setConfirmId: noop, addComplement: noop, removeComplement: noop, changeQuantity: () => true,
    basket: [{ ...base, quantity: 1 }], count: 1, total: base.price, altered: false, tier: 'duo', chooseTier: noop, offerIssue: null, delivery: '', changeDelivery: noop, copy: async () => {}, copyFallback: null, closeCopyFallback: noop,
    presented: [], matchingOffer: undefined, presentOffer: async () => {}, handledObjections: [], toggleObjection: noop, consent: false, setConsent: noop, checked: false, setChecked: noop, setCallbackAt: noop, setRefusal: noop, record: async () => {},
    refusal: '', callbackAt: '', offer: 3600, fee: null, removal: null, dismissRemoval: noop, catalogueNotice: null, dismissCatalogueNotice: noop, ...extra } as unknown as CallModel;
}
const face: Profile = { ...EMPTY_PROFILE, concerns: ['acne'], severity: 'mild', skin: 'mixed', sensitive: 'no', routineKnown: true, routine: [], safety: ['none'] };
const p = (id: string) => catalogue.find(x => x.id === id)!;
const render = (node: React.ReactNode, extra: Partial<CallModel>) => renderToStaticMarkup(<CallModelContext value={model(extra)}>{node}</CallModelContext>);

describe('call screens (A2, H5, X10, H2, A3)', () => {
  it('one saved panel names the outcome actually saved, with « Annuler ce résultat » only while allowed', () => {
    const saved = render(<SavedPanel/>, { saved: true, savedOutcome: 'noanswer', savedAt: '2026-11-19T09:05:00Z', canVoid: true });
    // One label in the call for « Sans réponse » (F4, A2); the panel says how Pilotage names it.
    expect(saved).toContain('Appel enregistré : Cliente non jointe à 10:05.');
    expect(saved).toContain('L’appel est tracé comme « Sans réponse » dans le pilotage.');
    expect(saved).toContain('>Annuler ce résultat<');
    expect(saved).toContain('Commencer le suivant');
    expect(saved).not.toContain('Commande initiale conservée');
    expect(render(<SavedPanel/>, { saved: true, savedOutcome: 'initial', canVoid: false })).toContain('Commande initiale conservée, sans ajout.');
    expect(render(<SavedPanel/>, { saved: true, savedOutcome: 'initial', canVoid: false })).not.toContain('Annuler ce résultat');
    expect(render(<SavedPanel/>, { saved: false })).toBe('');
  });

  it('the initial order is fixed in an example, and its lock text matches the outcome', () => {
    const demo = render(<StepOrder/>, { demo: true, orderLocked: true });
    expect(demo).toContain('Mode exemple : la commande initiale est fixée.');
    expect(demo).not.toContain('Commande initiale conservée');
    expect((demo.match(/class="option option--product"[^>]*disabled=""/g) || []).length).toBe(2);
    expect(render(<StepOrder/>, { saved: true, savedOutcome: 'noanswer', orderLocked: true })).toContain('Appel enregistré (Cliente non jointe) : la commande initiale ne change plus.');
    expect(render(<StepOrder/>, { saved: true, savedOutcome: 'initial', orderLocked: true })).toContain('Commande initiale conservée pour cet appel.');
  });

  it('removed additions and a catalogue change stay on screen, with « Annuler » and the new amount', () => {
    const removed = render(<CallNotices/>, { removal: { id: 1, names: ['Gel', 'SPF'], undo: noop } });
    expect(removed).toContain('2 produits retirés de la routine');
    expect(removed).toContain('>Annuler<');
    const price = render(<CallNotices/>, { catalogueNotice: { kind: 'price', names: [] }, offer: 3700 });
    expect(price).toContain('role="alert"');
    expect(price).toContain(money(3700));
    expect(price).not.toMatch(/actualis|recharg/i);
    expect(render(<CallNotices/>, { catalogueNotice: { kind: 'disabled', names: ['Gel'] } })).toContain('Gel : référence désactivée dans le catalogue.');
  });
});

const req = (id: string, extra: Partial<CallRequest> = {}): CallRequest => ({ product: p(id), check: manualAddCheck(p('antiacne'), [], p(id), face, catalogue), suggestion: undefined, added: false, ...extra });
const suggested = (id: string) => ({ product: p(id), score: 10, reason: 'Raison ' + id });
/** The picker rows the desk builds for a draft (App.tsx): every line of the basket with its state, plus `others` to add. */
const rowsFor = (d: cs.CallDraft, others: string[] = []) => { const lines = cs.basketLines(d, catalogue); return cs.pickerPool(d, catalogue, new Set()).filter(x => lines.has(x.id) || others.includes(x.id)).map(x => req(x.id, { added: d.adds.includes(x.id), line: lines.get(x.id) })); };
const described = (html: string, button: RegExp) => { const id = html.match(button)?.[1]; return !!id && html.includes(`id="${id}" class="reason"`); };

describe('closing the call (B3, M5, REFUSE, F4)', () => {
  it('the accepted sale stays focusable and lists what is missing, done items ticked', () => {
    const html = render(<CallClose/>, { altered: true, count: 2, checked: true });
    expect(html).toMatch(/class="btn btn--primary btn--lg call-close__accept-btn" aria-disabled="true"/);
    expect(described(html, /call-close__accept-btn" aria-disabled="true" aria-describedby="([^"]+)"/)).toBe(true);
    expect(html).toContain('Pour enregistrer l’accord :');
    expect(html).toMatch(/data-done="false"><svg[\s\S]*?<\/svg>Présentez cette offre/);
    expect(html).toMatch(/data-done="true"><svg[\s\S]*?<\/svg>Cochez la compatibilité<span class="sr-only"> : fait<\/span>/);
    expect(html).toMatch(/data-done="false"><svg[\s\S]*?<\/svg>Cochez l’accord de la cliente/);
    expect(html).toMatch(/data-done="false"><svg[\s\S]*?<\/svg>Renseignez la référence du dossier/);
    const ready = render(<CallClose/>, { altered: true, count: 2, checked: true, consent: true, orderRef: 'DOS-1', matchingOffer: { id: 'offer-1' } as CallModel['matchingOffer'] });
    expect(ready).toMatch(/<button type="button" class="btn btn--primary btn--lg call-close__accept-btn">Enregistrer le duo accepté/);
    expect(ready).not.toContain('Pour enregistrer l’accord');
  });

  it('an offer below the initial order blocks the sale with that reason (M5)', () => {
    const issue = 'À ce niveau de prix, l’offre ne dépasse pas la commande initiale.';
    const html = render(<CallClose/>, { altered: true, count: 2, checked: true, consent: true, offerIssue: issue });
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain(issue);
    expect(html).not.toContain('Présentez cette offre');
  });

  it('the refusal waits for a presented offer and says so; « Sans réponse » reads « Cliente non jointe »', () => {
    const before = render(<CallClose/>, { refusal: 'budget' });
    expect(before).toMatch(/<select id="[^"]+" disabled="" aria-describedby="([^"]+)"/);
    expect(before).toContain('Disponible après une offre présentée');
    const reasonId = before.match(/aria-disabled="true" aria-describedby="([^"]+)"><svg[\s\S]*?<\/svg>Enregistrer le refus/)?.[1];
    expect(before).toContain(`<p id="${reasonId}" class="field__help">Disponible après une offre présentée`);
    const after = render(<CallClose/>, { refusal: 'budget', presented: [{ id: 'offer-1' }] as CallModel['presented'] });
    expect(after).not.toMatch(/aria-disabled="true"[^>]*>(<svg[\s\S]*?<\/svg>)?Enregistrer le refus/);
    expect(before).toContain('>Cliente non jointe<');
    expect(before).not.toContain('Sans réponse');
  });
});

describe('step 3 offer (STEP3, C1, M5, RAIL)', () => {
  const initial = [{ ...p('antiacne'), quantity: 5 }], basket = [...initial, { ...p('wcgel'), quantity: 1 }];
  const low = { altered: true, initial, baseTotal: 9000, basket, total: 10500, tier: 'final' as const, offer: 8600, count: 6, offerIssue: offerProblem(initial, basket, 'final', catalogue) };

  it('« J’ai présenté · prix » sits in a sticky action bar, blocked with the reason when the offer is too low', () => {
    expect(low.offerIssue).toContain('ne dépasse pas la commande initiale');
    const blocked = render(<OfferBar/>, low);
    expect(blocked).toMatch(/^<div class="call-actions call-actions--offer">/);
    expect(blocked).toContain('J’ai présenté · ');
    expect(described(blocked, /aria-disabled="true" aria-describedby="([^"]+)"/)).toBe(true);
    expect(blocked).toContain(low.offerIssue!);
    const open = render(<OfferBar/>, { ...low, tier: 'duo', offer: 9600, offerIssue: null });
    expect(open).toContain(money(9600));
    expect(open).not.toContain('aria-disabled');
    expect(open).toContain('6 unités, première offre, livraison à confirmer.');
    const traced = render(<OfferBar/>, { ...low, offer: 9700, offerIssue: null, matchingOffer: { id: 'o', offerTotal: 9600 } as CallModel['matchingOffer'] });
    expect(traced).toContain('Clôturer l’appel');
    // The bar names the amount traced with the offer (the presented one).
    expect(traced).toContain(money(9600));
    expect(traced).not.toContain(money(9700));
    expect(render(<OfferBar/>, { altered: false })).toContain('Pas d’ajout pour l’instant');
    expect(render(<OfferBar/>, { ...low, saved: true })).toBe('');
  });

  it('the reason shows next to the price options; the readout and copy form their own block', () => {
    const html = render(<OfferTotals/>, low);
    expect(html).toMatch(/class="call-price" role="group" aria-label="Prix proposé à la cliente" aria-describedby="([^"]+)"/);
    expect(html).toContain('class="notice notice--warning call-price__issue" role="status"');
    expect(html).toContain('− ' + money(400));
    expect(html).toMatch(/<div class="call-total-bar"><div class="call-readout">[\s\S]*Copier le récapitulatif<\/button><\/div>$/);
  });

  it('the catalogue price of a hair pair chosen separately shows the pack saving; otherwise « Sans remise » stays', () => {
    const plain = render(<OfferTotals/>, low);
    expect(plain).toContain('<span class="option__title">Prix catalogue</span><span class="option__desc">Sans remise</span>');
    const pair = [{ ...p('shpousse'), quantity: 1 }, { ...p('conditioner'), quantity: 1 }];
    const html = render(<OfferTotals/>, { altered: true, base: p('shpousse'), initial: [pair[0]!], baseTotal: 1900, basket: pair, total: 3600, tier: 'catalogue', offer: 3250, count: 2, offerIssue: null });
    expect(html).toContain(`<span class="option__title">Prix catalogue</span><span class="option__desc">Économie <span class="num">${money(350)}</span></span></span><span class="option__price num">${money(3250)}</span>`);
    expect(html).not.toContain('Sans remise');
    for (const title of ['Première offre', 'Offre finale autorisée']) expect(html).toContain(`<span class="option__title">${title}</span><span class="option__desc">Économie <span class="num">${money(350)}</span></span></span><span class="option__price num">${money(3250)}</span>`);
    expect(html).toContain('+ ' + money(1350));
    expect(html).toContain('Tarif pack appliqué aux produits d’un même pack, sans autre remise.');
    expect(render(<OfferTotals/>, { altered: true, base: p('shpousse'), initial: [pair[0]!], baseTotal: 1900, basket: pair, total: 3600, tier: 'duo', offer: 3250, count: 2, offerIssue: null })).toContain('Tarif pack conservé. Remise sur les compléments seulement');
    // An initial order that already holds the pair: its total is read at the pack price.
    const kept = render(<OfferTotals/>, { altered: false, base: p('shpousse'), initial: pair, baseTotal: 3250, basket: pair, total: 3600, tier: 'duo', offer: 3250, count: 2, offerIssue: null });
    expect(kept).toContain('Total de la commande initiale au tarif pack, sans remise additionnelle.');
    expect(kept).toContain(money(3250));
    expect(render(<OfferTotals/>, { altered: false, initial: [{ ...p('antiacne'), quantity: 1 }, { ...p('wcgel'), quantity: 1 }] })).toContain('Total de la commande initiale, sans remise additionnelle.');
  });

  it('step 3 shows price and recap before the presentation (narrow screens), then the bar after the close-out', () => {
    const html = render(<StepRoutine base={p('antiacne')}/>, { step: 2 });
    const offer = html.indexOf('<section class="card call-offer"'), present = html.indexOf('call-present'), close = html.indexOf('call-close'), bar = html.indexOf('call-actions--offer');
    expect(offer).toBeGreaterThan(0);
    expect(offer).toBeLessThan(present);
    expect(close).toBeLessThan(bar);
    expect(html).not.toContain('J’ai présenté cette offre à');
  });
});

describe('targeted stop (MEDSCRIPT, MEDCB, MEDREADY)', () => {
  const urgent = reviewStop({ ...face, safety: ['urgent'] })!, severe = reviewStop({ ...face, severity: 'severe' })!;
  it('each reason has its own words; an urgent reaction uses the danger tone and puts the callback aside', () => {
    const html = render(<StepRoutine base={p('antiacne')}/>, { step: 2, blocked: urgent.text, stop: urgent });
    expect(html).toContain('class="notice notice--danger call-stop" data-urgent="true"');
    expect(html).toContain('Urgence possible : arrêtez la proposition.');
    expect(html).toContain(urgent.script);
    expect(html).not.toContain(severe.script);
    expect(html).toMatch(/class="btn btn--primary"[^>]*>Enregistrer l’orientation/);
    expect(html).toContain('<details class="call-stop__later"><summary>Programmer un rappel</summary>');
    expect(html).not.toContain('call-actions');
  });

  it('a stop that promises a callback suggests it, beside « Enregistrer l’orientation sans rappel »', () => {
    const html = render(<StepRoutine base={p('antiacne')}/>, { step: 2, blocked: severe.text, stop: severe, callbackAt: '2026-11-20T10:00' });
    expect(html).toContain('class="notice notice--warning call-stop"');
    expect(html).toContain(severe.script);
    expect(html).toContain('Ce message annonce un rappel');
    expect(html).toMatch(/class="btn btn--primary"[^>]*>Programmer un rappel/);
    expect(html).toMatch(/class="btn btn--secondary"[^>]*>Enregistrer l’orientation sans rappel/);
    const saved = render(<SavedPanel/>, { saved: true, savedOutcome: 'callback', callbackAt: '2026-11-20T10:00', stop: severe });
    expect(saved).toContain('pour donner suite à la vérification ciblée.');
  });

  it('a stop opens the check at once, whatever is left unanswered', () => {
    const missing = [{ question: '02' as const, label: 'le type de peau' }];
    const stopped = render(<StepNeeds/>, { step: 1, profile: { ...face, skin: '', safety: ['urgent'] }, blocked: urgent.text, stop: urgent, missing });
    expect(stopped).toMatch(/<button type="button" class="btn btn--primary">Voir la vérification/);
    expect(stopped).not.toContain('Pour construire la routine');
    const open = render(<StepNeeds/>, { step: 1, profile: { ...face, skin: '' }, missing });
    expect(open).toMatch(/<button type="button" class="btn btn--primary" disabled="">Construire la routine/);
    expect(open).toContain('Pour construire la routine, répondez à : ');
  });
});

describe('questions (F5, E6)', () => {
  it('single choices are radio groups, multiple choices say so, the exclusive answer is marked', () => {
    const html = render(<StepNeeds/>, { step: 1, profile: { ...face, concerns: ['acne'] } });
    expect((html.match(/type="radio" name="skin"/g) || []).length).toBe(5);
    expect((html.match(/type="radio" name="severity"/g) || []).length).toBe(3);
    expect((html.match(/type="radio" name="sensitive"/g) || []).length).toBe(3);
    expect(html).toContain('type="radio" name="skin" checked="" value="mixed"');
    expect((html.match(/type="checkbox" name="safety"/g) || []).length).toBe(8);
    expect(html).toContain('Plusieurs choix possibles : deux au plus, un troisième remplace le second.');
    expect((html.match(/>Plusieurs choix possibles</g) || []).length).toBe(2);
    expect(html).toContain('data-exclusive="true"><input class="option__input" type="checkbox" name="routine" checked="" value="none"');
    expect(html).toContain('<section class="call-question card" id="question-02" tabindex="-1">');
  });
});

describe('step 3 picker (B5, DBL, CONFIRMBOX, STEP3, SEARCH, PACK, F4)', () => {
  const requests = [req('wcgel', { suggestion: suggested('wcgel') }), req('total', { suggestion: suggested('total') }), req('vitc'), req('sal2')];
  it('lists the suggestions first, the rest of the catalogue behind « Voir tout le catalogue (N) »', () => {
    const html = render(<ProductPicker/>, { step: 2, requests, candidates: [suggested('wcgel'), suggested('total')] });
    expect(html).toContain('id="picker-row-wcgel"');
    expect(html).toContain('id="picker-row-total"');
    expect(html).not.toContain('id="picker-row-vitc"');
    expect(html).toContain('aria-expanded="false">Voir tout le catalogue (2)</button>');
    expect(html).toContain('>Voir la fiche</button>');
    expect(html).not.toContain('Ingrédients & argumentaire');
  });

  it('an added product keeps its row as « Dans la routine ✓ · Retirer », on the same row button', () => {
    const line = { initial: false, quantity: 1, extra: 0, refusal: null };
    const html = render(<ProductPicker/>, { step: 2, requests: [req('wcgel', { added: true, line }), req('total', { suggestion: suggested('total') })], adds: ['wcgel'], count: 2 });
    expect(html).toMatch(/<li id="picker-row-wcgel" class="call-product" data-state="added">/);
    expect(html).toMatch(/class="call-product__added"><svg[\s\S]*?<\/svg>Dans la routine · <span class="num">×1<\/span><\/span><button type="button" class="btn btn--secondary btn--sm call-product__action" aria-label="Retirer Water Complex Gel de la routine">Retirer<\/button>/);
    expect(html).toMatch(/class="btn btn--secondary btn--sm call-product__action" aria-label="Ajouter Total Cleanser[^"]*">/);
  });

  it('no exact match: « Aucun résultat exact. Produits proches : »', () => {
    const html = render(<ProductPicker/>, { step: 2, requests: [req('wcspf')], requestApproximate: true, requestSearch: 'creme solaire visage' });
    expect(html).toContain('Aucun résultat exact. Produits proches :');
    expect(html).toContain('id="picker-row-wcspf"');
    expect(html).not.toContain('Voir tout le catalogue');
  });

  it('an added product keeps « + Une unité » beside « Retirer »', () => {
    const d = { ...cs.newDraft({ id: 'call-1' }), step: 2, baseIds: ['antiacne'], baseQuantities: { antiacne: 1 }, profile: face, profileDomain: 'face', adds: ['wcgel'] };
    const html = render(<ProductPicker/>, { step: 2, requests: rowsFor(d), adds: ['wcgel'], count: 2 });
    expect(html).toMatch(/<li id="picker-row-wcgel" class="call-product" data-state="added">/);
    expect(html).toMatch(/aria-label="Retirer Water Complex Gel de la routine">Retirer<\/button><button type="button" class="btn btn--secondary btn--sm call-product__unit" aria-label="Ajouter une unité de Water Complex Gel"><svg[\s\S]*?<\/svg>Une unité<\/button>/);
  });

  it('a pack held back by an addition says what to remove', () => {
    const html = render(<PackUpgrades base={p('shpousse')}/>, { products: catalogue, heldPacks: [p('packpousse')], adds: ['conditioner'] });
    expect(html).toContain('Pack Pousse et Croissance : pack officiel disponible si vous retirez Après-Shampooing Densité de la routine.');
  });
});

describe('one more unit of a product already in the order (UNIT)', () => {
  const order = (extra: Partial<cs.CallDraft> = {}): cs.CallDraft => ({ ...cs.newDraft({ id: 'call-1' }), step: 2, baseIds: ['antiacne'], baseQuantities: { antiacne: 1 }, profile: face, profileDomain: 'face', ...extra });
  const unitButton = (name: string) => new RegExp(`<button type="button" class="btn btn--secondary btn--sm call-product__unit"[^>]*aria-label="Ajouter une unité de ${name}"[^>]*>`);

  it('the initial product is listed first as « Déjà dans la commande · ×1 », with « + Une unité », without a search', () => {
    const html = render(<ProductPicker/>, { step: 2, requests: rowsFor(order(), ['wcgel', 'vitc']).map(r => r.product.id === 'wcgel' ? { ...r, suggestion: suggested('wcgel') } : r), candidates: [suggested('wcgel')] });
    expect(html).toMatch(/<li id="picker-row-antiacne" class="call-product" data-state="ordered">/);
    expect(html.indexOf('id="picker-row-antiacne"')).toBeLessThan(html.indexOf('id="picker-row-wcgel"'));
    expect(html).toMatch(/class="call-product__added"><svg[\s\S]*?<\/svg>Déjà dans la commande · <span class="num">×1<\/span><\/span>/);
    expect(html).toMatch(unitButton('Sérum Anti-Acné'));
    expect(html).toMatch(/aria-label="Ajouter une unité de Sérum Anti-Acné"><svg[\s\S]*?<\/svg>Une unité<\/button>/);
    // Nothing to add twice: no « Ajouter », no « Retirer », no compatibility box on the order's own line.
    const row = html.slice(html.indexOf('id="picker-row-antiacne"'), html.indexOf('</li>', html.indexOf('id="picker-row-antiacne"')));
    expect(row).not.toMatch(/call-product__action|Retirer|Déjà dans la routine\./);
    expect(html).not.toContain('id="picker-row-vitc"');
    expect(html).toContain('Voir tout le catalogue (1)');
    // Searching its name finds it too: the desk lists the products of the pool that match the search.
    const found = cs.pickerPool(order(), catalogue, new Set()).filter(x => searchIds(catalogue, 'sérum anti-acné').has(x.id)).map(x => x.id);
    expect(found).toContain('antiacne');
    expect(render(<ProductPicker/>, { step: 2, requests: rowsFor(order()).filter(r => found.includes(r.product.id)), requestSearch: 'sérum anti-acné' })).toMatch(unitButton('Sérum Anti-Acné'));
  });

  it('after « + Une unité », the row and the rail show ×2 and « Dont 1 unité ajoutée »', () => {
    const next = (cs.addUnit(order(), 'antiacne', catalogue) as { draft: cs.CallDraft }).draft;
    const { initial, basket } = cs.basketOf(next, catalogue);
    const picker = render(<ProductPicker/>, { step: 2, requests: rowsFor(next), count: 2 });
    expect(picker).toMatch(/Déjà dans la commande · <span class="num">×2<\/span>/);
    expect(picker).toContain('<p class="call-product__reason">Dont 1 unité ajoutée</p>');
    const rail = render(<RoutineRail/>, { step: 2, initial, basket, count: 2, total: 3600 });
    expect(rail).toContain(`<span class="num">2 × ${money(1800)}</span> par unité`);
    expect(rail).toContain('Dont 1 unité ajoutée');
    expect(rail).toMatch(/aria-label="Quantité de Sérum Anti-Acné" value="2"/);
  });

  it('a reference to verify keeps « Une unité » usable to open its check; other refusals keep the button focusable with their reason; a saved or busy call disables it (UNIT-CHECK)', () => {
    const toVerify = order({ baseIds: ['nia12'], baseQuantities: { nia12: 1 } });
    const html = render(<ProductPicker/>, { step: 2, requests: rowsFor(toVerify) });
    expect(html).toMatch(/<button type="button" class="btn btn--secondary btn--sm call-product__unit" aria-label="Ajouter une unité de Niacinamide 12 % Ultra Pure" aria-expanded="false" aria-controls="unit-check-nia12">/);
    expect(html).not.toMatch(/call-product__unit" aria-disabled="true" aria-describedby="unit-reason-nia12"/);
    expect(html).toMatch(/<p id="unit-reason-nia12" class="call-product__blocked"><svg[\s\S]*?<\/svg>Vérification requise : « Une unité » vous la fait confirmer ici\.<\/p>/);
    const full = render(<ProductPicker/>, { step: 2, requests: rowsFor(order({ quantities: { antiacne: 99 } })) });
    expect(full).toContain('99 unités au maximum par référence.');
    expect(full).toMatch(/call-product__unit" aria-disabled="true" aria-describedby="unit-reason-antiacne"/);
    for (const state of [{ saved: true }, { busy: true }, { presenting: true }]) {
      expect(render(<ProductPicker/>, { step: 2, requests: rowsFor(order()), ...state })).toMatch(/class="btn btn--secondary btn--sm call-product__unit" disabled=""/);
    }
  });

  it('the specific verification a refused unit waits for can be reached from its row', () => {
    const checks = render(<SpecificChecks/>, { step: 2, domain: 'face' });
    expect(checks).toMatch(/<input type="checkbox" id="verify-nia12"/);
    const picker = readFileSync(new URL('../src/ui/call/ProductPicker.tsx', import.meta.url), 'utf8');
    expect(picker).toContain("onBlocked={()=>showVerification(p.id)}");
  });
});

describe('step 0 and call context (DUPPACK, SEARCH, C3, ORDERREF, X12, QTY, COPY)', () => {
  it('a product inside a selected pack is flagged with « Retirer {produit} »', () => {
    const html = render(<StepOrder/>, { baseIds: ['shpousse', 'packpousse'], initial: [{ ...p('shpousse'), quantity: 1 }, { ...p('packpousse'), quantity: 1 }], duplicate: { pack: p('packpousse'), product: p('shpousse') } });
    expect(html).toContain('<b>Shampooing Pousse et Croissance</b> est déjà inclus dans Pack Pousse et Croissance.');
    expect(html).toContain('>Retirer Shampooing Pousse et Croissance</button>');
  });

  it('a search with no exact match shows the closest products', () => {
    const html = render(<StepOrder/>, { visible: [], nearby: [p('wcspf')], search: 'écran visage xyz' });
    expect(html).toContain('Aucun résultat exact. Produits proches :');
    expect(html).toContain(p('wcspf').name);
    expect(html).not.toContain('Aucun produit trouvé.');
  });

  it('the context is a one-line summary after step 0, and the file reference stays editable until the save', () => {
    const presented = [{ id: 'offer-1' }] as CallModel['presented'];
    const full = render(<CallContextPanel/>, { step: 0, orderRef: 'DOS-1' });
    expect(full).not.toContain('<details');
    const compact = render(<CallContextPanel/>, { step: 2, orderRef: 'DOS-1', customerStage: 'new', presented });
    expect(compact).toMatch(/<details class="call-context__details"><summary><h2 id="call-context-heading" class="call-context__title">Contexte de l’appel<\/h2><span class="call-context__summary">Dossier <span class="num">DOS-1<\/span> · Premier achat déclaré<\/span><\/summary>/);
    expect(compact).not.toMatch(/id="call-order-ref"[^>]*disabled/);
    expect(render(<CallContextPanel/>, { step: 2, saved: true })).toMatch(/id="call-order-ref"[^>]*disabled=""/);
  });

  it('photos are decorative except on the product sheet', () => {
    expect(renderToStaticMarkup(<Photo product={p('antiacne')}/>)).toContain('alt=""');
    expect(renderToStaticMarkup(<Photo product={p('antiacne')} alt="Sérum Anti-Acné"/>)).toContain('alt="Sérum Anti-Acné"');
    expect(readFileSync(new URL('../src/ui/shared/ProductModal.tsx', import.meta.url), 'utf8')).toContain('<Photo product={detail} alt={detail.name}/>');
  });

  it('a typed quantity that can never be valid goes back at once with a reason; one below the minimum waits (QTY, callux-3)', () => {
    expect(readQuantity('', 1)).toEqual({ wait: true });
    expect(readQuantity('4', 1)).toEqual({ apply: 4 });
    expect(readQuantity('0', 1)).toEqual({ pending: '1 au minimum.' });
    expect(readQuantity('2', 3)).toEqual({ pending: '3 au minimum : la quantité de la commande initiale.' });
    expect(readQuantity('150', 1)).toEqual({ hint: `${MAX_ITEM_QUANTITY} au maximum.` });
    expect(readQuantity('1.5', 1)).toEqual({ hint: 'Nombre entier uniquement.' });
    expect(readQuantity('1e1', 1)).toEqual({ hint: 'Nombre entier uniquement.' });
  });

  it('typing « 12 » with a minimum of 2 keeps the « 1 » on the way, applies 12, and a « 1 » left alone goes back on blur (callux-3)', () => {
    const one = typeQuantity('1', 2, 2);
    expect(one).toEqual({ field: { draft: '1', hint: '' }, apply: undefined });
    expect(typeQuantity('12', 2, 2)).toEqual({ field: { draft: '12', hint: '' }, apply: 12 });
    expect(settleQuantity(one.field, 2, 2)).toEqual({ draft: '2', hint: '2 au minimum : la quantité de la commande initiale.' });
    // Leaving an applied or empty field shows the current quantity, without a reason.
    expect(settleQuantity({ draft: '12', hint: '' }, 2, 12)).toEqual({ draft: '12', hint: '' });
    expect(settleQuantity({ draft: '', hint: '' }, 2, 3)).toEqual({ draft: '3', hint: '' });
    // Above the maximum or not a whole number: back at once, with the reason.
    expect(typeQuantity('100', 2, 3)).toEqual({ field: { draft: '3', hint: `${MAX_ITEM_QUANTITY} au maximum.` } });
    expect(typeQuantity('2.', 1, 3).field.draft).toBe('3');
  });

  it('a refused copy opens the text in a dialog; each copy names what it copied', () => {
    const html = render(<CopyFallback/>, { copyFallback: { text: 'Ligne 1\nLigne 2', label: 'Argumentaire copié.' } });
    expect(html).toContain('Copie automatique indisponible');
    expect(html).toMatch(/<textarea class="call-copy__text" readOnly="" data-autofocus="true" aria-label="Texte à copier : argumentaire"/);
    expect(html).toContain('Ligne 1\nLigne 2</textarea>');
    expect(render(<CopyFallback/>, {})).toBe('');
    const coach = renderToStaticMarkup(<SalesCoach base={p('antiacne')} initial={[p('antiacne')]} basket={[p('antiacne'), p('wcgel')]} profile={face} tier="duo" catalogue={catalogue} copy={async () => {}} preview={false}/>);
    expect(coach).toContain('Copier l’argumentaire');
    const sources = ['call/SalesCoach.tsx', 'call/OfferTotals.tsx'].map(f => readFileSync(new URL('../src/ui/' + f, import.meta.url), 'utf8')).join('\n');
    for (const label of ['Argumentaire copié.', 'Réponse copiée.', 'Récapitulatif copié.']) expect(sources).toContain(`'${label}'`);
  });
});

describe('review follow-ups on the call screens', () => {
  const severe = reviewStop({ ...face, severity: 'severe' })!;
  it('a call already recorded without its outcome reads « Appel déjà enregistré », never the button clicked (state-2)', () => {
    const html = render(<SavedPanel/>, { saved: true, savedOutcome: '', savedAt: '2026-11-19T09:05:00Z' });
    expect(html).toContain('Appel déjà enregistré.');
    expect(html).toContain('il n’est pas compté une seconde fois');
    expect(html).not.toMatch(/Appel enregistré :|à 10:05/);
    expect(render(<StepOrder/>, { saved: true, savedOutcome: '', orderLocked: true })).toContain('Appel déjà enregistré : la commande initiale ne change plus.');
  });

  it('the stop panel records its callback as an orientation with a callback date (recording-2)', () => {
    const open = render(<StepRoutine base={p('antiacne')}/>, { step: 2, blocked: severe.text, stop: severe, callbackAt: '2026-11-20T10:00' });
    expect(open).toMatch(/class="btn btn--primary"[^>]*>Programmer un rappel/);
    const saved = { step: 2, blocked: severe.text, stop: severe, saved: true, savedOutcome: 'review', callbackAt: '2026-11-20T10:00' };
    const stop = render(<StepRoutine base={p('antiacne')}/>, saved);
    expect(stop).toContain('>Rappel programmé<');
    expect(stop).not.toContain('>Orientation enregistrée<');
    const panel = render(<SavedPanel/>, saved);
    expect(panel).toContain('Orientation enregistrée, rappel prévu le ');
    expect(panel).toContain('20 novembre');
    // Without a callback date sent, the orientation alone.
    expect(render(<StepRoutine base={p('antiacne')}/>, { ...saved, callbackAt: '' })).toContain('>Orientation enregistrée<');
    expect(render(<SavedPanel/>, { ...saved, callbackAt: '' })).toContain('Orientation enregistrée : la vérification ciblée est tracée.');
    expect(readFileSync(new URL('../src/ui/call/StepRoutine.tsx', import.meta.url), 'utf8')).toContain("onClick={()=>record('review',{callback:true})}");
  });

  it('the examples wait while a save or a presentation is on its way; a saved call set aside says so (state-4, state-7)', () => {
    const disabled = (html: string) => (html.match(/<button type="button" class="btn btn--ghost btn--sm" disabled="">/g) || []).length;
    expect(disabled(render(<CallHeading/>, {}))).toBe(0);
    expect(disabled(render(<CallHeading/>, { busy: true }))).toBe(2);
    expect(disabled(render(<CallHeading/>, { presenting: true }))).toBe(2);
    expect(render(<CallHeading/>, { demo: true, hasParkedCall: true, parkedSaved: true })).toContain('Votre appel enregistré est mis de côté.');
    expect(render(<CallHeading/>, { demo: true, hasParkedCall: true })).toContain('Votre appel en cours est mis de côté.');
  });

  it('the accepted sale says it keeps the presented price after a catalogue change (state-3)', () => {
    const ready = { altered: true, count: 2, checked: true, consent: true, keepsPresentedPrice: true, offer: 3100, matchingOffer: { id: 'o', offerTotal: 3000 } as CallModel['matchingOffer'] };
    const html = render(<CallClose/>, ready);
    expect(html).toContain(`Accord enregistré au prix présenté : <b class="num">${money(3000)}</b>`);
    expect(html).toContain(`Le catalogue indique maintenant <span class="num">${money(3100)}</span>`);
    expect(render(<CallClose/>, { ...ready, offer: 3000 })).not.toContain('Le catalogue indique maintenant');
    // An older server checks the current price: nothing is said.
    expect(render(<CallClose/>, { ...ready, keepsPresentedPrice: false })).not.toContain('au prix présenté');
    // The price notice gives way to the kept presented price; it carries an id to be focused (callux-2).
    const notice = { catalogueNotice: { kind: 'price' as const, names: [] }, offer: 3100 };
    expect(render(<CallNotices/>, notice)).toContain('id="call-catalogue-notice" role="alert"');
    expect(render(<CallNotices/>, { ...notice, keepsPresentedPrice: true, matchingOffer: ready.matchingOffer })).toBe('');
  });

  it('the catalogue message and the notice share their words (callux-2, recording-8)', () => {
    expect(catalogueNoticeText({ kind: 'price', names: [] }, 3700, 400)).toEqual({ title: 'Prix mis à jour dans le catalogue.', detail: `Annoncez désormais ${money(3700)} plus ${money(400)} de livraison à la cliente, puis présentez de nouveau l’offre. Votre saisie est conservée.` });
    expect(catalogueNoticeText({ kind: 'disabled', names: ['Anti-Acné'], initial: true }, 0, null).detail).toMatch(/commande initiale est désactivé/);
    expect(catalogueNoticeText({ kind: 'disabled', names: ['Gel', 'SPF'] }, 0, null)).toEqual({ title: 'Gel, SPF : références désactivées dans le catalogue.', detail: 'Retirez-les de la routine, puis présentez de nouveau l’offre. Votre saisie est conservée.' });
    const html = render(<CallNotices/>, { catalogueNotice: { kind: 'price', names: [] }, offer: 3700, fee: 400 });
    for (const text of Object.values(catalogueNoticeText({ kind: 'price', names: [] }, 3700, 400))) expect(html).toContain(text);
  });

  it('the saved panel sits after the close-out at step 3, at the top elsewhere, once (callux-1)', () => {
    const step3 = render(<CallView/>, { step: 2, saved: true, savedOutcome: 'initial' });
    expect((step3.match(/id="call-saved-title"/g) || []).length).toBe(1);
    expect(step3.indexOf('call-saved')).toBeGreaterThan(step3.indexOf('id="call-close-title"'));
    const step1 = render(<CallView/>, { step: 1, saved: true, savedOutcome: 'initial' });
    expect((step1.match(/id="call-saved-title"/g) || []).length).toBe(1);
    expect(step1.indexOf('call-saved')).toBeLessThan(step1.indexOf('question-01'));
    const stopped = render(<CallView/>, { step: 2, saved: true, savedOutcome: 'review', blocked: severe.text, stop: severe });
    expect((stopped.match(/id="call-saved-title"/g) || []).length).toBe(1);
    expect(stopped.indexOf('call-saved')).toBeLessThan(stopped.indexOf('call-stop'));
  });

  it('removing a line of the initial order hands focus to the order (callux-6)', () => {
    const order = readFileSync(new URL('../src/ui/call/StepOrder.tsx', import.meta.url), 'utf8');
    expect(order).toContain("const AFTER_REMOVAL='#call-initial, .call-order .search-field input';");
    expect((order.match(/\.then\(done=>\{if\(done\)focusLater\(AFTER_REMOVAL\);\}\)/g) || []).length).toBe(2);
    expect(render(<StepOrder/>, {})).toContain('<section class="call-initial" id="call-initial" tabindex="-1"');
  });
});

describe('source guards', () => {
  const app = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
  it('every exit of the call goes through one guard (A1)', () => {
    for (const reason of ['new', 'resume', 'signout', 'example', 'leave']) expect(app).toContain(`guardLeaveCall('${reason}')`);
    expect(app).toContain('signOut={signOut}');
    expect(app).toContain("window.addEventListener('beforeunload',warn)");
  });
  it('the call view comes back where it was left (VIEWSCROLL); Catalogue and Parcours have their own search (PN4)', () => {
    expect(app).toContain("if(view==='call')window.scrollTo(0,callScroll.current);else window.scrollTo(0,0);");
    expect(app).toContain('<Catalogue search={catalogueSearch}');
    expect(app).toContain('<Coverage search={coverageSearch}');
  });
  it('an unchanged quantity never reaches the call (CN1)', () => {
    expect(readFileSync(new URL('../src/ui/QuantityControl.tsx', import.meta.url), 'utf8')).toContain('next>MAX_ITEM_QUANTITY||next===value)return;');
  });
  it('« + Une unité » lists the basket lines and goes through the rail’s quantity change, announced (UNIT)', () => {
    expect(app).toContain('const lines=callState.basketLines(d,products);');
    expect(app).toContain('callState.pickerPool(d,products,packIds)');
    expect(app).toContain('suggestion:candidates.find(r=>r.product.id===p.id),line:lines.get(p.id)}');
    expect(app).toContain('const changeQuantity=(id:string,next:number)=>applyQuantity(callState.changeQuantity(current(),id,next,products));');
    expect(app).toContain('if(!applyQuantity(callState.addUnit(current(),id,products)))return false;');
    expect(app).toContain('announce(`${productName(id)} : une unité ajoutée, ×${current().quantities[id]} · ${unitsOf(current())}`)');
    expect(app).toMatch(/addComplement,removeComplement,changeQuantity,addUnit,/);
  });
  it('« + Une unité » on a reference to verify opens its check in the row, then adds the unit (UNIT-CHECK)', () => {
    const picker = readFileSync(new URL('../src/ui/call/ProductPicker.tsx', import.meta.url), 'utf8');
    expect(picker).toContain("unitCheck=!!line?.refusal&&unitNeedsCheck({verifiedProducts},p.id,products)");
    expect(picker).toContain("blocked={!!line.refusal&&!unitCheck}");
    expect(picker).toContain("onClick={()=>unitCheck?setUnitCheckId(checkingUnit?'':p.id):addUnit(p.id)}");
    expect(picker).toContain("onClick={()=>{if(verifyAndAddUnit(p.id)){setUnitCheckId('');focusLater(`#picker-row-${p.id} .call-product__unit`);}}}>Vérification faite : ajouter une unité</button>");
    expect(app).toContain('if(!applyQuantity(callState.verifyAndAddUnit(current(),id,products)))return false;');
    expect(app).toMatch(/addComplement,removeComplement,changeQuantity,addUnit,verifyAndAddUnit,/);
  });
  it('additions, removals and a replaced concern are announced; a copy failure shows the text (B5, F5, COPY)', () => {
    expect(app).toContain('announce(`${productName(id)} ajouté · ${unitsOf(current())}`)');
    expect(app).toContain('announce(`${productName(id)} retiré · ${unitsOf(current())}`)');
    expect(app).toContain('announce(`« ${label(replaced)} » remplacé par « ${label(id)} ».`)');
    expect(app).toContain('catch{setCopyFallback({text,label});}');
    expect(app).not.toContain('sélectionnez le texte affiché');
  });
  it('the rail keeps the total and « Copier » in view and lets the page scroll (RAIL); one set of totals under 1024px (C1)', () => {
    const css = readFileSync(new URL('../src/styles/call.css', import.meta.url), 'utf8');
    const rail = css.slice(css.indexOf('  .call-rail {'), css.indexOf('}', css.indexOf('  .call-rail {')));
    expect(rail).toContain('overflow-y: auto');
    expect(rail).not.toContain('overscroll-behavior');
    expect(css).toContain('.call-rail > .call-total-bar { position: sticky; inset-block-end: 0;');
    expect(css).toContain('.call-rail > .call-total-bar { padding: var(--space-3) var(--space-5) var(--space-4); background: var(--color-bg-surface); }');
    expect(css).not.toMatch(/\.call-basket \{ overflow/);
    expect(css).toContain('.call-layout:has(.call-offer) .call-rail > :is(.call-totals, .call-total-bar) { display: none; }');
  });
  it('on the call, notices open bottom left over the call column, never over the rail (TOASTRAIL)', () => {
    const components = readFileSync(new URL('../src/styles/components.css', import.meta.url), 'utf8');
    expect(components).toMatch(/@media \(min-width: 1024px\) \{\s*:root:has\(\.call-layout\) \.toast-region \{ inset-block: auto calc\(var\(--call-bar-height\) \+ var\(--space-8\)\); inset-inline: calc\(var\(--sidebar-width\) \+ var\(--gutter\)\) auto; \}/);
  });
  it('review follow-ups are wired in the desk (state, recording, callux)', () => {
    // A duplicate save shows the stored outcome and says so (state-2); a duplicated tab asks the others (startCallClaims).
    expect(app).toContain('const recorded=callState.recordedOutcome(outcome,result);');
    expect(app).toContain('`Cet appel était déjà enregistré : ${callState.outcomeLabel(recorded.outcome)}.`');
    expect(app).toContain('claims.current?.ask(callState.restoredCallIds(restored));');
    // The accepted amount is the presented one (state-3); the agreement is unticked when the price moves.
    expect(app).toContain('agreedTotal:won?matchingOffer!.offerTotal:offer,');
    expect(app).toContain("const keepsPresentedPrice=!!state?.features?.includes('price-codes');");
    expect(app).toContain('putState(fresh);keepAgreementHonest(before,fresh.products);');
    // Answers land on the call they were sent for (state-4); examples wait for them.
    expect(app).toContain('callState.applyToCall(storeRef.current,now.callId,');
    expect(app).toContain('if(busy||presenting)return;');
    // Back never loops on the guard (state-5); the lock keeps the warning, « Recharger » lets it through (state-8).
    expect(app).toContain('await backFromGuard({');
    expect(app).not.toContain('if(isGuardEntry(history.state))history.pushState');
    expect(app).toContain('const unsaved=callState.needsUnloadPrompt(store);');
    expect(app).toContain('<AccountChangedScreen onReload={()=>{allowLeave.current=true;window.location.reload();}}/>');
    // The stop's callback is a « review » with its date (recording-2); only added lines are named (recording-8).
    expect(app).toContain("withCallback=outcome==='callback'||callback;");
    expect(app).toContain('callbackAt:withCallback?new Date(now.callbackAt+');
    expect(app).toContain('callState.disabledAdditions(current(),fresh.products)');
    // Focus: saved panel (callux-1), catalogue notice and its message (callux-2), after void and undo (callux-6).
    expect(app).toContain("reveal(title?.closest<HTMLElement>('.call-saved'),'center',title);");
    expect(app).toContain("push({kind:'info',title:text.title,detail:text.detail});");
    expect(app).toContain("requestAnimationFrame(()=>reveal(document.getElementById('call-catalogue-notice')));");
    expect(app).toContain("(document.getElementById('call-close-title')??document.getElementById('workflow-heading'))?.focus()");
    expect(app).toContain("setRemoval(null);focusLater('#workflow-heading');");
  });
  it('the rail keeps a focused price option above its pinned total (callux-4)', () => {
    const css = readFileSync(new URL('../src/styles/call.css', import.meta.url), 'utf8');
    const rail = css.slice(css.indexOf('  .call-rail {'), css.indexOf('}', css.indexOf('  .call-rail {')));
    expect(rail).toContain('scroll-padding-block-end: var(--call-total-bar-block);');
    expect(rail).toMatch(/--call-total-bar-block: calc\((var\(--[a-z0-9-]+\)( \* (\d|var\(--[a-z-]+\)))?( \+ )?)+\);/);
    const shell = readFileSync(new URL('../src/ui/shell/AppShell.tsx', import.meta.url), 'utf8');
    expect(shell).toContain('clearInside(el);');
  });
  it('each view has its own error boundary inside the shell (X6)', () => {
    expect(readFileSync(new URL('../src/ui/shell/AppShell.tsx', import.meta.url), 'utf8')).toContain('<ViewBoundary key={view}');
  });
});

describe('dossier reference is required', () => {
  it('the field says it is required and explains a refused save', () => {
    const empty = render(<CallContextPanel/>, { step: 0, orderRef: '', orderRefAsked: false });
    expect(empty).toContain('(obligatoire)');
    expect(empty).toContain('required=""');
    expect(empty).toContain('aria-required="true"');
    expect(empty).toContain('Obligatoire pour enregistrer le résultat de l’appel.');
    const asked = render(<CallContextPanel/>, { step: 0, orderRef: '', orderRefAsked: true });
    expect(asked).toContain('aria-invalid="true"');
    expect(asked).toContain('Renseignez la référence du dossier pour enregistrer le résultat.');
    expect(render(<CallContextPanel/>, { step: 2, orderRef: '' })).toContain('Référence du dossier à renseigner');
  });
});

describe('EcoManager order check in the call context', () => {
  const order = { id: 1763816, reference: 'TOU1763816', stateGroup: 'shipping', stateLabel: 'En cours de livraison', stateName: 'En livraison' };
  it('shows each state of the check under the dossier field', () => {
    expect(render(<CallContextPanel/>, { step: 0, orderRef: 'TOU1763816', orderCheck: { reference: 'TOU1763816', status: 'checking' } })).toContain('Vérification dans EcoManager…');
    const ok = render(<CallContextPanel/>, { step: 0, orderRef: 'TOU1763816', orderCheck: { reference: 'TOU1763816', status: 'verified', order } });
    expect(ok).toContain('Commande vérifiée · En cours de livraison (En livraison)');
    expect(ok).not.toContain('aria-invalid');
    const missing = render(<CallContextPanel/>, { step: 0, orderRef: 'TOU9', orderCheck: { reference: 'TOU9', status: 'not-found', message: 'Commande TOU9 introuvable dans EcoManager. Vérifiez la référence.' } });
    expect(missing).toContain('aria-invalid="true"');
    expect(missing).toContain('Commande TOU9 introuvable dans EcoManager. Vérifiez la référence.');
    expect(render(<CallContextPanel/>, { step: 0, orderRef: 'TOU1', orderCheck: { reference: 'TOU1', status: 'unavailable' } })).toContain('EcoManager ne répond pas : la commande sera marquée « à vérifier ».');
    expect(render(<CallContextPanel/>, { step: 2, orderRef: 'TOU1763816', orderCheck: { reference: 'TOU1763816', status: 'verified', order } })).toContain('En cours de livraison');
  });
  it('without the feature the field is unchanged', () => {
    const html = render(<CallContextPanel/>, { step: 0, orderRef: 'TOU1', orderCheck: null });
    expect(html).toContain('Obligatoire pour enregistrer le résultat de l’appel.');
    expect(html).not.toContain('EcoManager');
  });
});

