export type Lane = 'live' | 'background';
export type Window = { perMs: number; max: number };

/** EcoManager quotas with a safety margin (5/s, 50/min, 1000/h, 10000/day documented). */
export const ECOMANAGER_WINDOWS: Window[] = [
  { perMs: 1_000, max: 4 },
  { perMs: 60_000, max: 45 },
  { perMs: 3_600_000, max: 900 },
  { perMs: 86_400_000, max: 9_000 },
];

/**
 * Sliding-window limiter shared by every request of this process. The background lane (catch-up of
 * recorded calls) only takes a slot while each window is under half its maximum, so live order
 * checks during a call always find room.
 */
export class RateLimiter {
  private readonly stamps: number[] = [];

  constructor(
    private readonly windows: Window[],
    private readonly now: () => number = Date.now,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  ) {}

  /** Waits for a slot, at most `maxWaitMs`; false when none frees up in time. */
  async take(maxWaitMs: number, lane: Lane = 'live'): Promise<boolean> {
    const started = this.now();
    for (;;) {
      const t = this.now();
      const longest = Math.max(...this.windows.map((w) => w.perMs));
      while (this.stamps.length && this.stamps[0]! <= t - longest) this.stamps.shift();
      let wait = 0;
      for (const w of this.windows) {
        const limit = lane === 'background' ? Math.floor(w.max / 2) : w.max;
        const inWindow = this.stamps.filter((s) => s > t - w.perMs);
        if (inWindow.length >= limit) wait = Math.max(wait, inWindow[inWindow.length - limit]! + w.perMs - t);
      }
      if (wait === 0) {
        this.stamps.push(t);
        return true;
      }
      if (t + wait - started > maxWaitMs) return false;
      await this.sleep(wait);
    }
  }
}
