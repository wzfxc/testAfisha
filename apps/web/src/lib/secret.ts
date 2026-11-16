import 'server-only';
import { readFileSync } from 'node:fs';

let cachedFileSecret: { path: string; value: string } | null = null;

export function getInternalSecret(): string | undefined {
  const secretFile = process.env.INTERNAL_SECRET_FILE?.trim();
  if (secretFile) {
    if (cachedFileSecret && cachedFileSecret.path === secretFile) {
      return cachedFileSecret.value;
    }
    let raw: string;
    try {
      raw = readFileSync(secretFile, 'utf8').trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to read INTERNAL_SECRET_FILE (${secretFile}): ${msg}`);
    }
    if (!raw) {
      throw new Error(`INTERNAL_SECRET_FILE (${secretFile}) is empty`);
    }
    cachedFileSecret = { path: secretFile, value: raw };
    return raw;
  }

  const secret = process.env.INTERNAL_SECRET?.trim() || undefined;
  if (process.env.NODE_ENV === 'production' && !secret) {
    throw new Error('INTERNAL_SECRET or INTERNAL_SECRET_FILE is required in production');
  }
  return secret;
}

