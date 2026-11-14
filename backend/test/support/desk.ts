import request from 'supertest';
import type { TestContext } from './context.js';

export const ORIGIN = 'http://localhost:3000';

export function deskGet(ctx: TestContext, query = '', cookie?: string) {
  const req = request(ctx.server).get('/api/desk' + query);
  return cookie ? req.set('Cookie', cookie) : req;
}

export function deskPost(
  ctx: TestContext,
  body: unknown,
  opts: { cookie?: string; ip?: string; origin?: string | null; contentType?: string; raw?: string } = {},
) {
  const req = request(ctx.server).post('/api/desk');
  if (opts.origin !== null) req.set('Origin', opts.origin ?? ORIGIN);
  req.set('Content-Type', opts.contentType ?? 'application/json');
  req.set('X-Forwarded-For', opts.ip ?? '203.0.113.10');
  if (opts.cookie) req.set('Cookie', opts.cookie);
  return req.send(opts.raw ?? JSON.stringify(body));
}
