import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import type { PolicyFlowSummary } from '../crafting-engine/src/domain/PolicyFlow.ts';
import {
  buildVisualizationGraph,
  type VisualizationGraph,
} from '../crafting-engine/src/domain/VisualizationGraph.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
} from '../crafting-engine/src/service/optimizerService.ts';
import {
  constellationGraphBounds,
  createConstellationLayoutIdentity,
  createEffectiveConstellationGraph,
  loadConstellationLayout,
  MANUAL_CONSTELLATION_LAYOUT_SCHEMA,
  parseConstellationLayout,
  persistConstellationLayout,
  removePersistedConstellationLayout,
  serializeConstellationLayout,
  type ConstellationLayoutOverrides,
  type ConstellationStorage,
} from '../src/components/constellationLayout.ts';

type JsonRecord = Record<string, unknown>;

interface FrozenFixtureMetadata {
  fixtureId: string;
  fixtureVersion: number;
  sourceAppCommit: string;
  normalizedRequest: JsonRecord;
  selectedBundleId: string;
  selectedPolicyFingerprint: string;
  selectedRouteName: string;
  selectedCostChaos: number;
  policyFlowVersion: string;
  topologyFingerprint: string;
  exactFlowFingerprint: string;
  serializedSummary: {
    path: string;
    selector: string;
    artifactSha256: string;
    normalizedSummarySha256: string;
    nodeCount: number;
    edgeCount: number;
  };
  certificationScope: string;
  limitations: string[];
}

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const fixtureDirectory = join(repositoryRoot, 'quality-lab', 'fixtures');
const evidenceDirectory = join(repositoryRoot, 'quality-lab', 'reports', 'evidence');
const artifactPath = join(fixtureDirectory, 'policy-flow-phase3e-manual-v1-artifact.json');
const metadataPath = join(fixtureDirectory, 'policy-flow-phase3e-manual-v1.json');
const evidencePath = join(evidenceDirectory, 'phase3e-manual-constellation-layout-diagnostic.json');
const outputPath = join(repositoryRoot, 'output-phase3e-manual-constellation-layout-diagnostic.txt');

const FIELD_INPUT: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Chaos Damage',
  itemLevel: 84,
  passiveCount: 8,
  target: {
    requiredMods: [
      { modId: 'Touch of Cruelty' },
      { modId: 'Unspeakable Gifts' },
      { modId: 'Unwaveringly Evil' },
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
    cleanBaseCostChaos: 38,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance:
      'Frozen Allflame ilvl 84 eight-passive 12% Chaos Damage clean-base quote reviewed by the Phase 3E plan',
  },
  objective: { kind: 'CHEAPEST_CHAOS' },
  searchBudget: {
    preset: 'NORMAL',
    maxStates: 5_000,
    maxWallTimeMs: 30_000,
    maxExpansionRounds: 3,
  },
  searchIntent: 'RECOMMEND',
  allowResearchFallbackPrices: true,
  compareMethodFamilies: false,
};

function stableJson(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as JsonRecord;
  return `{${Object.keys(record)
    .filter((key) => key !== 'aggregationMs')
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function refreshFixture(): void {
  const result = new OptimizerService(new ClusterModRepository()).optimize(FIELD_INPUT);
  const flow = result.policyFlow;
  assert(flow, 'Phase 3E field solve did not publish PolicyFlow');
  assert.equal(result.recommended.name, 'Self-fracture Unspeakable Gifts');
  assert(Math.abs(result.expectedCostChaos - 1660.1253603083733) < 1e-6);
  assert.equal(flow.status, 'CERTIFIED');
  assert.equal(flow.topology.fingerprint, 'topology-c6ae1cff');
  assert.equal(flow.aggregation.exactFlowFingerprint, 'flow-95543b18');
  assert.equal(flow.nodes.length, 23);
  assert.equal(flow.edges.length, 49);
  const artifact = {
    input: FIELD_INPUT,
    selectedRoute: result.recommended,
    recommendationStatus: result.recommendationStatus,
    flow,
  };
  const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
  const serializedFlow = (JSON.parse(artifactText) as { flow: PolicyFlowSummary }).flow;
  mkdirSync(fixtureDirectory, { recursive: true });
  writeFileSync(artifactPath, artifactText, 'utf8');
  const metadata: FrozenFixtureMetadata = {
    fixtureId: 'policy-flow-phase3e-manual-v1',
    fixtureVersion: 1,
    sourceAppCommit: 'dc32528e107090bfd7b6bbbe321db93d8b4b1723',
    normalizedRequest: FIELD_INPUT as unknown as JsonRecord,
    selectedBundleId: flow.sourceBundleId,
    selectedPolicyFingerprint: flow.sourcePolicyFingerprint ?? '',
    selectedRouteName: result.recommended.name,
    selectedCostChaos: result.expectedCostChaos,
    policyFlowVersion: flow.version,
    topologyFingerprint: flow.topology.fingerprint,
    exactFlowFingerprint: flow.aggregation.exactFlowFingerprint,
    serializedSummary: {
      path: 'quality-lab/fixtures/policy-flow-phase3e-manual-v1-artifact.json',
      selector: 'flow',
      artifactSha256: sha256(artifactText),
      normalizedSummarySha256: sha256(stableJson(serializedFlow)),
      nodeCount: flow.nodes.length,
      edgeCount: flow.edges.length,
    },
    certificationScope:
      'Frozen real 23-node Normal self-fracture PolicyFlow used only to validate Phase 3E presentation overrides.',
    limitations: [
      'Manual layout is browser-local presentation data and is absent from this PolicyFlow fixture.',
      'The frozen renderer wrapper is Quality Lab-only.',
      'Refreshing this fixture requires an explicit --refresh-fixture invocation.',
    ],
  };
  writeFileSync(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  console.log(`Refreshed ${metadata.fixtureId}: ${flow.topology.fingerprint}/${flow.aggregation.exactFlowFingerprint}`);
}

function loadFixture(): { metadata: FrozenFixtureMetadata; flow: PolicyFlowSummary } {
  assert(existsSync(metadataPath), 'Phase 3E fixture metadata is missing; use --refresh-fixture intentionally');
  assert(existsSync(artifactPath), 'Phase 3E fixture artifact is missing; use --refresh-fixture intentionally');
  const metadata = JSON.parse(readFileSync(metadataPath, 'utf8')) as FrozenFixtureMetadata;
  const artifact = readFileSync(artifactPath);
  assert.equal(sha256(artifact), metadata.serializedSummary.artifactSha256);
  const wrapper = JSON.parse(artifact.toString('utf8')) as { flow: PolicyFlowSummary };
  const flow = wrapper.flow;
  assert.equal(sha256(stableJson(flow)), metadata.serializedSummary.normalizedSummarySha256);
  assert.equal(flow.sourceBundleId, metadata.selectedBundleId);
  assert.equal(flow.sourcePolicyFingerprint, metadata.selectedPolicyFingerprint);
  assert.equal(flow.topology.fingerprint, metadata.topologyFingerprint);
  assert.equal(flow.aggregation.exactFlowFingerprint, metadata.exactFlowFingerprint);
  return { metadata, flow };
}

function truthProjection(flow: PolicyFlowSummary): string {
  return stableJson({
    topology: flow.topology,
    exactFlowFingerprint: flow.aggregation.exactFlowFingerprint,
    nodes: flow.nodes.map((node) => ({
      id: node.id,
      expectedVisits: node.expectedVisits,
      occupancyShare: node.occupancyShare,
    })),
    edges: flow.edges.map((edge) => ({
      id: edge.id,
      source: edge.sourceNodeId,
      target: edge.targetNodeId,
      probability: edge.conditionalProbability,
      expectedFlow: edge.expectedFlow,
      outcomeKind: edge.outcomeKind,
      evidenceKind: edge.evidenceKind,
    })),
    reconciliation: flow.reconciliation,
  });
}

function graphTruthProjection(graph: VisualizationGraph): string {
  return stableJson({
    topology: graph.topology,
    policyFlowVersion: graph.policyFlowVersion,
    policyFlowStatus: graph.policyFlowStatus,
    sourceBundleId: graph.sourceBundleId,
    sourcePolicyFingerprint: graph.sourcePolicyFingerprint,
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      occupancyWeight: node.occupancyWeight,
      expectedVisits: node.details.expectedVisits,
      scope: node.scope,
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      probability: edge.probability,
      expectedVisits: edge.expectedVisits,
      outcomeKind: edge.outcomeKind,
      evidenceKind: edge.evidenceKind,
      routing: edge.routing,
    })),
  });
}

function fakeStorage(): ConstellationStorage & { values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
  };
}

function runDiagnostic(): void {
  const { metadata, flow } = loadFixture();
  const flowTruthBefore = truthProjection(flow);
  const canonicalGraph = buildVisualizationGraph(flow, {
    seed: 'phase3e_manual_constellation_field',
    acquisitionContext: { kind: 'SELF_FRACTURE', targetModId: 'Unspeakable Gifts' },
  });
  const canonicalGraphBytes = stableJson(canonicalGraph);
  const graphTruthBefore = graphTruthProjection(canonicalGraph);
  const alterLoop = flow.edges.find((edge) => {
    const source = flow.nodes.find((node) => node.id === edge.sourceNodeId);
    return edge.sourceNodeId === edge.targetNodeId && source?.selectedActionId === 'alteration_orb';
  });
  assert(alterLoop, 'E4 fixture omitted the Alter repeat self-loop');
  const handoff = flow.edges.find((edge) => edge.evidenceKind === 'CERTIFIED_SCOPE_HANDOFF');
  assert(handoff, 'E5 fixture omitted the certified scope handoff');
  const canonicalNode = (nodeId: string) => {
    const node = canonicalGraph.nodes.find((candidate) => candidate.id === nodeId);
    assert(node, `Missing visualization node ${nodeId}`);
    return node;
  };
  const overrideEntries = new Map<string, { x: number; y: number }>();
  const move = (nodeId: string, deltaX: number, deltaY: number) => {
    const base = canonicalNode(nodeId);
    const prior = overrideEntries.get(nodeId) ?? { x: base.x, y: base.y };
    overrideEntries.set(nodeId, { x: prior.x + deltaX, y: prior.y + deltaY });
  };
  move(alterLoop.sourceNodeId, 176, -88);
  move(handoff.sourceNodeId, -132, 74);
  move(handoff.targetNodeId, 214, -54);
  const overrides = Object.fromEntries(overrideEntries) as ConstellationLayoutOverrides;
  const effectiveGraph = createEffectiveConstellationGraph(canonicalGraph, overrides);

  // E1: every policy/proof value remains on the canonical graph and survives
  // the presentation projection unchanged.
  assert.equal(truthProjection(flow), flowTruthBefore);
  assert.equal(stableJson(canonicalGraph), canonicalGraphBytes);
  assert.equal(graphTruthProjection(effectiveGraph), graphTruthBefore);
  assert.equal(effectiveGraph.topology.fingerprint, metadata.topologyFingerprint);
  assert.equal(flow.aggregation.exactFlowFingerprint, metadata.exactFlowFingerprint);

  // E2: only explicitly overridden nodes move.
  for (const node of effectiveGraph.nodes) {
    const override = overrides[node.id];
    const canonical = canonicalNode(node.id);
    if (override) assert.deepEqual({ x: node.x, y: node.y }, override);
    else assert.deepEqual({ x: node.x, y: node.y }, { x: canonical.x, y: canonical.y });
  }

  // E3/E4: endpoints, curve geometry, and the Alter self-loop follow effective
  // positions while canonical edge data remains untouched.
  const connected = canonicalGraph.edges.find((edge) =>
    edge.source === alterLoop.sourceNodeId && edge.id !== alterLoop.id
  );
  assert(connected, 'E3 Alter node omitted a connected non-loop edge');
  const effectiveConnected = effectiveGraph.edges.find((edge) => edge.id === connected.id)!;
  assert.notDeepEqual(
    { x: effectiveConnected.controlX, y: effectiveConnected.controlY },
    { x: connected.controlX, y: connected.controlY },
  );
  const canonicalLoop = canonicalGraph.edges.find((edge) => edge.id === alterLoop.id)!;
  const effectiveLoop = effectiveGraph.edges.find((edge) => edge.id === alterLoop.id)!;
  const alterDisplacement = {
    x: canonicalNode(alterLoop.sourceNodeId).x - effectiveGraph.nodes.find(
      (node) => node.id === alterLoop.sourceNodeId,
    )!.x,
    y: canonicalNode(alterLoop.sourceNodeId).y - effectiveGraph.nodes.find(
      (node) => node.id === alterLoop.sourceNodeId,
    )!.y,
  };
  assert(Math.abs((canonicalLoop.controlX - effectiveLoop.controlX) - alterDisplacement.x) < 1e-9);
  assert(Math.abs((canonicalLoop.controlY - effectiveLoop.controlY) - alterDisplacement.y) < 1e-9);

  // E5: certified handoff semantics and endpoints remain exact.
  const canonicalHandoff = canonicalGraph.edges.find((edge) => edge.id === handoff.id)!;
  const effectiveHandoff = effectiveGraph.edges.find((edge) => edge.id === handoff.id)!;
  assert.equal(effectiveHandoff.routing, 'SCOPE_HANDOFF');
  assert.equal(effectiveHandoff.isScopeHandoff, true);
  assert.equal(effectiveHandoff.evidenceKind, 'CERTIFIED_SCOPE_HANDOFF');
  assert.equal(effectiveHandoff.source, canonicalHandoff.source);
  assert.equal(effectiveHandoff.target, canonicalHandoff.target);
  assert.notDeepEqual(
    { x: effectiveHandoff.controlX, y: effectiveHandoff.controlY },
    { x: canonicalHandoff.controlX, y: canonicalHandoff.controlY },
  );

  // E6/E7/E8: persistence is exact-identity-only and malformed data is inert.
  const identity = createConstellationLayoutIdentity(canonicalGraph);
  assert.equal(identity.schemaVersion, MANUAL_CONSTELLATION_LAYOUT_SCHEMA);
  assert.equal(identity.persistenceEligible, true);
  const serialized = serializeConstellationLayout(identity, overrides);
  assert(serialized);
  assert.deepEqual(parseConstellationLayout(serialized, identity), overrides);
  const storage = fakeStorage();
  assert.equal(persistConstellationLayout(storage, identity, overrides), true);
  assert.deepEqual(loadConstellationLayout(storage, identity), overrides);
  const policyMismatch = createConstellationLayoutIdentity({
    ...canonicalGraph,
    sourcePolicyFingerprint: `${canonicalGraph.sourcePolicyFingerprint}-different`,
  });
  const topologyMismatch = createConstellationLayoutIdentity({
    ...canonicalGraph,
    topology: { ...canonicalGraph.topology, fingerprint: 'topology-different' },
  });
  const nodeMismatch = createConstellationLayoutIdentity({
    ...canonicalGraph,
    nodes: canonicalGraph.nodes.slice(1),
  });
  assert.deepEqual(parseConstellationLayout(serialized, policyMismatch), {});
  assert.deepEqual(parseConstellationLayout(serialized, topologyMismatch), {});
  assert.deepEqual(parseConstellationLayout(serialized, nodeMismatch), {});
  assert.deepEqual(parseConstellationLayout('{not-json', identity), {});
  assert.deepEqual(parseConstellationLayout(JSON.stringify({
    schemaVersion: 'WRONG', identity: {}, positions: overrides,
  }), identity), {});
  assert.deepEqual(parseConstellationLayout(serialized.replace('"positions":', '"missingPositions":'), identity), {});
  const firstOverrideId = Object.keys(overrides)[0];
  const nonFinite = JSON.parse(serialized) as JsonRecord;
  (nonFinite.positions as JsonRecord)[firstOverrideId] = { x: Number.POSITIVE_INFINITY, y: 0 };
  assert.equal(parseConstellationLayout(JSON.stringify(nonFinite), identity)[firstOverrideId], undefined);
  const withUnknown = JSON.parse(serialized) as JsonRecord;
  (withUnknown.positions as JsonRecord).unknown_node = { x: 1, y: 2 };
  const sanitizedUnknown = parseConstellationLayout(JSON.stringify(withUnknown), identity);
  assert.equal(sanitizedUnknown.unknown_node, undefined);
  assert.deepEqual(sanitizedUnknown[firstOverrideId], overrides[firstOverrideId]);

  // E9: camera-only work has no path into persistence; removing the current
  // layout key restores canonical geometry.
  const beforeResetView = loadConstellationLayout(storage, identity);
  assert.deepEqual(beforeResetView, overrides);
  assert.equal(removePersistedConstellationLayout(storage, identity), true);
  assert.deepEqual(loadConstellationLayout(storage, identity), {});
  assert.equal(createEffectiveConstellationGraph(canonicalGraph, {}), canonicalGraph);

  // E10: Fit All uses effective bounds, including a node far outside the
  // automatic semantic layout and the label-aware node allowance.
  const outlierNode = canonicalGraph.nodes.find((node) => node.kind !== 'TERMINAL_SUCCESS')!;
  const outlierOverrides = {
    [outlierNode.id]: {
      x: canonicalGraph.bounds.maxX + 1_200,
      y: canonicalGraph.bounds.minY - 720,
    },
  };
  const outlierGraph = createEffectiveConstellationGraph(canonicalGraph, outlierOverrides);
  const fitBounds = constellationGraphBounds(outlierGraph, 'ALL');
  const outlier = outlierGraph.nodes.find((node) => node.id === outlierNode.id)!;
  assert(fitBounds.maxX >= outlier.x + outlier.radius);
  assert(fitBounds.minY <= outlier.y - outlier.radius);
  assert.equal(outlierGraph.layoutEvidence.labelAwareFit, true);

  const evidence = {
    phase: '3E',
    generatedAt: new Date().toISOString(),
    fixture: metadata,
    gates: {
      E1_truthPreservation: {
        topologyFingerprintBefore: flow.topology.fingerprint,
        topologyFingerprintAfter: effectiveGraph.topology.fingerprint,
        exactFlowFingerprintBefore: flow.aggregation.exactFlowFingerprint,
        exactFlowFingerprintAfter: flow.aggregation.exactFlowFingerprint,
        flowTruthSha256: sha256(flowTruthBefore),
        graphTruthSha256: sha256(graphTruthBefore),
        reconciliationCertified: flow.reconciliation.certified,
      },
      E2_geometryMovement: { overrides, movedNodeCount: Object.keys(overrides).length },
      E3_liveEdgeGeometry: {
        edgeId: connected.id,
        before: { controlX: connected.controlX, controlY: connected.controlY },
        after: { controlX: effectiveConnected.controlX, controlY: effectiveConnected.controlY },
      },
      E4_selfLoopAttachment: {
        edgeId: alterLoop.id,
        nodeId: alterLoop.sourceNodeId,
        before: { controlX: canonicalLoop.controlX, controlY: canonicalLoop.controlY },
        after: { controlX: effectiveLoop.controlX, controlY: effectiveLoop.controlY },
      },
      E5_certifiedHandoff: {
        edgeId: handoff.id,
        routing: effectiveHandoff.routing,
        evidenceKind: effectiveHandoff.evidenceKind,
      },
      E6_persistenceRoundTrip: {
        schema: identity.schemaVersion,
        identity: identity.serialized,
        storageKey: identity.storageKey,
        overrideCount: Object.keys(overrides).length,
      },
      E7_mismatchRejection: { policy: true, topology: true, nodeIdentity: true },
      E8_malformedStorage: { malformed: true, nonFinite: true, missing: true, unknownDiscarded: true },
      E9_resetSemantics: { resetViewPreserved: true, resetLayoutRemoved: true },
      E10_fitAllEffectiveBounds: { fitBounds, outlier: { id: outlier.id, x: outlier.x, y: outlier.y } },
    },
    prohibitions: {
      unitTestsAddedOrRun: false,
      mechanicsChanged: false,
      policyFlowMutated: false,
      solverIdentityChanged: false,
      hardcodedWinner: false,
      craftSpecificProductionBranch: false,
      marketFracturedRanking: false,
      longSuiteRun: false,
    },
  };
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  const lines = [
    'PHASE 3E MANUAL CONSTELLATION LAYOUT DIAGNOSTIC',
    `E1 truth=${flow.topology.fingerprint}/${flow.aggregation.exactFlowFingerprint}; reconciliation=PASS`,
    `E2 moved=${Object.keys(overrides).length}; untouched=canonical`,
    `E3 edge=${connected.id}; live geometry=PASS`,
    `E4 Alter self-loop=${alterLoop.id}; attachment=PASS`,
    `E5 handoff=${handoff.id}; ${effectiveHandoff.evidenceKind}/${effectiveHandoff.routing}=PASS`,
    `E6 schema=${identity.schemaVersion}; round-trip=PASS`,
    'E7 policy/topology/node mismatch rejection=PASS',
    'E8 malformed/non-finite/missing/unknown storage handling=PASS',
    'E9 Reset View preserves; Reset Layout removes=PASS',
    `E10 outlier=${outlier.id}; effective Fit All bounds=PASS`,
    `Evidence SHA-256: ${sha256(JSON.stringify(evidence))}`,
    'Unit tests added/run: NO',
    'EXTENDED/nightly/legacy/long-soak run: NO',
  ];
  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(lines.join('\n'));
}

if (process.argv.includes('--refresh-fixture')) refreshFixture();
else runDiagnostic();
