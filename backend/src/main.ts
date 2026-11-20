import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { loadEnv } from './config/env.js';
import { runMigrations } from './db/migrate.js';
import { start } from './start.js';

async function bootstrap() {
  const env = loadEnv();
  await start(env, {
    migrate: runMigrations,
    listen: async (port) => {
      const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
      configureApp(app, env);
      await app.listen(port, '0.0.0.0');
    },
  });
}
await bootstrap();
