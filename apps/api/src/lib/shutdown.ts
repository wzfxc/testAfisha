import type { Server } from 'node:http';
import type { EventStore } from '../services/eventStore.js';

export interface GracefulShutdownOptions {
  server: Server;
  store: Pick<EventStore, 'flushPendingWrites'>;
  timeoutMs: number;
  onExit: (code: number) => void;
}

export function createGracefulShutdown({
  server,
  store,
  timeoutMs,
  onExit,
}: GracefulShutdownOptions): (signal: string, exitCode?: number) => Promise<void> {
  let shutdownPromise: Promise<void> | null = null;
  let isShuttingDown = false;

  server.on('request', (_req, res) => {
    if (isShuttingDown && !res.headersSent) {
      res.setHeader('Connection', 'close');
    }
    res.on('finish', () => {
      if (isShuttingDown) {
        setImmediate(() => {
          server.closeIdleConnections?.();
        });
      }
    });
  });

  return (signal: string, exitCode = 0): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }
    isShuttingDown = true;

    console.log(`[shutdown] Received ${signal}. Stopping new connections and draining active requests...`);

    const forceExitTimer = setTimeout(() => {
      console.error(
        `[shutdown] Could not drain connections within ${timeoutMs}ms; forcing exit.`,
      );
      onExit(1);
    }, timeoutMs);

    forceExitTimer.unref();

    shutdownPromise = new Promise<void>((resolve) => {
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
              onExit(1);
              resolve();
              return;
            }
            console.log('[shutdown] All active requests finished. Server closed cleanly.');
            onExit(exitCode);
            resolve();
          });
      });
      server.closeIdleConnections?.();
    });

    return shutdownPromise;
  };
}
