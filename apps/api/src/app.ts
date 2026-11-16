import cors from 'cors';
import express, { type Express } from 'express';
import type { AppConfig } from './config/index.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { internalBypass } from './middlewares/internalBypass.js';
import { createRateLimiter } from './middlewares/rateLimiter.js';
import { createApiRoutes } from './routes/index.js';
import type { EventService } from './services/eventService.js';

export interface AppDependencies {
  config: AppConfig;
  eventService: EventService;
}

/**
 * Builds and configures the Express application instance without binding a port.
 * Keeping app construction separate from `server.ts` makes integration testing clean.
 */
export function createApp({ config, eventService }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');

  if (config.trustProxyHops > 0) {
    app.set('trust proxy', config.trustProxyHops);
  }

  if (config.corsOrigins.length > 0) {
    app.use(
      cors({
        origin: config.corsOrigins,
        methods: ['GET', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'x-internal-secret'],
      }),
    );
  }

  app.use(express.json({ limit: '16kb' }));

  // 1. Detect Next.js SSR internal requests via `x-internal-secret`
  app.use(internalBypass(config.internalSecret));

  // 2. Apply IP-based rate limiting (skips requests flagged by `internalBypass`)
  app.use(createRateLimiter(config.rateLimit));

  // 3. Healthcheck endpoint
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // 4. Mount domain routes (`/events`, `/cities`, and also under `/api` prefix for convenience)
  const apiRoutes = createApiRoutes(eventService);
  app.use(apiRoutes);
  app.use('/api', apiRoutes);

  // 5. 404 & Global Error Handler
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

