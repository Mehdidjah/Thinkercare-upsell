import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { failLoad, reportView, startLoad, type ReportState } from '../src/data/use-live-report';
import { ReportCache } from '../src/data/report-cache';
import { StaleNotice } from '../src/ui/ReportFreshness';

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
