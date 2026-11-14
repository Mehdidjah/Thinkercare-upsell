import { loadEnv } from './env.js';

const url = 'postgresql://u@h/db';

it('requires DATABASE_URL', () => expect(() => loadEnv({})).toThrow(/DATABASE_URL/));
it('rejects a non-PostgreSQL URL', () => expect(() => loadEnv({ DATABASE_URL: 'mysql://x' })).toThrow(/DATABASE_URL/));
it('development defaults', () =>
  expect(loadEnv({ DATABASE_URL: url })).toMatchObject({
    nodeEnv: 'development',
    port: 3000,
    trustProxy: 1,
    appOrigins: ['http://localhost:3000', 'http://localhost:5173'],
  }));
it('requires APP_ORIGIN in production', () =>
  expect(() => loadEnv({ DATABASE_URL: url, NODE_ENV: 'production' })).toThrow(/APP_ORIGIN/));
it('parses a comma-separated origin list', () =>
  expect(
    loadEnv({
      DATABASE_URL: url,
      NODE_ENV: 'production',
      APP_ORIGIN: 'https://conseil.touche.dz, https://touche.up.railway.app',
    }).appOrigins,
  ).toEqual(['https://conseil.touche.dz', 'https://touche.up.railway.app']));
it('rejects an origin with a path', () =>
  expect(() => loadEnv({ DATABASE_URL: url, APP_ORIGIN: 'https://conseil.touche.dz/app' })).toThrow(/APP_ORIGIN/));
it('static dir defaults to frontend/dist', () =>
  expect(loadEnv({ DATABASE_URL: url }).staticDir).toMatch(/frontend[\\/]dist$/));
