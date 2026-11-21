import { EcoManagerClient } from './client.js';
import { RateLimiter } from './rate-limiter.js';

const CFG = { token: 'secret-token-xyz', baseUrl: 'https://shop.test', prefix: 'TOU', timeoutMs: 50, syncIntervalMs: 0 };

/** A fake clock: sleep advances time instantly. */
function clock() {
  const c = { t: 0, now: () => c.t, sleep: async (ms: number) => { c.t += ms; } };
  return c;
}

const ORDER = {
  id: 1763816, reference: 'TOU1763816', order_state_id: 1, order_state_name: 'En confirmation',
  confirmation_state_name: 'Ne répond pas', full_name: 'Amel Sarah', telephone: '0666666666', email: 'a@b.dz',
  address: 'Appartement 4', updated_at: '2026-11-20 14:59:32',
};

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function setup(handler: (url: string, init: RequestInit) => Promise<Response> | Response) {
  const c = clock();
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => { calls.push({ url, init }); return handler(url, init); }) as unknown as typeof globalThis.fetch;
  const client = new EcoManagerClient(CFG, { fetch, now: c.now, sleep: c.sleep });
  return { client, calls, c };
}

describe('EcoManagerClient', () => {
  it('finds an order and keeps no customer data', async () => {
    const { client, calls } = setup(() => reply({ data: ORDER }));
    const r = await client.lookup('tou1763816');
    expect(r).toEqual({ status: 'found', order: {
      id: 1763816, reference: 'TOU1763816', stateId: 1, stateName: 'En confirmation', stateGroup: 'pending',
      confirmationStateName: 'Ne répond pas', updatedAt: '2026-11-20T14:59:32+01:00', deliveredAt: null,
    } });
    expect(JSON.stringify(r)).not.toMatch(/Amel|0666|Appartement|a@b/);
    expect(calls[0].url).toBe('https://shop.test/api/shop/v2/orders/1763816');
  });

  it('keeps the delivery date, in Algiers time, also once the order is « Encaissée »', async () => {
    const { client } = setup(() => reply({ data: { ...ORDER, order_state_id: 7, order_state_name: 'Encaissée', updated_at: '2026-11-03 09:12:00', delivered_at: '2026-10-27 20:46:25' } }));
    const r = await client.lookup('TOU1763816');
    expect(r.status === 'found' && r.order).toMatchObject({ stateGroup: 'delivered', updatedAt: '2026-11-03T09:12:00+01:00', deliveredAt: '2026-10-27T20:46:25+01:00' });
  });

  it('an order never delivered has no delivery date', () => {
    const { client } = setup(() => reply({}));
    expect(client.toEcoOrder({ ...ORDER, order_state_name: 'En retour', delivered_at: null })?.deliveredAt).toBeNull();
    expect(client.toEcoOrder(ORDER)?.deliveredAt).toBeNull();
  });

  it('sends the bearer token and never puts it in errors', async () => {
    const { client, calls } = setup(() => reply({ message: 'boom' }, 500));
    const r = await client.lookup('TOU1763816');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer secret-token-xyz');
    expect(r).toEqual({ status: 'unavailable', reason: 'server' });
    expect(JSON.stringify(r)).not.toContain('secret-token-xyz');
  });

  it('a different reference for the same id is not found', async () => {
    const { client } = setup(() => reply({ data: { ...ORDER, reference: 'SHT1763816' } }));
    expect(await client.lookup('TOU1763816')).toEqual({ status: 'not-found' });
  });

  it('a malformed reference is not found without a request', async () => {
    const { client, calls } = setup(() => reply({ data: ORDER }));
    expect(await client.lookup('DOS-0142')).toEqual({ status: 'not-found' });
    expect(calls).toHaveLength(0);
  });

  it('404 is not found and cached for two minutes', async () => {
    const { client, calls, c } = setup(() => reply({ message: 'Not found' }, 404));
    expect(await client.lookup('TOU1234567')).toEqual({ status: 'not-found' });
    c.t += 119_000;
    await client.lookup('TOU1234567');
    expect(calls).toHaveLength(1);
    c.t += 2_000;
    await client.lookup('TOU1234567');
    expect(calls).toHaveLength(2);
  });

  it('a found order is cached for ten minutes, and remember() refreshes it', async () => {
    const { client, calls, c } = setup(() => reply({ data: ORDER }));
    await client.lookup('TOU1763816');
    c.t += 599_000;
    await client.lookup('TOU1763816');
    expect(calls).toHaveLength(1);
    client.remember({ id: 1763816, reference: 'TOU1763816', stateId: 5, stateName: 'Livrée', stateGroup: 'delivered', confirmationStateName: null, updatedAt: null, deliveredAt: null });
    const r = await client.lookup('TOU1763816');
    expect(r.status === 'found' && r.order.stateGroup).toBe('delivered');
    expect(calls).toHaveLength(1);
  });

  it('a leading zero reads the same order and shares its answer', async () => {
    const { client, calls } = setup(() => reply({ data: ORDER }));
    expect((await client.lookup('TOU01763816')).status).toBe('found');
    expect((await client.lookup('TOU1763816')).status).toBe('found');
    expect(calls).toHaveLength(1);
  });

  it('dedupes concurrent lookups of one id', async () => {
    const { client, calls } = setup(() => reply({ data: ORDER }));
    const [a, b] = await Promise.all([client.lookup('TOU1763816'), client.lookup('1763816')]);
    expect(a).toEqual(b);
    expect(calls).toHaveLength(1);
  });

  it('429 retries once after Retry-After', async () => {
    let n = 0;
    const { client, calls, c } = setup(() => (n++ === 0 ? reply({ message: 'Too Many' }, 429, { 'retry-after': '3' }) : reply({ data: ORDER })));
    const r = await client.lookup('TOU1763816');
    expect(r.status).toBe('found');
    expect(calls).toHaveLength(2);
    expect(c.t).toBeGreaterThanOrEqual(3_000);
  });

  it('a second 429 is unavailable', async () => {
    const { client, calls } = setup(() => reply({ message: 'Too Many' }, 429));
    expect(await client.lookup('TOU1763816')).toEqual({ status: 'unavailable', reason: 'rate-limited' });
    expect(calls).toHaveLength(2);
  });

  it('5xx, network error and timeout are unavailable', async () => {
    expect(await setup(() => reply('<html>', 502)).client.lookup('TOU1763816')).toEqual({ status: 'unavailable', reason: 'server' });
    expect(await setup(() => { throw new TypeError('fetch failed'); }).client.lookup('TOU1763816')).toEqual({ status: 'unavailable', reason: 'network' });
    const slow = setup((_url, init) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    expect(await slow.client.lookup('TOU1763816')).toEqual({ status: 'unavailable', reason: 'timeout' });
  });

  it('an unavailable answer is not cached', async () => {
    let n = 0;
    const { client, calls } = setup(() => (n++ === 0 ? reply('down', 503) : reply({ data: ORDER })));
    expect((await client.lookup('TOU1763816')).status).toBe('unavailable');
    expect((await client.lookup('TOU1763816')).status).toBe('found');
    expect(calls).toHaveLength(2);
  });
});

describe('RateLimiter', () => {
  const WINDOWS = [{ perMs: 1_000, max: 4 }, { perMs: 60_000, max: 45 }, { perMs: 3_600_000, max: 900 }, { perMs: 86_400_000, max: 9_000 }];
  const within = (stamps: number[], from: number, ms: number) => stamps.filter(s => s >= from && s < from + ms).length;

  it('the limiter never exceeds 4 per second or 45 per minute', async () => {
    const c = clock();
    const limiter = new RateLimiter(WINDOWS, c.now, c.sleep);
    const stamps: number[] = [];
    for (let i = 0; i < 60; i++) {
      expect(await limiter.take(120_000)).toBe(true);
      stamps.push(c.t);
    }
    for (const s of stamps) {
      expect(within(stamps, s, 1_000)).toBeLessThanOrEqual(4);
      expect(within(stamps, s, 60_000)).toBeLessThanOrEqual(45);
    }
  });

  it('gives up after the longest wait', async () => {
    const c = clock();
    const limiter = new RateLimiter([{ perMs: 60_000, max: 1 }], c.now, c.sleep);
    expect(await limiter.take(10_000)).toBe(true);
    expect(await limiter.take(10_000)).toBe(false);
  });

  it('the background lane leaves half of every window to live checks', async () => {
    const c = clock();
    const limiter = new RateLimiter(WINDOWS, c.now, c.sleep);
    const stamps: number[] = [];
    for (let i = 0; i < 40; i++) {
      expect(await limiter.take(120_000, 'background')).toBe(true);
      stamps.push(c.t);
    }
    for (const s of stamps) {
      expect(within(stamps, s, 1_000)).toBeLessThanOrEqual(2);
      expect(within(stamps, s, 60_000)).toBeLessThanOrEqual(22);
    }
    const before = c.t;
    expect(await limiter.take(1_000, 'live')).toBe(true);
    expect(c.t - before).toBeLessThanOrEqual(1_000);
  });
});
