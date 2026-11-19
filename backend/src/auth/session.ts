export const SESSION_COOKIE = '__Host-touche-session';
/** Idle timeout: a session unused for 8 h ends; activity pushes it back (H1). */
export const SESSION_TTL_MS = 28_800_000;
/** Absolute cap: a session never outlives 24 h after sign-in, however active. */
export const SESSION_MAX_MS = 86_400_000;
/** Activity moves the expiry at most this often, sparing a write per request. */
export const SESSION_RENEW_MS = 300_000;

export function readSessionToken(cookieHeader?: string): string {
  const found = (cookieHeader ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(SESSION_COOKIE + '='));
  return found?.slice(SESSION_COOKIE.length + 1) ?? '';
}

export function sessionCookie(token: string, maxAgeSeconds = SESSION_TTL_MS / 1000): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}
