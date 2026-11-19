import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { reportCache } from '../src/data/report-cache';
import { UNDO_MS, createUndo, useCompleteReminder, type Reminder } from '../src/ui/pages/Reminders';

const { requestJson, notify, announce, confirm } = vi.hoisted(() => ({
  requestJson: vi.fn(), notify: vi.fn(), announce: vi.fn(), confirm: vi.fn(async () => true),
}));
vi.mock('../src/data/api', () => ({ requestJson }));
vi.mock('../src/ui/shell/Notifications', () => ({ useNotify: () => ({ notify, announce }) }));
vi.mock('../src/ui/shared/Confirm', () => ({ useConfirm: () => confirm }));

const reminder: Reminder = { id: 'c1', user_id: 'u1', operator: 'Lina', base_id: 'antiacne', outcome: 'callback', created_at: '2026-11-01T10:00:00Z', callback_at: '2026-11-02T10:00:00Z', order_ref: 'DOS-1', meta: {} };
const reopenCalls = () => requestJson.mock.calls.filter(([, body]) => (body as { action?: string } | undefined)?.action === 'reopen-reminder');

/** The hook as a reminders view gets it (rendered once; effects do not run on the server). */
function useHook(features: string[] | undefined = ['reopen-reminder'], onError = vi.fn()) {
  let hook!: ReturnType<typeof useCompleteReminder>;
  function Probe() { hook = useCompleteReminder(features, onError); return null; }
  renderToStaticMarkup(<Probe/>);
  return hook;
}

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); reportCache.setUser('u1'); });
afterEach(() => { vi.useRealTimers(); reportCache.setUser(null); });

test('the « Annuler » offer ends after 15 s, waits while it has the focus, and closes with the view', () => {
  const changes: unknown[] = [];
  const undo = createUndo(offer => changes.push(offer));
  const offer = { id: 'c1', ref: 'DOS-1', userId: 'u1' };
  expect(undo.start(offer)).toBe(true);
  vi.advanceTimersByTime(UNDO_MS - 1);
  expect(undo.current()).toBe(offer);
  vi.advanceTimersByTime(1);
  expect(undo.current()).toBeNull();
  expect(changes).toEqual([offer, null]);
  undo.start(offer);
  undo.hold(true);
  vi.advanceTimersByTime(UNDO_MS * 3);
  expect(undo.current()).toBe(offer);
  undo.hold(false);
  vi.advanceTimersByTime(UNDO_MS);
  expect(undo.current()).toBeNull();
  undo.start(offer);
  undo.dispose();
  expect(undo.current()).toBeNull();
  expect(undo.start(offer)).toBe(false); // a request that ends after the view left offers nothing
  undo.open();
  expect(undo.start(offer)).toBe(true);
});

test('only the account that marked the reminder may take the offer, once', () => {
  const undo = createUndo(() => {});
  undo.start({ id: 'c1', ref: 'DOS-1', userId: 'u1' });
  expect(undo.take('u2')).toEqual({ offer: { id: 'c1', ref: 'DOS-1', userId: 'u1' }, allowed: false });
  expect(undo.take('u1')).toBeNull(); // withdrawn by the first attempt
  undo.start({ id: 'c1', ref: 'DOS-1', userId: 'u1' });
  expect(undo.take('u1')?.allowed).toBe(true);
});

test('« Marquer traité » then « Annuler » reopens the reminder and says so', async () => {
  requestJson.mockResolvedValue({ ok: true });
  const hook = useHook();
  await hook.complete(reminder);
  expect(requestJson).toHaveBeenCalledWith('', { action: 'complete-reminder', callId: 'c1' });
  expect(confirm).not.toHaveBeenCalled();
  expect(announce).toHaveBeenCalledWith('Rappel DOS-1 marqué traité. Vous pouvez annuler pendant 15 secondes.');
  await hook.reopen();
  expect(reopenCalls()).toEqual([['', { action: 'reopen-reminder', id: 'c1' }]]);
  expect(notify).toHaveBeenLastCalledWith({ kind: 'info', title: 'Rappel DOS-1 rouvert.' });
  await hook.reopen(); // a second tap does nothing
  expect(reopenCalls()).toHaveLength(1);
});

test('no « Annuler » when the server says the reminder was already done (alreadyDone)', async () => {
  requestJson.mockResolvedValue({ ok: true, alreadyDone: true });
  const hook = useHook();
  await hook.complete(reminder);
  expect(notify).toHaveBeenCalledWith({ kind: 'info', title: 'Rappel DOS-1 déjà marqué traité.' });
  expect(announce).not.toHaveBeenCalled();
  await hook.reopen();
  expect(reopenCalls()).toHaveLength(0);
});

test('after 15 s, or once the view is left, « Annuler » sends nothing', async () => {
  requestJson.mockResolvedValue({ ok: true });
  const hook = useHook();
  await hook.complete(reminder);
  vi.advanceTimersByTime(UNDO_MS);
  await hook.reopen();
  await hook.complete(reminder);
  hook.dismiss();
  await hook.reopen();
  expect(reopenCalls()).toHaveLength(0);
});

test('another account on this tab never reopens the reminder; a failed reopen is an error notice', async () => {
  requestJson.mockResolvedValue({ ok: true });
  const hook = useHook();
  await hook.complete(reminder);
  reportCache.setUser('u2');
  await hook.reopen();
  expect(reopenCalls()).toHaveLength(0);
  expect(notify).toHaveBeenLastCalledWith({ kind: 'error', title: 'Rappel DOS-1 non rouvert.', detail: 'Ce poste n’est plus connecté avec le compte qui l’a marqué traité.' });

  reportCache.setUser('u1');
  await hook.complete(reminder);
  requestJson.mockRejectedValueOnce(new Error('Ce résultat a été annulé : son rappel ne peut pas être rouvert.'));
  await hook.reopen();
  expect(notify).toHaveBeenLastCalledWith({ kind: 'error', title: 'Le rappel DOS-1 n’a pas pu être rouvert.', detail: 'Ce résultat a été annulé : son rappel ne peut pas être rouvert.' });
});

test('without reopen-reminder, « Marquer traité » asks first and offers no « Annuler »', async () => {
  requestJson.mockResolvedValue({ ok: true });
  const hook = useHook([]); // an older server: no 'reopen-reminder'
  await hook.complete(reminder);
  expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: 'Marquer ce rappel comme traité ?' }));
  expect(requestJson).toHaveBeenCalledWith('', { action: 'complete-reminder', callId: 'c1' });
  expect(announce).not.toHaveBeenCalled();
  await hook.reopen();
  expect(reopenCalls()).toHaveLength(0);
});
