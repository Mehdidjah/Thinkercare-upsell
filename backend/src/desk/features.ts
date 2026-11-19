/**
 * Server capabilities announced in the workspace (bootstrap and login). A newer frontend sends a
 * new field or calls a new action only when its feature is listed, so it still works with an
 * older API; an older frontend ignores the list.
 */
export const FEATURES: readonly string[] = ['expected-user'];
