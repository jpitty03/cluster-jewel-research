// Standalone scrape pipeline for the static-site publish flow. Runs the poe.ninja
// scrapes standalone (no dev server) and writes the per-league snapshots the
// production build bundles from src/data/<league-slug>/.
//
// Usage: npx tsx scripts/scrape.ts [--league=<Name>] [--full] [--browser]
//
// The league defaults to DEFAULT_LEAGUE in league.ts (env POE_LEAGUE overrides).
//
// Cluster crawling defaults to *resume* — only new/missing cluster-holders are
// fetched (fast, thanks to the persistent store + raw-mod retention). Pass --full
// to clear the league's store and refetch everything.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_LEAGUE } from '../league.ts'
import { getStreamerBuilds } from '../server/poeninja.ts'
import { crawlToCompletion, slugify, stopCrawl } from '../server/clusterjewels.ts'
import { enablePoeNinjaBrowser, closePoeNinjaBrowser } from '../server/poeninjaHttp.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const full = process.argv.includes('--full')
const league =
  process.argv.find((a) => a.startsWith('--league='))?.slice('--league='.length) ||
  process.env.POE_LEAGUE ||
  DEFAULT_LEAGUE

async function main(): Promise<void> {
  if (process.argv.includes('--help')) {
    console.log('Usage: npm run scrape -- [--league=Covens] [--full] [--browser]')
    console.log('--browser opens visible Chrome with a saved profile; complete verification there if asked.')
    return
  }
  if (process.argv.includes('--browser')) enablePoeNinjaBrowser()

  const outDir = join(ROOT, 'src', 'data', slugify(league))
  mkdirSync(outDir, { recursive: true })

  // 1. Streamers (Characters tab). Uses the non-rate-limited search endpoint.
  console.log(`[scrape] ${league}: streamers…`)
  const streamers = await getStreamerBuilds(league, true)
  // Bail before writing rather than overwrite a good snapshot with an empty one:
  // poe.ninja reporting matches but yielding no rows means the response format
  // shifted under the decoder, not that the league is empty.
  if (streamers.total > 0 && streamers.builds.length === 0) {
    throw new Error(
      `${league}: poe.ninja reports ${streamers.total} builds but none decoded — ` +
        'aborting without writing. The search response format has likely changed.',
    )
  }
  console.log(`[scrape] ${league}: ${streamers.builds.length} builds`)

  // 2. Cluster jewels — the rate-limited per-character crawl (resume by default).
  console.log(
    `[scrape] ${league}: cluster jewels (${full ? 'full' : 'resume'})… this can take a while`,
  )
  const clusters = await crawlToCompletion(league, full)

  // Gate before anything reaches src/data (which `npm run publish` commits): an
  // outage or a block on the character endpoint only bumps an error counter, and
  // would otherwise replace a good snapshot with a sliver of one.
  const MIN_FETCHED_SHARE = 0.9
  const fetchedShare = clusters.charactersTotal
    ? clusters.charactersFetched / clusters.charactersTotal
    : 0
  // A league's first day or two: nobody on poe.ninja's ladder holds a cluster jewel yet. That
  // is not a failed crawl, so say what it is instead of quoting a 0/0 share.
  if (clusters.charactersTotal === 0) {
    throw new Error(
      `${league}: poe.ninja lists no level 80+ characters with cluster jewels yet. ` +
        'Nothing was written. Try again once the league is a day or two old.',
    )
  }
  if (clusters.jewels.length === 0 || fetchedShare < MIN_FETCHED_SHARE) {
    throw new Error(
      `${league}: only ${clusters.charactersFetched}/${clusters.charactersTotal} ` +
        `cluster-holders fetched (${clusters.jewels.length} jewels) — below the ` +
        `${MIN_FETCHED_SHARE * 100}% gate, so src/data was left untouched. ` +
        'Re-run `npm run scrape` to resume; fetched characters are kept in data/.',
    )
  }

  // Both snapshots are written together, after the crawl, so a league never ends up
  // with a Characters tab but no Cluster Jewels data.
  writeFileSync(join(outDir, 'streamers.json'), JSON.stringify(streamers))
  copyFileSync(
    join(ROOT, 'data', slugify(league), 'cluster-jewels.json'),
    join(outDir, 'cluster-jewels.json'),
  )
  console.log(
    `[scrape] ${league}: ${clusters.jewels.length} jewels from ` +
      `${clusters.charactersFetched}/${clusters.charactersTotal} cluster-holders`,
  )

  console.log('[scrape] done.')
}

const interrupt = (code: number) => {
  stopCrawl()
  void closePoeNinjaBrowser().finally(() => process.exit(code))
}
process.once('SIGINT', () => interrupt(130))
process.once('SIGTERM', () => interrupt(143))

try {
  await main()
} catch (error) {
  console.error(`[scrape] ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
} finally {
  stopCrawl()
  await closePoeNinjaBrowser()
}
