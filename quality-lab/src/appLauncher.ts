import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';

export interface RunningProductionApp {
  url: string;
  output: () => string;
  stop: () => Promise<void>;
}

export interface ProductionAppLaunchOptions {
  distDirectory?: string;
  viteCliPath?: string;
}

const qualityLabDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = resolve(qualityLabDirectory, '..');

async function waitForProductionHtml(
  url: string,
  child: ChildProcess,
  output: () => string,
): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Production preview exited with code ${child.exitCode}.\n${output()}`);
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1_000) });
      const html = await response.text();
      if (response.ok && /<html[\s>]/i.test(html) && /<div id="root"><\/div>/.test(html)) return;
    } catch {
      // The preview process may still be binding its port.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error(`Production preview did not become healthy at ${url}.\n${output()}`);
}

export async function launchProductionApp(
  options: ProductionAppLaunchOptions = {},
): Promise<RunningProductionApp> {
  const distDirectory = options.distDirectory ?? join(repositoryRoot, 'dist');
  const indexPath = join(distDirectory, 'index.html');
  const viteCliPath = options.viteCliPath ?? join(repositoryRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(indexPath)) {
    throw new Error(`Built production entry is unavailable: ${indexPath}. Run npm run build first.`);
  }
  if (!existsSync(viteCliPath)) {
    throw new Error(`Vite preview executable is unavailable: ${viteCliPath}. Run npm ci first.`);
  }

  const host = '127.0.0.1';
  const port = 4173;
  const url = `http://${host}:${port}/`;
  const child = spawn(
    process.execPath,
    [viteCliPath, 'preview', '--host', host, '--port', String(port), '--strictPort'],
    {
      cwd: options.distDirectory ? distDirectory : repositoryRoot,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  let combinedOutput = '';
  child.stdout.on('data', (chunk: Buffer) => { combinedOutput += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { combinedOutput += chunk.toString(); });
  const output = () => combinedOutput.trim();

  try {
    await waitForProductionHtml(url, child, output);
  } catch (error) {
    child.kill();
    throw error;
  }

  return {
    url,
    output,
    stop: async () => {
      if (child.exitCode !== null || child.killed) return;
      await new Promise<void>((resolveStop) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          resolveStop();
        }, 3_000);
        child.once('exit', () => {
          clearTimeout(timeout);
          resolveStop();
        });
        child.kill();
      });
    },
  };
}
