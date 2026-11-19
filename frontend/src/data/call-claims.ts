/**
 * Duplicated browser tabs. « Dupliquer l’onglet » copies sessionStorage, so the copy restores the call on screen under
 * the same call id as the tab it was copied from, and both would present offers and save results under one id. After
 * restoring a call, a tab asks the other tabs of this browser whether one already holds that id; the tab that held it
 * first answers, and the copy continues under a new id (callState.forkCopies). Messages carry call ids only.
 * Without BroadcastChannel (or when it fails) nothing is asked and nothing changes.
 */
export const CALL_CHANNEL = 'thinkercare-calls';

type Ask = { type: 'ask'; tab: string; since: number; ids: string[] };
type Taken = { type: 'taken'; to: string; ids: string[] };
export type CallClaimMessage = Ask | Taken;
/** A tab: its random id, when it started (an older tab keeps the id) and the call ids it holds. */
export type CallHolder = { tab: string; since: number; ids: string[] };

const idList = (x: unknown): x is string[] => Array.isArray(x) && x.length > 0 && x.length <= 4 && x.every(id => typeof id === 'string' && !!id);

export function parseClaim(data: unknown): CallClaimMessage | null {
  const m = data as { type?: unknown; tab?: unknown; since?: unknown; to?: unknown; ids?: unknown } | null;
  if (!m || typeof m !== 'object' || !idList(m.ids)) return null;
  if (m.type === 'ask' && typeof m.tab === 'string' && m.tab && typeof m.since === 'number' && Number.isFinite(m.since)) return { type: 'ask', tab: m.tab, since: m.since, ids: m.ids };
  if (m.type === 'taken' && typeof m.to === 'string' && m.to) return { type: 'taken', to: m.to, ids: m.ids };
  return null;
}

/** What a tab answers to another tab's question: the ids both hold, when this tab started first (ties: the smaller tab
 *  id), so of two tabs restored at the same moment exactly one continues under a new id. */
export function claimAnswer(mine: CallHolder, ask: Ask): Taken | null {
  if (ask.tab === mine.tab) return null;
  const first = mine.since < ask.since || (mine.since === ask.since && mine.tab < ask.tab);
  const ids = first ? ask.ids.filter(id => mine.ids.includes(id)) : [];
  return ids.length ? { type: 'taken', to: ask.tab, ids } : null;
}

type ChannelLike = Pick<BroadcastChannel, 'postMessage' | 'addEventListener' | 'removeEventListener' | 'close'>;

/**
 * Starts this tab's side: it answers other tabs about the ids `held()` returns, and `ask(ids)` asks about a restored
 * call; `onTaken` receives the ids another tab held first. `stop()` closes the channel.
 */
export function startCallClaims({ held, onTaken, tab = randomId(), since = Date.now(), open = openChannel }: {
  held: () => string[]; onTaken: (ids: string[]) => void; tab?: string; since?: number; open?: () => ChannelLike | null;
}): { ask: (ids: string[]) => void; stop: () => void } {
  let channel: ChannelLike | null = null;
  try { channel = open(); } catch { channel = null; }
  if (!channel) return { ask: () => {}, stop: () => {} };
  const c = channel;
  const handle = (event: MessageEvent) => {
    const m = parseClaim(event.data);
    if (!m) return;
    if (m.type === 'taken') { if (m.to === tab) onTaken(m.ids); return; }
    const answer = claimAnswer({ tab, since, ids: held() }, m);
    if (answer) try { c.postMessage(answer); } catch { /* the copy keeps its id */ }
  };
  c.addEventListener('message', handle);
  return {
    ask: ids => { if (ids.length) try { c.postMessage({ type: 'ask', tab, since, ids: ids.slice(0, 4) } satisfies Ask); } catch { /* nothing asked */ } },
    stop: () => { c.removeEventListener('message', handle); try { c.close(); } catch { /* already closed */ } },
  };
}

function openChannel(): ChannelLike | null { return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CALL_CHANNEL); }
function randomId(): string { try { return crypto.randomUUID(); } catch { return Math.random().toString(36).slice(2); } }
