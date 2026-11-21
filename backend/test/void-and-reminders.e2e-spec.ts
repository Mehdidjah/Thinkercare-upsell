import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { localDay } from '@touche/domain';
import { tcAcceptedDossiers, tcAudit, tcCallMeta, tcCalls, tcProposals } from '../src/db/schema.js';
import type { DeskUser } from '../src/desk/desk.types.js';
import { contributions } from '../src/desk/contributions.js';
import { type TestContext, createTestApp } from './support/context.js';
import { resetDatabase } from './support/database.js';
import { deskGet, deskPost } from './support/desk.js';
import { createUser, loginCookie } from './support/users.js';

const PASSWORD = 'mot-de-passe-solide-2026';
const LATE = 'Ce résultat ne peut plus être annulé par la conseillère : demandez à la direction.';
const DAY = 86_400_000;

let ctx: TestContext;
let admin: string;
let lina: string;
let sara: string;
let adminUser: DeskUser;
let linaUser: DeskUser;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(() => ctx.close());
beforeEach(async () => {
  await resetDatabase(ctx.db);
  adminUser = await createUser(ctx.db, { username: 'direction', password: PASSWORD, role: 'admin', label: 'Direction' });
  linaUser = await createUser(ctx.db, { username: 'conseil.lina', password: PASSWORD, role: 'advisor', label: 'Lina B.' });
  await createUser(ctx.db, { username: 'conseil.sara', password: PASSWORD, role: 'advisor', label: 'Sara K.' });
  admin = await loginCookie(ctx, 'direction', PASSWORD);
  lina = await loginCookie(ctx, 'conseil.lina', PASSWORD);
  sara = await loginCookie(ctx, 'conseil.sara', PASSWORD);
});

type Body = Record<string, unknown>;
const post = (body: unknown, cookie = lina) => deskPost(ctx, body, { cookie });
const at = (ms: number) => new Date(Date.now() + ms).toISOString();
const audits = (action: string, target?: string) =>
  ctx.db.select().from(tcAudit).where(target ? and(eq(tcAudit.action, action), eq(tcAudit.target, target)) : eq(tcAudit.action, action));

/** Present the antiacne + wcgel duo and save it as accepted on `orderRef`; returns the call id. */
async function sale(orderRef: string, cookie = lina): Promise<string> {
  const callId = randomUUID();
  const id = randomUUID();
  const offer = { baseId: 'antiacne', productIds: ['antiacne', 'wcgel'], tier: 'duo', delivery: null, agreedTotal: 3000 };
  expect((await post({ action: 'present-offer', id, callId, ...offer }, cookie)).status).toBe(200);
  const res = await post(saveBody({ id: callId, ...offer, outcome: 'duo', consent: true, checked: true, meta: { orderRef, acceptedProposalId: id } }), cookie);
  expect(res.status).toBe(200);
  return callId;
}

function saveBody(overrides: Body & { meta?: Body } = {}): Body & { id: string } {
  const { meta, ...rest } = overrides;
  const id = typeof rest.id === 'string' ? rest.id : randomUUID();
  return {
    action: 'save-call', id, baseId: 'antiacne', productIds: ['antiacne'], outcome: 'callback',
    tier: 'catalogue', delivery: null, consent: false, checked: false, refusal: '', ...rest,
    meta: { version: 3, source: 'manual', customerStage: 'new', orderRef: 'R-' + id.slice(0, 8).toUpperCase(), startedAt: at(-60_000), eligible: true, objections: [], ...meta },
  } as Body & { id: string };
}

/** Save a callback for tomorrow and return its call id. */
async function callback(cookie = lina): Promise<string> {
  const body = saveBody({ meta: { callbackAt: at(DAY) } });
  expect((await post(body, cookie)).status).toBe(200);
  return body.id;
}

const reminderIds = async (cookie: string) =>
  (await deskGet(ctx, '?action=reminders', cookie)).body.reminders.map((r: { id: string }) => r.id);
const progress = async () => (await deskGet(ctx, '?action=my-progress', lina)).body.sold;

describe('void-call (H5)', () => {
  it('the adviser voids her own sale: nothing is deleted, nothing counts, the dossier is free again', async () => {
    const wrong = await sale('DOS-9');
    expect(await progress()).toBe(1);
    const [proposal] = await ctx.db.select().from(tcProposals).where(eq(tcProposals.call_id, wrong));
    const [metaBefore] = await ctx.db.select().from(tcCallMeta).where(eq(tcCallMeta.call_id, wrong));
    const res = await post({ action: 'void-call', id: wrong, reason: '  Mauvais dossier saisi  ', expectedUserId: linaUser.id });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      call: { id: wrong, voided_at: expect.any(String), voided_by: linaUser.id, void_reason: 'Mauvais dossier saisi' },
    });
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, wrong));
    expect(call).toMatchObject({ outcome: 'duo', offered_total: 3000, voided_by: linaUser.id, void_reason: 'Mauvais dossier saisi' });
    expect(call!.voided_at!.toISOString()).toBe(res.body.call.voided_at);
    expect(await ctx.db.select().from(tcCallMeta).where(eq(tcCallMeta.call_id, wrong))).toEqual([metaBefore]);
    expect(await ctx.db.select().from(tcProposals).where(eq(tcProposals.call_id, wrong))).toEqual([proposal]);
    expect(await ctx.db.select().from(tcAcceptedDossiers)).toEqual([
      { order_ref: 'DOS-9', call_id: wrong, user_id: linaUser.id, voided_at: call!.voided_at },
    ]);
    const [audit] = await audits('call.voided', wrong);
    expect(audit!.user_id).toBe(linaUser.id);
    expect(audit!.detail).toMatchObject({
      reason: 'Mauvais dossier saisi',
      call: { id: wrong, outcome: 'duo', offered_total: 3000, voided_at: null },
      meta: { call_id: wrong, order_ref: 'DOS-9' },
      dossier: { order_ref: 'DOS-9', call_id: wrong, voided_at: null },
      reminderClosed: false,
    });
    expect(await progress()).toBe(0);
    const right = await sale('DOS-9');
    expect(await progress()).toBe(1);
    const dossiers = await ctx.db.select().from(tcAcceptedDossiers);
    expect(new Map(dossiers.map((d) => [d.call_id, !!d.voided_at]))).toEqual(new Map([[right, false], [wrong, true]]));
    const today = localDay(new Date());
    const rows = await contributions(ctx.db, today, today);
    expect(rows).toEqual([expect.objectContaining({ user_id: linaUser.id, calls: 1, upsells: 1, duplicates: 0 })]);
    const dashboard = await deskGet(ctx, '?action=contributions', admin);
    expect(dashboard.body.people.find((p: { id: string }) => p.id === linaUser.id).period).toMatchObject({ upsells: 1 });
    // An older Pilotage tab (no `voided=1`) never sees the voided row, so its figures stay right.
    const oldTab = await deskGet(ctx, `?action=analytics&from=${today}&to=${today}`, admin);
    expect(oldTab.body.calls.map((c: { id: string }) => c.id)).toEqual([right]);
    const report = await deskGet(ctx, `?action=analytics&from=${today}&to=${today}&voided=1`, admin);
    expect(report.body.calls.find((c: { id: string }) => c.id === wrong)).toMatchObject({
      voided_at: res.body.call.voided_at, voided_by: linaUser.id, voided_by_label: 'Lina B.', void_reason: 'Mauvais dossier saisi',
    });
    expect(report.body.calls.find((c: { id: string }) => c.id === right)).toMatchObject({ voided_at: null, voided_by_label: null });
    expect((await post({ action: 'present-offer', id: randomUUID(), callId: wrong, baseId: 'antiacne', productIds: ['antiacne', 'wcgel'], tier: 'duo', delivery: null, agreedTotal: 3000 })).status).toBe(409);
  });

  it('after the window only a manager can void, at any time', async () => {
    const id = await sale('DOS-10');
    await ctx.db.update(tcCalls).set({ created_at: new Date(Date.now() - 31 * 60_000) }).where(eq(tcCalls.id, id));
    const late = await post({ action: 'void-call', id, reason: 'Erreur de saisie' });
    expect(late.status).toBe(403);
    expect(late.body).toEqual({ error: LATE });
    const byManager = await post({ action: 'void-call', id, reason: 'Erreur de saisie' }, admin);
    expect(byManager.status).toBe(200);
    expect(byManager.body.call.voided_by).toBe(adminUser.id);
    const today = localDay(new Date(Date.now() - 31 * 60_000));
    const report = await deskGet(ctx, `?action=analytics&from=${today}&to=${today}&voided=1`, admin);
    expect(report.body.calls.find((c: { id: string }) => c.id === id).voided_by_label).toBe('Direction');
  });

  it('refuses other advisers, unknown calls, a second void and a missing reason', async () => {
    const id = await sale('DOS-11');
    const other = await post({ action: 'void-call', id, reason: 'Pas mon appel' }, sara);
    expect(other.status).toBe(403);
    expect(other.body).toEqual({ error: 'Accès non autorisé.' });
    const unknown = await post({ action: 'void-call', id: randomUUID(), reason: 'Erreur de saisie' });
    expect(unknown.status).toBe(404);
    expect(unknown.body).toEqual({ error: 'Appel introuvable.' });
    const short = await post({ action: 'void-call', id, reason: ' x ' });
    expect(short.status).toBe(400);
    expect(short.body).toEqual({ error: 'Vérifiez les champs du formulaire : Motif de l’annulation — 3 caractères minimum.' });
    expect((await post({ action: 'void-call', id, reason: 'x'.repeat(301) })).status).toBe(400);
    const both = await Promise.all([
      post({ action: 'void-call', id, reason: 'Erreur de saisie' }),
      post({ action: 'void-call', id, reason: 'Erreur de saisie' }, admin),
    ]);
    expect(both.map((r) => r.status).sort((a, b) => a - b)).toEqual([200, 409]);
    expect(both.find((r) => r.status === 409)!.body).toEqual({ error: 'Ce résultat est déjà annulé.', code: 'already-voided' });
    expect(await audits('call.voided', id)).toHaveLength(1);
  });

  it('voiding a callback closes its reminder, which cannot be reopened', async () => {
    const id = await callback();
    expect(await reminderIds(lina)).toEqual([id]);
    const res = await post({ action: 'void-call', id, reason: 'Rappel saisi par erreur' });
    expect(res.status).toBe(200);
    expect(await reminderIds(lina)).toEqual([]);
    expect(await reminderIds(admin)).toEqual([]);
    const [audit] = await audits('call.voided', id);
    expect(audit!.detail).toMatchObject({ reminderClosed: true, meta: { callback_done: 0 }, dossier: null });
    const reopen = await post({ action: 'reopen-reminder', id });
    expect(reopen.status).toBe(409);
    expect(reopen.body).toEqual({ error: 'Ce résultat a été annulé : son rappel ne peut pas être rouvert.', code: 'already-voided' });
  });

  it('voided=1 only opts the journal in: other values exclude voided rows, other reports ignore it', async () => {
    const kept = await sale('DOS-12');
    const voided = await sale('DOS-13');
    expect((await post({ action: 'void-call', id: voided, reason: 'Erreur de saisie' })).status).toBe(200);
    const today = localDay(new Date());
    const ids = async (extra: string) => {
      const res = await deskGet(ctx, `?action=analytics&from=${today}&to=${today}${extra}`, admin);
      expect(res.status, extra).toBe(200);
      return res.body.calls.map((c: { id: string }) => c.id).sort();
    };
    expect(await ids('&voided=1')).toEqual([kept, voided].sort());
    for (const extra of ['', '&voided=0', '&voided=true', '&voided=']) expect(await ids(extra), extra).toEqual([kept]);
    expect(await ids(`&voided=1&operator=${linaUser.id}`)).toEqual([kept, voided].sort());
    for (const [query, cookie] of [
      ['?compact=1&voided=1', lina], ['?action=reminders&voided=1', lina], ['?action=my-progress&voided=1', lina],
      ['?action=contributions&voided=1', admin], ['?action=audit&voided=1', admin],
    ] as const) {
      expect((await deskGet(ctx, query, cookie)).status, query).toBe(200);
    }
    expect((await deskGet(ctx, '?action=my-progress&voided=1', lina)).body.sold).toBe(1);
    expect((await deskGet(ctx, '?action=my-progress&operator=x', lina)).status).toBe(403);
  });

  it('the workspace announces the action and the adviser window', async () => {
    const res = await deskGet(ctx, '?compact=1', lina);
    expect(res.body.features).toEqual(expect.arrayContaining(['void-call', 'reopen-reminder']));
    expect(res.body.void_window_minutes).toBe(30);
  });
});

describe('reminders (M2)', () => {
  it('a targeted check saved with a callback date is listed in the reminders', async () => {
    // The desk records the stop panel's callback as outcome « review » with meta.callbackAt.
    const body = saveBody({ outcome: 'review', meta: { eligible: false, callbackAt: at(DAY) } });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(await reminderIds(lina)).toEqual([body.id]);
    const [call] = await ctx.db.select().from(tcCalls).where(eq(tcCalls.id, body.id));
    expect(call!.outcome).toBe('review');
  });

  it('the follow-up call made from a reminder closes it in the same save', async () => {
    const first = await callback();
    const body = saveBody({ outcome: 'initial', meta: { linkedCallId: first } });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, closedReminderId: first });
    expect(await reminderIds(lina)).toEqual([]);
    const [closed] = await audits('reminder.closed', first);
    expect(closed!.detail).toEqual({ callId: body.id });
    const again = await post(body);
    expect(again.body).toEqual({ ok: true, duplicate: true, outcome: 'initial' });
    expect(await audits('reminder.closed', first)).toHaveLength(1);
  });

  it('a link to a reminder the adviser may not handle, or one already closed, leaves it as it is', async () => {
    const theirs = await callback(sara);
    const res = await post(saveBody({ outcome: 'refused', refusal: 'budget', meta: { linkedCallId: theirs } }));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(await reminderIds(sara)).toEqual([theirs]);
    const byManager = await post(saveBody({ outcome: 'refused', refusal: 'budget', meta: { linkedCallId: theirs } }), admin);
    expect(byManager.body).toEqual({ ok: true, closedReminderId: theirs });
    expect(await reminderIds(sara)).toEqual([]);
    const noReminder = saveBody({ outcome: 'initial' });
    expect((await post(noReminder)).status).toBe(200);
    expect((await post(saveBody({ outcome: 'initial', meta: { linkedCallId: noReminder.id } }))).body).toEqual({ ok: true });
    expect((await post(saveBody({ outcome: 'initial', meta: { linkedCallId: randomUUID() } }))).body).toEqual({ ok: true });
  });

  it('a follow-up with no answer leaves the reminder open; a callback follow-up closes it and opens its own', async () => {
    const first = await callback();
    const unanswered = await post(saveBody({ outcome: 'noanswer', meta: { linkedCallId: first } }));
    expect(unanswered.status).toBe(200);
    expect(unanswered.body).toEqual({ ok: true });
    expect(await reminderIds(lina)).toEqual([first]);
    expect(await audits('reminder.closed', first)).toEqual([]);
    const later = saveBody({ meta: { linkedCallId: first, callbackAt: at(2 * DAY) } });
    expect((await post(later)).body).toEqual({ ok: true, closedReminderId: first });
    expect(await reminderIds(lina)).toEqual([later.id]);
  });

  it('voiding the follow-up call reopens the reminder its save closed', async () => {
    const first = await callback();
    const follow = saveBody({ outcome: 'initial', meta: { linkedCallId: first } });
    expect((await post(follow)).body).toEqual({ ok: true, closedReminderId: first });
    expect(await reminderIds(lina)).toEqual([]);
    const res = await post({ action: 'void-call', id: follow.id, reason: 'Mauvaise cliente' }, admin);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      call: { id: follow.id, voided_at: expect.any(String), voided_by: adminUser.id, void_reason: 'Mauvaise cliente' },
      reopenedReminderId: first,
    });
    expect(await reminderIds(lina)).toEqual([first]);
    const [reopened] = await audits('reminder.reopened', first);
    expect(reopened).toMatchObject({ user_id: adminUser.id, detail: { callId: follow.id, reason: 'void' } });
    const [voided] = await audits('call.voided', follow.id);
    expect(voided!.detail).toMatchObject({ reminderClosed: false, reopenedReminderId: first });
  });

  it('voiding the follow-up leaves a reminder handled since, or whose own call is voided, as it is', async () => {
    const voidCall = async (id: string) => {
      const res = await post({ action: 'void-call', id, reason: 'Erreur de saisie' }, admin);
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('reopenedReminderId');
      expect((await audits('call.voided', id))[0]!.detail).toMatchObject({ reopenedReminderId: null });
    };
    const follow = async (first: string) => {
      const body = saveBody({ outcome: 'initial', meta: { linkedCallId: first } });
      expect((await post(body)).body).toEqual({ ok: true, closedReminderId: first });
      return body.id;
    };
    // Reopened then marked handled by hand after the follow-up: the later decision stands.
    const handled = await callback();
    const handledFollow = await follow(handled);
    expect((await post({ action: 'reopen-reminder', id: handled })).status).toBe(200);
    expect((await post({ action: 'complete-reminder', callId: handled })).status).toBe(200);
    await voidCall(handledFollow);
    // Reopened by hand and still open: nothing to undo.
    const open = await callback();
    const openFollow = await follow(open);
    expect((await post({ action: 'reopen-reminder', id: open })).status).toBe(200);
    await voidCall(openFollow);
    expect(await audits('reminder.reopened', open)).toHaveLength(1);
    // The reminder's own call was voided since.
    const gone = await callback();
    const goneFollow = await follow(gone);
    await voidCall(gone);
    await voidCall(goneFollow);
    // A follow-up with no answer never closed it.
    const unanswered = await callback();
    const noAnswer = saveBody({ outcome: 'noanswer', meta: { linkedCallId: unanswered } });
    expect((await post(noAnswer)).status).toBe(200);
    await voidCall(noAnswer.id);
    expect(await reminderIds(lina)).toEqual([open, unanswered]);
    expect(await audits('reminder.reopened', gone)).toEqual([]);
    expect(await audits('reminder.reopened', unanswered)).toEqual([]);
  });

  it('complete-reminder: 404, 400 without a callback, idempotent without a second audit row', async () => {
    const missing = await post({ action: 'complete-reminder', callId: randomUUID() });
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual({ error: 'Appel introuvable.' });
    const plain = saveBody({ outcome: 'initial' });
    expect((await post(plain)).status).toBe(200);
    const none = await post({ action: 'complete-reminder', callId: plain.id });
    expect(none.status).toBe(400);
    expect(none.body).toEqual({ error: 'Cet appel n’a pas de rappel.' });
    const id = await callback();
    expect((await post({ action: 'complete-reminder', callId: id })).body).toEqual({ ok: true });
    const twice = await post({ action: 'complete-reminder', callId: id });
    expect(twice.status).toBe(200);
    expect(twice.body).toEqual({ ok: true, alreadyDone: true });
    expect(await audits('reminder.closed', id)).toHaveLength(1);
  });

  it('reopen-reminder undoes « Marquer traité » for the owner or a manager', async () => {
    const id = await callback();
    expect((await post({ action: 'complete-reminder', callId: id })).status).toBe(200);
    const denied = await post({ action: 'reopen-reminder', id }, sara);
    expect(denied.status).toBe(403);
    expect(denied.body).toEqual({ error: 'Accès non autorisé.' });
    const res = await post({ action: 'reopen-reminder', id, expectedUserId: linaUser.id });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(await reminderIds(lina)).toEqual([id]);
    const [audit] = await audits('reminder.reopened', id);
    expect(audit!.user_id).toBe(linaUser.id);
    expect((await post({ action: 'reopen-reminder', id })).body).toEqual({ ok: true, alreadyOpen: true });
    expect(await audits('reminder.reopened', id)).toHaveLength(1);
    expect((await post({ action: 'complete-reminder', callId: id }, admin)).status).toBe(200);
    expect((await post({ action: 'reopen-reminder', id }, admin)).body).toEqual({ ok: true });
    expect((await post({ action: 'reopen-reminder', id: randomUUID() })).status).toBe(404);
    const plain = saveBody({ outcome: 'initial' });
    expect((await post(plain)).status).toBe(200);
    expect((await post({ action: 'reopen-reminder', id: plain.id })).body).toEqual({ error: 'Cet appel n’a pas de rappel.' });
  });

  it('a voided call never appears among reminders', async () => {
    const id = await callback();
    await ctx.db.update(tcCalls).set({ voided_at: new Date(), voided_by: adminUser.id, void_reason: 'Test' }).where(eq(tcCalls.id, id));
    expect(await reminderIds(lina)).toEqual([]);
    expect(await reminderIds(admin)).toEqual([]);
  });
});
