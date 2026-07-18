// Commit the freshly-scraped data snapshots and push, which triggers the GitHub
// Actions workflow to rebuild and redeploy the site. Run after `npm run scrape`
// (or use `npm run publish`, which chains both).

import { execSync } from 'node:child_process'

const run = (cmd) => {
  console.log(`$ ${cmd}`)
  execSync(cmd, { stdio: 'inherit' })
}

run('git add src/data')

// `git diff --cached --quiet` exits non-zero when there are staged changes.
let hasChanges = false
try {
  execSync('git diff --cached --quiet')
} catch {
  hasChanges = true
}

if (!hasChanges) {
  console.log('No data changes to publish — nothing to do.')
  process.exit(0)
}

run(`git commit -m "data: ${new Date().toISOString()}"`)
run('git push')
console.log('Pushed. GitHub Actions will build and deploy the updated snapshot.')
