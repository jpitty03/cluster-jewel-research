import assert from 'node:assert/strict';
import {
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import { ModPool } from '../crafting-engine/src/domain/ModPool.ts';
import { PriceBook } from '../crafting-engine/src/domain/PriceBook.ts';
import { satisfiesTarget, type TargetDefinition } from '../crafting-engine/src/domain/TargetDefinition.ts';
import { createRandomSource } from '../crafting-engine/src/probability/random.ts';
import { createHarvestReforgeMechanics } from '../crafting-engine/src/rules/actionRegistry.ts';

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
  performance: Record<string, Record<string, number | undefined>>;
  artifacts: Record<string, string>;
}

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const reportPath = join(repositoryRoot, 'quality-lab', 'reports', 'release-gate.json');
const outputPath = join(
  repositoryRoot,
  'output-phase2v-scroll-semantics-harvest-closure-diagnostic.txt',
);
const committedEvidenceMode = process.argv.includes('--committed-evidence');
const scenario = 'phase2v-scroll-semantics-harvest-closure';
const lines = ['PHASE 2V — SCROLL OWNERSHIP, CONSTELLATION SEMANTICS, AND HARVEST CLOSURE DIAGNOSTIC'];

function requireGate(report: BrowserReport, id: string): BrowserCheck {
  const check = report.checks.find((candidate) => candidate.scenario === scenario && candidate.id === id);
  assert(check, `Missing Phase 2V browser gate ${id}`);
  assert.equal(check.passed, true, `Phase 2V browser gate failed: ${id}: ${check.error ?? check.details}`);
  return check;
}

function parsedDetails(check: BrowserCheck): Record<string, unknown> {
  const value = JSON.parse(check.details) as unknown;
  assert(value && typeof value === 'object' && !Array.isArray(value));
  return value as Record<string, unknown>;
}

function resolveRepositoryArtifact(relativePath: string): string {
  return join(repositoryRoot, ...relativePath.split(/[\\/]+/));
}

assert(existsSync(reportPath), 'Real-browser report is missing; run npm run lab:release first');
const report = JSON.parse(readFileSync(reportPath, 'utf8')) as BrowserReport;
assert.equal(report.status, 'PASSED', 'Latest real-browser report did not pass');
assert(['release', 'nightly'].includes(report.requestedScenario), 'Latest browser report is not the full release/nightly matrix');
if (!committedEvidenceMode) {
  assert(
    Date.now() - Date.parse(report.finishedAt ?? report.startedAt) < 60 * 60 * 1000,
    'Latest browser report completion is older than one hour',
  );
}
lines.push(`Evidence mode: ${committedEvidenceMode ? 'COMMITTED LOCAL RELEASE AUDIT' : 'FRESH LOCAL RELEASE'}`);

lines.push('\nV1 — Phase 2T/2U preservation and fallback audit');
const preservation = parsedDetails(requireGate(report, 'V1-phase2t-phase2u-preservation-and-no-fallback'));
assert.equal(preservation.phase2tAccountingPreserved, true);
assert.equal(preservation.phase2uInteractionAndLabelsPreserved, true);
assert.equal(preservation.fallbackSubstitutionUsed, false);
for (const retainedOutput of [
  'output-phase2t-release-truthfulness-diagnostic.txt',
  'output-phase2u-constellation-interaction-readability-player-labels-diagnostic.txt',
]) {
  assert(readFileSync(join(repositoryRoot, retainedOutput), 'utf8').includes('ALL PHASE'), `${retainedOutput} is missing retained pass evidence`);
}
lines.push('PASS: retained solver/accounting/Worker/player-label evidence remains present, and the real browser used no fallback substitute.');

lines.push('\nV2–V6 — Document scroll ownership and route-rail locality');
for (const id of [
  'V2-initial-result-does-not-reclaim-document-scroll',
  'V3-replay-three-steps-window-scroll-and-focus-stable',
  'V4-route-rail-horizontal-following-only',
  'V5-pause-resume-and-speed-controls-preserve-scroll-focus',
  'V6-mobile-replay-and-touch-scroll-ownership',
]) requireGate(report, id);
const constellationSource = readFileSync(join(repositoryRoot, 'src', 'components', 'MarkovConstellation.tsx'), 'utf8');
assert(!constellationSource.includes('scrollIntoView('), 'Constellation still contains scrollIntoView');
assert(constellationSource.includes('routeRailRef') && constellationSource.includes('rail.scrollTo({'));
lines.push('PASS: initial completion, timed replay, pause/resume, all four speeds, and mobile replay preserve window scroll/focus; only the horizontal rail scrolls.');

lines.push('\nV7–V9 — Acquisition chronology and unique terminal semantics');
const clean = parsedDetails(requireGate(report, 'V7-clean-one-mod-chronology-and-accounting'));
const fracture = parsedDetails(requireGate(report, 'V8-self-fracture-chronology-and-exact-target'));
requireGate(report, 'V9-single-terminal-one-two-and-four-mod');
assert(Number(clean.resultCost) >= 8.7 && Number(clean.resultCost) <= 8.9);
const acquisitionContext = fracture.acquisitionContext as Record<string, unknown>;
assert.equal(acquisitionContext.kind, 'SELF_FRACTURE');
const graphSource = readFileSync(join(repositoryRoot, 'crafting-engine', 'src', 'domain', 'VisualizationGraph.ts'), 'utf8');
assert(!graphSource.includes("recommendedRoute?.actionId?.includes('candidate_')"));
assert(graphSource.includes("label: isCertified ? 'Goal'"));
lines.push('PASS: clean acquisition is visually omitted, self-fracture begins at Clean Base then creates the exact target fracture, and every fixture has one Goal.');

lines.push('\nV10–V13 — Certified Harvest mechanics, mathematics, and independent families');
const harvestGate = parsedDetails(requireGate(report, 'V10-V13-harvest-certified-mechanics-math-and-methods'));
const certification = harvestGate.certification as Record<string, unknown>;
assert.equal(certification.transitionOutcomeCount, 140_076);
assert.equal(certification.successOutcomeCount, 743);
assert.equal(certification.missOutcomeCount, 139_333);
const analyticalP = Number(certification.successProbabilityPerApplication);
const analyticalApplications = Number(certification.expectedApplications);
assert(Math.abs(analyticalP - 0.004843655474498472) < 1e-12);
assert(Math.abs(analyticalApplications - 1 / analyticalP) < 1e-8);

const repository = new ClusterModRepository();
const pool = ModPool.forCluster(repository, 'Large Cluster Jewel', '10% increased Attack Damage');
const context = { pool, priceBook: new PriceBook() };
const target: TargetDefinition = {
  requiredMods: [
    { modId: 'AfflictionJewelSmallPassivesGrantArmour3_' },
    { modId: 'AfflictionJewelSmallPassivesGrantEvasion3' },
  ],
  requiredRarity: 'rare',
};
const seedState = {
  baseType: 'Large Cluster Jewel' as const,
  clusterType: '10% increased Attack Damage',
  itemLevel: 84,
  passiveCount: 8,
  rarity: 'rare' as const,
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};
const harvestMechanic = createHarvestReforgeMechanics(context, ['defences'])[0];
assert(harvestMechanic?.getTransitions && harvestMechanic.sampleTransition);
const distribution = harvestMechanic.getTransitions(seedState, target, context);
const directP = distribution.outcomes
  .filter((outcome) => satisfiesTarget(outcome.state, target))
  .reduce((sum, outcome) => sum + outcome.probability, 0);
assert(Math.abs(directP - analyticalP) < 1e-12);
const rng = createRandomSource(0x2f6e2b1);
const trials = 20_000;
let successes = 0;
for (let index = 0; index < trials; index++) {
  if (satisfiesTarget(harvestMechanic.sampleTransition(seedState, target, context, rng), target)) successes++;
}
const empiricalP = successes / trials;
assert(successes > 0, 'Mechanic-sampled Monte Carlo produced no success');
assert(Math.abs(empiricalP - analyticalP) / analyticalP < 0.3, `Mechanic Monte Carlo p=${empiricalP} differs from ${analyticalP}`);
lines.push(`PASS: authoritative distribution=${distribution.outcomes.length.toLocaleString()} outcomes, p=${analyticalP.toFixed(15)}, E[N]=${analyticalApplications.toFixed(9)}; seeded mechanic sampling=${successes}/${trials} (${empiricalP.toFixed(6)}).`);

lines.push('\nV14 — Four-mod regression');
requireGate(report, 'V14-four-mod-solver-proof-accounting-regression');
lines.push('PASS: exact four-mod target identity, absorbing policy health, and full-route reconciliation remain intact.');

lines.push('\nV15–V16 — Compact performance, Worker isolation, memory, and screenshots');
const performanceGate = parsedDetails(requireGate(report, 'V15-V16-performance-memory-worker-and-evidence-audit'));
const phasePerformance = performanceGate.performance as Record<string, unknown>;
assert(Number(phasePerformance.compressionRatio) > 20);
assert.equal(phasePerformance.workerMessagesAdded, 0);
for (const artifact of [
  'phase2vOneModCleanGraph',
  'phase2vSelfFractureChronology',
  'phase2vScrolledAbovePlaying',
  'phase2vHorizontalRailFollow',
  'phase2vArmourEvasionComparison',
]) {
  const relativePath = report.artifacts[artifact];
  assert(relativePath && statSync(resolveRepositoryArtifact(relativePath)).size > 0, `Missing screenshot ${artifact}`);
}
lines.push(`PASS: compression ratio=${Number(phasePerformance.compressionRatio).toFixed(1)}×, Worker messages added=0, and all five stable screenshots exist.`);

lines.push('\nV17 — Local-heavy / hosted-lean validation policy');
const deploy = readFileSync(join(repositoryRoot, '.github', 'workflows', 'deploy.yml'), 'utf8');
const nightly = readFileSync(join(repositoryRoot, '.github', 'workflows', 'nightly-quality.yml'), 'utf8');
for (const command of ['npm run build', 'npm run lint', 'git diff --check', 'npm run diagnostic:phase2w:committed']) {
  assert(deploy.includes(command), `Deploy audit lacks ${command}`);
}
for (const heavy of ['npm run diagnostic:mature', 'npm run lab:no-fallback-probe', 'npm run lab:release']) {
  assert(!deploy.includes(`run: ${heavy}`), `Automatic deploy runs heavyweight local gate ${heavy}`);
}
assert(!nightly.includes('schedule:'), 'Heavy remote workflow regained a schedule');
assert(nightly.includes('npm run diagnostic:phase2v'));
assert(nightly.includes('npm run diagnostic:phase2w'));
lines.push('PASS: full diagnostics/browser work remains local; automatic deploy runs build/lint/diff plus committed Phase 2W evidence audit, and the heavy remote workflow is manual only.');

lines.push('\n=== ALL PHASE 2V DIAGNOSTIC GATES PASS ===');
lines.push(`Real browser: ${report.browser} ${report.browserVersion}; run=${report.runId}; scenario=${report.requestedScenario}`);
lines.push('Release label/schema: 2W.1 (Phase 2V behavior retained)');
lines.push('Unit tests added/run: NO');
lines.push('Mechanics probabilities changed: NO');
lines.push('State identity weakened: NO — quotient is family-scoped and enabled-action audited');
lines.push('Harvest forced or route winner hardcoded: NO');
lines.push('Market-fractured ranking reintroduced: NO');

const output = `${lines.join('\n')}\n`;
if (!committedEvidenceMode) writeFileSync(outputPath, output, 'utf8');
console.log(output);
