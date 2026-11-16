import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// On Windows without Developer Mode / elevated privileges, `fs.promises.symlink`
// throws EPERM when Next.js `output: 'standalone'` copies pnpm symlinks.
// Falling back to directory junctions allows `next build` to succeed on Windows.
if (process.platform === 'win32') {
  const originalSymlink = fs.promises.symlink.bind(fs.promises);
  fs.promises.symlink = async (target, linkPath, type) => {
    try {
      return await originalSymlink(target, linkPath, type);
    } catch (err: unknown) {
      if (
        typeof err === 'object' &&
        err !== null &&
        'code' in err &&
        err.code === 'EPERM'
      ) {
        const resolvedTarget = path.resolve(path.dirname(String(linkPath)), String(target));
        return originalSymlink(resolvedTarget, linkPath, 'junction');
      }
      throw err;
    }
  };
}

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  reactStrictMode: true,
  transpilePackages: ['@app/shared'],
};

export default nextConfig;
