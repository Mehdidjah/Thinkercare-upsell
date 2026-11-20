import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, manualAddCheck, missingAnswers, questionsReady, recommend, type Product, type Profile, type Proposal } from '@touche/domain';
import * as cs from '../src/ui/call/callState';
const load = (f: string) => JSON.parse(readFileSync(new URL('../../shared/test/fixtures/' + f, import.meta.url), 'utf8')) as Product[];
const touche = load('catalogue.json'), bel = load('belnco.json'), all = [...touche, ...bel];
const T = '2026-11-20T09:00:00.000Z';
const face = { ...EMPTY_PROFILE, concerns: ['acne'], severity: 'mild', skin: 'mixed', sensitive: 'no', routineKnown: true, routine: [], safety: ['none'] };

describe('call brand', () => {
  it('a new call is Touché; a stored draft without a brand (older tab) or with an unknown one restores as Touché', () => {
    expect(cs.newDraft({ id: 'c1', now: T }).brand).toBe('touche');
    const { brand: _drop, ...old } = cs.newDraft({ id: 'c1', now: T });
    expect(cs.parseStore(JSON.stringify({ v: 1, draft: old, parked: null }))!.draft.brand).toBe('touche');
    expect(cs.parseStore(JSON.stringify({ v: 1, draft: { ...old, brand: 'shein' }, parked: null }))!.draft.brand).toBe('touche');
    expect(cs.parseStore(cs.serializeStore({ draft: { ...cs.newDraft({ id: 'c1', now: T }), brand: 'belnco' }, parked: null }))!.draft.brand).toBe('belnco');
  });
  it('changing the brand asks once products are chosen, then clears them and keeps the answers and the dossier', () => {
    const d = { ...cs.newDraft({ id: 'c1', now: T }), baseIds: ['antiacne'], adds: ['wcgel'], orderRef: 'BEL1763838', step: 1, profile: face };
    expect(cs.brandNeedsConfirm(d, 'belnco')).toBe(true);
    expect(cs.brandNeedsConfirm({ ...d, baseIds: [], adds: [] }, 'belnco')).toBe(false);
    const r = cs.changeBrand(d, 'belnco')!;
    expect(r.draft).toMatchObject({ brand: 'belnco', baseIds: [], adds: [], upgradeId: '', quantities: {}, verifiedProducts: [], step: 0, orderRef: 'BEL1763838', profile: face, consent: false, checked: false });
    expect(r.removed).toEqual(['antiacne', 'wcgel']);
    expect(cs.changeBrand(d, 'touche')).toBeNull();
    expect(cs.changeBrand({ ...d, presented: [{} as Proposal] }, 'belnco')).toBeNull();
    expect(cs.changeBrand({ ...d, demo: true }, 'belnco')).toBeNull();
  });
  it('a typed BEL or TOU prefix proposes its brand once, and only a brand that has products', () => {
    expect(cs.brandFromReference('BE', 'BEL', 'touche', ['touche', 'belnco'])).toBe('belnco');
    expect(cs.brandFromReference('BEL', 'BEL1', 'touche', ['touche', 'belnco'])).toBeNull();
    expect(cs.brandFromReference('', 'TOU1', 'touche', ['touche', 'belnco'])).toBeNull();
    expect(cs.brandFromReference('', 'tou1', 'belnco', ['touche', 'belnco'])).toBe('touche');
    expect(cs.brandFromReference('', 'BEL1', 'touche', ['touche'])).toBeNull();
  });
  it('a retinol reaction declared with « Rides et fermeté » keeps the serum out once « Teint terne » or « Taches et marques » replaces it', () => {
    const moist = all.find(p => p.id === 'bel-moist')!, retinol = all.find(p => p.id === 'bel-retinol')!;
    const ids = (q: Profile) => recommend(all, moist, q).map(c => c.product.id);
    const pick = (q: Profile, id: string, extra: Partial<Profile> = {}): Profile => ({ ...q, ...cs.concernPatch(q, id), ...extra });
    const start: Profile = { ...EMPTY_PROFILE, skin: 'mixed', sensitive: 'no', routineKnown: true, routine: [], safety: ['none'], makeup: 'daily' };
    const reacted = pick(start, 'aging', { retinol: 'irritated' });
    expect(ids(reacted)).not.toContain('bel-retinol');
    for (const [next, extra] of [['dull', {}], ['marks', { marks: 'flat' }]] as [string, Partial<Profile>][]) {
      const q = pick(pick(reacted, next, extra), 'aging');
      expect(q).toMatchObject({ concerns: [next], retinol: 'irritated' });
      expect(questionsReady(q, moist), next).toBe(true);
      expect(ids(q).length, next).toBeGreaterThan(0);
      expect(ids(q), next).not.toContain('bel-retinol');
      expect(manualAddCheck(moist, [], retinol, q, all).warnings, next).toContain('Sa peau a déjà réagi au rétinol : à éviter ou avec grande prudence.');
      // With a first use instead, the same priority does offer the serum: the reaction is what keeps it out.
      expect(ids({ ...q, retinol: 'never' }), next).toContain('bel-retinol');
    }
    // Once no chosen priority asks it, the answer goes; choosing one again asks the question again.
    const acne = pick(pick(reacted, 'acne', { severity: 'mild' }), 'aging');
    expect(acne).toMatchObject({ concerns: ['acne'], retinol: '' });
    const dull = pick(acne, 'dull');
    expect(questionsReady(dull, moist)).toBe(false);
    expect(missingAnswers(dull, moist)).toEqual([{ question: '01', label: 'l’usage du rétinol' }]);
  });
  it('the step-3 picker lists only the call’s brand', () => {
    const t = { ...cs.newDraft({ id: 'c1', now: T }), baseIds: ['antiacne'] };
    const b = { ...cs.newDraft({ id: 'c2', now: T }), brand: 'belnco' as const, baseIds: ['bel-retinol'] };
    expect(cs.pickerPool(t, all, new Set()).some((p) => p.id.startsWith('bel-'))).toBe(false);
    expect(cs.pickerPool(b, all, new Set()).every((p) => p.id.startsWith('bel-'))).toBe(true);
  });
  it('« Exemple BEL.NCO »: retinol serum and dehydration, then the SPF and the cream', () => {
    const d = cs.newDraft({ id: 'x', now: T, example: 'belnco' });
    expect(d).toMatchObject({ brand: 'belnco', baseIds: ['bel-retinol'], step: 1, demo: true, profileDomain: 'face' });
    expect(d.profile.concerns).toEqual(['dehydration']);
    // The BEL.NCO questions are answered too (makeup; no retinol question with « Peau sèche ou déshydratée » alone), so the example reaches its suggestions.
    expect(d.profile).toMatchObject({ makeup: 'daily', retinol: '' });
    expect(questionsReady(d.profile, all.find(p => p.id === 'bel-retinol'))).toBe(true);
    expect(recommend(all, all.find(p => p.id === 'bel-retinol')!, d.profile).slice(0, 2).map(c => c.product.id)).toEqual(['bel-uv50', 'bel-moist']);
    expect(recommend(all, all.find(p => p.id === 'bel-retinol')!, d.profile).find(c => c.product.id === 'bel-ritual')?.reason).toBe('Elle se maquille tous les jours : le double nettoyage (huile puis gel) retire maquillage et SPF sans dessécher.');
    expect(cs.newDraft({ id: 'y', now: T, example: 'face' }).brand).toBe('touche');
    expect(cs.newDraft({ id: 'y', now: T, example: 'hair' })).toMatchObject({ brand: 'touche', profileDomain: 'hair', baseIds: ['shpousse'] });
    expect(cs.examplesFor('belnco')).toEqual(['belnco']);
    expect(cs.examplesFor('touche')).toEqual(['face', 'hair']);
    // An example started from a BEL.NCO call is a BEL.NCO call; the live call set aside keeps its own brand.
    const live = { ...cs.newDraft({ id: 'c1', now: T }), brand: 'belnco' as const, baseIds: ['bel-gel'] };
    const s = cs.startExample({ draft: live, parked: null }, 'belnco', { id: 'x', now: T });
    expect(s.draft.brand).toBe('belnco');
    expect(s.parked).toBe(live);
  });
  it('a server that doesn’t list brands keeps the desk Touché: no BEL.NCO product, no « Marque »', () => {
    expect(cs.deskProducts(all, ['void-call', 'order-check'])).toEqual(touche);
    expect(cs.deskProducts(all, undefined)).toEqual(touche);
    expect(cs.deskProducts(all, ['brands'])).toBe(all);
    const app = readFileSync(new URL('../src/ui/App.tsx', import.meta.url), 'utf8');
    expect(app).toContain('products=useMemo(()=>callState.deskProducts(state?.products||[],state?.features),[state?.products,state?.features]);');
    expect(app).toContain('const brands=availableBrands(products);');
  });
  it('the brand goes only to a server that lists brands; a reminder keeps its brand', () => {
    expect(cs.brandField({ brand: 'belnco' }, ['void-call'])).toEqual({});
    expect(cs.brandField({ brand: 'belnco' }, ['brands'])).toEqual({ brand: 'belnco' });
    expect(cs.resumeDraft({ id: 'c9', brand: 'belnco', meta: { originals: [{ id: 'bel-retinol', name: 'R', price: 1900 }] } }).brand).toBe('belnco');
  });
});
