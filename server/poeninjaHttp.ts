import { resolve } from 'node:path'
import type { BrowserContext, Page } from 'playwright'

const ORIGIN = 'https://poe.ninja'
const START_PAGE = `${ORIGIN}/poe1/builds/streamers`

export class PoeNinjaBrowserError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PoeNinjaBrowserError'
  }
}

interface BrowserOptions {
  profileDirectory?: string
  channel?: 'chrome' | 'msedge' | 'chromium'
  verificationTimeoutMs?: number
  requestTimeoutMs?: number
}

// Keep requests in the page's own browser context. Playwright's APIRequestContext
// uses a separate HTTP client even when it shares cookies with a browser.
export class PoeNinjaBrowser {
  private contextPromise?: Promise<BrowserContext>
  private page?: Page
  private queue: Promise<unknown> = Promise.resolve()
  private failure?: PoeNinjaBrowserError
  private closed = false
  private readonly options: Required<BrowserOptions>

  constructor(options: BrowserOptions = {}) {
    this.options = {
      profileDirectory: resolve('data/poeninja-browser-profile'),
      channel: 'chrome',
      verificationTimeoutMs: 20 * 60_000,
      requestTimeoutMs: 30_000,
      ...options,
    }
  }

  fetch(input: string, init: RequestInit = {}): Promise<Response> {
    const url = new URL(input)
    if (url.origin !== ORIGIN || url.username || url.password || (init.method ?? 'GET') !== 'GET') {
      return Promise.reject(new PoeNinjaBrowserError('Browser transport only accepts poe.ninja GET requests.'))
    }
    // Class searches arrive concurrently. Serialize them so a verification-page
    // navigation cannot destroy another request's execution context.
    const task = this.queue.then(async () => {
      if (this.closed) throw new PoeNinjaBrowserError('The poe.ninja browser was closed. Re-run the scrape to resume.')
      if (this.failure) throw this.failure
      try {
        const page = await this.getPage()
        const accept = new Headers(init.headers).get('accept') ?? '*/*'
        let response = await this.fetchInPage(page, url, accept)
        if (this.needsVerification(response, url)) {
          await this.visit(page, this.verificationPage(url), true)
          response = await this.fetchInPage(page, url, accept)
          if (this.needsVerification(response, url)) {
            throw new PoeNinjaBrowserError(
              'poe.ninja still blocks this browser after verification. Crawl stopped; saved characters can be resumed.',
            )
          }
        }
        // Pass 429 and Retry-After through to the existing crawler backoff.
        return response
      } catch (error) {
        this.failure = error instanceof PoeNinjaBrowserError ? error : new PoeNinjaBrowserError(
          `poe.ninja browser request failed: ${error instanceof Error ? error.message : String(error)}. ` +
          'Re-run the scrape to resume saved progress.', { cause: error },
        )
        throw this.failure
      }
    })
    this.queue = task.catch(() => undefined)
    return task
  }

  async close(): Promise<void> {
    this.closed = true
    const context = await this.contextPromise?.catch(() => undefined)
    await context?.close()
  }

  private async getPage(): Promise<Page> {
    if (this.page) return this.page
    console.log(`[poeninja] Opening ${this.options.channel}; browser profile: ${this.options.profileDirectory}`)
    this.contextPromise = import('playwright').then(({ chromium }) => chromium.launchPersistentContext(
      this.options.profileDirectory,
      { channel: this.options.channel, headless: false, viewport: null },
    ))
    const context = await this.contextPromise
    this.page = context.pages()[0] ?? await context.newPage()
    await this.visit(this.page, START_PAGE)
    return this.page
  }

  private async visit(page: Page, url: string, explain = false): Promise<void> {
    if (explain) console.warn('[poeninja] Verification needed. Complete the check in Chrome; the crawl is paused.')
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: this.options.requestTimeoutMs })
    const challenged = response?.status() === 403 || response?.headers()['cf-mitigated'] === 'challenge' ||
      /Just a moment|Attention Required/i.test(await page.title())
    if (challenged) {
      if (!explain) console.warn('[poeninja] Complete the verification in Chrome; the crawl is paused.')
      await page.bringToFront()
      try {
        await page.waitForFunction(
          `! /Just a moment|Attention Required/i.test(document.title) &&
           !document.querySelector('#challenge-form') && document.readyState !== 'loading'`,
          undefined,
          { timeout: this.options.verificationTimeoutMs, polling: 1000 },
        )
      } catch (error) {
        throw new PoeNinjaBrowserError(
          'Browser verification did not finish. Crawl stopped; re-run to resume saved progress.', { cause: error },
        )
      }
      console.log('[poeninja] Browser verification finished; retrying the request.')
    } else if (response && !response.ok()) {
      throw new PoeNinjaBrowserError(`poe.ninja browser page returned HTTP ${response.status()}: ${url}`)
    }
  }

  private needsVerification(response: Response, url: URL): boolean {
    return response.status === 403 || response.headers.get('cf-mitigated') === 'challenge' ||
      (response.status === 200 && response.headers.get('content-type')?.includes('text/html') === true &&
        url.pathname.includes('/api/'))
  }

  private verificationPage(url: URL): string {
    const overview = url.searchParams.get('overview') || 'streamers'
    if (url.pathname.endsWith('/character')) {
      const account = encodeURIComponent(url.searchParams.get('account') ?? '')
      const name = encodeURIComponent(url.searchParams.get('name') ?? '')
      const type = url.searchParams.get('type') === '2' ? 'streamers' : 'exp'
      return `${ORIGIN}/poe1/builds/${encodeURIComponent(overview)}/character/${account}/${name}?type=${type}`
    }
    return `${ORIGIN}/poe1/builds/${encodeURIComponent(overview)}`
  }

  private async fetchInPage(page: Page, url: URL, accept: string): Promise<Response> {
    if (new URL(page.url()).origin !== ORIGIN) {
      throw new PoeNinjaBrowserError('The scrape tab left poe.ninja. Re-run the scrape and keep that tab on poe.ninja.')
    }
    const result = await page.evaluate(async ({ path, accept, timeout }) => {
      const response = await fetch(path, {
        method: 'GET', credentials: 'same-origin', redirect: 'error',
        headers: { accept }, signal: AbortSignal.timeout(timeout),
      })
      const bytes = new Uint8Array(await response.arrayBuffer())
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
      }
      // Browser fetch has already decompressed the body. Do not forward transport
      // headers, Cookie, or Set-Cookie to Node, and keep protobuf bytes lossless.
      const headers: Record<string, string> = {}
      for (const name of ['content-type', 'retry-after', 'cf-mitigated']) {
        const value = response.headers.get(name)
        if (value !== null) headers[name] = value
      }
      return { status: response.status, headers, body: btoa(binary) }
    }, { path: url.pathname + url.search, accept, timeout: this.options.requestTimeoutMs })
    return new Response([204, 205, 304].includes(result.status) ? null : Buffer.from(result.body, 'base64'), {
      status: result.status, headers: result.headers,
    })
  }
}

let browser: PoeNinjaBrowser | undefined

export function enablePoeNinjaBrowser(options?: BrowserOptions): void {
  if (browser) throw new Error('poe.ninja browser mode is already enabled.')
  browser = new PoeNinjaBrowser(options)
}

export function poeNinjaFetch(url: string, init?: RequestInit): Promise<Response> {
  return browser ? browser.fetch(url, init) : fetch(url, init)
}

export async function closePoeNinjaBrowser(): Promise<void> {
  const active = browser
  // Keep the closed transport installed: queued/in-flight callers must not fall
  // back to direct HTTP during shutdown.
  await active?.close()
}
