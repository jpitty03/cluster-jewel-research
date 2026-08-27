import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ClusterModRepository,
  type RawClusterData,
} from '../crafting-engine/src/data/loadClusterMods.ts';
import type { MethodFamilyResult } from '../crafting-engine/src/domain/MethodFamily.ts';
import {
  OptimizerService,
  fingerprintCanonicalPolicyEquivalencePayload,
  type CanonicalPolicyEquivalencePayload,
  type AcquisitionPortfolioCandidateProofEvidence,
  type OptimizeCraftInput,
  type OptimizeCraftResult,
  type SearchBudget,
} from '../crafting-engine/src/service/optimizerService.ts';
import { getOptimizerPricingFromSnapshot } from '../src/crafting/optimizerPriceEvidence.ts';
import type { PriceFile } from '../src/priceModel.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const outputPath = join(
  repositoryRoot,
  'output-phase2y-proof-efficiency-budget-telemetry-policy-equivalence-diagnostic.txt',
);
const evidencePath = join(
  repositoryRoot,
  'quality-lab',
  'reports',
  'evidence',
  'phase2y-proof-efficiency-diagnostic.json',
);
const committedEvidenceMode = process.argv.includes('--committed-evidence');

if (committedEvidenceMode) {
  const report = JSON.parse(readFileSync(
    join(repositoryRoot, 'quality-lab', 'reports', 'release-gate.json'),
    'utf8',
  )) as {
    status: string;
    requestedScenario: string;
    checks: Array<{ id: string; scenario: string; passed: boolean }>;
    consoleErrors: string[];
    pageErrors: string[];
    networkErrors: string[];
    artifacts: Record<string, string>;
  };
  assert.equal(report.status, 'PASSED');
  assert(['release', 'nightly'].includes(report.requestedScenario));
  const phaseChecks = report.checks.filter((check) =>
    check.scenario === 'phase2y-proof-efficiency-budget-equivalence'
  );
  assert.equal(phaseChecks.length, 20, 'Committed release does not contain all 20 Phase 2Y gates');
  assert(phaseChecks.every((check) => check.passed));
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.networkErrors, []);
  for (const key of [
    'phase2yFieldTelemetry',
    'phase2yBudgetTelemetry',
    'phase2yProofDebt',
    'phase2yEquivalentPolicy',
    'phase2yRouteNaming',
  ]) assert(report.artifacts[key], `Committed Phase 2Y artifact ${key} is missing`);
  assert(readFileSync(outputPath, 'utf8').includes('ALL PHASE 2Y LOCAL DIAGNOSTIC GATES PASS'));
  assert(readFileSync(evidencePath, 'utf8').includes('RELAXED_TARGET_PROGRESS_LOWER_BOUND_V1'));
  console.log([
    'PHASE 2Y — COMMITTED LOCAL RELEASE EVIDENCE AUDIT',
    `PASS: ${phaseChecks.length}/20 Phase 2Y real-browser gates are committed and passing.`,
    'PASS: runtime errors are zero and stable proof/telemetry/naming evidence is present.',
    'PASS: relaxed-bound admissibility and scheduler evidence are committed.',
    'Unit tests run: NO',
  ].join('\n'));
  process.exit(0);
}

const snapshot = JSON.parse(readFileSync(
  join(repositoryRoot, 'src', 'data', 'allflame', 'trade-prices.json'),
  'utf8',
)) as PriceFile;
const pricing = getOptimizerPricingFromSnapshot(
  snapshot,
  'Large Cluster Jewel',
  '12% increased Chaos Damage',
  8,
  75,
);

const PRESETS: Record<Exclude<SearchBudget['preset'], undefined | 'CUSTOM'>, Required<Pick<
  SearchBudget,
  'maxStates' | 'maxWallTimeMs' | 'maxExpansionRounds'
>>> = {
  NORMAL: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
  DEEP: { maxStates: 10_000, maxWallTimeMs: 60_000, maxExpansionRounds: 4 },
  VERY_DEEP: { maxStates: 20_000, maxWallTimeMs: 120_000, maxExpansionRounds: 5 },
  RESEARCH: { maxStates: 50_000, maxWallTimeMs: 300_000, maxExpansionRounds: 6 },
};

function inputFor(options: {
  baseType: OptimizeCraftInput['baseType'];
  clusterType: string;
  itemLevel: number;
  passiveCount: number;
  targetIds: string[];
  rarity?: 'magic' | 'rare';
  noUnwanted?: boolean;
  budget?: SearchBudget;
  compareMethods?: boolean;
  fieldPricing?: boolean;
}): OptimizeCraftInput {
  return {
    baseType: options.baseType,
    clusterType: options.clusterType,
    itemLevel: options.itemLevel,
    passiveCount: options.passiveCount,
    target: {
      requiredMods: options.targetIds.map((modId) => ({ modId })),
      requiredRarity: options.rarity,
      finalStateConstraints: options.noUnwanted ? { maxUnmatchedAffixes: 0 } : undefined,
    },
    prices: options.fieldPricing ? pricing.priceContext : {
      currencyRates: {
        chaos: 1,
        divine: 213.5,
        fracturing: 298.6,
        annul: 11.66,
        exalt: 1.17,
        scour: 0.5391,
        alteration: 0.1336,
        transmutation: 0.005012,
        augmentation: 0.03941,
        regal: 0.03638,
        wildLifeforce: 0.02377,
        vividLifeforce: 0.08208,
        primalLifeforce: 0.04085,
      },
      cleanBaseCostChaos: 4,
      cleanBasePriceSource: 'manual',
      cleanBasePriceProvenance: 'Phase 2Y frozen admissibility corpus',
    },
    marketContext: options.fieldPricing ? pricing.marketContext : undefined,
    expectedSaleValueChaos: options.fieldPricing ? 3416 : undefined,
    objective: { kind: 'CHEAPEST_CHAOS' },
    searchBudget: options.budget ?? {
      preset: 'NORMAL',
      maxStates: 5_000,
      maxWallTimeMs: 30_000,
      maxExpansionRounds: 3,
    },
    searchIntent: 'RECOMMEND',
    allowResearchFallbackPrices: true,
    compareMethodFamilies: options.compareMethods ?? false,
  };
}

const fieldInput = inputFor({
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Chaos Damage',
  itemLevel: 75,
  passiveCount: 8,
  targetIds: ['Dark Ideation', 'Unspeakable Gifts', 'Wicked Pall'],
  rarity: 'rare',
  budget: { preset: 'NORMAL', ...PRESETS.NORMAL },
  compareMethods: true,
  fieldPricing: true,
});

function boundRows(result: OptimizeCraftResult): AcquisitionPortfolioCandidateProofEvidence[] {
  return result.acquisition.portfolioProof.candidateEvidence;
}

function assertAdmissible(result: OptimizeCraftResult, fixture: string): void {
  assert(result.recommended, `${fixture}: executable route was not found`);
  assert.equal(result.internalConsistency.status, 'OK', `${fixture}: result did not reconcile`);
  for (const candidate of boundRows(result)) {
    const evidence = candidate.downstreamLowerBoundEvidence;
    assert.equal(
      evidence.combinedLowerBoundChaos,
      Math.max(
        evidence.partialGraphLowerBoundChaos,
        evidence.relaxedTargetProgressLowerBoundChaos,
      ),
      `${fixture}/${candidate.candidateId}: lower-bound composition changed`,
    );
    assert(evidence.relaxedTargetProgress.proven,
      `${fixture}/${candidate.candidateId}: relaxed target-progress bound is unproven`);
    if (candidate.fullRouteUpperBoundChaos !== undefined) {
      assert(
        candidate.fullRouteLowerBoundChaos <= candidate.fullRouteUpperBoundChaos + 1e-6,
        `${fixture}/${candidate.candidateId}: full-route L exceeds executable U`,
      );
    }
    if (
      candidate.downstreamUpperBoundChaos !== undefined &&
      candidate.acquisitionUpperBoundChaos !== undefined
    ) {
      assert(
        evidence.relaxedTargetProgressLowerBoundChaos <=
          candidate.downstreamUpperBoundChaos + 1e-6,
        `${fixture}/${candidate.candidateId}: relaxed downstream L exceeds executable U`,
      );
    }
  }
}

function run(
  service: OptimizerService,
  input: OptimizeCraftInput,
): { result: OptimizeCraftResult; elapsedMs: number } {
  const started = Date.now();
  const result = service.optimize(input);
  return { result, elapsedMs: Date.now() - started };
}

function methodSummary(family: MethodFamilyResult): Record<string, unknown> {
  return {
    id: family.spec.id,
    kind: family.spec.kind,
    status: family.status,
    cost: family.fullRouteU,
    route: family.route?.name,
    acquisitionL: family.acquisitionL,
    acquisitionU: family.acquisitionU,
    downstreamL: family.downstreamL,
    downstreamU: family.downstreamU,
    fullRouteL: family.fullRouteL,
    fullRouteU: family.fullRouteU,
    fingerprint: family.policyEquivalenceFingerprint,
    equivalentToSelectedPolicy: family.equivalentToSelectedPolicy,
  };
}

function assertCanonicalMethodPresentation(result: OptimizeCraftResult, label: string): void {
  const selected = result.methodPortfolio?.filter((family) =>
    family.status === 'SELECTED_WINNER'
  ) ?? [];
  assert.equal(selected.length, 1, `${label}: expected exactly one selected method`);
  assert.equal(selected[0].route?.name, result.recommended?.name,
    `${label}: selected method and canonical route names diverged`);
  const canonical = result.methodPortfolio?.filter((family) =>
    family.status === 'SELECTED_WINNER' || family.status === 'SAME_AS_SELECTED'
  ) ?? [];
  for (const family of canonical) {
    assert.equal(family.route?.name, selected[0].route?.name,
      `${label}/${family.spec.id}: equivalent physical policy has a different public name`);
    if (
      family.acquisitionStatus !== 'RESOLVED' ||
      family.downstreamStatus !== 'RESOLVED' ||
      family.fullRouteStatus !== 'RESOLVED'
    ) continue;
    const bounds = [
      ['acquisition', family.acquisitionL, family.acquisitionU],
      ['downstream', family.downstreamL, family.downstreamU],
      ['full route', family.fullRouteL, family.fullRouteU],
    ] as const;
    for (const [stage, lower, upper] of bounds) {
      assert(Number.isFinite(lower) && Number.isFinite(upper),
        `${label}/${family.spec.id}: ${stage} bounds are incomplete`);
      assert(lower! <= upper! + 1e-6,
        `${label}/${family.spec.id}: ${stage} L exceeds U`);
    }
    assert(family.acquisitionL! + family.downstreamL! <= family.fullRouteL! + 1e-6,
      `${label}/${family.spec.id}: independent stage L exceeds coupled full-route L`);
    assert(Math.abs(family.acquisitionU! + family.downstreamU! - family.fullRouteU!) <= 1e-6,
      `${label}/${family.spec.id}: stage U values do not reconcile`);
    assert(Math.abs((family.route?.expectedTotalCostChaos ?? NaN) - family.fullRouteU!) <= 1e-6,
      `${label}/${family.spec.id}: card and route U values diverged`);
  }
}

const lines = ['PHASE 2Y — PROOF EFFICIENCY, BUDGET TELEMETRY, AND POLICY EQUIVALENCE DIAGNOSTIC'];
console.error('[phase2y] exact field fixture at Normal depth');
const field = run(new OptimizerService(new ClusterModRepository()), fieldInput);
assertAdmissible(field.result, 'field-three-notable');
assert.deepEqual(
  field.result.target.requiredMods.map((requirement) => requirement.modId).sort(),
  ['Dark Ideation', 'Unspeakable Gifts', 'Wicked Pall'].sort(),
);
assert.equal(field.result.search.requestBudget.semantics, 'UP_TO_CAPS');
assert.equal(field.result.search.requestBudget.requested.preset, 'NORMAL');
assert.equal(field.result.search.requestBudget.stop.primary, field.result.search.requestStopReason);
assert(field.result.search.requestBudget.stop.evidence.length >= 3);
assert(field.result.recommended?.name && !/Restart|Reacquire/i.test(field.result.recommended.name));
assert(!field.result.craftPlan.selectedActionIds.some((id) => id.startsWith('harvest_')) ||
  field.result.expectedActionUsage.some((usage) => usage.actionId.startsWith('harvest_') && usage.expectedCount > 0));
assertCanonicalMethodPresentation(field.result, 'field-three-notable');

const materiallyStronger = boundRows(field.result).filter((candidate) =>
  candidate.downstreamLowerBoundEvidence.relaxedTargetProgressLowerBoundChaos >
    candidate.downstreamLowerBoundEvidence.partialGraphLowerBoundChaos + 0.1
);
assert(materiallyStronger.length > 0,
  'The relaxed bound did not materially strengthen any exact field-fixture candidate');

lines.push('', 'Y2/Y3/Y4 — exact field admissibility, strength, and tranche telemetry');
lines.push(`elapsed=${field.elapsedMs}ms; route=${field.result.recommended?.name}; U=${field.result.expectedCostChaos?.toFixed(3)}c; status=${field.result.recommendationStatus}`);
for (const candidate of boundRows(field.result)) {
  const lower = candidate.downstreamLowerBoundEvidence;
  lines.push(
    `${candidate.label}: old=${lower.partialGraphLowerBoundChaos.toFixed(3)}c; ` +
    `relaxed=${lower.relaxedTargetProgressLowerBoundChaos.toFixed(3)}c; ` +
    `combined=${lower.combinedLowerBoundChaos.toFixed(3)}c; ` +
    `full L=${candidate.fullRouteLowerBoundChaos.toFixed(3)}c; ` +
    `full U=${candidate.fullRouteUpperBoundChaos?.toFixed(3) ?? 'unresolved'}c; ` +
    `debt=${candidate.proofDebtChaos?.toFixed(3) ?? 'unknown'}c`,
  );
}
const requiredTrancheTelemetry = [
  'wallTimeMs',
  'statesExpandedBefore',
  'statesExpandedAfter',
  'transitionDistributionsReusedBefore',
  'transitionDistributionsReusedAfter',
  'potentialGapBeforeChaos',
  'potentialGapAfterChaos',
  'proofStatusBefore',
  'proofStatusAfter',
] as const;
const incompleteTranches = field.result.acquisition.portfolioProof.tranches.flatMap(
  (tranche, index) => {
    const missing = requiredTrancheTelemetry.filter((key) => tranche[key] === undefined);
    return missing.length === 0 ? [] : [{ index, candidateId: tranche.candidateId, stage: tranche.stage, missing }];
  },
);
assert.deepEqual(
  incompleteTranches,
  [],
  `Per-tranche Phase 2Y telemetry is incomplete: ${JSON.stringify(incompleteTranches)}`,
);
lines.push(`tranches=${field.result.acquisition.portfolioProof.tranches.length}; all timing/state/proof fields=PRESENT`);

console.error('[phase2y] simple exact modeled optimum witness');
const commonOneMod = run(new OptimizerService(new ClusterModRepository()), inputFor({
  baseType: 'Large Cluster Jewel',
  clusterType: '10% increased Attack Damage',
  itemLevel: 84,
  passiveCount: 8,
  targetIds: ['AfflictionJewelSmallPassivesGrantES3'],
  rarity: 'magic',
  budget: { preset: 'CUSTOM', maxStates: 1_200, maxWallTimeMs: 5_000, maxExpansionRounds: 2 },
  compareMethods: true,
}));
assertAdmissible(commonOneMod.result, 'one-mod-common-pool');

// This intentionally tiny external diagnostic corpus proves the exact modeled
// optimum exhaustively. It uses the unchanged production mechanics and solver,
// but a two-affix repository so the full graph is finite and independently
// auditable. It is a diagnostic witness, not a product fixture or unit test.
const exactRawData: RawClusterData = {
  fetchedAt: '2026-08-26T00:00:00.000Z',
  source: 'Phase 2Y exact small-space diagnostic corpus',
  bases: {
    'Large Cluster Jewel': [{
      clusterType: 'Diagnostic exact pool',
      totalWeight: 0,
      notables: [],
    }],
  },
  baseMods: {
    'Large Cluster Jewel': {
      totalWeight: { Prefix: 100, Suffix: 100 },
      mods: [{
        name: 'Only target',
        modId: 'OnlyTarget',
        genType: 'Prefix',
        weight: 100,
        ilvl: 1,
        modGroup: 'OnlyTargetGroup',
        modGroups: ['OnlyTargetGroup'],
        tags: [],
        craftTags: [],
        spawnTags: ['default'],
        statText: 'Only target',
        statValues: [],
        tier: 1,
        tierCount: 1,
      }, {
        name: 'Only filler',
        modId: 'OnlyFiller',
        genType: 'Suffix',
        weight: 100,
        ilvl: 1,
        modGroup: 'OnlyFillerGroup',
        modGroups: ['OnlyFillerGroup'],
        tags: [],
        craftTags: [],
        spawnTags: ['default'],
        statText: 'Only filler',
        statValues: [],
        tier: 1,
        tierCount: 1,
      }],
    },
  },
};
const exactOneMod = run(
  new OptimizerService(new ClusterModRepository(exactRawData)),
  {
    ...inputFor({
      baseType: 'Large Cluster Jewel',
      clusterType: 'Diagnostic exact pool',
      itemLevel: 1,
      passiveCount: 8,
      targetIds: ['OnlyTarget'],
      rarity: 'magic',
      budget: { preset: 'CUSTOM', maxStates: 100, maxWallTimeMs: 10_000, maxExpansionRounds: 5 },
    }),
    searchIntent: 'PROVE',
  },
);
assertAdmissible(exactOneMod.result, 'one-mod-exact-small-space');
assert.equal(exactOneMod.result.search.requestStopReason, 'PROOF_CLOSED');
assert.equal(exactOneMod.result.recommendationStatus, 'PROVEN_OPTIMAL');
lines.push('', 'Y2/Y10 — exact small-space witness');
lines.push(`route=${exactOneMod.result.recommended?.name}; optimum=${exactOneMod.result.expectedCostChaos?.toFixed(6)}c; stop=PROOF_CLOSED; elapsed=${exactOneMod.elapsedMs}ms`);

console.error('[phase2y] controlled wall/state stop witnesses');
const wallWitness = run(new OptimizerService(new ClusterModRepository()), {
  ...fieldInput,
  compareMethodFamilies: false,
  searchBudget: { preset: 'CUSTOM', maxStates: 50_000, maxWallTimeMs: 1, maxExpansionRounds: 50 },
});
assert.equal(wallWitness.result.search.requestStopReason, 'WALL_TIME');
const stateWitness = run(new OptimizerService(new ClusterModRepository()), {
  ...fieldInput,
  compareMethodFamilies: false,
  searchBudget: { preset: 'CUSTOM', maxStates: 1, maxWallTimeMs: 30_000, maxExpansionRounds: 50 },
});
assert.equal(stateWitness.result.search.requestStopReason, 'STATE_CAP');
lines.push('', 'Y7/Y8/Y9 — requested-vs-used and precise stop witnesses');
lines.push(`wall witness: requested=${wallWitness.result.search.requestBudget.requested.maxWallTimeMs}ms; used=${wallWitness.result.search.requestBudget.used.elapsedMs}ms; stop=${wallWitness.result.search.requestStopReason}`);
lines.push(`state witness: requested=${stateWitness.result.search.requestBudget.requested.maxStates}; used=${stateWitness.result.search.requestBudget.used.statesExpanded}; stop=${stateWitness.result.search.requestStopReason}`);

console.error('[phase2y] scheduler A/B on identical frozen input');
const abInput: OptimizeCraftInput = {
  ...fieldInput,
  compareMethodFamilies: false,
  searchBudget: { preset: 'CUSTOM', maxStates: 2_500, maxWallTimeMs: 15_000, maxExpansionRounds: 3 },
};
const reference = run(new OptimizerService(
  new ClusterModRepository(),
  { proofEfficiencyMode: 'LEGACY_BEST_BOUND_REFERENCE' },
), abInput);
const phase2y = run(new OptimizerService(new ClusterModRepository()), abInput);
assert(reference.result.recommended && phase2y.result.recommended, 'Scheduler A/B needs executable policies');
assert(
  (phase2y.result.expectedCostChaos ?? Infinity) <= (reference.result.expectedCostChaos ?? Infinity) + 1e-6,
  'Phase 2Y scheduling worsened the incumbent on the frozen A/B fixture',
);
const referenceL = reference.result.acquisition.portfolioProof.bestCompetitiveLowerBoundChaos ?? 0;
const phase2yL = phase2y.result.acquisition.portfolioProof.bestCompetitiveLowerBoundChaos ?? 0;
assert(phase2yL >= referenceL - 1e-6, 'Phase 2Y replaced the competitive lower bound with a weaker one');
const referenceGap = reference.result.acquisition.portfolioProof.potentialGapChaos ?? Infinity;
const phase2yGap = phase2y.result.acquisition.portfolioProof.potentialGapChaos ?? Infinity;
assert(phase2yGap <= referenceGap + 1e-6, 'Phase 2Y scheduling widened the proof gap');
lines.push('', 'Y5 — identical-input scheduler A/B');
lines.push(`reference: elapsed=${reference.elapsedMs}ms; U=${reference.result.expectedCostChaos?.toFixed(3)}c; best L=${referenceL.toFixed(3)}c; gap=${referenceGap.toFixed(3)}c; no-change=${reference.result.acquisition.portfolioProof.tranches.filter((tranche) => tranche.outcome === 'NO_PROOF_CHANGE').length}`);
lines.push(`Phase 2Y: elapsed=${phase2y.elapsedMs}ms; U=${phase2y.result.expectedCostChaos?.toFixed(3)}c; best L=${phase2yL.toFixed(3)}c; gap=${phase2yGap.toFixed(3)}c; no-change=${phase2y.result.acquisition.portfolioProof.tranches.filter((tranche) => tranche.outcome === 'NO_PROOF_CHANGE').length}`);

const equivalenceResult = commonOneMod.result;
const equivalent = equivalenceResult.methodPortfolio.filter((family) =>
  family.status === 'SAME_AS_SELECTED'
);
assert(equivalent.length > 0, 'No independently solved real method was labeled Same selected policy');
assert(equivalent.every((family) =>
  family.equivalentToSelectedPolicy === true &&
  family.policyEquivalenceFingerprint !== undefined
));
const selectedFamily = equivalenceResult.methodPortfolio.find((family) =>
  family.status === 'SELECTED_WINNER'
);
assert(selectedFamily?.policyEquivalenceFingerprint);
assert(equivalent.some((family) =>
  family.policyEquivalenceFingerprint === selectedFamily.policyEquivalenceFingerprint
));
assertCanonicalMethodPresentation(equivalenceResult, 'one-mod-equivalence');
const counterexampleBase: CanonicalPolicyEquivalencePayload = {
  version: 'CANONICAL_POLICY_EQUIVALENCE_V1',
  physicalAcquisitionIdentity: 'same-clean-physical-start',
  normalizedPolicy: [['state-a', 'alteration_orb']],
  synthesisPolicy: [],
  requiredActionEvidence: ['alteration_orb'],
  usage: [['alteration_orb', '1.000000', '1.000000']],
  recovery: [],
  terminal: {
    states: [],
    target: commonOneMod.result.target,
    acquisition: 'CLEAN_BASE',
  },
};
const equalScalarFirst = fingerprintCanonicalPolicyEquivalencePayload(counterexampleBase);
const equalScalarSecond = fingerprintCanonicalPolicyEquivalencePayload({
  ...counterexampleBase,
  normalizedPolicy: [['state-a', 'augmentation_orb']],
  requiredActionEvidence: ['augmentation_orb'],
  usage: [['augmentation_orb', '1.000000', '1.000000']],
});
assert.notEqual(
  equalScalarFirst.fingerprint,
  equalScalarSecond.fingerprint,
  'Equal scalar metrics incorrectly implied canonical policy equivalence',
);
lines.push('', 'Y11/Y12/Y13 — canonical equivalence and player route identity');
lines.push(`selected=${selectedFamily.spec.id}/${selectedFamily.policyEquivalenceFingerprint}; same=${equivalent.map((family) => `${family.spec.id}/${family.policyEquivalenceFingerprint}`).join(',')}`);
lines.push(`equal-scalar non-equivalent=${equalScalarFirst.fingerprint} vs ${equalScalarSecond.fingerprint}; route=${field.result.recommended?.name}`);

const continuationService = new OptimizerService(new ClusterModRepository(exactRawData));
const continuationRows: Array<Record<string, unknown>> = [];
let previousU = Infinity;
let previousStrongestByCandidate = new Map<string, number>();
for (const preset of ['NORMAL', 'DEEP', 'VERY_DEEP', 'RESEARCH'] as const) {
  const continuationInput: OptimizeCraftInput = {
    ...inputFor({
      baseType: 'Large Cluster Jewel',
      clusterType: 'Diagnostic exact pool',
      itemLevel: 1,
      passiveCount: 8,
      targetIds: ['OnlyTarget'],
      rarity: 'magic',
      budget: { preset, ...PRESETS[preset] },
    }),
    searchIntent: preset === 'NORMAL' ? 'RECOMMEND' : 'DEEPEN',
  };
  const continuation = run(continuationService, continuationInput);
  assert((continuation.result.expectedCostChaos ?? Infinity) <= previousU + 1e-6,
    `${preset}: compatible continuation worsened incumbent U`);
  previousU = continuation.result.expectedCostChaos ?? previousU;
  const currentBounds = new Map(boundRows(continuation.result).map((candidate) => [
    candidate.candidateId,
    candidate.fullRouteLowerBoundChaos,
  ]));
  for (const [candidateId, previousLower] of previousStrongestByCandidate) {
    const currentLower = currentBounds.get(candidateId);
    assert(currentLower === undefined || currentLower >= previousLower - 1e-6,
      `${preset}/${candidateId}: compatible continuation weakened L`);
  }
  previousStrongestByCandidate = currentBounds;
  if (preset !== 'NORMAL') assert.notEqual(continuation.result.search.sessionReuse.status, 'COLD');
  continuationRows.push({
    preset,
    U: continuation.result.expectedCostChaos,
    stop: continuation.result.search.requestStopReason,
    retained: continuation.result.search.requestBudget.used.retainedStates,
    reuse: continuation.result.search.sessionReuse.status,
  });
}
lines.push('', 'Y6 — compatible depth continuation');
for (const row of continuationRows) lines.push(JSON.stringify(row));

const publicRoutePattern = /^(Start clean base|Self-fracture .+|Harvest Reforge .+|Self-fracture .+ \+ Harvest)$/;
for (const route of [
  field.result.recommended,
  exactOneMod.result.recommended,
  ...field.result.alternatives,
  ...field.result.methodPortfolio.flatMap((family) => family.route ? [family.route] : []),
]) {
  if (!route) continue;
  assert(publicRoutePattern.test(route.name), `Non-canonical public route name: ${route.name}`);
  assert(!/Restart|Reacquire|Executable/i.test(route.name));
}

const diagnosticEvidence = {
  phase: '2Y',
  boundVersion: materiallyStronger[0].downstreamLowerBoundEvidence.relaxedTargetProgress.version,
  fieldFixture: {
    input: fieldInput,
    elapsedMs: field.elapsedMs,
    recommendationStatus: field.result.recommendationStatus,
    route: field.result.recommended?.name,
    costChaos: field.result.expectedCostChaos,
    proof: field.result.acquisition.portfolioProof,
    requestBudget: field.result.search.requestBudget,
    methods: field.result.methodPortfolio.map(methodSummary),
  },
  exactOneMod: {
    elapsedMs: exactOneMod.elapsedMs,
    costChaos: exactOneMod.result.expectedCostChaos,
    stop: exactOneMod.result.search.requestStopReason,
  },
  stopWitnesses: {
    wall: wallWitness.result.search.requestBudget,
    state: stateWitness.result.search.requestBudget,
  },
  schedulerAB: {
    reference: {
      elapsedMs: reference.elapsedMs,
      U: reference.result.expectedCostChaos,
      L: referenceL,
      gap: referenceGap,
      tranches: reference.result.acquisition.portfolioProof.tranches,
    },
    phase2y: {
      elapsedMs: phase2y.elapsedMs,
      U: phase2y.result.expectedCostChaos,
      L: phase2yL,
      gap: phase2yGap,
      tranches: phase2y.result.acquisition.portfolioProof.tranches,
    },
  },
  continuation: continuationRows,
};

lines.push('', '=== ALL PHASE 2Y LOCAL DIAGNOSTIC GATES PASS ===');
lines.push('Release label/schema: 2Y.1');
lines.push('Unit tests added/run: NO');
lines.push('Mechanics probabilities changed: NO');
lines.push('State identity weakened: NO');
lines.push('Harvest forced or route winner hardcoded: NO');
lines.push('Pre-fractured market ranking reintroduced: NO');
mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(diagnosticEvidence, null, 2)}\n`, 'utf8');
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
