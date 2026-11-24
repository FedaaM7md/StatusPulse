/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { serveStatic } from '@hono/node-server/serve-static';
import type { AppConfig } from './config';
import type { Db } from './db';
import type { Logger } from './lib/logger';
import { createLogger, silentLogger } from './lib/logger';
import { createRateLimiter } from './lib/rate-limit';
import type { Scheduler } from './services/scheduler';
import { createAdminRoutes } from './api/admin-routes';
import { createAuthRoutes } from './api/auth-routes';
import { buildPublicStatus, createPublicRoutes } from './api/public-routes';
import { clientIp, securityHeaders, type AppEnv } from './api/middleware';

export interface AppDeps {
  db: Db;
  config: AppConfig;
  scheduler?: Scheduler | null;
  logger?: Logger;
  /** Override for tests. */
  webRoot?: string;
}

export function createApp(deps: AppDeps): Hono<AppEnv> {
  const { db, config } = deps;
  const logger = deps.logger ?? silentLogger();
  const scheduler = deps.scheduler ?? null;
  const app = new Hono<AppEnv>();

  const publicLimiter = createRateLimiter({ windowMs: 60_000, max: 240 });

  app.use('*', securityHeaders(config));

  app.use('/api/*', async (c, next) => {
    const started = Date.now();
    await next();
    logger.debug('API request', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Date.now() - started,
    });
  });

  app.use('/api/*', async (c, next) => {
    await next();
    if (c.req.path.startsWith('/api/auth/')) c.header('Cache-Control', 'no-store');
  });

  // Public read-only endpoints get a generous ceiling so a status page can poll
  // every 30 seconds without ever hitting it.
  app.use('/api/public/*', async (c, next) => {
    const limited = publicLimiter(`public:${clientIp(c)}`);
    if (!limited.allowed) {
      c.header('Retry-After', String(Math.ceil(limited.retryAfterMs / 1000)));
      return c.json(
        {
          error: 'RATE_LIMITED',
          message: 'errors.rateLimited',
          retryAfterSeconds: Math.ceil(limited.retryAfterMs / 1000),
        },
        429,
      );
    }
    await next();
  });

  app.use(
    '/api/*',
    bodyLimit({
      maxSize: 256 * 1024,
      onError: (c) => c.json({ error: 'PAYLOAD_TOO_LARGE', message: 'errors.validation' }, 413),
    }),
  );

  app.route('/api/auth', createAuthRoutes(db, config, logger));
  app.route('/api/admin', createAdminRoutes(db, config, scheduler, logger));
  app.route('/api/public', createPublicRoutes(db, config));

  app.all('/api/*', (c) => c.json({ error: 'NOT_FOUND', message: 'errors.notFound' }, 404));

  app.onError((error, c) => {
    logger.error('Unhandled request error', {
      path: c.req.path,
      method: c.req.method,
      error: error instanceof Error ? error.message : String(error),
    });
    return c.json(
      {
        error: 'INTERNAL_ERROR',
        message: config.debug && error instanceof Error ? error.message : 'errors.generic',
      },
      500,
    );
  });

  const webRoot = deps.webRoot ? path.resolve(deps.webRoot) : path.resolve('dist/web');
  const indexFile = path.join(webRoot, 'index.html');

  app.use('/assets/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('/fonts/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });

  app.use('/assets/*', serveStatic({ root: webRoot }));
  app.use('/fonts/*', serveStatic({ root: webRoot }));
  app.use('/favicon.svg', serveStatic({ root: webRoot }));
  app.use('/og.png', serveStatic({ root: webRoot }));
  app.use('/robots.txt', serveStatic({ root: webRoot }));

  app.get('*', (c) => {
    if (c.req.path.startsWith('/api/')) return c.json({ error: 'NOT_FOUND' }, 404);
    if (existsSync(indexFile)) {
      c.header('Cache-Control', 'no-cache');
      const html = readFileSync(indexFile, 'utf8');
      if (c.req.path === '/') {
        const bootstrap = {
          status: buildPublicStatus(db, config),
          config: {
            demoMode: config.demoMode,
            productName: 'StatusPulse',
            demoResetMinutes: config.demoResetMinutes,
          },
        };
        const json = JSON.stringify(bootstrap).replace(/</g, '\\u003c');
        return c.html(
          html.replace('</body>', `<script id="sp-bootstrap" type="application/json">${json}</script></body>`),
        );
      }
      return c.html(html);
    }
    return c.html(
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>StatusPulse</title></head>
       <body style="font-family:system-ui;padding:40px;max-width:640px;margin:auto">
       <h1>StatusPulse</h1>
       <p>The frontend has not been built yet. Run <code>npm run build</code> and restart the server.</p>
       </body></html>`,
      503,
    );
  });

  return app;
}

export function createDefaultLogger(config: AppConfig): Logger {
  return createLogger(config.debug);
}
