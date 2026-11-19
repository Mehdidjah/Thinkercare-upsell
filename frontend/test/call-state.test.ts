import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { EMPTY_PROFILE, orderOffer, recommend, type Product, type Profile, type Proposal } from '@touche/domain';
import * as cs from '../src/ui/call/callState';

// Call-state transitions as plain objects in, plain objects out (X13). Every wipe of the scan (A1, A3, CN1, SPEC) has a case here.
const catalogue: Product[] = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/catalogue.json', import.meta.url), 'utf8'));
const p = (id: string) => { const x = catalogue.find(y => y.id === id); if (!x) throw new Error('missing fixture ' + id); return x; };
const face: Profile = { ...EMPTY_PROFILE, concerns: ['acne'], severity: 'mild', skin: 'mixed', sensitive: 'no', routineKnown: true, routine: [], safety: ['none'] };
const hair: Profile = { ...face, concerns: ['growth'], severity: '' };
const T0 = '2026-11-19T09:00:00.000Z';
/** A live call at step 3 on Anti-acné with answers, two additions and both ticks. */
function liveCall(extra: Partial<cs.CallDraft> = {}): cs.CallDraft {
  return { ...cs.newDraft({ id: 'call-1', now: T0 }), step: 2, baseIds: ['antiacne'], baseQuantities: { antiacne: 1 }, profile: face, profileDomain: 'face', adds: ['wcgel', 'wcspf'], consent: true, checked: true, orderRef: 'DOS-1', ...extra };
}
const proposal = { id: 'offer-1' } as Proposal;

describe('leave guard (A1)', () => {
  it('asks before leaving an open live call, and only then', () => {
    const open = { draft: liveCall(), parked: null };
    for (const reason of ['new', 'resume', 'signout', 'leave'] as const) expect(cs.leavePlan(open, reason)).toBe('confirm');
    expect(cs.leavePlan(open, 'example')).toBe('park');
    expect(cs.leavePlan({ draft: cs.newDraft(), parked: null }, 'new')).toBe('go');
    expect(cs.leavePlan({ draft: cs.markSaved(liveCall(), 'noanswer', T0), parked: null }, 'signout')).toBe('go');
    expect(cs.leavePlan({ draft: cs.newDraft({ example: 'face' }), parked: null }, 'new')).toBe('go');
  });

  it('an example keeps the live call aside, « Quitter l’exemple » brings it back', () => {
    const live = liveCall();
    const example = cs.startExample({ draft: live, parked: null }, 'hair', { id: 'demo-1' });
    expect(example.draft.demo).toBe(true);
    expect(example.draft.baseIds).toEqual(['shpousse']);
    expect(example.parked).toBe(live);
    // Switching example keeps the same call aside; leaving the parked call during an example still asks.
    const other = cs.startExample(example, 'face');
    expect(other.parked).toBe(live);
    expect(cs.leavePlan(other, 'new')).toBe('confirm');
    expect(cs.leavePlan(other, 'example')).toBe('go');
    expect(cs.exitExample(other)).toEqual({ draft: live, parked: null });
    // Nothing set aside: leaving the example opens an empty call.
    const empty = cs.exitExample(cs.startExample({ draft: cs.newDraft(), parked: null }, 'face'));
    expect(empty.draft.demo).toBe(false);
    expect(empty.draft.baseIds).toEqual([]);
  });

  it('the browser asks before closing while a live call is open, never for an example alone', () => {
    expect(cs.needsUnloadPrompt({ draft: liveCall(), parked: null })).toBe(true);
    expect(cs.needsUnloadPrompt({ draft: cs.newDraft({ example: 'face' }), parked: null })).toBe(false);
    expect(cs.needsUnloadPrompt({ draft: cs.newDraft({ example: 'face' }), parked: liveCall() })).toBe(true);
    expect(cs.needsUnloadPrompt({ draft: cs.markSaved(liveCall(), 'initial', T0), parked: null })).toBe(false);
  });
});

describe('answers (A3)', () => {
  it('re-tapping a selected answer changes nothing', () => {
    const d = liveCall();
    expect(cs.changeProfile(d, { skin: 'mixed' }, catalogue)).toBeNull();
    expect(cs.changeProfile(d, { concerns: ['acne'], severity: 'mild' }, catalogue)).toBeNull();
    expect(cs.changeProfile(d, { redState: '', scalpProtocol: false }, catalogue)).toBeNull();
  });

  it('a real change keeps the additions still allowed and removes only the others', () => {
    const r = cs.changeProfile(liveCall({ requestedIds: ['wcgel'], quantities: { wcgel: 2 } }), { skin: 'dry' }, catalogue)!;
    // Water Complex Gel is not indicated for a dry skin; the sun protection still fits.
    expect(r.removed).toEqual(['wcgel']);
    expect(r.draft.adds).toEqual(['wcspf']);
    expect(r.draft.requestedIds).toEqual([]);
    expect(r.draft.quantities).toEqual({});
    expect(r.draft.profile.skin).toBe('dry');
    expect(r.draft.callId).toBe('call-1');
    expect(r.draft.consent).toBe(false);
  });

  it('a change that leaves every addition valid removes nothing and keeps the agreement', () => {
    const r = cs.changeProfile(liveCall(), { concerns: ['acne', 'oil'] }, catalogue)!;
    expect(r.removed).toEqual([]);
    expect(r.draft.adds).toEqual(['wcgel', 'wcspf']);
    expect(r.draft.consent).toBe(true);
    expect(r.draft.checked).toBe(false); // the compatibility tick is about the answers
  });

  it('a targeted stop removes every addition and the pack', () => {
    const r = cs.changeProfile(liveCall(), { safety: ['irritation'] }, catalogue)!;
    expect(r.removed).toEqual(['wcgel', 'wcspf']);
    expect(r.draft.adds).toEqual([]);
  });

  it('« Annuler » restores the answers and additions', () => {
    const before = liveCall();
    const r = cs.changeProfile(before, { skin: 'dry' }, catalogue)!;
    const undone = cs.undoRemoval(r.draft, before)!;
    expect(undone.profile).toEqual(before.profile);
    expect(undone.adds).toEqual(before.adds);
    expect(cs.undoRemoval(cs.markSaved(r.draft, 'initial', T0), before)).toBeNull();
  });

  it('a third concern replaces the second and drops its follow-up', () => {
    expect(cs.concernPatch({ ...face, concerns: ['acne', 'marks'], marks: 'flat' }, 'dull')).toEqual({ concerns: ['acne', 'dull'], severity: 'mild', marks: '', hairPattern: '', redState: '' });
  });

  it('a saved call is read-only', () => {
    const saved = cs.markSaved(liveCall(), 'duo', T0);
    expect(cs.changeProfile(saved, { skin: 'dry' }, catalogue)).toBeNull();
    expect(cs.addComplement(saved, 'total', [], false)).toBeNull();
    expect(cs.removeComplement(saved, 'wcgel')).toBeNull();
    expect(cs.toggleVerification(saved, p('nia12'), true, catalogue)).toBeNull();
    expect(cs.chooseTier(saved, 'final')).toBeNull();
    expect(cs.changeDelivery(saved, '300')).toBeNull();
  });
});

describe('initial order (CN1, A3, X10)', () => {
  it('a quantity change keeps answers, additions, verifications and the call id', () => {
    const d = liveCall({ verifiedProducts: ['nia12'], quantities: { antiacne: 2, wcgel: 2 } });
    const next = cs.changeInitialQuantity(d, 'antiacne', 3)!;
    expect(next.baseQuantities).toEqual({ antiacne: 3 });
    expect(next.profile).toBe(d.profile);
    expect(next.adds).toEqual(d.adds);
    expect(next.verifiedProducts).toEqual(['nia12']);
    expect(next.callId).toBe('call-1');
    expect(next.startedAt).toBe(T0);
    expect([next.consent, next.checked]).toEqual([false, false]);
    // A basket quantity below the new initial quantity goes; the others stay.
    expect(next.quantities).toEqual({ wcgel: 2 });
  });

  it('an unchanged or invalid quantity, or a locked order, changes nothing', () => {
    const d = liveCall();
    expect(cs.changeInitialQuantity(d, 'antiacne', 1)).toBeNull();
    expect(cs.changeInitialQuantity(d, 'antiacne', 0)).toBeNull();
    expect(cs.changeInitialQuantity(d, 'antiacne', 100)).toBeNull();
    expect(cs.changeInitialQuantity({ ...d, presented: [proposal] }, 'antiacne', 2)).toBeNull();
    expect(cs.changeInitialQuantity(cs.newDraft({ example: 'face' }), 'antiacne', 2)).toBeNull();
  });

  it('another product of the same domain keeps the answers and re-checks the additions', () => {
    const r = cs.changeInitialOrder(liveCall(), ['antiacne', 'wcgel'], catalogue)!;
    expect(cs.initialNeedsConfirm(liveCall(), ['antiacne', 'wcgel'], catalogue)).toBe(false);
    expect(r.draft.profile).toEqual(face);
    expect(r.draft.callId).toBe('call-1');
    expect(r.draft.baseQuantities).toEqual({ antiacne: 1, wcgel: 1 });
    expect(r.removed).toEqual(['wcgel']); // now part of the initial order
    expect(r.draft.adds).toEqual(['wcspf']);
  });

  it('the call starts when its first product is picked, not when the empty screen was opened', () => {
    const empty = cs.newDraft({ id: 'call-9', now: '2026-11-13T17:00:00.000Z' });
    const first = cs.changeInitialOrder(empty, ['antiacne'], catalogue, '2026-11-16T09:00:00.000Z')!;
    expect(first.draft.startedAt).toBe('2026-11-16T09:00:00.000Z');
    expect(cs.changeInitialOrder(first.draft, ['antiacne', 'wcgel'], catalogue, '2026-11-16T09:05:00.000Z')!.draft.startedAt).toBe('2026-11-16T09:00:00.000Z');
  });

  it('a guiding product of another domain asks first, then clears the answers', () => {
    const d = liveCall();
    expect(cs.initialNeedsConfirm(d, ['shpousse'], catalogue)).toBe(true);
    const r = cs.changeInitialOrder(d, ['shpousse'], catalogue)!;
    expect(r.draft.profile).toEqual(EMPTY_PROFILE);
    expect(r.draft.adds).toEqual([]);
    expect(r.draft.callId).toBe('call-1');
    // No answers yet: nothing to ask.
    expect(cs.initialNeedsConfirm({ ...d, profile: { ...EMPTY_PROFILE }, profileDomain: '' }, ['shpousse'], catalogue)).toBe(false);
  });

  it('the order is fixed in an example and once an offer is presented', () => {
    expect(cs.changeInitialOrder(cs.newDraft({ example: 'hair' }), ['antiacne'], catalogue)).toBeNull();
    expect(cs.changeInitialOrder(liveCall({ presented: [proposal] }), ['wcgel'], catalogue)).toBeNull();
    expect(cs.orderLocked(cs.newDraft({ example: 'face' }))).toBe(true);
  });
});

describe('specific verifications (SPEC)', () => {
  it('ticking clears nothing', () => {
    const d = liveCall();
    const r = cs.toggleVerification(d, p('sal10'), true, catalogue)!;
    expect(r.removed).toEqual([]);
    expect(r.draft.verifiedProducts).toEqual(['sal10']);
    expect(r.draft.adds).toEqual(d.adds);
    expect([r.draft.consent, r.draft.checked]).toEqual([true, true]);
    expect(cs.toggleVerification(r.draft, p('sal10'), true, catalogue)).toBeNull();
  });

  it('a pack verification covers its components', () => {
    expect(cs.toggleVerification(cs.newDraft(), p('packpso'), true, catalogue)!.draft.verifiedProducts).toEqual(['packpso', 'shpso', 'serumpso']);
  });

  it('unticking removes only the additions that needed that verification', () => {
    const d = cs.addComplement(liveCall({ adds: ['wcspf'] }), 'nia12', ['nia12'], true)!;
    expect(d.verifiedProducts).toEqual(['nia12']);
    const r = cs.toggleVerification(d, p('nia12'), false, catalogue)!;
    expect(r.removed).toEqual(['nia12']);
    expect(r.draft.adds).toEqual(['wcspf']);
    expect(r.draft.requestedIds).toEqual([]);
    expect(cs.undoRemoval(r.draft, d)!.adds).toEqual(['wcspf', 'nia12']);
  });

  it('unticking a verification nothing depends on removes nothing', () => {
    const d = liveCall({ verifiedProducts: ['sal10'] });
    const r = cs.toggleVerification(d, p('sal10'), false, catalogue)!;
    expect(r.removed).toEqual([]);
    expect(r.draft.adds).toEqual(d.adds);
  });
});

describe('routine', () => {
  it('re-choosing the selected price keeps the agreement', () => {
    expect(cs.chooseTier(liveCall(), 'duo')).toBeNull();
    expect(cs.chooseTier(liveCall(), 'final')).toMatchObject({ tier: 'final', consent: false, checked: true });
  });
  it('delivery is clamped and an unchanged fee changes nothing', () => {
    expect(cs.changeDelivery(liveCall(), '12000.7')!.delivery).toBe('10000');
    expect(cs.changeDelivery(liveCall({ delivery: '400' }), '400')).toBeNull();
  });
  it('quantity: verification and duplicates are checked before raising it', () => {
    expect(cs.changeQuantity(liveCall({ adds: ['nia12'] }), 'nia12', 2, catalogue)).toEqual({ error: 'Confirmez la vérification de cette référence avant d’augmenter la quantité.' });
    expect(cs.changeQuantity(liveCall(), 'wcgel', 3, catalogue)).toMatchObject({ draft: { quantities: { wcgel: 3 }, consent: false } });
    expect(cs.changeQuantity(liveCall(), 'antiacne', 1, catalogue)).toBeNull();
  });
  it('back to separate products keeps the additions still allowed with the single product', () => {
    const packed = { ...liveCall({ baseIds: ['shpousse'], baseQuantities: { shpousse: 1 }, profile: hair, profileDomain: 'hair', adds: ['serumhair'], quantities: { packpousse: 2 } }), upgradeId: 'packpousse' };
    const r = cs.clearUpgrade(packed, catalogue)!;
    expect(r.draft.upgradeId).toBe('');
    expect(r.removed).toEqual([]);
    expect(r.draft.adds).toEqual(['serumhair']);
    expect(r.draft.quantities).toEqual({});
    // Choosing a pack replaces the single product: additions chosen for it go.
    expect(cs.chooseUpgrade(liveCall({ baseIds: ['shpousse'], adds: ['serumhair'] }), 'packpousse')).toMatchObject({ upgradeId: 'packpousse', adds: [] });
  });
  it('the suggested additions of the fixture stay suggested for these answers', () => {
    // Guards the scenarios above: wcgel and wcspf are genuine suggestions for Anti-acné with these answers.
    const ids = recommend(catalogue, p('antiacne'), face).map(c => c.product.id);
    expect(ids).toEqual(expect.arrayContaining(['wcgel', 'wcspf']));
  });
});

describe('one more unit of a product already in the order (UNIT)', () => {
  const ordered = (extra: Partial<cs.CallDraft> = {}) => liveCall({ adds: [], consent: true, checked: true, ...extra });
  const hairOrder = (extra: Partial<cs.CallDraft> = {}) => liveCall({ baseIds: ['shpousse'], baseQuantities: { shpousse: 1 }, profile: hair, profileDomain: 'hair', adds: [], ...extra });

  it('« + Une unité » on a line of the initial order: 1 → 2, one added unit, an upsell at the usual offer', () => {
    const d = ordered();
    const r = cs.addUnit(d, 'antiacne', catalogue);
    // The rail's own quantity change, one unit up: same draft, same checks.
    expect(r).toEqual(cs.changeQuantity(d, 'antiacne', 2, catalogue));
    const next = (r as { draft: cs.CallDraft }).draft;
    expect(next).toMatchObject({ baseQuantities: { antiacne: 1 }, quantities: { antiacne: 2 }, consent: false, checked: false });
    const { initial, basket } = cs.basketOf(next, catalogue);
    expect(basket.map(x => [x.id, x.quantity])).toEqual([['antiacne', 2]]);
    expect(cs.basketLines(next, catalogue).get('antiacne')).toEqual({ initial: true, quantity: 2, extra: 1, refusal: null });
    expect(orderOffer(initial, basket, 'duo')).toBe(3300);
    // And once more: 2 → 3.
    expect((cs.addUnit(next, 'antiacne', catalogue) as { draft: cs.CallDraft }).draft.quantities).toEqual({ antiacne: 3 });
  });

  it('works for an addition and for the pack that replaced the initial product', () => {
    expect((cs.addUnit(ordered({ adds: ['wcgel'] }), 'wcgel', catalogue) as { draft: cs.CallDraft }).draft.quantities).toEqual({ wcgel: 2 });
    const packed = hairOrder({ upgradeId: 'packpousse' });
    expect((cs.addUnit(packed, 'packpousse', catalogue) as { draft: cs.CallDraft }).draft.quantities).toEqual({ packpousse: 2 });
  });

  it('refuses as the rail does: a reference to verify first, a duplicate in the basket, 99 at most', () => {
    const toVerify = ordered({ baseIds: ['nia12'], baseQuantities: { nia12: 1 } });
    const verifyFirst = { error: 'Confirmez la vérification de cette référence avant d’augmenter la quantité.' };
    expect(cs.addUnit(toVerify, 'nia12', catalogue)).toEqual(verifyFirst);
    expect(cs.changeQuantity(toVerify, 'nia12', 2, catalogue)).toEqual(verifyFirst);
    expect(cs.addUnit({ ...toVerify, verifiedProducts: ['nia12'] }, 'nia12', catalogue)).toMatchObject({ draft: { quantities: { nia12: 2 } } });
    // A pack whose exact content is not confirmed may not go above one unit (basketProblem).
    const unsure = catalogue.map(x => x.id === 'packpousse' ? { ...x, components: ['shpousse', 'retired'] } : x);
    const pack = hairOrder({ baseIds: ['packpousse'], baseQuantities: { packpousse: 1 } });
    expect(cs.addUnit(pack, 'packpousse', unsure)).toEqual({ error: 'Le contenu exact de ce pack doit être confirmé avant tout ajout.' });
    expect(cs.addUnit(pack, 'packpousse', unsure)).toEqual(cs.changeQuantity(pack, 'packpousse', 2, unsure));
    // 99 is the most the rail and the server take: the list says so instead of doing nothing.
    const full = ordered({ quantities: { antiacne: 99 } });
    expect(cs.addUnit(full, 'antiacne', catalogue)).toEqual({ error: '99 unités au maximum par référence.' });
    expect(cs.changeQuantity(full, 'antiacne', 100, catalogue)).toEqual({ error: '99 unités au maximum par référence.' });
    expect(cs.basketLines(full, catalogue).get('antiacne')).toEqual({ initial: true, quantity: 99, extra: 98, refusal: '99 unités au maximum par référence.' });
    expect(cs.basketLines(toVerify, catalogue).get('nia12')!.refusal).toBe(verifyFirst.error);
  });

  it('changes nothing once saved, during a targeted stop, or for a product outside the basket', () => {
    expect(cs.addUnit(cs.markSaved(ordered(), 'initial', T0), 'antiacne', catalogue)).toBeNull();
    const stopped = ordered({ profile: { ...face, safety: ['urgent'] } });
    expect(cs.addUnit(stopped, 'antiacne', catalogue)).toBeNull();
    // The rail shares the rule: nothing is added during a stop.
    expect(cs.changeQuantity(stopped, 'antiacne', 2, catalogue)).toBeNull();
    expect(cs.addUnit(ordered(), 'vitc', catalogue)).toBeNull();
    // The initial product a pack replaced is no longer a line of the basket.
    expect(cs.addUnit(hairOrder({ upgradeId: 'packpousse' }), 'shpousse', catalogue)).toBeNull();
  });

  it('the step-3 list holds every line of the basket, besides the products that may be added', () => {
    const ids = (d: cs.CallDraft, offered: string[] = []) => cs.pickerPool(d, catalogue, new Set(offered)).map(x => x.id);
    const d = ordered({ baseIds: ['antiacne', 'wcspf'], baseQuantities: { antiacne: 1, wcspf: 2 }, adds: ['wcgel'] });
    expect(ids(d)).toEqual(expect.arrayContaining(['antiacne', 'wcspf', 'wcgel', 'vitc']));
    // A disabled product is never listed.
    expect(cs.pickerPool(d, catalogue.map(x => x.id === 'vitc' ? { ...x, enabled: false } : x), new Set()).map(x => x.id)).not.toContain('vitc');
    // A pack offered as the upgrade is offered there, not here (PACK); once chosen, it is a line and the product it replaced goes.
    expect(ids(hairOrder(), ['packpousse'])).toEqual(expect.arrayContaining(['shpousse', 'conditioner']));
    expect(ids(hairOrder(), ['packpousse'])).not.toContain('packpousse');
    const packed = hairOrder({ upgradeId: 'packpousse' });
    expect(ids(packed)).toContain('packpousse');
    expect(ids(packed)).not.toContain('shpousse');
    const lines = cs.basketLines(d, catalogue);
    expect([...lines.keys()]).toEqual(['antiacne', 'wcspf', 'wcgel']);
    expect(lines.get('wcspf')).toEqual({ initial: true, quantity: 2, extra: 0, refusal: null });
    expect(lines.get('wcgel')).toEqual({ initial: false, quantity: 1, extra: 0, refusal: null });
    expect(cs.basketLines(packed, catalogue).get('packpousse')).toEqual({ initial: false, quantity: 1, extra: 0, refusal: null });
  });

  it('the order’s lines come first and always show, with or without a search', () => {
    const rows = [
      { id: 'wcgel', suggested: true, added: false },
      { id: 'vitc', suggested: false, added: false },
      { id: 'antiacne', suggested: false, added: false, ordered: true },
      { id: 'spray', suggested: false, added: true },
    ];
    expect(cs.pickerOrder(rows)).toEqual({ ids: ['antiacne', 'wcgel', 'spray'], hidden: 1 });
    expect(cs.pickerOrder(rows, { searching: true }).ids).toEqual(['antiacne', 'wcgel', 'vitc', 'spray']);
    // The order on screen still holds once shown.
    expect(cs.pickerOrder(rows, { previous: ['wcgel', 'antiacne', 'spray'] }).ids).toEqual(['wcgel', 'antiacne', 'spray']);
  });
});

describe('void and catalogue changes (H5, H2)', () => {
  it('reopens the same answers and basket under a new id linked to the voided call', () => {
    const saved = cs.markSaved(liveCall({ presented: [proposal], presentationKeys: { a: 'k' } }), 'duo', T0);
    const reopened = cs.reopenAfterVoid(saved, 'call-2');
    expect(cs.reopenAfterVoid({ ...saved, linkedCallId: 'reminder-0' }, 'call-3').linkedCallId).toBe('reminder-0');
    expect(reopened).toMatchObject({ callId: 'call-2', linkedCallId: 'call-1', saved: false, savedOutcome: '', presented: [], presentationKeys: {}, consent: false, checked: false });
    expect(reopened.adds).toEqual(saved.adds);
    expect(reopened.profile).toEqual(saved.profile);
  });
  it('« Annuler ce résultat » is offered only with the server feature, within the window', () => {
    const saved = cs.markSaved(liveCall(), 'noanswer', T0);
    expect(cs.voidDeadline(saved, ['void-call'], 30)).toBe(Date.parse(T0) + 30 * 60_000);
    expect(cs.voidDeadline(saved, [], 30)).toBeNull();
    expect(cs.voidDeadline(saved, undefined, 30)).toBeNull();
    expect(cs.voidDeadline(liveCall(), ['void-call'], 30)).toBeNull();
  });
  it('recognises a catalogue change by code, or by the message of an older server', () => {
    expect(cs.catalogueChange({ code: 'price-changed', message: 'Le prix a changé.' })).toBe('price');
    expect(cs.catalogueChange({ code: 'product-disabled' })).toBe('disabled');
    expect(cs.catalogueChange({ code: 'account-changed', message: 'Le tarif a changé.' })).toBeNull();
    expect(cs.catalogueChange({ message: 'Le tarif a changé. Actualisez et annoncez le montant corrigé.' })).toBe('price');
    expect(cs.catalogueChange({ message: 'Le catalogue a changé : actualisez puis faites confirmer le nouveau montant.' })).toBe('price');
    expect(cs.catalogueChange({ message: 'Un produit a été désactivé. Actualisez le catalogue.' })).toBe('disabled');
    expect(cs.catalogueChange({ message: 'Appel déjà clôturé. Ouvrez un nouvel appel.' })).toBeNull();
  });
});

describe('draft in sessionStorage (A4)', () => {
  const memory = () => { const m = new Map<string, string>(); return { m, getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

  it('round-trips the call and the call set aside', () => {
    const store = { draft: cs.newDraft({ example: 'face', id: 'demo', now: T0 }), parked: liveCall({ presented: [proposal], callbackAt: '2026-11-20T10:00', handledObjections: ['budget'], verifiedProducts: ['nia12'], quantities: { wcgel: 2 }, requestedIds: ['wcgel'], linkedCallId: 'old', tier: 'final', delivery: '400', refusal: 'budget' }) };
    expect(cs.parseStore(cs.serializeStore(store))).toEqual(store);
    const saved = { draft: cs.markSaved(liveCall(), 'callback', T0), parked: null };
    expect(cs.parseStore(cs.serializeStore(saved))).toEqual(saved);
  });

  it('is kept per account, under a versioned key, and removed when empty', () => {
    const storage = memory();
    cs.saveCallStore('nadia', { draft: liveCall(), parked: null }, storage);
    expect([...storage.m.keys()]).toEqual(['thinkercare:appel:v1:nadia']);
    expect(cs.loadCallStore('nadia', storage)!.draft.callId).toBe('call-1');
    expect(cs.loadCallStore('samir', storage)).toBeNull();
    cs.saveCallStore('nadia', { draft: cs.newDraft(), parked: null }, storage);
    expect(storage.m.size).toBe(0);
    cs.saveCallStore('nadia', { draft: liveCall(), parked: null }, storage);
    cs.clearCallStore('nadia', storage);
    expect(storage.m.size).toBe(0);
  });

  it('ignores broken, foreign or older data and never throws', () => {
    expect(cs.parseStore('{')).toBeNull();
    expect(cs.parseStore(JSON.stringify({ v: 0, draft: liveCall() }))).toBeNull();
    expect(cs.parseStore(JSON.stringify({ v: 1, draft: { callId: '' } }))).toBeNull();
    expect(cs.parseStore(JSON.stringify({ v: 1, draft: { ...liveCall(), step: 7 } }))).toBeNull();
    // A field of the wrong type falls back to a new call's value; the rest is kept.
    const repaired = cs.parseStore(JSON.stringify({ v: 1, draft: { ...liveCall(), adds: 'wcgel', consent: 'yes' } }))!;
    expect(repaired.draft.adds).toEqual([]);
    expect(repaired.draft.consent).toBe(false);
    expect(repaired.draft.baseIds).toEqual(['antiacne']);
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('full'); }, removeItem: () => { throw new Error('denied'); } };
    expect(cs.loadCallStore('nadia', broken)).toBeNull();
    expect(() => cs.saveCallStore('nadia', { draft: liveCall(), parked: null }, broken)).not.toThrow();
    expect(() => cs.clearCallStore('nadia', broken)).not.toThrow();
  });

  it('a follow-up call from a reminder starts at the questions, linked to it', () => {
    const d = cs.resumeDraft({ id: 'old-call', base_id: 'antiacne', meta: { originals: [{ id: 'antiacne', name: 'Anti-acné', price: 1800, quantity: 2 }, { id: 'wcgel', name: 'Gel', price: 1500 }], orderRef: 'DOS-9', customerStage: 'returning' } });
    expect(d).toMatchObject({ step: 1, baseIds: ['antiacne', 'wcgel'], baseQuantities: { antiacne: 2, wcgel: 1 }, orderRef: 'DOS-9', customerStage: 'returning', linkedCallId: 'old-call', demo: false });
  });
});

describe('step 3 picker and labels (B5, DBL, STEP3, F4, F5)', () => {
  const rows = [
    { id: 'wcgel', suggested: true, added: false },
    { id: 'total', suggested: true, added: false },
    { id: 'vitc', suggested: false, added: false },
    { id: 'spray', suggested: false, added: true },
    { id: 'sal2', suggested: false, added: false },
  ];
  it('without a search: the suggestions and the added products, the rest behind « Voir tout le catalogue (N) »', () => {
    expect(cs.pickerOrder(rows)).toEqual({ ids: ['wcgel', 'total', 'spray'], hidden: 2 });
    expect(cs.pickerOrder(rows, { showAll: true })).toEqual({ ids: ['wcgel', 'total', 'vitc', 'spray', 'sal2'], hidden: 0 });
    expect(cs.pickerOrder(rows, { searching: true }).ids).toEqual(['wcgel', 'total', 'vitc', 'spray', 'sal2']);
  });

  it('an added product keeps its row: the order on screen stays, new suggestions come after', () => {
    const before = cs.pickerOrder(rows).ids;
    // « Ajouter » on Water Complex Gel: it is no longer a suggestion (it is added) and the ranking changes.
    const after = [{ id: 'sal2', suggested: true, added: false }, { id: 'total', suggested: true, added: false }, { id: 'wcgel', suggested: false, added: true }, { id: 'vitc', suggested: false, added: false }, { id: 'spray', suggested: false, added: true }];
    expect(cs.pickerOrder(after, { previous: before })).toEqual({ ids: ['wcgel', 'total', 'spray', 'sal2'], hidden: 1 });
    // A row whose product left the list (disabled, now in the initial order) goes; the others keep their place.
    expect(cs.pickerOrder(after.filter(r => r.id !== 'total'), { previous: before }).ids).toEqual(['wcgel', 'spray', 'sal2']);
  });

  it('« Sans réponse » is « Cliente non jointe » on the call screens', () => {
    expect(cs.outcomeLabel('noanswer')).toBe('Cliente non jointe');
    expect(cs.outcomeLabel('duo')).toBe('Duo accepté');
    expect(cs.outcomeLabel('nope')).toBe('résultat enregistré');
  });

  it('a third concern says which one it replaces', () => {
    expect(cs.replacedConcern({ ...face, concerns: ['acne', 'marks'] }, 'dull')).toBe('marks');
    expect(cs.replacedConcern({ ...face, concerns: ['acne', 'marks'] }, 'marks')).toBeNull();
    expect(cs.replacedConcern({ ...face, concerns: ['acne'] }, 'dull')).toBeNull();
  });
});

describe('review follow-ups (state, recording, callux)', () => {
  const snap = (id: string, quantity = 1) => ({ id, name: p(id).name, price: p(id).price, quantity });
  const offerOn = (id: string, offerTotal: number, extra: Partial<Proposal> = {}) => ({ id, call_id: 'call-1', user_id: 'u', created_at: T0, base: snap('antiacne'), originals: [snap('antiacne')], products: [snap('antiacne'), snap('wcgel')], catalogueTotal: 3300, offerTotal, extra: offerTotal - 1800, tier: 'duo', delivery: null, version: 3, ...extra }) as Proposal;
  const screen = (offer: number) => ({ initial: [{ ...p('antiacne'), quantity: 1 }], basket: [{ ...p('antiacne'), quantity: 1 }, { ...p('wcgel'), quantity: 1 }], tier: 'duo' as const, fee: null, offer });

  it('the presented offer keeps matching after a catalogue reload when the server keeps the presented price (state-3)', () => {
    const presented = [offerOn('o-1', 3000)];
    // Same prices: both modes match.
    expect(cs.matchingOffer(presented, screen(3000), false)?.id).toBe('o-1');
    expect(cs.matchingOffer(presented, screen(3000), true)?.id).toBe('o-1');
    // The catalogue moved the current price to 3100: only the 'price-codes' mode keeps the presented offer (at 3000).
    expect(cs.matchingOffer(presented, screen(3100), false)).toBeUndefined();
    expect(cs.matchingOffer(presented, screen(3100), true)?.offerTotal).toBe(3000);
    // Composition, quantities, price level and delivery still decide, in both modes; the latest match wins.
    expect(cs.matchingOffer(presented, { ...screen(3000), tier: 'final' }, true)).toBeUndefined();
    expect(cs.matchingOffer(presented, { ...screen(3000), fee: 400 }, true)).toBeUndefined();
    expect(cs.matchingOffer(presented, { ...screen(3000), basket: [{ ...p('antiacne'), quantity: 1 }, { ...p('wcgel'), quantity: 2 }] }, true)).toBeUndefined();
    expect(cs.matchingOffer([...presented, offerOn('o-2', 2950)], screen(3100), true)?.id).toBe('o-2');
  });

  it('a recomputed price unticks the agreement, an unchanged one keeps it (state-3)', () => {
    const d = liveCall({ adds: ['wcgel'], consent: true });
    const dearer = catalogue.map(x => x.id === 'wcgel' ? { ...x, price: 1700 } : x);
    expect(cs.offerOf(d, catalogue)).not.toBe(cs.offerOf(d, dearer));
    expect(cs.afterCatalogueChange(d, catalogue, dearer)).toMatchObject({ consent: false, checked: true, callId: 'call-1' });
    expect(cs.afterCatalogueChange(d, catalogue, catalogue.map(x => x.id === 'vitc' ? { ...x, price: 9 } : x))).toBeNull();
    expect(cs.afterCatalogueChange({ ...d, consent: false }, catalogue, dearer)).toBeNull();
    expect(cs.afterCatalogueChange(cs.markSaved(d, 'duo', T0), catalogue, dearer)).toBeNull();
  });

  it('a duplicate save shows the stored outcome, or none when an older server does not say it (state-2)', () => {
    expect(cs.recordedOutcome('duo', { ok: true })).toEqual({ outcome: 'duo', duplicate: false });
    expect(cs.recordedOutcome('duo', { ok: true, duplicate: true, outcome: 'initial' })).toEqual({ outcome: 'initial', duplicate: true });
    expect(cs.recordedOutcome('duo', { ok: true, duplicate: true })).toEqual({ outcome: '', duplicate: true });
    expect(cs.recordedOutcome('duo', { ok: true, duplicate: true, outcome: 'nonsense' })).toEqual({ outcome: '', duplicate: true });
  });

  it('a save or a presentation answered after an example started lands on the call set aside (state-4)', () => {
    const live = liveCall();
    const store = cs.startExample({ draft: live, parked: null }, 'face');
    const saved = cs.applyToCall(store, 'call-1', d => cs.markSaved(d, 'initial', T0))!;
    expect(saved.parked).toMatchObject({ callId: 'call-1', saved: true, savedOutcome: 'initial' });
    expect(saved.draft).toBe(store.draft);
    expect(cs.applyToCall({ draft: live, parked: null }, 'call-1', d => ({ ...d, presented: [proposal] }))!.draft.presented).toEqual([proposal]);
    expect(cs.applyToCall(store, 'other', d => d)).toBeNull();
  });

  it('a change of the initial order after an unanswered « J’ai présenté » continues under a new call id (state-3, recording-6)', () => {
    const pending = liveCall({ presentationKeys: { sig: 'key-1' } });
    const r = cs.changeInitialOrder(pending, ['antiacne', 'wcspf'], catalogue, T0, () => 'call-2')!;
    expect(r.draft).toMatchObject({ callId: 'call-2', presentationKeys: {}, startedAt: T0, profile: face });
    const q = cs.changeInitialQuantity(pending, 'antiacne', 2, () => 'call-3')!;
    expect(q).toMatchObject({ callId: 'call-3', presentationKeys: {}, startedAt: T0, baseQuantities: { antiacne: 2 } });
    // Nothing sent under this id: the id stays.
    expect(cs.changeInitialOrder(liveCall(), ['antiacne', 'wcspf'], catalogue, T0, () => 'call-x')!.draft.callId).toBe('call-1');
    expect(cs.changeInitialQuantity(liveCall(), 'antiacne', 2, () => 'call-x')!.callId).toBe('call-1');
    // « Annuler » on the removal notice still works under the renewed id.
    const undone = cs.undoRemoval(r.draft, pending)!;
    expect(undone).toMatchObject({ callId: 'call-2', baseIds: ['antiacne'], adds: ['wcgel', 'wcspf'] });
    expect(cs.undoRemoval({ ...r.draft, callId: 'unrelated' }, liveCall())).toBeNull();
  });

  it('a targeted stop also drops extra units of the initial order (callux-5)', () => {
    const d = liveCall({ adds: [], quantities: { antiacne: 3 } });
    expect(cs.basketOf(d, catalogue).basket[0]!.quantity).toBe(3);
    const r = cs.changeProfile(d, { safety: ['urgent'] }, catalogue)!;
    expect(r.draft.quantities).toEqual({});
    expect(cs.basketOf(r.draft, catalogue).basket[0]!.quantity).toBe(1);
    expect(r.removed).toContain('antiacne'); // announced with « Annuler » (final review call-4)
    // Without a stop the extra units stay.
    expect(cs.changeProfile(d, { skin: 'dry' }, catalogue)!.draft.quantities).toEqual({ antiacne: 3 });
  });

  it('an example sets aside a saved call while it may still be voided, never as a call at stake (state-7)', () => {
    const saved = cs.markSaved(liveCall(), 'duo', T0);
    const kept = cs.startExample({ draft: saved, parked: null }, 'face', { keepSaved: true });
    expect(kept.parked).toBe(saved);
    expect(cs.leavePlan(kept, 'new')).toBe('go');
    expect(cs.leavePlan(kept, 'leave')).toBe('go');
    expect(cs.needsUnloadPrompt(kept)).toBe(false);
    expect(cs.exitExample(kept)).toEqual({ draft: saved, parked: null });
    expect(cs.startExample({ draft: saved, parked: null }, 'face').parked).toBeNull();
    expect(cs.startExample({ draft: liveCall(), parked: null }, 'face', { keepSaved: true }).parked!.saved).toBe(false);
  });

  it('a catalogue notice names only the lines the call adds (recording-8)', () => {
    const d = liveCall({ adds: ['wcgel'], baseIds: ['antiacne', 'wcspf'], baseQuantities: { antiacne: 1, wcspf: 1 } });
    const off = (ids: string[]) => catalogue.map(x => ids.includes(x.id) ? { ...x, enabled: false } : x);
    expect(cs.disabledAdditions(d, off(['wcspf', 'wcgel'])).map(x => x.id)).toEqual(['wcgel']);
    expect(cs.disabledAdditions(d, off(['wcspf']))).toEqual([]);
    // A server without the M3 fix refuses a disabled initial product too: that list names it (final review call-1).
    expect(cs.disabledLines(d, off(['antiacne'])).map(x => x.id)).toEqual(['antiacne']);
    // Units above the initial quantity are an addition too.
    expect(cs.disabledAdditions({ ...d, quantities: { wcspf: 2 } }, off(['wcspf'])).map(x => x.id)).toEqual(['wcspf']);
  });

  it('a duplicated tab continues its copy of the call under a new id, nothing presented (state-2)', () => {
    const copy = { draft: cs.newDraft({ example: 'face', id: 'demo' }), parked: liveCall({ presented: [proposal], presentationKeys: { a: 'k' } }) };
    expect(cs.heldCallIds(copy)).toEqual(['call-1']);
    expect(cs.restoredCallIds(copy)).toEqual(['call-1']);
    const r = cs.forkCopies(copy, ['call-1'], () => 'call-2')!;
    expect(r.hadOffers).toBe(true);
    expect(r.store.draft).toBe(copy.draft);
    expect(r.store.parked).toMatchObject({ callId: 'call-2', presented: [], presentationKeys: {}, adds: ['wcgel', 'wcspf'], startedAt: T0 });
    expect(cs.orderLocked(r.store.parked!)).toBe(false);
    expect(cs.forkCopies(copy, ['other'])).toBeNull();
    // A saved call is not asked about and never forked: it is the record of what the server holds.
    const saved = { draft: cs.markSaved(liveCall(), 'duo', T0), parked: null };
    expect(cs.restoredCallIds(saved)).toEqual([]);
    expect(cs.heldCallIds(saved)).toEqual(['call-1']);
    expect(cs.forkCopies(saved, ['call-1'])).toBeNull();
  });

  it('the void comment describes the server: the reminder link is kept for a follow-up', () => {
    const src = readFileSync(new URL('../src/ui/call/callState.ts', import.meta.url), 'utf8');
    expect(src).toContain('void-call reopens it and answers `reopenedReminderId`');
  });
});
