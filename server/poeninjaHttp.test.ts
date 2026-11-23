import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { PoeNinjaBrowser, PoeNinjaBrowserError, poeNinjaFetch } from './poeninjaHttp'

const mocks = vi.hoisted(() => ({
  launch: vi.fn(), goto: vi.fn(), title: vi.fn(), evaluate: vi.fn(),
  waitForFunction: vi.fn(), bringToFront: vi.fn(), close: vi.fn(), browserFetch: vi.fn(),
}))
vi.mock('playwright', () => ({ chromium: { launchPersistentContext: mocks.launch } }))

const characterUrl = 'https://poe.ninja/api/protected/characters/poe1/builds/current/character?' +
  'account=Player%231234&name=Jewel%20Character&overview=streamers&type=2&timeMachine='
const searchUrl = 'https://poe.ninja/api/protected/poe1/builds/current/search?overview=covens&type=exp'
const navigation = (status: number) => ({ status: () => status, ok: () => status === 200, headers: () => ({}) })
const blocked = () => new Response('<html>Verification</html>', {
  status: 403, headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' },
})

beforeEach(() => {
  vi.resetAllMocks()
  const page = {
    url: () => 'https://poe.ninja/poe1/builds/streamers',
    goto: mocks.goto, title: mocks.title, evaluate: mocks.evaluate,
    waitForFunction: mocks.waitForFunction, bringToFront: mocks.bringToFront,
  }
  mocks.launch.mockResolvedValue({ pages: () => [page], close: mocks.close })
  mocks.goto.mockResolvedValue(navigation(200))
  mocks.title.mockResolvedValue('Builds - poe.ninja')
  mocks.waitForFunction.mockResolvedValue(undefined)
  // Execute the browser callback, including byte serialization, rather than
  // returning a fabricated serialized result from evaluate().
  mocks.evaluate.mockImplementation((fn, args) => fn(args))
  mocks.browserFetch.mockImplementation(async () => Response.json({ jewels: [] }))
  vi.stubGlobal('fetch', mocks.browserFetch)
})

afterEach(() => vi.unstubAllGlobals())

it('transfers binary data losslessly and lets Chrome supply cookies and its user agent', async () => {
  const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256)
  mocks.browserFetch.mockResolvedValue(new Response(bytes, {
    headers: { 'content-type': 'application/x-protobuf', 'content-encoding': 'gzip', 'set-cookie': 'private' },
  }))
  const browser = new PoeNinjaBrowser()
  const response = await browser.fetch(searchUrl, {
    headers: { accept: '*/*', 'user-agent': 'Node agent', cookie: 'must-not-transfer' },
  })
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
  expect(response.headers.get('content-type')).toBe('application/x-protobuf')
  expect(response.headers.has('content-encoding')).toBe(false)
  expect(response.headers.has('set-cookie')).toBe(false)
  expect(mocks.browserFetch.mock.calls[0]).toEqual([
    new URL(searchUrl).pathname + new URL(searchUrl).search,
    expect.objectContaining({ credentials: 'same-origin', headers: { accept: '*/*' }, redirect: 'error' }),
  ])
  expect(mocks.launch).toHaveBeenCalledWith(
    expect.stringContaining('poeninja-browser-profile'),
    { channel: 'chrome', headless: false, viewport: null },
  )
  await browser.close()
  expect(mocks.close).toHaveBeenCalledTimes(1)
})

it('serializes concurrent searches in one browser session', async () => {
  let complete!: (response: Response) => void
  mocks.browserFetch.mockImplementationOnce(() => new Promise<Response>((resolve) => { complete = resolve }))
  const browser = new PoeNinjaBrowser()
  const first = browser.fetch(searchUrl)
  const second = browser.fetch(searchUrl + '&class=Elementalist')
  await vi.waitFor(() => expect(mocks.browserFetch).toHaveBeenCalledTimes(1))
  complete(Response.json({ ok: true }))
  await Promise.all([first, second])
  expect(mocks.browserFetch).toHaveBeenCalledTimes(2)
  expect(mocks.launch).toHaveBeenCalledTimes(1)
  await browser.close()
})

it('pauses for manual verification on the character page before retrying the API once', async () => {
  mocks.browserFetch.mockResolvedValueOnce(blocked()).mockResolvedValueOnce(Response.json({ jewels: [1] }))
  mocks.goto.mockResolvedValueOnce(navigation(200)).mockResolvedValueOnce(navigation(403))
  let verified!: () => void
  mocks.waitForFunction.mockImplementationOnce(() => new Promise<void>((resolve) => { verified = resolve }))
  const browser = new PoeNinjaBrowser()
  const pending = browser.fetch(characterUrl)
  await vi.waitFor(() => expect(mocks.waitForFunction).toHaveBeenCalledTimes(1))
  expect(mocks.browserFetch).toHaveBeenCalledTimes(1)
  expect(mocks.goto.mock.calls[1][0]).toBe(
    'https://poe.ninja/poe1/builds/streamers/character/Player%231234/Jewel%20Character?type=streamers',
  )
  verified()
  expect(await (await pending).json()).toEqual({ jewels: [1] })
  expect(mocks.browserFetch).toHaveBeenCalledTimes(2)
  await browser.close()
})

it('stops queued work after a persistent block without reopening Chrome or repeating prompts', async () => {
  mocks.browserFetch.mockImplementation(async () => blocked())
  const browser = new PoeNinjaBrowser()
  const results = await Promise.allSettled([browser.fetch(characterUrl), browser.fetch(searchUrl)])
  expect(results.every((result) => result.status === 'rejected' && result.reason instanceof PoeNinjaBrowserError)).toBe(true)
  expect(mocks.browserFetch).toHaveBeenCalledTimes(2)
  expect(mocks.goto).toHaveBeenCalledTimes(2)
  expect(mocks.launch).toHaveBeenCalledTimes(1)
  await browser.close()
})

it('retains 429 and Retry-After for the crawl rate limiter', async () => {
  mocks.browserFetch.mockResolvedValue(new Response('Slow down', { status: 429, headers: { 'retry-after': '81' } }))
  const browser = new PoeNinjaBrowser()
  const response = await browser.fetch(characterUrl)
  expect(response.status).toBe(429)
  expect(response.headers.get('retry-after')).toBe('81')
  expect(mocks.browserFetch).toHaveBeenCalledTimes(1)
  expect(mocks.waitForFunction).not.toHaveBeenCalled()
  await browser.close()
})

it('treats a successful HTML API response as verification, not jewel or protobuf data', async () => {
  mocks.browserFetch.mockResolvedValueOnce(new Response('<html>Challenge</html>', {
    headers: { 'content-type': 'text/html' },
  })).mockResolvedValueOnce(Response.json({ jewels: [] }))
  const browser = new PoeNinjaBrowser()
  expect(await (await browser.fetch(characterUrl)).json()).toEqual({ jewels: [] })
  expect(mocks.goto).toHaveBeenCalledTimes(2)
  await browser.close()
})

it('reports a verification timeout and does not issue an API request', async () => {
  mocks.goto.mockResolvedValue(navigation(403))
  mocks.waitForFunction.mockRejectedValue(new Error('Timeout'))
  const browser = new PoeNinjaBrowser({ verificationTimeoutMs: 100 })
  await expect(browser.fetch(searchUrl)).rejects.toThrow('Browser verification did not finish')
  expect(mocks.browserFetch).not.toHaveBeenCalled()
  await browser.close()
  expect(mocks.close).toHaveBeenCalledTimes(1)
})

it('rejects requests after shutdown without launching a replacement browser', async () => {
  const browser = new PoeNinjaBrowser()
  await browser.close()
  await expect(browser.fetch(searchUrl)).rejects.toThrow('browser was closed')
  expect(mocks.launch).not.toHaveBeenCalled()
})

it('restricts the browser transport to poe.ninja GET requests', async () => {
  const browser = new PoeNinjaBrowser()
  await expect(browser.fetch('https://example.com/')).rejects.toThrow('only accepts poe.ninja GET')
  await expect(browser.fetch(searchUrl, { method: 'POST' })).rejects.toThrow('only accepts poe.ninja GET')
  expect(mocks.launch).not.toHaveBeenCalled()
})

it('keeps direct HTTP as the default without starting Chrome', async () => {
  await poeNinjaFetch(searchUrl, { headers: { accept: '*/*' } })
  expect(mocks.browserFetch).toHaveBeenCalledWith(searchUrl, { headers: { accept: '*/*' } })
  expect(mocks.launch).not.toHaveBeenCalled()
})
