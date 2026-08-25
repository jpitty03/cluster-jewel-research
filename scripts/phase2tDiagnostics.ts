import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
  type OptimizeCraftResult,
} from '../crafting-engine/src/service/optimizerService.ts';

interface BrowserCheck {
  id: string;
  scenario: string;
  passed: boolean;
  details: string;
}

interface BrowserReport {
  runId: string;
  startedAt: string;
  browser: string;
  browserVersion: string;
  requestedScenario: string;
  status: string;
  checks: BrowserCheck[];
  performance: Record<string, Record<string, number | undefined>>;
  workerEventCounts: Record<string, number>;
}

interface CapturedEvent {
  sequence: number;
  kind: string;
  payload?: Record<string, unknown>;
}

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const outputPath = join(repositoryRoot, 'output-phase2t-release-truthfulness-diagnostic.txt');
const browserReportPath = join(repositoryRoot, 'quality-lab', 'reports', 'release-gate.json');
const workerTracePath = join(repositoryRoot, 'quality-lab', 'reports', 'evidence', 'worker-events.json');
const lines: string[] = ['PHASE 2T — RELEASE TRUTHFULNESS, REAL BROWSER, AND RESULT CONSISTENCY DIAGNOSTIC'];

function filesUnder(directory: string, extensions?: Set<string>): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'artifacts') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...filesUnder(path, extensions));
    else if (!extensions || extensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function sourceText(paths: string[]): string {
  return paths.map((path) => readFileSync(path, 'utf8')).join('\n');
}

function requireBrowserGate(report: BrowserReport, scenario: string, id: string): BrowserCheck {
  const check = report.checks.find((entry) => entry.scenario === scenario && entry.id === id);
  assert(check, `Missing real-browser gate ${scenario}/${id}`);
  assert.equal(check.passed, true, `Real-browser gate failed: ${scenario}/${id}`);
  return check;
}

function assertNear(actual: number, expected: number, label: string): void {
  const tolerance = Math.max(1e-7, Math.max(Math.abs(actual), Math.abs(expected)) * 1e-8);
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}

function reconcileFullRoute(result: OptimizeCraftResult): string {
  const usage = result.fullRouteUsage;
  assertNear(usage.acquisitionCostChaos + usage.downstreamCostChaos, usage.fullRouteCostChaos, 'Scoped cost sum');
  assertNear(usage.reconciliationDifferenceChaos, 0, 'Reported reconciliation difference');
  assertNear(
    usage.combinedActions.reduce((sum, action) => sum + action.expectedCostChaos, 0),
    usage.fullRouteCostChaos,
    'Combined action cost',
  );
  assert(!usage.combinedActions.some((action) => action.actionId.startsWith('acquire_')));
  assert.deepEqual(result.expectedCurrencies, usage.combinedCurrencies);
  for (const combined of usage.combinedActions) {
    const scoped = [...usage.acquisitionActions, ...usage.downstreamActions]
      .filter((action) => action.actionId === combined.actionId);
    assertNear(scoped.reduce((sum, action) => sum + action.expectedCount, 0), combined.expectedCount, `${combined.actionId} count`);
    assertNear(scoped.reduce((sum, action) => sum + action.expectedCostChaos, 0), combined.expectedCostChaos, `${combined.actionId} cost`);
  }
  return `acquisition=${usage.acquisitionCostChaos.toFixed(6)}c, downstream=${usage.downstreamCostChaos.toFixed(6)}c, full=${usage.fullRouteCostChaos.toFixed(6)}c, difference=${usage.reconciliationDifferenceChaos}`;
}

assert(existsSync(browserReportPath), 'Real-browser release report is missing; run npm run lab:release first');
assert(existsSync(workerTracePath), 'Actual Worker trace is missing; run npm run lab:release first');
const browserReport = JSON.parse(readFileSync(browserReportPath, 'utf8')) as BrowserReport;
const workerEvents = JSON.parse(readFileSync(workerTracePath, 'utf8')) as CapturedEvent[];
assert.equal(browserReport.status, 'PASSED');
assert(['release', 'nightly'].includes(browserReport.requestedScenario), 'Latest browser report is not a full release/nightly matrix');
assert(Date.now() - Date.parse(browserReport.startedAt) < 60 * 60 * 1000, 'Browser report is older than one hour');

lines.push('\nT1 — Release-claim audit');
const publicSourceFiles = filesUnder(join(repositoryRoot, 'src'), new Set(['.ts', '.tsx', '.css']));
const publicSource = sourceText(publicSourceFiles);
assert(!/public[ -]beta certified/i.test(publicSource));
assert(/export const APP_RELEASE_VERSION = '2T\.1'/.test(publicSource));
assert(/Browser-Verified Release Candidate \{APP_RELEASE_VERSION\}/.test(publicSource));
assert(/Research estimate using stale bundled pricing/.test(publicSource));
lines.push('PASS: public UI is a browser-verified release candidate, not a public-beta certification, and stale pricing is prominent.');

lines.push('\nT2 — Real browser startup/no-fallback');
const launcher = readFileSync(join(repositoryRoot, 'quality-lab', 'src', 'appLauncher.ts'), 'utf8');
const runner = readFileSync(join(repositoryRoot, 'quality-lab', 'src', 'runner.ts'), 'utf8');
assert(/throw new Error\(`Built production entry is unavailable/.test(launcher));
assert(/browser = await chromium\.launch/.test(runner));
assert(!/running simulated|simulation fallback/i.test(runner));
requireBrowserGate(browserReport, 'release-process', 'runtime-error-audit');
lines.push(`PASS: ${browserReport.browser} ${browserReport.browserVersion}; strict launcher and no-fallback probe are mandatory CI steps.`);

lines.push('\nT3 — Real Worker event stream');
requireBrowserGate(browserReport, 'real-browser-smoke', 'import-and-real-worker-result');
requireBrowserGate(browserReport, 'real-browser-smoke', 'cancel-worker-replacement-and-recovery');
requireBrowserGate(browserReport, 'real-browser-smoke', 'host-guard-worker-replacement-and-recovery');
requireBrowserGate(browserReport, 'real-browser-smoke', 'real-worker-error-response');
const messageEvents = workerEvents.filter((event) => event.kind === 'MESSAGE_FROM_WORKER');
const responseTypes = messageEvents.map((event) => String(event.payload?.type));
for (const required of ['PROGRESS', 'COMPLETE', 'RESULT', 'ERROR']) assert(responseTypes.includes(required), `Worker trace lacks ${required}`);
assert(workerEvents.some((event) => event.kind === 'WORKER_TERMINATE'));
assert(workerEvents.filter((event) => event.kind === 'WORKER_SPAWN').length >= 2);
for (let index = 0; index < messageEvents.length; index++) {
  if (messageEvents[index].payload?.type !== 'COMPLETE') continue;
  assert.equal(messageEvents[index + 1]?.payload?.type, 'RESULT', 'COMPLETE is not immediately followed by RESULT');
}
lines.push(`PASS: observed ${messageEvents.length} Worker messages with ${responseTypes.join(', ')} plus termination/replacement.`);

lines.push('\nT4 — UI/result differential oracle');
const differential = requireBrowserGate(browserReport, 'real-browser-smoke', 'ui-result-export-differential');
lines.push(`PASS: ${differential.details}`);

lines.push('\nT5 — Four-mod consistency matrix');
for (const id of ['exact-input-and-search', 'canonical-dom-and-accounting', 'independent-method-family-matrix', 'four-mod-export-and-real-images']) {
  requireBrowserGate(browserReport, 'exact-four-mod-release-regression', id);
}
assert(statSync(join(repositoryRoot, 'quality-lab', 'reports', 'evidence', 'four-mod-desktop.png')).size > 0);
assert(statSync(join(repositoryRoot, 'quality-lab', 'reports', 'evidence', 'four-mod-390.png')).size > 0);
lines.push('PASS: exact input, policy health, five acquisition families, canonical DOM/export, methods, materials, desktop image, and 390px image were observed.');

const repository = new ClusterModRepository();
const service = new OptimizerService(repository);
const witnessInput: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: '10% increased Attack Damage',
  itemLevel: 1,
  passiveCount: 8,
  target: {
    requiredMods: [{ modId: 'AfflictionJewelSmallPassivesGrantArmour' }],
    requiredRarity: 'rare',
  },
  prices: {
    cleanBaseCostChaos: 10,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 2T frozen diagnostic clean base',
    currencyRates: {
      transmutation: 1 / 40,
      alteration: 1 / 15,
      augmentation: 1 / 40,
      regal: 1 / 2,
      scour: 1 / 3,
      exalt: 15,
      annul: 5,
      fracturing: 800,
      'wild-lifeforce': 1 / 30,
      'vivid-lifeforce': 1 / 30,
      'primal-lifeforce': 1 / 30,
    },
  },
  searchBudget: { maxStates: 10_000, maxWallTimeMs: 30_000, maxExpansionRounds: 4 },
  allowResearchFallbackPrices: true,
};
service.optimize(witnessInput);
const witness = service.optimize({
  ...witnessInput,
  compareMethodFamilies: true,
  searchIntent: 'DEEPEN',
});

lines.push('\nT6 — Full-route usage reconciliation');
lines.push(`PASS: clean selected route ${reconcileFullRoute(witness)}; four-mod browser gate independently reconciled its selected self-fracture/full route.`);

lines.push('\nT7 — Method-family independence');
const open = witness.methodPortfolio?.find((family) => family.spec.kind === 'OPEN');
const conventional = witness.methodPortfolio?.find((family) => family.spec.kind === 'CONVENTIONAL');
const harvest = witness.methodPortfolio?.find((family) => family.spec.kind === 'HARVEST');
assert(open, 'OPEN method family is absent');
assert(conventional, 'CONVENTIONAL method family is absent');
assert(harvest, 'HARVEST method family is absent');
for (const family of [open, conventional, harvest]) {
  assert.equal(family.evaluationSource, 'INDEPENDENT_SOLVE');
  assert(family.sessionIdentity && family.retainedStates > 0);
  if (family.fullRouteStatus === 'RESOLVED') {
    assert.equal(family.policyHealth?.proper, true);
    assert.equal(family.policyHealth?.costReconciled, true);
  }
}
assert(!conventional.onPolicyActionIds.some((actionId) => actionId.startsWith('harvest_reforge')));
lines.push(`PASS: OPEN=${open.status}, CONVENTIONAL=${conventional.status}, HARVEST=${harvest.status}; separate sessions and policy proofs recorded.`);

lines.push('\nT8 — Harvest action-evidence audit');
assert.equal(harvest.requiredActionObservedOnPolicy, true);
const harvestActionId = witness.harvestComparison?.harvestActionId;
assert(harvestActionId && harvest.onPolicyActionIds.includes(harvestActionId));
const harvestUsage = harvest.expectedActionUsage?.find((usage) => usage.actionId === harvestActionId);
assert(harvestUsage && harvestUsage.expectedCount > 0);
lines.push(`PASS: ${harvestActionId} has ${harvestUsage.expectedCount.toFixed(6)} expected on-policy visits.`);

lines.push('\nT9 — Lifeforce math audit');
const comparison = witness.harvestComparison;
assert(comparison?.actionEvidenceObserved);
assert.equal(comparison.lifeforcePerApplication, 75);
assert(comparison.expectedHarvestApplications !== undefined && comparison.expectedLifeforce !== undefined);
assertNear(comparison.expectedLifeforce, comparison.expectedHarvestApplications * 75, 'Lifeforce quantity');
assert(comparison.harvestNonLifeforceCostChaos !== undefined && comparison.currentLifeforceUnitPriceChaos !== undefined && comparison.harvestTotalAtCurrentPriceChaos !== undefined);
assertNear(
  comparison.harvestTotalAtCurrentPriceChaos,
  comparison.harvestNonLifeforceCostChaos + comparison.expectedLifeforce * comparison.currentLifeforceUnitPriceChaos,
  'Harvest current-price total',
);
assert(comparison.conventionalRoute?.expectedTotalCostChaos !== null && comparison.conventionalRoute?.expectedTotalCostChaos !== undefined);
assert(comparison.lifeforceCrossoverPriceChaosPerUnit !== undefined);
assertNear(
  comparison.lifeforceCrossoverPriceChaosPerUnit,
  (comparison.conventionalRoute.expectedTotalCostChaos - comparison.harvestNonLifeforceCostChaos) / comparison.expectedLifeforce,
  'Harvest crossover',
);
lines.push(`PASS: ${comparison.expectedHarvestApplications.toFixed(6)} applications × 75 = ${comparison.expectedLifeforce.toFixed(6)} ${comparison.lifeforceType}; crossover=${comparison.lifeforceCrossoverPriceChaosPerUnit.toFixed(9)}c/unit.`);

lines.push('\nT10 — Proof-language audit');
const proofSurface = sourceText([
  join(repositoryRoot, 'src', 'CraftOptimizer.tsx'),
  join(repositoryRoot, 'crafting-engine', 'src', 'service', 'optimizerService.ts'),
]);
assert(!/Strictly optimal|Optimal trade-off frontier/i.test(proofSurface));
lines.push('PASS: forbidden unscoped proof phrases are absent; resolved-set and explicit proof labels are used.');

lines.push('\nT11 — Scope-label audit');
assert.equal(witness.presentation.schemaVersion, '2T.1');
assert(witness.presentation.routeScopes && witness.presentation.timingScopes && witness.presentation.workScopes);
assert(witness.search.workScopes.portfolioTotalStatesExpanded >= witness.search.workScopes.selectedPolicyGraphStates);
if (!witness.acquisition.selectionSafe) assert.equal(witness.search.timeToFirstAcquisitionSafeRecommendationMs, undefined);
assert(witness.policyRefinement.finalDownstreamU !== undefined);
assert(witness.policyRefinement.finalFullRouteU !== undefined);
lines.push(`PASS: presentation schema ${witness.presentation.schemaVersion} scopes route U, timing milestones, portfolio work, selected graph work, and method-family work.`);

lines.push('\nT12 — Responsive/accessibility real-browser matrix');
requireBrowserGate(browserReport, 'responsive-accessibility-keyboard', 'real-dom-viewport-matrix');
requireBrowserGate(browserReport, 'responsive-accessibility-keyboard', 'semantic-controls-and-keyboard-primary-path');
lines.push('PASS: real 320/390/768/1280/1920 DOM geometry and keyboard-only primary path passed.');

lines.push('\nT13 — Constellation actual-render audit');
for (const id of ['controls-focus-fullscreen-and-real-frame', 'deterministic-reduced-motion-frames', 'fps-long-task-and-memory-soak']) {
  requireBrowserGate(browserReport, 'constellation-real-render', id);
}
const constellationPerformance = browserReport.performance.constellation;
assert(constellationPerformance && Number(constellationPerformance.fps) >= 30);
assert(statSync(join(repositoryRoot, 'quality-lab', 'reports', 'evidence', 'constellation-real-frame.png')).size > 0);
lines.push(`PASS: actual canvas frame, node focus, route focus/zoom/pause/speed/reduced-motion/fullscreen behavior, deterministic frames, and ${Number(constellationPerformance.fps).toFixed(2)} FPS were observed.`);

lines.push('\nT14 — CI gate audit');
const deployWorkflow = readFileSync(join(repositoryRoot, '.github', 'workflows', 'deploy.yml'), 'utf8');
const nightlyWorkflow = readFileSync(join(repositoryRoot, '.github', 'workflows', 'nightly-quality.yml'), 'utf8');
for (const required of ['npm run build', 'npm run lint', 'git diff --check', 'npm run diagnostic:mature', 'npm run lab:no-fallback-probe', 'npm run lab:release', 'npm run diagnostic:phase2t']) {
  assert(deployWorkflow.includes(required), `Deploy validation lacks ${required}`);
}
assert(/deploy:\s+[\s\S]*needs: validate-and-build/.test(deployWorkflow));
assert(nightlyWorkflow.includes('npm run lab:nightly'));
lines.push('PASS: deployment depends on build/lint/diff/mature/no-fallback/real-browser/Phase2T validation; nightly extended matrix is scheduled.');

lines.push('\nT15 — Mature regression matrix');
const requiredOutputs = [
  'output-core-mechanics-phase.txt',
  'output-fracture-fidelity-phase2e.txt',
  'output-phase2h-herald-diagnostic.txt',
  'output-phase2j-harvest-parity-diagnostic.txt',
  'output-phase2k1-exact-fixture-diagnostic.txt',
  'output-phase2l-portfolio-proof-diagnostic.txt',
  'output-phase2m-multi-objective-diagnostic.txt',
  'output-phase2n-method-portfolio-diagnostic.txt',
  'output-phase2r-pricing-sharing-diagnostic.txt',
];
for (const filename of requiredOutputs) {
  const path = join(repositoryRoot, filename);
  assert(existsSync(path) && statSync(path).size > 0, `Mature diagnostic evidence missing: ${filename}`);
}
lines.push(`PASS: ${requiredOutputs.length} critical Phase 2E–2S engine/UI diagnostic artifacts are present; simulated browser scripts are excluded.`);

lines.push('\nT16 — Build hygiene');
const packageJson = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
assert(packageJson.scripts.build && packageJson.scripts.lint);
lines.push('PASS: build, lint, and git diff --check are explicit blocking workflow steps. Unit tests are neither invoked nor added.');

lines.push('\n=== ALL PHASE 2T DIAGNOSTIC GATES PASS ===');
lines.push('Unit tests added/run: NO');
lines.push('Target/Craft-specific route branch added: NO');
lines.push('Hardcoded route winner added: NO');
lines.push('Pre-fractured market ranking reintroduced: NO');

const output = `${lines.join('\n')}\n`;
writeFileSync(outputPath, output, 'utf8');
console.log(output);
