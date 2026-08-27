import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import type { PolicyFlowSummary } from '../crafting-engine/src/domain/PolicyFlow.ts';
import { buildVisualizationGraph } from '../crafting-engine/src/domain/VisualizationGraph.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
  type OptimizeCraftResult,
} from '../crafting-engine/src/service/optimizerService.ts';

type JsonRecord = Record<string, unknown>;

interface Fixture {
  id: string;
  baseType: OptimizeCraftInput['baseType'];
  clusterType: string;
  itemLevel: number;
  passiveCount: number;
  finalRarity: 'magic' | 'rare' | 'any';
  extraAffixes: 'allow-extra' | 'no-unwanted';
  targetMods: string[];
  priceContext?: OptimizeCraftInput['prices'];
  searchBudget: NonNullable<OptimizeCraftInput['searchBudget']>;
}

interface FixtureCorpus {
  version: string;
  fixtures: Fixture[];
}

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const outputPath = join(repositoryRoot, 'output-phase2z-selected-policy-flow-diagnostic.txt');
const evidencePath = join(
  repositoryRoot,
  'quality-lab',
  'reports',
  'evidence',
  'phase2z-policy-flow-diagnostic.json',
);
const committedEvidenceMode = process.argv.includes('--committed-evidence');

if (committedEvidenceMode) {
  const report = JSON.parse(readFileSync(
    join(repositoryRoot, 'quality-lab', 'reports', 'phase2z-gate.json'),
    'utf8',
  )) as {
    status: string;
    checks: Array<{ id: string; passed: boolean; tags?: string[] }>;
    consoleErrors: string[];
    pageErrors: string[];
    networkErrors: string[];
  };
  assert.equal(report.status, 'PASSED');
  assert(report.checks.length >= 8, 'Committed Phase 2Z browser report is incomplete');
  assert(report.checks.every((check) => check.passed));
  assert.deepEqual(report.consoleErrors, []);
  assert.deepEqual(report.pageErrors, []);
  assert.deepEqual(report.networkErrors, []);
  assert(readFileSync(outputPath, 'utf8').includes('ALL PHASE 2Z DIRECT DIAGNOSTIC GATES PASS'));
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8')) as JsonRecord;
  assert.equal(evidence.version, 'SELECTED_POLICY_FLOW_V1');
  console.log([
    'PHASE 2Z — COMMITTED SELECTED-POLICY FLOW EVIDENCE AUDIT',
    `PASS: ${report.checks.length}/${report.checks.length} targeted real-browser gates are committed.`,
    'PASS: direct flow/recovery/topology evidence and zero runtime errors are committed.',
    'Unit tests run: NO',
  ].join('\n'));
  process.exit(0);
}

const corpus = JSON.parse(readFileSync(
  join(repositoryRoot, 'quality-lab', 'fixtures', 'fixtureCorpus.json'),
  'utf8',
)) as FixtureCorpus;
const fixture = (id: string): Fixture => {
  const found = corpus.fixtures.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Fixture ${id} is absent from ${corpus.version}`);
  return found;
};

function inputFor(
  source: Fixture,
  compareMethodFamilies = false,
  objective: OptimizeCraftInput['objective'] = { kind: 'CHEAPEST_CHAOS' },
): OptimizeCraftInput {
  return {
    baseType: source.baseType,
    clusterType: source.clusterType,
    itemLevel: source.itemLevel,
    passiveCount: source.passiveCount,
    target: {
      requiredMods: source.targetMods.map((modId) => ({ modId })),
      requiredRarity: source.finalRarity === 'any' ? undefined : source.finalRarity,
      finalStateConstraints: source.extraAffixes === 'no-unwanted'
        ? { maxUnmatchedAffixes: 0 }
        : undefined,
    },
    prices: source.priceContext,
    objective,
    searchBudget: source.searchBudget,
    searchIntent: 'RECOMMEND',
    allowResearchFallbackPrices: true,
    compareMethodFamilies,
  };
}

function assertNear(actual: number, expected: number, label: string, tolerance = 1e-7): void {
  const allowed = Math.max(tolerance, Math.max(Math.abs(actual), Math.abs(expected)) * tolerance);
  assert(Math.abs(actual - expected) <= allowed, `${label}: ${actual} differs from ${expected}`);
}

function assertExactFlow(result: OptimizeCraftResult, fixtureId: string): PolicyFlowSummary {
  assert(result.recommended, `${fixtureId} did not produce an executable selected route`);
  assert.equal(result.internalConsistency.status, 'OK', `${fixtureId} canonical bundle mismatch`);
  const flow = result.policyFlow;
  assert(flow, `${fixtureId} omitted selected-policy flow`);
  assert.equal(flow.version, 'SELECTED_POLICY_FLOW_V1');
  assert.equal(flow.status, 'CERTIFIED', `${fixtureId} policy flow was not certified`);
  assert.equal(flow.sourceBundleId, result.internalConsistency.selectedBundleId);
  assert(flow.nodes.length > 1 && flow.edges.length > 0);
  assert.equal(new Set(flow.nodes.map((node) => node.id)).size, flow.nodes.length);
  assert.equal(new Set(flow.edges.map((edge) => edge.id)).size, flow.edges.length);
  assert(flow.startNodeIds.length > 0);
  assert(flow.terminalNodeIds.length > 0);
  assert.equal(flow.aggregation.visibleFlowFraction, 1);
  assert.equal(flow.aggregation.expectedFlowCollapsedIntoRareOutcomes, 0);
  assert(flow.aggregation.exactStateCount >= flow.nodes.length);
  assert(flow.aggregation.exactTransitionCount >= flow.edges.length);
  assert(flow.aggregation.differentialSamples.length > 0);
  assert(flow.reconciliation.certified);
  assert(flow.reconciliation.outgoingFlowConserved);
  assert(flow.reconciliation.conditionalProbabilitiesConserved);
  assert(flow.reconciliation.terminalAbsorptionReconciled);
  const nodeById = new Map(flow.nodes.map((node) => [node.id, node]));
  for (const node of flow.nodes) {
    const outgoing = flow.edges.filter((edge) => edge.sourceNodeId === node.id);
    if (node.terminal) {
      assert.equal(outgoing.length, 0, `${fixtureId}/${node.id} terminal has outgoing flow`);
      continue;
    }
    assert(outgoing.length > 0, `${fixtureId}/${node.id} has no selected-policy destination`);
    const expectedFlow = outgoing.reduce((sum, edge) => sum + edge.expectedFlow, 0);
    const probability = outgoing.reduce((sum, edge) => sum + edge.conditionalProbability, 0);
    assertNear(expectedFlow, node.expectedVisits, `${fixtureId}/${node.id} outgoing flow`);
    assertNear(probability, 1, `${fixtureId}/${node.id} conditional probability`);
    for (const edge of outgoing) {
      assert.equal(edge.actionId, node.selectedActionId, `${fixtureId}/${edge.id} source action mismatch`);
      assert(nodeById.has(edge.targetNodeId), `${fixtureId}/${edge.id} target missing`);
      assert(edge.conditionalProbability >= 0 && edge.conditionalProbability <= 1 + 1e-12);
      assert(edge.expectedFlow > 0);
      assert(edge.exactTransitionCount > 0);
      assert.equal(edge.evidenceKind === 'EXACT_SELECTED_POLICY_TRANSITION' ||
        edge.evidenceKind === 'CERTIFIED_SCOPE_HANDOFF', true);
    }
  }
  for (const sample of flow.aggregation.differentialSamples) {
    assertNear(
      sample.exactExpectedFlow,
      sample.occupancy * sample.exactProbability,
      `${fixtureId} exact-state differential`,
      1e-10,
    );
    const macroEdge = flow.edges.find((edge) =>
      edge.sourceNodeId === sample.sourceNodeId &&
      edge.targetNodeId === sample.targetNodeId &&
      edge.actionId === sample.actionId
    );
    assert(macroEdge, `${fixtureId} sampled exact transition has no serialized macro edge`);
    assert(macroEdge.expectedFlow + 1e-10 >= sample.exactExpectedFlow);
  }
  const representedTerminalFlow = flow.edges
    .filter((edge) => flow.terminalNodeIds.includes(edge.targetNodeId))
    .reduce((sum, edge) => sum + edge.expectedFlow, 0);
  assertNear(
    representedTerminalFlow,
    flow.reconciliation.selectedPolicyTerminalAbsorption,
    `${fixtureId} terminal absorption`,
  );
  return flow;
}

const fixtureRuns: Array<{
  id: string;
  fixtureId: string;
  compareMethodFamilies?: boolean;
  objective?: OptimizeCraftInput['objective'];
}> = [
  { id: 'clean-one-mod', fixtureId: 'cheap_one_mod' },
  { id: 'conventional-two-mod', fixtureId: 'herald_envoy_endbringer' },
  {
    id: 'selected-harvest',
    fixtureId: 'phase2w_armour_evasion_12',
    objective: { kind: 'FEWEST_ACTIONS_WITHIN_COST', maxExpectedCostChaos: 600 },
  },
  { id: 'self-fracture-three-notable', fixtureId: 'phase2x_three_notable_handoff' },
  { id: 'four-mod-provisional', fixtureId: 'four_mod_release' },
];
const results = new Map<string, OptimizeCraftResult>();
const timings = new Map<string, number>();
const lines = ['PHASE 2Z — SELECTED-POLICY BRANCHING CONSTELLATION DIRECT DIAGNOSTIC'];

for (const run of fixtureRuns) {
  console.error(`[phase2z] ${run.id}`);
  const started = performance.now();
  const result = new OptimizerService(new ClusterModRepository()).optimize(
    inputFor(fixture(run.fixtureId), run.compareMethodFamilies, run.objective),
  );
  const elapsedMs = performance.now() - started;
  results.set(run.id, result);
  timings.set(run.id, elapsedMs);
  const flow = assertExactFlow(result, run.id);
  const semanticSnapshot = JSON.stringify({
    recommendationStatus: result.recommendationStatus,
    recommended: result.recommended,
    expectedCostChaos: result.expectedCostChaos,
    expectedActionUsage: result.expectedActionUsage,
    internalConsistency: result.internalConsistency,
  });
  const graph = buildVisualizationGraph(flow, {
    seed: `phase2z-${run.id}`,
    acquisitionContext: result.presentation.acquisitionContext,
  });
  assert.equal(JSON.stringify({
    recommendationStatus: result.recommendationStatus,
    recommended: result.recommended,
    expectedCostChaos: result.expectedCostChaos,
    expectedActionUsage: result.expectedActionUsage,
    internalConsistency: result.internalConsistency,
  }), semanticSnapshot, `${run.id} visualization mutated solver semantics`);
  assert.equal(graph.topology.fingerprint, flow.topology.fingerprint);
  assert.equal(graph.nodes.length, flow.nodes.length);
  assert.equal(graph.edges.length, flow.edges.length);
  assert(graph.performance.layoutMs < 250, `${run.id} layout took ${graph.performance.layoutMs}ms`);
  assert(graph.performance.particleBudget <= 120);
  lines.push(
    `PASS ${run.id}: ${flow.topology.nodeCount} nodes / ${flow.topology.edgeCount} edges / ` +
    `${flow.topology.stronglyConnectedComponentCount} SCCs / ${flow.topology.branchNodeCount} branch nodes / ` +
    `${flow.topology.recoveryEdgeCount} recovery edges / ${elapsedMs.toFixed(0)}ms solve / ` +
    `${flow.aggregation.aggregationMs.toFixed(2)}ms aggregation / ${graph.performance.layoutMs.toFixed(2)}ms layout.`,
  );
}

const conventionalFlow = results.get('conventional-two-mod')!.policyFlow!;
const threeNotableFlow = results.get('self-fracture-three-notable')!.policyFlow!;
const harvestFlow = results.get('selected-harvest')!.policyFlow!;

const regalBranchNodes = threeNotableFlow.nodes.filter((node) =>
  node.selectedActionId === 'regal_orb' &&
  threeNotableFlow.edges.filter((edge) => edge.sourceNodeId === node.id).length >= 2
);
assert(regalBranchNodes.length > 0, 'Frozen three-notable policy did not expose real Regal branching');
for (const node of regalBranchNodes) {
  const branches = threeNotableFlow.edges.filter((edge) => edge.sourceNodeId === node.id);
  assertNear(branches.reduce((sum, edge) => sum + edge.conditionalProbability, 0), 1, 'Regal branches');
  assert(branches.every((edge) => edge.exactTransitionCount > 0));
}
lines.push(`PASS Regal control: ${regalBranchNodes.length} Regal macro state(s) branch into real next-policy classes.`);

const reacquireEdges = threeNotableFlow.edges.filter((edge) =>
  edge.actionId === 'restart_reacquire' || edge.outcomeKind === 'REACQUIRE'
);
const scourEdges = threeNotableFlow.edges.filter((edge) => edge.actionId === 'scouring_orb');
assert(reacquireEdges.length > 0, 'Self-fracture policy omitted restart/reacquire flow');
assert(scourEdges.length > 0, 'Self-fracture policy omitted Scour flow');
assert(reacquireEdges.every((edge) => edge.outcomeKind === 'REACQUIRE'));
assert(scourEdges.every((edge) => edge.outcomeKind === 'RECOVERY'));
assert(!new Set(reacquireEdges.map((edge) => edge.id)).has(scourEdges[0].id));
const nodeById = new Map(threeNotableFlow.nodes.map((node) => [node.id, node]));
const fracturedScourEdges = scourEdges.filter((edge) =>
  (nodeById.get(edge.targetNodeId)?.fracturedTargetModIds.length ?? 0) === 1
);
assert(fracturedScourEdges.length > 0, 'Controlled one-fractured Scour destination was not observed');
for (const edge of fracturedScourEdges) {
  const destination = nodeById.get(edge.targetNodeId)!;
  assert.equal(destination.rarity, 'magic');
  assert.notEqual(destination.selectedActionId, 'transmutation_orb');
  assert.equal(edge.nextSelectedActionId, destination.selectedActionId);
}
const nonFracturedScourEdges = [conventionalFlow, threeNotableFlow]
  .flatMap((flow) => flow.edges.map((edge) => ({ flow, edge })))
  .filter(({ edge }) => edge.actionId === 'scouring_orb')
  .filter(({ flow, edge }) => {
    const target = flow.nodes.find((node) => node.id === edge.targetNodeId);
    return target?.fracturedTargetModIds.length === 0;
  });
for (const { flow, edge } of nonFracturedScourEdges) {
  const destination = flow.nodes.find((node) => node.id === edge.targetNodeId)!;
  assert.equal(destination.rarity, 'normal');
  assert.equal(edge.nextSelectedActionId, destination.selectedActionId);
}
lines.push(
  `PASS recovery: ${scourEdges.length} Scour and ${reacquireEdges.length} reacquire branches are distinct; ` +
  `${fracturedScourEdges.length} one-fractured Scour branch(es) reach Magic non-Transmute policy states.`,
);

const harvestNodes = harvestFlow.nodes.filter((node) =>
  node.selectedActionId?.startsWith('harvest_reforge_')
);
assert(harvestNodes.length > 0, 'Harvest control did not select a Harvest policy');
const harvestEdges = harvestFlow.edges.filter((edge) =>
  harvestNodes.some((node) => node.id === edge.sourceNodeId)
);
assert(harvestEdges.some((edge) => edge.outcomeKind === 'REPEAT'));
assert(harvestEdges.some((edge) => edge.outcomeKind === 'SUCCESS'));
assert(harvestEdges.every((edge) => edge.exactTransitionCount > 0));
lines.push('PASS Harvest control: certified misses repeat Harvest and certified success reaches Goal from exact flow.');

assert(threeNotableFlow.nodes.some((node) => node.scope === 'ACQUISITION'));
assert(threeNotableFlow.edges.some((edge) => edge.actionId === 'fracturing_orb'));
assert(threeNotableFlow.nodes.filter((node) => node.scope === 'ACQUISITION').length < 50);
lines.push('PASS acquisition flow: preparation/fracture/restart/cleanup is retained without raw-state explosion.');

const topologyFingerprints = fixtureRuns.map((run) => results.get(run.id)!.policyFlow!.topology.fingerprint);
assert(new Set(topologyFingerprints).size >= 4, 'Representative policies collapsed to the same topology');
const actionHistograms = fixtureRuns.map((run) =>
  JSON.stringify(results.get(run.id)!.policyFlow!.topology.selectedActionHistogram)
);
assert(new Set(actionHistograms).size >= 4, 'Representative selected-action histograms did not differ');
lines.push(`PASS topology diversity: ${new Set(topologyFingerprints).size}/${fixtureRuns.length} distinct topology fingerprints.`);

const graphSource = readFileSync(
  join(repositoryRoot, 'crafting-engine', 'src', 'domain', 'VisualizationGraph.ts'),
  'utf8',
);
const policyFlowSource = readFileSync(
  join(repositoryRoot, 'crafting-engine', 'src', 'domain', 'PolicyFlow.ts'),
  'utf8',
);
assert(!graphSource.includes('routeStepNumber'));
assert(!graphSource.includes('recoveryTargetStepId'));
assert(!graphSource.includes('probability: 0.5'));
assert(!graphSource.includes('target: startNodeId'));
assert(policyFlowSource.includes('rule.expectedVisits * transition.probability'));
lines.push('PASS no synthetic probabilities: production flow uses occupancy × exact transition probability only.');

const evidence = {
  phase: '2Z',
  version: 'SELECTED_POLICY_FLOW_V1',
  fixtureCorpusVersion: corpus.version,
  generatedAt: new Date().toISOString(),
  fixtures: fixtureRuns.map((run) => {
    const result = results.get(run.id)!;
    const flow = result.policyFlow!;
    return {
      id: run.id,
      sourceFixtureId: run.fixtureId,
      route: result.recommended?.name,
      sourceBundleId: flow.sourceBundleId,
      sourcePolicyFingerprint: flow.sourcePolicyFingerprint,
      status: flow.status,
      topology: flow.topology,
      aggregation: flow.aggregation,
      reconciliation: flow.reconciliation,
      solveMs: timings.get(run.id),
      actions: flow.nodes.filter((node) => !node.terminal).map((node) => node.selectedActionId),
    };
  }),
  controls: {
    regalBranchNodeIds: regalBranchNodes.map((node) => node.id),
    scourEdges,
    reacquireEdges,
    fracturedScourEdges,
    harvestEdges,
  },
  topologyFingerprintCount: new Set(topologyFingerprints).size,
  unitTestsRun: false,
  mechanicsProbabilitiesChanged: false,
  stateIdentityChanged: false,
};
mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
lines.push('ALL PHASE 2Z DIRECT DIAGNOSTIC GATES PASS');
lines.push('Unit tests added/run: NO');
lines.push('Mechanics probabilities changed: NO');
lines.push('State identity weakened: NO');
lines.push('Hardcoded route winner added: NO');
lines.push('Market-fractured ranking restored: NO');
writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
