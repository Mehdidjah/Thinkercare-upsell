type Entry = {
  value?: unknown;
  expiresAt: number;
  loadedAt?: number;
  pending?: Promise<unknown>;
  controller: AbortController;
};

/** Short-lived, in-memory reports. Never persisted or used for passwords/bootstrap. */
export class ReportCache {
  private entries = new Map<string, Entry>();
  private user: string | null = null;

  constructor(private ttl = 30_000, private limit = 8) {}

  setUser(id: string | null) {
    if (id === null || id !== this.user) this.clear();
    this.user = id;
  }

  clear() {
    for (const entry of this.entries.values()) entry.controller.abort();
    this.entries.clear();
  }

  peek<T>(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (entry && entry.expiresAt > Date.now()) return entry.value as T;
  }

  /** When the fresh value of `key` was loaded (ISO), so a reused report can say how old it is. */
  loadedAt(key: string): string | undefined {
    const entry = this.entries.get(key);
    if (entry?.loadedAt && entry.expiresAt > Date.now()) return new Date(entry.loadedAt).toISOString();
  }

  load<T>(key: string, loader: (signal: AbortSignal) => Promise<T>, force = false): Promise<T> {
    const current = this.entries.get(key);
    if (current?.pending) return current.pending as Promise<T>;
    const value = this.peek<T>(key);
    if (!force && value !== undefined) return Promise.resolve(value);

    // Expired reports and old selections must not accumulate in memory.
    for (const [oldKey, entry] of this.entries) {
      if (!entry.pending && entry.expiresAt <= Date.now()) this.entries.delete(oldKey);
    }
    this.entries.delete(key);
    while (this.entries.size >= this.limit) {
      const oldest = this.entries.keys().next().value!;
      this.entries.get(oldest)!.controller.abort();
      this.entries.delete(oldest);
    }
    const entry: Entry = { expiresAt: 0, controller: new AbortController() };
    this.entries.set(key, entry);
    entry.pending = Promise.resolve().then(() => loader(entry.controller.signal)).then(data => {
      // Logout, a mutation or an account change can invalidate a response in flight.
      if (entry.controller.signal.aborted || this.entries.get(key) !== entry) {
        throw new DOMException('Report invalidated', 'AbortError');
      }
      entry.value = data;
      entry.loadedAt = Date.now();
      entry.expiresAt = entry.loadedAt + this.ttl;
      entry.pending = undefined;
      return data;
    }).catch(error => {
      if (this.entries.get(key) === entry) this.entries.delete(key);
      throw error;
    });
    return entry.pending as Promise<T>;
  }
}

export const reportCache = new ReportCache();
