// Publish-time trade pricing. Runs the same pathofexile.com/trade searches the UI
// links to and caches what the listings are asking, so the cluster jewel table can
// show an estimated price without the user clicking through.
//
// Usage: npx tsx scripts/price.ts [--league=<Name>] [--top=N] [--ttl=<hours>]
//                                 [--max=N] [--full]
//
//   --top   combos priced per base+cluster-type group, most-used first (default 5)
//   --ttl   hours a cached price stays fresh (default 24)
//   --max   stop after N trade searches this run — useful for a smoke test
//   --full  ignore the cache and re-price everything
//
// Reads  src/data/<league-slug>/cluster-jewels.json (from `npm run scrape`)
// Writes src/data/<league-slug>/trade-prices.json
//
// The trade search API allows ~30 requests per 5 minutes per IP, so a cold run of
// ~250 searches takes ~40 minutes. That's why results are cached with a TTL and why
// the file is rewritten after *every* search: an interrupted run loses nothing.
//
// Prices are stored in the currency each listing is written in, not converted to a
// common unit. The trade API already sorts results by price across currencies, so
// the cheapest and median listings are correct without a conversion rate — and no
// reliable rate source exists to convert with (poe.ninja's currency endpoints 404,
// and the exchange book's cheapest offers are 1:1 lowballs).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_LEAGUE } from '../league.ts'
import { slugify } from '../server/clusterjewels.ts'
import { credentialMode, tradeFetch, tradeSearch, type Price } from '../server/tradeprices.ts'
import { groupJewels, type ClusterData } from '../src/clusterAggregate.ts'
import {
  BASE_ILVLS,
  PRICED_TOP,
  baseKey,
  buildBaseQuery,
  buildComboQuery,
  pinnedPassives,
  priceKey,
  type PassiveRange,
} from '../src/tradeQuery.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const flag = (name: string): string | undefined =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)

const league = flag('league') || process.env.POE_LEAGUE || DEFAULT_LEAGUE
const top = Number(flag('top') ?? PRICED_TOP)
const ttlMs = Number(flag('ttl') ?? 24) * 3600_000
const max = Number(flag('max') ?? Infinity)
const full = process.argv.includes('--full')

const outDir = join(ROOT, 'src', 'data', slugify(league))
const clusterPath = join(outDir, 'cluster-jewels.json')
const pricePath = join(outDir, 'trade-prices.json')

if (!existsSync(clusterPath)) {
  console.error(`[price] no snapshot at ${clusterPath} — run \`npm run scrape\` first.`)
  process.exit(1)
}

// ---------- work list ----------

interface Entry {
  low: Price | null
  mid: Price | null
  listed: number
  sampled: number
  passivesMin: number | null
  passivesMax: number | null
  at: string
}

interface PriceFile {
  version: number
  league: string
  fetchedAt: string
  prices: Record<string, Entry>
  bases: Record<string, Entry>
}

// Bump when the cache keys or the queries behind them change, so a stale file is
// discarded instead of leaving entries that no lookup can ever match again.
const CACHE_VERSION = 2

interface Job {
  kind: 'combo' | 'base'
  key: string
  label: string
  query: object
  passives: PassiveRange
}

const data: ClusterData = JSON.parse(readFileSync(clusterPath, 'utf8'))
// The UI's default view (rares only, no filters) decides which combos exist, so the
// combos priced here are exactly the ones it renders.
const groups = groupJewels(data.jewels)

const jobs: Job[] = []
const baseSeen = new Set<string>()

for (const g of groups) {
  for (const cc of g.comboCounts.slice(0, top)) {
    const query = buildComboQuery(g.base, g.clusterType, cc)
    if (!query) continue // unresolvable stat id — the UI won't link it either
    const passives = pinnedPassives(g.base, cc.notables, cc.passivesMin, cc.passivesMax)
    jobs.push({
      kind: 'combo',
      key: priceKey(g.base, g.clusterType, cc.combo),
      label: `${g.base.replace(' Cluster Jewel', '')} · ${cc.combo}`,
      query,
      passives,
    })

    // The uncrafted base behind this combo, priced once per (base, type, passives)
    // at each craftable item level. Many combos in a group share one triple, so this
    // is far fewer searches than the combo count suggests.
    for (const ilvl of BASE_ILVLS) {
      const bKey = baseKey(g.base, g.clusterType, passives, ilvl)
      if (baseSeen.has(bKey)) continue
      const baseQuery = buildBaseQuery(g.base, g.clusterType, passives, ilvl)
      if (!baseQuery) continue
      baseSeen.add(bKey)
      jobs.push({
        kind: 'base',
        key: bKey,
        label: `${g.base.replace(' Cluster Jewel', '')} base i${ilvl} · ${g.clusterType}`,
        query: baseQuery,
        passives,
      })
    }
  }
}

// ---------- cache ----------

const empty = (): PriceFile => ({
  version: CACHE_VERSION,
  league,
  fetchedAt: '',
  prices: {},
  bases: {},
})

let cache: PriceFile =
  !full && existsSync(pricePath) ? JSON.parse(readFileSync(pricePath, 'utf8')) : empty()
if (cache.version !== CACHE_VERSION) {
  console.log(
    `[price] cache is format v${cache.version ?? 1}, expected v${CACHE_VERSION} — ` +
      'repricing from scratch.',
  )
  cache = empty()
}
cache.league = league
cache.prices ??= {}
cache.bases ??= {}

const bucket = (job: Job) => (job.kind === 'combo' ? cache.prices : cache.bases)
const fresh = (job: Job): boolean => {
  const at = bucket(job)[job.key]?.at
  return at != null && Date.now() - Date.parse(at) < ttlMs
}

const pending = jobs.filter((j) => !fresh(j))
const save = () => {
  mkdirSync(outDir, { recursive: true })
  cache.version = CACHE_VERSION
  cache.fetchedAt = new Date().toISOString()
  writeFileSync(pricePath, JSON.stringify(cache, null, 1) + '\n')
}

console.log(
  `[price] ${league}: ${jobs.length} queries (${jobs.filter((j) => j.kind === 'combo').length} ` +
    `combos + ${baseSeen.size} bases at ilvl ${BASE_ILVLS.join('/')}) from ${groups.length} ` +
    `groups, top ${top} per group`,
)
console.log(
  `[price] ${pending.length} stale or missing, ${jobs.length - pending.length} cached ` +
    `(${ttlMs / 3600_000}h TTL) · requests are ${credentialMode}`,
)
if (pending.length === 0) {
  save()
  console.log('[price] nothing to do.')
  process.exit(0)
}
console.log(
  `[price] ~${Math.round((Math.min(pending.length, max) * 10) / 60)} min at the trade API's ` +
    'per-IP pace. Progress is saved after every query, so Ctrl-C is safe.',
)

// ---------- run ----------

const fmt = (p: Price | null) => (p ? `${p.amount} ${p.currency}` : '—')

let done = 0
let failed = 0

for (const job of pending) {
  if (done >= max) {
    console.log(`[price] stopping at --max=${max}.`)
    break
  }
  done++
  try {
    const search = await tradeSearch(league, job.query)
    // Results come back sorted by price ascending, so the sample is the cheap end
    // of the book: first is the floor, the middle one resists a single lowball.
    const listings = await tradeFetch(search.result.slice(0, 10), search.id)
    const priced = listings.map((l) => l.listing.price).filter((p): p is Price => p != null)

    bucket(job)[job.key] = {
      low: priced[0] ?? null,
      mid: priced[Math.floor((priced.length - 1) / 2)] ?? null,
      listed: search.total,
      sampled: priced.length,
      passivesMin: job.passives.min,
      passivesMax: job.passives.max,
      at: new Date().toISOString(),
    }
    save()
    console.log(
      `[price] ${done}/${Math.min(pending.length, max)} ${job.label} → ` +
        `${fmt(priced[0] ?? null)} … ${fmt(priced[Math.floor((priced.length - 1) / 2)] ?? null)} ` +
        `(${search.total} listed)`,
    )
  } catch (err) {
    // One bad query shouldn't end a 40-minute run.
    failed++
    console.warn(`[price] ${done}/${pending.length} ${job.label} FAILED: ${err}`)
  }
}

save()
console.log(
  `[price] done — ${Object.keys(cache.prices).length} combo prices, ` +
    `${Object.keys(cache.bases).length} base prices cached` +
    (failed ? ` (${failed} failed)` : ''),
)
