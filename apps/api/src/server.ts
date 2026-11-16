import 'dotenv/config';
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config/index.js';
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
  console.log(`[startup] Loaded ${store.size} events into memory`);

  const eventService = new EventService(store, {
    max: config.cache.maxEntries,
    ttlMs: config.cache.ttlMs,
  });
  const app = createApp({ config, eventService });

  const server: Server = app.listen(config.port, () => {
    console.log(`[startup] Server listening on http://localhost:${config.port} (${config.nodeEnv})`);
  });

  let isShuttingDown = false;

  const shutdown = (signal: string, exitCode = 0): void => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    console.log(`[shutdown] Received ${signal}. Stopping new connections and draining active requests...`);

    const forceExitTimer = setTimeout(() => {
      console.error(
        `[shutdown] Could not drain connections within ${config.shutdownTimeoutMs}ms; forcing exit.`,
      );
      process.exit(1);
    }, config.shutdownTimeoutMs);

    forceExitTimer.unref();

    server.close((err) => {
      void store
        .flushPendingWrites()
        .catch((flushErr: unknown) => {
          console.error('[shutdown] Error while flushing pending file writes:', flushErr);
        })
        .finally(() => {
          clearTimeout(forceExitTimer);
          if (err) {
            console.error('[shutdown] Error while closing HTTP server:', err);
            process.exit(1);
            return;
          }
          console.log('[shutdown] All active requests finished. Server closed cleanly.');
          process.exit(exitCode);
        });
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM', 0));
  process.on('SIGINT', () => shutdown('SIGINT', 0));
  process.on('unhandledRejection', (reason: unknown) => {
    console.error('[fatal] Unhandled Promise rejection:', reason);
    shutdown('unhandledRejection', 1);
  });
  process.on('uncaughtException', (err: Error) => {
    console.error('[fatal] Uncaught exception:', err);
    shutdown('uncaughtException', 1);
  });
}

bootstrap().catch((err: unknown) => {
  console.error('[fatal] Failed to start server:', err);
  process.exit(1);
});
