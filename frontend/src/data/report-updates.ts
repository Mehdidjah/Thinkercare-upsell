import { reportCache } from './report-cache';

export const REPORT_REFRESH_MS = 30_000;

/** One refresh clock per tab; messages contain no account or report data. */
export class ReportUpdates {
  private revision = 0;
  private listeners = new Set<() => void>();
  private stop?: () => void;
  private channel?: BroadcastChannel;
  private lastAutomatic = 0;

  getSnapshot = () => this.revision;

  refresh = () => {
    this.revision++;
    this.listeners.forEach(listener => listener());
  };

  private connect() {
    if (this.channel || typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return;
    try {
      this.channel = new BroadcastChannel('touche-report-updates');
      this.channel.onmessage = event => {
        if (event.data !== 'changed') return;
        reportCache.clear();
        this.refresh();
      };
    } catch { /* Focus and periodic refresh also work without cross-tab messaging. */ }
  }

  changed = () => {
    reportCache.clear();
    this.refresh();
    this.connect();
    this.channel?.postMessage('changed');
  };

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    if (!this.stop && typeof window !== 'undefined') {
      this.connect();
      const automatic = () => {
        if (document.visibilityState === 'hidden' || Date.now() - this.lastAutomatic < 1000) return;
        this.lastAutomatic = Date.now();
        this.refresh();
      };
      const timer = setInterval(automatic, REPORT_REFRESH_MS);
      window.addEventListener('focus', automatic);
      window.addEventListener('online', automatic);
      document.addEventListener('visibilitychange', automatic);
      this.stop = () => {
        clearInterval(timer);
        window.removeEventListener('focus', automatic);
        window.removeEventListener('online', automatic);
        document.removeEventListener('visibilitychange', automatic);
      };
    }
    return () => {
      this.listeners.delete(listener);
      if (!this.listeners.size) { this.stop?.(); this.stop = undefined; }
    };
  };

  dispose() {
    this.stop?.();
    this.stop = undefined;
    this.channel?.close();
    this.channel = undefined;
    this.listeners.clear();
  }
}

export const reportUpdates = new ReportUpdates();
