import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { failLoad, nextLoad, reportRequest, reportView, startLoad, type LoadTrigger, type ReportState } from '../src/data/use-live-report';
import { ReportCache } from '../src/data/report-cache';
import { StaleNotice } from '../src/ui/ReportFreshness';

const { requestJson } = vi.hoisted(() => ({ requestJson: vi.fn(async () => ({ ok: true })) }));
vi.mock('../src/data/api', () => ({ requestJson }));
const source = (path: string) => readFileSync(new URL('../src/' + path, import.meta.url), 'utf8');

const empty: ReportState<number> = { key: null, loading: false, asked: false, error: '', updatedAt: '' };
const loaded: ReportState<number> = { key: 'k', data: 3, loading: false, asked: false, error: '', updatedAt: '2026-11-19T10:00:00.000Z' };

test('the 30 s refresh is silent; only a first load or a refresh the user asked for is busy (PN1)', () => {
  const background = startLoad(loaded, 'k', false);
  expect(background.data).toBe(3);
  expect(reportView(background)).toEqual({ busy: false, asked: false, refreshing: true, stale: false });
  expect(reportView(startLoad(loaded, 'k', true))).toMatchObject({ busy: true, asked: true, refreshing: true });
  expect(reportView(startLoad(empty, 'k', false))).toMatchObject({ busy: true, asked: false });
  // Another selection already in the cache opens at once, silently, with the time it was loaded.
  const cached = startLoad(loaded, 'other', false, 7, '2026-11-19T09:59:00.000Z');
  expect(cached).toMatchObject({ data: 7, updatedAt: '2026-11-19T09:59:00.000Z', error: '' });
  expect(reportView(cached).busy).toBe(false);
});

test('a failed refresh keeps the data and its time until a load succeeds (PN2)', () => {
  const failed = failLoad(startLoad(loaded, 'k', false), new Error('Réseau indisponible'));
  expect(failed).toMatchObject({ data: 3, error: 'Réseau indisponible', updatedAt: loaded.updatedAt, loading: false });
  expect(reportView(failed).stale).toBe(true);
  expect(startLoad(failed, 'k', false).error).toBe('Réseau indisponible');
  expect(startLoad(failed, 'other', false).error).toBe('');
  expect(failLoad(startLoad(loaded, 'k', false), { name: 'AbortError' }).error).toBe('');
  // Nothing loaded yet: an error, not stale data.
  expect(reportView(failLoad(startLoad(empty, 'k', false), new Error('x')))).toMatchObject({ busy: false, stale: false });
});

test('the cache tells when a reused report was loaded', async () => {
  const cache = new ReportCache();
  expect(cache.loadedAt('a')).toBeUndefined();
  const before = Date.now();
  await cache.load('a', async () => 1);
  expect(Date.parse(cache.loadedAt('a')!)).toBeGreaterThanOrEqual(before);
});

test('the stale notice gives the Alger time of the data shown', () => {
  const html = renderToStaticMarkup(<StaleNotice at="2026-11-19T13:05:00.000Z" onRetry={() => {}} />);
  expect(html).toContain('Données de 14:05 : actualisation impossible.');
  expect(html).toContain('role="status"');
  expect(html).toContain('>Réessayer</button>');
  expect(renderToStaticMarkup(<StaleNotice at="2026-11-19T13:05:00.000Z" compact />)).toMatch(/^<p class="report-stale report-stale--compact" role="status">/);
});

// What useLiveReport's effect sees: the key, the shared revision and the page's refreshKey; « Actualiser » records
// the revision it is about to produce as askedRevision.
const at = (key: string, revision: number, refreshKey = 0): LoadTrigger => ({ key, revision, refreshKey });
const step = (last: ReturnType<typeof nextLoad> | null, trigger: LoadTrigger, asked = -1) => nextLoad(last, trigger, asked);

test('a first load, another selection and a refreshKey bump are not background loads', () => {
  const first = step(null, at('analytics:a', 0));
  expect(first.background).toBe(false);
  expect(step(first, at('analytics:b', 0)).background).toBe(false);
  // Same report, but the revision moved while another selection was shown: still the user's navigation.
  expect(step(step(first, at('analytics:b', 0)), at('analytics:a', 3)).background).toBe(false);
  expect(step(first, at('analytics:a', 0, 1)).background).toBe(false);
});

test('« Actualiser » is not a background load; the 30 s, focus and cross-tab revisions are', () => {
  const first = step(null, at('k', 0));
  // refresh(): askedRevision = revision + 1, then the revision moves to it.
  const asked = step(first, at('k', 1), 1);
  expect(asked.background).toBe(false);
  const clock = step(asked, at('k', 2), 1);
  expect(clock.background).toBe(true);
  const focus = step(clock, at('k', 3), 1);
  expect(focus.background).toBe(true);
  // React replays the effect for the same trigger (development): the answer does not change.
  expect(step(focus, at('k', 3), 1)).toBe(focus);
  expect(step(asked, at('k', 1), 1).background).toBe(false);
});

test('every Pages loader forwards the background marker through reportRequest', async () => {
  const hook = source('data/use-live-report.ts');
  expect(hook).toContain('reportCache.load<T>(key, signal => load(signal, options), true)');
  expect(hook).toContain('const options: LoadOptions = { background: lastLoad.current.background };');
  expect(hook).toContain('if (key === null) { lastLoad.current = null; return; }');
  for (const path of ['ui/Analytics.tsx', 'ui/Commission.tsx', 'ui/pages/Reminders.tsx']) {
    const ui = source(path);
    expect(ui).not.toMatch(/requestJson\((?:'\?|query)/); // no report GET bypasses the wrapper
    expect(ui).not.toMatch(/useLiveReport<[^>]+>\([^,]+,(?:async ?)?signal=>/); // every loader takes (signal,o)
  }
  const signal = new AbortController().signal;
  await reportRequest('?action=reminders', signal, { background: true });
  // The wrapper forwards the marker; requestJson sends X-Desk-Background for background loads.
  expect(requestJson).toHaveBeenCalledWith('?action=reminders', undefined, signal, { background: true });
});
