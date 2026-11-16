// Bundles src/server.ts and workspace package @app/shared into dist/server.js
// while keeping third-party node_modules external.
import { buildSync } from 'esbuild';

buildSync({
  entryPoints: ['src/server.ts'],
  outfile: 'dist/server.js',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  sourcemap: true,
  external: [
    'express',
    'cors',
    'dotenv',
    'dotenv/*',
    'express-rate-limit',
    'lru-cache',
    'zod',
  ],
});
console.log('Built apps/api/dist/server.js');

