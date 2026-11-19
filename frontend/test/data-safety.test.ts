import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACCOUNT_CHANGED, NETWORK_ERROR, lockRequests, requestJson, resetRequestState, setExpectedUser } from '../src/data/api';
import { announceSession, closeSessionChannel, onSessionMessage, parseSessionMessage, sessionReaction } from '../src/data/session-channel';
import { allowedView, landingView, viewFromEntry, viewFromSearch, viewHref } from '../src/data/view-history';

// Requests, other tabs and history: what keeps a live call safe outside the call screen.
const reply = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
afterEach(() => { vi.unstubAllGlobals(); resetRequestState(); closeSessionChannel(); });

describe('requests (X5, B2, X1)', () => {
  it('a dropped connection gives French text that says the input is kept', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(requestJson('', { action: 'save-call' })).rejects.toMatchObject({ message: NETWORK_ERROR, status: 0, code: 'network' });
  });

  it('an HTML gateway page or a server error without a message gets « Service momentanément indisponible »', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply('<html><body>Bad Gateway</body></html>', 502)));
    await expect(requestJson('', { action: 'present-offer' })).rejects.toMatchObject({ message: 'Service momentanément indisponible (code 502). Réessayez.', status: 502 });
    vi.stubGlobal('fetch', vi.fn(async () => reply({ statusCode: 500, message: 'Internal server error' }, 500)));
    await expect(requestJson('?compact=1')).rejects.toMatchObject({ message: 'Service momentanément indisponible (code 500). Réessayez.' });
    vi.stubGlobal('fetch', vi.fn(async () => reply('<!doctype html>', 200)));
    await expect(requestJson('?compact=1')).rejects.toMatchObject({ status: 200, code: 'invalid-response' });
  });

  it('keeps the server message, status and code', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => reply({ error: 'Le prix a changé.', code: 'price-changed' }, 409)));
    await expect(requestJson('', { action: 'save-call' })).rejects.toMatchObject({ message: 'Le prix a changé.', status: 409, code: 'price-changed' });
  });

  it('names the expected account on every POST except login, only once the app sets it', async () => {
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => reply({ ok: true }));
    vi.stubGlobal('fetch', fetch);
    const sent = () => JSON.parse(String(fetch.mock.calls.at(-1)![1].body));
    await requestJson('', { action: 'save-call', id: 'c' });
    expect(sent()).toEqual({ action: 'save-call', id: 'c' });
    setExpectedUser('nadia');
    await requestJson('', { action: 'save-call', id: 'c' });
    expect(sent()).toEqual({ action: 'save-call', id: 'c', expectedUserId: 'nadia' });
    await requestJson('', { action: 'login', username: 'x', password: 'y' });
    expect(sent()).toEqual({ action: 'login', username: 'x', password: 'y' });
    await requestJson('?compact=1');
    expect(fetch.mock.calls.at(-1)![1].body).toBeUndefined();
  });

  it('« account-changed » tells the app, and a locked tab sends nothing more', async () => {
    const win = new EventTarget(), heard = vi.fn();
    vi.stubGlobal('window', win);
    win.addEventListener('desk-account-changed', heard);
    vi.stubGlobal('fetch', vi.fn(async () => reply({ error: ACCOUNT_CHANGED, code: 'account-changed' }, 409)));
    await expect(requestJson('', { action: 'save-call' })).rejects.toMatchObject({ code: 'account-changed' });
    expect(heard).toHaveBeenCalledTimes(1);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    lockRequests();
    await expect(requestJson('', { action: 'save-call' })).rejects.toMatchObject({ code: 'account-changed', message: ACCOUNT_CHANGED });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('other tabs (X1)', () => {
  it('locks when another account signs in, signs out with its own account', () => {
    expect(sessionReaction('nadia', { type: 'login', userId: 'samir' })).toBe('lock');
    expect(sessionReaction('nadia', { type: 'login', userId: 'nadia' })).toBe('none');
    expect(sessionReaction('nadia', { type: 'logout', userId: 'nadia' })).toBe('signed-out');
    expect(sessionReaction('nadia', { type: 'logout', userId: 'samir' })).toBe('none');
    expect(sessionReaction(null, { type: 'login', userId: 'samir' })).toBe('none');
    expect(parseSessionMessage('changed')).toBeNull();
    expect(parseSessionMessage({ type: 'login' })).toBeNull();
  });

  it('broadcasts {type, userId} and hands only valid messages to the app', () => {
    class Channel { static last: Channel; listeners: ((e: { data: unknown }) => void)[] = []; postMessage = vi.fn(); close = vi.fn(); constructor(public name: string) { Channel.last = this; } addEventListener(_: string, l: (e: { data: unknown }) => void) { this.listeners.push(l); } removeEventListener() {} }
    vi.stubGlobal('BroadcastChannel', Channel);
    const heard = vi.fn();
    onSessionMessage(heard);
    announceSession({ type: 'login', userId: 'nadia' });
    expect(Channel.last.name).toBe('thinkercare-session');
    expect(Channel.last.postMessage).toHaveBeenCalledWith({ type: 'login', userId: 'nadia' });
    Channel.last.listeners.forEach(l => { l({ data: { type: 'logout', userId: 'samir' } }); l({ data: 'changed' }); });
    expect(heard).toHaveBeenCalledTimes(1);
    expect(heard).toHaveBeenCalledWith({ type: 'logout', userId: 'samir' });
  });
});

describe('views and history (BACK, ROLES)', () => {
  it('one address per view, guarded by role', () => {
    expect(viewHref('results', { pathname: '/', search: '', hash: '' })).toBe('/?vue=pilotage');
    expect(viewHref('call', { pathname: '/', search: '?vue=pilotage&x=1', hash: '#contenu' })).toBe('/?vue=appel&x=1#contenu');
    expect(viewHref(null, { pathname: '/', search: '?vue=pilotage', hash: '' })).toBe('/');
    expect(viewFromSearch('?vue=apports')).toBe('contributions');
    expect(viewFromSearch('?vue=inconnue')).toBeNull();
    expect(viewFromEntry({ tc: 'view', view: 'catalogue' })).toBe('catalogue');
    expect(viewFromEntry({ tc: 'guard' })).toBeNull();
    expect(allowedView(false, 'results')).toBe(false);
    expect(allowedView(true, 'progress')).toBe(false);
    expect(allowedView(true, 'admin')).toBe(true);
    expect(allowedView(false, 'call')).toBe(true);
    expect([landingView(true), landingView(false)]).toEqual(['results', 'call']);
  });
});

describe('background refresh marker', () => {
  it('marks automatic report refreshes only', async () => {
    resetRequestState();
    const fetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    await requestJson('?action=analytics', undefined, undefined, { background: true });
    await requestJson('?action=analytics');
    expect((fetch.mock.calls[0][1].headers as Record<string, string>)['X-Desk-Background']).toBe('1');
    expect(fetch.mock.calls[1][1].headers).toBeUndefined();
    vi.unstubAllGlobals();
  });
});

