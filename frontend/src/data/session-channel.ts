/** Sign-in and sign-out told to the other tabs of this browser (X1). Messages carry the account id only. */
export type SessionMessage = { type: 'login' | 'logout'; userId: string };

export const SESSION_CHANNEL = 'thinkercare-session';
let channel: BroadcastChannel | null | undefined;

function open(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  try { channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(SESSION_CHANNEL); } catch { channel = null; }
  return channel;
}

export function parseSessionMessage(data: unknown): SessionMessage | null {
  const m = data as Partial<SessionMessage> | null;
  return m && (m.type === 'login' || m.type === 'logout') && typeof m.userId === 'string' && m.userId ? { type: m.type, userId: m.userId } : null;
}

/**
 * What a tab signed in as `me` does when another tab signs in or out. Cookies are shared, so another account signing in
 * means this tab's next write would be credited to it: lock. The same account signing out ends this tab's session too.
 */
export function sessionReaction(me: string | null | undefined, message: SessionMessage): 'lock' | 'signed-out' | 'none' {
  if (!me) return 'none';
  if (message.type === 'login' && message.userId !== me) return 'lock';
  if (message.type === 'logout' && message.userId === me) return 'signed-out';
  return 'none';
}

export function announceSession(message: SessionMessage) {
  try { open()?.postMessage(message); } catch { /* Other tabs still find out on their next request. */ }
}

export function onSessionMessage(listener: (message: SessionMessage) => void): () => void {
  const c = open();
  if (!c) return () => {};
  const handle = (event: MessageEvent) => { const m = parseSessionMessage(event.data); if (m) listener(m); };
  c.addEventListener('message', handle);
  return () => c.removeEventListener('message', handle);
}

/** Tests only. */
export function closeSessionChannel() { channel?.close(); channel = undefined; }
