import { PRICING_RULE } from '@touche/domain';
import request from 'supertest';
import type { TestContext } from './context.js';

export const ORIGIN = 'http://localhost:3000';

export function deskGet(ctx: TestContext, query = '', cookie?: string, headers?: Record<string, string>) {
  const req = request(ctx.server).get('/api/desk' + query);
  if (headers) req.set(headers);
  return cookie ? req.set('Cookie', cookie) : req;
}

/** `pricing`: the pricing rule the desk announces (X-Desk-Pricing); today's desk by default, null for an older tab.
 *  `headers`: any other request headers, such as X-Desk-Brands. */
export function deskPost(
  ctx: TestContext,
  body: unknown,
  opts: { cookie?: string; ip?: string; origin?: string | null; contentType?: string; raw?: string; pricing?: string | null; headers?: Record<string, string> } = {},
) {
  const req = request(ctx.server).post('/api/desk');
  if (opts.origin !== null) req.set('Origin', opts.origin ?? ORIGIN);
  req.set('Content-Type', opts.contentType ?? 'application/json');
  if (opts.pricing !== null) req.set('X-Desk-Pricing', opts.pricing ?? PRICING_RULE);
  req.set('X-Forwarded-For', opts.ip ?? '203.0.113.10');
  if (opts.cookie) req.set('Cookie', opts.cookie);
  if (opts.headers) req.set(opts.headers);
  return req.send(opts.raw ?? JSON.stringify(body));
}
