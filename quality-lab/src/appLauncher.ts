/**
 * App Launcher & Health Verifier for Quality Lab.
 */

export interface LauncherOptions {
  appUrl?: string;
  maxRetries?: number;
  retryIntervalMs?: number;
}

export async function waitForAppReady(options: LauncherOptions = {}): Promise<string> {
  const url = options.appUrl ?? process.env.APP_URL ?? 'http://127.0.0.1:5173/';
  const maxRetries = options.maxRetries ?? 30;
  const retryIntervalMs = options.retryIntervalMs ?? 500;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok || response.status === 200 || response.status === 304) {
        return url;
      }
    } catch {
      // Continue polling
    }
    await new Promise((resolve) => setTimeout(resolve, retryIntervalMs));
  }

  throw new Error(`Application at ${url} failed to respond after ${maxRetries} attempts.`);
}
