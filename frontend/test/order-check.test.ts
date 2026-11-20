import { describe, expect, it } from 'vitest';
import { ORDER_REFERENCE_HINT } from '@touche/domain';
import { checkFromError, checkFromResponse, orderCheckBlocksSave, startCheck, type OrderCheck } from '../src/ui/call/orderCheck';

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
