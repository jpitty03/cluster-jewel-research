import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import type {
  FullRouteActionEvidence,
  MethodFamilyResult,
} from '../crafting-engine/src/domain/MethodFamily.ts';
import type { PolicyFlowSummary } from '../crafting-engine/src/domain/PolicyFlow.ts';
import {
  buildVisualizationGraph,
  type VisualizationGraph,
} from '../crafting-engine/src/domain/VisualizationGraph.ts';
import {
  OptimizerService,
  type CoreRecommendationSnapshot,
  type OptimizeCraftInput,
  type OptimizeCraftResult,
} from '../crafting-engine/src/service/optimizerService.ts';
import { checkRequiredActionEvidence } from '../crafting-engine/src/service/policyAdmissibility.ts';
import {
  RequestLocalExecutablePolicyRegistry,
  type ExecutablePolicyRegistryIdentity,
} from '../crafting-engine/src/service/requestPolicyRegistry.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const evidenceDirectory = join(repositoryRoot, 'quality-lab', 'reports', 'evidence');
const diagnosticEvidencePath = join(evidenceDirectory, 'phase3d-full-route-budget-scope-diagnostic.json');
const textEvidencePath = join(repositoryRoot, 'output-phase3d-full-route-budget-scope-diagnostic.txt');
const fieldFlowArtifactPath = join(evidenceDirectory, 'phase3b-field-three-notable.json');
const fieldFlowMetadataPath = join(
  repositoryRoot,
  'quality-lab',
  'fixtures',
  'policy-flow-phase3d-field-v1.json',
);
const stressFlowArtifactPath = join(
  repositoryRoot,
  'quality-lab',
  'fixtures',
  'policy-flow-phase3c-large-v1-artifact.json',
);

const FIELD_INPUT_BASE: Omit<OptimizeCraftInput, 'compareMethodFamilies'> = {
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
      'Phase 3D frozen post-Phase-3C Primordial Bond + Renewal + Rotten Claws field fixture',
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
};

function stableJson(value: unknown): string {
  if (value === undefined) return '"__undefined__"';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => key !== 'aggregationMs')
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(',')}}`;
}

function sha256(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

function family(
  result: OptimizeCraftResult,
  predicate: (candidate: MethodFamilyResult) => boolean,
  label: string,
): MethodFamilyResult {
  const found = result.methodPortfolio?.find(predicate);
  assert(found, `Phase 3D field result omitted ${label}`);
  return found;
}

function snapshot(result: OptimizeCraftResult): CoreRecommendationSnapshot {
  const found = result.search.coreRecommendationSnapshot;
  assert(found, 'D7 result omitted the frozen core recommendation snapshot');
  return found;
}

function evidenceReconciliation(result: OptimizeCraftResult): Record<string, unknown> {
  let evidenceFamilies = 0;
  let evidenceEntries = 0;
  for (const method of result.methodPortfolio ?? []) {
    const evidence = method.fullRouteActionEvidence;
    if (!evidence) continue;
    evidenceFamilies++;
    assert.equal(evidence.version, 'FULL_ROUTE_ACTION_EVIDENCE_V1');
    assert(evidence.entries.length > 0, `${method.spec.id} has empty full-route evidence`);
    for (const entry of evidence.entries) {
      evidenceEntries++;
      assert.equal(entry.physicalAcquisitionIdentity, evidence.physicalAcquisitionIdentity);
      assert.equal(entry.policySessionIdentity, evidence.policySessionIdentity);
      assert.equal(entry.sourcePolicyFingerprint, evidence.sourcePolicyFingerprint);
      assert(Number.isFinite(entry.expectedCount) && entry.expectedCount > 0);
      assert(Number.isFinite(entry.expectedCostChaos) && entry.expectedCostChaos >= 0);
      assert(entry.scope === 'ACQUISITION' || entry.scope === 'DOWNSTREAM');
    }
    assert.deepEqual(
      method.requiredActionEvidenceChecks ?? [],
      checkRequiredActionEvidence(method.spec, evidence),
      `${method.spec.id} cached required-action checks diverged from canonical evidence`,
    );
  }
  assert(evidenceFamilies > 0, 'D2 no method family published full-route evidence');
  return { evidenceFamilies, evidenceEntries };
}

function actionEvidenceDiagnostics(result: OptimizeCraftResult): Record<string, unknown> {
  const primordialFracture = family(
    result,
    (candidate) => candidate.spec.kind === 'SELF_FRACTURE' &&
      candidate.spec.name.includes('Primordial Bond'),
    'Self-fracture Primordial Bond family',
  );
  const fractureCheck = primordialFracture.requiredActionEvidenceChecks?.find(
    (check) => check.actionId === 'fracturing_orb',
  );
  assert(fractureCheck, 'D3 Primordial self-fracture family omitted the Fracturing Orb check');
  assert.equal(fractureCheck.requiredScope, 'ACQUISITION');
  assert.equal(fractureCheck.observed, true);
  assert(fractureCheck.observedExpectedCount > 0);
  assert(fractureCheck.observedScopes.every((scope) => scope === 'ACQUISITION'));
  if (primordialFracture.equivalentToSelectedPolicy === true) {
    const audit = primordialFracture.selectedOpenPolicyAdmissibility;
    assert(audit, 'D3 equivalent self-fracture policy omitted selected-policy audit');
    assert(!audit.failures.some((failure) =>
      failure.code === 'REQUIRED_ACTION_NOT_OBSERVED' &&
      failure.actionId === 'fracturing_orb'
    ), 'D3 SAME_AS_SELECTED still contradicts acquisition Fracturing Orb evidence');
  }

  const conventional = family(
    result,
    (candidate) => candidate.spec.kind === 'CONVENTIONAL',
    'Conventional family',
  );
  const selectedIsSelfFracture = result.presentation.acquisitionContext.kind === 'SELF_FRACTURE';
  const selectedConventionalAudit = conventional.selectedOpenPolicyAdmissibility;
  if (selectedIsSelfFracture) {
    assert(selectedConventionalAudit && !selectedConventionalAudit.admissible);
    assert(selectedConventionalAudit.failures.some((failure) =>
      failure.code === 'ACQUISITION_KIND_MISMATCH' ||
      failure.code === 'ACQUISITION_IDENTITY_MISMATCH' ||
      failure.code === 'ACQUISITION_COST_MISMATCH'
    ), 'D4 Conventional admitted the selected self-fracture acquisition');
  } else {
    const cleanToFractureAudit = primordialFracture.knownPolicyAdmissibility;
    assert(cleanToFractureAudit && !cleanToFractureAudit.admissible);
    assert(cleanToFractureAudit.failures.some((failure) =>
      failure.code === 'ACQUISITION_KIND_MISMATCH' ||
      failure.code === 'ACQUISITION_IDENTITY_MISMATCH' ||
      failure.code === 'ACQUISITION_COST_MISMATCH'
    ), 'D4 acquisition-constraint negative control was weakened');
  }

  const harvestFamilies = (result.methodPortfolio ?? []).filter((candidate) =>
    candidate.spec.kind === 'HARVEST'
  );
  assert(harvestFamilies.length > 0, 'D5 Harvest families are absent');
  for (const harvest of harvestFamilies) {
    const requirements = harvest.spec.requiredActionEvidence ?? [];
    assert(requirements.length > 0);
    assert(requirements.every((requirement) => requirement.scope === 'DOWNSTREAM'));
  }
  const absentHarvestControl = harvestFamilies.find((candidate) =>
    candidate.selectedOpenPolicyAdmissibility?.failures.some((failure) =>
      failure.code === 'REQUIRED_ACTION_NOT_OBSERVED'
    )
  );
  assert(absentHarvestControl, 'D5 no non-Harvest policy exercised the downstream negative control');

  const combinedFamilies = (result.methodPortfolio ?? []).filter((candidate) =>
    candidate.spec.kind === 'SELF_FRACTURE_HARVEST'
  );
  assert(combinedFamilies.length > 0, 'D6 combined self-fracture + Harvest families are absent');
  for (const combined of combinedFamilies) {
    const requirements = combined.spec.requiredActionEvidence ?? [];
    assert(requirements.some((requirement) =>
      requirement.actionId === 'fracturing_orb' && requirement.scope === 'ACQUISITION'
    ));
    assert(requirements.some((requirement) =>
      requirement.actionId.startsWith('harvest_reforge_') && requirement.scope === 'DOWNSTREAM'
    ));
  }
  const combinedSpec = combinedFamilies[0].spec;
  const fractureEvidence = primordialFracture.fullRouteActionEvidence!;
  const combinedChecks = checkRequiredActionEvidence(combinedSpec, fractureEvidence);
  assert.equal(combinedChecks.find((check) => check.actionId === 'fracturing_orb')?.observed, true);
  const requiredHarvestId = (combinedSpec.requiredActionEvidence ?? [])
    .find((requirement) => requirement.scope === 'DOWNSTREAM')!.actionId;
  const withoutHarvest = combinedChecks.find((check) => check.actionId === requiredHarvestId);
  if (!fractureEvidence.entries.some((entry) =>
    entry.actionId === requiredHarvestId && entry.scope === 'DOWNSTREAM'
  )) assert.equal(withoutHarvest?.observed, false);
  const wrongStageEvidence: FullRouteActionEvidence = {
    ...fractureEvidence,
    entries: fractureEvidence.entries.map((entry) => entry.actionId === 'fracturing_orb'
      ? { ...entry, scope: 'DOWNSTREAM' as const }
      : { ...entry }),
  };
  assert.equal(
    checkRequiredActionEvidence(combinedSpec, wrongStageEvidence)
      .find((check) => check.actionId === 'fracturing_orb')?.observed,
    false,
    'D6 downstream evidence incorrectly satisfied an acquisition-scoped mechanic',
  );

  return {
    selectedAcquisitionKind: result.presentation.acquisitionContext.kind,
    primordialFracture: {
      familyId: primordialFracture.spec.id,
      status: primordialFracture.status,
      equivalentToSelectedPolicy: primordialFracture.equivalentToSelectedPolicy,
      fullRouteU: primordialFracture.fullRouteU,
      fractureCheck,
      selectedOpenAudit: primordialFracture.selectedOpenPolicyAdmissibility,
    },
    conventionalNegativeControl: selectedIsSelfFracture
      ? selectedConventionalAudit
      : primordialFracture.knownPolicyAdmissibility,
    harvestFamilyCount: harvestFamilies.length,
    combinedFamilyCount: combinedFamilies.length,
    combinedChecks,
  };
}

function coreAbDiagnostics(
  disabled: CoreRecommendationSnapshot,
  enabled: CoreRecommendationSnapshot,
): Record<string, unknown> {
  assert.equal(disabled.compareMethodFamiliesRequested, false);
  assert.equal(enabled.compareMethodFamiliesRequested, true);
  assert.deepEqual(enabled.coreEnvelope, disabled.coreEnvelope,
    'D7 Compare Methods changed the planned core envelope');
  assert.equal(enabled.coreEnvelope.deadlineFraction, 0.85);
  const exactWork = disabled.statesExpanded === enabled.statesExpanded &&
    disabled.retainedStates === enabled.retainedStates &&
    disabled.retainedStateFingerprint === enabled.retainedStateFingerprint;
  if (exactWork) {
    assert.deepEqual(enabled.candidateExecutableUChaos, disabled.candidateExecutableUChaos);
    assert.equal(enabled.selectedExecutableUChaos, disabled.selectedExecutableUChaos);
    assert.equal(enabled.stopReason, disabled.stopReason);
    assert.equal(enabled.canonicalPolicyFingerprint, disabled.canonicalPolicyFingerprint);
  } else {
    assert(enabled.statesExpanded >= disabled.statesExpanded,
      'D7 family-enabled core expanded fewer states');
    assert((enabled.selectedExecutableUChaos ?? Infinity) <=
      (disabled.selectedExecutableUChaos ?? Infinity) + 0.05,
    'D7 family-enabled core executable U regressed');
    const enabledCandidates = new Map(enabled.candidateExecutableUChaos.map((entry) => [
      entry.candidateId,
      entry.fullRouteUChaos,
    ]));
    for (const entry of disabled.candidateExecutableUChaos) {
      assert((enabledCandidates.get(entry.candidateId) ?? Infinity) <= entry.fullRouteUChaos + 0.05,
        `D7 family-enabled core regressed ${entry.candidateId}`);
    }
  }
  return { mode: exactWork ? 'EXACT_CORE_STATE_SET' : 'STRONGER_MONOTONE_CORE', disabled, enabled };
}

function registryDiagnostics(result: OptimizeCraftResult): Record<string, unknown> {
  const summary = result.requestPolicyRegistry;
  assert(summary, 'D8 result omitted request-local policy registry');
  assert.equal(summary.monotone, true);
  assert(summary.registeredPolicyCount > 0);
  const identity: ExecutablePolicyRegistryIdentity = {
    targetIdentity: 'diagnostic-target',
    mechanicsSessionIdentity: 'diagnostic-session',
    economicsEffortIdentity: 'diagnostic-economics',
    physicalAcquisitionIdentity: 'diagnostic-physical-state',
    acquisitionKind: 'CLEAN',
    canonicalPolicyFingerprint: 'diagnostic-policy-a',
  };
  const registry = new RequestLocalExecutablePolicyRegistry<{ label: string }>();
  registry.register({
    familyId: 'diagnostic-family',
    bundleId: 'better-revalidated',
    fullRouteUChaos: 100,
    identity,
    validationSource: 'FAMILY_ADMISSIBILITY_REVALIDATION',
    payload: { label: 'better' },
  });
  registry.register({
    familyId: 'diagnostic-family',
    bundleId: 'worse-later-search',
    fullRouteUChaos: 120,
    identity: { ...identity, canonicalPolicyFingerprint: 'diagnostic-policy-b' },
    validationSource: 'SOLVER_CERTIFICATION',
    payload: { label: 'worse' },
  });
  const control = registry.summary();
  assert.equal(control.monotone, true);
  assert.equal(control.familyIncumbents[0].fullRouteUChaos, 100);
  assert.equal(control.events[1].outcome, 'RETAINED_BETTER_INCUMBENT');
  assert.equal(control.events[1].resultingFamilyUChaos, 100);
  return { production: summary, controlledWorseLaterCandidate: control };
}

function budgetDiagnostics(result: OptimizeCraftResult): Record<string, unknown> {
  const ledger = result.search.requestBudget.ledger;
  assert(ledger, 'D9 result omitted request budget ledger');
  assert.equal(ledger.clock, 'PERFORMANCE_NOW_MONOTONIC_REQUEST_RELATIVE');
  assert.equal(ledger.reconciled, true);
  assert(ledger.unclassifiedMs <= 2);
  const stages = new Set(ledger.entries.map((entry) => entry.stage));
  for (const stage of [
    'CORE_PORTFOLIO_SEARCH',
    'ACQUISITION_SYNTHESIS',
    'METHOD_FAMILY_SEARCH',
    'POLICY_ADMISSIBILITY_REVALIDATION',
    'POLICY_EQUIVALENCE_PRESENTATION',
    'PROOF_BOUND_WORK',
    'HOST_SERIALIZATION_RESERVE',
  ]) assert(stages.has(stage as never), `D9 ledger omitted ${stage}`);
  const exclusive = ledger.entries.filter((entry) => entry.accounting === 'EXCLUSIVE')
    .reduce((sum, entry) => sum + entry.usedWallTimeMs, 0);
  assert(Math.abs(exclusive - ledger.exclusiveAccountedMs) <= 1e-6);
  for (const entry of ledger.entries) {
    assert(entry.startedAtRequestMs >= 0);
    assert(entry.finishedAtRequestMs >= entry.startedAtRequestMs);
    assert(entry.usedWallTimeMs >= 0);
    assert(entry.remainingRequestMsAtFinish <= entry.remainingRequestMsAtStart + 1e-6);
  }
  const core = snapshot(result);
  assert.equal(ledger.coreDeadlineAtRequestMs, core.coreEnvelope.deadlineAtRequestMs);
  if (core.stopReason === 'HOST_RESERVE') {
    assert(ledger.hostReserveEnteredAtRequestMs !== undefined);
    assert(ledger.explanation.some((line) => line.includes('HOST_RESERVE')) ||
      ledger.explanation.some((line) => line.includes('Core stopped')));
  }
  return {
    ledger,
    historicalFieldObservation: {
      statesExpanded: 3_334,
      stopReason: 'HOST_RESERVE',
      compareMethodFamilies: true,
      priorCoreDeadlineFraction: 0.48,
      rootCause:
        'The pre-Phase-3D objectiveNeedsUnifiedFamilies expression included compareMethodFamilies, reducing the CHEAPEST core deadline fraction from 0.85 to 0.48.',
    },
    currentCore: core,
    recoveredPlannedCoreEnvelopeMs:
      Math.floor(ledger.engineDeadlineMs * 0.85) - Math.floor(ledger.engineDeadlineMs * 0.48),
  };
}

function familyProofDiagnostics(result: OptimizeCraftResult): Record<string, unknown> {
  const imported = (result.methodPortfolio ?? []).filter((candidate) =>
    candidate.incumbentSource === 'ADMISSIBLE_KNOWN_POLICY' ||
    candidate.incumbentSource === 'IMPROVED_FROM_KNOWN_POLICY'
  );
  const revalidated = (result.methodPortfolio ?? []).filter((candidate) =>
    candidate.knownPolicyAdmissibility?.admissible === true ||
    candidate.selectedOpenPolicyAdmissibility?.admissible === true
  );
  assert(revalidated.length > 0, 'D10 no admissible fixed-policy revalidation was retained');
  for (const candidate of imported) {
    assert(candidate.familySearchStatus !== undefined);
    if (candidate.familySearchStatus === 'OPTIMAL_PROVEN') {
      assert(candidate.policyHealth?.proofLevel.includes('OPTIMAL'),
        'D10 imported incumbent upgraded family optimality without independent proof');
    }
  }
  const executableButUnproven = (result.methodPortfolio ?? []).filter((candidate) =>
    candidate.fullRouteU !== undefined && candidate.familySearchStatus === 'BEST_FOUND_UNPROVEN'
  );
  assert(executableButUnproven.length > 0,
    'D10 field result did not preserve an executable U separately from family optimum proof');
  return {
    imported: imported.map((candidate) => ({
      familyId: candidate.spec.id,
      incumbentSource: candidate.incumbentSource,
      policyExecutionStatus: candidate.policyHealth?.selectedPolicyStatus,
      policyProofLevel: candidate.policyHealth?.proofLevel,
      familySearchStatus: candidate.familySearchStatus,
      fullRouteU: candidate.fullRouteU,
    })),
    revalidated: revalidated.map((candidate) => ({
      familyId: candidate.spec.id,
      incumbentSource: candidate.incumbentSource,
      policyExecutionStatus: candidate.policyHealth?.selectedPolicyStatus,
      familySearchStatus: candidate.familySearchStatus,
      fullRouteU: candidate.fullRouteU,
    })),
    executableButUnproven: executableButUnproven.map((candidate) => ({
      familyId: candidate.spec.id,
      incumbentSource: candidate.incumbentSource,
      policyExecutionStatus: candidate.policyHealth?.selectedPolicyStatus,
      policyProofLevel: candidate.policyHealth?.proofLevel,
      familySearchStatus: candidate.familySearchStatus,
      fullRouteU: candidate.fullRouteU,
    })),
  };
}

function loadFlow(path: string, selector: 'flow' | 'policyFlow'): PolicyFlowSummary {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  const flow = parsed[selector];
  assert(flow && typeof flow === 'object');
  return flow as PolicyFlowSummary;
}

function topologyProjection(flow: PolicyFlowSummary): string {
  return stableJson({
    nodes: flow.nodes.map((node) => [node.id, node.expectedVisits, node.occupancyShare]).sort(),
    edges: flow.edges.map((edge) => [
      edge.id,
      edge.sourceNodeId,
      edge.targetNodeId,
      edge.conditionalProbability,
      edge.expectedFlow,
      edge.evidenceKind,
    ]).sort(),
    topology: flow.topology,
    reconciliation: flow.reconciliation,
  });
}

function graphDiagnostics(
  flow: PolicyFlowSummary,
  acquisitionKind: 'CLEAN' | 'SELF_FRACTURE' | 'OTHER',
): { graph: VisualizationGraph; evidence: Record<string, unknown> } {
  const before = topologyProjection(flow);
  const graph = buildVisualizationGraph(flow, {
    width: 1_000,
    height: 760,
    acquisitionContext: { kind: acquisitionKind },
  });
  const acquisitionNodes = graph.nodes.filter((node) => node.scope === 'ACQUISITION');
  const downstreamNodes = graph.nodes.filter((node) => node.scope === 'DOWNSTREAM');
  assert(acquisitionNodes.every((node) =>
    node.progressLabel.startsWith('Prep target') ||
    node.progressLabel.startsWith('Fracture prep complete')
  ), 'D11 acquisition node used final-target progress copy');
  assert(acquisitionNodes.every((node) => !node.progressLabel.startsWith('Final targets')));
  assert(downstreamNodes.every((node) =>
    node.progressLabel.startsWith('Final targets') || node.progressLabel === 'Final target complete'
  ));
  const handoffs = flow.edges.filter((edge) => edge.evidenceKind === 'CERTIFIED_SCOPE_HANDOFF');
  const renderedHandoffs = graph.edges.filter((edge) => edge.isScopeHandoff);
  assert.deepEqual(
    renderedHandoffs.map((edge) => [edge.id, edge.source, edge.target, edge.probability, edge.expectedVisits]),
    handoffs.map((edge) => [
      edge.id,
      edge.sourceNodeId,
      edge.targetNodeId,
      edge.conditionalProbability,
      edge.expectedFlow,
    ]),
    'D12 certified handoff identity changed in visualization',
  );
  assert(renderedHandoffs.every((edge) => edge.routing === 'SCOPE_HANDOFF'));
  assert.equal(graph.layoutEvidence.labelAwareFit, true);
  assert(graph.layoutEvidence.fitMarginsPx.left >= 150);
  assert(graph.layoutEvidence.fitMarginsPx.right >= 150);
  assert(graph.layoutEvidence.fitMarginsPx.top >= 70);
  assert.equal(graph.nodes.length, flow.nodes.length);
  assert.equal(graph.edges.length, flow.edges.length);
  assert.deepEqual(
    graph.nodes.map((node) => [node.id, node.occupancyWeight]).sort(),
    flow.nodes.map((node) => [node.id, node.occupancyShare]).sort(),
  );
  assert.deepEqual(
    graph.edges.map((edge) => [edge.id, edge.source, edge.target, edge.probability, edge.expectedVisits]).sort(),
    flow.edges.map((edge) => [
      edge.id,
      edge.sourceNodeId,
      edge.targetNodeId,
      edge.conditionalProbability,
      edge.expectedFlow,
    ]).sort(),
  );
  assert.equal(topologyProjection(flow), before, 'D14 visualization mutated PolicyFlow');
  return {
    graph,
    evidence: {
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      topologyFingerprint: graph.topology.fingerprint,
      acquisitionNodes: acquisitionNodes.length,
      downstreamNodes: downstreamNodes.length,
      handoffEdges: renderedHandoffs.length,
      scopeEvidence: graph.scopeEvidence,
      layoutEvidence: graph.layoutEvidence,
      bounds: graph.bounds,
      exactPolicyFlowProjectionSha256: sha256(before),
    },
  };
}

function writeFieldFlowMetadata(flow: PolicyFlowSummary): Record<string, unknown> {
  const artifact = readFileSync(fieldFlowArtifactPath);
  const wrapper = JSON.parse(artifact.toString('utf8')) as Record<string, unknown>;
  const normalizedRequest = wrapper.input;
  const metadata = {
    fixtureId: 'policy-flow-phase3d-field-v1',
    fixtureVersion: 1,
    sourceAppCommit: 'Phase 3B retained real Worker flow reviewed by Phase 3D',
    normalizedRequest,
    selectedBundleId: flow.sourceBundleId,
    selectedPolicyFingerprint: flow.sourcePolicyFingerprint,
    policyFlowVersion: flow.version,
    topologyFingerprint: flow.topology.fingerprint,
    serializedSummary: {
      path: 'quality-lab/reports/evidence/phase3b-field-three-notable.json',
      selector: 'flow',
      artifactSha256: sha256(artifact),
      normalizedSummarySha256: sha256(stableJson(flow)),
      nodeCount: flow.nodes.length,
      edgeCount: flow.edges.length,
    },
    certificationScope:
      'Retained exact 23-node real self-fracture Worker PolicyFlow used for Phase 3D scope, handoff, and Fit All browser evidence.',
    limitations: [
      'The frozen renderer wrapper is harness-only.',
      'The graph retains the exact reviewed PolicyFlow; only the presentation context is supplied by the gate.',
      'The live frozen minion field Worker A/B remains authoritative for budget and family evidence.',
    ],
  };
  writeFileSync(fieldFlowMetadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return metadata;
}

function runDiagnostic(): void {
  const commonIdentity = sha256(stableJson(FIELD_INPUT_BASE));
  assert.equal(FIELD_INPUT_BASE.baseType, 'Large Cluster Jewel');
  assert.equal(FIELD_INPUT_BASE.clusterType, 'Minions deal 10% increased Damage');
  assert.deepEqual(FIELD_INPUT_BASE.target.requiredMods.map((entry) => entry.modId), [
    'Primordial Bond',
    'Renewal',
    'Rotten Claws',
  ]);
  assert.deepEqual(FIELD_INPUT_BASE.searchBudget, {
    preset: 'NORMAL',
    maxStates: 5_000,
    maxWallTimeMs: 30_000,
    maxExpansionRounds: 3,
  });

  let disabledResult: OptimizeCraftResult | undefined = new OptimizerService(
    new ClusterModRepository(),
  ).optimize({ ...FIELD_INPUT_BASE, compareMethodFamilies: false });
  const disabledSnapshot = snapshot(disabledResult);
  const disabledElapsedMs = disabledResult.search.totalElapsedMs;
  disabledResult = undefined;
  const enabledResult = new OptimizerService(new ClusterModRepository()).optimize({
    ...FIELD_INPUT_BASE,
    compareMethodFamilies: true,
  });
  const enabledSnapshot = snapshot(enabledResult);

  const d2 = evidenceReconciliation(enabledResult);
  const actions = actionEvidenceDiagnostics(enabledResult);
  const ab = coreAbDiagnostics(disabledSnapshot, enabledSnapshot);
  const registry = registryDiagnostics(enabledResult);
  const budget = budgetDiagnostics(enabledResult);
  const proofSeparation = familyProofDiagnostics(enabledResult);

  const fieldFlow = loadFlow(fieldFlowArtifactPath, 'flow');
  const stressFlow = loadFlow(stressFlowArtifactPath, 'policyFlow');
  assert.equal(fieldFlow.nodes.length, 23, 'D13 retained field flow is no longer 23 nodes');
  assert(stressFlow.nodes.length >= 40, 'D13 retained Phase 3C stress flow is below 40 nodes');
  const fieldGraph = graphDiagnostics(fieldFlow, 'SELF_FRACTURE');
  const stressGraph = graphDiagnostics(stressFlow, 'OTHER');
  assert(fieldGraph.graph.scopeEvidence.handoffEdgeIds.length > 0,
    'D12 23-node self-fracture flow omitted certified handoff');
  assert(stressGraph.graph.layoutEvidence.largeSccNodeCount >= 40,
    'D13 stress flow no longer exercises large-SCC layout');
  const rendererMetadata = writeFieldFlowMetadata(fieldFlow);

  const evidence = {
    phase: '3D',
    generatedAt: new Date().toISOString(),
    baseline: {
      implementationBaselineSha: 'debd00c',
      planReviewedBaselineSha: '621996531b025e4d7356fae7a9163c87f95723eb',
    },
    gates: {
      D1_frozenFieldRequest: {
        commonRequestIdentitySha256: commonIdentity,
        input: FIELD_INPUT_BASE,
      },
      D2_fullRouteEvidenceReconciled: d2,
      D3_D6_stageAwareMechanicsAndNegativeControls: actions,
      D7_compareMethodsCoreAB: {
        disabledElapsedMs,
        enabledElapsedMs: enabledResult.search.totalElapsedMs,
        ...ab,
      },
      D8_requestLocalIncumbentRegistry: registry,
      D9_requestBudgetLedger: budget,
      D10_executionVsFamilyOptimum: proofSeparation,
      D11_D14_constellationAndPolicyFlowTruth: {
        field23: fieldGraph.evidence,
        stress40Plus: stressGraph.evidence,
      },
    },
    rendererMetadata,
    currentField: {
      selectedRoute: enabledResult.recommended,
      selectedCostChaos: enabledResult.expectedCostChaos,
      recommendationStatus: enabledResult.recommendationStatus,
      policyFlowTopology: enabledResult.policyFlow?.topology,
      requestStopReason: enabledResult.search.requestStopReason,
    },
    prohibitions: {
      unitTestsAddedOrRun: false,
      mechanicsProbabilityChanged: false,
      hardcodedWinner: false,
      craftSpecificProductionBranch: false,
      weakenedStateIdentity: false,
      marketFracturedRanking: false,
      extendedOrLegacySuiteRun: false,
    },
  };
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(diagnosticEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  const lines = [
    'PHASE 3D FULL-ROUTE EVIDENCE + BUDGET ISOLATION + CONSTELLATION SCOPE DIAGNOSTIC',
    `D1 request identity=${commonIdentity}`,
    `D2 evidence families=${d2.evidenceFamilies}; entries=${d2.evidenceEntries}`,
    `D3-D6 selected acquisition=${actions.selectedAcquisitionKind}; stage controls=PASS`,
    `D7 mode=${ab.mode}; false=${disabledSnapshot.statesExpanded} states/${disabledSnapshot.selectedExecutableUChaos}c; ` +
      `true=${enabledSnapshot.statesExpanded} states/${enabledSnapshot.selectedExecutableUChaos}c`,
    `D8 policies=${enabledResult.requestPolicyRegistry?.registeredPolicyCount}; monotone=${enabledResult.requestPolicyRegistry?.monotone}`,
    `D9 core=${enabledSnapshot.statesExpanded} states; stop=${enabledSnapshot.stopReason}; ` +
      `deadline=${enabledSnapshot.coreEnvelope.allocatedWallTimeMs}ms`,
    `D10 policy/family proof separation=PASS`,
    `D11-D14 field=${fieldGraph.graph.nodes.length} nodes/${fieldGraph.graph.edges.length} edges/${fieldGraph.graph.scopeEvidence.handoffEdgeIds.length} handoff; ` +
      `stress=${stressGraph.graph.nodes.length} nodes/${stressGraph.graph.edges.length} edges`,
    `Evidence SHA-256: ${sha256(JSON.stringify(evidence))}`,
  ];
  writeFileSync(textEvidencePath, `${lines.join('\n')}\n`, 'utf8');
  console.log(lines.join('\n'));
}

runDiagnostic();
