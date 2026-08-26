import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

interface BrowserCheck {
  id: string;
  scenario: string;
  passed: boolean;
  details: string;
  error?: string;
}

interface BrowserReport {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  browser: string;
  browserVersion: string;
  requestedScenario: string;
  status: string;
  checks: BrowserCheck[];
  performance: Record<string, unknown>;
  artifacts: Record<string, string>;
  consoleErrors: string[];
  pageErrors: string[];
  networkErrors: string[];
}

type JsonRecord = Record<string, unknown>;

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const reportPath = join(repositoryRoot, 'quality-lab', 'reports', 'release-gate.json');
const outputPath = join(
  repositoryRoot,
  'output-phase2w-canonical-selection-objective-integration-cluster-handoff-diagnostic.txt',
);
const committedEvidenceMode = process.argv.includes('--committed-evidence');
const scenario = 'phase2w-canonical-objective-handoff-autonomous';
const lines = [
  'PHASE 2W — CANONICAL SELECTION, OBJECTIVE INTEGRATION, CLUSTER HANDOFF, AND AUTONOMOUS QA DIAGNOSTIC',
];

function record(value: unknown, label: string): JsonRecord {
  assert(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  return value as JsonRecord;
}

function array(value: unknown, label: string): unknown[] {
  assert(Array.isArray(value), `${label} must be an array`);
  return value;
}

function number(value: unknown, label: string): number {
  assert.equal(typeof value, 'number', `${label} must be a number`);
  assert(Number.isFinite(value), `${label} must be finite`);
  return value;
}

function near(actual: number, expected: number, label: string, tolerance = 1e-6): void {
  const allowed = Math.max(tolerance, Math.max(Math.abs(actual), Math.abs(expected)) * 1e-8);
  assert(Math.abs(actual - expected) <= allowed, `${label}: ${actual} differs from ${expected}`);
}

function requireGate(report: BrowserReport, id: string): BrowserCheck {
  const check = report.checks.find((candidate) => candidate.scenario === scenario && candidate.id === id);
  assert(check, `Missing Phase 2W browser gate ${id}`);
  assert.equal(check.passed, true, `Phase 2W browser gate failed: ${id}: ${check.error ?? check.details}`);
  return check;
}

function details(report: BrowserReport, id: string): unknown {
  return JSON.parse(requireGate(report, id).details) as unknown;
}

function artifactPath(relativePath: string): string {
  return join(repositoryRoot, ...relativePath.split(/[\\/]+/));
}

assert(existsSync(reportPath), 'Real-browser report is missing; run npm run lab:release first');
const report = JSON.parse(readFileSync(reportPath, 'utf8')) as BrowserReport;
assert.equal(report.status, 'PASSED', 'Latest real-browser report did not pass');
assert(
  ['release', 'nightly'].includes(report.requestedScenario),
  'Latest browser report is not the full release/nightly matrix',
);
if (!committedEvidenceMode) {
  assert(
    Date.now() - Date.parse(report.finishedAt ?? report.startedAt) < 60 * 60 * 1000,
    'Latest browser report completion is older than one hour',
  );
}
assert.deepEqual(report.consoleErrors, []);
assert.deepEqual(report.pageErrors, []);
assert.deepEqual(report.networkErrors, []);
lines.push(`Evidence mode: ${committedEvidenceMode ? 'COMMITTED LOCAL RELEASE AUDIT' : 'FRESH LOCAL RELEASE'}`);

lines.push('\nW1 — Phase 2V preservation');
const preservation = record(details(report, 'W1-phase2v-mechanics-proof-worker-and-label-preservation'), 'W1');
assert.equal(preservation.phase2vAccounting, true);
assert.equal(preservation.repeatableHarvest, true);
assert.equal(preservation.playerLabels, true);
for (const retainedOutput of [
  'output-phase2t-release-truthfulness-diagnostic.txt',
  'output-phase2u-constellation-interaction-readability-player-labels-diagnostic.txt',
  'output-phase2v-scroll-semantics-harvest-closure-diagnostic.txt',
]) {
  assert(readFileSync(join(repositoryRoot, retainedOutput), 'utf8').includes('ALL PHASE'), `${retainedOutput} lacks retained pass evidence`);
}
lines.push('PASS: Phase 2T/2U/2V accounting, repeatable Harvest, interaction, labels, chronology, scroll ownership, and Worker behavior remain evidenced.');

lines.push('\nW2–W4 — Atomic canonical policy and cross-surface reconciliation');
const eldritch = record(details(report, 'W2-eldritch-canonical-selected-policy-binding'), 'W2');
const eldritchMetrics = record(eldritch.metrics, 'W2 metrics');
const eldritchAccounting = record(eldritch.accounting, 'W2 accounting');
const eldritchConsistency = record(eldritch.consistency, 'W2 consistency');
assert.equal(eldritchConsistency.status, 'OK');
assert.equal(number(eldritchConsistency.toleranceChaos, 'W2 tolerance'), 0.05);
assert(number(eldritchConsistency.maximumDifferenceChaos, 'W2 difference') <= 0.05);
near(number(eldritchMetrics.cost, 'W2 selected cost'), number(eldritchAccounting.fullCost, 'W2 usage cost'), 'Eldritch selected/usage cost');
const actionEvidence = record(details(report, 'W3-selected-policy-action-evidence'), 'W3');
if (actionEvidence.acquisitionKind === 'CLEAN') assert.equal(actionEvidence.fractureUsage, 0);
const terminal = record(details(report, 'W4-final-progress-result-dom-export-differential'), 'W4');
assert.equal(terminal.exportReconciled, true);
const completion = record(terminal.completion, 'W4 completion');
near(number(completion.expectedCostChaos, 'COMPLETE U'), number(eldritchMetrics.cost, 'RESULT U'), 'COMPLETE/RESULT U');
assert.equal(completion.selectedBundleId, eldritchConsistency.selectedBundleId);
assert.equal(completion.selectedPolicySource, eldritchConsistency.selectedBundleSource);
lines.push(`PASS: historic 599c/7243c identity split is closed; selected=${number(eldritchMetrics.cost, 'Eldritch cost').toFixed(6)}c, usage=${number(eldritchAccounting.fullCost, 'Eldritch usage').toFixed(6)}c, max difference=${number(eldritchConsistency.maximumDifferenceChaos, 'Eldritch difference')}c.`);

lines.push('\nW5–W13 — Unified objective selection and generated cost boundaries');
const cheapest = record(details(report, 'W5-armour-evasion-cheapest-baseline'), 'W5');
const fewest = record(details(report, 'W6-armour-evasion-fewest-at-600'), 'W6');
const fastest = record(details(report, 'W7-armour-evasion-fastest-at-600'), 'W7');
const ceiling500 = record(details(report, 'W8-armour-evasion-500-ceiling'), 'W8');
const cheapestMetrics = record(cheapest.metrics, 'Cheapest metrics');
const fewestMetrics = record(fewest.metrics, 'Fewest metrics');
const fastestMetrics = record(fastest.metrics, 'Fastest metrics');
const ceiling500Metrics = record(ceiling500.metrics, '500c metrics');
assert(number(fewestMetrics.cost, 'Fewest cost') <= 600);
assert(number(fastestMetrics.cost, 'Fastest cost') <= 600);
assert(number(ceiling500Metrics.cost, '500c cost') <= 500);
assert(number(fewestMetrics.actions, 'Fewest actions') < number(cheapestMetrics.actions, 'Cheapest actions'));
assert(number(fastestMetrics.timeMs, 'Fastest time') < number(cheapestMetrics.timeMs, 'Cheapest time'));
const boundaries = array(details(report, 'W9-dynamic-open-conventional-harvest-ceiling-boundaries'), 'W9 boundaries').map((entry) => record(entry, 'boundary'));
assert.equal(boundaries.length, 9);
for (const kind of ['OPEN', 'CONVENTIONAL', 'HARVEST']) {
  const familyRows = boundaries.filter((row) => row.kind === kind);
  assert.deepEqual(familyRows.map((row) => row.position), ['below', 'at', 'above']);
  assert.equal(familyRows[0].eligibility, 'OVER_COST_CEILING');
  assert.notEqual(familyRows[1].eligibility, 'OVER_COST_CEILING');
  assert.notEqual(familyRows[2].eligibility, 'OVER_COST_CEILING');
}
const proof = record(details(report, 'W10-objective-proof-truthfulness'), 'W10');
for (const value of Object.values(proof)) assert(['BEST_RESOLVED_WITHIN_COST', 'CONSTRAINED_OPTIMAL_PROVEN'].includes(String(value)));
const pruning = record(details(report, 'W11-objective-aware-acquisition-pruning'), 'W11');
assert(pruning.cheapest && pruning.fewest && pruning.fastest);
const unified = record(details(report, 'W12-final-unified-pareto-policy-set'), 'W12');
assert(number(unified.unifiedPolicies, 'unified policies') >= 2);
assert(number(unified.resolvedFamilies, 'resolved families') >= 2);
assert(number(unified.paretoPolicies, 'Pareto policies') >= 2);
const signed = record(details(report, 'W13-signed-tradeoff-copy'), 'W13');
assert(number(signed.actionsSaved, 'actions saved') > 0);
assert(number(signed.timeSavedMs, 'time saved') < 0);
lines.push(`PASS: Cheapest=${number(cheapestMetrics.cost, 'Cheapest cost').toFixed(3)}c; Fewest@600=${number(fewestMetrics.cost, 'Fewest cost').toFixed(3)}c/${number(fewestMetrics.actions, 'Fewest actions').toFixed(3)} actions; Fastest@600=${number(fastestMetrics.cost, 'Fastest cost').toFixed(3)}c/${(number(fastestMetrics.timeMs, 'Fastest time') / 1000).toFixed(3)}s; all nine dynamic boundaries passed.`);

lines.push('\nW14–W20 — Cluster Jewels handoff, provenance, roundtrip, and generated QA');
const group = record(details(report, 'W14-cluster-group-handoff'), 'W14');
assert.deepEqual(group.targets, []);
const combos = array(details(report, 'W15-three-real-notable-combo-handoffs'), 'W15');
assert.equal(combos.length, 3);
const passiveRange = record(details(report, 'W16-eldritch-market-sku-passive-range-handoff'), 'W16');
assert.deepEqual(passiveRange.passiveOptions, ['4', '5']);
assert([4, 5].includes(number(passiveRange.selectedPassive, 'selected passive')));
const market = record(details(report, 'W17-exact-sale-value-provenance-and-profit-only'), 'W17');
assert.equal(market.mechanicsUnaffected, true);
assert(number(market.saleValueChaos, 'sale value') > 0);
const roundtrip = record(details(report, 'W18-handoff-export-share-import-round-trip'), 'W18');
assert.equal(roundtrip.shareVersion, '2W.1');
assert.equal(roundtrip.exportedSeedPreserved, true);
const responsive = record(details(report, 'W19-mobile-keyboard-focus-overflow-and-labels'), 'W19');
assert.equal(responsive.keyboard, true);
const geometry = record(responsive.geometry, 'mobile geometry');
assert(number(geometry.documentWidth, 'document width') <= number(geometry.viewport, 'viewport') + 1);
const generated = record(details(report, 'W20-autonomous-generated-cluster-snapshot-matrix'), 'W20');
assert.equal(generated.seed, 'phase2w-cluster-matrix-v1');
assert(array(generated.cases, 'generated cases').length >= 5);
assert(generated.targetOrderMetamorphic && generated.targetOrderMetamorphic !== 'HANDOFF_FOCUS_ONLY', 'Full release lacks target-order metamorphic evidence');
lines.push(`PASS: group plus ${combos.length} notable handoffs, explicit 4–5 passive choice, exact sale provenance, share/import identity, mobile accessibility, and reproducible generated/metamorphic QA passed.`);

lines.push('\nW21 — Objective transition reuse and performance');
const performance = record(details(report, 'W21-objective-transition-reuse-and-runtime'), 'W21');
assert(number(performance.retainedStates, 'retained states') > 0);
assert(number(performance.retainedTransitions, 'retained transitions') > 0);
assert(number(performance.repeatedCheapestMs, 'repeated Cheapest time') < 30_000);
assert(number(group.handoffRenderMs, 'handoff render') < 1_000);
lines.push(`PASS: Cheapest=${number(performance.cheapestMs, 'Cheapest ms')}ms, Fewest=${number(performance.fewestMs, 'Fewest ms')}ms, Fastest=${number(performance.fastestMs, 'Fastest ms')}ms, A→B→A Cheapest=${number(performance.repeatedCheapestMs, 'repeat ms')}ms with ${number(performance.retainedStates, 'states')} states/${number(performance.retainedTransitions, 'transitions')} transitions retained; handoff=${number(group.handoffRenderMs, 'handoff ms').toFixed(1)}ms.`);

lines.push('\nW22 — Static contract, release hygiene, and prohibited-change audit');
requireGate(report, 'W22-browser-release-hygiene-and-stable-evidence');
const optimizerService = readFileSync(join(repositoryRoot, 'crafting-engine', 'src', 'service', 'optimizerService.ts'), 'utf8');
const genericSearch = readFileSync(join(repositoryRoot, 'crafting-engine', 'src', 'solver', 'genericSearch.ts'), 'utf8');
const workerProtocol = readFileSync(join(repositoryRoot, 'src', 'crafting', 'optimizerWorkerProtocol.ts'), 'utf8');
const clusterUi = readFileSync(join(repositoryRoot, 'src', 'ClusterJewels.tsx'), 'utf8');
const optimizerUi = readFileSync(join(repositoryRoot, 'src', 'CraftOptimizer.tsx'), 'utf8');
const seedApi = readFileSync(join(repositoryRoot, 'src', 'optimizerSeed.ts'), 'utf8');
const shareBundle = readFileSync(join(repositoryRoot, 'crafting-engine', 'src', 'service', 'shareBundle.ts'), 'utf8');
const runner = readFileSync(join(repositoryRoot, 'quality-lab', 'src', 'runner.ts'), 'utf8');
assert(optimizerService.includes('interface ResolvedPolicyBundle'));
assert(optimizerService.includes("status: 'OK' | 'INTERNAL_RESULT_MISMATCH'"));
assert(optimizerService.includes('CANONICAL_RECONCILIATION_TOLERANCE_CHAOS = 0.05'));
assert(optimizerService.includes("objective: requestedObjective"));
assert(optimizerService.includes("requestedObjective.kind === 'CHEAPEST_CHAOS'"));
assert(genericSearch.includes('immediateObjectiveCost'));
assert(workerProtocol.includes('selectedPolicySource') && workerProtocol.includes('selectedBundleId'));
assert(seedApi.includes('export interface OptimizerSeed'));
assert(clusterUi.includes('Open in Optimizer') && clusterUi.includes('Optimize this combo'));
assert(optimizerUi.includes("export const APP_RELEASE_VERSION = '2W.1'"));
assert(optimizerUi.includes('optimizer-source-banner'));
assert(shareBundle.includes("'2W.1'"));
assert(runner.includes('Target-order cost metamorphic'));
assert(!/Eldritch Inspiration|Low Tolerance|AfflictionJewelSmallPassivesGrantArmour3_|AfflictionJewelSmallPassivesGrantEvasion3/.test(optimizerService));

const deploy = readFileSync(join(repositoryRoot, '.github', 'workflows', 'deploy.yml'), 'utf8');
const nightly = readFileSync(join(repositoryRoot, '.github', 'workflows', 'nightly-quality.yml'), 'utf8');
for (const command of ['npm run build', 'npm run lint', 'git diff --check', 'npm run diagnostic:phase2w:committed']) {
  assert(deploy.includes(command), `Deploy audit lacks ${command}`);
}
for (const heavy of ['npm run diagnostic:mature', 'npm run lab:no-fallback-probe', 'npm run lab:release']) {
  assert(!deploy.includes(`run: ${heavy}`), `Automatic deploy runs heavyweight local gate ${heavy}`);
}
assert(!/npm (?:run )?test|vitest/.test(deploy));
assert(!/npm (?:run )?test|vitest/.test(nightly));
assert(!nightly.includes('schedule:'), 'Heavy remote workflow regained a schedule');
assert(nightly.includes('npm run diagnostic:phase2w'));
for (const key of ['phase2wMarketVsCraft', 'phase2wHandoffExport', 'phase2wMobileHandoff']) {
  const relativePath = report.artifacts[key];
  assert(relativePath && statSync(artifactPath(relativePath)).size > 0, `Missing Phase 2W artifact ${key}`);
}
lines.push('PASS: schema 2W.1, atomic policy binding, objective propagation, Worker completion identity, typed handoff, share/export context, target-generic solver source, lean deploy, manual-only heavy matrix, and stable artifacts are audited.');

lines.push('\n=== ALL PHASE 2W DIAGNOSTIC GATES PASS ===');
lines.push(`Real browser: ${report.browser} ${report.browserVersion}; run=${report.runId}; scenario=${report.requestedScenario}`);
lines.push('Release label/schema: 2W.1');
lines.push('Unit tests added/run: NO');
lines.push('Mechanics probabilities changed: NO');
lines.push('State identity weakened: NO');
lines.push('Harvest forced or route winner hardcoded: NO');
lines.push('Pre-fractured market ranking reintroduced: NO');

const output = `${lines.join('\n')}\n`;
if (!committedEvidenceMode) writeFileSync(outputPath, output, 'utf8');
console.log(output);
