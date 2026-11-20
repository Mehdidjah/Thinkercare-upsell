import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { Env } from './config/env.js';
import { sendJson } from './common/http.js';
import { PageExceptionFilter } from './common/page-exception.filter.js';
import { securityHeaders, stripTrailingSlash } from './common/security.js';

export function configureApp(app: NestExpressApplication, env: Env): void {
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy);
  app.use(securityHeaders);
  app.use(stripTrailingSlash);
  app.use('/api/desk', express.text({ type: () => true, limit: '1mb' }));
  // EcoManager webhooks are signed over the raw body, so it is kept as text.
  app.use('/api/ecomanager', express.text({ type: () => true, limit: '1mb' }));
  app.use('/api/desk', (err: unknown, _req: Request, res: Response, next: NextFunction) => {
    const type = (err as { type?: unknown } | null)?.type;
    if (typeof type !== 'string') return next(err);
    if (type === 'entity.too.large') return sendJson(res, { error: 'Requête trop volumineuse.' }, 413);
    return sendJson(res, { error: 'Données invalides.' }, 400);
  });
  if (existsSync(join(env.staticDir, 'index.html'))) app.useStaticAssets(env.staticDir, { redirect: false });
  app.useGlobalFilters(new PageExceptionFilter());
  app.enableShutdownHooks();
}
