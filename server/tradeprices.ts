// pathofexile.com/trade client for the publish-time pricing step (scripts/price.ts).
//
// GGG rate-limits these endpoints hard and the penalties are brutal — the search
// policy's 5-minute rule carries a 1800s lockout — so this never probes for the
// limit. It reads the limits and the *current usage* out of the response headers
// and paces itself to stay under them:
//
//   X-Rate-Limit-Policy:   trade-search-request-limit
//   X-Rate-Limit-Rules:    Ip
//   X-Rate-Limit-Ip:       5:10:60,15:60:300,30:300:1800,600:21600:3600
//   X-Rate-Limit-Ip-State: 1:10:0,1:60:0,1:300:0,51:21600:0
//
// Each rule is hits:window:penalty. `Ip` is the only rule these endpoints apply —
// there is no Account rule — so the limit is per-IP no matter which session cookie
// is attached, and running multiple accounts cannot raise the ceiling.
//
// Reading the -State header matters: it counts *all* traffic from this IP, including
// the developer's own browsing on the trade site. Pacing off our own counters alone
// would walk straight into a lockout the browser had already half-consumed.
//
// Pacing is windowed-count based rather than a fixed interval on purpose. The 6-hour
// rule averages out to 36s/request, but a run shorter than 6 hours never reaches that
// window's cap, so honouring it as an interval would triple the runtime for nothing.

import { setTimeout as sleep } from 'node:timers/promises'
import { UA } from './poeninja'

const TRADE = 'https://www.pathofexile.com/api/trade'

// Optional credentials. These endpoints work fully anonymously today (GGG hands out
// a guest POESESSID via Set-Cookie on every response, which is why a browser always
// appears to have one); this is here so a .env can carry us if that ever changes.
try {
  process.loadEnvFile()
} catch {
  /* no .env — anonymous */
}

const cookie = [
  process.env.POESESSID && `POESESSID=${process.env.POESESSID}`,
  process.env.CF_CLEARANCE && `cf_clearance=${process.env.CF_CLEARANCE}`,
]
  .filter(Boolean)
  .join('; ')

export const credentialMode = cookie ? 'cookie from .env' : 'anonymous'

const headers = (): Record<string, string> => ({
  accept: 'application/json',
  'content-type': 'application/json',
  'user-agent': UA,
  'x-requested-with': 'XMLHttpRequest',
  ...(cookie ? { cookie } : {}),
})

// ---------- rate limiting ----------

interface Rule {
  hits: number
  window: number
  penalty: number
}

const parseRules = (header: string | null): Rule[] =>
  (header ?? '')
    .split(',')
    .filter(Boolean)
    .map((part) => {
      const [hits, window, penalty] = part.split(':').map(Number)
      return { hits, window, penalty }
    })

class RateLimiter {
  private rules: Rule[] = []
  private stamps: number[] = [] // our own request times
  private external = new Map<number, number>() // window seconds -> hits from other traffic
  private blockedUntil = 0

  readonly name: string

  constructor(name: string) {
    this.name = name
  }

  // Block until every rule has room, then claim a slot.
  async acquire(): Promise<void> {
    for (;;) {
      const now = Date.now()
      if (this.blockedUntil > now) {
        await sleep(this.blockedUntil - now)
        continue
      }
      const wait = this.waitMs(now)
      if (wait <= 0) break
      if (wait >= 30_000)
        console.log(`[price]   ${this.name}: waiting ${Math.round(wait / 1000)}s for a slot`)
      await sleep(wait)
    }
    this.stamps.push(Date.now())
    this.trim()
  }

  private waitMs(now: number): number {
    let wait = 0
    for (const rule of this.rules) {
      const windowStart = now - rule.window * 1000
      const mine = this.stamps.filter((t) => t > windowStart)
      const used = mine.length + (this.external.get(rule.window) ?? 0)
      // Keep one slot of headroom so a concurrent browser request can't tip us over.
      if (used < Math.max(1, rule.hits - 1)) continue
      // One of ours leaving the window frees a slot. If the pressure is entirely
      // external we can't see when those age out, so fall back to the rule's
      // average spacing and re-measure from the next response's -State header.
      const next = mine.length
        ? mine[0] + rule.window * 1000 - now
        : (rule.window / rule.hits) * 1000
      wait = Math.max(wait, next)
    }
    return wait
  }

  // Re-read limits and actual usage from a response. The -State counts include
  // traffic we didn't make, so the difference becomes an external offset.
  observe(res: Response): void {
    const now = Date.now()
    const rules: Rule[] = []
    for (const name of (res.headers.get('x-rate-limit-rules') ?? '').split(',')) {
      const key = name.trim().toLowerCase()
      if (!key) continue
      const limits = parseRules(res.headers.get(`x-rate-limit-${key}`))
      const state = parseRules(res.headers.get(`x-rate-limit-${key}-state`))
      for (const [i, rule] of limits.entries()) {
        rules.push(rule)
        const current = state[i]?.hits
        if (current == null) continue
        const mine = this.stamps.filter((t) => t > now - rule.window * 1000).length
        this.external.set(rule.window, Math.max(0, current - mine))
      }
    }
    if (rules.length) this.rules = rules
  }

  block(ms: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, Date.now() + ms)
  }

  private trim(): void {
    const longest = Math.max(0, ...this.rules.map((r) => r.window)) * 1000
    const cutoff = Date.now() - longest
    if (this.stamps.length > 2000) this.stamps = this.stamps.filter((t) => t > cutoff)
  }
}

// One limiter per policy — search, fetch and exchange are budgeted separately.
const limiters = {
  search: new RateLimiter('search'),
  fetch: new RateLimiter('fetch'),
  exchange: new RateLimiter('exchange'),
}
type Policy = keyof typeof limiters

async function tradeRequest<T>(policy: Policy, url: string, body?: unknown): Promise<T> {
  const limiter = limiters[policy]
  for (let attempt = 1; attempt <= 4; attempt++) {
    await limiter.acquire()
    const res = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: headers(),
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    limiter.observe(res)

    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') ?? 60)
      console.warn(
        `[price] RATE LIMITED on ${policy} (attempt ${attempt}) — backing off ${retry}s. ` +
          `Pacing will re-sync from the response headers.`,
      )
      limiter.block(retry * 1000 + 1000)
      continue
    }
    if (!res.ok) {
      const text = (await res.text()).slice(0, 200)
      throw new Error(`${policy} ${url} -> HTTP ${res.status}: ${text}`)
    }
    return (await res.json()) as T
  }
  throw new Error(`${policy}: still rate limited after 4 attempts`)
}

// ---------- endpoints ----------

export interface SearchResult {
  id: string
  result: string[]
  total: number
}

export const tradeSearch = (league: string, query: unknown): Promise<SearchResult> =>
  tradeRequest<SearchResult>('search', `${TRADE}/search/${encodeURIComponent(league)}`, query)

export interface Price {
  type: string
  amount: number
  currency: string
}

export interface Listing {
  id: string
  listing: { indexed: string; price: Price | null }
  item: { note?: string }
}

// The fetch endpoint takes up to 10 ids at a time, which lines up with the 10
// cheapest results we sample per search.
export async function tradeFetch(ids: string[], queryId: string): Promise<Listing[]> {
  if (ids.length === 0) return []
  const body = await tradeRequest<{ result: (Listing | null)[] }>(
    'fetch',
    `${TRADE}/fetch/${ids.slice(0, 10).join(',')}?query=${encodeURIComponent(queryId)}`,
  )
  return (body.result ?? []).filter((r): r is Listing => r != null)
}
