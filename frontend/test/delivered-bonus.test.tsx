import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { bonusEstimate, money, type BonusRule } from '@touche/domain';

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

import { ContributionDashboard, MyUpsells, PersonalProgress, ProgressCard, upsellTag, type MyUpsell } from '../src/ui/Commission';

const rule: BonusRule = { effectiveMonth: '2026-11', threshold: 60, rateDzd: 45, mode: 'all_month', version: 1 };
const upsell = (over: Partial<MyUpsell> = {}): MyUpsell => ({
  id: 'c-' + Math.random().toString(36).slice(2), created_at: '2026-11-05T10:00:00.000Z', order_ref: 'TOU8000001', brand: 'touche', outcome: 'duo',
  units: 1, extra: 1200, order_state_group: 'delivered', order_state_name: 'Livrée', delivered_at: '2026-11-08T10:00:00.000Z', counts: true, ...over,
});
const progress = (over: Record<string, unknown> = {}) => ({
  month: '2026-11', today: '2026-11-21', user: { id: 'u1', label: 'Lina' }, rule, progress: bonusEstimate(12, rule), todayUpsells: 2,
  daily: [{ day: '2026-11-08', upsells: 2 }], sold: 30, stateCounts: { delivered: 12, shipping: 9, pending: 0, failed: 3, unknown: 0 },
  upsells: [upsell()], upsellsTotal: 1, withoutReference: 0, duplicateExcluded: 0, updatedAt: '2026-11-21T09:00:00Z', ...over,
});
const text = (html: string) => html.replace(/<[^>]+>/g, '');

test('each upsell’s state tag: delivered this month counts, another month names its prime, the rest say why not (yet)', () => {
  expect(upsellTag(upsell(), '2026-11')).toEqual({ label: 'Livrée le 08/11 · compte pour la prime', tone: 'success' });
  expect(upsellTag(upsell({ delivered_at: '2026-12-01T09:00:00.000Z', counts: false }), '2026-11')).toEqual({ label: 'Livrée le 01/12 · prime de décembre', tone: 'neutral' });
  expect(upsellTag(upsell({ created_at: '2027-03-30T10:00:00.000Z', delivered_at: '2027-04-02T09:00:00.000Z', counts: false }), '2027-03').label).toBe('Livrée le 02/04 · prime d’avril');
  // Algiers time: 23:30 UTC on 30 November is 1 December.
  expect(upsellTag(upsell({ delivered_at: '2026-11-30T23:30:00.000Z', counts: false }), '2026-11').label).toBe('Livrée le 01/12 · prime de décembre');
  expect(upsellTag(upsell({ counts: false }), '2026-11')).toEqual({ label: 'Livrée le 08/11 · comptée sur un autre appel du dossier', tone: 'neutral' });
  expect(upsellTag(upsell({ order_state_group: 'shipping', delivered_at: null, counts: false }), '2026-11')).toEqual({ label: 'En cours de livraison', tone: 'neutral' });
  expect(upsellTag(upsell({ order_state_group: 'pending', delivered_at: null, counts: false }), '2026-11')).toEqual({ label: 'Pas encore expédiée', tone: 'neutral' });
  expect(upsellTag(upsell({ order_state_group: 'failed', delivered_at: null, counts: false }), '2026-11')).toEqual({ label: 'Non livrée · ne compte pas', tone: 'danger' });
  for (const group of ['unknown', null] as const) {
    expect(upsellTag(upsell({ order_state_group: group, order_state_name: null, delivered_at: null, counts: false }), '2026-11')).toEqual({ label: 'État inconnu · à vérifier', tone: 'warning' });
  }
  // An order delivered before the call (often a mistyped reference): the add-on was not in it.
  expect(upsellTag(upsell({ created_at: '2026-11-21T10:00:00.000Z', delivered_at: '2026-11-10T10:00:00.000Z', counts: false }), '2026-11')).toEqual({ label: 'Livrée le 10/11, avant l’appel · à vérifier', tone: 'warning' });
});

test('a month paid on sales (before November 2026): every sale counted, the tags only give the order’s state', () => {
  const sold = (over: Partial<MyUpsell>) => upsellTag(upsell({ created_at: '2026-10-10T10:00:00.000Z', ...over }), '2026-10', true);
  expect(sold({ delivered_at: '2026-10-15T10:00:00.000Z' })).toEqual({ label: 'Livrée le 15/10', tone: 'success' });
  expect(sold({ delivered_at: '2026-11-02T10:00:00.000Z' })).toEqual({ label: 'Livrée le 02/11', tone: 'success' });
  expect(sold({ order_state_group: 'shipping', delivered_at: null })).toEqual({ label: 'En cours de livraison', tone: 'neutral' });
  expect(sold({ order_state_group: 'failed', delivered_at: null })).toEqual({ label: 'Non livrée', tone: 'danger' });
  expect(sold({ order_state_group: null, delivered_at: null })).toEqual({ label: 'État inconnu · à vérifier', tone: 'warning' });
  const october = progress({ month: '2026-10', basis: 'sold', upsells: [upsell({ created_at: '2026-10-10T10:00:00.000Z', delivered_at: '2026-10-15T10:00:00.000Z' })] });
  const card = text(renderToStaticMarkup(<ProgressCard data={october} />));
  expect(card).toContain('Upsells vendus dans le mois : 12 / 60');
  expect(card).toContain(`${money(45)} par upsell vendu`);
  expect(card).toContain('Mois clôturé : 12 upsells vendus pour un seuil de 60.');
  expect(card).toContain('Pour ce mois, la prime était calculée sur vos upsells vendus.');
  expect(card).not.toContain('livrés, dans le mois de leur livraison');
  expect(card).not.toContain('Une commande retournée ou annulée ne compte pas');
  const list = renderToStaticMarkup(<MyUpsells data={october} />);
  expect(text(list)).toContain('Vos ventes du mois, du plus récent au plus ancien. Pour ce mois, la prime compte les upsells vendus');
  expect(list).toContain('<span class="tag tag--success">Livrée le 15/10</span>');
  reports.set('my-progress', october);
  reports.set('reminders', { reminders: [] });
  expect(renderToStaticMarkup(<PersonalProgress />)).toContain('>Mes upsells vendus au fil du mois</h2>');
});

test('« Mes upsells »: one row per sale, with its date, dossier, brand, supplement and state', () => {
  const rows = [
    upsell({ id: 'a', created_at: '2026-11-18T10:00:00.000Z', order_ref: 'TOU8000003', order_state_group: 'shipping', order_state_name: 'En livraison', delivered_at: null, counts: false }),
    upsell({ id: 'b', order_ref: 'BEL8300001', brand: 'belnco', extra: 1500, units: 2, outcome: 'trio' }),
    upsell({ id: 'c', order_ref: '', order_state_group: null, order_state_name: null, delivered_at: null, counts: false }),
  ];
  const html = renderToStaticMarkup(<MyUpsells data={progress({ upsells: rows, upsellsTotal: 3 })} />);
  expect(html).toContain('<h2 id="my-upsells-title">Mes upsells</h2>');
  expect(html).toContain('class="data-table data-table--cards upsell-table"');
  for (const column of ['Date', 'Dossier', 'Marque', 'Supplément', 'État']) expect(html).toContain(`>${column}</th>`);
  expect(html).toContain('<time class="num" dateTime="2026-11-18T10:00:00.000Z">18/11/2026</time>');
  expect(html).toContain('data-label="Dossier">TOU8000003</td>');
  expect(html).toContain('data-label="Dossier">Non renseigné</td>');
  expect(html).toContain('data-label="Marque">BEL.NCO</td>');
  expect(html).toContain('data-label="Marque">Touché</td>');
  expect(text(html)).toContain(money(1500) + '2 upsells');
  expect(html).toContain('<span class="tag tag--neutral">En cours de livraison</span>');
  expect(html).toContain('<span class="tag tag--success">Livrée le 08/11 · compte pour la prime</span>');
  expect(html).toContain('<span class="tag tag--warning">État inconnu · à vérifier</span>');
  expect(html).not.toContain('les plus récents');
});

test('« Mes upsells » says when only the 300 most recent are shown, and has an empty state', () => {
  expect(text(renderToStaticMarkup(<MyUpsells data={progress({ upsellsTotal: 412 })} />))).toContain('Les 1 upsells les plus récents sont affichés, sur 412.');
  const empty = renderToStaticMarkup(<MyUpsells data={progress({ upsells: [], upsellsTotal: 0 })} />);
  expect(empty).toContain('Aucun upsell vendu ou livré sur ce mois.');
});

test('the progress card counts delivered upsells and gives the month’s sales by state', () => {
  const card = text(renderToStaticMarkup(<ProgressCard data={progress()} />));
  expect(card).toContain('Upsells livrés ce mois : 12 / 60');
  expect(card).toContain('30 vendus ce mois · dont 12 déjà livrés · 9 en cours · 3 non livrés');
  expect(card).not.toContain('pas encore expédié');
  expect(card).toContain('Encore 48 upsells livrés pour atteindre votre objectif.');
  expect(card).toContain(`${money(45)} par upsell livré`);
  expect(card).toContain('La prime est calculée uniquement sur vos upsells livrés.');
  const more = text(renderToStaticMarkup(<ProgressCard data={progress({ sold: 1, stateCounts: { delivered: 1, shipping: 0, pending: 2, failed: 0, unknown: 1 } })} />));
  expect(more).toContain('1 vendu ce mois · dont 1 déjà livré · 0 en cours · 0 non livré · 2 pas encore expédiés · 1 à vérifier');
  const closed = text(renderToStaticMarkup(<ProgressCard data={progress({ month: '2026-10' })} />));
  expect(closed).toContain('Upsells livrés dans le mois : 12 / 60');
  expect(closed).toContain('30 vendus dans le mois');
  // An API without the new fields: no sales line, nothing breaks.
  expect(text(renderToStaticMarkup(<ProgressCard data={progress({ sold: undefined, stateCounts: undefined })} />))).not.toContain('vendus');
});

test('« Ma progression » keeps « Mes rappels » right under the progress card (« Voir mes rappels » lands there); « Mes upsells » comes last', () => {
  reports.set('my-progress', progress());
  reports.set('reminders', { reminders: [] });
  const html = renderToStaticMarkup(<PersonalProgress />);
  const card = html.indexOf('pilot-progress__count'), reminders = html.indexOf('>Mes rappels</h2>'), chart = html.indexOf('>Mes upsells livrés au fil du mois</h2>'), list = html.indexOf('>Mes upsells</h2>');
  expect(card).toBeGreaterThan(-1);
  expect(reminders).toBeGreaterThan(card);
  expect(chart).toBeGreaterThan(reminders);
  expect(list).toBeGreaterThan(chart);
  expect(renderToStaticMarkup(<PersonalProgress compact />)).not.toContain('Mes upsells');
});

test('« Apports & primes » shows sold and delivered per adviser, the prime on delivered, and the rule in one line', () => {
  const totals = { calls: 4, confirmations: 3, upsells: 3, initialDzd: 5400, confirmedDzd: 9000, upliftDzd: 3600, withoutRef: 0, duplicates: 0 };
  reports.set('contributions', {
    month: '2026-11', from: '2026-11-01', to: '2026-11-21', today: '2026-11-21', rule, monthRuleVersion: 1, updatedAt: '2026-11-21T09:00:00Z',
    people: [{ id: 'u1', label: 'Lina', role: 'advisor', active: 1, team: '', period: totals, monthly: { ...totals, delivered: 2, bonus: bonusEstimate(2, rule) }, daily: [] }],
  });
  const html = renderToStaticMarkup(<ContributionDashboard openOperator={() => {}} />);
  expect(html).toContain('>Vendus du\u00a0mois</th>');
  expect(html).toContain('>Livrés du\u00a0mois</th>');
  const row = text(html.slice(html.indexOf('>Lina</button>')));
  expect(row).toContain('2 / 6058 restant(s)');
  expect(html).toContain('<p>La prime compte les upsells livrés, dans le mois de leur livraison.</p>');
  expect(text(html)).toContain('60 upsells livrés par mois, ' + money(45) + ' par upsell livré. Tous les upsells livrés du mois dès 60 atteints.');
  expect(html).toContain('>DA par upsell livré<');
});

test('« Apports & primes » for a month paid on sales: the sold count carries the threshold, no delivered count', () => {
  const totals = { calls: 4, confirmations: 3, upsells: 3, initialDzd: 5400, confirmedDzd: 9000, upliftDzd: 3600, withoutRef: 0, duplicates: 0 };
  reports.set('contributions', {
    month: '2026-10', from: '2026-10-01', to: '2026-10-31', today: '2026-11-21', basis: 'sold', rule: { ...rule, effectiveMonth: '2026-10' }, monthRuleVersion: 1, updatedAt: '2026-11-21T09:00:00Z',
    people: [{ id: 'u1', label: 'Lina', role: 'advisor', active: 1, team: '', period: totals, monthly: { ...totals, delivered: null, bonus: bonusEstimate(3, rule) }, daily: [] }],
  });
  const html = renderToStaticMarkup(<ContributionDashboard openOperator={() => {}} />);
  const row = text(html.slice(html.indexOf('>Lina</button>')));
  expect(row).toContain('3 / 6057 restant(s)—');
  expect(html).toContain('<p>Pour ce mois, la prime compte les upsells vendus, dans le mois de l’appel : la règle des upsells livrés n’était pas encore en vigueur.</p>');
  expect(text(html)).toContain('60 upsells vendus par mois, ' + money(45) + ' par upsell vendu. Tous les upsells vendus du mois dès 60 atteints.');
});

test('the sales line reads like the motivation, stays off the call strip, and long state tags wrap', async () => {
  const { readFileSync } = await import('node:fs');
  const css = readFileSync(new URL('../src/styles/pilotage.css', import.meta.url), 'utf8');
  expect(css).toMatch(/\.pilot-progress__sold \{[^}]*font-size: var\(--text-ui\);[^}]*color: var\(--color-text-secondary\);/);
  expect(css).toMatch(/\.pilot-progress--compact :is\([^)]*\.pilot-progress__sold[^)]*\) \{ display: none; \}/);
  expect(css).toMatch(/\.upsell-table \.tag \{[^}]*white-space: normal;/);
});

test('the adviser’s card ends on one line about pay: the prime counts delivered upsells only (owner, 2026-11-21)', () => {
  const card = text(renderToStaticMarkup(<ProgressCard data={progress()} />));
  expect(card).toContain('La prime est calculée uniquement sur vos upsells livrés.');
  for (const gone of ['aujourd’hui', 'Modalité de déclenchement', 'Tous les upsells livrés du mois dès', 'À partir du', 'Chaque produit ajouté à la commande initiale', 'La prime compte les upsells livrés, dans le mois de leur livraison']) expect(card, gone).not.toContain(gone);
  const sold = text(renderToStaticMarkup(<ProgressCard data={progress({ month: '2026-10', basis: 'sold' })} />));
  expect(sold).toContain('Pour ce mois, la prime était calculée sur vos upsells vendus.');
  const strip = text(renderToStaticMarkup(<ProgressCard data={progress()} compact />));
  expect(strip).not.toContain('aujourd’hui');
  expect(strip).not.toContain('La prime est calculée');
});
