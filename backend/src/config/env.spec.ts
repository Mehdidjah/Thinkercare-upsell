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

describe('EcoManager', () => {
  it('ecomanager is absent without a token', () => {
    expect(loadEnv({ DATABASE_URL: url }).ecomanager).toBeUndefined();
    expect(loadEnv({ DATABASE_URL: url, ECOMANAGER_API_TOKEN: '  ' }).ecomanager).toBeUndefined();
  });
  it('reads token, base URL, prefix and secret', () => {
    expect(loadEnv({ DATABASE_URL: url, ECOMANAGER_API_TOKEN: ' tok ' }).ecomanager).toEqual({
      token: 'tok', baseUrl: 'https://thinkercaregroup.ecomanager.dz', prefix: 'TOU', webhookSecret: undefined, timeoutMs: 8000, syncIntervalMs: 120000,
    });
    expect(loadEnv({
      DATABASE_URL: url, ECOMANAGER_API_TOKEN: 'tok', ECOMANAGER_BASE_URL: 'https://shop.ecomanager.dz/', ECOMANAGER_REFERENCE_PREFIX: 'sht',
      ECOMANAGER_WEBHOOK_SECRET: '0123456789abcdef0123', ECOMANAGER_SYNC: 'off',
    }).ecomanager).toEqual({
      token: 'tok', baseUrl: 'https://shop.ecomanager.dz', prefix: 'SHT', webhookSecret: '0123456789abcdef0123', timeoutMs: 8000, syncIntervalMs: 0,
    });
  });
  it('rejects a non-https base URL in production', () =>
    expect(() => loadEnv({
      DATABASE_URL: url, NODE_ENV: 'production', APP_ORIGIN: 'https://x.dz', ECOMANAGER_API_TOKEN: 'tok', ECOMANAGER_BASE_URL: 'http://shop.ecomanager.dz',
    })).toThrow('ECOMANAGER_BASE_URL doit commencer par https:// en production.'));
  it('rejects a short webhook secret and a bad prefix', () => {
    expect(() => loadEnv({ DATABASE_URL: url, ECOMANAGER_API_TOKEN: 'tok', ECOMANAGER_WEBHOOK_SECRET: 'short' })).toThrow(/ECOMANAGER_WEBHOOK_SECRET/);
    expect(() => loadEnv({ DATABASE_URL: url, ECOMANAGER_API_TOKEN: 'tok', ECOMANAGER_REFERENCE_PREFIX: 'T0U' })).toThrow(/ECOMANAGER_REFERENCE_PREFIX/);
  });
});

it('migrates on start unless MIGRATE_ON_START=off', () => {
  expect(loadEnv({ DATABASE_URL: url }).migrateOnStart).toBe(true);
  expect(loadEnv({ DATABASE_URL: url, MIGRATE_ON_START: 'off' }).migrateOnStart).toBe(false);
});
