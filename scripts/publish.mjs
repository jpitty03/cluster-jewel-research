// Commit the freshly-scraped data snapshots and push, which triggers the GitHub
// Actions workflow to rebuild and redeploy the site. Run after `npm run scrape`
// (or use `npm run publish`, which chains scrape + price + this).

import { execSync } from 'node:child_process'

const run = (cmd) => {
  console.log(`$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit' })
}
const out = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()

// Only main deploys; a data commit pushed anywhere else updates nothing.
const branch = out('git rev-parse --abbrev-ref HEAD')
if (branch !== 'main') {
  console.error(`On branch "${branch}" — the site only deploys from main. Switch branches and re-run.`)
  process.exit(1)
}

// league.ts rides along: the deployed site reads the current league from it, so a league
// change that stayed local would leave the optimizer defaulting to the old league's prices.
run('git add src/data league.ts')

// `git diff --cached --quiet` exits non-zero when there are staged changes.
let hasChanges = false
try {
  execSync('git diff --cached --quiet -- src/data league.ts')
} catch {
  hasChanges = true
}

// Commit src/data and league.ts only: anything else that happens to be staged stays staged
// rather than riding along in a "data:" commit.
if (hasChanges) run(`git commit -m "data: ${new Date().toISOString()}" -- src/data league.ts`)

// Push whenever main is ahead of its upstream, not only when this run committed —
// otherwise a push that failed last time (network, remote moved) leaves a commit
// that every later run reports as "nothing to do".
const ahead = Number(out('git rev-list --count @{u}..HEAD'))
if (ahead === 0) {
  console.log('No data changes to publish — nothing to do.')
  process.exit(0)
}

try {
  run('git push')
} catch {
  console.error(
    'git push failed — the data commit is still local. Fix the cause (e.g. `git pull --rebase`) ' +
      'and re-run `node scripts/publish.mjs`; it will push without re-scraping.',
  )
  process.exit(1)
}
console.log('Pushed. GitHub Actions will build and deploy the updated snapshot.')
