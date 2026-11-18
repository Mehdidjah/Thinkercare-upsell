import { reportCache } from './report-cache';
import { reportUpdates } from './report-updates';

export async function requestJson(query = '', body?: unknown, signal?: AbortSignal) {
  const action = (body as { action?: string } | undefined)?.action;
  if (action === 'login' || action === 'logout') reportCache.setUser(null);
  const response = await fetch('/api/desk' + query, {
    method: body ? 'POST' : 'GET', credentials: 'same-origin', signal,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      reportCache.setUser(null);
      if (action !== 'login' && typeof window !== 'undefined') window.dispatchEvent(new Event('desk-session-expired'));
    }
    throw Object.assign(new Error(data.error || 'Chargement impossible.'), { status: response.status });
  }
  if (body) {
    if (action === 'login' || action === 'logout') reportCache.clear();
    else reportUpdates.changed();
  }
  return data;
}
