import assert from 'node:assert/strict';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { launchProductionApp } from './appLauncher.ts';

const qualityDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const missingDist = join(qualityDirectory, 'fixtures', '__deliberately_missing_dist__');
const missingBrowser = join(qualityDirectory, 'fixtures', '__deliberately_missing_browser__');

let appRejected = false;
try {
  await launchProductionApp({ distDirectory: missingDist });
} catch (error) {
  appRejected = error instanceof Error && error.message.includes('Built production entry is unavailable');
}
assert(appRejected, 'The release launcher did not fail for an unavailable production bundle');

let browserRejected = false;
try {
  const browser = await chromium.launch({ executablePath: missingBrowser, headless: true });
  await browser.close();
} catch {
  browserRejected = true;
}
assert(browserRejected, 'The release launcher did not fail for an unavailable browser executable');

console.log('Quality Lab no-fallback probe observed hard failures for unavailable app and browser.');
