import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SECURITY_HEADERS } from '../src/common/security.js';
import { type TestContext, createTestApp } from './support/context.js';
import { deskGet, deskPost } from './support/desk.js';

let ctx: TestContext;
beforeAll(async () => {
  const staticDir = mkdtempSync(join(tmpdir(), 'touche-static-'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><title>ThinkerCare</title>');
  ctx = await createTestApp({ staticDir });
});
afterAll(() => ctx.close());

describe('/api/desk envelope', () => {
  it('health works without a session', async () => {
    const res = await deskGet(ctx, '?action=health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, app: 'ThinkerCare' });
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it('GET without a session is 401', async () => {
    const res = await deskGet(ctx);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Connectez-vous pour accéder à cet espace.' });
  });
  it('POST without Origin is 403', async () => {
    const res = await deskPost(ctx, { action: 'x' }, { origin: null });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Origine de requête non autorisée.' });
  });
  it('POST from a foreign Origin is 403', async () => {
    const res = await deskPost(ctx, { action: 'x' }, { origin: 'https://evil.example' });
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Origine de requête non autorisée.' });
  });
  it('POST with a non-JSON content type is 415', async () => {
    const res = await deskPost(ctx, { action: 'x' }, { contentType: 'text/plain' });
    expect(res.status).toBe(415);
    expect(res.body).toEqual({ error: 'Format non pris en charge.' });
  });
  it('POST over 28 000 characters is 413', async () => {
    const res = await deskPost(ctx, null, { raw: JSON.stringify({ a: 'x'.repeat(27_990) }).padEnd(28_001, ' ') });
    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'Requête trop volumineuse.' });
  });
  it('POST invalid JSON is 400', async () => {
    const res = await deskPost(ctx, null, { raw: '{' });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Données invalides.' });
  });
  it.each(['null', '[]', '42', '"login"'])('POST of a JSON value that is not an object (%s) is 400', async (raw) => {
    const res = await deskPost(ctx, null, { raw });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Données invalides.' });
  });
  it('POST without a session is 401', async () => {
    const res = await deskPost(ctx, { action: 'save-call' });
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Votre session a expiré. Reconnectez-vous.' });
  });
});

describe('HTTP shell', () => {
  it('security headers on API and static responses', async () => {
    for (const res of [await deskGet(ctx, '?action=health'), await request(ctx.server).get('/')]) {
      for (const [name, value] of Object.entries(SECURITY_HEADERS)) expect(res.headers[name.toLowerCase()]).toBe(value);
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow, noarchive');
    }
  });
  it('responses do not advertise the framework', async () => {
    for (const res of [await request(ctx.server).get('/healthz'), await deskGet(ctx, '?action=health')]) {
      expect(res.status).toBe(200);
      expect(res.headers).not.toHaveProperty('x-powered-by');
    }
  });
  it('trailing slash redirects with 301', async () => {
    const res = await request(ctx.server).get('/foo/?a=1').redirects(0);
    expect(res.status).toBe(301);
    expect(res.headers.location.endsWith('/foo?a=1')).toBe(true);
  });
  it('healthz checks the database', async () => {
    const res = await request(ctx.server).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['cache-control']).toBe('no-store');
  });
  it('serves the SPA index and an HTML 404 for other pages', async () => {
    const index = await request(ctx.server).get('/');
    expect(index.status).toBe(200);
    expect(index.headers['content-type']).toContain('text/html');
    expect(index.text).toContain('ThinkerCare');
    const missing = await request(ctx.server).get('/nope');
    expect(missing.status).toBe(404);
    expect(missing.headers['content-type']).toContain('text/html');
    expect(missing.text).toContain('Cette page n’existe pas.');
    const api = await request(ctx.server).get('/api/nope');
    expect(api.status).toBe(404);
    expect(api.headers['content-type']).toContain('application/json');
  });
});
