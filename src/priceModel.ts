// The shape of src/data/<league>/trade-prices.json plus the arithmetic for reading
// it, shared by scripts/price.ts (which writes the file) and src/ClusterJewels.tsx
// (which renders it) — the same UI↔script split as tradeQuery.ts and
// clusterAggregate.ts. Keep this dependency-free: it is imported from both a React
// component and a node script.
//
// Trade listings are posted in whatever currency the seller chose, so the cache
// holds a mix of chaos, divine, alt and regret. Anything that compares two prices —
// sorting a column, taking a median — first has to put them on one scale, which is
// what the `rates` block (chaos value per currency, from poe.ninja) is for.

export interface Money {
  amount: number
  currency: string
}

export interface PriceEntry {
  low: Money | null
  mid: Money | null
  listed: number
  sampled: number
  passivesMin: number | null
  passivesMax: number | null
  at: string
  /** Distinct seller accounts in the sample. Absent in entries priced before 2026-11. */
  sellers?: number
  /** A lone cheapest listing that was set aside as a lowball; `low` is the next seller. */
  lowOutlier?: Money
}

export interface PriceFile {
  version: number
  league: string
  fetchedAt: string
  /** Chaos value per currency id, from poe.ninja. Absent in caches written before rates existed. */
  rates?: Record<string, number>
  ratesAt?: string
  prices: Record<string, PriceEntry>
  bases: Record<string, PriceEntry>
}

// Bump when the cache keys or the queries behind them change, so a stale file is
// discarded instead of leaving entries that no lookup can ever match again. Adding
// a field (like `rates`) is not a reason to bump — that would throw away hours of
// rate-limited pricing to gain nothing.
export const CACHE_VERSION = 2

// Currency ids where the trade site and poe.ninja disagree. Everything else
// (chaos, divine, exalted, alt, regret, alch, vaal, mirror, …) matches on both.
const CURRENCY_ALIAS: Record<string, string> = {
  fuse: 'fusing',
  jew: 'jewellers',
}

// What a listing is worth in chaos, or null when the currency isn't in the rate
// table — an unpriceable listing has to be excluded from comparisons, not treated
// as free.
export function chaosValue(
  rates: Record<string, number> | undefined,
  money: Money | null | undefined,
): number | null {
  if (!money) return null
  // Chaos is the unit: worth 1 with or without a rate table, so a file whose rates
  // never arrived still compares its chaos listings.
  if (money.currency === 'chaos') return money.amount
  if (!rates) return null
  const rate = rates[money.currency] ?? rates[CURRENCY_ALIAS[money.currency]]
  return rate ? money.amount * rate : null
}

// Only the currencies that actually carry cluster jewel prices get an abbreviation;
// anything else prints as the trade site names it rather than guessing.
const SHORT_CURRENCY: Record<string, string> = {
  chaos: 'c',
  divine: 'div',
  exalted: 'ex',
  mirror: 'mir',
}

export const num = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '')

export const money = (p: Money | null | undefined) => (p ? `${num(p.amount)} ${p.currency}` : '—')

export const shortMoney = (p: Money | null | undefined) =>
  p ? `${num(p.amount)}${SHORT_CURRENCY[p.currency] ?? ` ${p.currency}`}` : '—'

// A chaos amount as the currency a player would actually quote it in: divine once
// it's worth at least one, chaos below that.
export const chaosToMoney = (chaos: number, rates: Record<string, number> | undefined): Money => {
  const div = rates?.divine
  return div && chaos >= div
    ? { amount: chaos / div, currency: 'divine' }
    : { amount: chaos, currency: 'chaos' }
}

export const formatChaos = (chaos: number, rates: Record<string, number> | undefined): string =>
  shortMoney(chaosToMoney(chaos, rates))

// The item at which half the weight has accumulated, reading the list from cheapest
// upward. Used to summarize a group by the price of a *typical purchase* rather than
// a typical listing: each combo weighs what its usage count says, so a combo 142
// characters run counts more than one nine of them do.
export function weightedMedian<T extends { chaos: number; weight: number }>(items: T[]): T | null {
  if (items.length === 0) return null
  const sorted = [...items].sort((a, b) => a.chaos - b.chaos)
  const total = sorted.reduce((s, i) => s + i.weight, 0)
  if (total <= 0) return sorted[Math.floor((sorted.length - 1) / 2)]

  let acc = 0
  for (const item of sorted) {
    acc += item.weight
    if (acc * 2 >= total) return item
  }
  return sorted[sorted.length - 1] // unreachable, but keeps the return type honest
}

/** One priced trade listing, cheapest first as the trade API returns them. */
export interface SampledListing {
  price: Money | null
  account?: string
}

/** A cheapest listing under this fraction of the next seller's price is set aside. */
const LOWBALL_RATIO = 0.5

/**
 * Reduces the cheap end of a trade search to the numbers the site shows.
 *
 * One seller often lists the same jewel several times, and price-fixers post a single
 * listing far below the book that they never sell. So: one listing per seller, and when at
 * least three sellers are sampled, a cheapest listing below half of the next seller's price
 * is recorded as `lowOutlier` instead of `low`. The comparison needs both prices in chaos;
 * without rates for either currency the listing is kept.
 */
export function summarizeListings(
  listings: readonly SampledListing[],
  rates: Record<string, number> | undefined,
): Pick<PriceEntry, 'low' | 'mid' | 'sampled' | 'sellers' | 'lowOutlier'> {
  const seen = new Set<string>()
  const bySeller: Money[] = []
  let sampled = 0
  for (const listing of listings) {
    if (!listing.price) continue
    sampled++
    if (listing.account) {
      if (seen.has(listing.account)) continue
      seen.add(listing.account)
    }
    bySeller.push(listing.price)
  }
  let lowOutlier: Money | undefined
  if (bySeller.length >= 3) {
    const first = chaosValue(rates, bySeller[0])
    const second = chaosValue(rates, bySeller[1])
    if (first != null && second != null && first < second * LOWBALL_RATIO) {
      lowOutlier = bySeller.shift()
    }
  }
  return {
    low: bySeller[0] ?? null,
    mid: bySeller[Math.floor((bySeller.length - 1) / 2)] ?? null,
    sampled,
    sellers: bySeller.length + (lowOutlier ? 1 : 0),
    ...(lowOutlier ? { lowOutlier } : {}),
  }
}
