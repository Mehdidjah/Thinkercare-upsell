import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { bonusEstimate, type BonusRule } from '@touche/domain';
import { ReminderTable, isDue, type Reminder } from '../src/ui/pages/Reminders';
import { ProgressCard } from '../src/ui/Commission';
import Analytics, { CallDetail, DeliveryCard, analyticsQuery, auditDetail, auditLabel, orderStateMatch, orderTag } from '../src/ui/Analytics';

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
  expect(source).toContain("action:'reopen-reminder',id:o.id");
  expect(source).toContain("title:'Marquer ce rappel comme traité ?'");
  // « Annuler » is the view's own notice (15 s, gone with the view), not a toast that stays forever.
  expect(source).not.toContain("action:{label:'Annuler'");
  expect(ui('Analytics.tsx')).toContain('{sideState}{reminderDone.notice}');
  expect(ui('Analytics.tsx')).toContain("useEffect(()=>{if(tab!=='reminders')reminderDone.dismiss();},[tab]);");
  expect(ui('Commission.tsx')).toContain('{reminderDone.notice}{reminders.length?');
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

// The call.voided audit detail as the backend writes it: tc_calls row, tc_call_meta row, accepted-dossier row or null.
const voidSnapshot = (meta: unknown, dossier: unknown = null) => ({
  reason: 'Mauvais dossier', reminderClosed: false,
  call: { id: 'c1', user_id: 'u1', operator: 'Lina', outcome: 'duo', base_id: 'antiacne', created_at: '2026-11-19T09:00:00.000Z', voided_at: null },
  meta, dossier,
});
test('Traçabilité reads the voided call’s dossier from the real snapshot (compat-4)', () => {
  const line = 'Motif : Mauvais dossier · Résultat annulé : Duo accepté · Dossier DOS-9';
  expect(auditDetail('call.voided', voidSnapshot({ call_id: 'c1', order_ref: 'DOS-9', callback_at: null, callback_done: 0, data: { orderRef: 'DOS-9', version: 3 } }))).toBe(line);
  // Older meta rows have no order_ref column value: the reference inside data.
  expect(auditDetail('call.voided', voidSnapshot({ call_id: 'c1', order_ref: null, data: { orderRef: 'DOS-9' } }))).toBe(line);
  // No meta row: the accepted dossier still names it.
  expect(auditDetail('call.voided', { ...voidSnapshot(null, { call_id: 'c1', order_ref: 'DOS-9', voided_at: null }), reopenedReminderId: 'c0' })).toBe(line);
  expect(auditDetail('call.voided', voidSnapshot({ call_id: 'c1', order_ref: null, data: {} }))).toBe('Motif : Mauvais dossier · Résultat annulé : Duo accepté');
});

test('Pilotage asks for voided calls only from a server that has them, under its own cache key (voided=1)', () => {
  expect(analyticsQuery('2026-11-01', '2026-11-19', true)).toBe('action=analytics&from=2026-11-01&to=2026-11-19&voided=1');
  expect(analyticsQuery('2026-11-01', '2026-11-19', false)).toBe('action=analytics&from=2026-11-01&to=2026-11-19');
  expect(analyticsQuery('2026-11-01', '2026-11-19', true, 'abc')).toBe('action=analytics&from=2026-11-01&to=2026-11-19&voided=1&cursor=abc');
  const analytics = ui('Analytics.tsx');
  expect(analytics).toContain("const withVoided=!!features?.includes('void-call');");
  expect(analytics).toContain("useLiveReport<ActivityCall[]>('analytics:'+from+':'+to+(withVoided?':voided':''),");
  expect(analytics).toContain('const q=analyticsQuery(from,to,withVoided,cursor);');
});

const journalCall = { id: 'c1aaaaaaaa', user_id: 'u1', operator: 'Lina', base_id: 'antiacne', outcome: 'duo', refusal: '', created_at: '2026-11-19T09:00:00.000Z', base_total: 2000, offered_total: 3500, extra: 1500, pilot: 0, proposals: [], meta: { orderRef: 'DOS-9', version: 3, originals: [{ id: 'antiacne', name: 'Gel anti-acné', price: 1000, quantity: 2 }] } } as any;
test('voiding from the call detail confirms inside the dialog and gives the focus back (pages-3)', () => {
  const html = renderToStaticMarkup(<CallDetail call={journalCall} actor="Direction" canVoid onClose={() => {}} onVoided={() => {}} resume={() => {}} />);
  expect(html).toContain('>Annuler ce résultat…</button>');
  expect(renderToStaticMarkup(<CallDetail call={{ ...journalCall, voided_at: '2026-11-19T10:00:00.000Z', void_reason: 'Doublon' }} actor="Direction" canVoid onClose={() => {}} onVoided={() => {}} resume={() => {}} />)).not.toContain('Annuler ce résultat…');
  const analytics = ui('Analytics.tsx');
  const detail = analytics.slice(analytics.indexOf('export function CallDetail'), analytics.indexOf('export default function Analytics'));
  expect(detail).not.toContain('notify(');
  expect(detail).toContain('setVoiding(false);setReason(\'\');setDone(true);');
  expect(detail).toContain('{done?<p ref={doneRef} tabIndex={-1} className="notice notice--success" role="status">');
  expect(detail).toContain('useEffect(()=>{if(done)doneRef.current?.focus();},[done]);');
  expect(detail).toContain("onClick={()=>{backToVoid.current=true;setVoiding(false);setError('');}}>Garder le résultat</button>");
  expect(detail).toContain('<button ref={voidRef} type="button" className="btn btn--secondary" onClick={()=>setVoiding(true)}>Annuler ce résultat…</button>');
  expect(detail).toContain('useEffect(()=>{if(!voiding&&backToVoid.current){backToVoid.current=false;voidRef.current?.focus();}},[voiding]);');
});

test('Pilotage: a tag gives each call its EcoManager order state or why it has none', () => {
  const c = (extra: Record<string, unknown>) => ({ order_check: '', order_state_group: null, ...extra }) as never;
  expect(orderTag(c({ order_check: 'verified', order_state_group: 'delivered' }))).toEqual({ label: 'Livrée', tone: 'success' });
  expect(orderTag(c({ order_check: 'verified', order_state_group: 'failed' }))).toEqual({ label: 'Non livrée', tone: 'danger' });
  expect(orderTag(c({ order_check: 'verified', order_state_group: 'shipping' }))).toEqual({ label: 'En cours de livraison', tone: 'neutral' });
  expect(orderTag(c({ order_check: 'unverified' }))).toEqual({ label: 'À vérifier', tone: 'warning' });
  expect(orderTag(c({ order_check: 'not-found' }))).toEqual({ label: 'Introuvable dans EcoManager', tone: 'danger' });
  expect(orderTag(c({ order_check: 'unrecognized' }))).toEqual({ label: 'Référence non reconnue', tone: 'warning' });
  expect(orderTag(c({}))).toBeNull();
});

test('Pilotage: the order state filter keeps only matching calls', () => {
  const calls = [
    { order_check: 'verified', order_state_group: 'delivered' }, { order_check: 'verified', order_state_group: 'failed' },
    { order_check: 'unverified', order_state_group: null }, { order_check: 'not-found', order_state_group: null },
    { order_check: 'unrecognized', order_state_group: null }, { order_check: '', order_state_group: null },
  ] as never[];
  const keep = (f: string) => calls.filter((c) => orderStateMatch(c, f)).length;
  expect([keep(''), keep('delivered'), keep('failed'), keep('unverified'), keep('missing'), keep('unchecked')]).toEqual([6, 1, 1, 1, 2, 1]);
});

test('Pilotage: the delivery card counts the upsells by order state', () => {
  const call = (outcome: string, group: string | null, extra: number) => ({ outcome, order_state_group: group, extra, voided_at: null }) as never;
  const html = renderToStaticMarkup(<DeliveryCard calls={[call('duo', 'delivered', 1200), call('trio', 'delivered', 900), call('duo', 'failed', 700), call('duo', 'shipping', 500), call('duo', null, 300), call('refused', 'delivered', 0)]} sync={{ total: 10, known: 6, pending: 4, notFound: 0, unrecognized: 0 }}/>);
  expect(html).toContain('Livraison des upsells');
  expect(html).toMatch(/Livrées<\/span><strong[^>]*>2</);
  expect(html).toMatch(/Non livrées<\/span><strong[^>]*>1</);
  expect(html).toContain('Taux de livraison');
  expect(html).toContain('67 %');
  expect(html).toContain('États connus pour 6 appels sur 10');
  expect(renderToStaticMarkup(<DeliveryCard calls={[]} sync={{ total: 3, known: 3, pending: 0, notFound: 0, unrecognized: 0 }}/>)).not.toContain('synchronisation en cours');
});

test('Pilotage: the calls CSV says how each order was checked and its state', () => {
  const src = ui('Analytics.tsx');
  expect(src).toContain("'Vérification commande','État commande'");
});

