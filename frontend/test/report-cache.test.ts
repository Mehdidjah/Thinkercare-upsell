import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReportCache, reportCache } from '../src/data/report-cache';
import { requestJson } from '../src/data/api';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); reportCache.setUser(null); });

describe('report navigation cache', () => {
  it('reuses a fresh report and deduplicates requests during navigation', async () => {
    const cache = new ReportCache();
    const load = vi.fn(async () => ({ count: 12 }));
    const a = cache.load('month=2026-11', load);
    const b = cache.load('month=2026-11', load);
    expect(a).toBe(b);
    expect(await a).toEqual({ count: 12 });
    expect(await cache.load('month=2026-11', load)).toEqual({ count: 12 });
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('expires reports and lets explicit refresh bypass a fresh value', async () => {
    vi.useFakeTimers();
    const cache = new ReportCache(30_000);
    const load = vi.fn(async () => 10);
    await cache.load('a', load);
    await cache.load('a', load, true);
    expect(load).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(30_001);
    expect(cache.peek('a')).toBeUndefined();
    await cache.load('a', load);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('keeps different periods separate and bounds retained selections', async () => {
    const cache = new ReportCache(30_000, 2);
    await cache.load('november', async () => 11);
    await cache.load('december', async () => 12);
    expect(cache.peek('november')).toBe(11);
    expect(cache.peek('december')).toBe(12);
    await cache.load('january', async () => 1);
    expect(cache.peek('november')).toBeUndefined();
  });

  it.each(['logout', 'account-change', 'mutation'])('%s discards in-flight results even if the loader ignores abort', async reason => {
    const cache = new ReportCache();
    cache.setUser('advisor-a');
    let resolve!: (value: string) => void;
    let signal!: AbortSignal;
    const pending = cache.load('report', s => { signal = s; return new Promise<string>(r => { resolve = r; }); });
    await Promise.resolve();
    if (reason === 'logout') cache.setUser(null);
    else if (reason === 'account-change') cache.setUser('advisor-b');
    else cache.clear();
    expect(signal.aborted).toBe(true);
    const next = await cache.load('report', async () => 'new data');
    resolve('old private data');
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(next).toBe('new data');
    expect(cache.peek('report')).toBe('new data');
  });

  it('does not cache failed or incomplete reports', async () => {
    const cache = new ReportCache();
    await expect(cache.load('report', async () => { throw new Error('second page failed'); })).rejects.toThrow('second page failed');
    expect(cache.peek('report')).toBeUndefined();
    expect(await cache.load('report', async () => ['complete'])).toEqual(['complete']);
  });

  it('successful writes invalidate reports without caching their response', async () => {
    reportCache.setUser('admin');
    await reportCache.load('report', async () => 'old');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })));
    await requestJson('', { action: 'save-call' });
    expect(reportCache.peek('report')).toBeUndefined();
  });

  it('an expired session clears cached reports', async () => {
    reportCache.setUser('advisor');
    await reportCache.load('report', async () => 'private');
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Expired' }) })));
    await expect(requestJson('?action=my-progress')).rejects.toMatchObject({ status: 401 });
    expect(reportCache.peek('report')).toBeUndefined();
  });
});
