import cors from 'cors';
import express, { type Express } from 'express';
import type { AppConfig } from './config/index.js';
import { errorHandler, methodNotAllowed, notFoundHandler } from './middlewares/errorHandler.js';
import { internalBypass } from './middlewares/internalBypass.js';
import { createRateLimiter } from './middlewares/rateLimiter.js';
import { requestIdMiddleware } from './middlewares/requestId.js';
import { createApiRoutes } from './routes/index.js';
import type { EventService } from './services/eventService.js';

export interface AppDependencies {
  config: AppConfig;
  eventService: EventService;
}

export function createApp({ config, eventService }: AppDependencies): Express {
  const app = express();

  app.disable('x-powered-by');
  app.use(requestIdMiddleware);

  if (config.trustProxyHops > 0) {
    app.set('trust proxy', config.trustProxyHops);
  }

  if (config.corsOrigins.length > 0) {
    app.use(
      cors({
        origin: config.corsOrigins,
        methods: ['GET', 'PATCH', 'OPTIONS'],
        allowedHeaders: [
          'Content-Type',
          'x-internal-secret',
          'x-client-ip',
          'x-rate-limit-counted',
          'x-request-id',
        ],
        exposedHeaders: ['x-request-id'],
      }),
    );
  }

  app.use(express.json({ limit: '16kb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.all('/health', methodNotAllowed('GET, HEAD'));

  app.use(internalBypass(config.internalSecret));
  app.use(createRateLimiter(config.rateLimit));

  app.get('/rate-limit', (_req, res) => {
    res.status(204).end();
  });
  app.all('/rate-limit', methodNotAllowed('GET, HEAD'));

  const apiRoutes = createApiRoutes(eventService);
  app.use(apiRoutes);
  app.use('/api', apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
