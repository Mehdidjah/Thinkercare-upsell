import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EMPTY_PROFILE, type Product, type Proposal } from '@touche/domain';
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
  it('the step-3 picker lists only the call’s brand', () => {
    const t = { ...cs.newDraft({ id: 'c1', now: T }), baseIds: ['antiacne'] };
    const b = { ...cs.newDraft({ id: 'c2', now: T }), brand: 'belnco' as const, baseIds: ['bel-retinol'] };
    expect(cs.pickerPool(t, all, new Set()).some((p) => p.id.startsWith('bel-'))).toBe(false);
    expect(cs.pickerPool(b, all, new Set()).every((p) => p.id.startsWith('bel-'))).toBe(true);
  });
  it('the brand goes only to a server that lists brands; a reminder keeps its brand', () => {
    expect(cs.brandField({ brand: 'belnco' }, ['void-call'])).toEqual({});
    expect(cs.brandField({ brand: 'belnco' }, ['brands'])).toEqual({ brand: 'belnco' });
    expect(cs.resumeDraft({ id: 'c9', brand: 'belnco', meta: { originals: [{ id: 'bel-retinol', name: 'R', price: 1900 }] } }).brand).toBe('belnco');
  });
});
