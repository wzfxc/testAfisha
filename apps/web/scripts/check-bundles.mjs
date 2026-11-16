// Verifies that the charting library (recharts) is NOT shipped to `/` and `/favorites`.
//
// Usage (after `next build`, run from apps/web or pass the .next dir):
//   node scripts/check-bundles.mjs [path/to/.next]
//
// 1. Finds every client chunk in .next/static/chunks that contains recharts code
//    (identified by the `recharts-wrapper` class name that recharts renders).
// 2. Reads app-build-manifest.json (initial JS per App Router page) and reports
//    which pages load those chunks up front.
// 3. Reads react-loadable-manifest.json files (next/dynamic lazy chunks) and reports
//    which dynamic import pulls them in.
// Exits with code 1 if a recharts chunk is part of `/` or `/favorites`.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const MARKER = 'recharts-wrapper';
const FORBIDDEN_PAGES = ['/page', '/favorites/page'];

const nextDir = resolve(process.argv[2] ?? '.next');
const chunksDir = join(nextDir, 'static', 'chunks');
if (!existsSync(chunksDir)) {
  console.error(`No ${chunksDir}; run \`next build\` first.`);
  process.exit(2);
}

function walk(dir, predicate, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      walk(full, predicate, out);
    } else if (predicate(name)) {
      out.push(full);
    }
  }
  return out;
}

const toManifestPath = (file) => relative(nextDir, file).split('\\').join('/');

const allChunks = walk(chunksDir, (name) => name.endsWith('.js'));
const rechartsChunks = new Set(
  allChunks.filter((file) => readFileSync(file, 'utf8').includes(MARKER)).map(toManifestPath),
);

console.log(`Client chunks scanned: ${allChunks.length}`);
console.log(`Chunks containing recharts ("${MARKER}"):`);
for (const chunk of rechartsChunks) console.log(`  ${chunk}`);
if (rechartsChunks.size === 0) {
  console.error('No recharts chunk found — marker changed? Check the build.');
  process.exit(2);
}

const appManifest = JSON.parse(readFileSync(join(nextDir, 'app-build-manifest.json'), 'utf8'));
console.log('\nInitial JS per page (app-build-manifest.json):');
let failed = false;
for (const [page, files] of Object.entries(appManifest.pages)) {
  if (!page.endsWith('/page')) continue;
  const hits = files.filter((file) => rechartsChunks.has(file));
  const verdict = hits.length > 0 ? `CONTAINS recharts (${hits.join(', ')})` : 'no recharts';
  console.log(`  ${page.padEnd(28)} ${String(files.length).padStart(2)} chunks  ${verdict}`);
  if (hits.length > 0 && FORBIDDEN_PAGES.includes(page)) failed = true;
}

const loadableManifests = walk(nextDir, (name) => name === 'react-loadable-manifest.json').filter(
  (file) => !file.includes(`${join(nextDir, 'cache')}`),
);
console.log('\nLazy chunks (next/dynamic, react-loadable-manifest.json):');
const seen = new Set();
for (const file of loadableManifests) {
  const manifest = JSON.parse(readFileSync(file, 'utf8'));
  for (const [moduleKey, entry] of Object.entries(manifest)) {
    const hits = (entry.files ?? []).filter((f) => rechartsChunks.has(f));
    const line = `  ${moduleKey} -> ${hits.join(', ')}  [${toManifestPath(file)}]`;
    if (hits.length > 0 && !seen.has(line)) {
      seen.add(line);
      console.log(line);
    }
  }
}
if (seen.size === 0) console.log('  (none)');

if (failed) {
  console.error('\nFAIL: recharts is part of the initial bundle of / or /favorites.');
  process.exit(1);
}
console.log('\nOK: recharts is not in the bundles of / and /favorites.');
