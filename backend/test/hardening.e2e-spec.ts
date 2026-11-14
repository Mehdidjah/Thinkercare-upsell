import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { type IncomingMessage, request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Controller, Get, Logger } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SECURITY_HEADERS } from '../src/common/security.js';
import { type TestContext, createTestApp } from './support/context.js';
import { deskPost } from './support/desk.js';

@Controller()
class BoomController {
  @Get('boom-page')
  page(): never {
    throw new Error('Failed query: select 1\nparams: secret-hash');
  }
  @Get('api/boom')
  api(): never {
    throw new Error('boom');
  }
}

let ctx: TestContext;
beforeAll(async () => {
  const staticDir = mkdtempSync(join(tmpdir(), 'touche-static-'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>Touché Conseil</title>');
  mkdirSync(join(staticDir, 'assets'));
  writeFileSync(join(staticDir, 'assets', 'a.js'), '1');
  ctx = await createTestApp({ staticDir }, [BoomController]);
});
afterAll(() => ctx.close());

describe('HTTP shell hardening', () => {
  it('does not redirect scheme-relative paths off-site', async () => {
    const res = await request(ctx.server).get('//x//evil.example/').redirects(0);
    expect(res.status).toBe(301);
    expect(res.headers.location.startsWith('//')).toBe(false);
  });
  it('does not redirect an absolute-form request target off-site', async () => {
    // supertest cannot send an absolute-form target, so speak HTTP directly to the test server.
    const server = ctx.server;
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    try {
      const { port } = server.address() as AddressInfo;
      const res = await new Promise<IncomingMessage>((done, fail) => {
        const req = httpRequest({ host: '127.0.0.1', port, method: 'GET', path: 'http://evil.example/foo/' }, done);
        req.on('error', fail);
        req.end();
      });
      res.resume();
      expect(res.headers.location ?? '').not.toMatch(/^http:\/\/evil\.example/);
    } finally {
      await new Promise((done) => server.close(done));
    }
  });
  it('a static directory without slash is a 404 page with the CSP intact', async () => {
    const res = await request(ctx.server).get('/assets').redirects(0);
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['content-security-policy']).toBe(SECURITY_HEADERS['Content-Security-Policy']);
  });
  it('a POST body over 1 MB uses the desk envelope', async () => {
    const res = await deskPost(ctx, null, { raw: 'x'.repeat(1_100_000) });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Requête trop volumineuse.' });
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it('a page that throws renders the HTML error page', async () => {
    const res = await request(ctx.server).get('/boom-page');
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Le service est temporairement indisponible.');
    expect(res.text).not.toContain('secret-hash');
  });
  it('an API route that throws is JSON, no-store', async () => {
    const res = await request(ctx.server).get('/api/boom');
    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('health check', () => {
  it('a database outage is a 503 and logs a one-line description', async () => {
    const down = await createTestApp({ databaseUrl: 'postgresql://postgres@127.0.0.1:1/touche_test' });
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const res = await request(down.server).get('/healthz');
      expect(res.status).toBe(503);
      expect(res.body).toEqual({ ok: false });
      expect(logged).toHaveBeenCalledTimes(1);
      const [line] = logged.mock.calls[0]!;
      expect(line).toMatch(/\(cause ECONNREFUSED\)/);
      expect(line).not.toContain('\n');
    } finally {
      logged.mockRestore();
      await down.close();
    }
  });
});
