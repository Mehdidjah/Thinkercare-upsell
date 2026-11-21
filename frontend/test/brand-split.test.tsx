import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { bonusEstimate, money, type ActivityCall, type BonusRule } from '@touche/domain';

// The reports as the API answers them: the views render their figures without a network.
const { reports } = vi.hoisted(() => ({ reports: new Map<string, unknown>() }));
vi.mock('../src/data/use-live-report', () => ({
  useLiveReport: (key: string | null) => ({
    data: key ? reports.get(key.startsWith('analytics:') ? 'analytics' : new URLSearchParams(key).get('action') ?? '') : undefined,
    error: '', updatedAt: '2026-11-21T09:00:00Z', busy: false, asked: false, refreshing: false, stale: false, refresh: () => {},
  }),
  reportRequest: () => Promise.resolve(null),
}));
vi.mock('../src/ui/shell/Notifications', () => ({ useNotify: () => ({ notify: () => {}, announce: () => {} }) }));
vi.mock('../src/ui/shared/Confirm', () => ({ useConfirm: () => async () => true }));

import Analytics, { BrandCard } from '../src/ui/Analytics';
import { ContributionDashboard, ProgressCard, apportsCells } from '../src/ui/Commission';

const text = (html: string) => html.replace(/<[^>]+>/g, '');
const ui = (path: string) => readFileSync(new URL('../src/ui/' + path, import.meta.url), 'utf8');

// ——— Pilotage « Par marque »
let n = 0;
const call = (over: Partial<ActivityCall> = {}, ref = ''): ActivityCall => {
  const id = 'c' + ++n;
  return {
    id, user_id: 'u1', operator: 'Lina', created_at: new Date().toISOString(), outcome: 'duo', base_id: 'antiacne', products: [], catalogue_total: 3300,
    base_total: 1800, offered_total: 3000, extra: 1200, delivery: null, tier: 'duo', pilot: 1, refusal: '', meta: { version: 3, eligible: true, orderRef: ref },
    proposals: [{ id: 'p' + id, call_id: id, user_id: 'u1', created_at: '2026-11-13T10:00:00.000Z', base: { id: 'antiacne', name: 'Anti-Acné', price: 1800 }, products: [], catalogueTotal: 3300, offerTotal: 3000, extra: 1200, tier: 'duo', delivery: null, version: 3 }],
    voided_at: null, ...over,
  };
};
const calls = () => [
  call({ order_state_group: 'delivered', extra: 1200 }, 'TOU1'),
  call({ outcome: 'trio', order_state_group: 'failed', extra: 900, brand: 'touche' }, 'TOU2'),
  call({ outcome: 'refused', extra: 0 }, 'TOU3'),
  call({ order_state_group: 'delivered', extra: 1500, brand: 'belnco' }, 'BEL1'),
];
/** Each body row of the « Par marque » table: its label, then the Touché, BEL.NCO and Total cells. */
const rows = (html: string) => [...html.matchAll(/<tr><th scope="row">([^<]+)<\/th>((?:<td[^>]*>.*?<\/td>)+)<\/tr>/g)].map(m => [m[1], ...[...m[2].matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(c => text(c[1]))]);

test('« Par marque »: one row per figure, Touché, BEL.NCO and Total side by side, with the KPIs’ and the delivery card’s definitions', () => {
  const html = renderToStaticMarkup(<BrandCard calls={calls()} delivery />);
  expect(html).toContain('<h2 id="pilot-brands-title">Par marque</h2>');
  expect(text(html)).toContain('Touché et BEL.NCO côte à côte, sur la période et les autres filtres : le filtre « Marque » ne s’applique pas à ce tableau. Résultats annulés exclus.');
  expect(html).toMatch(/<thead><tr><th scope="col">Indicateur<\/th><th scope="col" class="num">Touché<\/th><th scope="col" class="num">BEL\.NCO<\/th><th scope="col" class="num">Total<\/th><\/tr><\/thead>/);
  expect(rows(html)).toEqual([
    ['Appels clôturés', '3', '1', '4'],
    ['Commandes (dossiers distincts)', '3', '1', '4'],
    ['Upsells acceptés', '2', '1', '3'],
    ['Supplément accepté', money(2100), money(1500), money(3600)],
    ['Taux d’acceptation', '66,7 %', '100,0 %', '75,0 %'],
    ['Upsells livrés', '1', '1', '2'],
    ['Supplément livré', money(1200), money(1500), money(2700)],
    ['Non livrés', '1', '0', '1'],
    ['Supplément non livré', money(900), money(0), money(900)],
    ['Taux de livraison', '50 %', '100 %', '67 %'],
  ]);
});

test('« Par marque »: shown when only one brand has calls, the other at 0; the delivery rows only when the delivery card shows; an empty state without calls', () => {
  const touche = rows(renderToStaticMarkup(<BrandCard calls={calls().slice(0, 3)} delivery />));
  expect(touche[0]).toEqual(['Appels clôturés', '3', '0', '3']);
  expect(touche[4]).toEqual(['Taux d’acceptation', '66,7 %', 'Non mesuré', '66,7 %']);
  expect(touche[9]).toEqual(['Taux de livraison', '50 %', '—', '50 %']);
  expect(rows(renderToStaticMarkup(<BrandCard calls={calls()} delivery={false} />)).map(r => r[0])).toEqual(['Appels clôturés', 'Commandes (dossiers distincts)', 'Upsells acceptés', 'Supplément accepté', 'Taux d’acceptation']);
  const empty = renderToStaticMarkup(<BrandCard calls={[]} delivery />);
  expect(empty).toContain('>Par marque</h2>');
  expect(empty).toContain('Aucune donnée sur cette sélection.');
  expect(empty).not.toContain('<table');
});

test('Pilotage’s overview shows « Par marque » under « Livraison des upsells », without the voided calls; the KPIs are unchanged', () => {
  reports.set('analytics', [...calls(), call({ order_state_group: 'delivered', extra: 5000, brand: 'belnco', voided_at: '2026-11-20T10:00:00Z' }, 'BEL9')]);
  const html = renderToStaticMarkup(<Analytics user={{ id: 'a', label: 'Direction', role: 'admin', username: 'direction' }} users={[]} products={[]} resume={() => {}} features={['order-check', 'void-call']} />);
  const delivery = html.indexOf('>Livraison des upsells</h2>'), brands = html.indexOf('>Par marque</h2>'), daily = html.indexOf('>La dynamique quotidienne</h2>');
  expect(delivery).toBeGreaterThan(-1);
  expect(brands).toBeGreaterThan(delivery);
  expect(daily).toBeGreaterThan(brands);
  expect(rows(html.slice(brands))[0]).toEqual(['Appels clôturés', '3', '1', '4']);
  expect(html).toMatch(/Appels clôturés<\/span><strong[^>]*>4</);
  // The table compares the brands: every filter applies to it except « Marque ».
  const src = ui('Analytics.tsx');
  expect(src).toMatch(/const keep=\(c:ActivityCall,skip\?:'day'\|'objection'\|'brand'\)=>[^\n]*&&\(skip==='brand'\|\|brandMatch\(c,brand\)\);/);
  expect(src).toMatch(/const brandPool=useMemo\(\(\)=>countedCalls\(rows\.filter\(c=>keep\(c,'brand'\)\)\),\[rows,operator,team,base,addon,stage,outcome,orderState,selectedDay,q,objection\]\);/);
});

// ——— « Apports & primes »
const rule: BonusRule = { effectiveMonth: '2026-11', threshold: 60, rateDzd: 45, mode: 'all_month', version: 1 };
const totals = (upsells: number, touche: number, belnco: number) => ({ calls: 4, confirmations: 3, upsells, upsellsByBrand: { touche, belnco }, initialDzd: 5400, confirmedDzd: 9000, upliftDzd: 3600, withoutRef: 0, duplicates: 0 });
const person = (id: string, label: string, sold: [number, number], delivered: [number, number] | null) => ({
  id, label, role: 'advisor', active: 1, team: '', period: totals(sold[0] + sold[1], sold[0], sold[1]),
  monthly: { ...totals(sold[0] + sold[1], sold[0], sold[1]), delivered: delivered && delivered[0] + delivered[1], deliveredByBrand: delivered && { touche: delivered[0], belnco: delivered[1] }, bonus: bonusEstimate(delivered ? delivered[0] + delivered[1] : sold[0] + sold[1], rule) },
  daily: [],
});
const november = () => ({ month: '2026-11', from: '2026-11-01', to: '2026-11-21', today: '2026-11-21', basis: 'delivered', rule, monthRuleVersion: 1, updatedAt: '2026-11-21T09:00:00Z', people: [person('u1', 'Lina', [9, 3], [6, 2]), person('u2', 'Sara', [0, 4], [0, 1]), person('u3', 'Nour', [0, 0], [0, 0])] });
const cell = (html: string, from: string) => text(html.slice(html.indexOf(from), html.indexOf('</tr>', html.indexOf(from))));

test('« Apports & primes »: under each month’s count, its split by brand; a team row adds them up', () => {
  reports.set('contributions', november());
  const html = renderToStaticMarkup(<ContributionDashboard openOperator={() => {}} />);
  expect(cell(html, '1. Lina')).toContain('12Touché 9 · BEL.NCO 3');
  expect(cell(html, '1. Lina')).toContain('8 / 6052 restant(s)Touché 6 · BEL.NCO 2');
  expect(cell(html, '3. Sara')).toContain('4Touché 0 · BEL.NCO 4');
  expect(cell(html, '3. Sara')).toContain('1 / 6059 restant(s)Touché 0 · BEL.NCO 1');
  // Nothing sold or delivered: no split under the zeros.
  expect(cell(html, '2. Nour')).not.toContain('Touché');
  expect(html).toContain('<tfoot>');
  const team = cell(html, 'Total de la sélection');
  expect(team).toContain('Total de la sélection3 comptes');
  expect(team).toContain('16Touché 9 · BEL.NCO 7');
  expect(team).toContain('9Touché 6 · BEL.NCO 3');
});

test('« Apports & primes » for a month paid on sales: the sold split only; an API without the split shows none', () => {
  reports.set('contributions', { ...november(), month: '2026-10', basis: 'sold', people: [person('u1', 'Lina', [9, 3], null)] });
  const html = renderToStaticMarkup(<ContributionDashboard openOperator={() => {}} />);
  expect(cell(html, '1. Lina')).toContain('12 / 6048 restant(s)Touché 9 · BEL.NCO 3—');
  expect(cell(html, 'Total de la sélection')).toContain('12Touché 9 · BEL.NCO 3—');
  const old = november();
  for (const p of old.people as Array<{ monthly: Record<string, unknown> }>) { delete p.monthly.upsellsByBrand; delete p.monthly.deliveredByBrand; }
  reports.set('contributions', old);
  expect(text(renderToStaticMarkup(<ContributionDashboard openOperator={() => {}} />))).not.toContain('Touché');
});

test('« Apports & primes » CSV: sold and delivered per brand next to their totals, empty delivered cells on a month paid on sales', () => {
  const header = ['Période du', 'Période au', 'Mois prime', 'Compte', 'Rôle', 'Équipe', 'Confirmations dédupliquées', 'Initial confirmé DA', 'Supplément confirmé DA', 'Total confirmé DA', 'Upsells vendus période', 'Upsells vendus mois', 'Upsells vendus mois Touché', 'Upsells vendus mois BEL.NCO', 'Upsells livrés mois', 'Upsells livrés mois Touché', 'Upsells livrés mois BEL.NCO', 'Prime estimée DA', 'Règle', 'Sans référence mois'];
  const o = { from: '2026-11-01', to: '2026-11-21', month: '2026-11', rule, done: 'livré' };
  const [head, lina] = apportsCells([person('u1', 'Lina', [9, 3], [6, 2])], o);
  expect(head).toEqual(header);
  expect(lina).toEqual(['2026-11-01', '2026-11-21', '2026-11', 'Lina', 'Call center', '', 3, 5400, 3600, 9000, 12, 12, 9, 3, 8, 6, 2, 0, 'Tous les upsells livrés du mois dès 60 atteints', 0]);
  const [, sold] = apportsCells([person('u1', 'Lina', [9, 3], null)], { ...o, month: '2026-10', done: 'vendu' });
  expect(sold.slice(11, 17)).toEqual([12, 9, 3, '', '', '']);
});

// ——— « Ma progression »
const progress = (over: Record<string, unknown> = {}) => ({
  month: '2026-11', today: '2026-11-21', basis: 'delivered' as const, user: { id: 'u1', label: 'Lina' }, rule, progress: bonusEstimate(12, rule), todayUpsells: 2, daily: [],
  sold: 30, stateCounts: { delivered: 12, shipping: 9, pending: 0, failed: 3, unknown: 6 }, soldByBrand: { touche: 21, belnco: 9 }, deliveredByBrand: { touche: 9, belnco: 3 },
  withoutReference: 0, duplicateExcluded: 0, updatedAt: '2026-11-21T09:00:00Z', ...over,
});

test('« Ma progression »: with sales in both brands, the sales lines split the prime’s count and the month’s sales by brand', () => {
  const html = renderToStaticMarkup(<ProgressCard data={progress()} />);
  expect(html).toContain('<p class="pilot-progress__sold">12 livrés ce mois (Touché 9 · BEL.NCO 3) · 30 vendus (Touché 21 · BEL.NCO 9)</p>');
  expect(text(renderToStaticMarkup(<ProgressCard data={progress({ month: '2026-10' })} />))).toContain('12 livrés dans le mois (Touché 9 · BEL.NCO 3) · 30 vendus (Touché 21 · BEL.NCO 9)');
  // Her sales in one brand, a delivery of the other one (sold last month): still both brands.
  expect(text(renderToStaticMarkup(<ProgressCard data={progress({ soldByBrand: { touche: 30, belnco: 0 } })} />))).toContain('12 livrés ce mois (Touché 9 · BEL.NCO 3) · 30 vendus (Touché 30 · BEL.NCO 0)');
  // A month paid on sales: the count is the sales.
  const sold = text(renderToStaticMarkup(<ProgressCard data={progress({ month: '2026-10', basis: 'sold', progress: bonusEstimate(30, rule), deliveredByBrand: null })} />));
  expect(sold).toContain('30 vendus dans le mois (Touché 21 · BEL.NCO 9)');
  expect(sold).not.toContain('livrés dans le mois (');
});

test('« Ma progression »: one brand only, or an API without the split, adds no line', () => {
  for (const over of [{ soldByBrand: { touche: 30, belnco: 0 }, deliveredByBrand: { touche: 12, belnco: 0 } }, { soldByBrand: undefined, deliveredByBrand: undefined }]) {
    const card = text(renderToStaticMarkup(<ProgressCard data={progress(over)} />));
    expect(card).toContain('30 vendus ce mois · 12 livrés');
    expect(card).not.toContain('(Touché');
  }
});

test('a table’s total row (« Total de la sélection ») stands apart from the rows above it, sticky action cell included', () => {
  const css = readFileSync(new URL('../src/styles/components.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.data-table tfoot :is\(th, td\) \{[^}]*border-block-start: 1px solid var\(--color-border-hairline\);[^}]*border-block-end: 0;[^}]*background: var\(--color-bg-sunken\);[^}]*font-weight: var\(--font-weight-semibold\);/);
});
