/**
 * Server capabilities announced in the workspace (bootstrap and login). A newer frontend sends a
 * new field or calls a new action only when its feature is listed, so it still works with an
 * older API; an older frontend ignores the list.
 */
export const FEATURES: readonly string[] = [
  'void-call',
  'reopen-reminder',
  'expected-user',
  'sliding-session',
  'price-codes',
  'brands',
];

/** The features this server lists: `order-check` once EcoManager is configured (the TOU store), `order-check-bel` once
 *  the BEL.NCO store is too. */
export function featuresFor(env: { ecomanager?: { belToken?: string } }): string[] {
  if (!env.ecomanager) return [...FEATURES];
  return env.ecomanager.belToken ? [...FEATURES, 'order-check', 'order-check-bel'] : [...FEATURES, 'order-check'];
}

/** An adviser may void her own recorded outcome for this long; a manager at any time. */
export const VOID_WINDOW_MINUTES = 30;
