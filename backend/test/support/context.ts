import type { Server } from 'node:http';
import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/app.setup.js';
import { ENV, type Env, loadEnv } from '../../src/config/env.js';
import type { Db } from '../../src/db/schema.js';
import { openDb, testDatabaseUrl } from './database.js';

export interface TestContext {
  app: NestExpressApplication;
  server: Server;
  db: Db;
  env: Env;
  close(): Promise<void>;
}

export async function createTestApp(overrides: Partial<Env> = {}, extraControllers: Type[] = []): Promise<TestContext> {
  const env: Env = { ...loadEnv({ DATABASE_URL: testDatabaseUrl(), NODE_ENV: 'test' }), ...overrides };
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers: extraControllers })
    .overrideProvider(ENV)
    .useValue(env)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  configureApp(app, env);
  await app.init();
  const handle = openDb(env.databaseUrl);
  return {
    app,
    server: app.getHttpServer() as Server,
    db: handle.db,
    env,
    async close() {
      await app.close();
      await handle.close();
    },
  };
}
