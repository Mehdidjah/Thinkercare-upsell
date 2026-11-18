import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestJson } from '../src/data/api';
import { reportCache } from '../src/data/report-cache';
import { REPORT_REFRESH_MS, ReportUpdates, reportUpdates } from '../src/data/report-updates';

class Channel {
  static instances: Channel[] = [];
  onmessage: ((event: { data: unknown }) => void) | null = null;
  postMessage = vi.fn();
  close = vi.fn();
  constructor() { Channel.instances.push(this); }
}
let win: EventTarget;
let doc: EventTarget & { visibilityState: string };
const stores: ReportUpdates[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  win = new EventTarget();
  doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('BroadcastChannel', Channel);
  Channel.instances = [];
});
afterEach(() => {
  stores.splice(0).forEach(store => store.dispose());
  reportUpdates.dispose();
  reportCache.setUser(null);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const store = () => { const next = new ReportUpdates(); stores.push(next); return next; };

describe('live report updates', () => {
  it('uses one polling clock, pauses when hidden, and refreshes on return and reconnection', () => {
    const updates = store(), a = vi.fn(), b = vi.fn();
    const offA = updates.subscribe(a), offB = updates.subscribe(b);
    expect(vi.getTimerCount()).toBe(1);
    vi.advanceTimersByTime(REPORT_REFRESH_MS);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'hidden';
    vi.advanceTimersByTime(REPORT_REFRESH_MS * 2);
    win.dispatchEvent(new Event('focus'));
    expect(a).toHaveBeenCalledTimes(1);
    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    win.dispatchEvent(new Event('focus'));
    expect(a).toHaveBeenCalledTimes(2); // one request for a focus/visibility pair
    vi.advanceTimersByTime(1001);
    win.dispatchEvent(new Event('online'));
    expect(a).toHaveBeenCalledTimes(3);
    offA(); offB();
    expect(vi.getTimerCount()).toBe(0);
    win.dispatchEvent(new Event('focus'));
    expect(a).toHaveBeenCalledTimes(3);
  });

  it('invalidates and notifies another tab without rebroadcasting or transferring private data', async () => {
    const updates = store(), listener = vi.fn();
    updates.subscribe(listener);
    await reportCache.load('report', async () => ({ private: 'old' }));
    const channel = Channel.instances[0];
    channel.onmessage!({ data: 'changed' });
    expect(reportCache.peek('report')).toBeUndefined();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(channel.postMessage).not.toHaveBeenCalled();
    channel.onmessage!({ data: { unexpected: true } });
    expect(listener).toHaveBeenCalledTimes(1);
    updates.changed();
    expect(channel.postMessage).toHaveBeenCalledWith('changed');
  });

  it.each(['save-call', 'present-offer', 'complete-reminder', 'bonus-rule', 'product', 'clinical',
    'user', 'user-settings', 'remove-user', 'reset-user', 'password', 'user-password'])(
    'successful %s immediately refreshes mounted reports', async action => {
      const listener = vi.fn();
      reportUpdates.subscribe(listener);
      await reportCache.load('report', async () => 'before action');
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })));
      await requestJson('', { action });
      expect(reportCache.peek('report')).toBeUndefined();
      expect(listener).toHaveBeenCalledTimes(1);
      expect(Channel.instances[0].postMessage).toHaveBeenCalledWith('changed');
    },
  );

  it('does not announce failed actions or report reads as new activity', async () => {
    const listener = vi.fn(); reportUpdates.subscribe(listener);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 409, json: async () => ({ error: 'Conflict' }) })));
    await expect(requestJson('', { action: 'save-call' })).rejects.toThrow('Conflict');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ calls: [] }) })));
    await requestJson('?action=analytics');
    expect(listener).not.toHaveBeenCalled();
  });

  it('a mutation replaces an in-flight stale report before notifying subscribers', async () => {
    let finish!: (value: string) => void;
    const old = reportCache.load('report', () => new Promise<string>(resolve => { finish = resolve; }));
    const rejected = expect(old).rejects.toMatchObject({ name: 'AbortError' });
    await Promise.resolve();
    let fresh: Promise<string> | undefined;
    const updates = store();
    updates.subscribe(() => { fresh = reportCache.load('report', async () => 'after action'); });
    updates.changed();
    finish('before action');
    await rejected;
    expect(await fresh).toBe('after action');
    expect(reportCache.peek('report')).toBe('after action');
  });
});
