export const SESSION_COOKIE = '__Host-touche-session';
export const SESSION_TTL_MS = 28_800_000;

export function readSessionToken(cookieHeader?: string): string {
  const found = (cookieHeader ?? '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(SESSION_COOKIE + '='));
  return found?.slice(SESSION_COOKIE.length + 1) ?? '';
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}
