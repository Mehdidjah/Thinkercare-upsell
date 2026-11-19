import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { requestJson } from './api';
import { reportCache } from './report-cache';
import { reportUpdates } from './report-updates';

/** What a loader is told about its load: `background` for the silent 30 s, focus, online and cross-tab refreshes. */
export type LoadOptions = { background: boolean };
export type ReportLoader<T> = (signal: AbortSignal, options: LoadOptions) => Promise<T>;

/** GET one report from a live-report loader, forwarding the background marker (every Pages loader goes through here). */
export function reportRequest(query: string, signal: AbortSignal, options: LoadOptions): Promise<any> {
  // integrator: pass o to requestJson once its 4th parameter exists: return requestJson(query, undefined, signal, options);
  void options;
  return requestJson(query, undefined, signal);
}

/** The inputs that started a load. */
export type LoadTrigger = { key: string; revision: number; refreshKey: number };

/**
 * Whether a load is a background refresh: the same report as the last load (same key and `refreshKey`), started
 * because the revision moved (30 s clock, focus, online, another tab, a save) without the user asking. A first
 * load, another selection, a `refreshKey` bump and « Actualiser » are not. Replaying the same trigger (React runs
 * an effect twice in development) keeps the first answer.
 */
export function nextLoad(last: { trigger: LoadTrigger; background: boolean } | null, trigger: LoadTrigger, askedRevision: number) {
  const previous = last?.trigger;
  if (previous && previous.key === trigger.key && previous.revision === trigger.revision && previous.refreshKey === trigger.refreshKey) return last!;
  const background = !!previous && previous.key === trigger.key && previous.refreshKey === trigger.refreshKey && askedRevision !== trigger.revision;
  return { trigger, background };
}

export type ReportState<T> = { key: string | null; data?: T; loading: boolean; asked: boolean; error: string; updatedAt: string };

/** A load starts: keep what is on screen for the same report (or a cached copy), remember whether the user asked. */
export function startLoad<T>(previous: ReportState<T>, key: string, asked: boolean, cached?: T, cachedAt = ''): ReportState<T> {
  const same = previous.key === key;
  return {
    key, data: cached ?? (same ? previous.data : undefined), loading: true, asked,
    // A failure stays on screen through the next silent attempt, until a load succeeds.
    error: same ? previous.error : '',
    updatedAt: cached !== undefined ? cachedAt : same ? previous.updatedAt : '',
  };
}

/** A load fails: the data and its time stay; an abort (logout, a newer load) is not a failure. */
export function failLoad<T>(previous: ReportState<T>, error: { name?: string; message?: string }): ReportState<T> {
  return { ...previous, loading: false, asked: false,
    error: error.name === 'AbortError' ? previous.error : error.message || 'Actualisation impossible.' };
}

/**
 * What a page shows (PN1, PN2):
 * - `busy`: what the user waits for: no data yet for this selection, or a refresh they asked for.
 * - `asked`: a refresh the user asked for is running (spinner on « Actualiser »).
 * - `refreshing`: any load in flight, including the silent 30 s, focus and cross-tab refreshes; nothing on
 *   screen moves, disables or is announced for those.
 * - `stale`: the last refresh failed while data is still shown; `updatedAt` is when that data was loaded.
 */
export function reportView<T>(state: Pick<ReportState<T>, 'data' | 'loading' | 'asked' | 'error'>) {
  return {
    busy: state.loading && (state.asked || state.data === undefined),
    asked: state.loading && state.asked,
    refreshing: state.loading,
    stale: !!state.error && state.data !== undefined,
  };
}

/** Keep a complete snapshot visible while replacing it with a fresh, complete report. */
export function useLiveReport<T>(key: string | null, loader: ReportLoader<T>, refreshKey = 0) {
  const revision = useSyncExternalStore(reportUpdates.subscribe, reportUpdates.getSnapshot, () => 0);
  const loadRef = useRef(loader);
  loadRef.current = loader;
  // The revision a user click produced: idempotent if the effect runs twice for it.
  const askedRevision = useRef(-1);
  const lastLoad = useRef<ReturnType<typeof nextLoad> | null>(null);
  const [result, setResult] = useState<ReportState<T>>({ key: null, loading: false, asked: false, error: '', updatedAt: '' });
  useEffect(() => {
    // A report that comes back after being switched off (another Pilotage view) is opened, not refreshed.
    if (key === null) { lastLoad.current = null; return; }
    let active = true;
    const load = loadRef.current;
    lastLoad.current = nextLoad(lastLoad.current, { key, revision, refreshKey }, askedRevision.current);
    const options: LoadOptions = { background: lastLoad.current.background };
    const cached = reportCache.peek<T>(key);
    setResult(previous => startLoad(previous, key, askedRevision.current === revision, cached, reportCache.loadedAt(key)));
    // Also revalidate on navigation; cached data makes opening a tab immediate.
    reportCache.load<T>(key, signal => load(signal, options), true).then(data => {
      if (active) setResult({ key, data, loading: false, asked: false, error: '', updatedAt: new Date().toISOString() });
    }).catch(error => {
      if (active) setResult(previous => failLoad(previous, error));
    });
    return () => { active = false; };
  }, [key, revision, refreshKey]);
  /** A refresh the user asked for: `busy` and `asked` until it settles. */
  const refresh = useCallback(() => {
    askedRevision.current = reportUpdates.getSnapshot() + 1;
    reportUpdates.refresh();
  }, []);
  const current = result.key === key ? result : { data: undefined, error: '', loading: key !== null, asked: false, updatedAt: '' };
  return { data: current.data, error: current.error, updatedAt: current.updatedAt, ...reportView(current), refresh };
}
