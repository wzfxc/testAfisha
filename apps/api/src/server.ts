import 'dotenv/config';
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config/index.js';
import { createGracefulShutdown } from './lib/shutdown.js';
import { logger } from './lib/logger.js';
import { EventService } from './services/eventService.js';
import { EventStore } from './services/eventStore.js';

const DEFAULT_DATA_FILE = new URL('../data/events.json', import.meta.url);
const DEFAULT_SEED_FILE = new URL('../data/events.seed.json', import.meta.url);

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const runtimeFile = config.dataFile ?? DEFAULT_DATA_FILE;
  const seedFile = config.seedFile ?? DEFAULT_SEED_FILE;

  const store = new EventStore({
    minDelayMs: config.db.minDelayMs,
    maxDelayMs: config.db.maxDelayMs,
  });
  await store.load(runtimeFile, seedFile);
  logger.info(`[startup] Loaded ${store.size} events into memory`);

  const eventService = new EventService(store, {
    max: config.cache.maxEntries,
    ttlMs: config.cache.ttlMs,
  });
  const app = createApp({ config, eventService });

  const server: Server = app.listen(config.port, () => {
    logger.info(`[startup] Server listening on http://localhost:${config.port} (${config.nodeEnv})`);
  });

  const shutdown = createGracefulShutdown({
    server,
    store,
    timeoutMs: config.shutdownTimeoutMs,
    onExit: (code) => process.exit(code),
  });

  process.on('SIGTERM', () => void shutdown('SIGTERM', 0));
  process.on('SIGINT', () => void shutdown('SIGINT', 0));
  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('[fatal] Unhandled Promise rejection:', reason);
    void shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (err: Error) => {
    logger.error('[fatal] Uncaught exception:', err);
    void shutdown('uncaughtException', 1);
  });
}

bootstrap().catch((err: unknown) => {
  logger.error('[fatal] Failed to start server:', err);
  process.exit(1);
});
