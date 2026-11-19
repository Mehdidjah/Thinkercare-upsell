/**
 * One browser history entry per view (`?vue=pilotage`), so the browser and Android Back move between views inside the app.
 * Below the first view sits one « guard » entry: Back from the first view lands there, and the app asks before leaving
 * while a call is unsaved.
 */
export const VIEW_SLUGS: Record<string, string> = { call: 'appel', progress: 'progression', catalogue: 'catalogue', coverage: 'parcours', protocol: 'protocole', results: 'pilotage', contributions: 'apports', admin: 'gestion', account: 'compte' };
const MANAGER_ONLY = ['results', 'contributions', 'admin'], ADVISER_ONLY = ['progress'];

export type HistoryEntry = { tc: 'view'; view: string } | { tc: 'guard' };

/** The views an account may open (the same rules as the render guards in App.tsx). */
export function allowedView(manager: boolean, view: string | null | undefined): view is string {
  return !!view && view in VIEW_SLUGS && (manager ? !ADVISER_ONLY.includes(view) : !MANAGER_ONLY.includes(view));
}
/** Where an account lands after signing in (ROLES): Pilotage for managers and Direction, the guided call for advisers. */
export const landingView = (manager: boolean) => manager ? 'results' : 'call';

export function viewFromSearch(search: string): string | null {
  const slug = new URLSearchParams(search).get('vue');
  return Object.keys(VIEW_SLUGS).find(view => VIEW_SLUGS[view] === slug) ?? null;
}
export function viewFromEntry(state: unknown): string | null {
  const entry = state as Partial<{ tc: string; view: string }> | null;
  return entry?.tc === 'view' && typeof entry.view === 'string' ? entry.view : null;
}
export const isGuardEntry = (state: unknown) => (state as { tc?: string } | null)?.tc === 'guard';

/** The address of a view, keeping the path and any other query parameter. */
export function viewHref(view: string | null, location: { pathname: string; search: string; hash: string }): string {
  const params = new URLSearchParams(location.search);
  if (view && VIEW_SLUGS[view]) params.set('vue', VIEW_SLUGS[view]); else params.delete('vue');
  const query = params.toString();
  return location.pathname + (query ? '?' + query : '') + location.hash;
}
