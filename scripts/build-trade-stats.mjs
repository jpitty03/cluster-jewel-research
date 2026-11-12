// Refreshes src/data/trade-stats.json, the trade-site ids the price queries are built from,
// straight from the trade site's public stats listing. Run at the start of a league (it is
// part of `npm run publish`): a notable or cluster type the file does not know cannot be
// priced or linked.
//
// Usage: node scripts/build-trade-stats.mjs
// Reads:  https://www.pathofexile.com/api/trade/data/stats (one request, not rate limited
//         like the search endpoint)
// Writes: src/data/trade-stats.json
//
// Output shape:
//   clusterTypeOptions: cluster type text -> option id for enchant.stat_3948993189
//                       ("Added Small Passive Skills grant: #")
//   notableExplicits:   notable name -> explicit stat id, from the
//                       "1 Added Passive Skill is X" explicit rows
//
// The listing is merged over the existing file, so entries the site has dropped (legacy
// cluster types) stay available. If the request fails the file is left as it is and the
// script exits 0: stale ids only matter for content added since the last refresh.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'src', 'data', 'trade-stats.json')
const STATS_URL = 'https://www.pathofexile.com/api/trade/data/stats'

const CLUSTER_TYPE_STAT = 'enchant.stat_3948993189'
const CLUSTER_TYPE_PREFIX = 'Added Small Passive Skills grant: '
const NOTABLE_PREFIX = '1 Added Passive Skill is '

const existing = JSON.parse(readFileSync(OUT, 'utf8'))

let listing
try {
  const res = await fetch(STATS_URL, {
    headers: { 'user-agent': 'cluster-jewel-research/1.0', accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  listing = await res.json()
} catch (err) {
  console.warn(`[trade-stats] could not read the trade stats listing (${err}); keeping the existing file.`)
  process.exit(0)
}

const group = (id) => listing.result?.find((entry) => entry.id === id)?.entries ?? []

// A cluster type is one enchant option: "enchant.stat_3948993189|<option>". Two-line types
// repeat the prefix on each line; the UI's key is the lines joined by a space.
const clusterTypeOptions = {}
for (const entry of group('enchant')) {
  const [stat, option] = String(entry.id).split('|')
  if (stat !== CLUSTER_TYPE_STAT || !option) continue
  const text = String(entry.text)
    .split('\n')
    .map((line) => (line.startsWith(CLUSTER_TYPE_PREFIX) ? line.slice(CLUSTER_TYPE_PREFIX.length) : line))
    .join(' ')
  // When a type was reissued the site lists the old and new option under the same text;
  // the higher id is the current one.
  if (clusterTypeOptions[text] === undefined || Number(option) > Number(clusterTypeOptions[text])) {
    clusterTypeOptions[text] = option
  }
}

const notableExplicits = {}
for (const entry of group('explicit')) {
  const text = String(entry.text)
  if (text.startsWith(NOTABLE_PREFIX)) notableExplicits[text.slice(NOTABLE_PREFIX.length)] = entry.id
}

// A listing with no cluster content means the response shape changed, not that the game
// lost its cluster jewels.
if (Object.keys(clusterTypeOptions).length < 20 || Object.keys(notableExplicits).length < 100) {
  console.warn(
    `[trade-stats] listing had only ${Object.keys(clusterTypeOptions).length} cluster types and ` +
      `${Object.keys(notableExplicits).length} notables; keeping the existing file.`,
  )
  process.exit(0)
}

const added = (next, previous) => Object.keys(next).filter((key) => previous[key] === undefined)
const changed = (next, previous) =>
  Object.keys(next).filter((key) => previous[key] !== undefined && previous[key] !== next[key])
const report = (label, next, previous) => {
  const fresh = added(next, previous)
  const moved = changed(next, previous)
  if (fresh.length) console.log(`[trade-stats] new ${label}: ${fresh.join(', ')}`)
  if (moved.length) console.log(`[trade-stats] changed ${label} ids: ${moved.join(', ')}`)
}
report('cluster types', clusterTypeOptions, existing.clusterTypeOptions ?? {})
report('notables', notableExplicits, existing.notableExplicits ?? {})

const out = {
  clusterTypeOptions: { ...existing.clusterTypeOptions, ...clusterTypeOptions },
  notableExplicits: { ...existing.notableExplicits, ...notableExplicits },
}
writeFileSync(OUT, JSON.stringify(out, null, 1) + '\n')
console.log(
  `[trade-stats] ${Object.keys(out.clusterTypeOptions).length} cluster types, ` +
    `${Object.keys(out.notableExplicits).length} notables`,
)
