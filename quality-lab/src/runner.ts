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
import { runAnimationScenario } from './scenarios/animationScenario.ts';

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

  const scenarioArgIndex = process.argv.indexOf('--scenario');
  const requestedScenario = scenarioArgIndex >= 0 ? process.argv[scenarioArgIndex + 1]?.toLowerCase() : 'all';

  const results = [];

  if (requestedScenario === 'all' || requestedScenario === 'smoke') {
    console.log('Running Suite: Smoke Scenario...');
    results.push(await runSmokeScenario(appUrl));
  }

  if (requestedScenario === 'all' || requestedScenario === 'methods' || requestedScenario === 'portfolio') {
    console.log('Running Suite: Method Portfolio Scenario...');
    results.push(await runMethodPortfolioScenario(appUrl));
  }

  if (requestedScenario === 'all' || requestedScenario === 'objectives' || requestedScenario === 'multiobjective') {
    console.log('Running Suite: Multi-Objective Scenario...');
    results.push(await runMultiObjectiveScenario(appUrl));
  }

  if (requestedScenario === 'all' || requestedScenario === 'responsive' || requestedScenario === 'accessibility') {
    console.log('Running Suite: Responsive & Accessibility Scenario...');
    results.push(await runResponsiveScenario(appUrl));
  }

  if (requestedScenario === 'all' || requestedScenario === 'animation' || requestedScenario === 'constellation') {
    console.log('Running Suite: Markov Constellation & Animation Scenario...');
    results.push(await runAnimationScenario(appUrl));
  }

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
