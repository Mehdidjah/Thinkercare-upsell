import { type IncomingMessage, type ServerResponse, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';

/** A TOU order as EcoManager returns it, customer data included (ThinkerCare must drop it). */
export function ecoOrder(id: number, state = 'En confirmation', extra: Record<string, unknown> = {}) {
  return {
    id, reference: `TOU${id}`, order_state_id: null, order_state_name: state, confirmation_state_name: null,
    full_name: 'Amel Sarah', telephone: '0666666666', email: 'amel@example.dz', address: 'Appartement 4',
    items: [], total: '3600', updated_at: '2026-11-20 10:00:00', ...extra,
  };
}

export type FakeEcoManager = {
  url: string;
  /** Every request path, in order. */
  calls: string[];
  /** The Authorization header of the last request. */
  lastAuthorization: () => string | undefined;
  orders: Map<number, Record<string, unknown>>;
  /** Answer every request with this status (e.g. 503), or 0 for normal answers. */
  setStatus(code: number): void;
  /** Delay every answer by this many milliseconds. */
  setDelay(ms: number): void;
  reset(): void;
  close(): Promise<void>;
};

/** A local stand-in for the EcoManager shop API: GET /api/shop/v2/orders/{id}. */
export async function startFakeEcoManager(): Promise<FakeEcoManager> {
  const orders = new Map<number, Record<string, unknown>>();
  const calls: string[] = [];
  let status = 0;
  let delay = 0;
  let authorization: string | undefined;
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    calls.push(req.url ?? '');
    authorization = req.headers.authorization;
    const answer = () => {
      const json = (code: number, body: unknown) => {
        res.writeHead(code, { 'content-type': 'application/json' });
        res.end(JSON.stringify(body));
      };
      if (status) return json(status, { message: 'Erreur simulée' });
      const match = (req.url ?? '').match(/^\/api\/shop\/v2\/orders\/(\d+)$/);
      const order = match ? orders.get(Number(match[1])) : undefined;
      if (!order) return json(404, { message: 'Not found' });
      // An order stored with __status answers that error (one failing order among others).
      if (typeof order.__status === 'number') return json(order.__status, { message: 'Erreur simulée' });
      return json(200, { data: order });
    };
    if (delay) setTimeout(answer, delay);
    else answer();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    lastAuthorization: () => authorization,
    orders,
    setStatus: (code) => { status = code; },
    setDelay: (ms) => { delay = ms; },
    reset() {
      orders.clear();
      calls.length = 0;
      status = 0;
      delay = 0;
    },
    close: () => new Promise<void>((resolve) => { server.closeAllConnections(); server.close(() => resolve()); }),
  };
}
