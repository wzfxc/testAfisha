import 'dotenv/config';
import type { Server } from 'node:http';
import { createApp } from './app.js';
import { loadConfig } from './config/index.js';
import { EventService } from './services/eventService.js';
import { EventStore } from './services/eventStore.js';

const DATA_FILE = new URL('../data/events.json', import.meta.url);

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);

  // 1. Load 60 events from JSON into memory at startup
  const store = new EventStore({
    minDelayMs: config.db.minDelayMs,
    maxDelayMs: config.db.maxDelayMs,
  });
  await store.load(DATA_FILE);
  console.log(`[startup] Loaded ${store.size} events into memory`);

  // 2. Initialize Promise-cached EventService and Express app
  const eventService = new EventService(store, {
    max: config.cache.maxEntries,
    ttlMs: config.cache.ttlMs,
  });
  const app = createApp({ config, eventService });

  // 3. Start HTTP server
  const server: Server = app.listen(config.port, () => {
    console.log(`[startup] Server listening on http://localhost:${config.port} (${config.nodeEnv})`);
  });

  // 4. Graceful shutdown on SIGTERM / SIGINT
  let isShuttingDown = false;

  const shutdown = (signal: NodeJS.Signals): void => {
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

    // Do not keep the event loop alive solely because of the fallback timer
    forceExitTimer.unref();

    server.close((err) => {
      clearTimeout(forceExitTimer);
      if (err) {
        console.error('[shutdown] Error while closing HTTP server:', err);
        process.exit(1);
        return;
      }
      console.log('[shutdown] All active requests finished. Server closed cleanly.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err: unknown) => {
  console.error('[fatal] Failed to start server:', err);
  process.exit(1);
});

