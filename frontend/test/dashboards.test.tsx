import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { bonusEstimate, type BonusRule } from '@touche/domain';
import { ReminderTable, isDue, type Reminder } from '../src/ui/pages/Reminders';
import { ProgressCard } from '../src/ui/Commission';
import Analytics, { auditDetail, auditLabel } from '../src/ui/Analytics';

const ui = (path: string) => readFileSync(new URL('../src/ui/' + path, import.meta.url), 'utf8');
const reminder = (over: Partial<Reminder> = {}): Reminder => ({ id: 'c1aaaaaaaa', user_id: 'u1', operator: 'Lina', base_id: 'antiacne', outcome: 'callback', created_at: '2026-11-01T10:00:00Z', callback_at: '2026-11-02T10:00:00Z', order_ref: 'DOS-1', meta: { originals: [{ id: 'antiacne', name: 'Gel anti-acné', price: 1000, quantity: 2 }] }, ...over });

test('reminders become labelled cards on phones, with the initial products and an « En retard » tag (PN5)', () => {
  const html = renderToStaticMarkup(<ReminderTable reminders={[reminder()]} caption="Mes rappels ouverts" canComplete={() => true} complete={() => {}} resume={() => {}} />);
  expect(html).toContain('class="data-table data-table--cards reminder-table"');
  expect(html).toContain('<caption class="sr-only">Mes rappels ouverts</caption>');
  expect(html).toContain('En retard');
  expect(html).toContain('data-label="Dossier">DOS-1</td>');
  expect(html).toContain('Gel anti-acné × 2');
  expect(html).toContain('>Préparer le rappel</button>');
  expect(html).toContain('>Marquer traité</button>');
  const managerView = renderToStaticMarkup(<ReminderTable reminders={[reminder({ callback_at: '2099-01-01T10:00:00Z' })]} showOperator caption="Rappels" canComplete={() => false} complete={() => {}} />);
  expect(managerView).toContain('data-label="Conseillère">Lina</td>');
  expect(managerView).not.toContain('Marquer traité');
  expect(managerView).not.toContain('En retard');
});

test('a reminder is due today or late, in Alger days (X7)', () => {
  expect(isDue({ callback_at: '2026-11-19T22:30:00Z' }, '2026-11-19')).toBe(true); // 23:30 in Alger, same day
  expect(isDue({ callback_at: '2026-11-19T23:30:00Z' }, '2026-11-19')).toBe(false); // already 20 November in Alger
  expect(isDue({ callback_at: '2026-11-02T10:00:00Z' }, '2026-11-19')).toBe(true);
});

test('« Marquer traité » undoes with reopen-reminder when the server has it, otherwise asks first (PN5)', () => {
  const source = ui('pages/Reminders.tsx');
  expect(source).toContain("features?.includes('reopen-reminder')");
  expect(source).toContain("action:'reopen-reminder',id:r.id");
  expect(source).toContain("action:{label:'Annuler'");
  expect(source).toContain("title:'Marquer ce rappel comme traité ?'");
});

const rule: BonusRule = { effectiveMonth: '2026-01', threshold: 60, rateDzd: 45, mode: 'all_month', version: 1 };
const progress = (month: string, count: number) => ({ month, today: '2026-11-19', user: { id: 'u', label: 'Lina' }, rule, progress: bonusEstimate(count, rule), todayUpsells: 2, daily: [], withoutReference: 0, duplicateExcluded: 0, updatedAt: '2026-11-19T10:00:00Z' });

test('a past month reads as closed: no « Encore N », no « aujourd’hui » (X11)', () => {
  const past = renderToStaticMarkup(<ProgressCard data={progress('2026-10', 12)} />);
  expect(past).toContain('Mois clôturé : 12 upsells pour un seuil de 60.');
  expect(past).not.toContain('Encore');
  expect(past).not.toContain('aujourd’hui');
  expect(past).toContain('Seuil non atteint : pas de prime pour ce mois.');
  const current = renderToStaticMarkup(<ProgressCard data={progress('2026-11', 12)} />);
  expect(current).toContain('Encore 48 upsells');
  expect(current).toContain('2 upsell(s) aujourd’hui');
});

test('the call strip says how many reminders are due, with a link to them (X7)', () => {
  const strip = renderToStaticMarkup(<ProgressCard data={progress('2026-11', 12)} compact due={2} />);
  expect(strip).toContain('2 rappels à traiter aujourd’hui ou en retard.');
  expect(strip).toContain('>Voir mes rappels</button>');
  expect(renderToStaticMarkup(<ProgressCard data={progress('2026-11', 12)} compact />)).not.toContain('Voir mes rappels');
});

test('Apports: silent refresh, kept data, rule copy from the saved rule, one byte-order mark (PN1, PN2, COPYBONUS, X3)', () => {
  const commission = ui('Commission.tsx');
  expect(commission).not.toContain("'\\uFEFF'");
  expect(commission).not.toMatch(/60 × 45|Seuil demandé : 60|45 DA au 60/);
  expect(commission).toContain('Règle enregistrée pour {monthLabel(month)} : {data.rule.threshold} upsells par mois');
  expect(commission).toContain('<Button variant="primary" busy={saving}');
  expect(commission).not.toContain('{data&&!error&&');
  expect(commission).toContain('{report.stale&&<StaleNotice');
  expect(commission).toContain('{!data&&(report.error?');
});

test('Pilotage: figures exclude voided calls; filters are visible chips; the refresh is silent (H5, X2, X8, PN1)', () => {
  const analytics = ui('Analytics.tsx');
  expect(analytics).toContain('const counted=useMemo(()=>countedCalls(filtered)');
  expect(analytics).toMatch(/summary\(counted\),operators:byOperator\(counted\),daily:byDay\(counted,from,to\),prod:productStats\(counted\)/);
  expect(analytics).toContain("[c.meta.orderRef,c.id].some(");
  expect(analytics).toContain("chip('objection'");
  expect(analytics).toContain("chip('search'");
  expect(analytics).not.toContain('role="status">{selectedDay');
  expect(analytics).not.toContain("'Actualisation…'");
  expect(analytics).not.toContain('JSON.stringify(a.detail)');
  expect(analytics).not.toMatch(/docs\/[A-Za-z-]+\.(md|json)/);
  expect(analytics).toContain("action:'void-call',id:call.id,reason:text");
  expect(analytics).toContain("canVoid={!!features?.includes('void-call')}");
});

test('Traçabilité speaks French, one readable line per event (N9)', () => {
  expect(auditLabel('call.closed')).toBe('Appel clôturé');
  expect(auditLabel('call.voided')).toBe('Résultat annulé');
  expect(auditLabel('reminder.reopened')).toBe('Rappel rouvert');
  expect(auditLabel('account.password_viewed')).toBe('Mot de passe consulté');
  expect(auditLabel('user.created')).toBe('Compte créé');
  expect(auditLabel('something.new')).toBe('something.new');
  expect(auditDetail('bonus.rule.updated', { threshold: 60, rateDzd: 45, mode: 'all_month', version: 2 })).toMatch(/^Seuil : 60 upsells · 45\sDA par upsell · tous les upsells dès le seuil · version 2$/);
  expect(auditDetail('call.voided', { reason: 'Mauvais dossier', call: { outcome: 'duo' }, meta: { orderRef: 'DOS-9' } })).toBe('Motif : Mauvais dossier · Résultat annulé : Duo accepté · Dossier DOS-9');
  expect(auditDetail('call.closed', { outcome: 'noanswer' })).toBe('Résultat : Sans réponse');
  expect(auditDetail('account.updated', { role: 'manager', team: '', active: false })).toBe('Rôle : Manager · Équipe : sans équipe · Compte désactivé');
  expect(auditDetail('reminder.closed', {})).toBe('');
});

const admin = { id: 'a', label: 'Direction', role: 'admin', username: 'direction' };
test('the filter card hides on views that ignore it; Pilotage opens on the view App asks for (PN7, F3)', () => {
  const overview = renderToStaticMarkup(<Analytics user={admin} users={[]} products={[]} resume={() => {}} />);
  expect(overview).toContain('aria-label="Filtres du rapport"');
  expect(overview).toMatch(/aria-current="page">Vue d’ensemble</);
  for (const tab of ['reminders', 'definitions', 'audit']) expect(renderToStaticMarkup(<Analytics user={admin} users={[]} products={[]} resume={() => {}} initialTab={tab} />)).not.toContain('Filtres du rapport');
  expect(renderToStaticMarkup(<Analytics user={admin} users={[]} products={[]} resume={() => {}} initialTab="journal" />)).toMatch(/aria-current="page">Journal</);
});
