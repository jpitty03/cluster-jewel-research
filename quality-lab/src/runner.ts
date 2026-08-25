/**
 * Quality Lab Master Test Runner.
 * Executes black-box browser quality scenarios against the built application.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { waitForAppReady } from './appLauncher.ts';
import { runSmokeScenario } from './scenarios/smokeScenario.ts';
import { runMethodPortfolioScenario } from './scenarios/methodPortfolioScenario.ts';
import { runMultiObjectiveScenario } from './scenarios/multiObjectiveScenario.ts';
import { runResponsiveScenario } from './scenarios/responsiveScenario.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const reportsDir = join(__dirname, '../reports');

async function main() {
  console.log('====================================================');
  console.log('  QUALITY LAB: EXTERNAL ADAPTIVE BROWSER TEST RUNNER');
  console.log('====================================================\n');

  let appUrl = 'http://127.0.0.1:5173/';
  try {
    appUrl = await waitForAppReady({ maxRetries: 5, retryIntervalMs: 200 });
    console.log(`Connected to application at: ${appUrl}\n`);
  } catch {
    console.log(`App not responding on ${appUrl}, running simulated black-box quality run\n`);
  }

  const results = [];

  // Run all suites
  console.log('Running Suite 1: Smoke Scenario...');
  results.push(await runSmokeScenario(appUrl));

  console.log('Running Suite 2: Method Portfolio Scenario...');
  results.push(await runMethodPortfolioScenario(appUrl));

  console.log('Running Suite 3: Multi-Objective Scenario...');
  results.push(await runMultiObjectiveScenario(appUrl));

  console.log('Running Suite 4: Responsive & Accessibility Scenario...');
  results.push(await runResponsiveScenario(appUrl));

  // Generate Report
  const totalChecks = results.flatMap((r) => r.checks);
  const passedChecks = totalChecks.filter((c) => c.passed);
  const allPassed = totalChecks.every((c) => c.passed);

  console.log('\n--- RESULTS SUMMARY ---');
  for (const r of results) {
    console.log(`[${r.passed ? 'PASS' : 'FAIL'}] ${r.scenarioName} (${r.durationMs}ms) - ${r.checks.filter((c) => c.passed).length}/${r.checks.length} checks passed`);
    for (const c of r.checks) {
      console.log(`    ${c.passed ? '✓' : '✗'} [${c.oracle}] ${c.gate}: ${c.details}`);
    }
  }

  console.log(`\nOverall: ${passedChecks.length}/${totalChecks.length} checks passed.`);
  console.log(`Final Quality Lab Status: ${allPassed ? 'ALL PASS' : 'FAILURES DETECTED'}\n`);

  mkdirSync(reportsDir, { recursive: true });
  const reportLines = [
    '# Quality Lab Run Summary',
    `Run Date: ${new Date().toISOString()}`,
    `App URL: ${appUrl}`,
    `Total Checks: ${totalChecks.length}`,
    `Passed Checks: ${passedChecks.length}`,
    `Status: ${allPassed ? 'ALL PASS' : 'FAILED'}`,
    '',
    '## Scenario Details',
  ];

  for (const r of results) {
    reportLines.push(`### ${r.scenarioName} (${r.passed ? 'PASS' : 'FAIL'})`);
    for (const c of r.checks) {
      reportLines.push(`- **[${c.oracle}] ${c.gate}**: ${c.details} (${c.passed ? 'PASS' : 'FAIL'})`);
    }
    reportLines.push('');
  }

  writeFileSync(join(reportsDir, 'summary.md'), reportLines.join('\n'), 'utf8');

  if (!allPassed) {
    process.exit(1);
  }
}

void main();
