// Minimal leveled logger. LOG_LEVEL is read on every call (not at import time)
// so tests can set LOG_LEVEL=silent before the first log without import-order tricks.
// Levels: silent < error < info (default: info — production keeps full logging).
type LogLevel = 'silent' | 'error' | 'info';

const RANK: Record<LogLevel, number> = { silent: 0, error: 1, info: 2 };

function currentRank(): number {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  return raw === 'silent' || raw === 'error' || raw === 'info' ? RANK[raw] : RANK.info;
}

export const logger = {
  info(...args: unknown[]): void {
    if (currentRank() >= RANK.info) {
      console.log(...args);
    }
  },
  error(...args: unknown[]): void {
    if (currentRank() >= RANK.error) {
      console.error(...args);
    }
  },
};
