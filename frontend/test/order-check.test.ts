import { describe, expect, it } from 'vitest';
import { ORDER_REFERENCE_HINT } from '@touche/domain';
import { advanceBlocker, checkFromError, checkFromResponse, orderCheckBlocksSave, orderCheckEnabled, orderLookupQuery, referencePlaceholder, startCheck, type OrderCheck } from '../src/ui/call/orderCheck';

const verified: OrderCheck = { reference: 'TOU1763816', status: 'verified', order: { id: 1763816, reference: 'TOU1763816', stateGroup: 'pending', stateLabel: 'Pas encore expédiée', stateName: 'En confirmation' } };

describe('order check (pure)', () => {
  it('starts a check only for a complete reference', () => {
    expect(startCheck('tou 1763816')).toEqual({ reference: 'TOU1763816', status: 'checking' });
    expect(startCheck('1763816')).toEqual({ reference: '1763816', status: 'checking' });
    expect(startCheck('DOS-1')).toEqual({ reference: 'DOS-1', status: 'invalid', message: ORDER_REFERENCE_HINT });
    expect(startCheck('')).toEqual({ reference: '', status: 'idle' });
  });

  it('reads the lookup answers', () => {
    expect(checkFromResponse('1763816', { check: 'verified', order: verified.order })).toEqual(verified);
    expect(checkFromResponse('TOU1', { check: 'unavailable', order: null, message: 'EcoManager ne répond pas.' })).toEqual({ reference: 'TOU1', status: 'unavailable', message: 'EcoManager ne répond pas.' });
    expect(checkFromError('TOU9', { status: 404, code: 'order-not-found', message: 'Commande TOU9 introuvable.' })).toEqual({ reference: 'TOU9', status: 'not-found', message: 'Commande TOU9 introuvable.' });
    expect(checkFromError('X', { status: 400, code: 'order-ref-format', message: ORDER_REFERENCE_HINT })).toEqual({ reference: 'X', status: 'invalid', message: ORDER_REFERENCE_HINT });
    expect(checkFromError('TOU1', { status: 0, code: 'network', message: 'Connexion perdue.' }).status).toBe('unavailable');
    expect(checkFromError('TOU1', { status: 429, message: 'Trop de vérifications.' })).toEqual({ reference: 'TOU1', status: 'unavailable', message: 'Trop de vérifications.' });
  });

  it('checks a dossier against the call’s store', () => {
    expect(startCheck('bel 1763838', 'belnco')).toEqual({ reference: 'BEL1763838', status: 'checking' });
    expect(startCheck('1763838', 'belnco')).toEqual({ reference: '1763838', status: 'checking' });
    expect(startCheck('DOS-1', 'belnco')).toEqual({ reference: 'DOS-1', status: 'invalid', message: 'Une référence commence par BEL suivie du numéro de commande, par exemple BEL1763838.' });
    expect(startCheck('BEL1763838')).toEqual({ reference: 'BEL1763838', status: 'invalid', message: 'Cette référence est une commande BEL.NCO : l’appel est un appel Touché. Changez la marque de l’appel ou corrigez la référence.' });
    expect(startCheck('TOU1763816', 'belnco').status).toBe('invalid');
  });
  it('each store is checked only when the server lists it', () => {
    expect(orderCheckEnabled(['order-check'], 'touche')).toBe(true);
    expect(orderCheckEnabled(['order-check'], 'belnco')).toBe(false);
    expect(orderCheckEnabled(['order-check', 'order-check-bel'], 'belnco')).toBe(true);
    expect(orderCheckEnabled(undefined, 'touche')).toBe(false);
  });
  it('names the BEL store in the lookup; a Touché lookup stays as older servers know it', () => {
    expect(orderLookupQuery('BEL1763838', 'belnco')).toBe('?action=order&ref=BEL1763838&brand=belnco');
    expect(orderLookupQuery('TOU1763816', 'touche')).toBe('?action=order&ref=TOU1763816');
  });
  it('the dossier placeholder follows the brand', () => {
    expect(referencePlaceholder('touche', true)).toBe('TOU1763816');
    expect(referencePlaceholder('touche', false)).toBe('DOS-0142');
    expect(referencePlaceholder('belnco', false)).toBe('BEL1763838');
  });
  it('a reference the server places in the other store blocks like a malformed one', () => {
    const message = 'Cette référence est une commande BEL.NCO : l’appel est un appel Touché. Changez la marque de l’appel ou corrigez la référence.';
    expect(checkFromError('BEL1', { status: 400, code: 'order-ref-brand', message })).toEqual({ reference: 'BEL1', status: 'invalid', message });
  });

  it('blocks a save until the order is verified or EcoManager is unreachable', () => {
    expect(orderCheckBlocksSave(verified, 'TOU1763816')).toBeNull();
    expect(orderCheckBlocksSave({ reference: 'TOU1', status: 'unavailable' }, 'tou1')).toBeNull();
    expect(orderCheckBlocksSave({ reference: 'TOU9', status: 'not-found', message: 'Commande TOU9 introuvable.' }, 'TOU9')).toBe('Commande TOU9 introuvable.');
    expect(orderCheckBlocksSave({ reference: 'X', status: 'invalid', message: ORDER_REFERENCE_HINT }, 'X')).toBe(ORDER_REFERENCE_HINT);
    expect(orderCheckBlocksSave({ reference: 'TOU1', status: 'checking' }, 'TOU1')).toBe('Vérification de la commande en cours… Réessayez dans un instant.');
    expect(orderCheckBlocksSave({ reference: '', status: 'idle' }, 'TOU1')).toBe('Vérifiez la commande dans EcoManager avant d’enregistrer.');
    expect(orderCheckBlocksSave(verified, 'TOU1763817')).toBe('La référence a changé : vérifiez-la de nouveau dans EcoManager.');
  });
});

describe('moving on needs the dossier reference', () => {
  const call = { step: 0, demo: false, saved: false, orderRef: '' };
  it('refuses a later step without a reference', () => {
    expect(advanceBlocker(call, 1)).toBe('Renseignez la référence du dossier avant de passer à l’étape suivante.');
    expect(advanceBlocker({ ...call, step: 1, orderRef: '   ' }, 2)).toBe('Renseignez la référence du dossier avant de passer à l’étape suivante.');
  });
  it('lets the call move on with a reference, go back, or run as an example or a saved call', () => {
    expect(advanceBlocker({ ...call, orderRef: 'TOU1763816' }, 1)).toBeNull();
    expect(advanceBlocker({ ...call, step: 2 }, 1)).toBeNull();
    expect(advanceBlocker({ ...call, step: 1 }, 1)).toBeNull();
    expect(advanceBlocker({ ...call, demo: true }, 1)).toBeNull();
    expect(advanceBlocker({ ...call, saved: true }, 2)).toBeNull();
  });
});
