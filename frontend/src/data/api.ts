import { PRICING_RULE } from '@touche/domain';
import { reportCache } from './report-cache';
import { reportUpdates } from './report-updates';

/** An error a request ends with: French text for the screen, the HTTP status (0 when the network failed) and the server's code. */
export type RequestError = Error & { status: number; code?: string };

export const NETWORK_ERROR = 'Connexion perdue : votre saisie est conservée. Vérifiez le réseau puis réessayez.';
export const ACCOUNT_CHANGED = 'Ce poste est maintenant connecté avec un autre compte. Rechargez la page pour continuer avec ce compte.';
export const unavailable = (status: number) => `Service momentanément indisponible (code ${status}). Réessayez.`;

const failure = (message: string, status: number, code?: string): RequestError => Object.assign(new Error(message), { status, code });
const aborted = (error: unknown) => (error as { name?: string } | null)?.name === 'AbortError';

let expectedUserId: string | null = null;
let locked = false;

/** Set by the app after each workspace load: when the server lists 'expected-user', every POST except login names the
 *  account this tab works for, so a write never lands on another account signed in from another tab (X1). */
export function setExpectedUser(id: string | null) { expectedUserId = id; }
/** A tab whose account changed elsewhere sends nothing more until it is reloaded. */
export function lockRequests() { locked = true; }
/** Tests only. */
export function resetRequestState() { expectedUserId = null; locked = false; }

/** `background`: an automatic report refresh (30 s, focus, other tab). It is marked so the server does not count it as
 *  activity that keeps the session open (servers that do not know the header ignore it). */
export async function requestJson(query = '', body?: unknown, signal?: AbortSignal, options: { background?: boolean } = {}) {
  const action = (body as { action?: string } | undefined)?.action;
  if (locked) throw failure(ACCOUNT_CHANGED, 409, 'account-changed');
  if (action === 'login' || action === 'logout') reportCache.setUser(null);
  const payload = body && typeof body === 'object' && expectedUserId && action !== 'login' ? { ...body, expectedUserId } : body;
  let response: Response;
  let text = '';
  try {
    response = await fetch('/api/desk' + query, {
      method: body ? 'POST' : 'GET', credentials: 'same-origin', signal,
      // X-Desk-Pricing: the pricing rules this desk computes offers with; an older open tab is told to reload the page.
      headers: body ? { 'Content-Type': 'application/json', 'X-Desk-Pricing': PRICING_RULE } : options.background ? { 'X-Desk-Background': '1' } : undefined,
      body: body ? JSON.stringify(payload) : undefined,
    });
    text = await response.text();
  } catch (error) {
    // The browser's own text (« Failed to fetch ») never reaches the screen.
    if (aborted(error)) throw error;
    throw failure(NETWORK_ERROR, 0, 'network');
  }
  let data: Record<string, unknown> | undefined;
  try { const parsed = text ? JSON.parse(text) : {}; data = parsed && typeof parsed === 'object' ? parsed : undefined; } catch { data = undefined; }
  if (!response.ok) {
    const code = typeof data?.code === 'string' ? data.code : undefined;
    if (response.status === 401) {
      reportCache.setUser(null);
      if (action !== 'login' && typeof window !== 'undefined') window.dispatchEvent(new Event('desk-session-expired'));
    }
    if (code === 'account-changed' && typeof window !== 'undefined') window.dispatchEvent(new Event('desk-account-changed'));
    // A proxy page (HTML 502/504) or a server error without a French message gets a French one.
    const message = typeof data?.error === 'string' && data.error ? data.error : !data || response.status >= 500 ? unavailable(response.status) : 'Chargement impossible.';
    throw failure(message, response.status, code);
  }
  if (!data) throw failure(unavailable(response.status), response.status, 'invalid-response');
  if (body) {
    if (action === 'login' || action === 'logout') reportCache.clear();
    else reportUpdates.changed();
  }
  return data as any;
}
