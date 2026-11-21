import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { bonusEstimate, type BonusRule } from '@touche/domain';

// The reports as the API answers them: the views render their figures without a network.
const { reports } = vi.hoisted(() => ({ reports: new Map<string, unknown>() }));
vi.mock('../src/data/use-live-report', () => ({
  useLiveReport: (key: string | null) => ({
    data: key ? reports.get(new URLSearchParams(key).get('action') ?? '') : undefined,
    error: '', updatedAt: '2026-11-21T09:00:00Z', busy: false, asked: false, refreshing: false, stale: false, refresh: () => {},
  }),
  reportRequest: () => Promise.resolve(null),
}));
vi.mock('../src/ui/shell/Notifications', () => ({ useNotify: () => ({ notify: () => {}, announce: () => {} }) }));
vi.mock('../src/ui/shared/Confirm', () => ({ useConfirm: () => async () => true }));

import { MyUpsells, PersonalProgress, ProgressCard, myUpsellsView, type MyUpsell } from '../src/ui/Commission';

const text = (html: string) => html.replace(/<[^>]+>/g, '');
const ui = (path: string) => readFileSync(new URL('../src/ui/' + path, import.meta.url), 'utf8');
const css = () => readFileSync(new URL('../src/styles/pilotage.css', import.meta.url), 'utf8');
/** The rows of a table: [row header, cell texts…]. */
const rows = (html: string) => [...html.matchAll(/<tr><th scope="row">([^<]+)<\/th>((?:<td[^>]*>.*?<\/td>)+)<\/tr>/g)].map(m => [m[1], ...[...m[2].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(c => text(c[1]))]);
/** « Par marque » inside the progress card. */
const brandTable = (html: string) => { const at = html.indexOf('class="pilot-progress__brands"'); return at < 0 ? '' : html.slice(at, html.indexOf('</table>', at) + 8); };

const rule: BonusRule = { effectiveMonth: '2026-11', threshold: 60, rateDzd: 45, mode: 'all_month', version: 1 };
const both = ['touche', 'belnco'] as const;
/** Lina's November: 30 sold (Touché 21, BEL.NCO 9) by state of their order, 25 delivered this month (Touché 18, BEL.NCO 7). */
const progress = (over: Record<string, unknown> = {}) => ({
  month: '2026-11', today: '2026-11-21', basis: 'delivered' as const, user: { id: 'u1', label: 'Lina' }, rule, progress: bonusEstimate(25, rule), todayUpsells: 2, daily: [],
  sold: 30, stateCounts: { delivered: 12, shipping: 9, pending: 0, failed: 3, unknown: 6 },
  stateCountsByBrand: { touche: { delivered: 9, shipping: 6, pending: 0, failed: 2, unknown: 4 }, belnco: { delivered: 3, shipping: 3, pending: 0, failed: 1, unknown: 2 } },
  soldByBrand: { touche: 21, belnco: 9 }, deliveredByBrand: { touche: 18, belnco: 7 },
  withoutReference: 0, duplicateExcluded: 0, updatedAt: '2026-11-21T09:00:00Z', ...over,
});
const upsell = (over: Partial<MyUpsell> = {}): MyUpsell => ({
  id: 'c-' + Math.random().toString(36).slice(2), created_at: '2026-11-05T10:00:00.000Z', order_ref: 'TOU8000001', brand: 'touche', outcome: 'duo',
  units: 1, extra: 1200, order_state_group: 'delivered', order_state_name: 'Livrée', delivered_at: '2026-11-08T10:00:00.000Z', counts: true, ...over,
});

test('« Par marque » on « Ma progression »: Touché, BEL.NCO and Total for her month’s sales by state of their order, then the prime’s count; the totals are the card’s', () => {
  const html = renderToStaticMarkup(<ProgressCard data={progress()} />);
  const table = brandTable(html);
  expect(table).toContain('<h3 id="pilot-progress-brands">Par marque</h3>');
  expect(table).toContain('<thead><tr><th scope="col">Upsells</th><th scope="col" class="num">Touché</th><th scope="col" class="num">BEL.NCO</th><th scope="col" class="num">Total</th></tr></thead>');
  expect(rows(table)).toEqual([
    ['Vendus ce mois', '21', '9', '30'],
    ['dont déjà livrés', '9', '3', '12'],
    ['En cours de livraison', '6', '3', '9'],
    ['Pas encore expédiés', '0', '0', '0'],
    ['Non livrés', '2', '1', '3'],
    ['À vérifier', '4', '2', '6'],
    ['Livrés ce mois (prime)', '18', '7', '25'],
  ]);
  // The prime's count is the table's footer, apart from the sales and their states.
  expect(table).toMatch(/<tfoot><tr><th scope="row">Livrés ce mois \(prime\)<\/th>/);
  expect(text(table)).toContain('La dernière ligne compte les upsells livrés ce mois, quel que soit le mois de la vente : c’est le compte de la prime.');
  // Under the progress figures, before the card's foot: the card still reads as before.
  expect(html.indexOf('pilot-progress__brands')).toBeGreaterThan(html.indexOf('pilot-progress__estimate'));
  expect(html.indexOf('pilot-progress__brands')).toBeLessThan(html.indexOf('pilot-progress__foot'));
  expect(text(html)).toContain('Upsells livrés ce mois : 25 / 60 (Touché 18 · BEL.NCO 7)');
  expect(text(html)).toContain('30 vendus ce mois (Touché 21 · BEL.NCO 9) · dont 12 déjà livrés · 9 en cours · 3 non livrés · 6 à vérifier');
});

test('« Par marque »: « dans le mois » for a closed month; a month paid on sales counts its sales for the prime, in its first row', () => {
  const closed = rows(brandTable(renderToStaticMarkup(<ProgressCard data={progress({ today: '2026-12-05' })} />)));
  expect(closed[0]).toEqual(['Vendus dans le mois', '21', '9', '30']);
  expect(closed[6]).toEqual(['Livrés dans le mois (prime)', '18', '7', '25']);
  const sold = renderToStaticMarkup(<ProgressCard data={progress({ month: '2026-10', basis: 'sold', progress: bonusEstimate(30, rule), deliveredByBrand: null })} />);
  expect(rows(brandTable(sold)).map(r => r[0])).toEqual(['Vendus dans le mois (prime)', 'dont déjà livrés', 'En cours de livraison', 'Pas encore expédiés', 'Non livrés', 'À vérifier']);
  expect(rows(brandTable(sold))[0]).toEqual(['Vendus dans le mois (prime)', '21', '9', '30']);
  expect(brandTable(sold)).not.toContain('<tfoot>');
  expect(text(brandTable(sold))).toContain('Pour ce mois, la prime comptait les ventes.');
});

test('« Par marque » always shows on « Ma progression » when the API sends the split, a brand at 0 included, whatever the desk sells; never on the call strip, nor without the split', () => {
  const none = { touche: { delivered: 9, shipping: 6, pending: 0, failed: 2, unknown: 4 }, belnco: { delivered: 0, shipping: 0, pending: 0, failed: 0, unknown: 0 } };
  const touche = { sold: 21, stateCounts: none.touche, soldByBrand: { touche: 21, belnco: 0 }, progress: bonusEstimate(18, rule), deliveredByBrand: { touche: 18, belnco: 0 }, stateCountsByBrand: none };
  const card = (data: ReturnType<typeof progress>, compact = false) => brandTable(renderToStaticMarkup(<ProgressCard data={data} compact={compact} />));
  // 2026-11-21, the owner: her figures by brand always show, BEL.NCO at 0 when she sold Touché only.
  expect(rows(card(progress(touche)))).toEqual([['Vendus ce mois', '21', '0', '21'], ['dont déjà livrés', '9', '0', '9'], ['En cours de livraison', '6', '0', '6'], ['Pas encore expédiés', '0', '0', '0'], ['Non livrés', '2', '0', '2'], ['À vérifier', '4', '0', '4'], ['Livrés ce mois (prime)', '18', '0', '18']]);
  expect(card(progress())).toContain('Par marque');
  // Nothing sold or delivered this month: every row shows, at 0.
  const zero = { delivered: 0, shipping: 0, pending: 0, failed: 0, unknown: 0 };
  expect(rows(card(progress({ sold: 0, stateCounts: zero, stateCountsByBrand: { touche: zero, belnco: zero }, soldByBrand: { touche: 0, belnco: 0 }, deliveredByBrand: { touche: 0, belnco: 0 }, progress: bonusEstimate(0, rule) }))).map(r => r.slice(1))).toEqual(Array(7).fill(['0', '0', '0']));
  // The full page as App renders it, for a desk selling Touché only or both brands, or naming none.
  reports.set('my-progress', progress({ ...touche, upsells: [upsell()], upsellsTotal: 1 }));
  reports.set('reminders', { reminders: [] });
  for (const brands of [['touche'], [...both], undefined] as ('touche' | 'belnco')[][]) {
    expect(renderToStaticMarkup(<PersonalProgress brands={brands} />), String(brands)).toContain('<h3 id="pilot-progress-brands">Par marque</h3>');
    expect(renderToStaticMarkup(<PersonalProgress compact brands={brands} />), String(brands)).not.toContain('Par marque');
  }
  // The call strip, or an API without the split by state: none.
  expect(card(progress(), true)).toBe('');
  expect(card(progress({ stateCountsByBrand: undefined }))).toBe('');
  expect(card(progress({ soldByBrand: undefined }))).toBe('');
});

test('« Ma progression »: « Par marque » sits in the progress card, so « Mes rappels » still comes right after it; the call strip has none; App gives the desk’s brands', () => {
  reports.set('my-progress', progress({ upsells: [upsell()], upsellsTotal: 1 }));
  reports.set('reminders', { reminders: [] });
  const html = renderToStaticMarkup(<PersonalProgress brands={[...both]} />);
  const card = html.indexOf('pilot-progress__count'), table = html.indexOf('pilot-progress__brands'), reminders = html.indexOf('>Mes rappels</h2>');
  expect(table).toBeGreaterThan(card);
  expect(reminders).toBeGreaterThan(table);
  // Only « Mes rappels »' own section starts between them.
  expect(html.slice(table, reminders).match(/<section/g)).toHaveLength(1);
  expect(renderToStaticMarkup(<PersonalProgress compact brands={[...both]} />)).not.toContain('Par marque');
  expect(ui('App.tsx')).toContain('<PersonalProgress refreshKey={progressEpoch} resume={resume} features={state.features} brands={brands}/>');
});

test('« Par marque » reads at 1366px and on a phone: a text-wide table, tighter cells, no 36rem floor (it fits its frame, and may still scroll inside it); the state rows sit under « Vendus »', () => {
  expect(css()).toMatch(/\.pilot-progress__brands \{[^}]*max-inline-size: var\(--measure-text\);/);
  expect(css()).toMatch(/\.pilot-progress__brands \.data-table table \{ min-inline-size: 0; \}/);
  expect(css()).toMatch(/\.pilot-progress__brands :is\(th, td\) \{ padding-inline: var\(--space-3\); \}/);
  expect(css()).toMatch(/\.pilot-progress__brands tbody tr:not\(:first-child\) > th \{[^}]*padding-inline-start: var\(--space-6\);[^}]*font-weight: var\(--font-weight-regular\);/);
});

// ——— « Mes upsells »: the « Marque » switch
const list = () => [
  upsell({ id: 'a', created_at: '2026-11-12T10:00:00.000Z', order_ref: 'TOU8000001' }),
  upsell({ id: 'b', created_at: '2026-11-11T10:00:00.000Z', order_ref: 'BEL8300001', brand: 'belnco' }),
  upsell({ id: 'c', created_at: '2026-11-10T10:00:00.000Z', order_ref: 'TOU8000002' }),
];

test('« Mes upsells » filtered by brand: the brand’s rows only, a count line and an empty state of that brand; all brands by default, as before', () => {
  const data = { upsells: list(), upsellsTotal: 3 };
  expect(myUpsellsView(data, '')).toEqual({ list: data.upsells, count: '', empty: 'Aucun upsell vendu ou livré sur ce mois.' });
  expect(myUpsellsView(data, 'touche')).toEqual({ list: [data.upsells[0], data.upsells[2]], count: '2 ventes Touché, sur 3 au total.', empty: 'Aucun upsell Touché vendu ou livré sur ce mois.' });
  expect(myUpsellsView(data, 'belnco')).toMatchObject({ list: [data.upsells[1]], count: '1 vente BEL.NCO, sur 3 au total.' });
  expect(myUpsellsView({ upsells: [data.upsells[0]], upsellsTotal: 1 }, 'belnco')).toEqual({ list: [], count: '', empty: 'Aucun upsell BEL.NCO vendu ou livré sur ce mois.' });
  // Beyond the 300 listed, the line says so; a brand absent from them is absent « parmi les plus récents ».
  expect(myUpsellsView({ upsells: list(), upsellsTotal: 301 }, '').count).toBe('Les 3 upsells les plus récents sont affichés, sur 301.');
  expect(myUpsellsView({ upsells: list(), upsellsTotal: 301 }, 'belnco')).toMatchObject({ count: '1 vente BEL.NCO parmi les 3 plus récentes, sur 301 au total.' });
  expect(myUpsellsView({ upsells: [data.upsells[0]], upsellsTotal: 301 }, 'belnco').empty).toBe('Aucun upsell BEL.NCO parmi les 1 plus récents.');
  // An older API without the list.
  expect(myUpsellsView({}, 'touche')).toMatchObject({ list: [], empty: 'Aucun upsell Touché vendu ou livré sur ce mois.' });
});

test('« Mes upsells » has the « Marque » switch of Pilotage, « Toutes les marques » by default, with both brands; all her upsells are listed', () => {
  const html = renderToStaticMarkup(<MyUpsells data={progress({ upsells: list(), upsellsTotal: 3 })} brands={[...both]} />);
  expect(html).toContain('<div class="pilot-brand"><span class="pilot-brand__label">Marque</span><div class="seg" role="group" aria-label="Marque"><button type="button" class="seg__item" aria-pressed="true">Toutes les marques</button><button type="button" class="seg__item" aria-pressed="false">Touché</button><button type="button" class="seg__item" aria-pressed="false">BEL.NCO</button></div></div>');
  // The switch sits in the section's head, by the title.
  expect(html.indexOf('aria-label="Marque"')).toBeGreaterThan(html.indexOf('>Mes upsells</h2>'));
  expect(html.indexOf('aria-label="Marque"')).toBeLessThan(html.indexOf('<table'));
  for (const ref of ['TOU8000001', 'BEL8300001', 'TOU8000002']) expect(html).toContain(ref);
  expect(html).toContain('<caption class="sr-only">Mes upsells, novembre 2026</caption>');
  expect(html).not.toContain('class="footnote"');
  // One brand only: no switch.
  expect(renderToStaticMarkup(<MyUpsells data={progress({ upsells: [list()[0]], upsellsTotal: 1, soldByBrand: { touche: 1, belnco: 0 }, deliveredByBrand: { touche: 1, belnco: 0 } })} brands={['touche']} />)).not.toContain('aria-label="Marque"');
  // No DOM library here: the source shows each button filters the list on the client.
  expect(ui('Commission.tsx')).toContain('onClick={()=>setBrand(b)}');
  expect(ui('Commission.tsx')).toContain('v=myUpsellsView(data,split?brand:\'\')');
});

test('« Voir mes rappels » on the call opens « Ma progression » straight on « Mes rappels », after the view change', () => {
  const src = readFileSync(new URL('../src/ui/Commission.tsx', import.meta.url), 'utf8');
  expect(src).toContain('onClick={openReminders}>Voir mes rappels</button>');
  // App scrolls to the top and focuses the page title one frame after a view change: reveal the reminders after that.
  expect(src).toMatch(/function openReminders\(\)\{openView\('progress'\);[^}]*getElementById\('my-reminders-title'\)[^}]*n>=3[^}]*reveal\(h,'start'\)/);
});
