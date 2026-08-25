import type { SolverContext } from '../domain/CraftAction.ts';
import type { ItemState } from '../domain/ItemState.ts';
import { getAllAffixes, getPhysicalStateSignature, normalizeItemState } from '../domain/ItemState.ts';
import type { PriceConfidence } from '../domain/PriceBook.ts';
import type { ModRequirement, TargetDefinition } from '../domain/TargetDefinition.ts';
import {
  getAllTargetModRequirements,
  matchesModRequirement,
} from '../domain/TargetDefinition.ts';
import { getCanonicalStateKey } from '../rules/actionDiscovery.ts';
import {
  CRAFT_MECHANICS,
  createHarvestReforgeMechanics,
  createRestartReacquireMechanic,
} from '../rules/actionRegistry.ts';
import type { SearchIntent } from '../service/searchRuntime.ts';
import {
  GenericSearchEngine,
  type ExpectedActionUsageResult,
  type MechanicsConfidenceResult,
  type PriceConfidenceResult,
} from './genericSearch.ts';
import {
  evaluateMandatoryMechanicsLowerBound,
  type MandatoryMechanicsLowerBoundResult,
} from './mandatoryMechanicsLowerBound.ts';

/**
 * Phase 2D executable acquisition synthesis.
 *
 * A fractured starting base is never treated as a market purchase during core route ranking.
 * Instead the reusable physical state is manufactured by the same shared `CraftMechanic`
 * registry the crafting policy uses: preparation (Transmutation / Alteration / Augmentation /
 * Regal / Exalt), the Fracturing Orb's authoritative uniform-over-affixes outcome distribution,
 * wrong-fracture recovery through modeled restart/reacquisition, and cleanup (Scour).
 *
 * Nothing in this module knows about any particular modifier, cluster, or historical craft.
 */

/**
 * Shared mechanic ids that may legally participate in manufacturing a fractured reusable base.
 * `restart_reacquire` is required: a wrong fracture is permanent on that physical item, so the
 * only modeled recovery is abandoning the attempt and paying for another clean base.
 * Annulment remains available to normal crafting, but is excluded here: before fracture it removes
 * progress that must be refilled, after a desired fracture Scour is strictly cheaper and complete,
 * and after a wrong fracture no removable-affix outcome can make a second fracture legal.
 */
export const DEFAULT_ACQUISITION_SYNTHESIS_ACTION_IDS: readonly string[] = [
  'transmutation_orb',
  'alteration_orb',
  'augmentation_orb',
  'regal_orb',
  'exalted_orb',
  'scouring_orb',
  'chaos_orb',
  'fracturing_orb',
  'restart_reacquire',
];

export const ACQUISITION_FRACTURE_PREPARATION_STATE_IDENTITY =
  'FRACTURE_PREPARATION_BISIMULATION_V1' as const;

/** Human-readable statement of what "the acquisition is finished" means to the solver. */
export const ACQUISITION_TERMINAL_STATE_SEMANTICS =
  'Terminal when the requested modifier is present AND fractured, and no unmatched removable ' +
  'explicit affix remains, so the resulting physical state is a legal reusable starting base for ' +
  'downstream crafting.';

export interface PhysicalStateRequirement {
  /** Generic mod requirement to fracture. No modifier id is ever assumed by this module. */
  fracturedMod: ModRequirement;
  /** Unmatched explicit affixes tolerated on the reusable base. Defaults to 0 (fully cleaned). */
  maxUnmatchedAffixes?: number;
  /** Display label only. */
  label?: string;
}

export interface AcquisitionSearchBudget {
  maxStates?: number;
  maxWallTimeMs?: number;
  maxExpansionRounds?: number;
}

export interface CleanBaseAcquisition {
  costChaos: number;
  confidence: PriceConfidence;
  provenance: string;
  label?: string;
}

export interface AcquisitionSynthesisRequest {
  cleanStartingState: ItemState;
  desiredPhysicalState: PhysicalStateRequirement;
  cleanBaseAcquisition: CleanBaseAcquisition;
  enabledActionIds?: readonly string[];
  searchBudget?: AcquisitionSearchBudget;
  includeHarvest?: boolean;
  harvestTags?: string[];
  allowResearchFallbackPrices?: boolean;
  searchIntent?: SearchIntent;
  continuationSession?: import('./genericSearch.ts').GenericSearchContinuationSession;
  persistentExpansion?: boolean;
  onProgress?: (event: import('./genericSearch.ts').SearchProgressEvent) => void;
}

export interface AcquisitionPolicyRule {
  stateKey: string;
  state: string;
  selectedActionId: string;
  selectedAction: string;
  expectedVisits: number;
  totalCostChaos: number | null;
}

export interface WrongFractureRecoverySummary {
  /** On-policy states holding a fracture that does not satisfy the request. */
  states: number;
  expectedVisits: number;
  /** Action ids the policy selects out of a wrong-fracture state, with expected visits. */
  recoveryActions: Array<{ actionId: string; actionName: string; expectedVisits: number }>;
  inPlaceResetAvailable: boolean;
  expectedRestarts: number;
  expectedRestartCostChaos: number;
  note: string;
}

export interface FractureOutcomeObservation {
  stateKey: string;
  state: string;
  affixesOnItem: number;
  desiredOutcomeProbability: number;
  wrongOutcomeProbability: number;
  expectedVisits: number;
}

export interface AcquisitionSynthesisResult {
  status: 'RESOLVED' | 'PROVISIONAL' | 'UNRESOLVED';
  /** Full cost of owning the reusable fractured base, including the first clean base purchase. */
  expectedCostChaos?: number;
  /** Expected spend from an already-owned clean base onward (currency plus restart reacquisitions). */
  expectedPreparationCostChaos?: number;
  expectedPhysicalActions?: number;
  expectedPreparationPhysicalActions?: number;
  estimatedManualTimeMs?: number;
  expectedPreparationManualTimeMs?: number;
  cleanBaseCostChaos: number;
  /** Optimistic lower bound on `expectedCostChaos` given the partially expanded graph. */
  lowerBoundChaos: number;
  lowerBoundEvidence: {
    cleanBaseCostChaos: number;
    partialGraphPreparationLowerBoundChaos: number;
    partialGraphLowerBoundChaos: number;
    mandatoryMechanicsPreparationLowerBoundChaos: number;
    mandatoryMechanicsLowerBoundChaos: number;
    combinedLowerBoundChaos: number;
    combinationRule: 'MAX_OF_ADMISSIBLE_BOUNDS';
    mechanics: MandatoryMechanicsLowerBoundResult;
    provenance: string;
  };
  terminalStateSemantics: string;
  acquisitionTarget: TargetDefinition;
  enabledActionIds: string[];
  modeledActionIds: string[];
  expectedActionUsage: ExpectedActionUsageResult[];
  expectedCurrencies: Record<string, number>;
  expectedRestarts: number;
  expectedRestartCostChaos: number;
  expectedFracturingOrbs: number;
  fractureOutcomes: FractureOutcomeObservation[];
  wrongFractureRecovery: WrongFractureRecoverySummary;
  policy: AcquisitionPolicyRule[];
  terminalPhysicalStateSignatures: string[];
  proof: {
    selectedPolicyStatus: string;
    proofLevel: string;
    globalOptimality: string;
    modeledActionOptimalityProven: boolean;
    unresolvedCompetitorCount: number;
    potentiallyCompetitiveUnresolvedCount: number;
    unresolvedCandidatesCouldBeatIncumbent: boolean;
  };
  risk: {
    selectedPolicyProper: boolean;
    terminalAbsorptionProbability: number;
    unresolvedOnPolicyProbability: number;
    onPolicyReachableStates: number;
    onPolicyTerminalStates: number;
    hasCycles: boolean;
  };
  solver: {
    bellmanIterations: number;
    bellmanConverged: boolean;
    occupancyIterations: number;
    occupancyConverged: boolean;
    reconciliationDifferenceChaos: number;
    costReconciled: boolean;
  };
  search: {
    statesExpanded: number;
    cumulativeExpansionWork: number;
    repeatedStatesExpanded: number;
    expansionRounds: number;
    expansionMode: string;
    seedStatesExpanded: number;
    newStatesByRound: number[];
    retainedStatesReusedByRound: number[];
    transitionDistributionsGenerated: number;
    transitionDistributionsGeneratedByRound: number[];
    previouslyExpandedNodesRevisited: number;
    previouslyExpandedNodesRevisitedByRound: number[];
    acquisitionFeasibilityStatesExpanded: number;
    interruptedStatesExpanded: number;
    elapsedMs: number;
    budgetExhausted: boolean;
    maxStates: number;
    graphHitStateLimit: boolean;
    graphHitWallTimeLimit: boolean;
    unexpandedProbabilityMass: number;
    canonicalStateIdentity: typeof ACQUISITION_FRACTURE_PREPARATION_STATE_IDENTITY;
  };
  priceConfidence: PriceConfidenceResult;
  mechanicsConfidence: MechanicsConfidenceResult;
  provenance: 'EXECUTABLE SEARCH-DERIVED SELF-FRACTURE';
  explanation: string;
}

export function describeModRequirement(requirement: ModRequirement): string {
  const parts: string[] = [];
  if (requirement.name) parts.push(requirement.name);
  if (requirement.modId) parts.push(requirement.modId);
  else if (requirement.modGroup) parts.push(requirement.modGroup);
  if (requirement.maxTierNumber !== undefined) parts.push(`<=T${requirement.maxTierNumber}`);
  if (requirement.minTierNumber !== undefined) parts.push(`>=T${requirement.minTierNumber}`);
  return parts.join(' ') || 'any modifier';
}

/**
 * Builds the sub-target that encodes the reusable physical state. The fracture flag is carried by
 * the shared `ModRequirement.mustBeFractured` contract, and cleanliness by the shared
 * `FinalStateConstraints.maxUnmatchedAffixes` contract, so terminality, canonical-state identity
 * and legality all stay inside existing engine semantics.
 */
export function buildAcquisitionTargetDefinition(
  requirement: PhysicalStateRequirement
): TargetDefinition {
  return {
    requiredMods: [{ ...requirement.fracturedMod, mustBeFractured: true }],
    finalStateConstraints: { maxUnmatchedAffixes: requirement.maxUnmatchedAffixes ?? 0 },
  };
}

/**
 * Correctness-scoped quotient for the single-mod fracture-acquisition subproblem.
 *
 * Target-absent states retain the full canonical identity because their modifier groups affect the
 * probability of first rolling the requested modifier. Once that modifier is present, non-target
 * filler identity cannot affect any enabled acquisition action's aggregate milestone transition:
 * additions advance the explicit-affix count, Fracture selects uniformly by count, Scour
 * removes every non-fractured filler, and restart returns to the exact clean state. Desired and
 * wrong fractures remain distinct. This collapses only bisimilar filler permutations; it does not
 * select an action or encode the fixed-policy diagnostic sequence.
 */
export function getAcquisitionFracturePreparationStateKey(
  state: ItemState,
  target: TargetDefinition
): string {
  const standardKey = getCanonicalStateKey(state, target);
  const requirements = getAllTargetModRequirements(target);
  const requirement = requirements.length === 1 ? requirements[0] : undefined;
  const isExactAcquisitionShape =
    requirement?.mustBeFractured === true &&
    target.requiredMods.length === 1 &&
    target.outcomeBranches === undefined &&
    target.acceptableAnyOf === undefined &&
    target.finalRollRequirements === undefined &&
    target.requiredRarity === undefined &&
    target.finalStateConstraints?.maxUnmatchedAffixes === 0;
  if (!requirement || !isExactAcquisitionShape) return standardKey;

  const desiredUnfractured: ModRequirement = {
    ...requirement,
    mustBeFractured: undefined,
  };
  const affixes = getAllAffixes(state);
  const desired = affixes.find((mod) => matchesModRequirement(mod, desiredUnfractured));
  const fractured = affixes.filter((mod) => mod.isFractured);
  if (!desired && fractured.length === 0) return standardKey;

  const fractureStatus = desired?.isFractured
    ? 'DESIRED_FRACTURED'
    : fractured.length > 0
      ? `WRONG_FRACTURED_TARGET_${desired ? 'PRESENT' : 'ABSENT'}`
      : 'DESIRED_UNFRACTURED';
  return [
    ACQUISITION_FRACTURE_PREPARATION_STATE_IDENTITY,
    state.baseType,
    state.clusterType,
    state.itemLevel,
    state.passiveCount ?? '',
    state.rarity,
    `affixes=${affixes.length}`,
    fractureStatus,
    `influenced=${state.flags?.influenced === true}`,
    `synthesised=${state.flags?.synthesised === true}`,
  ].join('|');
}

function describeState(state: ItemState): string {
  const affixes = getAllAffixes(state);
  if (affixes.length === 0) return `${state.rarity} (no explicits)`;
  return `${state.rarity}: ${affixes
    .map((mod) => `${mod.isFractured ? 'FRACTURED ' : ''}${mod.name} (T${mod.tier})`)
    .join(' + ')}`;
}

function finiteOrUndefined(value: number): number | undefined {
  return Number.isFinite(value) ? value : undefined;
}

/**
 * Solves "how do I end up owning this fractured physical state" as an ordinary stochastic
 * shortest-path problem over the shared mechanic registry.
 */
export function synthesizeAcquisition(
  context: SolverContext,
  request: AcquisitionSynthesisRequest
): AcquisitionSynthesisResult {
  const acquisitionTarget = buildAcquisitionTargetDefinition(request.desiredPhysicalState);
  const cleanStartingState = normalizeItemState(request.cleanStartingState);
  const enabledActionIds = [
    ...(request.enabledActionIds ?? DEFAULT_ACQUISITION_SYNTHESIS_ACTION_IDS),
  ];
  const budget = request.searchBudget ?? {};
  const cleanBaseCostChaos = request.cleanBaseAcquisition.costChaos;
  const restartReacquire = {
    destination: cleanStartingState,
    acquisitionCostChaos: cleanBaseCostChaos,
    confidence: request.cleanBaseAcquisition.confidence,
    provenance: request.cleanBaseAcquisition.provenance,
    label: request.cleanBaseAcquisition.label ?? 'Abandon attempt and reacquire a clean base',
  };

  const engine = new GenericSearchEngine(
    { ...context, target: acquisitionTarget },
    acquisitionTarget,
    {
      allowResearchFallbackPrices: request.allowResearchFallbackPrices ?? true,
      enabledActionIds,
      includeHarvest: request.includeHarvest ?? false,
      harvestTags: request.harvestTags,
      prioritizeTargetProgress: true,
      canonicalStateKey: getAcquisitionFracturePreparationStateKey,
      searchIntent: request.searchIntent ?? 'RECOMMEND',
      restartReacquire,
      maxStates: budget.maxStates,
      maxWallTimeMs: budget.maxWallTimeMs,
      maxExpansionRounds: budget.maxExpansionRounds,
      persistentExpansion: request.persistentExpansion ?? true,
      continuationSession: request.continuationSession,
      recommendationRefinementRounds: 1,
      onProgress: request.onProgress,
    }
  );

  const result = engine.search(cleanStartingState);

  const preparationCost = result.totalExpectedCostChaos;
  const preparationResolved = Number.isFinite(preparationCost);
  const certified =
    result.optimalityProof.selectedPolicyStatus ===
    'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED';
  const status: AcquisitionSynthesisResult['status'] = !preparationResolved
    ? 'UNRESOLVED'
    : certified
      ? 'RESOLVED'
      : 'PROVISIONAL';

  const startKey = getAcquisitionFracturePreparationStateKey(
    cleanStartingState,
    acquisitionTarget
  );
  const startDecision = result.policyMap.get(startKey);
  const startLowerBound =
    startDecision && startDecision.candidateQValues.length > 0
      ? Math.min(...startDecision.candidateQValues.map((candidate) => candidate.lowerBoundChaos))
      : 0;
  const partialGraphPreparationLowerBoundChaos = Number.isFinite(startLowerBound)
    ? startLowerBound
    : 0;
  const mechanics = [
    ...CRAFT_MECHANICS,
    ...(request.includeHarvest
      ? createHarvestReforgeMechanics(context, request.harvestTags)
      : []),
    createRestartReacquireMechanic(restartReacquire),
  ];
  const mandatoryMechanics = evaluateMandatoryMechanicsLowerBound(
    context,
    cleanStartingState,
    acquisitionTarget,
    mechanics,
    enabledActionIds,
    request.allowResearchFallbackPrices ?? true
  );
  const partialGraphLowerBoundChaos = cleanBaseCostChaos + partialGraphPreparationLowerBoundChaos;
  const mandatoryMechanicsPreparationLowerBoundChaos = mandatoryMechanics.proven
    ? mandatoryMechanics.lowerBoundChaos
    : 0;
  const mandatoryMechanicsLowerBoundChaos =
    cleanBaseCostChaos + mandatoryMechanicsPreparationLowerBoundChaos;
  const lowerBoundChaos = Math.max(
    partialGraphLowerBoundChaos,
    mandatoryMechanicsLowerBoundChaos
  );
  const lowerBoundEvidence: AcquisitionSynthesisResult['lowerBoundEvidence'] = {
    cleanBaseCostChaos,
    partialGraphPreparationLowerBoundChaos,
    partialGraphLowerBoundChaos,
    mandatoryMechanicsPreparationLowerBoundChaos,
    mandatoryMechanicsLowerBoundChaos,
    combinedLowerBoundChaos: lowerBoundChaos,
    combinationRule: 'MAX_OF_ADMISSIBLE_BOUNDS',
    mechanics: mandatoryMechanics,
    provenance:
      'Full acquisition lower bound is max(partial-graph optimistic bound, mechanics-required ' +
      'bound). Both include the first clean-base acquisition exactly once.',
  };

  const restartUsage = result.expectedActionUsage.find(
    (usage) => usage.actionId === 'restart_reacquire'
  );
  const fracturingUsage = result.expectedActionUsage.find(
    (usage) => usage.actionId === 'fracturing_orb'
  );

  const desiredUnfractured: ModRequirement = {
    ...request.desiredPhysicalState.fracturedMod,
    mustBeFractured: undefined,
  };

  // Wrong-fracture evidence is read straight out of the converged on-policy occupancy so it can
  // never be a fixed retry multiplier: it is whatever the modeled transitions actually produce.
  const wrongFractureRules = result.onPolicyRules.filter((rule) => {
    const fractured = getAllAffixes(rule.state).filter((mod) => mod.isFractured);
    if (fractured.length === 0) return false;
    return !fractured.some((mod) => matchesModRequirement(mod, desiredUnfractured));
  });
  const recoveryByAction = new Map<string, { actionName: string; expectedVisits: number }>();
  for (const rule of wrongFractureRules) {
    const entry = recoveryByAction.get(rule.selectedActionId) ?? {
      actionName: rule.selectedActionName,
      expectedVisits: 0,
    };
    entry.expectedVisits += rule.expectedVisits;
    recoveryByAction.set(rule.selectedActionId, entry);
  }

  const fractureOutcomes: FractureOutcomeObservation[] = [];
  for (const rule of result.onPolicyRules) {
    if (rule.selectedActionId !== 'fracturing_orb') continue;
    const node = result.graphBuild.nodes.get(rule.stateKey);
    const edge = node?.actions.get('fracturing_orb');
    if (!edge) continue;
    let desired = 0;
    for (const transition of edge.transitions) {
      const hit = getAllAffixes(transition.nextState).some(
        (mod) => mod.isFractured && matchesModRequirement(mod, desiredUnfractured)
      );
      if (hit) desired += transition.probability;
    }
    fractureOutcomes.push({
      stateKey: rule.stateKey,
      state: describeState(rule.state),
      affixesOnItem: getAllAffixes(rule.state).length,
      desiredOutcomeProbability: desired,
      wrongOutcomeProbability: Math.max(0, 1 - desired),
      expectedVisits: rule.expectedVisits,
    });
  }
  fractureOutcomes.sort((left, right) => right.expectedVisits - left.expectedVisits);

  const terminalPhysicalStateSignatures = [
    ...new Set(
      [...result.graphBuild.nodes.values()]
        .filter((node) => node.isTerminal)
        .map((node) => getPhysicalStateSignature(node.state))
    ),
  ];

  const policy: AcquisitionPolicyRule[] = result.onPolicyRules
    .slice()
    .sort((left, right) => right.expectedVisits - left.expectedVisits)
    .map((rule) => ({
      stateKey: rule.stateKey,
      state: describeState(rule.state),
      selectedActionId: rule.selectedActionId,
      selectedAction: rule.selectedActionName,
      expectedVisits: rule.expectedVisits,
      totalCostChaos: finiteOrUndefined(rule.totalCostChaos) ?? null,
    }));

  const expectedRestarts = restartUsage?.expectedCount ?? 0;
  const expectedRestartCostChaos = restartUsage?.expectedCostChaos ?? 0;
  const modifierLabel = describeModRequirement(request.desiredPhysicalState.fracturedMod);

  const explanation = preparationResolved
    ? `Self-fracture of ${modifierLabel}: ${cleanBaseCostChaos.toFixed(2)}c first clean base + ` +
      `${preparationCost.toFixed(2)}c executable preparation/fracture/restart/cleanup = ` +
      `${(cleanBaseCostChaos + preparationCost).toFixed(2)}c expected, with ` +
      `${expectedRestarts.toFixed(3)} expected clean-base restarts.`
    : `Self-fracture of ${modifierLabel} did not resolve a complete executable route inside the ` +
      `acquisition search budget (${result.searchSummary.statesExpanded} states, ` +
      `${result.searchSummary.elapsedMs}ms).`;

  const expectedPreparationPhysicalActions = result.metrics?.expectedPhysicalActions;
  const expectedPreparationManualTimeMs = result.metrics?.estimatedManualTimeMs;

  return {
    status,
    expectedCostChaos: preparationResolved ? cleanBaseCostChaos + preparationCost : undefined,
    expectedPreparationCostChaos: finiteOrUndefined(preparationCost),
    expectedPhysicalActions: preparationResolved ? expectedPreparationPhysicalActions : undefined,
    expectedPreparationPhysicalActions: preparationResolved ? expectedPreparationPhysicalActions : undefined,
    estimatedManualTimeMs: preparationResolved ? expectedPreparationManualTimeMs : undefined,
    expectedPreparationManualTimeMs: preparationResolved ? expectedPreparationManualTimeMs : undefined,
    cleanBaseCostChaos,
    lowerBoundChaos,
    lowerBoundEvidence,
    terminalStateSemantics: ACQUISITION_TERMINAL_STATE_SEMANTICS,
    acquisitionTarget,
    enabledActionIds,
    modeledActionIds: Object.keys(result.graphBuild.actionAttribution),
    expectedActionUsage: result.expectedActionUsage,
    expectedCurrencies: result.expectedCurrencies,
    expectedRestarts,
    expectedRestartCostChaos,
    expectedFracturingOrbs: fracturingUsage?.expectedCount ?? 0,
    fractureOutcomes,
    wrongFractureRecovery: {
      states: wrongFractureRules.length,
      expectedVisits: wrongFractureRules.reduce((sum, rule) => sum + rule.expectedVisits, 0),
      recoveryActions: [...recoveryByAction.entries()]
        .map(([actionId, entry]) => ({
          actionId,
          actionName: entry.actionName,
          expectedVisits: entry.expectedVisits,
        }))
        .sort((left, right) => right.expectedVisits - left.expectedVisits),
      inPlaceResetAvailable: false,
      expectedRestarts,
      expectedRestartCostChaos,
      note:
        'Fractured affixes survive Scouring and block further Fracturing Orb use, so a wrong ' +
        'fracture has no in-place reset. Recovery is only modeled through restart/reacquisition, ' +
        'which pays the clean-base price again.',
    },
    policy,
    terminalPhysicalStateSignatures,
    proof: {
      selectedPolicyStatus: result.optimalityProof.selectedPolicyStatus,
      proofLevel: result.optimalityProof.proofLevel,
      globalOptimality: result.optimalityProof.globalOptimality,
      modeledActionOptimalityProven: result.optimalityProof.modeledActionOptimalityProven,
      unresolvedCompetitorCount: result.optimalityProof.unresolvedCompetitorCount,
      potentiallyCompetitiveUnresolvedCount:
        result.optimalityProof.potentiallyCompetitiveUnresolvedCount,
      unresolvedCandidatesCouldBeatIncumbent:
        result.optimalityProof.unresolvedCandidatesCouldBeatIncumbent,
    },
    risk: {
      selectedPolicyProper: result.onPolicyGraph.isProper,
      terminalAbsorptionProbability: result.onPolicyGraph.terminalAbsorptionProbability,
      unresolvedOnPolicyProbability: result.onPolicyGraph.onPolicyUnresolvedProbabilityMass,
      onPolicyReachableStates: result.onPolicyGraph.onPolicyReachableStates,
      onPolicyTerminalStates: result.onPolicyGraph.onPolicyTerminalStates,
      hasCycles: result.onPolicyGraph.hasCycles,
    },
    solver: {
      bellmanIterations: result.convergence.iterations,
      bellmanConverged: result.convergence.converged,
      occupancyIterations: result.reconciliation.visitIterations,
      occupancyConverged: result.reconciliation.visitConverged,
      reconciliationDifferenceChaos: finiteOrUndefined(result.reconciliation.differenceChaos) ?? 0,
      costReconciled: result.reconciliation.isReconciled,
    },
    search: {
      statesExpanded: result.searchSummary.statesExpanded,
      cumulativeExpansionWork: result.searchSummary.cumulativeExpansionWork,
      repeatedStatesExpanded: result.searchSummary.repeatedStatesExpanded,
      expansionRounds: result.searchSummary.expansionRounds,
      expansionMode: result.searchSummary.expansionMode,
      seedStatesExpanded: result.searchSummary.seedStatesExpanded,
      newStatesByRound: [...result.searchSummary.newStatesByRound],
      retainedStatesReusedByRound: [...result.searchSummary.retainedStatesReusedByRound],
      transitionDistributionsGenerated: result.searchSummary.transitionDistributionsGenerated,
      transitionDistributionsGeneratedByRound: [
        ...result.searchSummary.transitionDistributionsGeneratedByRound,
      ],
      previouslyExpandedNodesRevisited: result.searchSummary.previouslyExpandedNodesRevisited,
      previouslyExpandedNodesRevisitedByRound: [
        ...result.searchSummary.previouslyExpandedNodesRevisitedByRound,
      ],
      acquisitionFeasibilityStatesExpanded:
        result.searchSummary.acquisitionFeasibilityStatesExpanded,
      interruptedStatesExpanded: result.searchSummary.interruptedStatesExpanded,
      elapsedMs: result.searchSummary.elapsedMs,
      budgetExhausted: result.searchSummary.budgetExhausted,
      maxStates: result.searchSummary.maxStates,
      graphHitStateLimit: result.graphBuild.hitStateLimit,
      graphHitWallTimeLimit: result.graphBuild.hitWallTimeLimit,
      unexpandedProbabilityMass: result.graphBuild.transitionProbabilityMassToUnexpandedStates,
      canonicalStateIdentity: ACQUISITION_FRACTURE_PREPARATION_STATE_IDENTITY,
    },
    priceConfidence: result.priceConfidence,
    mechanicsConfidence: result.mechanicsConfidence,
    provenance: 'EXECUTABLE SEARCH-DERIVED SELF-FRACTURE',
    explanation,
  };
}
