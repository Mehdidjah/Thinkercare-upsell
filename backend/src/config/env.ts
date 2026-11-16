import { resolve } from 'node:path';

export const ENV = Symbol('ENV');

export interface Env {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  appOrigins: string[];
  trustProxy: number;
  staticDir: string;
  accountPasswordKey?: string;
}

const DEFAULT_ORIGINS = ['http://localhost:3000', 'http://localhost:5173'];

function integer(name: string, raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = raw.trim();
  if (!/^\d+$/.test(value)) throw new Error(`${name} doit être un entier positif ou nul.`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) throw new Error(`${name} doit être compris entre ${min} et ${max}.`);
  return parsed;
}

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const databaseUrl = source.DATABASE_URL?.trim() ?? '';
  if (!databaseUrl) throw new Error('DATABASE_URL est obligatoire.');
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error('DATABASE_URL doit commencer par postgres:// ou postgresql://.');
  }

  const rawNodeEnv = source.NODE_ENV?.trim() || 'development';
  if (rawNodeEnv !== 'development' && rawNodeEnv !== 'test' && rawNodeEnv !== 'production') {
    throw new Error('NODE_ENV doit valoir development, test ou production.');
  }
  const nodeEnv = rawNodeEnv;

  let appOrigins = DEFAULT_ORIGINS;
  const rawOrigins = source.APP_ORIGIN?.trim();
  if (rawOrigins) {
    appOrigins = rawOrigins.split(',').map((item) => item.trim());
    for (const item of appOrigins) {
      let origin: string | undefined;
      try {
        origin = new URL(item).origin;
      } catch {
        origin = undefined;
      }
      if (origin !== item) throw new Error(`APP_ORIGIN contient une origine invalide : « ${item} ».`);
    }
  } else if (nodeEnv === 'production') {
    throw new Error('APP_ORIGIN est obligatoire en production.');
  }

  const accountPasswordKey = source.ACCOUNT_PASSWORD_KEY?.trim() || undefined;
  if (accountPasswordKey && !/^[a-f0-9]{64}$/i.test(accountPasswordKey)) {
    throw new Error('ACCOUNT_PASSWORD_KEY doit contenir 64 caractères hexadécimaux.');
  }

  return {
    nodeEnv,
    port: integer('PORT', source.PORT, 3000, 0, 65535),
    databaseUrl,
    appOrigins,
    trustProxy: integer('TRUST_PROXY', source.TRUST_PROXY, 1, 0, Number.MAX_SAFE_INTEGER),
    staticDir: source.STATIC_DIR?.trim() || resolve(import.meta.dirname, '../../../frontend/dist'),
    accountPasswordKey,
  };
}
