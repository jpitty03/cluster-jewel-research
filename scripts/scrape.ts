// Headless scrape pipeline for the static-site publish flow. Runs the poe.ninja
// scrapes standalone (no dev server) and writes the per-league snapshots the
// production build bundles from src/data/<league-slug>/.
//
// Usage: npx tsx scripts/scrape.ts [--league=Mirage] [--full]
//
// Cluster crawling defaults to *resume* — only new/missing cluster-holders are
// fetched (fast, thanks to the persistent store + raw-mod retention). Pass --full
// to clear the league's store and refetch everything.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getStreamerBuilds } from '../server/poeninja.ts'
import { crawlToCompletion, slugify } from '../server/clusterjewels.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const full = process.argv.includes('--full')
const league =
  process.argv.find((a) => a.startsWith('--league='))?.slice('--league='.length) || 'Mirage'

const outDir = join(ROOT, 'src', 'data', slugify(league))
mkdirSync(outDir, { recursive: true })

// 1. Streamers (Characters tab). Uses the non-rate-limited search endpoint.
console.log(`[scrape] ${league}: streamers…`)
const streamers = await getStreamerBuilds(league, true)
writeFileSync(join(outDir, 'streamers.json'), JSON.stringify(streamers))
console.log(`[scrape] ${league}: ${streamers.builds.length} builds`)

// 2. Cluster jewels — the rate-limited per-character crawl (resume by default).
console.log(
  `[scrape] ${league}: cluster jewels (${full ? 'full' : 'resume'})… this can take a while`,
)
const clusters = await crawlToCompletion(league, full)
copyFileSync(
  join(ROOT, 'data', slugify(league), 'cluster-jewels.json'),
  join(outDir, 'cluster-jewels.json'),
)
console.log(
  `[scrape] ${league}: ${clusters.jewels.length} jewels from ` +
    `${clusters.charactersFetched}/${clusters.charactersTotal} cluster-holders`,
)

console.log('[scrape] done. Run `npm run scrape:poedb` too if mod pools changed (new patch).')
