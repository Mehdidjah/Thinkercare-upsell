import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EMPTY_PROFILE, MAX_ITEM_QUANTITY, money, manualAddCheck, offerProblem, reviewStop, type Product, type Profile } from '@touche/domain';
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
import { readQuantity } from '../src/ui/QuantityControl';

// Call screens rendered from a plain model (no DOM library), plus the source guards of the call flow.
const catalogue: Product[] = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/catalogue.json', import.meta.url), 'utf8'));
const noop = () => {};
function model(extra: Partial<CallModel>): CallModel {
  const base = catalogue.find(p => p.id === 'antiacne')!;
  return { step: 0, toStep: noop, demo: false, saved: false, busy: false, presenting: false, savedOutcome: '', savedAt: '', canVoid: false, voidCall: async () => '', newCall: noop, startExample: noop, exitExample: noop, hasParkedCall: false,
    orderRef: '', setOrderRef: noop, customerStage: 'unknown', setCustomerStage: noop, linkedCallId: '', products: catalogue, visible: catalogue.slice(0, 2), nearby: [], search: '', setSearch: noop, scope: 'Tous', setScope: noop, category: 'Tous', setCategory: noop,
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
    const ready = render(<CallClose/>, { altered: true, count: 2, checked: true, consent: true, matchingOffer: { id: 'offer-1' } as CallModel['matchingOffer'] });
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
  const low = { altered: true, initial, baseTotal: 9000, basket, total: 10500, tier: 'final' as const, offer: 8600, count: 6, offerIssue: offerProblem(initial, basket, 'final') };

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
    expect(render(<OfferBar/>, { ...low, offerIssue: null, matchingOffer: { id: 'o' } as CallModel['matchingOffer'] })).toContain('Clôturer l’appel');
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

  it('an added product keeps its row as « Ajouté ✓ · Retirer », on the same row button', () => {
    const html = render(<ProductPicker/>, { step: 2, requests: [req('wcgel', { added: true }), req('total', { suggestion: suggested('total') })], adds: ['wcgel'], count: 2 });
    expect(html).toMatch(/<li id="picker-row-wcgel" class="call-product" data-state="added">/);
    expect(html).toMatch(/class="call-product__added"><svg[\s\S]*?<\/svg>Ajouté<\/span><button type="button" class="btn btn--secondary btn--sm call-product__action" aria-label="Retirer Water Complex Gel de la routine">Retirer<\/button>/);
    expect(html).toMatch(/class="btn btn--secondary btn--sm call-product__action" aria-label="Ajouter Total Cleanser[^"]*">/);
  });

  it('no exact match: « Aucun résultat exact. Produits proches : »', () => {
    const html = render(<ProductPicker/>, { step: 2, requests: [req('wcspf')], requestApproximate: true, requestSearch: 'creme solaire visage' });
    expect(html).toContain('Aucun résultat exact. Produits proches :');
    expect(html).toContain('id="picker-row-wcspf"');
    expect(html).not.toContain('Voir tout le catalogue');
  });

  it('a pack held back by an addition says what to remove', () => {
    const html = render(<PackUpgrades base={p('shpousse')}/>, { products: catalogue, heldPacks: [p('packpousse')], adds: ['conditioner'] });
    expect(html).toContain('Pack Pousse et Croissance : pack officiel disponible si vous retirez Après-Shampooing Densité de la routine.');
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

  it('a typed quantity out of range is never kept: it goes back with a reason', () => {
    expect(readQuantity('', 1)).toEqual({ wait: true });
    expect(readQuantity('4', 1)).toEqual({ apply: 4 });
    expect(readQuantity('0', 1)).toEqual({ hint: '1 au minimum.' });
    expect(readQuantity('2', 3)).toEqual({ hint: '3 au minimum : la quantité de la commande initiale.' });
    expect(readQuantity('150', 1)).toEqual({ hint: `${MAX_ITEM_QUANTITY} au maximum.` });
    expect(readQuantity('1.5', 1)).toEqual({ hint: 'Nombre entier uniquement.' });
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
  it('each view has its own error boundary inside the shell (X6)', () => {
    expect(readFileSync(new URL('../src/ui/shell/AppShell.tsx', import.meta.url), 'utf8')).toContain('<ViewBoundary key={view}');
  });
});
