// Headless scrape pipeline for the static-site publish flow. Runs the poe.ninja
// scrapes standalone (no dev server) and writes the snapshots the production build
// bundles from src/data/. Run: `npx tsx scripts/scrape.ts [--full]`
//
// Cluster crawling defaults to *resume* — only new/missing cluster-holders are
// fetched (fast, thanks to the persistent store + raw-mod retention). Pass --full
// to clear the store and refetch everything.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getStreamerBuilds } from '../server/poeninja.ts'
import { crawlToCompletion } from '../server/clusterjewels.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC_DATA = join(ROOT, 'src', 'data')
const full = process.argv.includes('--full')

mkdirSync(SRC_DATA, { recursive: true })

// 1. Streamers (Characters tab). Uses the non-rate-limited search endpoint.
console.log('[scrape] streamers…')
const streamers = await getStreamerBuilds(true)
writeFileSync(join(SRC_DATA, 'streamers.json'), JSON.stringify(streamers))
console.log(`[scrape] streamers: ${streamers.builds.length} builds`)

// 2. Cluster jewels — the rate-limited per-character crawl (resume by default).
console.log(`[scrape] cluster jewels (${full ? 'full' : 'resume'})… this can take a while`)
const clusters = await crawlToCompletion(full)
copyFileSync(join(ROOT, 'data', 'cluster-jewels.json'), join(SRC_DATA, 'cluster-jewels.json'))
console.log(
  `[scrape] cluster jewels: ${clusters.jewels.length} jewels from ` +
    `${clusters.charactersFetched}/${clusters.charactersTotal} cluster-holders`,
)

console.log('[scrape] done. Now run poedb (npm run scrape:poedb) if mod pools changed.')
