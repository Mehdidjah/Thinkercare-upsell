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

/** The features this server lists: `order-check` only once EcoManager is configured. */
export function featuresFor(env: { ecomanager?: unknown }): string[] {
  return env.ecomanager ? [...FEATURES, 'order-check'] : [...FEATURES];
}

/** An adviser may void her own recorded outcome for this long; a manager at any time. */
export const VOID_WINDOW_MINUTES = 30;
