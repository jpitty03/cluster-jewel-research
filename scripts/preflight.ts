// Checks that a publish run can succeed before the hour-long scrape and pricing start.
// First step of `npm run publish`; also runnable alone: `npm run preflight`.
//
//   - on main, and not behind the remote (the run ends with a push)
//   - the league in league.ts is one poe.ninja has builds for
//   - the same league exists on the trade site
//
// Exits non-zero with what to do about it. Pass --offline to skip the two network checks.
import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_LEAGUE } from '../league.ts'
import { listBuildLeagues } from '../server/poeninja.ts'
import { slugify } from '../server/clusterjewels.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const league = process.env.POE_LEAGUE || DEFAULT_LEAGUE
const offline = process.argv.includes('--offline')
const git = (args: string) => execSync(`git ${args}`, { cwd: ROOT, encoding: 'utf8' }).trim()

const problems: string[] = []
const notes: string[] = []

const branch = git('rev-parse --abbrev-ref HEAD')
if (branch !== 'main') problems.push(`On branch "${branch}". The site deploys from main: git switch main`)
try {
  git('fetch --quiet')
  const behind = Number(git('rev-list --count HEAD..@{u}'))
  if (behind > 0) problems.push(`main is ${behind} commit(s) behind the remote: git pull --rebase`)
} catch {
  notes.push('Could not reach the git remote to check for new commits; the final push may fail.')
}

if (!offline) {
  try {
    const ninja = await listBuildLeagues()
    if (!ninja.some((name) => name.toLowerCase() === league.toLowerCase())) {
      problems.push(
        `poe.ninja has no builds for "${league}" yet. It lists: ${ninja.join(', ') || 'none'}. ` +
          'Check the spelling in league.ts against that list, or wait: a new league appears there ' +
          'once enough characters have been indexed, usually within a day of launch.',
      )
    }
  } catch (err) {
    notes.push(`Could not read poe.ninja's league list (${err}); the scrape will report its own errors.`)
  }

  try {
    const res = await fetch('https://www.pathofexile.com/api/trade/data/leagues', {
      headers: { 'user-agent': 'cluster-jewel-research/1.0', accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = (await res.json()) as { result?: Array<{ id: string; realm: string }> }
    const pc = (body.result ?? []).filter((entry) => entry.realm === 'pc').map((entry) => entry.id)
    if (!pc.includes(league)) {
      problems.push(
        `The trade site has no league called "${league}" (it is case-sensitive). ` +
          `It lists: ${pc.join(', ')}. Pricing would fail on every search.`,
      )
    }
  } catch (err) {
    notes.push(`Could not read the trade site's league list (${err}); pricing will report its own errors.`)
  }
}

const firstRun = !existsSync(join(ROOT, 'src', 'data', slugify(league), 'cluster-jewels.json'))
if (firstRun) {
  notes.push(
    `First run for ${league}: the crawl fetches one character every 15 seconds (about 3 hours ` +
      'for 700 characters) and the ~300 trade searches take about another hour. ' +
      'Both save as they go, so an interrupted run resumes where it stopped.',
  )
}

for (const note of notes) console.log(`[preflight] note: ${note}`)
if (problems.length) {
  for (const problem of problems) console.error(`[preflight] ${problem}`)
  process.exit(1)
}
console.log(`[preflight] ${league}: ready to publish.`)
