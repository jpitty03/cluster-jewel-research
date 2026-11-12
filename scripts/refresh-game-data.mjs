// Refreshes the two game-data files a new patch can change, without letting either refresh
// break a publish run:
//
//   src/data/trade-stats.json         trade-site ids for cluster types and notables
//   src/data/poedb-cluster-mods.json  mod pools the craft optimizer is built on
//
// Each scraper keeps the existing file if its source is unreachable or looks wrong. On top
// of that, a changed mod pool has to pass the engine's unit tests; if it does not, the
// previous pool files are restored and the run continues with them.
//
// Usage: node scripts/refresh-game-data.mjs   (second step of `npm run publish`)
import { execSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const POOL_FILES = ['src/data/poedb-cluster-mods.json', 'src/data/poedb-horticrafting.json']
const run = (command) => spawnSync(command, { cwd: ROOT, stdio: 'inherit', shell: true }).status === 0
const restorePools = () => execSync(`git checkout -- ${POOL_FILES.join(' ')}`, { cwd: ROOT })
const pools = () => {
  const data = JSON.parse(readFileSync(join(ROOT, POOL_FILES[0]), 'utf8'))
  delete data.fetchedAt
  return JSON.stringify(data)
}

run('node scripts/build-trade-stats.mjs')

const before = pools()
if (!run('node scripts/scrape-poedb.mjs')) {
  console.warn('[game-data] poedb scrape did not complete; keeping the existing mod pools.')
  restorePools()
} else if (pools() === before) {
  // Same pools: do not let a new fetchedAt alone produce a data commit.
  restorePools()
} else {
  console.log('[game-data] mod pools changed; checking the crafting engine against them…')
  if (run('npx vitest run')) {
    console.log('[game-data] new mod pools accepted.')
  } else {
    restorePools()
    console.warn(
      '[game-data] The crafting engine tests fail with the new mod pools, so the previous pools ' +
        'were restored and this run continues with them. The cluster jewel table is unaffected; ' +
        'the craft optimizer will not know about mods added this patch until this is looked at ' +
        '(run `node scripts/scrape-poedb.mjs`, then `npx vitest run` to see the failures).',
    )
  }
}
