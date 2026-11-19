import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { money, type Product } from '@touche/domain';
import { CallModelContext, type CallModel } from '../src/ui/call/callModel';
import { SavedPanel } from '../src/ui/call/SavedPanel';
import { CallNotices } from '../src/ui/call/CallNotices';
import { StepOrder } from '../src/ui/call/StepOrder';

// Call screens rendered from a plain model (no DOM library), plus the source guards of the call flow.
const catalogue: Product[] = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/catalogue.json', import.meta.url), 'utf8'));
const noop = () => {};
function model(extra: Partial<CallModel>): CallModel {
  const base = catalogue.find(p => p.id === 'antiacne')!;
  return { step: 0, toStep: noop, demo: false, saved: false, busy: false, presenting: false, savedOutcome: '', savedAt: '', canVoid: false, voidCall: async () => '', newCall: noop, startExample: noop, exitExample: noop, hasParkedCall: false,
    orderRef: '', setOrderRef: noop, customerStage: 'unknown', setCustomerStage: noop, linkedCallId: '', products: catalogue, visible: catalogue.slice(0, 2), search: '', setSearch: noop, scope: 'Tous', setScope: noop, category: 'Tous', setCategory: noop,
    baseId: base.id, baseIds: [base.id], base, initial: [{ ...base, quantity: 1 }], baseTotal: base.price, orderLocked: false, changeInitial: noop, changeInitialQuantity: () => true,
    refusal: '', callbackAt: '', offer: 3600, fee: null, removal: null, dismissRemoval: noop, catalogueNotice: null, dismissCatalogueNotice: noop, ...extra } as unknown as CallModel;
}
const render = (node: React.ReactNode, extra: Partial<CallModel>) => renderToStaticMarkup(<CallModelContext value={model(extra)}>{node}</CallModelContext>);

describe('call screens (A2, H5, X10, H2, A3)', () => {
  it('one saved panel names the outcome actually saved, with « Annuler ce résultat » only while allowed', () => {
    const saved = render(<SavedPanel/>, { saved: true, savedOutcome: 'noanswer', savedAt: '2026-11-19T09:05:00Z', canVoid: true });
    expect(saved).toContain('Appel enregistré : Sans réponse à 10:05.');
    expect(saved).toContain('Cliente non jointe : l’appel est tracé sans réponse.');
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
    expect(render(<StepOrder/>, { saved: true, savedOutcome: 'noanswer', orderLocked: true })).toContain('Appel enregistré (Sans réponse) : la commande initiale ne change plus.');
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
  it('each view has its own error boundary inside the shell (X6)', () => {
    expect(readFileSync(new URL('../src/ui/shell/AppShell.tsx', import.meta.url), 'utf8')).toContain('<ViewBoundary key={view}');
  });
});
