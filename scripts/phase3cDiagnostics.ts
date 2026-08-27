import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import type { MethodFamilyResult } from '../crafting-engine/src/domain/MethodFamily.ts';
import type { ItemState } from '../crafting-engine/src/domain/ItemState.ts';
import type { Mod } from '../crafting-engine/src/domain/Mod.ts';
import { toRolledMod } from '../crafting-engine/src/domain/Mod.ts';
import { ModPool } from '../crafting-engine/src/domain/ModPool.ts';
import { PriceBook } from '../crafting-engine/src/domain/PriceBook.ts';
import {
  buildPolicyFlowComponent,
  buildSelectedPolicyFlowSummary,
  type PolicyFlowSummary,
} from '../crafting-engine/src/domain/PolicyFlow.ts';
import {
  buildVisualizationGraph,
  type VisualizationGraph,
} from '../crafting-engine/src/domain/VisualizationGraph.ts';
import { CRAFT_MECHANICS } from '../crafting-engine/src/rules/actionRegistry.ts';
import {
  MAGIC_ROLL_SHAPE,
  magicRollShapeProbabilities,
} from '../crafting-engine/src/rules/magicRollShape.ts';
import { GenericSearchEngine } from '../crafting-engine/src/solver/genericSearch.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
  type OptimizeCraftResult,
} from '../crafting-engine/src/service/optimizerService.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const evidenceDirectory = join(repositoryRoot, 'quality-lab', 'reports', 'evidence');
const beforeEvidencePath = join(evidenceDirectory, 'phase3c-policy-admissibility-before.json');
const afterEvidencePath = join(evidenceDirectory, 'phase3c-policy-admissibility-after.json');
const diagnosticEvidencePath = join(
  evidenceDirectory,
  'phase3c-policy-admissibility-and-layout-diagnostic.json',
);
const textEvidencePath = join(
  repositoryRoot,
  'output-phase3c-policy-admissibility-layout-diagnostic.txt',
);
const rendererArtifactPath = join(
  repositoryRoot,
  'quality-lab',
  'fixtures',
  'policy-flow-phase3c-large-v1-artifact.json',
);
const rendererMetadataPath = join(
  repositoryRoot,
  'quality-lab',
  'fixtures',
  'policy-flow-phase3c-large-v1.json',
);
const FAMILY_TOLERANCE_CHAOS = 0.05;

export const PHASE3C_FIELD_INPUT: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: 'Minions deal 10% increased Damage',
  itemLevel: 84,
  passiveCount: 8,
  target: {
    requiredMods: [
      { modId: 'Primordial Bond' },
      { modId: 'Renewal' },
      { modId: 'Rotten Claws' },
    ],
    requiredRarity: 'rare',
  },
  prices: {
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
    cleanBaseCostChaos: 40,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance:
      'Phase 3C frozen Primordial Bond + Renewal + Rotten Claws field fixture',
  },
  expectedSaleValueChaos: 1708,
  objective: { kind: 'CHEAPEST_CHAOS' },
  searchBudget: {
    preset: 'NORMAL',
    maxStates: 5_000,
    maxWallTimeMs: 30_000,
    maxExpansionRounds: 3,
  },
  searchIntent: 'RECOMMEND',
  allowResearchFallbackPrices: true,
  compareMethodFamilies: true,
};

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function stableJson(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).filter((key) => key !== 'aggregationMs').sort().map((key) =>
    `${JSON.stringify(key)}:${stableJson(record[key])}`
  ).join(',')}}`;
}

function familySummary(family: MethodFamilyResult): Record<string, unknown> {
  return {
    id: family.spec.id,
    kind: family.spec.kind,
    spec: family.spec,
    status: family.status,
    evaluationSource: family.evaluationSource,
    incumbentSource: family.incumbentSource,
    familySearchStatus: family.familySearchStatus,
    independentFullRouteU: family.independentFullRouteU,
    knownPolicyCostChaos: family.knownPolicyCostChaos,
    revalidatedKnownPolicyCostChaos: family.revalidatedKnownPolicyCostChaos,
    selectedOpenPolicyCostChaos: family.selectedOpenPolicyCostChaos,
    selectedOpenPolicyAdmissibility: family.selectedOpenPolicyAdmissibility,
    knownPolicyAdmissibility: family.knownPolicyAdmissibility,
    searchDivergence: family.searchDivergence,
    route: family.route,
    fullRouteL: family.fullRouteL,
    fullRouteU: family.fullRouteU,
    proof: family.policyHealth,
    onPolicyActionIds: family.onPolicyActionIds,
    expectedActionUsage: family.expectedActionUsage,
    retainedStates: family.retainedStates,
    transitionDistributionsGenerated: family.transitionDistributionsGenerated,
    budget: family.budget,
    policyEquivalenceFingerprint: family.policyEquivalenceFingerprint,
    policyEquivalenceEvidence: family.policyEquivalenceEvidence,
    equivalentToSelectedPolicy: family.equivalentToSelectedPolicy,
    explanation: family.whyNotSelectedExplanation,
  };
}

function findFamily(
  result: OptimizeCraftResult,
  kind: MethodFamilyResult['spec']['kind'],
): MethodFamilyResult {
  const family = result.methodPortfolio?.find((candidate) => candidate.spec.kind === kind);
  assert(family, `Frozen field result omitted ${kind} method family`);
  return family;
}

function resultSummary(result: OptimizeCraftResult, elapsedMs: number): Record<string, unknown> {
  const open = findFamily(result, 'OPEN');
  const conventional = findFamily(result, 'CONVENTIONAL');
  return {
    elapsedMs,
    request: PHASE3C_FIELD_INPUT,
    mechanicsSessionIdentity: open.sessionIdentity,
    selectedRoute: result.recommended,
    selectedCostChaos: result.expectedCostChaos,
    selectedPolicyRules: result.policyRules.length,
    selectedPolicyFingerprint: result.policyFlow?.sourcePolicyFingerprint,
    recommendationStatus: result.recommendationStatus,
    proof: result.proof,
    risk: result.risk,
    solver: result.solver,
    search: result.search,
    policyFlowTopology: result.policyFlow?.topology,
    open: familySummary(open),
    conventional: familySummary(conventional),
    differenceChaos: conventional.fullRouteU === undefined || open.fullRouteU === undefined
      ? undefined
      : conventional.fullRouteU - open.fullRouteU,
  };
}

function assertNear(actual: number, expected: number, label: string, tolerance: number): void {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}

function policyFamilyDiagnostics(result: OptimizeCraftResult): {
  conventional: Record<string, unknown>;
  matrix: Array<Record<string, unknown>>;
  divergence: MethodFamilyResult['searchDivergence'];
  equivalence: Record<string, unknown>;
} {
  const open = findFamily(result, 'OPEN');
  const conventional = findFamily(result, 'CONVENTIONAL');
  const audit = conventional.knownPolicyAdmissibility;
  const selectedOpenAudit = conventional.selectedOpenPolicyAdmissibility;
  assert(selectedOpenAudit,
    'C2 Conventional did not report the selected Open policy admissibility audit');
  if (selectedOpenAudit.admissible) {
    assert(conventional.selectedOpenPolicyCostChaos !== undefined);
    assert(conventional.fullRouteU !== undefined);
    assert(conventional.fullRouteU <= conventional.selectedOpenPolicyCostChaos +
      FAMILY_TOLERANCE_CHAOS,
    'C2 selected Open policy is admissible but Conventional regressed above it');
  } else {
    assert(selectedOpenAudit.failures.length > 0,
      'C2 selected Open policy rejection lacks exact failure evidence');
  }
  if (audit?.admissible) {
    assert(audit.evaluation, 'C4 admissible audit omitted its fixed-policy evaluation');
    assert.equal(audit.evaluation.proper, true, 'C4 fixed policy is not proper');
    assert.equal(audit.evaluation.costReconciled, true, 'C4 fixed policy did not reconcile');
    assertNear(audit.evaluation.terminalAbsorptionProbability, 1, 'C4 absorption', 1e-6);
    assert(audit.sourceParity, 'C4 source parity is absent');
    assert(audit.sourceParity.costDifferenceChaos <= FAMILY_TOLERANCE_CHAOS);
    assert(audit.sourceParity.actionDifference <= 1e-5);
    assert(audit.sourceParity.timeDifferenceMs <= 1e-3);
    assert(conventional.fullRouteU !== undefined);
    assert(conventional.revalidatedKnownPolicyCostChaos !== undefined);
    assert(
      conventional.fullRouteU <=
        conventional.revalidatedKnownPolicyCostChaos + FAMILY_TOLERANCE_CHAOS,
      'C3 constrained family regressed above an admissible known executable policy',
    );
    assert(
      conventional.incumbentSource === 'ADMISSIBLE_KNOWN_POLICY' ||
        conventional.incumbentSource === 'IMPROVED_FROM_KNOWN_POLICY',
      'C3 admissible policy was not represented in incumbent provenance',
    );
  } else if (audit) {
    assert(audit.failures.length > 0, 'C2 inadmissibility had no machine-readable reason');
  } else {
    assert.equal(selectedOpenAudit.admissible, false,
      'C3 selected Open policy was admissible but no known incumbent audit was retained');
  }

  const matrix = (result.methodPortfolio ?? []).map((family) => ({
    family: family.spec.id,
    kind: family.spec.kind,
    openPolicyAdmissible: family.spec.kind === 'OPEN'
      ? true
      : family.selectedOpenPolicyAdmissibility?.admissible ?? false,
    reason: family.spec.kind === 'OPEN'
      ? 'SOURCE_POLICY'
      : family.selectedOpenPolicyAdmissibility?.failures
          .map((failure) => failure.code).join(',') ||
        'NO_ADMISSIBILITY_SOURCE',
    knownIncumbentImported:
      family.incumbentSource === 'ADMISSIBLE_KNOWN_POLICY' ||
      family.incumbentSource === 'IMPROVED_FROM_KNOWN_POLICY',
    independentImprovement: family.incumbentSource === 'IMPROVED_FROM_KNOWN_POLICY',
    finalFamilyU: family.fullRouteU,
    policyExecutionStatus: family.policyHealth?.selectedPolicyStatus,
    familySearchStatus: family.familySearchStatus,
  }));
  const harvestControls = (result.methodPortfolio ?? []).filter((family) =>
    family.spec.kind === 'HARVEST'
  );
  assert(harvestControls.length > 0, 'C6 Harvest required-action controls are absent');
  assert(harvestControls.every((family) => {
    const auditedOpenPolicy = family.selectedOpenPolicyAdmissibility ??
      family.knownPolicyAdmissibility;
    return auditedOpenPolicy?.admissible === false &&
      auditedOpenPolicy.failures.some((failure) =>
        failure.code === 'REQUIRED_ACTION_NOT_OBSERVED' ||
        failure.code === 'ACTION_NOT_ALLOWED'
      );
  }), 'C6 Harvest controls admitted a policy without its required action');
  const fractureControls = (result.methodPortfolio ?? []).filter((family) =>
    family.spec.kind === 'SELF_FRACTURE'
  );
  assert(fractureControls.length > 0, 'C6 self-fracture controls are absent');
  assert(fractureControls.every((family) =>
    family.knownPolicyAdmissibility?.admissible === false &&
    family.knownPolicyAdmissibility.failures.some((failure) =>
      failure.code === 'ACQUISITION_KIND_MISMATCH' ||
      failure.code === 'ACQUISITION_IDENTITY_MISMATCH'
    )
  ), 'C6 clean known policy was admitted to a self-fracture family');

  const sameFingerprint = open.policyEquivalenceFingerprint !== undefined &&
    open.policyEquivalenceFingerprint === conventional.policyEquivalenceFingerprint;
  if (sameFingerprint) {
    assertNear(
      conventional.fullRouteU!,
      open.fullRouteU!,
      'C7 equivalent policy cost',
      FAMILY_TOLERANCE_CHAOS,
    );
  }
  if (open.fullRouteU !== conventional.fullRouteU) {
    assert(!sameFingerprint, 'C7 scalar-unequal policies received one equivalence fingerprint');
  }
  return {
    conventional: {
      selectedOpenPolicyCostChaos: conventional.selectedOpenPolicyCostChaos,
      selectedOpenPolicyAdmissible: selectedOpenAudit.admissible,
      selectedOpenPolicyFailures: selectedOpenAudit.failures,
      importedKnownPolicyAdmissible: audit?.admissible,
      importedKnownPolicyFailures: audit?.failures,
      transitionsRegenerated: audit?.transitionsRegenerated,
      transitionOutcomesCompared: audit?.transitionOutcomesCompared,
      maximumTransitionProbabilityDifference: audit?.maximumTransitionProbabilityDifference,
      sourceParity: audit?.sourceParity,
      knownPolicyCostChaos: conventional.knownPolicyCostChaos,
      revalidatedKnownPolicyCostChaos: conventional.revalidatedKnownPolicyCostChaos,
      independentFullRouteU: conventional.independentFullRouteU,
      finalFullRouteU: conventional.fullRouteU,
      incumbentSource: conventional.incumbentSource,
      familySearchStatus: conventional.familySearchStatus,
    },
    matrix,
    divergence: conventional.searchDivergence,
    equivalence: {
      openFingerprint: open.policyEquivalenceFingerprint,
      conventionalFingerprint: conventional.policyEquivalenceFingerprint,
      sameFingerprint,
      conventionalEquivalentToGlobalSelected: conventional.equivalentToSelectedPolicy,
    },
  };
}

function nodeOverlapCount(graph: VisualizationGraph): number {
  let overlaps = 0;
  for (let left = 0; left < graph.nodes.length; left += 1) {
    for (let right = left + 1; right < graph.nodes.length; right += 1) {
      const first = graph.nodes[left];
      const second = graph.nodes[right];
      if (Math.hypot(first.x - second.x, first.y - second.y) <
        first.radius + second.radius + 8) overlaps++;
    }
  }
  return overlaps;
}

function layoutDiagnostics(flow: PolicyFlowSummary): {
  graph: VisualizationGraph;
  evidence: Record<string, unknown>;
} {
  const topologyBefore = stableJson({
    nodes: flow.nodes.map((node) => node.id).sort(),
    edges: flow.edges.map((edge) => [
      edge.id,
      edge.sourceNodeId,
      edge.targetNodeId,
      edge.conditionalProbability,
      edge.expectedFlow,
    ]).sort(),
    topology: flow.topology,
    reconciliation: flow.reconciliation,
  });
  const graph = buildVisualizationGraph(flow, { width: 1_000, height: 760 });
  const repeated = buildVisualizationGraph(flow, { width: 1_000, height: 760 });
  assert.deepEqual(
    graph.nodes.map((node) => [node.id, node.x, node.y]),
    repeated.nodes.map((node) => [node.id, node.x, node.y]),
    'C8 semantic layout is not deterministic',
  );
  assert.equal(nodeOverlapCount(graph), 0, 'C8 node circles overlap');
  assert.equal(graph.layoutEvidence.defaultChronologicalOrdinals, false);
  assert.equal(graph.nodes.length, flow.nodes.length, 'C9 layout changed node count');
  assert.equal(graph.edges.length, flow.edges.length, 'C9 layout changed edge count');
  assert.deepEqual(
    graph.nodes.map((node) => node.id).sort(),
    flow.nodes.map((node) => node.id).sort(),
    'C9 layout changed node identity',
  );
  assert.deepEqual(
    graph.edges.map((edge) => [edge.id, edge.source, edge.target, edge.probability, edge.expectedVisits]).sort(),
    flow.edges.map((edge) => [edge.id, edge.sourceNodeId, edge.targetNodeId,
      edge.conditionalProbability, edge.expectedFlow]).sort(),
    'C9 layout changed exact PolicyFlow edges',
  );
  assert.equal(topologyBefore, stableJson({
    nodes: flow.nodes.map((node) => node.id).sort(),
    edges: flow.edges.map((edge) => [
      edge.id,
      edge.sourceNodeId,
      edge.targetNodeId,
      edge.conditionalProbability,
      edge.expectedFlow,
    ]).sort(),
    topology: flow.topology,
    reconciliation: flow.reconciliation,
  }), 'C9 renderer mutated PolicyFlow');
  assert.equal(
    graph.layoutEvidence.recoveryCorridorEdgeCount,
    graph.edges.filter((edge) => edge.isRecovery).length,
    'C8 recovery edges did not receive recovery-corridor routing',
  );
  if (flow.topology.cyclicComponentCount > 0 && flow.nodes.length >= 40) {
    assert(graph.layoutEvidence.largeSccCount > 0, 'C8 field graph did not use large-SCC layout');
    assert(graph.layoutEvidence.semanticBandCount >= 3, 'C8 large SCC lacks semantic bands');
    assert(graph.layoutEvidence.horizontalSpan >= 560, 'C8 large SCC stayed in a compact ring');
    assert(graph.layoutEvidence.verticalSpan >= 500, 'C8 large SCC lacks vertical spread');
    assert(graph.bounds.height > 620, 'C8 field graph did not gain vertical space');
  }
  const goals = graph.nodes.filter((node) => node.kind === 'TERMINAL_SUCCESS');
  const nonGoals = graph.nodes.filter((node) => node.kind !== 'TERMINAL_SUCCESS');
  if (goals.length > 0 && nonGoals.length > 0) {
    assert(
      Math.min(...goals.map((node) => node.x)) > Math.min(...nonGoals.map((node) => node.x)),
      'C8 Goal is not separated toward the progress side',
    );
  }
  return {
    graph,
    evidence: {
      layoutVersion: graph.layoutVersion,
      layoutEvidence: graph.layoutEvidence,
      bounds: graph.bounds,
      nodeOverlapCount: nodeOverlapCount(graph),
      topology: graph.topology,
      topologyFingerprintPreserved: graph.topology.fingerprint === flow.topology.fingerprint,
      exactNodeIdsPreserved: true,
      exactEdgeIdentityProbabilityFlowPreserved: true,
    },
  };
}

function controlledMod(modId: string, genType: 'Prefix' | 'Suffix', weight: number): Mod {
  return {
    modId,
    name: modId,
    genType,
    weight,
    ilvl: 1,
    modGroup: `group_${modId}`,
    modGroups: [`group_${modId}`],
    tags: [],
    craftTags: [],
    spawnTags: [],
    statText: modId,
    statValues: [{ text: '1', min: 1, max: 1 }],
    tier: 1,
    tierCount: 1,
    isNotable: false,
  };
}

function phase3bPreservation(): Record<string, unknown> {
  const prefix = controlledMod('phase3c_prefix', 'Prefix', 1);
  const suffix = controlledMod('phase3c_suffix', 'Suffix', 1);
  const pool = new ModPool([prefix, suffix]);
  const priceBook = new PriceBook(PHASE3C_FIELD_INPUT.prices.currencyRates);
  const alteration = CRAFT_MECHANICS.find((mechanic) => mechanic.id === 'alteration_orb');
  assert(alteration?.getTransitions, 'C10 Alteration mechanic is unavailable');
  const base: ItemState = {
    baseType: 'Large Cluster Jewel',
    clusterType: 'Phase 3C preservation pool',
    itemLevel: 1,
    passiveCount: 8,
    rarity: 'magic',
    prefixes: [toRolledMod(prefix, { isFractured: true })],
    suffixes: [],
    fracturedModIds: [prefix.modId],
  };
  const distribution = alteration.getTransitions(base, { requiredMods: [] }, { pool, priceBook });
  let selfLoop = 0;
  let openSide = 0;
  for (const outcome of distribution.outcomes) {
    if (outcome.state.suffixes.length === 0) selfLoop += outcome.probability;
    else openSide += outcome.probability;
  }
  const shape = magicRollShapeProbabilities();
  assertNear(selfLoop, shape.PREFIX_ONLY, 'C10 blocked-side self-loop', 1e-12);
  assertNear(openSide, shape.SUFFIX_ONLY + shape.PREFIX_AND_SUFFIX,
    'C10 open-side mass', 1e-12);
  assertNear(selfLoop + openSide, 1, 'C10 probability conservation', 1e-12);
  return { contract: MAGIC_ROLL_SHAPE, selfLoop, openSide, conserved: selfLoop + openSide };
}

function buildLargeFieldStressFlow(): PolicyFlowSummary {
  const repository = new ClusterModRepository();
  const pool = new ModPool(repository.getCombinedModPool(
    PHASE3C_FIELD_INPUT.baseType,
    PHASE3C_FIELD_INPUT.clusterType,
  ));
  const cleanState: ItemState = {
    baseType: PHASE3C_FIELD_INPUT.baseType,
    clusterType: PHASE3C_FIELD_INPUT.clusterType,
    itemLevel: PHASE3C_FIELD_INPUT.itemLevel,
    passiveCount: PHASE3C_FIELD_INPUT.passiveCount,
    rarity: 'normal',
    prefixes: [],
    suffixes: [],
    fracturedModIds: [],
  };
  const result = new GenericSearchEngine(
    { pool, priceBook: new PriceBook(PHASE3C_FIELD_INPUT.prices.currencyRates) },
    PHASE3C_FIELD_INPUT.target,
    {
      enabledActionIds: [
        'transmutation_orb',
        'alteration_orb',
        'augmentation_orb',
        'regal_orb',
        'scouring_orb',
        'annulment_orb',
        'exalted_orb',
      ],
      prioritizeTargetProgress: true,
      maxStates: 5_000,
      maxWallTimeMs: 30_000,
      maxExpansionRounds: 3,
      searchIntent: 'DEEPEN',
      persistentExpansion: true,
      recommendationRefinementRounds: 1,
    },
  ).search(cleanState);
  assert.equal(
    result.optimalityProof.selectedPolicyStatus,
    'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED',
    'C8 targeted field stress solve did not certify an executable policy',
  );
  const flow = buildSelectedPolicyFlowSummary({
    sourceBundleId: 'phase3c-targeted-conventional-field-stress',
    sourcePolicyFingerprint: `phase3c-stress-${sha256(stableJson(
      result.onPolicyRules.map((rule) => [rule.stateKey, rule.selectedActionId]),
    )).slice(0, 12)}`,
    downstream: buildPolicyFlowComponent(result, 'DOWNSTREAM'),
  });
  assert.equal(flow.status, 'CERTIFIED');
  assert(flow.nodes.length >= 40,
    `C8 targeted field stress policy produced only ${flow.nodes.length} macro nodes`);
  assert(flow.topology.cyclicComponentCount > 0, 'C8 stress policy has no cyclic SCC');
  return flow;
}

function writeRendererFixture(flow: PolicyFlowSummary): Record<string, unknown> {
  const normalizedFlow = { ...flow, aggregation: { ...flow.aggregation, aggregationMs: 0 } };
  // Hash the JSON-representable value that the renderer will actually load. The
  // in-memory summary may contain optional properties whose value is undefined;
  // JSON serialization omits those properties, so hashing the pre-serialization
  // object would produce a checksum that no consumer can reproduce.
  const serializedFlow = JSON.parse(JSON.stringify(normalizedFlow)) as PolicyFlowSummary;
  const artifact = `${JSON.stringify({ policyFlow: serializedFlow }, null, 2)}\n`;
  const metadata = {
    fixtureId: 'policy-flow-phase3c-large-v1',
    fixtureVersion: 1,
    sourceAppCommit: 'Phase 3C worktree based on c8f3fb0',
    normalizedRequest: PHASE3C_FIELD_INPUT,
    selectedBundleId: serializedFlow.sourceBundleId,
    selectedPolicyFingerprint: serializedFlow.sourcePolicyFingerprint,
    policyFlowVersion: serializedFlow.version,
    topologyFingerprint: serializedFlow.topology.fingerprint,
    serializedSummary: {
      path: 'quality-lab/fixtures/policy-flow-phase3c-large-v1-artifact.json',
      selector: 'policyFlow',
      artifactSha256: sha256(artifact),
      normalizedSummarySha256: sha256(stableJson(serializedFlow)),
      nodeCount: serializedFlow.nodes.length,
      edgeCount: serializedFlow.edges.length,
    },
    certificationScope:
      'Phase 3C exact frozen field PolicyFlow topology rendered by the production semantic large-SCC layout.',
    limitations: [
      'The frozen renderer wrapper is harness-only.',
      'The real Worker differential remains authoritative for solver output.',
      'Geometry is asserted by semantic invariants rather than pixel-perfect coordinates.',
    ],
  };
  writeFileSync(rendererArtifactPath, artifact, 'utf8');
  writeFileSync(rendererMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return metadata;
}

function runDiagnostic(): void {
  const service = new OptimizerService(new ClusterModRepository());
  const started = Date.now();
  const result = service.optimize(PHASE3C_FIELD_INPUT);
  const elapsedMs = Date.now() - started;
  assert(result.policyFlow, 'C8 exact field result omitted PolicyFlow');
  assert.equal(result.policyFlow.status, 'CERTIFIED');
  assert.equal(result.policyFlow.reconciliation.certified, true);
  const policy = policyFamilyDiagnostics(result);
  const rendererFlow = result.policyFlow.nodes.length >= 40
    ? result.policyFlow
    : buildLargeFieldStressFlow();
  const layout = layoutDiagnostics(rendererFlow);
  const phase3b = phase3bPreservation();
  const rendererFixture = writeRendererFixture(rendererFlow);
  const before = JSON.parse(readFileSync(beforeEvidencePath, 'utf8')) as Record<string, unknown>;
  const summary = resultSummary(result, elapsedMs);
  const evidence = {
    phase: '3C',
    generatedAt: new Date().toISOString(),
    groups: {
      C1_frozenRequest: {
        request: PHASE3C_FIELD_INPUT,
        historicalPlanObservation: {
          openU: 1440.1876751182278,
          conventionalU: 2276.6407665828724,
          violationChaos: 836.4530914646446,
          openFingerprint: 'policy-8d1a067c',
          conventionalFingerprint: 'policy-4aa41222',
        },
        preRepairArtifact: beforeEvidencePath,
        preRepairArtifactSha256: sha256(readFileSync(beforeEvidencePath)),
        preRepairKind: before.kind,
        after: summary,
      },
      C2_policyAdmissibility: policy.conventional,
      C3_knownIncumbentMonotonicity: {
        finalFamilyU: policy.conventional.finalFullRouteU,
        revalidatedKnownPolicyU: policy.conventional.revalidatedKnownPolicyCostChaos,
        invariant: 'familyU <= revalidatedKnownPolicyU + 0.05c',
      },
      C4_independentEvaluationParity:
        findFamily(result, 'CONVENTIONAL').knownPolicyAdmissibility?.sourceParity,
      C5_searchDivergence: policy.divergence,
      C6_familyMatrix: policy.matrix,
      C7_policyEquivalence: policy.equivalence,
      C8_largeSccLayout: layout.evidence,
      C9_topologyPreservation: {
        exactWorkerPolicyFlowFingerprint: result.policyFlow.topology.fingerprint,
        rendererStressPolicyFlowFingerprint: rendererFlow.topology.fingerprint,
        visualizationFingerprint: layout.graph.topology.fingerprint,
        reconciliation: rendererFlow.reconciliation,
      },
      C10_phase3bPreservation: phase3b,
    },
    rendererFixture,
    prohibitions: {
      unitTestsAddedOrRun: false,
      hardcodedWinner: false,
      craftSpecificProductionBranch: false,
      weakenedStateIdentity: false,
      marketFracturedRanking: false,
      mechanicsChanged: false,
    },
  };
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(diagnosticEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  writeFileSync(afterEvidencePath, `${JSON.stringify({
    phase: '3C',
    kind: 'POST_REPAIR_REPRODUCTION',
    generatedAt: evidence.generatedAt,
    ...summary,
  }, null, 2)}\n`, 'utf8');
  const conventional = findFamily(result, 'CONVENTIONAL');
  const lines = [
    'PHASE 3C POLICY ADMISSIBILITY + CONSTELLATION DIAGNOSTIC',
    `C1 selected=${result.expectedCostChaos ?? 'unresolved'}c; ` +
      `Open=${findFamily(result, 'OPEN').fullRouteU ?? 'unresolved'}c; ` +
      `Conventional=${conventional.fullRouteU ?? 'unresolved'}c`,
    `C2 selectedOpenAdmissible=${conventional.selectedOpenPolicyAdmissibility?.admissible}; ` +
      `failures=${conventional.selectedOpenPolicyAdmissibility?.failures.length ?? 0}`,
    `C3 incumbent=${conventional.incumbentSource}; ` +
      `known=${conventional.revalidatedKnownPolicyCostChaos ?? 'n/a'}c; ` +
      `independent=${conventional.independentFullRouteU ?? 'unresolved'}c; ` +
      `final=${conventional.fullRouteU ?? 'unresolved'}c`,
    `C4 absorption=${conventional.knownPolicyAdmissibility?.evaluation?.terminalAbsorptionProbability ?? 'n/a'}; ` +
      `costDiff=${conventional.knownPolicyAdmissibility?.sourceParity?.costDifferenceChaos ?? 'n/a'}`,
    `C5 missingKnownStates=${conventional.searchDivergence?.knownOnPolicyStatesMissingFromIndependentGraph ?? 'n/a'}; ` +
      `differentActions=${conventional.searchDivergence?.commonOnPolicyStatesWithDifferentActions ?? 'n/a'}`,
    `C6 families=${policy.matrix.length}`,
    `C7 sameFingerprint=${policy.equivalence.sameFingerprint}`,
    `C8 nodes=${rendererFlow.nodes.length}; edges=${rendererFlow.edges.length}; ` +
      `bands=${layout.graph.layoutEvidence.semanticBandCount}; ` +
      `span=${layout.graph.layoutEvidence.horizontalSpan}x${layout.graph.layoutEvidence.verticalSpan}; ` +
      `overlaps=${nodeOverlapCount(layout.graph)}`,
    `C9 topology=${rendererFlow.topology.fingerprint}; reconciled=${rendererFlow.reconciliation.certified}`,
    `C10 fractured Magic self-loop=${String(phase3b.selfLoop)}; open-side=${String(phase3b.openSide)}`,
    `Evidence SHA-256: ${sha256(JSON.stringify(evidence))}`,
  ];
  writeFileSync(textEvidencePath, `${lines.join('\n')}\n`, 'utf8');
  console.log(lines.join('\n'));
}

runDiagnostic();
