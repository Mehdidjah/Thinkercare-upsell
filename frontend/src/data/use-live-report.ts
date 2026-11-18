import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { reportCache } from './report-cache';
import { reportUpdates } from './report-updates';

type Result<T> = { key: string | null; data?: T; busy: boolean; error: string; updatedAt: string };

/** Keep a complete snapshot visible while replacing it with a fresh, complete report. */
export function useLiveReport<T>(key: string | null, loader: (signal: AbortSignal) => Promise<T>, refreshKey = 0) {
  const revision = useSyncExternalStore(reportUpdates.subscribe, reportUpdates.getSnapshot, () => 0);
  const loadRef = useRef(loader);
  loadRef.current = loader;
  const [result, setResult] = useState<Result<T>>({ key: null, busy: false, error: '', updatedAt: '' });
  useEffect(() => {
    if (key === null) return;
    let active = true;
    const load = loadRef.current;
    const cached = reportCache.peek<T>(key);
    setResult(previous => ({
      key, data: cached ?? (previous.key === key ? previous.data : undefined), busy: true, error: '',
      updatedAt: previous.key === key ? previous.updatedAt : '',
    }));
    // Also revalidate on navigation; cached data makes opening a tab immediate.
    reportCache.load<T>(key, load, true).then(data => {
      if (active) setResult({ key, data, busy: false, error: '', updatedAt: new Date().toISOString() });
    }).catch(error => {
      if (active) setResult(previous => ({ ...previous, busy: false,
        error: error.name === 'AbortError' ? '' : error.message || 'Actualisation impossible.' }));
    });
    return () => { active = false; };
  }, [key, revision, refreshKey]);
  const current = result.key === key ? result : { data: undefined, error: '', busy: key !== null, updatedAt: '' };
  return { ...current, refresh: reportUpdates.refresh };
}
