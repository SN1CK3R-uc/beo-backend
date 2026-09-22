import { execSync } from 'node:child_process';
import path from 'node:path';

const cacheDir = process.env.PUPPETEER_CACHE_DIR
  ?? path.resolve(process.cwd(), '.cache', 'puppeteer');

console.log('[postinstall] Installing Chrome to:', cacheDir);

execSync('npx puppeteer browsers install chrome', {
  stdio: 'inherit',
  env: { ...process.env, PUPPETEER_CACHE_DIR: cacheDir },
});