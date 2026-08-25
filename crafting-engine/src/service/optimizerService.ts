import type { ClusterModRepository } from '../data/clusterModRepository.ts';
import { ModPool } from '../domain/ModPool.ts';
import {
  DEFAULT_CURRENCY_RATES,
  PriceBook,
  type CurrencyRates,
  type PriceConfidence,
  type PriceSource,
} from '../domain/PriceBook.ts';
import type { BaseType, ItemRarity, ItemState } from '../domain/ItemState.ts';
import { getAllAffixes, getPhysicalStateSignature, normalizeItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import { getAllTargetModRequirements, matchesModRequirement } from '../domain/TargetDefinition.ts';
import type {
  AcquisitionMethodDefinition,
  AcquisitionPortfolioCandidate,
  MechanicsConfidence,
} from '../rules/actionRegistry.ts';
import {
  CRAFT_MECHANICS,
  createHarvestReforgeMechanics,
  createRestartReacquireMechanic,
} from '../rules/actionRegistry.ts';
import { getCanonicalStateKey } from '../rules/actionDiscovery.ts';
import { getTaggedModsForCluster } from '../rules/clusterPoolHelpers.ts';
import type {
  ActionCostVector,
  ActionEffortProfile,
  EffortConfidence,
} from '../domain/CraftAction.ts';
import { DEFAULT_ACTION_EFFORT_PROFILE } from '../domain/CraftAction.ts';
import {
  createGenericSearchContinuationSession,
  GenericSearchEngine,
  type ActionResolutionStatus,
  type CandidateActionQValue,
  type GenericSearchContinuationSession,
  type GenericSearchResult,
  type OptimizationObjectiveKind,
  type OptimizationObjectiveSpec,
  type RouteMetricVector,
} from '../solver/genericSearch.ts';
import {
  generateStartingStateCandidates,
  type StartingStateCandidate,
} from '../solver/strategyDiscovery.ts';
import {
  DEFAULT_ACQUISITION_SYNTHESIS_ACTION_IDS,
  buildAcquisitionTargetDefinition,
  describeModRequirement,
  synthesizeAcquisition,
  type AcquisitionSynthesisResult,
} from '../solver/acquisitionSynthesis.ts';
import { evaluateMandatoryMechanicsLowerBound } from '../solver/mandatoryMechanicsLowerBound.ts';
import { buildCraftPlan, type CraftPlanSummary } from './craftPlan.ts';
import {
  OptimizerInputValidationError,
  validateOptimizeCraftInput,
  type OptimizerValidationIssue,
} from './optimizerValidation.ts';
import { getSearchRuntimeBudget, type SearchIntent } from './searchRuntime.ts';
import type {
  MethodFamilyKind,
  MethodFamilyStatus,
  MethodFamilySpec,
  MethodFamilyResult,
} from '../domain/MethodFamily.ts';

export type {
  ActionCostVector,
  ActionEffortProfile,
  EffortConfidence,
  MethodFamilyKind,
  MethodFamilyStatus,
  MethodFamilySpec,
  MethodFamilyResult,
  OptimizationObjectiveKind,
  OptimizationObjectiveSpec,
  RouteMetricVector,
};
export { DEFAULT_ACTION_EFFORT_PROFILE };

export interface OptimizeCraftPriceContext {
  currencyRates?: Partial<CurrencyRates>;
  cleanBaseCostChaos?: number;
  cleanBasePriceSource?: 'manual' | 'market';
  cleanBasePriceProvenance?: string;
  marketFracturedPricesChaos?: Record<string, number>;
}

export interface OptimizerMarketContext {
  league: string;
  snapshotAt: string;
  snapshotAgeMs?: number;
  snapshotStale: boolean;
  currencyRatesAt?: string;
  currencyRatesAgeMs?: number;
  currencyRatesStale: boolean;
  stale: boolean;
  cleanBaseQuote: {
    status: 'AVAILABLE' | 'UNAVAILABLE';
    costChaos?: number;
    lowChaos?: number;
    midChaos?: number;
    listed?: number;
    sampled?: number;
    at?: string;
    ageMs?: number;
    stale?: boolean;
    provenance: string;
  };
  currencyMappings: Record<string, string>;
  currencyCoverage: {
    mappedAndPresent: string[];
    mappedButMissing: string[];
    unmappedEngineCurrencies: string[];
  };
}

export interface SearchBudget {
  maxStates?: number;
  maxWallTimeMs?: number;
  maxExpansionRounds?: number;
  /** Shared across all fracture candidates, independently of downstream graph states. */
  acquisitionMaxStates?: number;
  /** Shared acquisition-stage wall time; always clamped to the overall request deadline. */
  acquisitionMaxWallTimeMs?: number;
  acquisitionMaxExpansionRounds?: number;
}

export interface OptimizeCraftInput {
  baseType: BaseType;
  clusterType: string;
  itemLevel: number;
  passiveCount: number;
  target: TargetDefinition;
  prices?: OptimizeCraftPriceContext;
  searchBudget?: SearchBudget;
  harvestTags?: string[];
  allowResearchFallbackPrices?: boolean;
  expectedSaleValueChaos?: number;
  marketContext?: OptimizerMarketContext;
  searchIntent?: SearchIntent;
  objective?: OptimizationObjectiveSpec;
  effortProfile?: Partial<ActionEffortProfile>;
}

export type ObjectiveProofStatus =
  | 'UNCONSTRAINED_RESOLVED'
  | 'CONSTRAINED_OPTIMAL_PROVEN'
  | 'BEST_RESOLVED_WITHIN_COST'
  | 'NO_RESOLVED_ROUTE_WITHIN_COST'
  | 'CHEAPEST_ROUTE_UNRESOLVED';

export interface HarvestComparisonSummary {
  harvestConsidered: boolean;
  harvestEligible: boolean;
  consideredHarvestActions: Array<{ actionId: string; actionName: string; tag: string }>;
  resolvedHarvestRoute?: RouteSummary;
  conventionalRoute?: RouteSummary;
  costDifferenceChaos?: number;
  actionsSaved?: number;
  timeSavedMs?: number;
  lifeforceCrossoverPriceChaosPerUnit?: number;
  status:
    | 'HARVEST_SELECTED'
    | 'HARVEST_MORE_EXPENSIVE'
    | 'HARVEST_NOT_ELIGIBLE'
    | 'HARVEST_DISABLED'
    | 'HARVEST_NO_RESOLVED_POLICY';
  explanation: string;
}

export interface ParetoAlternative {
  route: RouteSummary;
  isCheapest: boolean;
  isFewestActions: boolean;
  isFastest: boolean;
  isRequestedObjective: boolean;
  tradeoffSummary: string;
}

export interface SerializableCandidateQValue {
  actionId: string;
  actionName: string;
  immediateCostChaos: number;
  continuationCostChaos: number | null;
  totalCostChaos: number | null;
  lowerBoundChaos: number;
  incumbentUpperBoundChaos: number | null;
  optimalityGapChaos: number | null;
  status: ActionResolutionStatus;
  couldBeatResolvedIncumbent: boolean;
}

export interface PolicyRule {
  stateKey: string;
  state: string;
  selectedActionId: string;
  selectedAction: string;
  expectedVisits: number;
  totalCostChaos: number | null;
  candidates: SerializableCandidateQValue[];
}

export interface ExpectedActionUsage {
  actionId: string;
  actionName: string;
  expectedCount: number;
  expectedCostChaos: number;
}

export interface PolicyExplanationRule {
  condition: string;
  actionId: string;
  action: string;
  representedStateCount: number;
  expectedVisits: number;
  exampleState: string;
  context: {
    rarity: ItemRarity;
    prefixCount: number;
    suffixCount: number;
    matchedTargetModIds: string[];
    unmatchedTargetModIds: string[];
    prefixes: Array<{ modId: string; tier: number; isFractured: boolean; currentRoll?: number[] }>;
    suffixes: Array<{ modId: string; tier: number; isFractured: boolean; currentRoll?: number[] }>;
    influenced: boolean;
    synthesised: boolean;
    acquisitionMenu: boolean;
    disambiguateAffixes: boolean;
  };
}

export interface RouteSummary {
  actionId: string;
  name: string;
  acquisitionCandidateId?: string;
  acquisitionMethodId?: string;
  expectedTotalCostChaos: number | null;
  lowerBoundChaos: number;
  incumbentUpperBoundChaos: number | null;
  optimalityGapChaos: number | null;
  status: ActionResolutionStatus;
  couldBeatResolvedIncumbent: boolean;
  metrics?: RouteMetricVector;
  acquisitionMetrics?: RouteMetricVector;
  downstreamMetrics?: RouteMetricVector;
}

export interface AcquisitionMethodSummary {
  id: string;
  label: string;
  costChaos: number;
  confidence: PriceConfidence;
  provenance: string;
  approximate: boolean;
  executable: boolean;
}

export interface AcquisitionSynthesisSummary {
  status: AcquisitionSynthesisResult['status'] | 'SKIPPED_DOMINATED';
  provenance: AcquisitionSynthesisResult['provenance'] | 'ADMISSIBLE MECHANICS LOWER BOUND';
  expectedCostChaos?: number;
  expectedPreparationCostChaos?: number;
  lowerBoundChaos: number;
  lowerBoundEvidence: AcquisitionSynthesisResult['lowerBoundEvidence'];
  expectedRestarts?: number;
  expectedRestartCostChaos?: number;
  expectedFracturingOrbs?: number;
  expectedActionUsage?: ExpectedActionUsage[];
  wrongFractureRecovery?: AcquisitionSynthesisResult['wrongFractureRecovery'];
  proof?: AcquisitionSynthesisResult['proof'];
  risk?: AcquisitionSynthesisResult['risk'];
  solver?: AcquisitionSynthesisResult['solver'];
  search?: AcquisitionSynthesisResult['search'];
  priceConfidence?: AcquisitionSynthesisResult['priceConfidence'];
  mechanicsConfidence?: AcquisitionSynthesisResult['mechanicsConfidence'];
  explanation: string;
  cacheHit: boolean;
  cacheIdentity?: string;
  allocatedMaxStates: number;
  allocatedMaxWallTimeMs: number;
  allocatedMaxExpansionRounds: number;
}

export interface AcquisitionCandidateSummary {
  id: string;
  label: string;
  physicalStateSignature: string;
  methods: AcquisitionMethodSummary[];
  synthesis?: AcquisitionSynthesisSummary;
}

export interface AcquisitionStageSummary {
  mode:
    | 'NO_FRACTURE_CANDIDATES'
    | 'CLEAN_ROUTE_DOMINANCE'
    | 'CLEAN_EXECUTABLE_PROVISIONAL'
    | 'EXECUTABLE_SYNTHESIS';
  candidateCount: number;
  attemptedCandidates: number;
  certifiedCandidates: number;
  cacheHits: number;
  totalStateBudget: number;
  totalWallTimeBudgetMs: number;
  maxExpansionRoundsPerCandidate: number;
  elapsedMs: number;
  allocation: string;
  cacheIdentity: string;
  cleanCertification?: {
    attempted: boolean;
    certified: boolean;
    recommendationStatus: GenericSearchResult['optimalityProof']['selectedPolicyStatus'];
    expectedTotalCostChaos?: number;
    lowerBoundChaos?: number;
    optimalityGapChaos?: number;
    statesExpanded: number;
    cumulativeExpansionWork: number;
    expansionRounds: number;
    elapsedMs: number;
    proper: boolean;
    absorptionProbability: number;
    costReconciled: boolean;
    fullyResolvedOnPolicy: boolean;
    unresolvedOnPolicyProbability: number;
    unresolvedCompetitorCount: number;
    startActionId?: string;
  };
}

export type AcquisitionPortfolioProofStatus =
  | 'PORTFOLIO_OPTIMAL'
  | 'SELECTED_ACQUISITION_SAFE'
  | 'BEST_RESOLVED_UNPROVEN'
  | 'NO_EXECUTABLE_ROUTE';

export type AcquisitionPortfolioCandidateLifecycle =
  | 'NOT_STARTED'
  | 'ACQUISITION_PROBING'
  | 'ACQUISITION_RESOLVED'
  | 'DOWNSTREAM_PROBING'
  | 'FULL_ROUTE_RESOLVED'
  | 'SELECTED'
  | 'DOMINATED'
  | 'COMPETITIVE_UNRESOLVED';

export type AcquisitionPortfolioProofReason =
  | 'DEEPEST_COMPETITOR_LOWER_BOUND'
  | 'CAN_STILL_BEAT_INCUMBENT'
  | 'INCUMBENT_CHANGED_REEVALUATE'
  | 'RESOLVE_ACQUISITION_BEFORE_DOWNSTREAM'
  | 'RESOLVE_DOWNSTREAM_AFTER_ACQUISITION'
  | 'DEEPEST_ACQUISITION_PROOF_DEBT'
  | 'DEEPEST_DOWNSTREAM_PROOF_DEBT'
  | 'DOMINATED_BY_FULL_ROUTE_BOUND'
  | 'SELECTED_EXECUTABLE_ROUTE'
  | 'CLEAN_ROUTE_PROVEN'
  | 'NO_EXECUTABLE_ROUTE';

export interface AcquisitionPortfolioCandidateProofEvidence {
  candidateId: string;
  label: string;
  kind: 'clean' | 'self-fracture';
  acquisitionLowerBoundChaos: number;
  downstreamLowerBoundChaos?: number;
  fullRouteLowerBoundChaos: number;
  acquisitionUpperBoundChaos?: number;
  downstreamUpperBoundChaos?: number;
  fullRouteUpperBoundChaos?: number;
  status: AcquisitionPortfolioCandidateLifecycle;
  proofReason: AcquisitionPortfolioProofReason;
  acquisitionModeledOptimal: boolean;
  downstreamModeledOptimal: boolean;
  retainedAcquisitionStates: number;
  retainedDownstreamStates: number;
  acquisitionTransitionDistributionsGenerated: number;
  downstreamTransitionDistributionsGenerated: number;
}

export interface AcquisitionPortfolioProofTranche {
  candidateId: string;
  label: string;
  stage: 'ACQUISITION' | 'DOWNSTREAM' | 'DOWNSTREAM_BOUND';
  reason: AcquisitionPortfolioProofReason;
  allocatedMaxStates: number;
  allocatedMaxWallTimeMs: number;
  retainedStatesBefore: number;
  retainedStatesAfter: number;
  transitionDistributionsGeneratedBefore: number;
  transitionDistributionsGeneratedAfter: number;
  lowerBoundBeforeChaos: number;
  lowerBoundAfterChaos: number;
  upperBoundBeforeChaos?: number;
  upperBoundAfterChaos?: number;
  outcome: 'RESOLVED' | 'LOWER_BOUND_IMPROVED' | 'UPPER_BOUND_IMPROVED' | 'DOMINATED' | 'NO_PROOF_CHANGE';
}

export interface AcquisitionPortfolioProofSummary {
  status: AcquisitionPortfolioProofStatus;
  selectedFullRouteUpperBoundChaos?: number;
  bestCompetitiveLowerBoundChaos?: number;
  potentialGapChaos?: number;
  unresolvedCompetitiveCandidates: number;
  resolvedCompetitiveCandidates: number;
  dominatedCandidates: number;
  candidateEvidence: AcquisitionPortfolioCandidateProofEvidence[];
  tranches: AcquisitionPortfolioProofTranche[];
  schedulerPolicy: string;
}

export interface AcquisitionSummary {
  selectedCandidateId?: string;
  selectedMethodId?: string;
  candidates: AcquisitionCandidateSummary[];
  methodCount: number;
  distinctPhysicalStateCount: number;
  selectionSafe: boolean;
  resolvedIncumbentUpperBoundChaos?: number;
  bestUnresolvedLowerBoundChaos?: number;
  potentialGapChaos?: number;
  stage: AcquisitionStageSummary;
  portfolioProof: AcquisitionPortfolioProofSummary;
}

export interface PriceConfidenceSummary {
  complete: boolean;
  evidence: Array<{
    actionId: string;
    actionName: string;
    costChaos: number;
    confidence: PriceConfidence;
    source?: PriceSource | 'solver-context';
    provenance?: string;
  }>;
  warnings: string[];
}

export interface MechanicsConfidenceSummary {
  evidence: Array<{
    actionId: string;
    actionName: string;
    confidence: MechanicsConfidence;
    provenance?: string;
    onPolicySelections: number;
  }>;
  warnings: string[];
}

export interface ScopedPriceConfidenceSummary {
  selectedPolicy: PriceConfidenceSummary;
  consideredSearchSpace: PriceConfidenceSummary;
}

export interface ScopedMechanicsConfidenceSummary {
  gameMechanicsFidelity: 'PARTIAL';
  selectedPolicy: MechanicsConfidenceSummary;
  consideredSearchSpace: MechanicsConfidenceSummary;
}

export type RecommendationStatus =
  | 'PROVEN_OPTIMAL'
  | 'BEST_RESOLVED_ACQUISITION_SAFE'
  | 'PROVISIONAL_RESOLVED'
  | 'NO_RESOLVED_ROUTE';

export interface OptimizationProofSummary {
  selectedPolicyStatus: GenericSearchResult['optimalityProof']['selectedPolicyStatus'];
  proofLevel: GenericSearchResult['optimalityProof']['proofLevel'];
  globalOptimality: GenericSearchResult['optimalityProof']['globalOptimality'];
  modeledActionOptimalityProven: boolean;
  unresolvedCompetitiveCandidates: number;
  unresolvedCompetitorsMayBeCheaper: boolean;
}

export interface PolicyRefinementSummary {
  status:
    | 'MODELED_OPTIMAL'
    | 'CURRENT_BEST_UNPROVEN'
    | 'STILL_IMPROVING_AT_BUDGET'
    | 'NO_EXECUTABLE_POLICY';
  firstCertifiedUpperBoundChaos?: number;
  finalUpperBoundChaos?: number;
  improvementChaos?: number;
  improvementFraction?: number;
  selectedStartLowerBoundChaos?: number;
  unresolvedCompetitiveLowerBoundChaos?: number;
  potentialGapChaos?: number;
  potentialGapFraction?: number;
  incumbentHistory: GenericSearchResult['searchSummary']['incumbentHistory'];
  lastMeaningfulImprovementRound?: number;
  budgetEndedWhileImproving: boolean;
  stopReason: GenericSearchResult['searchSummary']['refinementStopReason'];
  explanation: string;
}

export interface OptimizerProgressCandidate {
  id: string;
  label: string;
  kind: 'clean' | 'self-fracture';
  targetModName?: string;
  status:
    | 'NOT_STARTED'
    | 'PROBING'
    | 'ACQUISITION_PROBING'
    | 'ACQUISITION_RESOLVED'
    | 'DOWNSTREAM_PROBING'
    | 'COMPETITIVE_UNRESOLVED'
    | 'UNRESOLVED'
    | 'PROVISIONAL'
    | 'RESOLVED'
    | 'DOWNSTREAM_UNRESOLVED'
    | 'FULL_ROUTE_RESOLVED'
    | 'DOMINATED'
    | 'SELECTED';
  acquisitionLowerBoundChaos?: number;
  downstreamLowerBoundChaos?: number;
  fullRouteLowerBoundChaos?: number;
  lowerBoundChaos?: number;
  acquisitionUpperBoundChaos?: number;
  downstreamUpperBoundChaos?: number;
  fullRouteUpperBoundChaos?: number;
  proofReason?: AcquisitionPortfolioProofReason;
  retainedAcquisitionStates?: number;
  retainedDownstreamStates?: number;
  statesExpanded: number;
  retainedStates: number;
  elapsedMs: number;
  isActive: boolean;
}

export interface OptimizerProgressSnapshot {
  phase:
    | 'INITIALIZING'
    | 'CLEAN_PROBE'
    | 'FRACTURE_PROBE'
    | 'FRACTURE_DEEPEN'
    | 'DOWNSTREAM_SOLVE'
    | 'REFINEMENT'
    | 'COMPLETE';
  phaseDescription: string;
  currentFocus: string;
  elapsedMs: number;
  totalStatesExpanded: number;
  retainedStatesReused: number;
  expansionRound: number;
  bestExecutableUpperBoundChaos?: number;
  bestUnresolvedLowerBoundChaos?: number;
  potentialGapChaos?: number;
  incumbentHistory: Array<{
    elapsedMs: number;
    upperBoundChaos: number;
    label: string;
  }>;
  candidates: OptimizerProgressCandidate[];
  recentMilestones: string[];
  portfolioProofStatus?: AcquisitionPortfolioProofStatus;
  unresolvedCompetitiveCandidates?: number;
  resolvedCompetitiveCandidates?: number;
  dominatedCandidates?: number;
  sessionReuseStatus: 'COLD' | 'RESUMED' | 'INVALIDATED';
  sessionReuseMessage?: string;
}

export interface SearchSessionReuseSummary {
  status: 'COLD' | 'RESUMED' | 'INVALIDATED';
  identityHash: string;
  missReason?: string;
  retainedStates: number;
  retainedTransitionDistributions: number;
  scope: 'CLEAN_DOWNSTREAM' | 'FRACTURE_DOWNSTREAM' | 'ACQUISITION_PORTFOLIO';
}

export interface OptimizationSearchSummary {
  intent: SearchIntent;
  statesExpanded: number;
  cumulativeExpansionWork: number;
  elapsedMs: number;
  expansionRounds: number;
  maxStates: number;
  maxWallTimeMs?: number;
  maxExpansionRounds: number;
  prioritizedCompetitiveStateKeys: number;
  stateBudgetExhausted: boolean;
  wallTimeBudgetExhausted: boolean;
  roundBudgetExhausted: boolean;
  budgetExhausted: boolean;
  returnedAtBudget: boolean;
  requestedWallTimeMs: number;
  engineDeadlineMs: number;
  hostGuardDeadlineMs: number;
  shutdownReserveMs: number;
  hostGuardTriggered: boolean;
  timeToFirstCompletedRoundMs?: number;
  timeToFirstCertifiedPolicyMs?: number;
  timeToFirstUsefulRecommendationMs?: number;
  expansionMode: 'REBUILT_EACH_ROUND' | 'PERSISTENT_EXTENDED';
  repeatedStatesExpanded: number;
  seedStatesExpanded: number;
  newStatesByRound: number[];
  retainedStatesReusedByRound: number[];
  transitionDistributionsGenerated: number;
  transitionDistributionsGeneratedByRound: number[];
  transitionDistributionsReused: number;
  transitionDistributionsReusedByRound: number[];
  previouslyExpandedNodesRevisited: number;
  previouslyExpandedNodesRevisitedByRound: number[];
  acquisitionFeasibilityStatesExpanded: number;
  interruptedStatesExpanded: number;
  optimisticLowerBoundIterations: number;
  optimisticLowerBoundConverged: boolean;
  optimisticLowerBoundMethod: 'KNOWN_PARTIAL_GRAPH_WITH_ZERO_COST_UNKNOWN_SUCCESSORS';
  minimumFeasibleRarity: GenericSearchResult['searchSummary']['minimumFeasibleRarity'];
  acquisitionFeasibility: GenericSearchResult['searchSummary']['acquisitionFeasibility'];
  deepenProgress: GenericSearchResult['searchSummary']['deepenProgress'];
  incumbentHistory: GenericSearchResult['searchSummary']['incumbentHistory'];
  refinementStopReason: GenericSearchResult['searchSummary']['refinementStopReason'];
  resumedFromPriorRequest: boolean;
  retainedStatesFromPriorRequest: number;
  retainedTransitionDistributionsFromPriorRequest: number;
  stageTimingMs: GenericSearchResult['stageTiming'] & { serializationMs: number };
  sessionReuse: SearchSessionReuseSummary;
  totalElapsedMs: number;
  harvestActionScope: {
    mode: 'DISABLED' | 'TARGET_INFERRED' | 'EXPLICIT';
    tags: string[];
    rawInferredTags: string[];
    enabledCrafts: Array<{ actionId: string; actionName: string; tag: string }>;
  };
}

export type OptimizationWarningCategory =
  | 'SELECTED_ROUTE'
  | 'PROOF_SEARCH'
  | 'CONSIDERED_ALTERNATIVE'
  | 'DATA_FRESHNESS';

export interface OptimizationWarning {
  category: OptimizationWarningCategory;
  message: string;
}

export interface OptimizeCraftResult {
  target: TargetDefinition;
  validationNotices: OptimizerValidationIssue[];
  recommendationStatus: RecommendationStatus;
  recommended: RouteSummary | null;
  alternatives: RouteSummary[];
  expectedCurrencies: Record<string, number | null>;
  expectedActionUsage: ExpectedActionUsage[];
  policyExplanation: PolicyExplanationRule[];
  craftPlan: CraftPlanSummary;
  policyRules: PolicyRule[];
  acquisition: AcquisitionSummary;
  expectedCostChaos: number | null;
  expectedSaleValueChaos?: number;
  expectedProfitChaos?: number | null;
  risk: {
    onPolicyReachableStates: number;
    onPolicyTerminalStates: number;
    terminalAbsorptionProbability: number;
    selectedPolicyProper: boolean;
    unresolvedOnPolicyProbability: number;
  };
  priceConfidence: ScopedPriceConfidenceSummary;
  mechanicsConfidence: ScopedMechanicsConfidenceSummary;
  proof: OptimizationProofSummary;
  policyRefinement: PolicyRefinementSummary;
  search: OptimizationSearchSummary;
  solver: {
    bellmanIterations: number;
    bellmanConverged: boolean;
    occupancyIterations: number;
    occupancyConverged: boolean;
    reconciliationDifferenceChaos: number;
    costReconciled: boolean;
  };
  marketContext?: OptimizerMarketContext;
  harvestComparison?: HarvestComparisonSummary;
  paretoAlternatives?: ParetoAlternative[];
  objectiveProofStatus?: ObjectiveProofStatus;
  objective?: OptimizationObjectiveSpec;
  costCeilingChaos?: number;
  methodPortfolio?: MethodFamilyResult[];
  warningDetails: OptimizationWarning[];
  warnings: string[];
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

function serializeCandidate(candidate: CandidateActionQValue): SerializableCandidateQValue {
  return {
    actionId: candidate.actionId,
    actionName: candidate.actionName,
    immediateCostChaos: candidate.immediateCostChaos,
    continuationCostChaos: finiteOrNull(candidate.expectedContinuationChaos),
    totalCostChaos: finiteOrNull(candidate.totalQValueChaos),
    lowerBoundChaos: candidate.lowerBoundChaos,
    incumbentUpperBoundChaos: finiteOrNull(candidate.incumbentUpperBoundChaos),
    optimalityGapChaos: finiteOrNull(candidate.optimalityGapChaos),
    status: candidate.status,
    couldBeatResolvedIncumbent: candidate.couldBeatResolvedIncumbent,
  };
}

function computeParetoAlternatives(
  routes: RouteSummary[],
  _requestedObjective?: OptimizationObjectiveSpec
): ParetoAlternative[] {
  const resolved = routes.filter((r) => r.status === 'RESOLVED' && r.expectedTotalCostChaos !== null && r.metrics);
  if (resolved.length === 0) return [];

  const nonDominated: RouteSummary[] = [];
  for (const r of resolved) {
    const rCost = r.expectedTotalCostChaos!;
    const rAct = r.metrics!.expectedPhysicalActions;
    const rTime = r.metrics!.estimatedManualTimeMs;

    let isDominated = false;
    for (const other of resolved) {
      if (other === r) continue;
      const oCost = other.expectedTotalCostChaos!;
      const oAct = other.metrics!.expectedPhysicalActions;
      const oTime = other.metrics!.estimatedManualTimeMs;

      if (
        oCost <= rCost &&
        oAct <= rAct &&
        oTime <= rTime &&
        (oCost < rCost || oAct < rAct || oTime < rTime)
      ) {
        isDominated = true;
        break;
      }
    }
    if (!isDominated) {
      nonDominated.push(r);
    }
  }

  let minCost = Infinity;
  let minAct = Infinity;
  let minTime = Infinity;
  for (const r of nonDominated) {
    const cost = r.expectedTotalCostChaos!;
    const act = r.metrics!.expectedPhysicalActions;
    const time = r.metrics!.estimatedManualTimeMs;
    if (cost < minCost) minCost = cost;
    if (act < minAct) minAct = act;
    if (time < minTime) minTime = time;
  }

  return nonDominated.map((r): ParetoAlternative => {
    const cost = r.expectedTotalCostChaos!;
    const act = r.metrics!.expectedPhysicalActions;
    const time = r.metrics!.estimatedManualTimeMs;

    const isCheapest = Math.abs(cost - minCost) < 0.01;
    const isFewestActions = Math.abs(act - minAct) < 0.01;
    const isFastest = Math.abs(time - minTime) < 0.01;

    let tradeoffSummary = '';
    if (isCheapest && isFewestActions && isFastest) {
      tradeoffSummary = `Strictly optimal: ${cost.toFixed(1)}c (${Math.round(act)} actions, ${(time / 1000).toFixed(1)}s)`;
    } else if (isCheapest) {
      tradeoffSummary = `Cheapest: ${cost.toFixed(1)}c (${Math.round(act)} actions, ${(time / 1000).toFixed(1)}s)`;
    } else if (isFewestActions) {
      const extraCost = cost - minCost;
      tradeoffSummary = `Fewest actions: ${Math.round(act)} actions (+${extraCost.toFixed(1)}c vs cheapest)`;
    } else if (isFastest) {
      const extraCost = cost - minCost;
      tradeoffSummary = `Fastest: ${(time / 1000).toFixed(1)}s (+${extraCost.toFixed(1)}c vs cheapest)`;
    } else {
      tradeoffSummary = `${cost.toFixed(1)}c, ${Math.round(act)} actions, ${(time / 1000).toFixed(1)}s`;
    }

    return {
      route: r,
      isCheapest,
      isFewestActions,
      isFastest,
      isRequestedObjective: false,
      tradeoffSummary,
    };
  });
}

function buildHarvestComparisonSummary(
  enabledHarvestCrafts: Array<{ actionId: string; actionName: string; tag: string }>,
  harvestTags: string[],
  routes: RouteSummary[],
  priceBook: PriceBook,
  recommended: RouteSummary | null,
  cleanBaseCost: number
): HarvestComparisonSummary {
  const harvestEligible = enabledHarvestCrafts.length > 0;
  const harvestConsidered = harvestTags.length > 0;
  if (!harvestConsidered || !harvestEligible) {
    return {
      harvestConsidered,
      harvestEligible,
      consideredHarvestActions: enabledHarvestCrafts,
      status: harvestEligible ? 'HARVEST_DISABLED' : 'HARVEST_NOT_ELIGIBLE',
      explanation: harvestEligible
        ? 'Harvest crafts were not enabled for this optimization.'
        : 'No matching Harvest crafts are available for the target affixes on this cluster jewel base.',
    };
  }

  const resolved = routes.filter((r) => r.status === 'RESOLVED' && r.expectedTotalCostChaos !== null);
  const resolvedHarvestRoute = resolved.find((r) => {
    const name = (r.name || '').toLowerCase();
    return name.includes('reforge') || name.includes('harvest');
  });
  const conventionalRoute = resolved.find((r) => {
    const name = (r.name || '').toLowerCase();
    return !name.includes('reforge') && !name.includes('harvest');
  });

  if (!resolvedHarvestRoute && !conventionalRoute) {
    return {
      harvestConsidered: true,
      harvestEligible: true,
      consideredHarvestActions: enabledHarvestCrafts,
      status: 'HARVEST_NO_RESOLVED_POLICY',
      explanation: 'No fully resolved Harvest or conventional policy was found within budget.',
    };
  }

  if (resolvedHarvestRoute && conventionalRoute) {
    const harvestCost = resolvedHarvestRoute.expectedTotalCostChaos!;
    const convCost = conventionalRoute.expectedTotalCostChaos!;
    const costDifferenceChaos = harvestCost - convCost;
    const actionsSaved = (conventionalRoute.metrics?.expectedPhysicalActions ?? 0) - (resolvedHarvestRoute.metrics?.expectedPhysicalActions ?? 0);
    const timeSavedMs = (conventionalRoute.metrics?.estimatedManualTimeMs ?? 0) - (resolvedHarvestRoute.metrics?.estimatedManualTimeMs ?? 0);

    const harvestReforges = resolvedHarvestRoute.metrics?.expectedPhysicalActions ?? 1;
    const lifeforceUnitsUsed = Math.max(1, harvestReforges * 50);
    const nonLifeforceHarvestChaos = cleanBaseCost;
    const lifeforceCrossoverPriceChaosPerUnit = priceBook.calculateHarvestCrossoverPrice(
      convCost,
      nonLifeforceHarvestChaos,
      lifeforceUnitsUsed
    );

    const isHarvestSelected = recommended?.actionId === resolvedHarvestRoute.actionId;
    const status = isHarvestSelected
      ? 'HARVEST_SELECTED'
      : costDifferenceChaos > 0
        ? 'HARVEST_MORE_EXPENSIVE'
        : 'HARVEST_SELECTED';

    const explanation = costDifferenceChaos > 0
      ? `Harvest Reforge saves ${Math.round(actionsSaved)} physical actions (~${Math.max(0, Math.round(timeSavedMs / 1000))}s manual time) ` +
        `but costs ${costDifferenceChaos.toFixed(1)}c more in materials at current prices. ` +
        (lifeforceCrossoverPriceChaosPerUnit !== undefined && lifeforceCrossoverPriceChaosPerUnit > 0
          ? `Harvest becomes cheaper if lifeforce drops below ${lifeforceCrossoverPriceChaosPerUnit.toFixed(4)}c/unit.`
          : '')
      : `Harvest Reforge is the cheapest route (${harvestCost.toFixed(1)}c) and saves ${Math.round(actionsSaved)} physical actions.`;

    return {
      harvestConsidered: true,
      harvestEligible: true,
      consideredHarvestActions: enabledHarvestCrafts,
      resolvedHarvestRoute,
      conventionalRoute,
      costDifferenceChaos,
      actionsSaved,
      timeSavedMs,
      lifeforceCrossoverPriceChaosPerUnit,
      status,
      explanation,
    };
  }

  return {
    harvestConsidered: true,
    harvestEligible: true,
    consideredHarvestActions: enabledHarvestCrafts,
    resolvedHarvestRoute,
    conventionalRoute,
    status: resolvedHarvestRoute ? 'HARVEST_SELECTED' : 'HARVEST_MORE_EXPENSIVE',
    explanation: resolvedHarvestRoute
      ? 'Harvest route resolved successfully.'
      : 'Harvest reforges were modeled but proved more expensive than conventional Alteration rolling at current lifeforce prices.',
  };
}

function buildMethodPortfolio(
  pool: ModPool,
  allResolvedRoutes: RouteSummary[],
  recommended: RouteSummary | null,
  fastCleanRoute: RouteSummary | undefined,
  bestFractureRoute: RouteSummary | undefined,
  synthesisSummaries: Map<number, AcquisitionSynthesisSummary>,
  starts: StartingStateCandidate[],
  harvestComparison: HarvestComparisonSummary | undefined,
  priceBook: PriceBook,
  craftPlan: CraftPlanSummary
): MethodFamilyResult[] {
  const results: MethodFamilyResult[] = [];
  const recCost = recommended?.expectedTotalCostChaos ?? null;

  // 1. OPEN POLICY (Primary recommended or incumbent)
  results.push({
    spec: {
      id: 'family_open',
      kind: 'OPEN',
      name: 'Open Policy (All Modeled Mechanics)',
      description: 'Global optimization considering all legal and enabled crafting mechanics.',
      badge: 'Recommended',
    },
    status: recommended ? 'SELECTED_WINNER' : 'UNRESOLVED_AT_BUDGET',
    route: recommended ?? undefined,
    craftPlan,
    whyNotSelectedExplanation: recommended
      ? 'Optimal choice under the selected objective.'
      : 'Search budget was reached before proof completion.',
  });

  // 2. CONVENTIONAL ROLLING (Alt / Aug / Regal / Exalt)
  const conventionalRoute = fastCleanRoute ?? allResolvedRoutes.find((r) => r.actionId.includes('clean'));
  if (conventionalRoute && conventionalRoute.expectedTotalCostChaos !== null) {
    const isWinner = Boolean(recommended && recommended.actionId === conventionalRoute.actionId);
    const costDelta = recCost !== null ? conventionalRoute.expectedTotalCostChaos - recCost : 0;
    const costDeltaPct = recCost !== null && recCost > 0 ? (costDelta / recCost) * 100 : 0;
    const actionsSaved = (conventionalRoute.metrics?.expectedPhysicalActions ?? 0) - (recommended?.metrics?.expectedPhysicalActions ?? 0);
    const timeSavedMs = (conventionalRoute.metrics?.estimatedManualTimeMs ?? 0) - (recommended?.metrics?.estimatedManualTimeMs ?? 0);

    results.push({
      spec: {
        id: 'family_conventional',
        kind: 'CONVENTIONAL',
        name: 'Conventional Alt / Aug / Regal',
        description: 'Clean base start using Magic rolling (Alteration + Augmentation), Regal promotion, and Exalted/Annul finishing.',
        badge: 'Alt + Regal',
        forcedAcquisitionType: 'CLEAN',
      },
      status: isWinner ? 'SELECTED_WINNER' : costDelta > 0.05 ? 'MORE_EXPENSIVE' : 'DOMINATED',
      route: conventionalRoute,
      costDifferenceChaos: costDelta,
      costDifferencePercent: costDeltaPct,
      actionsSaved: -actionsSaved,
      timeSavedMs: -timeSavedMs,
      whyNotSelectedExplanation: isWinner
        ? 'Selected as the most cost-effective path.'
        : costDelta > 0.05
          ? `+${costDelta.toFixed(1)}c (+${costDeltaPct.toFixed(0)}%) more expensive than ${recommended?.name ?? 'recommended route'}.`
          : undefined,
    });
  } else {
    results.push({
      spec: {
        id: 'family_conventional',
        kind: 'CONVENTIONAL',
        name: 'Conventional Alt / Aug / Regal',
        description: 'Clean base start using Magic rolling, Regal promotion, and Exalt finishing.',
        badge: 'Alt + Regal',
        forcedAcquisitionType: 'CLEAN',
      },
      status: 'UNRESOLVED_AT_BUDGET',
      whyNotSelectedExplanation: 'Conventional route was unresolved within the allocated state budget.',
    });
  }

  // 3. HARVEST REFORGE
  if (harvestComparison) {
    const harvestStatus = harvestComparison.status;
    let status: MethodFamilyStatus = 'NOT_ELIGIBLE';
    let explanation = harvestComparison.explanation;

    if (harvestStatus === 'HARVEST_SELECTED') {
      status = 'SELECTED_WINNER';
    } else if (harvestStatus === 'HARVEST_MORE_EXPENSIVE') {
      status = 'MORE_EXPENSIVE';
      if (!explanation.includes('more expensive')) {
        explanation = 'Harvest reforges were modeled but proved more expensive than Alteration rolling at current lifeforce prices.';
      }
    } else if (harvestStatus === 'HARVEST_NOT_ELIGIBLE') {
      status = 'NOT_ELIGIBLE';
      explanation = 'None of the target modifiers match available Harvest reforge tags.';
    } else if (harvestStatus === 'HARVEST_DISABLED') {
      status = 'DISABLED';
      explanation = 'Harvest crafts are disabled or currency rates are missing.';
    } else {
      status = 'UNRESOLVED_AT_BUDGET';
    }

    results.push({
      spec: {
        id: 'family_harvest',
        kind: 'HARVEST',
        name: 'Harvest Reforges',
        description: 'Clean base start repeatedly applying tagged Harvest reforges matching target affixes.',
        badge: 'Harvest',
        forcedAcquisitionType: 'CLEAN',
      },
      status,
      route: harvestComparison.resolvedHarvestRoute,
      costDifferenceChaos: harvestComparison.costDifferenceChaos,
      actionsSaved: harvestComparison.actionsSaved,
      timeSavedMs: harvestComparison.timeSavedMs,
      whyNotSelectedExplanation: explanation,
    });
  }

  // 4. SELF-FRACTURE TARGETS
  for (let idx = 0; idx < starts.length; idx++) {
    const start = starts[idx];
    if (!start.fracturedRequirement?.modId) continue;
    const modId = start.fracturedRequirement.modId;
    const mod = pool.findModById(modId);
    const modName = mod ? `${mod.name} (T${mod.tier})` : modId;
    const candidateRoute = allResolvedRoutes.find((r) => r.actionId.includes(`candidate_${idx}`) || (bestFractureRoute && bestFractureRoute.actionId.includes(`candidate_${idx}`)));
    const synthSummary = synthesisSummaries.get(idx);

    const isWinner = Boolean(recommended && recommended.actionId.includes(`candidate_${idx}`));
    const fractureCost = candidateRoute?.expectedTotalCostChaos ?? synthSummary?.expectedCostChaos ?? null;
    const costDelta = recCost !== null && fractureCost !== null ? fractureCost - recCost : undefined;
    const costDeltaPct = recCost !== null && recCost > 0 && costDelta !== undefined ? (costDelta / recCost) * 100 : undefined;

    let status: MethodFamilyStatus = 'NOT_MODELED';
    let explanation: string | undefined;

    if (isWinner) {
      status = 'SELECTED_WINNER';
      explanation = `Fracturing ${modName} first minimizes total expected cost.`;
    } else if (candidateRoute && fractureCost !== null) {
      status = costDelta && costDelta > 0.05 ? 'MORE_EXPENSIVE' : 'DOMINATED';
      const orbPrice = priceBook.getRate('fracturing') || 800;
      explanation = costDelta && costDelta > 0.05
        ? `+${costDelta.toFixed(1)}c (+${costDeltaPct?.toFixed(0)}%) more expensive, largely due to Fracturing Orb prices (${orbPrice}c each).`
        : `Dominated by other starting methods.`;
    } else if (synthSummary?.status === 'SKIPPED_DOMINATED') {
      status = 'DOMINATED';
      explanation = `Self-fracturing ${modName} was proven dominated by lower-bound pruning.`;
    } else {
      status = 'UNRESOLVED_AT_BUDGET';
      explanation = `Self-fracture synthesis for ${modName} remained unresolved within search budget.`;
    }

    results.push({
      spec: {
        id: `family_fracture_${modId}`,
        kind: 'SELF_FRACTURE',
        name: `Self-Fracture ${modName}`,
        description: `Synthesize a fractured ${modName} starting base, then craft remaining affixes.`,
        badge: `Fracture: ${modName}`,
        forcedAcquisitionType: 'SELF_FRACTURE',
        targetFractureModId: modId,
        targetFractureModName: modName,
      },
      status,
      route: candidateRoute,
      costDifferenceChaos: costDelta,
      costDifferencePercent: costDeltaPct,
      whyNotSelectedExplanation: explanation,
    });
  }

  // Deduplicate method families that resolved to the exact same route
  const seenRouteIds = new Set<string>();
  return results.filter((family) => {
    if (family.spec.kind === 'OPEN') return true;
    if (!family.route?.actionId) return true;
    if (seenRouteIds.has(family.route.actionId)) {
      if (family.spec.kind === 'CONVENTIONAL' && results[0].route?.actionId === family.route.actionId) {
        return false;
      }
    }
    seenRouteIds.add(family.route.actionId);
    return true;
  });
}

function methodConfidence(start: StartingStateCandidate, methodIndex: number, input: OptimizeCraftInput): PriceConfidence {
  const method = start.acquisitions[methodIndex];
  if (method.type === 'market') return 'known';
  if (method.type === 'clean-base' && input.prices?.cleanBaseCostChaos !== undefined) return 'known';
  return 'research-fallback';
}

function cleanBaseEvidence(
  start: StartingStateCandidate,
  input: OptimizeCraftInput
): { costChaos: number; confidence: PriceConfidence; provenance: string } {
  const cleanMethod = start.acquisitions.find((method) => method.type === 'clean-base');
  const costChaos = cleanMethod?.costChaos ?? input.prices?.cleanBaseCostChaos ?? 10;
  if (input.prices?.cleanBaseCostChaos !== undefined) {
    return {
      costChaos,
      confidence: 'known',
      provenance: input.prices.cleanBasePriceProvenance ??
        (input.prices.cleanBasePriceSource === 'market'
          ? 'league trade snapshot clean-base quote'
          : 'user-supplied clean-base price'),
    };
  }
  return {
    costChaos,
    confidence: 'research-fallback',
    provenance: 'optimizer clean-base research fallback',
  };
}

function synthesisPriceConfidence(result: AcquisitionSynthesisResult): PriceConfidence {
  if (result.priceConfidence.evidence.some((entry) => entry.confidence === 'unavailable')) {
    return 'unavailable';
  }
  if (result.priceConfidence.evidence.some((entry) => entry.confidence === 'research-fallback')) {
    return 'research-fallback';
  }
  return 'known';
}

function buildAcquisitionPortfolio(
  starts: StartingStateCandidate[],
  input: OptimizeCraftInput,
  syntheses: ReadonlyMap<number, AcquisitionSynthesisResult> = new Map()
): AcquisitionPortfolioCandidate[] {
  return starts.flatMap((start, candidateIndex): AcquisitionPortfolioCandidate[] => {
    // Core ranking accepts only clean-base acquisition plus certified executable synthesis.
    // Dormant compatibility fields and any caller-supplied fractured-market quote are ignored.
    const methods = start.acquisitions
      .map((method, methodIndex): AcquisitionMethodDefinition | undefined => {
        if (method.type !== 'clean-base') return undefined;
        const evidence = cleanBaseEvidence(start, input);
        return {
          id: `${method.type}_${methodIndex}`,
          label: `Start clean base: ${start.label}`,
          acquisitionCostChaos: method.costChaos,
          confidence: methodConfidence(start, methodIndex, input),
          provenance: evidence.provenance,
        };
      })
      .filter((method): method is AcquisitionMethodDefinition => method !== undefined);
    const synthesis = syntheses.get(candidateIndex);
    if (
      synthesis?.status === 'RESOLVED' &&
      synthesis.expectedCostChaos !== undefined
    ) {
      methods.push({
        id: 'self-fracture_executable',
        label: `Executable self-fracture: ${start.label}`,
        acquisitionCostChaos: synthesis.expectedCostChaos,
        confidence: synthesisPriceConfidence(synthesis),
        provenance: `${synthesis.provenance}. ${synthesis.explanation}`,
      });
    }
    if (methods.length === 0) return [];
    return [{
      id: `candidate_${candidateIndex}`,
      label: start.label,
      physicalState: normalizeItemState(start.state),
      methods,
    }];
  });
}

function sortedRecord(record: Record<string, number | undefined>): Record<string, number | undefined> {
  return Object.fromEntries(Object.keys(record).sort().map((key) => [key, record[key]]));
}

export const OPTIMIZER_MECHANICS_ACTION_SET_VERSION = 'phase2j-core-actions-v1';
export const OPTIMIZER_CANONICAL_STATE_VERSION = 'target-conditioned-groups-v2';

interface SearchIdentityComponents {
  version: number;
  baseType: BaseType;
  clusterType: string;
  itemLevel: number;
  passiveCount: number;
  targetRequirements: string;
  finalStateConstraints: string;
  otherTargetSemantics: string;
  cleanBaseEvidence: string;
  currencyRates: string;
  harvestScope: string;
  researchFallback: boolean;
  mechanicsActionSet: string;
  canonicalStateVersion: string;
}

function searchIdentityComponents(
  input: OptimizeCraftInput,
  harvestTags: readonly string[]
): SearchIdentityComponents {
  return {
    version: 1,
    baseType: input.baseType,
    clusterType: input.clusterType,
    itemLevel: input.itemLevel,
    passiveCount: input.passiveCount,
    targetRequirements: JSON.stringify({
      requiredMods: input.target.requiredMods,
      requiredRarity: input.target.requiredRarity,
      finalRollRequirements: input.target.finalRollRequirements,
    }),
    finalStateConstraints: JSON.stringify(input.target.finalStateConstraints ?? null),
    otherTargetSemantics: JSON.stringify({
      outcomeBranches: input.target.outcomeBranches,
      acceptableAnyOf: input.target.acceptableAnyOf,
    }),
    cleanBaseEvidence: JSON.stringify({
      costChaos: input.prices?.cleanBaseCostChaos,
      source: input.prices?.cleanBasePriceSource,
      provenance: input.prices?.cleanBasePriceProvenance,
    }),
    currencyRates: JSON.stringify(sortedRecord({
      ...DEFAULT_CURRENCY_RATES,
      ...(input.prices?.currencyRates ?? {}),
    })),
    harvestScope: JSON.stringify([...harvestTags].sort()),
    researchFallback: input.allowResearchFallbackPrices ?? true,
    mechanicsActionSet: JSON.stringify({
      version: OPTIMIZER_MECHANICS_ACTION_SET_VERSION,
      actions: CRAFT_MECHANICS.map((mechanic) => mechanic.id).sort(),
    }),
    canonicalStateVersion: OPTIMIZER_CANONICAL_STATE_VERSION,
  };
}

function hashIdentity(identity: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index++) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `phase2j-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function sessionInvalidationReason(
  previous: SearchIdentityComponents | undefined,
  current: SearchIdentityComponents
): string | undefined {
  if (!previous) return undefined;
  if (previous.baseType !== current.baseType) return 'BASE_TYPE_CHANGED';
  if (previous.clusterType !== current.clusterType) return 'CLUSTER_TYPE_CHANGED';
  if (previous.itemLevel !== current.itemLevel) return 'ITEM_LEVEL_CHANGED';
  if (previous.passiveCount !== current.passiveCount) return 'PASSIVE_COUNT_CHANGED';
  if (previous.targetRequirements !== current.targetRequirements) return 'TARGET_SEMANTICS_CHANGED';
  if (previous.finalStateConstraints !== current.finalStateConstraints) return 'FINAL_STATE_CONSTRAINT_CHANGED';
  if (previous.otherTargetSemantics !== current.otherTargetSemantics) return 'TARGET_BRANCH_SEMANTICS_CHANGED';
  if (previous.cleanBaseEvidence !== current.cleanBaseEvidence) return 'CLEAN_BASE_EVIDENCE_CHANGED';
  if (previous.currencyRates !== current.currencyRates) return 'CURRENCY_RATES_CHANGED';
  if (previous.harvestScope !== current.harvestScope) return 'HARVEST_SCOPE_CHANGED';
  if (previous.researchFallback !== current.researchFallback) return 'RESEARCH_FALLBACK_POLICY_CHANGED';
  if (previous.mechanicsActionSet !== current.mechanicsActionSet) return 'MECHANICS_ACTION_SET_CHANGED';
  if (previous.canonicalStateVersion !== current.canonicalStateVersion) return 'CANONICAL_STATE_VERSION_CHANGED';
  return undefined;
}

/** Diagnostic boundary for exact-context Retry Deeper invalidation audits. */
export function describeOptimizerSearchSessionIdentity(
  input: OptimizeCraftInput,
  harvestTags: readonly string[]
): { exactIdentity: string; identityHash: string } {
  const exactIdentity = JSON.stringify(searchIdentityComponents(input, harvestTags));
  return { exactIdentity, identityHash: hashIdentity(exactIdentity) };
}



function summarizeSynthesis(
  result: AcquisitionSynthesisResult,
  allocation: { maxStates: number; maxWallTimeMs: number; maxExpansionRounds: number },
  cacheHit: boolean,
  cacheIdentity: string
): AcquisitionSynthesisSummary {
  return {
    status: result.status,
    provenance: result.provenance,
    expectedCostChaos: result.expectedCostChaos,
    expectedPreparationCostChaos: result.expectedPreparationCostChaos,
    lowerBoundChaos: result.lowerBoundChaos,
    lowerBoundEvidence: result.lowerBoundEvidence,
    expectedRestarts: result.expectedRestarts,
    expectedRestartCostChaos: result.expectedRestartCostChaos,
    expectedFracturingOrbs: result.expectedFracturingOrbs,
    expectedActionUsage: result.expectedActionUsage.map((usage) => ({ ...usage })),
    wrongFractureRecovery: result.wrongFractureRecovery,
    proof: result.proof,
    risk: result.risk,
    solver: result.solver,
    search: result.search,
    priceConfidence: result.priceConfidence,
    mechanicsConfidence: result.mechanicsConfidence,
    explanation: result.explanation,
    cacheHit,
    cacheIdentity,
    allocatedMaxStates: allocation.maxStates,
    allocatedMaxWallTimeMs: allocation.maxWallTimeMs,
    allocatedMaxExpansionRounds: allocation.maxExpansionRounds,
  };
}

function inferHarvestTags(target: TargetDefinition, pool: ModPool): string[] {
  const requirements = getAllTargetModRequirements(target);
  const tags = new Set<string>();
  for (const mod of pool.getAllMods()) {
    if (!requirements.some((requirement) => matchesModRequirement(mod, requirement))) continue;
    for (const tag of [...mod.craftTags, ...mod.tags]) tags.add(tag.toLowerCase());
  }
  return [...tags].sort();
}

function virtualAcquisitionState(input: OptimizeCraftInput): ItemState {
  return normalizeItemState({
    baseType: input.baseType,
    clusterType: input.clusterType,
    itemLevel: input.itemLevel,
    passiveCount: input.passiveCount,
    rarity: 'normal',
    prefixes: [],
    suffixes: [],
    fracturedModIds: [],
    flags: { acquisitionMenu: true },
  });
}

function portfolioActionParts(actionId: string): { candidateId?: string; methodId?: string } {
  const match = /^acquire_(candidate_\d+)_(.+)$/.exec(actionId);
  return match ? { candidateId: match[1], methodId: match[2] } : {};
}

function routeSummary(candidate: CandidateActionQValue): RouteSummary {
  const parts = portfolioActionParts(candidate.actionId);
  return {
    actionId: candidate.actionId,
    name: candidate.actionName,
    acquisitionCandidateId: parts.candidateId,
    acquisitionMethodId: parts.methodId,
    expectedTotalCostChaos: finiteOrNull(candidate.totalQValueChaos),
    lowerBoundChaos: candidate.lowerBoundChaos,
    incumbentUpperBoundChaos: finiteOrNull(candidate.incumbentUpperBoundChaos),
    optimalityGapChaos: finiteOrNull(candidate.optimalityGapChaos),
    status: candidate.status,
    couldBeatResolvedIncumbent: candidate.couldBeatResolvedIncumbent,
  };
}

function describePolicyState(state: ItemState): string {
  if (state.flags?.acquisitionMenu) return 'Choose an acquisition route';
  const describeAffix = (mod: ItemState['prefixes'][number]): string =>
    `${mod.isFractured ? '[fractured] ' : ''}${mod.name}`;
  const prefixes = state.prefixes.map(describeAffix).join('; ') || 'none';
  const suffixes = state.suffixes.map(describeAffix).join('; ') || 'none';
  return `${state.rarity.toUpperCase()} — prefixes: ${prefixes} — suffixes: ${suffixes}`;
}

function describePolicyCondition(state: ItemState, target: TargetDefinition): string {
  if (state.flags?.acquisitionMenu) return 'Start: choose an acquisition route';
  const requirements = getAllTargetModRequirements(target);
  const matchedTargets = requirements.filter((requirement) =>
    getAllAffixes(state).some((mod) => matchesModRequirement(mod, requirement))
  ).length;
  return `${state.rarity} item with ${state.prefixes.length} prefix(es), ` +
    `${state.suffixes.length} suffix(es), and ${matchedTargets}/${requirements.length} target modifier(s)`;
}

function genericSearchStartLowerBound(
  result: GenericSearchResult,
  state: ItemState,
  target: TargetDefinition
): number {
  const decision = result.policyMap.get(getCanonicalStateKey(state, target));
  const lowerBound = decision?.candidateQValues.reduce(
    (minimum, candidate) => Math.min(minimum, candidate.lowerBoundChaos),
    Infinity
  );
  return lowerBound !== undefined && Number.isFinite(lowerBound) && lowerBound >= 0
    ? lowerBound
    : 0;
}

function genericSearchModeledOptimal(result: GenericSearchResult): boolean {
  return result.optimalityProof.modeledActionOptimalityProven &&
    result.optimalityProof.selectedPolicyStatus ===
      'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED';
}

function targetRequirementIdentity(
  requirement: ReturnType<typeof getAllTargetModRequirements>[number],
  index: number
): string {
  return requirement.modId ?? requirement.name ?? requirement.modGroup ?? `target requirement ${index + 1}`;
}

function policyConditionContext(
  state: ItemState,
  target: TargetDefinition
): PolicyExplanationRule['context'] {
  const requirements = getAllTargetModRequirements(target);
  const affixes = getAllAffixes(state);
  const matchedTargetModIds = [...new Set(affixes
    .filter((mod) => requirements.some((requirement) => matchesModRequirement(mod, requirement)))
    .map((mod) => mod.modId))]
    .sort();
  const unmatchedTargetModIds = requirements
    .map((requirement, index) => ({ requirement, id: targetRequirementIdentity(requirement, index) }))
    .filter(({ requirement }) => !affixes.some((mod) => matchesModRequirement(mod, requirement)))
    .map(({ id }) => id)
    .sort();
  const describeAffix = (mod: ItemState['prefixes'][number]) => ({
    modId: mod.modId,
    tier: mod.tier,
    isFractured: mod.isFractured,
    currentRoll: mod.currentRoll ? [...mod.currentRoll] : undefined,
  });
  return {
    rarity: state.rarity,
    prefixCount: state.prefixes.length,
    suffixCount: state.suffixes.length,
    matchedTargetModIds,
    unmatchedTargetModIds,
    prefixes: state.prefixes.map(describeAffix).sort((left, right) => left.modId.localeCompare(right.modId)),
    suffixes: state.suffixes.map(describeAffix).sort((left, right) => left.modId.localeCompare(right.modId)),
    influenced: state.flags?.influenced === true,
    synthesised: state.flags?.synthesised === true,
    acquisitionMenu: state.flags?.acquisitionMenu === true,
    disambiguateAffixes: false,
  };
}

function buildPolicyExplanation(
  rules: GenericSearchResult['onPolicyRules'],
  target: TargetDefinition
): PolicyExplanationRule[] {
  const prepared = rules.map((rule) => ({
    rule,
    condition: describePolicyCondition(rule.state, target),
    context: policyConditionContext(rule.state, target),
  }));
  const coarseKey = (context: PolicyExplanationRule['context']): string => JSON.stringify({
    rarity: context.rarity,
    prefixCount: context.prefixCount,
    suffixCount: context.suffixCount,
    matchedTargetModIds: context.matchedTargetModIds,
    unmatchedTargetModIds: context.unmatchedTargetModIds,
    influenced: context.influenced,
    synthesised: context.synthesised,
    acquisitionMenu: context.acquisitionMenu,
  });
  const actionsByCoarseContext = new Map<string, Set<string>>();
  for (const { rule, context } of prepared) {
    const actions = actionsByCoarseContext.get(coarseKey(context)) ?? new Set<string>();
    actions.add(rule.selectedActionId);
    actionsByCoarseContext.set(coarseKey(context), actions);
  }
  const grouped = new Map<string, PolicyExplanationRule>();
  for (const { rule, condition, context } of prepared) {
    const coarse = coarseKey(context);
    const disambiguateAffixes = (actionsByCoarseContext.get(coarse)?.size ?? 0) > 1;
    context.disambiguateAffixes = disambiguateAffixes;
    const detailed = disambiguateAffixes
      ? JSON.stringify({ prefixes: context.prefixes, suffixes: context.suffixes })
      : '';
    const key = `${coarse}\u0000${detailed}\u0000${rule.selectedActionId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.representedStateCount++;
      existing.expectedVisits += rule.expectedVisits;
      continue;
    }
    grouped.set(key, {
      condition,
      actionId: rule.selectedActionId,
      action: rule.selectedActionName,
      representedStateCount: 1,
      expectedVisits: rule.expectedVisits,
      exampleState: describePolicyState(rule.state),
      context,
    });
  }
  return [...grouped.values()].sort((left, right) => {
    if (left.condition.startsWith('Start:')) return -1;
    if (right.condition.startsWith('Start:')) return 1;
    return right.expectedVisits - left.expectedVisits;
  });
}

function mechanicsScope(
  evidence: GenericSearchResult['mechanicsConfidence']['evidence']
): MechanicsConfidenceSummary {
  const warnings = evidence
    .filter((entry) => entry.confidence !== 'VALIDATED')
    .map((entry) =>
      `${entry.actionName}: ${entry.confidence}` +
      (entry.provenance ? ` (${entry.provenance})` : '')
    );
  return {
    evidence: evidence.map((entry) => ({ ...entry })),
    warnings,
  };
}

interface OptimizerSearchSessionRecord {
  identity: string;
  components: SearchIdentityComponents;
  cleanDownstream: GenericSearchContinuationSession;
  portfolio?: {
    identity: string;
    continuation: GenericSearchContinuationSession;
  };
  fractureAcquisitions: Map<string, GenericSearchContinuationSession>;
  fractureDownstreams: Map<string, GenericSearchContinuationSession>;
  fractureDownstreamBounds: Map<string, {
    restartLowerBoundChaos: number;
    continuation: GenericSearchContinuationSession;
  }>;
  fractureProofs: Map<string, FracturePortfolioProofRecord>;
}

interface FracturePortfolioProofRecord {
  acquisition?: AcquisitionSynthesisResult;
  downstream?: GenericSearchResult;
  acquisitionLowerBoundChaos: number;
  downstreamLowerBoundChaos: number;
  fullRouteLowerBoundChaos: number;
  acquisitionUpperBoundChaos?: number;
  downstreamUpperBoundChaos?: number;
  fullRouteUpperBoundChaos?: number;
  acquisitionModeledOptimal: boolean;
  downstreamModeledOptimal: boolean;
  lastAllocatedStage?: 'ACQUISITION' | 'DOWNSTREAM' | 'DOWNSTREAM_BOUND';
}

/** Serializable optimizer boundary intended for the thin Developer UI. */
export class OptimizerService {
  private readonly repo: ClusterModRepository;
  private readonly searchSessions = new Map<string, OptimizerSearchSessionRecord>();
  private lastSearchIdentityComponents?: SearchIdentityComponents;

  constructor(repo: ClusterModRepository) {
    this.repo = repo;
  }

  optimize(
    input: OptimizeCraftInput,
    onProgress?: (snapshot: OptimizerProgressSnapshot) => void
  ): OptimizeCraftResult {
    const optimizationStarted = Date.now();
    const validation = validateOptimizeCraftInput(this.repo, input);
    if (!validation.valid) throw new OptimizerInputValidationError(validation.errors);
    input = validation.normalizedInput;
    const runtimeBudget = getSearchRuntimeBudget(input.searchBudget?.maxWallTimeMs);
    const searchStopDeadline = optimizationStarted + Math.floor(runtimeBudget.engineDeadlineMs * 0.85);
    const priceBook = new PriceBook(input.prices?.currencyRates ?? {});
    const pool = ModPool.forCluster(this.repo, input.baseType, input.clusterType);
    const starts = generateStartingStateCandidates(
      input.target,
      input.baseType,
      input.clusterType,
      input.itemLevel,
      {
        pool,
        priceBook,
        cleanBaseCostChaos: input.prices?.cleanBaseCostChaos,
      },
      input.passiveCount
    );
    const cleanStart = starts.find((start) => start.fracturedRequirement === undefined);
    if (!cleanStart) throw new Error('Strategy discovery did not produce a clean starting state');
    const cleanCandidateIndex = starts.indexOf(cleanStart);
    const cleanMethodIndex = cleanStart.acquisitions.findIndex(
      (method) => method.type === 'clean-base'
    );
    if (cleanMethodIndex < 0) {
      throw new Error('Clean strategy candidate did not provide a clean-base acquisition method');
    }
    const cleanMethod = cleanStart.acquisitions[cleanMethodIndex];
    const cleanEvidence = cleanBaseEvidence(cleanStart, input);
    const fractureEntries = starts
      .map((start, candidateIndex) => ({ start, candidateIndex }))
      .filter((entry) => entry.start.fracturedRequirement !== undefined);
    const harvestTags = input.harvestTags ?? inferHarvestTags(input.target, pool);
    const identityComponents = searchIdentityComponents(input, harvestTags);
    const searchIdentity = JSON.stringify(identityComponents);
    const searchIdentityHash = hashIdentity(searchIdentity);
    const invalidationReason = sessionInvalidationReason(
      this.lastSearchIdentityComponents,
      identityComponents
    );
    let searchSessionRecord = this.searchSessions.get(searchIdentity);
    if (!searchSessionRecord) {
      searchSessionRecord = {
        identity: searchIdentity,
        components: identityComponents,
        cleanDownstream: createGenericSearchContinuationSession(),
        fractureAcquisitions: new Map(),
        fractureDownstreams: new Map(),
        fractureDownstreamBounds: new Map(),
        fractureProofs: new Map(),
      };
      if (this.searchSessions.size >= 8) {
        const oldest = this.searchSessions.keys().next().value;
        if (oldest !== undefined) this.searchSessions.delete(oldest);
      }
      this.searchSessions.set(searchIdentity, searchSessionRecord);
    } else {
      this.searchSessions.delete(searchIdentity);
      this.searchSessions.set(searchIdentity, searchSessionRecord);
    }
    this.lastSearchIdentityComponents = identityComponents;
    let selectedSessionReuse: SearchSessionReuseSummary = {
      status: invalidationReason === undefined ? 'COLD' : 'INVALIDATED',
      identityHash: searchIdentityHash,
      missReason: invalidationReason,
      retainedStates: 0,
      retainedTransitionDistributions: 0,
      scope: 'CLEAN_DOWNSTREAM',
    };
    let fastCleanSessionReuse: SearchSessionReuseSummary | undefined;
    const enabledHarvestCrafts = harvestTags.length > 0
      ? createHarvestReforgeMechanics({ pool, priceBook }, harvestTags)
        .filter((mechanic) =>
          getTaggedModsForCluster(
            pool,
            String(mechanic.parameters?.harvestTag ?? ''),
            input.itemLevel
          ).length > 0
        )
        .map((mechanic) => ({
            actionId: mechanic.id,
            actionName: mechanic.name,
            tag: String(mechanic.parameters?.harvestTag ?? ''),
          }))
      : [];
    const startState = virtualAcquisitionState(input);
    const runDownstreamSearch = (
      portfolio: AcquisitionPortfolioCandidate[],
      maxWallTimeMs: number,
      persistentExpansion = true,
      skipAcquisitionFeasibility = false
    ): GenericSearchResult => {
      const portfolioIdentity = JSON.stringify(portfolio.map((candidate) => ({
        id: candidate.id,
        physicalState: getPhysicalStateSignature(candidate.physicalState),
        methods: candidate.methods.map((method) => ({
          id: method.id,
          acquisitionCostChaos: method.acquisitionCostChaos,
          confidence: method.confidence,
          provenance: method.provenance,
        })),
      })));
      if (searchSessionRecord.portfolio?.identity !== portfolioIdentity) {
        searchSessionRecord.portfolio = {
          identity: portfolioIdentity,
          continuation: createGenericSearchContinuationSession(),
        };
      }
      const continuation = searchSessionRecord.portfolio.continuation;
      const retainedStates = continuation.expansion.nodes.size;
      selectedSessionReuse = {
        status: retainedStates > 0
          ? 'RESUMED'
          : invalidationReason === undefined ? 'COLD' : 'INVALIDATED',
        identityHash: searchIdentityHash,
        missReason: retainedStates > 0 ? undefined : invalidationReason,
        retainedStates,
        retainedTransitionDistributions:
          continuation.expansion.transitionDistributionsGeneratedTotal,
        scope: 'ACQUISITION_PORTFOLIO',
      };
      return new GenericSearchEngine(
        { pool, priceBook },
        input.target,
        {
          acquisitionPortfolio: portfolio,
          includeHarvest: harvestTags.length > 0,
          harvestTags,
          prioritizeTargetProgress: true,
          allowResearchFallbackPrices: input.allowResearchFallbackPrices ?? true,
          maxStates: input.searchBudget?.maxStates ?? 5000,
          maxWallTimeMs: Math.max(1, maxWallTimeMs),
          maxExpansionRounds: input.searchBudget?.maxExpansionRounds ?? 3,
          searchIntent: input.searchIntent ?? 'RECOMMEND',
          persistentExpansion,
          continuationSession: continuation,
          recommendationRefinementRounds: 1,
          skipAcquisitionFeasibility,
        }
      ).search(startState);
    };

    const synthesisResults = new Map<number, AcquisitionSynthesisResult>();
    const synthesisSummaries = new Map<number, AcquisitionSynthesisSummary>();
    let portfolio: AcquisitionPortfolioCandidate[];
    let result: GenericSearchResult;
    let stageMode: AcquisitionStageSummary['mode'] = fractureEntries.length === 0
      ? 'NO_FRACTURE_CANDIDATES'
      : 'EXECUTABLE_SYNTHESIS';
    let stageElapsedMs = 0;
    let stageTotalStateBudget = 0;
    let stageTotalWallTimeBudgetMs = 0;
    const stageMaxExpansionRounds = input.searchBudget?.acquisitionMaxExpansionRounds ?? 3;
    let stageCacheHits = 0;
    let stageAttemptedCandidates = 0;

    // Clean routes receive a bounded certification pass first. If its executable upper bound is
    // no greater than every fracture family's generic mandatory-mechanics lower bound, those
    // families are soundly dominated without paying off-policy synthesis latency.
    let fastCleanResult: GenericSearchResult | undefined;
    let fastCleanRoute: RouteSummary | undefined;
    const targetExplicitlyRequiresFracture = getAllTargetModRequirements(input.target)
      .some((requirement) => requirement.mustBeFractured === true);
    const structuralBounds = new Map<number, AcquisitionSynthesisResult['lowerBoundEvidence']>();
    for (const { start, candidateIndex } of fractureEntries) {
      const acquisitionTarget = buildAcquisitionTargetDefinition({
        fracturedMod: start.fracturedRequirement!,
      });
      const restart = createRestartReacquireMechanic({
        destination: cleanStart.state,
        acquisitionCostChaos: cleanEvidence.costChaos,
        confidence: cleanEvidence.confidence,
        provenance: cleanEvidence.provenance,
      });
      const mechanics = evaluateMandatoryMechanicsLowerBound(
        { pool, priceBook },
        cleanStart.state,
        acquisitionTarget,
        [...CRAFT_MECHANICS, restart],
        DEFAULT_ACQUISITION_SYNTHESIS_ACTION_IDS,
        input.allowResearchFallbackPrices ?? true
      );
      const mandatoryPreparation = mechanics.proven ? mechanics.lowerBoundChaos : 0;
      const mandatory = cleanEvidence.costChaos + mandatoryPreparation;
      structuralBounds.set(candidateIndex, {
        cleanBaseCostChaos: cleanEvidence.costChaos,
        partialGraphPreparationLowerBoundChaos: 0,
        partialGraphLowerBoundChaos: cleanEvidence.costChaos,
        mandatoryMechanicsPreparationLowerBoundChaos: mandatoryPreparation,
        mandatoryMechanicsLowerBoundChaos: mandatory,
        combinedLowerBoundChaos: mandatory,
        combinationRule: 'MAX_OF_ADMISSIBLE_BOUNDS',
        mechanics,
        provenance:
          'Pre-search acquisition lower bound is max(clean-base-only partial bound, generic ' +
          'mandatory-mechanics bound).',
      });
    }
    const allStructuralBoundsProven = fractureEntries.every(({ candidateIndex }) =>
      structuralBounds.get(candidateIndex)?.mechanics.proven === true
    );

    // Set up progress tracking
    const recentMilestones: string[] = [];
    let lastProgressEmissionMs = 0;
    const progressIncumbents: Array<{ elapsedMs: number; upperBoundChaos: number; label: string }> = [];
    const progressCandidates = new Map<string, OptimizerProgressCandidate>();

    progressCandidates.set('clean', {
      id: 'clean',
      label: cleanStart.label,
      kind: 'clean',
      status: 'NOT_STARTED',
      lowerBoundChaos: cleanEvidence.costChaos,
      statesExpanded: 0,
      retainedStates: searchSessionRecord.cleanDownstream.expansion.nodes.size,
      elapsedMs: 0,
      isActive: false,
    });

    for (const { start, candidateIndex } of fractureEntries) {
      const id = `candidate_${candidateIndex}`;
      const sessionKey = JSON.stringify(start.fracturedRequirement);
      const structuralLowerBound = structuralBounds.get(candidateIndex)?.combinedLowerBoundChaos ?? 0;
      let proofRecord = searchSessionRecord.fractureProofs.get(sessionKey);
      if (!proofRecord) {
        proofRecord = {
          acquisitionLowerBoundChaos: structuralLowerBound,
          downstreamLowerBoundChaos: 0,
          fullRouteLowerBoundChaos: structuralLowerBound,
          acquisitionModeledOptimal: false,
          downstreamModeledOptimal: false,
        };
        searchSessionRecord.fractureProofs.set(sessionKey, proofRecord);
      } else {
        proofRecord.acquisitionLowerBoundChaos = Math.max(
          proofRecord.acquisitionLowerBoundChaos,
          structuralLowerBound
        );
        proofRecord.fullRouteLowerBoundChaos =
          proofRecord.acquisitionLowerBoundChaos + proofRecord.downstreamLowerBoundChaos;
      }
      const retainedAcqStates = searchSessionRecord.fractureAcquisitions.get(sessionKey)?.expansion.nodes.size ?? 0;
      const retainedDownstreamStates = searchSessionRecord.fractureDownstreams.get(sessionKey)?.expansion.nodes.size ?? 0;
      progressCandidates.set(id, {
        id,
        label: start.label,
        kind: 'self-fracture',
        targetModName: describeModRequirement(start.fracturedRequirement!),
        status: proofRecord.fullRouteUpperBoundChaos !== undefined
          ? 'FULL_ROUTE_RESOLVED'
          : proofRecord.acquisitionUpperBoundChaos !== undefined
            ? 'ACQUISITION_RESOLVED'
            : retainedAcqStates > 0 ? 'COMPETITIVE_UNRESOLVED' : 'NOT_STARTED',
        acquisitionLowerBoundChaos: proofRecord.acquisitionLowerBoundChaos,
        downstreamLowerBoundChaos: proofRecord.downstreamLowerBoundChaos,
        fullRouteLowerBoundChaos: proofRecord.fullRouteLowerBoundChaos,
        lowerBoundChaos: proofRecord.fullRouteLowerBoundChaos,
        acquisitionUpperBoundChaos: proofRecord.acquisitionUpperBoundChaos,
        downstreamUpperBoundChaos: proofRecord.downstreamUpperBoundChaos,
        fullRouteUpperBoundChaos: proofRecord.fullRouteUpperBoundChaos,
        proofReason: 'CAN_STILL_BEAT_INCUMBENT',
        retainedAcquisitionStates: retainedAcqStates,
        retainedDownstreamStates,
        statesExpanded: 0,
        retainedStates: retainedAcqStates,
        elapsedMs: 0,
        isActive: false,
      });
    }

    let currentBestUpperBound: number | undefined;
    let currentBestUnresolvedLowerBound: number | undefined;
    let currentPotentialGap: number | undefined;
    let currentPortfolioProofStatus: AcquisitionPortfolioProofStatus | undefined;
    let currentUnresolvedCompetitiveCandidates: number | undefined;
    let currentResolvedCompetitiveCandidates: number | undefined;
    let currentDominatedCandidates: number | undefined;
    const portfolioProofTranches: AcquisitionPortfolioProofTranche[] = [];

    const emitProgress = (
      phase: OptimizerProgressSnapshot['phase'],
      phaseDescription: string,
      currentFocus: string,
      force = false,
      milestone?: string
    ) => {
      if (!onProgress) return;
      const now = Date.now();
      if (!force && now - lastProgressEmissionMs < 100 && !milestone) return;
      if (milestone) {
        recentMilestones.push(milestone);
        if (recentMilestones.length > 8) recentMilestones.shift();
      }
      lastProgressEmissionMs = now;
      const candidateList = [...progressCandidates.values()];
      const totalStates = candidateList.reduce((sum, c) => sum + c.statesExpanded, 0) +
        (searchSessionRecord?.cleanDownstream.expansion.nodes.size ?? 0);
      const totalRetained = candidateList.reduce((sum, c) => sum + c.retainedStates, 0);

      if (phase !== 'COMPLETE') {
        const activeLowerBounds = candidateList
          .filter((c) => c.status !== 'DOMINATED' && (
            c.status === 'NOT_STARTED' ||
            c.status === 'PROBING' ||
            c.status === 'ACQUISITION_PROBING' ||
            c.status === 'ACQUISITION_RESOLVED' ||
            c.status === 'DOWNSTREAM_PROBING' ||
            c.status === 'COMPETITIVE_UNRESOLVED' ||
            c.status === 'UNRESOLVED'
          ))
          .map((c) => c.fullRouteLowerBoundChaos ?? c.lowerBoundChaos)
          .filter((val): val is number => val !== undefined && Number.isFinite(val));
        currentBestUnresolvedLowerBound = activeLowerBounds.length > 0 ? Math.min(...activeLowerBounds) : undefined;
        currentPotentialGap = currentBestUpperBound !== undefined && currentBestUnresolvedLowerBound !== undefined
          ? Math.max(0, currentBestUpperBound - currentBestUnresolvedLowerBound)
          : undefined;
      }

      const sessionReuseStatus = totalRetained > 0
        ? 'RESUMED'
        : invalidationReason ? 'INVALIDATED' : 'COLD';

      onProgress({
        phase,
        phaseDescription,
        currentFocus,
        elapsedMs: now - optimizationStarted,
        totalStatesExpanded: totalStates,
        retainedStatesReused: totalRetained,
        expansionRound: 1,
        bestExecutableUpperBoundChaos: currentBestUpperBound,
        bestUnresolvedLowerBoundChaos: currentBestUnresolvedLowerBound,
        potentialGapChaos: currentPotentialGap,
        incumbentHistory: [...progressIncumbents],
        candidates: candidateList,
        recentMilestones: [...recentMilestones],
        portfolioProofStatus: currentPortfolioProofStatus,
        unresolvedCompetitiveCandidates: currentUnresolvedCompetitiveCandidates,
        resolvedCompetitiveCandidates: currentResolvedCompetitiveCandidates,
        dominatedCandidates: currentDominatedCandidates,
        sessionReuseStatus,
        sessionReuseMessage: sessionReuseStatus === 'RESUMED'
          ? `Resumed from prior run (${totalRetained.toLocaleString()} states retained)`
          : sessionReuseStatus === 'INVALIDATED'
            ? `Restarted — ${invalidationReason!.toLowerCase().replace(/_/g, ' ')}`
            : undefined,
      });
    };

    emitProgress('INITIALIZING', 'Analyzing craft targets and starting candidates', 'Evaluating starting base portfolio', true);

    let bestFractureDownstreamResult: GenericSearchResult | undefined;
    let bestFractureCandidateIndex: number | undefined;
    let bestFractureSessionReuse: SearchSessionReuseSummary | undefined;

    for (const { start, candidateIndex } of fractureEntries) {
      const sessionKey = JSON.stringify(start.fracturedRequirement);
      const proofRecord = searchSessionRecord.fractureProofs.get(sessionKey);
      if (!proofRecord) continue;
      if (proofRecord.acquisition) {
        synthesisResults.set(candidateIndex, proofRecord.acquisition);
        synthesisSummaries.set(candidateIndex, summarizeSynthesis(
          proofRecord.acquisition,
          {
            maxStates: proofRecord.acquisition.search.maxStates,
            maxWallTimeMs: proofRecord.acquisition.search.elapsedMs,
            maxExpansionRounds: proofRecord.acquisition.search.expansionRounds,
          },
          true,
          sessionKey
        ));
        stageCacheHits++;
      }
      if (
        proofRecord.downstream &&
        proofRecord.fullRouteUpperBoundChaos !== undefined &&
        (currentBestUpperBound === undefined ||
          proofRecord.fullRouteUpperBoundChaos < currentBestUpperBound)
      ) {
        currentBestUpperBound = proofRecord.fullRouteUpperBoundChaos;
        bestFractureDownstreamResult = proofRecord.downstream;
        bestFractureCandidateIndex = candidateIndex;
        const downSession = searchSessionRecord.fractureDownstreams.get(sessionKey);
        const retainedStates = downSession?.expansion.nodes.size ?? 0;
        bestFractureSessionReuse = {
          status: retainedStates > 0 ? 'RESUMED' : 'COLD',
          identityHash: searchIdentityHash,
          retainedStates,
          retainedTransitionDistributions:
            downSession?.expansion.transitionDistributionsGeneratedTotal ?? 0,
          scope: 'FRACTURE_DOWNSTREAM',
        };
      }
    }

    if (
      fractureEntries.length > 0 &&
      !targetExplicitlyRequiresFracture &&
      allStructuralBoundsProven
    ) {
      const requestedIntent = input.searchIntent ?? 'RECOMMEND';
      const isComplexMultiMod = validation.normalizedInput.target.requiredMods.length >= 3;
      const fastWallTimeCeiling = requestedIntent === 'RECOMMEND'
        ? (isComplexMultiMod ? Math.min(4_000, Math.floor(runtimeBudget.engineDeadlineMs * 0.18)) : Math.min(10_000, Math.floor(runtimeBudget.engineDeadlineMs * 0.35)))
        : isComplexMultiMod
          ? Math.min(20_000, Math.floor(runtimeBudget.engineDeadlineMs * 0.45))
          : Math.floor(runtimeBudget.engineDeadlineMs * 0.7);
      const fastWallTimeMs = Math.max(
        1,
        Math.min(fastWallTimeCeiling, searchStopDeadline - Date.now() - 4_000)
      );
      // Certify the physical clean craft directly so acquisition-menu competition cannot consume
      // the tranche before an executable incumbent exists. Restart/reacquisition is still a real
      // shared mechanic and pays the clean-base price; the first clean base is added exactly once
      // at the service boundary below.
      const retainedCleanStates = searchSessionRecord.cleanDownstream.expansion.nodes.size;
      const requestedCleanStates = input.searchBudget?.maxStates ?? 5_000;
      const cleanProbeMaxStates = requestedIntent === 'DEEPEN' && isComplexMultiMod
          ? Math.min(requestedCleanStates, retainedCleanStates + 3_000)
          : requestedCleanStates;
      const generatedCleanTransitions =
        searchSessionRecord.cleanDownstream.expansion.transitionDistributionsGeneratedTotal;
      const previousCleanResult = searchSessionRecord.cleanDownstream.lastResult;
      const cleanLowerBoundBefore = cleanEvidence.costChaos + (previousCleanResult
        ? genericSearchStartLowerBound(previousCleanResult, cleanStart.state, input.target)
        : 0);
      selectedSessionReuse = {
        status: retainedCleanStates > 0
          ? 'RESUMED'
          : invalidationReason === undefined ? 'COLD' : 'INVALIDATED',
        identityHash: searchIdentityHash,
        missReason: retainedCleanStates > 0 ? undefined : invalidationReason,
        retainedStates: retainedCleanStates,
        retainedTransitionDistributions:
          searchSessionRecord.cleanDownstream.expansion.transitionDistributionsGeneratedTotal,
        scope: 'CLEAN_DOWNSTREAM',
      };
      fastCleanSessionReuse = { ...selectedSessionReuse };

      const cleanProg = progressCandidates.get('clean')!;
      cleanProg.status = 'PROBING';
      cleanProg.isActive = true;
      emitProgress('CLEAN_PROBE', 'Certifying physical clean-base route', 'Clean Base Craft', true);

      fastCleanResult = new GenericSearchEngine(
        { pool, priceBook },
        input.target,
        {
          includeHarvest: harvestTags.length > 0,
          harvestTags,
          prioritizeTargetProgress: true,
          allowResearchFallbackPrices: input.allowResearchFallbackPrices ?? true,
          maxStates: cleanProbeMaxStates,
          maxWallTimeMs: fastWallTimeMs,
          maxExpansionRounds: input.searchBudget?.maxExpansionRounds ?? 3,
          searchIntent: requestedIntent === 'DEEPEN' ? 'PROVE' : requestedIntent,
          persistentExpansion: true,
          continuationSession: searchSessionRecord.cleanDownstream,
          recommendationRefinementRounds: requestedIntent === 'DEEPEN' ? 0 : 1,
          restartReacquire: {
            destination: cleanStart.state,
            acquisitionCostChaos: cleanEvidence.costChaos,
            confidence: cleanEvidence.confidence,
            provenance: cleanEvidence.provenance,
            label: 'Abandon attempt and reacquire a clean base',
          },
          onProgress: onProgress ? (ev) => {
            cleanProg.statesExpanded = ev.statesExpanded;
            cleanProg.elapsedMs = ev.elapsedMs;
            emitProgress('CLEAN_PROBE', 'Certifying physical clean-base route', `Clean Base: Round ${ev.currentRound}/${ev.totalRounds}`, false, ev.milestone);
          } : undefined,
        }
      ).search(cleanStart.state);

      cleanProg.statesExpanded = fastCleanResult.graphBuild.nodes.size;
      cleanProg.elapsedMs = fastCleanResult.searchSummary.elapsedMs;
      cleanProg.isActive = false;

      const cleanDownstreamLowerBound = genericSearchStartLowerBound(
        fastCleanResult,
        cleanStart.state,
        input.target
      );
      const cleanFullRouteLowerBound = cleanEvidence.costChaos + cleanDownstreamLowerBound;
      cleanProg.acquisitionLowerBoundChaos = cleanEvidence.costChaos;
      cleanProg.downstreamLowerBoundChaos = cleanDownstreamLowerBound;
      cleanProg.fullRouteLowerBoundChaos = cleanFullRouteLowerBound;
      cleanProg.lowerBoundChaos = cleanFullRouteLowerBound;
      cleanProg.proofReason = 'DEEPEST_COMPETITOR_LOWER_BOUND';

      const fastCertified = fastCleanResult.optimalityProof.selectedPolicyStatus ===
        'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED';
      if (fastCertified && Number.isFinite(fastCleanResult.totalExpectedCostChaos)) {
        const total = cleanEvidence.costChaos + fastCleanResult.totalExpectedCostChaos;
        cleanProg.status = 'RESOLVED';
        cleanProg.fullRouteUpperBoundChaos = total;
        if (currentBestUpperBound === undefined || total < currentBestUpperBound) {
          currentBestUpperBound = total;
          progressIncumbents.push({
            elapsedMs: Date.now() - optimizationStarted,
            upperBoundChaos: total,
            label: 'Clean Base',
          });
        }
        emitProgress('CLEAN_PROBE', 'Clean route certified', `Clean Base certified: ${total.toFixed(2)}c`, true, `Clean base certified: ${total.toFixed(2)}c`);

        const totalLowerBound = cleanFullRouteLowerBound;
        cleanProg.proofReason = 'CLEAN_ROUTE_PROVEN';

        const cleanAcquisitionMetrics: RouteMetricVector = {
          expectedChaosCost: cleanEvidence.costChaos,
          expectedPhysicalActions: 0,
          estimatedManualTimeMs: 0,
          objectiveScore: cleanEvidence.costChaos,
          effortConfidence: 'DEFAULT_APPROXIMATE',
        };
        const cleanDownstreamMetrics: RouteMetricVector = {
          expectedChaosCost: fastCleanResult.metrics?.expectedChaosCost ?? fastCleanResult.totalExpectedCostChaos,
          expectedPhysicalActions: fastCleanResult.metrics?.expectedPhysicalActions ?? 0,
          estimatedManualTimeMs: fastCleanResult.metrics?.estimatedManualTimeMs ?? 0,
          objectiveScore: fastCleanResult.metrics?.objectiveScore ?? fastCleanResult.totalExpectedCostChaos,
          effortConfidence: fastCleanResult.metrics?.effortConfidence ?? 'DEFAULT_APPROXIMATE',
        };
        const cleanMetrics: RouteMetricVector = {
          expectedChaosCost: cleanAcquisitionMetrics.expectedChaosCost + cleanDownstreamMetrics.expectedChaosCost,
          expectedPhysicalActions: cleanAcquisitionMetrics.expectedPhysicalActions + cleanDownstreamMetrics.expectedPhysicalActions,
          estimatedManualTimeMs: cleanAcquisitionMetrics.estimatedManualTimeMs + cleanDownstreamMetrics.estimatedManualTimeMs,
          objectiveScore: cleanAcquisitionMetrics.objectiveScore + cleanDownstreamMetrics.objectiveScore,
          effortConfidence: cleanDownstreamMetrics.effortConfidence,
        };

        fastCleanRoute = {
          actionId: `acquire_candidate_${cleanCandidateIndex}_clean-base_${cleanMethodIndex}`,
          name: cleanMethod.description ?? 'Start clean base: Clean Base',
          acquisitionCandidateId: `candidate_${cleanCandidateIndex}`,
          acquisitionMethodId: `clean-base_${cleanMethodIndex}`,
          expectedTotalCostChaos: total,
          lowerBoundChaos: totalLowerBound,
          incumbentUpperBoundChaos: total,
          optimalityGapChaos: Math.max(0, total - totalLowerBound),
          status: 'RESOLVED',
          couldBeatResolvedIncumbent: false,
          metrics: cleanMetrics,
          acquisitionMetrics: cleanAcquisitionMetrics,
          downstreamMetrics: cleanDownstreamMetrics,
        };
      }
      portfolioProofTranches.push({
        candidateId: `candidate_${cleanCandidateIndex}`,
        label: cleanStart.label,
        stage: 'DOWNSTREAM',
        reason: retainedCleanStates > 0
          ? 'DEEPEST_COMPETITOR_LOWER_BOUND'
          : 'RESOLVE_DOWNSTREAM_AFTER_ACQUISITION',
        allocatedMaxStates: cleanProbeMaxStates,
        allocatedMaxWallTimeMs: fastWallTimeMs,
        retainedStatesBefore: retainedCleanStates,
        retainedStatesAfter: searchSessionRecord.cleanDownstream.expansion.nodes.size,
        transitionDistributionsGeneratedBefore: generatedCleanTransitions,
        transitionDistributionsGeneratedAfter:
          searchSessionRecord.cleanDownstream.expansion.transitionDistributionsGeneratedTotal,
        lowerBoundBeforeChaos: cleanLowerBoundBefore,
        lowerBoundAfterChaos: cleanFullRouteLowerBound,
        upperBoundBeforeChaos: previousCleanResult?.optimalityProof.selectedPolicyStatus ===
            'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED'
          ? cleanEvidence.costChaos + previousCleanResult.totalExpectedCostChaos
          : undefined,
        upperBoundAfterChaos: fastCleanRoute?.expectedTotalCostChaos ?? undefined,
        outcome: fastCertified
          ? 'RESOLVED'
          : cleanFullRouteLowerBound > cleanLowerBoundBefore + 1e-9
            ? 'LOWER_BOUND_IMPROVED'
            : 'NO_PROOF_CHANGE',
      });
      if (
        fastCertified &&
        fastCleanRoute?.expectedTotalCostChaos !== null &&
        fastCleanRoute?.expectedTotalCostChaos !== undefined &&
        fractureEntries.every(({ candidateIndex }) =>
          fastCleanRoute!.expectedTotalCostChaos! <=
            structuralBounds.get(candidateIndex)!.combinedLowerBoundChaos
        )
      ) {
        stageMode = 'CLEAN_ROUTE_DOMINANCE';
        for (const { candidateIndex } of fractureEntries) {
          const bound = structuralBounds.get(candidateIndex)!;
          const pCand = progressCandidates.get(`candidate_${candidateIndex}`);
          if (pCand) pCand.status = 'DOMINATED';
          synthesisSummaries.set(candidateIndex, {
            status: 'SKIPPED_DOMINATED',
            provenance: 'ADMISSIBLE MECHANICS LOWER BOUND',
            lowerBoundChaos: bound.combinedLowerBoundChaos,
            lowerBoundEvidence: bound,
            explanation:
              `Certified clean route ${fastCleanRoute.expectedTotalCostChaos.toFixed(3)}c is no ` +
              `more expensive than the generic unavoidable acquisition lower bound ` +
              `${bound.combinedLowerBoundChaos.toFixed(3)}c (${cleanEvidence.costChaos.toFixed(3)}c ` +
              `clean base + ${bound.mandatoryMechanicsPreparationLowerBoundChaos.toFixed(3)}c ` +
              `mandatory state-creation cost; price evidence ` +
              `${bound.mechanics.components.map((component) => component.priceConfidence).join(', ') || 'none'}).`,
            cacheHit: false,
            allocatedMaxStates: 0,
            allocatedMaxWallTimeMs: 0,
            allocatedMaxExpansionRounds: stageMaxExpansionRounds,
          });
        }
        // The one terminal COMPLETE snapshot is emitted at the serialization boundary below,
        // after the final route, bounds, proof, and candidate statuses are known.
        recentMilestones.push('Clean route dominates all fracture families');
        if (recentMilestones.length > 8) recentMilestones.shift();
      }
    }

    if (stageMode === 'CLEAN_ROUTE_DOMINANCE' && fastCleanResult) {
      stageElapsedMs = fastCleanResult.searchSummary.elapsedMs;
      portfolio = buildAcquisitionPortfolio([cleanStart], input);
      result = fastCleanResult;
    } else {
      const acquisitionStarted = Date.now();

      if (fractureEntries.length > 0) {
        let incumbentFullRouteU = Math.min(
          fastCleanRoute?.expectedTotalCostChaos ?? Infinity,
          currentBestUpperBound ?? Infinity
        );

        const syncProgressFromProof = (
          candidateIndex: number,
          proofRecord: FracturePortfolioProofRecord
        ): void => {
          const pCand = progressCandidates.get(`candidate_${candidateIndex}`)!;
          const sessionKey = JSON.stringify(starts[candidateIndex].fracturedRequirement);
          const acquisitionSession = searchSessionRecord.fractureAcquisitions.get(sessionKey);
          const downstreamSession = searchSessionRecord.fractureDownstreams.get(sessionKey);
          const boundSession = searchSessionRecord.fractureDownstreamBounds.get(sessionKey)?.continuation;
          pCand.acquisitionLowerBoundChaos = proofRecord.acquisitionLowerBoundChaos;
          pCand.downstreamLowerBoundChaos = proofRecord.downstreamLowerBoundChaos;
          pCand.fullRouteLowerBoundChaos = proofRecord.fullRouteLowerBoundChaos;
          pCand.lowerBoundChaos = proofRecord.fullRouteLowerBoundChaos;
          pCand.acquisitionUpperBoundChaos = proofRecord.acquisitionUpperBoundChaos;
          pCand.downstreamUpperBoundChaos = proofRecord.downstreamUpperBoundChaos;
          pCand.fullRouteUpperBoundChaos = proofRecord.fullRouteUpperBoundChaos;
          pCand.retainedAcquisitionStates = acquisitionSession?.expansion.nodes.size ?? 0;
          pCand.retainedDownstreamStates =
            (downstreamSession?.expansion.nodes.size ?? 0) +
            (boundSession?.expansion.nodes.size ?? 0);
          pCand.retainedStates =
            (pCand.retainedAcquisitionStates ?? 0) + (pCand.retainedDownstreamStates ?? 0);
        };

        const runDownstreamBoundProbe = (
          start: StartingStateCandidate,
          candidateIndex: number,
          reason: AcquisitionPortfolioProofReason,
          allocation: { maxStates: number; maxWallTimeMs: number; maxExpansionRounds: number }
        ): void => {
          const sessionKey = JSON.stringify(start.fracturedRequirement);
          const proofRecord = searchSessionRecord.fractureProofs.get(sessionKey)!;
          let boundRecord = searchSessionRecord.fractureDownstreamBounds.get(sessionKey);
          if (
            !boundRecord ||
            Math.abs(boundRecord.restartLowerBoundChaos - proofRecord.acquisitionLowerBoundChaos) > 1e-9
          ) {
            boundRecord = {
              restartLowerBoundChaos: proofRecord.acquisitionLowerBoundChaos,
              continuation: createGenericSearchContinuationSession(),
            };
            searchSessionRecord.fractureDownstreamBounds.set(sessionKey, boundRecord);
          }
          const continuation = boundRecord.continuation;
          const retainedStatesBefore = continuation.expansion.nodes.size;
          const generatedBefore = continuation.expansion.transitionDistributionsGeneratedTotal;
          const lowerBoundBefore = proofRecord.fullRouteLowerBoundChaos;
          const pCand = progressCandidates.get(`candidate_${candidateIndex}`)!;
          pCand.status = 'DOWNSTREAM_PROBING';
          pCand.proofReason = reason;
          pCand.isActive = true;
          emitProgress(
            'FRACTURE_DEEPEN',
            'Strengthening admissible full-route bound',
            `Full-route bound: ${start.label}`,
            true
          );
          const boundResult = new GenericSearchEngine(
            { pool, priceBook },
            input.target,
            {
              includeHarvest: harvestTags.length > 0,
              harvestTags,
              prioritizeTargetProgress: true,
              allowResearchFallbackPrices: input.allowResearchFallbackPrices ?? true,
              maxStates: allocation.maxStates,
              maxWallTimeMs: allocation.maxWallTimeMs,
              maxExpansionRounds: allocation.maxExpansionRounds,
              searchIntent: 'PROVE',
              persistentExpansion: true,
              continuationSession: continuation,
              recommendationRefinementRounds: 0,
              restartReacquire: {
                destination: start.state,
                acquisitionCostChaos: proofRecord.acquisitionLowerBoundChaos,
                confidence: 'research-fallback',
                provenance:
                  'Admissible Phase 2L downstream bound restart priced at the independently ' +
                  'admissible acquisition lower bound.',
                label: `Optimistic reacquisition lower bound for ${start.label}`,
              },
            }
          ).search(start.state);
          const downstreamLowerBound = genericSearchStartLowerBound(
            boundResult,
            start.state,
            input.target
          );
          proofRecord.downstreamLowerBoundChaos = Math.max(
            proofRecord.downstreamLowerBoundChaos,
            downstreamLowerBound
          );
          proofRecord.fullRouteLowerBoundChaos =
            proofRecord.acquisitionLowerBoundChaos + proofRecord.downstreamLowerBoundChaos;
          proofRecord.lastAllocatedStage = 'DOWNSTREAM_BOUND';
          syncProgressFromProof(candidateIndex, proofRecord);
          pCand.isActive = false;
          const improved = proofRecord.fullRouteLowerBoundChaos > lowerBoundBefore + 1e-9;
          portfolioProofTranches.push({
            candidateId: `candidate_${candidateIndex}`,
            label: start.label,
            stage: 'DOWNSTREAM_BOUND',
            reason,
            allocatedMaxStates: allocation.maxStates,
            allocatedMaxWallTimeMs: allocation.maxWallTimeMs,
            retainedStatesBefore,
            retainedStatesAfter: continuation.expansion.nodes.size,
            transitionDistributionsGeneratedBefore: generatedBefore,
            transitionDistributionsGeneratedAfter:
              continuation.expansion.transitionDistributionsGeneratedTotal,
            lowerBoundBeforeChaos: lowerBoundBefore,
            lowerBoundAfterChaos: proofRecord.fullRouteLowerBoundChaos,
            upperBoundBeforeChaos: proofRecord.fullRouteUpperBoundChaos,
            upperBoundAfterChaos: proofRecord.fullRouteUpperBoundChaos,
            outcome: improved ? 'LOWER_BOUND_IMPROVED' : 'NO_PROOF_CHANGE',
          });
          stageTotalStateBudget += allocation.maxStates;
          stageTotalWallTimeBudgetMs += allocation.maxWallTimeMs;
          if (improved) {
            emitProgress(
              'FRACTURE_DEEPEN',
              'Stronger full-route lower bound',
              `${start.label}: L ${proofRecord.fullRouteLowerBoundChaos.toFixed(2)}c`,
              true,
              `Stronger full-route L for ${start.label}: ${proofRecord.fullRouteLowerBoundChaos.toFixed(2)}c`
            );
          }
        };
        const stagesAllocatedThisRequest = new Set<string>();
        const proofDirectedResume = input.searchIntent === 'DEEPEN' &&
          fractureEntries.some(({ start }) => {
            const sessionKey = JSON.stringify(start.fracturedRequirement);
            const proofRecord = searchSessionRecord.fractureProofs.get(sessionKey);
            return proofRecord?.acquisition !== undefined ||
              (searchSessionRecord.fractureAcquisitions.get(sessionKey)?.expansion.nodes.size ?? 0) > 0 ||
              (searchSessionRecord.fractureDownstreams.get(sessionKey)?.expansion.nodes.size ?? 0) > 0;
          });

        // Establish an independently admissible downstream contribution for every fracture
        // family. This graph uses the actual reusable fractured state and an optimistic restart
        // price equal to acquisition L, so it cannot overstate full-route L.
        for (const { start, candidateIndex } of fractureEntries) {
          const sessionKey = JSON.stringify(start.fracturedRequirement);
          const proofRecord = searchSessionRecord.fractureProofs.get(sessionKey)!;
          if (proofRecord.downstreamLowerBoundChaos > 0) continue;
          if (searchStopDeadline - Date.now() < 3_000) break;
          runDownstreamBoundProbe(start, candidateIndex, 'DEEPEST_COMPETITOR_LOWER_BOUND', {
            maxStates: Math.min(750, input.searchBudget?.maxStates ?? 5_000),
            maxWallTimeMs: 600,
            maxExpansionRounds: 1,
          });
          stagesAllocatedThisRequest.add(`${sessionKey}:DOWNSTREAM_BOUND`);
        }

        // Generic best-bound order; exact target identity is only a stable tie-breaker.
        const sortedFractureEntries = [...fractureEntries].sort(
          (a, b) => {
            const aKey = JSON.stringify(a.start.fracturedRequirement);
            const bKey = JSON.stringify(b.start.fracturedRequirement);
            return searchSessionRecord.fractureProofs.get(aKey)!.fullRouteLowerBoundChaos -
              searchSessionRecord.fractureProofs.get(bKey)!.fullRouteLowerBoundChaos ||
              aKey.localeCompare(bKey);
          }
        );
        const initialProbeEntries = proofDirectedResume
          ? sortedFractureEntries.filter(({ start }) => {
              const sessionKey = JSON.stringify(start.fracturedRequirement);
              return searchSessionRecord.fractureProofs.get(sessionKey)?.acquisitionUpperBoundChaos === undefined;
            }).slice(0, 1)
          : sortedFractureEntries;

        // RECOMMEND gives every family one bounded feasibility pass. Resumed DEEPEN gives this
        // pass only to the strongest unresolved acquisition competitor before directed scheduling.
        for (const { start, candidateIndex } of initialProbeEntries) {
          const sessionKey = JSON.stringify(start.fracturedRequirement);
          const proofRecord = searchSessionRecord.fractureProofs.get(sessionKey)!;
          const pCand = progressCandidates.get(`candidate_${candidateIndex}`)!;
          if (proofRecord.fullRouteLowerBoundChaos >= incumbentFullRouteU) {
            pCand.status = 'DOMINATED';
            pCand.proofReason = 'DOMINATED_BY_FULL_ROUTE_BOUND';
            continue;
          }
          if (Date.now() >= searchStopDeadline) {
            pCand.status = pCand.retainedStates > 0 ? 'UNRESOLVED' : 'NOT_STARTED';
            break;
          }
          let acqSession = searchSessionRecord.fractureAcquisitions.get(sessionKey);
          if (!acqSession) {
            acqSession = createGenericSearchContinuationSession();
            searchSessionRecord.fractureAcquisitions.set(sessionKey, acqSession);
          }

          const retainedAcquisitionStatesBefore = acqSession.expansion.nodes.size;
          const generatedAcquisitionBefore =
            acqSession.expansion.transitionDistributionsGeneratedTotal;
          const acquisitionLowerBoundBefore = proofRecord.fullRouteLowerBoundChaos;
          const acquisitionUpperBoundBefore = proofRecord.fullRouteUpperBoundChaos;
          pCand.status = 'ACQUISITION_PROBING';
          pCand.proofReason = 'RESOLVE_ACQUISITION_BEFORE_DOWNSTREAM';
          pCand.isActive = true;
          emitProgress('FRACTURE_PROBE', 'Probing self-fracture acquisition', `Probing: ${start.label}`, true);

          const timeRemaining = Math.max(1_000, searchStopDeadline - Date.now() - 2_500);
          const probeWallTimeMs = Math.min(5_000, Math.max(1_000, Math.floor(timeRemaining / (sortedFractureEntries.length + 1))));
          const probeAllocation = {
            maxStates: Math.min(5_001, input.searchBudget?.maxStates ?? 5_000),
            maxWallTimeMs: probeWallTimeMs,
            maxExpansionRounds: 3,
          };

          const synthesis = synthesizeAcquisition(
            { pool, priceBook },
            {
              cleanStartingState: cleanStart.state,
              desiredPhysicalState: { fracturedMod: start.fracturedRequirement! },
              cleanBaseAcquisition: cleanEvidence,
              searchBudget: probeAllocation,
              allowResearchFallbackPrices: input.allowResearchFallbackPrices ?? true,
              searchIntent: input.searchIntent ?? 'RECOMMEND',
              continuationSession: acqSession,
              persistentExpansion: true,
              onProgress: onProgress ? (ev) => {
                pCand.statesExpanded = ev.statesExpanded;
                pCand.elapsedMs = ev.elapsedMs;
                emitProgress('FRACTURE_PROBE', 'Probing self-fracture acquisition', `${start.label}: ${ev.statesExpanded} states`, false, ev.milestone);
              } : undefined,
            }
          );
          stagesAllocatedThisRequest.add(`${sessionKey}:ACQUISITION`);

          stageAttemptedCandidates++;
          stageTotalStateBudget += probeAllocation.maxStates;
          stageTotalWallTimeBudgetMs += probeAllocation.maxWallTimeMs;
          pCand.statesExpanded = synthesis.search.statesExpanded;
          pCand.elapsedMs = synthesis.search.elapsedMs;
          if (proofRecord.acquisition?.status !== 'RESOLVED' || synthesis.status === 'RESOLVED') {
            proofRecord.acquisition = synthesis;
          }
          proofRecord.acquisitionLowerBoundChaos = Math.max(
            proofRecord.acquisitionLowerBoundChaos,
            synthesis.lowerBoundChaos
          );
          proofRecord.acquisitionModeledOptimal = synthesis.proof.modeledActionOptimalityProven;
          if (synthesis.status === 'RESOLVED' && synthesis.expectedCostChaos !== undefined) {
            proofRecord.acquisitionUpperBoundChaos = synthesis.expectedCostChaos;
          }
          proofRecord.fullRouteLowerBoundChaos =
            proofRecord.acquisitionLowerBoundChaos + proofRecord.downstreamLowerBoundChaos;
          proofRecord.lastAllocatedStage = 'ACQUISITION';
          syncProgressFromProof(candidateIndex, proofRecord);
          synthesisSummaries.set(
            candidateIndex,
            summarizeSynthesis(synthesis, probeAllocation, false, sessionKey)
          );
          portfolioProofTranches.push({
            candidateId: `candidate_${candidateIndex}`,
            label: start.label,
            stage: 'ACQUISITION',
            reason: 'RESOLVE_ACQUISITION_BEFORE_DOWNSTREAM',
            allocatedMaxStates: probeAllocation.maxStates,
            allocatedMaxWallTimeMs: probeAllocation.maxWallTimeMs,
            retainedStatesBefore: retainedAcquisitionStatesBefore,
            retainedStatesAfter: acqSession.expansion.nodes.size,
            transitionDistributionsGeneratedBefore: generatedAcquisitionBefore,
            transitionDistributionsGeneratedAfter:
              acqSession.expansion.transitionDistributionsGeneratedTotal,
            lowerBoundBeforeChaos: acquisitionLowerBoundBefore,
            lowerBoundAfterChaos: proofRecord.fullRouteLowerBoundChaos,
            upperBoundBeforeChaos: acquisitionUpperBoundBefore,
            upperBoundAfterChaos: proofRecord.fullRouteUpperBoundChaos,
            outcome: synthesis.status === 'RESOLVED'
              ? 'RESOLVED'
              : proofRecord.fullRouteLowerBoundChaos > acquisitionLowerBoundBefore + 1e-9
                ? 'LOWER_BOUND_IMPROVED'
                : 'NO_PROOF_CHANGE',
          });

          if (synthesis.status === 'RESOLVED' && synthesis.expectedCostChaos !== undefined) {
            synthesisResults.set(candidateIndex, synthesis);
            pCand.status = 'ACQUISITION_RESOLVED';
            pCand.acquisitionUpperBoundChaos = synthesis.expectedCostChaos;
            emitProgress('FRACTURE_PROBE', 'Self-fracture acquisition resolved', `Acquisition resolved: ${start.label} (${synthesis.expectedCostChaos.toFixed(2)}c)`, true, `Acquisition resolved: ${start.label} (${synthesis.expectedCostChaos.toFixed(2)}c)`);

            // Evaluate downstream from this fractured state with accurate restart cost
            let downSession = searchSessionRecord.fractureDownstreams.get(sessionKey);
            if (!downSession) {
              downSession = createGenericSearchContinuationSession();
              searchSessionRecord.fractureDownstreams.set(sessionKey, downSession);
            }
            const retainedDownstreamStates = downSession.expansion.nodes.size;
            const generatedDownstreamBefore =
              downSession.expansion.transitionDistributionsGeneratedTotal;
            const downstreamLowerBoundBefore = proofRecord.fullRouteLowerBoundChaos;
            const downstreamUpperBoundBefore = proofRecord.fullRouteUpperBoundChaos;
            const downstreamSessionReuse: SearchSessionReuseSummary = {
              status: retainedDownstreamStates > 0
                ? 'RESUMED'
                : invalidationReason === undefined ? 'COLD' : 'INVALIDATED',
              identityHash: searchIdentityHash,
              missReason: retainedDownstreamStates > 0 ? undefined : invalidationReason,
              retainedStates: retainedDownstreamStates,
              retainedTransitionDistributions:
                downSession.expansion.transitionDistributionsGeneratedTotal,
              scope: 'FRACTURE_DOWNSTREAM',
            };
            pCand.status = 'DOWNSTREAM_PROBING';
            pCand.proofReason = 'RESOLVE_DOWNSTREAM_AFTER_ACQUISITION';
            pCand.isActive = true;
            emitProgress('DOWNSTREAM_SOLVE', 'Solving downstream craft from fractured state', `Downstream: ${start.label}`, true);

            const downWallTimeMs = Math.min(8_000, Math.max(1_000, searchStopDeadline - Date.now() - 1_500));
            const downstreamResult = new GenericSearchEngine(
              { pool, priceBook },
              input.target,
              {
                includeHarvest: harvestTags.length > 0,
                harvestTags,
                prioritizeTargetProgress: true,
                allowResearchFallbackPrices: input.allowResearchFallbackPrices ?? true,
                maxStates: input.searchBudget?.maxStates ?? 5_000,
                maxWallTimeMs: downWallTimeMs,
                maxExpansionRounds: input.searchBudget?.maxExpansionRounds ?? 3,
                searchIntent: input.searchIntent ?? 'RECOMMEND',
                persistentExpansion: true,
                continuationSession: downSession,
                recommendationRefinementRounds: 1,
                restartReacquire: {
                  destination: start.state,
                  acquisitionCostChaos: synthesis.expectedCostChaos,
                  confidence: 'research-fallback',
                  provenance: 'Self-fracture acquisition',
                  label: `Abandon attempt and reacquire self-fracture ${start.label}`,
                },
              }
            ).search(start.state);
            stagesAllocatedThisRequest.add(`${sessionKey}:DOWNSTREAM`);

            proofRecord.downstream = downstreamResult;
            proofRecord.downstreamModeledOptimal = genericSearchModeledOptimal(downstreamResult);
            proofRecord.lastAllocatedStage = 'DOWNSTREAM';
            stageTotalStateBudget += input.searchBudget?.maxStates ?? 5_000;
            stageTotalWallTimeBudgetMs += downWallTimeMs;

            if (
              downstreamResult.optimalityProof.selectedPolicyStatus === 'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED' &&
              Number.isFinite(downstreamResult.totalExpectedCostChaos)
            ) {
              const fullRouteCost = synthesis.expectedCostChaos + downstreamResult.totalExpectedCostChaos;
              pCand.status = 'FULL_ROUTE_RESOLVED';
              pCand.downstreamUpperBoundChaos = downstreamResult.totalExpectedCostChaos;
              pCand.fullRouteUpperBoundChaos = fullRouteCost;
              proofRecord.downstreamUpperBoundChaos = downstreamResult.totalExpectedCostChaos;
              proofRecord.fullRouteUpperBoundChaos = fullRouteCost;
              if (fullRouteCost < incumbentFullRouteU) {
                incumbentFullRouteU = fullRouteCost;
                currentBestUpperBound = fullRouteCost;
                bestFractureDownstreamResult = downstreamResult;
                bestFractureCandidateIndex = candidateIndex;
                bestFractureSessionReuse = downstreamSessionReuse;
                progressIncumbents.push({
                  elapsedMs: Date.now() - optimizationStarted,
                  upperBoundChaos: fullRouteCost,
                  label: start.label,
                });
                emitProgress(
                  'DOWNSTREAM_SOLVE',
                  'New incumbent; reconsidering all competitors',
                  `New best route: ${start.label} (${fullRouteCost.toFixed(2)}c)`,
                  true,
                  `New incumbent ${start.label}: ${fullRouteCost.toFixed(2)}c; competitors reprioritized`
                );
              }
            }
            syncProgressFromProof(candidateIndex, proofRecord);
            portfolioProofTranches.push({
              candidateId: `candidate_${candidateIndex}`,
              label: start.label,
              stage: 'DOWNSTREAM',
              reason: 'RESOLVE_DOWNSTREAM_AFTER_ACQUISITION',
              allocatedMaxStates: input.searchBudget?.maxStates ?? 5_000,
              allocatedMaxWallTimeMs: downWallTimeMs,
              retainedStatesBefore: retainedDownstreamStates,
              retainedStatesAfter: downSession.expansion.nodes.size,
              transitionDistributionsGeneratedBefore: generatedDownstreamBefore,
              transitionDistributionsGeneratedAfter:
                downSession.expansion.transitionDistributionsGeneratedTotal,
              lowerBoundBeforeChaos: downstreamLowerBoundBefore,
              lowerBoundAfterChaos: proofRecord.fullRouteLowerBoundChaos,
              upperBoundBeforeChaos: downstreamUpperBoundBefore,
              upperBoundAfterChaos: proofRecord.fullRouteUpperBoundChaos,
              outcome: proofRecord.fullRouteUpperBoundChaos !== undefined &&
                  downstreamUpperBoundBefore === undefined
                ? 'RESOLVED'
                : proofRecord.fullRouteUpperBoundChaos !== undefined &&
                    (downstreamUpperBoundBefore ?? Infinity) >
                      proofRecord.fullRouteUpperBoundChaos + 1e-9
                  ? 'UPPER_BOUND_IMPROVED'
                  : 'NO_PROOF_CHANGE',
            });
          }
          pCand.isActive = false;
        }

        // Incumbent-directed proof work. Every stage is allocated at most once per request;
        // Retry Deeper resumes the exact acquisition or downstream graph that still carries debt.
        while (searchStopDeadline - Date.now() > 2_500) {
          const competitive = fractureEntries
            .filter(({ start, candidateIndex }) => {
              if (candidateIndex === bestFractureCandidateIndex) return false;
              const sessionKey = JSON.stringify(start.fracturedRequirement);
              const proofRecord = searchSessionRecord.fractureProofs.get(sessionKey)!;
              return proofRecord.fullRouteLowerBoundChaos < incumbentFullRouteU;
            })
            .sort((a, b) => {
              const aKey = JSON.stringify(a.start.fracturedRequirement);
              const bKey = JSON.stringify(b.start.fracturedRequirement);
              return searchSessionRecord.fractureProofs.get(aKey)!.fullRouteLowerBoundChaos -
                searchSessionRecord.fractureProofs.get(bKey)!.fullRouteLowerBoundChaos ||
                aKey.localeCompare(bKey);
            });
          if (competitive.length === 0) break;

          let allocationTarget: {
            start: StartingStateCandidate;
            candidateIndex: number;
            stage: 'ACQUISITION' | 'DOWNSTREAM' | 'DOWNSTREAM_BOUND';
            reason: AcquisitionPortfolioProofReason;
          } | undefined;
          for (const { start, candidateIndex } of competitive) {
            const sessionKey = JSON.stringify(start.fracturedRequirement);
            const proofRecord = searchSessionRecord.fractureProofs.get(sessionKey)!;
            const acquisitionGap = proofRecord.acquisitionUpperBoundChaos === undefined
              ? Infinity
              : Math.max(0, proofRecord.acquisitionUpperBoundChaos -
                  proofRecord.acquisitionLowerBoundChaos);
            const downstreamGap = proofRecord.downstreamUpperBoundChaos === undefined
              ? Infinity
              : Math.max(0, proofRecord.downstreamUpperBoundChaos -
                  proofRecord.downstreamLowerBoundChaos);
            const preferredStage = proofRecord.acquisitionUpperBoundChaos === undefined
              ? 'ACQUISITION' as const
              : proofRecord.downstreamUpperBoundChaos === undefined
                ? 'DOWNSTREAM' as const
                : acquisitionGap >= downstreamGap
                  ? 'ACQUISITION' as const
                  : 'DOWNSTREAM_BOUND' as const;
            const fallbacks: Array<'ACQUISITION' | 'DOWNSTREAM' | 'DOWNSTREAM_BOUND'> =
              preferredStage === 'ACQUISITION'
                ? ['ACQUISITION', 'DOWNSTREAM_BOUND', 'DOWNSTREAM']
                : preferredStage === 'DOWNSTREAM'
                  ? ['DOWNSTREAM', 'DOWNSTREAM_BOUND', 'ACQUISITION']
                  : ['DOWNSTREAM_BOUND', 'ACQUISITION', 'DOWNSTREAM'];
            const stage = fallbacks.find(
              (candidateStage) => !stagesAllocatedThisRequest.has(`${sessionKey}:${candidateStage}`) &&
                (candidateStage !== 'DOWNSTREAM' ||
                  proofRecord.acquisitionUpperBoundChaos !== undefined)
            );
            if (!stage) continue;
            allocationTarget = {
              start,
              candidateIndex,
              stage,
              reason: stage === 'ACQUISITION'
                ? proofRecord.acquisitionUpperBoundChaos === undefined
                  ? 'RESOLVE_ACQUISITION_BEFORE_DOWNSTREAM'
                  : 'DEEPEST_ACQUISITION_PROOF_DEBT'
                : stage === 'DOWNSTREAM'
                  ? 'RESOLVE_DOWNSTREAM_AFTER_ACQUISITION'
                  : 'DEEPEST_DOWNSTREAM_PROOF_DEBT',
            };
            break;
          }
          if (!allocationTarget) break;

          const { start, candidateIndex, stage, reason } = allocationTarget;
          const sessionKey = JSON.stringify(start.fracturedRequirement);
          const proofRecord = searchSessionRecord.fractureProofs.get(sessionKey)!;
          const remaining = searchStopDeadline - Date.now() - 1_500;
          const allocatedWallTimeMs = Math.min(12_000, Math.max(1_000, remaining));
          const allocatedMaxStates = input.searchBudget?.maxStates ?? 5_000;
          const allocatedMaxExpansionRounds = input.searchBudget?.maxExpansionRounds ?? 3;
          stagesAllocatedThisRequest.add(`${sessionKey}:${stage}`);

          if (stage === 'DOWNSTREAM_BOUND') {
            runDownstreamBoundProbe(start, candidateIndex, reason, {
              maxStates: allocatedMaxStates,
              maxWallTimeMs: allocatedWallTimeMs,
              maxExpansionRounds: allocatedMaxExpansionRounds,
            });
            continue;
          }

          const pCand = progressCandidates.get(`candidate_${candidateIndex}`)!;
          if (stage === 'ACQUISITION') {
            let acqSession = searchSessionRecord.fractureAcquisitions.get(sessionKey);
            if (!acqSession) {
              acqSession = createGenericSearchContinuationSession();
              searchSessionRecord.fractureAcquisitions.set(sessionKey, acqSession);
            }
            const retainedBefore = acqSession.expansion.nodes.size;
            const generatedBefore = acqSession.expansion.transitionDistributionsGeneratedTotal;
            const lowerBefore = proofRecord.fullRouteLowerBoundChaos;
            const upperBefore = proofRecord.fullRouteUpperBoundChaos;
            pCand.status = 'ACQUISITION_PROBING';
            pCand.proofReason = reason;
            pCand.isActive = true;
            emitProgress(
              'FRACTURE_DEEPEN',
              'Deepening competitive acquisition proof',
              `Acquisition proof: ${start.label}`,
              true
            );
            const allocation = {
              maxStates: allocatedMaxStates,
              maxWallTimeMs: allocatedWallTimeMs,
              maxExpansionRounds: allocatedMaxExpansionRounds,
            };
            const synthesis = synthesizeAcquisition(
              { pool, priceBook },
              {
                cleanStartingState: cleanStart.state,
                desiredPhysicalState: { fracturedMod: start.fracturedRequirement! },
                cleanBaseAcquisition: cleanEvidence,
                searchBudget: allocation,
                allowResearchFallbackPrices: input.allowResearchFallbackPrices ?? true,
                searchIntent: input.searchIntent ?? 'DEEPEN',
                continuationSession: acqSession,
                persistentExpansion: true,
              }
            );
            stageAttemptedCandidates++;
            stageTotalStateBudget += allocation.maxStates;
            stageTotalWallTimeBudgetMs += allocation.maxWallTimeMs;
            proofRecord.acquisitionLowerBoundChaos = Math.max(
              proofRecord.acquisitionLowerBoundChaos,
              synthesis.lowerBoundChaos
            );
            proofRecord.fullRouteLowerBoundChaos =
              proofRecord.acquisitionLowerBoundChaos + proofRecord.downstreamLowerBoundChaos;
            proofRecord.acquisitionModeledOptimal = synthesis.proof.modeledActionOptimalityProven;
            if (proofRecord.acquisition?.status !== 'RESOLVED' || synthesis.status === 'RESOLVED') {
              proofRecord.acquisition = synthesis;
            }
            if (synthesis.status === 'RESOLVED' && synthesis.expectedCostChaos !== undefined) {
              proofRecord.acquisitionUpperBoundChaos = synthesis.expectedCostChaos;
              synthesisResults.set(candidateIndex, synthesis);
            }
            synthesisSummaries.set(
              candidateIndex,
              summarizeSynthesis(synthesis, allocation, false, sessionKey)
            );
            proofRecord.lastAllocatedStage = 'ACQUISITION';
            syncProgressFromProof(candidateIndex, proofRecord);
            pCand.status = proofRecord.acquisitionUpperBoundChaos === undefined
              ? 'COMPETITIVE_UNRESOLVED'
              : proofRecord.fullRouteUpperBoundChaos === undefined
                ? 'ACQUISITION_RESOLVED'
                : 'FULL_ROUTE_RESOLVED';
            pCand.isActive = false;
            const outcome: AcquisitionPortfolioProofTranche['outcome'] =
              upperBefore === undefined && proofRecord.acquisitionUpperBoundChaos !== undefined
                ? 'RESOLVED'
                : proofRecord.fullRouteLowerBoundChaos > lowerBefore + 1e-9
                  ? 'LOWER_BOUND_IMPROVED'
                  : 'NO_PROOF_CHANGE';
            portfolioProofTranches.push({
              candidateId: `candidate_${candidateIndex}`,
              label: start.label,
              stage,
              reason,
              allocatedMaxStates,
              allocatedMaxWallTimeMs: allocatedWallTimeMs,
              retainedStatesBefore: retainedBefore,
              retainedStatesAfter: acqSession.expansion.nodes.size,
              transitionDistributionsGeneratedBefore: generatedBefore,
              transitionDistributionsGeneratedAfter:
                acqSession.expansion.transitionDistributionsGeneratedTotal,
              lowerBoundBeforeChaos: lowerBefore,
              lowerBoundAfterChaos: proofRecord.fullRouteLowerBoundChaos,
              upperBoundBeforeChaos: upperBefore,
              upperBoundAfterChaos: proofRecord.fullRouteUpperBoundChaos,
              outcome,
            });
            if (outcome === 'RESOLVED') {
              emitProgress(
                'FRACTURE_DEEPEN',
                'Competitive acquisition resolved',
                `Acquisition resolved: ${start.label}`,
                true,
                `Acquisition resolved: ${start.label}`
              );
            }
            continue;
          }

          const acquisition = proofRecord.acquisition;
          if (
            !acquisition || acquisition.status !== 'RESOLVED' ||
            acquisition.expectedCostChaos === undefined
          ) continue;
          let downSession = searchSessionRecord.fractureDownstreams.get(sessionKey);
          if (!downSession) {
            downSession = createGenericSearchContinuationSession();
            searchSessionRecord.fractureDownstreams.set(sessionKey, downSession);
          }
          const retainedBefore = downSession.expansion.nodes.size;
          const generatedBefore = downSession.expansion.transitionDistributionsGeneratedTotal;
          const lowerBefore = proofRecord.fullRouteLowerBoundChaos;
          const upperBefore = proofRecord.fullRouteUpperBoundChaos;
          pCand.status = 'DOWNSTREAM_PROBING';
          pCand.proofReason = reason;
          pCand.isActive = true;
          emitProgress(
            'DOWNSTREAM_SOLVE',
            'Deepening competitive downstream policy',
            `Downstream proof: ${start.label}`,
            true
          );
          const downstreamResult = new GenericSearchEngine(
            { pool, priceBook },
            input.target,
            {
              includeHarvest: harvestTags.length > 0,
              harvestTags,
              prioritizeTargetProgress: true,
              allowResearchFallbackPrices: input.allowResearchFallbackPrices ?? true,
              maxStates: allocatedMaxStates,
              maxWallTimeMs: allocatedWallTimeMs,
              maxExpansionRounds: allocatedMaxExpansionRounds,
              searchIntent: input.searchIntent ?? 'DEEPEN',
              persistentExpansion: true,
              continuationSession: downSession,
              recommendationRefinementRounds: 1,
              restartReacquire: {
                destination: start.state,
                acquisitionCostChaos: acquisition.expectedCostChaos,
                confidence: 'research-fallback',
                provenance: 'Self-fracture acquisition',
                label: `Abandon attempt and reacquire self-fracture ${start.label}`,
              },
            }
          ).search(start.state);
          stageTotalStateBudget += allocatedMaxStates;
          stageTotalWallTimeBudgetMs += allocatedWallTimeMs;
          proofRecord.downstream = downstreamResult;
          proofRecord.downstreamModeledOptimal = genericSearchModeledOptimal(downstreamResult);
          if (
            downstreamResult.optimalityProof.selectedPolicyStatus ===
                'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED' &&
            Number.isFinite(downstreamResult.totalExpectedCostChaos)
          ) {
            proofRecord.downstreamUpperBoundChaos = downstreamResult.totalExpectedCostChaos;
            proofRecord.fullRouteUpperBoundChaos =
              acquisition.expectedCostChaos + downstreamResult.totalExpectedCostChaos;
            if (proofRecord.fullRouteUpperBoundChaos < incumbentFullRouteU) {
              incumbentFullRouteU = proofRecord.fullRouteUpperBoundChaos;
              currentBestUpperBound = incumbentFullRouteU;
              bestFractureDownstreamResult = downstreamResult;
              bestFractureCandidateIndex = candidateIndex;
              bestFractureSessionReuse = {
                status: retainedBefore > 0 ? 'RESUMED' : 'COLD',
                identityHash: searchIdentityHash,
                retainedStates: retainedBefore,
                retainedTransitionDistributions: generatedBefore,
                scope: 'FRACTURE_DOWNSTREAM',
              };
              progressIncumbents.push({
                elapsedMs: Date.now() - optimizationStarted,
                upperBoundChaos: incumbentFullRouteU,
                label: start.label,
              });
              emitProgress(
                'DOWNSTREAM_SOLVE',
                'New incumbent; reconsidering all competitors',
                `New best route: ${start.label} (${incumbentFullRouteU.toFixed(2)}c)`,
                true,
                `New incumbent ${start.label}: ${incumbentFullRouteU.toFixed(2)}c; competitors reprioritized`
              );
            }
          }
          proofRecord.lastAllocatedStage = 'DOWNSTREAM';
          syncProgressFromProof(candidateIndex, proofRecord);
          pCand.status = proofRecord.fullRouteUpperBoundChaos === undefined
            ? 'COMPETITIVE_UNRESOLVED'
            : 'FULL_ROUTE_RESOLVED';
          pCand.isActive = false;
          const outcome: AcquisitionPortfolioProofTranche['outcome'] =
            upperBefore === undefined && proofRecord.fullRouteUpperBoundChaos !== undefined
              ? 'RESOLVED'
              : proofRecord.fullRouteUpperBoundChaos !== undefined &&
                  (upperBefore ?? Infinity) > proofRecord.fullRouteUpperBoundChaos + 1e-9
                ? 'UPPER_BOUND_IMPROVED'
                : 'NO_PROOF_CHANGE';
          portfolioProofTranches.push({
            candidateId: `candidate_${candidateIndex}`,
            label: start.label,
            stage,
            reason,
            allocatedMaxStates,
            allocatedMaxWallTimeMs: allocatedWallTimeMs,
            retainedStatesBefore: retainedBefore,
            retainedStatesAfter: downSession.expansion.nodes.size,
            transitionDistributionsGeneratedBefore: generatedBefore,
            transitionDistributionsGeneratedAfter:
              downSession.expansion.transitionDistributionsGeneratedTotal,
            lowerBoundBeforeChaos: lowerBefore,
            lowerBoundAfterChaos: proofRecord.fullRouteLowerBoundChaos,
            upperBoundBeforeChaos: upperBefore,
            upperBoundAfterChaos: proofRecord.fullRouteUpperBoundChaos,
            outcome,
          });
        }

        // Reconcile every family immediately against the final incumbent from this request.
        for (const { start, candidateIndex } of fractureEntries) {
          const pCand = progressCandidates.get(`candidate_${candidateIndex}`);
          const sessionKey = JSON.stringify(start.fracturedRequirement);
          const proofRecord = searchSessionRecord.fractureProofs.get(sessionKey)!;
          syncProgressFromProof(candidateIndex, proofRecord);
          if (pCand && proofRecord.fullRouteLowerBoundChaos >= incumbentFullRouteU) {
            pCand.status = 'DOMINATED';
            pCand.proofReason = 'DOMINATED_BY_FULL_ROUTE_BOUND';
          } else if (pCand && candidateIndex !== bestFractureCandidateIndex) {
            pCand.status = 'COMPETITIVE_UNRESOLVED';
            pCand.proofReason = 'CAN_STILL_BEAT_INCUMBENT';
          }
        }

        // Mark winner
        if (bestFractureCandidateIndex !== undefined) {
          const winnerCand = progressCandidates.get(`candidate_${bestFractureCandidateIndex}`);
          if (winnerCand) {
            winnerCand.status = 'SELECTED';
            winnerCand.proofReason = 'SELECTED_EXECUTABLE_ROUTE';
          }
        }
      }
      stageElapsedMs = (fastCleanResult?.searchSummary.elapsedMs ?? 0) +
        (Date.now() - acquisitionStarted);
      portfolio = buildAcquisitionPortfolio(starts, input, synthesisResults);
      const downstreamResult = runDownstreamSearch(
        portfolio,
        Math.max(1, searchStopDeadline - Date.now())
      );
      const downstreamCertified = downstreamResult.optimalityProof.selectedPolicyStatus ===
        'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED';
      if (downstreamCertified) {
        result = downstreamResult;
      } else if (bestFractureDownstreamResult) {
        stageMode = 'EXECUTABLE_SYNTHESIS';
        result = bestFractureDownstreamResult;
      } else if (fastCleanResult && fastCleanRoute) {
        stageMode = 'CLEAN_EXECUTABLE_PROVISIONAL';
        result = fastCleanResult;
        if (fastCleanSessionReuse) selectedSessionReuse = fastCleanSessionReuse;
      } else {
        result = downstreamResult;
      }
    }

    const usesDirectCleanPolicy = stageMode === 'CLEAN_ROUTE_DOMINANCE' ||
      stageMode === 'CLEAN_EXECUTABLE_PROVISIONAL';
    const usesDirectFracturePolicy = stageMode === 'EXECUTABLE_SYNTHESIS' &&
      bestFractureCandidateIndex !== undefined &&
      bestFractureDownstreamResult !== undefined;
    if (usesDirectFracturePolicy && bestFractureSessionReuse) {
      selectedSessionReuse = bestFractureSessionReuse;
    }

    const bestFractureSynthesis = usesDirectFracturePolicy
      ? synthesisResults.get(bestFractureCandidateIndex!)
      : undefined;
    const bestFractureTotalCost = usesDirectFracturePolicy && bestFractureSynthesis?.expectedCostChaos !== undefined && bestFractureDownstreamResult?.totalExpectedCostChaos !== undefined
      ? bestFractureSynthesis.expectedCostChaos + bestFractureDownstreamResult.totalExpectedCostChaos
      : undefined;
    const bestFractureProofRecord = bestFractureCandidateIndex === undefined
      ? undefined
      : searchSessionRecord.fractureProofs.get(
          JSON.stringify(starts[bestFractureCandidateIndex].fracturedRequirement)
        );

    const bestFractureAcquisitionMetrics: RouteMetricVector | undefined =
      bestFractureSynthesis && bestFractureSynthesis.expectedCostChaos !== undefined
        ? {
            expectedChaosCost: bestFractureSynthesis.expectedCostChaos,
            expectedPhysicalActions: bestFractureSynthesis.expectedPhysicalActions ?? 0,
            estimatedManualTimeMs: bestFractureSynthesis.estimatedManualTimeMs ?? 0,
            objectiveScore: bestFractureSynthesis.expectedCostChaos,
            effortConfidence: 'DEFAULT_APPROXIMATE',
          }
        : undefined;

    const bestFractureDownstreamMetrics: RouteMetricVector | undefined =
      bestFractureDownstreamResult
        ? {
            expectedChaosCost:
              bestFractureDownstreamResult.metrics?.expectedChaosCost ??
              bestFractureDownstreamResult.totalExpectedCostChaos,
            expectedPhysicalActions:
              bestFractureDownstreamResult.metrics?.expectedPhysicalActions ?? 0,
            estimatedManualTimeMs:
              bestFractureDownstreamResult.metrics?.estimatedManualTimeMs ?? 0,
            objectiveScore:
              bestFractureDownstreamResult.metrics?.objectiveScore ??
              bestFractureDownstreamResult.totalExpectedCostChaos,
            effortConfidence:
              bestFractureDownstreamResult.metrics?.effortConfidence ??
              'DEFAULT_APPROXIMATE',
          }
        : undefined;

    const bestFractureMetrics: RouteMetricVector | undefined =
      bestFractureAcquisitionMetrics && bestFractureDownstreamMetrics
        ? {
            expectedChaosCost:
              bestFractureAcquisitionMetrics.expectedChaosCost +
              bestFractureDownstreamMetrics.expectedChaosCost,
            expectedPhysicalActions:
              bestFractureAcquisitionMetrics.expectedPhysicalActions +
              bestFractureDownstreamMetrics.expectedPhysicalActions,
            estimatedManualTimeMs:
              bestFractureAcquisitionMetrics.estimatedManualTimeMs +
              bestFractureDownstreamMetrics.estimatedManualTimeMs,
            objectiveScore:
              bestFractureAcquisitionMetrics.objectiveScore +
              bestFractureDownstreamMetrics.objectiveScore,
            effortConfidence: bestFractureDownstreamMetrics.effortConfidence,
          }
        : undefined;

    const bestFractureRoute: RouteSummary | undefined = usesDirectFracturePolicy && bestFractureTotalCost !== undefined
      ? {
          actionId: `acquire_candidate_${bestFractureCandidateIndex}_self-fracture_executable`,
          name: `Start self-fracture: ${starts[bestFractureCandidateIndex!].label}`,
          acquisitionCandidateId: `candidate_${bestFractureCandidateIndex}`,
          acquisitionMethodId: 'self-fracture_executable',
          expectedTotalCostChaos: bestFractureTotalCost,
          lowerBoundChaos: bestFractureProofRecord?.fullRouteLowerBoundChaos ??
            bestFractureSynthesis?.lowerBoundChaos ?? 0,
          incumbentUpperBoundChaos: bestFractureTotalCost,
          optimalityGapChaos: Math.max(
            0,
            bestFractureTotalCost -
              (bestFractureProofRecord?.fullRouteLowerBoundChaos ??
                bestFractureSynthesis?.lowerBoundChaos ?? 0)
          ),
          status: 'RESOLVED',
          couldBeatResolvedIncumbent: false,
          metrics: bestFractureMetrics,
          acquisitionMetrics: bestFractureAcquisitionMetrics,
          downstreamMetrics: bestFractureDownstreamMetrics,
        }
      : undefined;

    const acquisitionDecision = [...result.policyMap.values()].find(
      (decision) => decision.state.flags?.acquisitionMenu === true
    );
    const rankedAcquisitionRoutes = usesDirectCleanPolicy && fastCleanRoute
      ? [fastCleanRoute]
      : usesDirectFracturePolicy && bestFractureRoute
        ? [bestFractureRoute, ...(fastCleanRoute ? [fastCleanRoute] : [])]
        : (acquisitionDecision?.candidateQValues ?? [])
          .filter((candidate) => candidate.actionId.startsWith('acquire_'))
          .map(routeSummary)
          .sort((left, right) =>
            (left.expectedTotalCostChaos ?? Infinity) - (right.expectedTotalCostChaos ?? Infinity)
          );

    // Collect all candidate routes that are resolved
    const allResolvedRoutes: RouteSummary[] = [
      ...(fastCleanRoute ? [fastCleanRoute] : []),
      ...(bestFractureRoute ? [bestFractureRoute] : []),
      ...rankedAcquisitionRoutes.filter((r) => r.status === 'RESOLVED' && r.expectedTotalCostChaos !== null),
    ].filter((route, idx, self) => self.findIndex((r) => r.actionId === route.actionId) === idx);

    // Compute Pareto Alternatives
    const paretoAlternatives = computeParetoAlternatives(allResolvedRoutes, input.objective);

    // Multi-objective constrained candidate selection
    const objective = input.objective ?? { kind: 'CHEAPEST_CHAOS' };
    const cheapestCandidate = allResolvedRoutes.reduce<RouteSummary | undefined>(
      (min, r) => (!min || (r.expectedTotalCostChaos ?? Infinity) < (min.expectedTotalCostChaos ?? Infinity) ? r : min),
      undefined
    );
    const cheapestCostChaos = cheapestCandidate?.expectedTotalCostChaos ?? undefined;

    let costCeilingChaos: number | undefined;
    if (cheapestCostChaos !== undefined && Number.isFinite(cheapestCostChaos)) {
      if (objective.maxExpectedCostChaos !== undefined) {
        costCeilingChaos = objective.maxExpectedCostChaos;
      } else if (objective.maxPremiumChaos !== undefined) {
        costCeilingChaos = cheapestCostChaos + objective.maxPremiumChaos;
      } else if (objective.maxPremiumFraction !== undefined) {
        costCeilingChaos = cheapestCostChaos * (1 + objective.maxPremiumFraction);
      }
    }

    const eligibleCandidates = costCeilingChaos !== undefined
      ? allResolvedRoutes.filter((r) => (r.expectedTotalCostChaos ?? Infinity) <= costCeilingChaos!)
      : allResolvedRoutes;

    let chosenCandidate: RouteSummary | null = null;
    let objectiveProofStatus: ObjectiveProofStatus = 'UNCONSTRAINED_RESOLVED';

    if (allResolvedRoutes.length === 0) {
      objectiveProofStatus = 'CHEAPEST_ROUTE_UNRESOLVED';
    } else if (eligibleCandidates.length === 0) {
      objectiveProofStatus = 'NO_RESOLVED_ROUTE_WITHIN_COST';
      chosenCandidate = cheapestCandidate ?? null;
    } else {
      objectiveProofStatus = costCeilingChaos !== undefined ? 'CONSTRAINED_OPTIMAL_PROVEN' : 'UNCONSTRAINED_RESOLVED';
      chosenCandidate = eligibleCandidates.reduce((best, cand) => {
        if (!best) return cand;
        const bCost = best.expectedTotalCostChaos ?? Infinity;
        const cCost = cand.expectedTotalCostChaos ?? Infinity;
        const bAct = best.metrics?.expectedPhysicalActions ?? Infinity;
        const cAct = cand.metrics?.expectedPhysicalActions ?? Infinity;
        const bTime = best.metrics?.estimatedManualTimeMs ?? Infinity;
        const cTime = cand.metrics?.estimatedManualTimeMs ?? Infinity;

        switch (objective.kind) {
          case 'FEWEST_ACTIONS_WITHIN_COST':
          case 'UNCONSTRAINED_FEWEST_ACTIONS':
            if (Math.abs(cAct - bAct) > 1e-4) return cAct < bAct ? cand : best;
            return cCost < bCost ? cand : best;
          case 'FASTEST_WITHIN_COST':
          case 'UNCONSTRAINED_FASTEST':
            if (Math.abs(cTime - bTime) > 1e-4) return cTime < bTime ? cand : best;
            return cCost < bCost ? cand : best;
          case 'BALANCED_VALUE_OF_TIME': {
            const cpm = objective.valueOfTimeChaosPerMinute ?? 50;
            const bScore = bCost + (bTime / 60000) * cpm;
            const cScore = cCost + (cTime / 60000) * cpm;
            if (Math.abs(cScore - bScore) > 1e-4) return cScore < bScore ? cand : best;
            return cCost < bCost ? cand : best;
          }
          case 'CHEAPEST_CHAOS':
          default:
            return cCost < bCost ? cand : best;
        }
      }, eligibleCandidates[0]);
    }

    if (chosenCandidate) {
      for (const p of paretoAlternatives) {
        if (p.route.actionId === chosenCandidate.actionId) {
          p.isRequestedObjective = true;
        }
      }
    }

    const selectedPolicyCertified =
      result.optimalityProof.selectedPolicyStatus ===
      'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED';
    const recommended = selectedPolicyCertified ? chosenCandidate : null;
    const selectedParts = recommended ? portfolioActionParts(recommended.actionId) : {};
    const incumbentUpperBound = recommended?.expectedTotalCostChaos ?? undefined;

    const harvestComparison = buildHarvestComparisonSummary(
      enabledHarvestCrafts,
      harvestTags,
      allResolvedRoutes,
      priceBook,
      recommended,
      cleanEvidence.costChaos
    );
    const synthesisEvidenceRoutes: RouteSummary[] = [...synthesisSummaries.entries()].flatMap(
      ([candidateIndex, synthesis]): RouteSummary[] => {
        const candidateId = `candidate_${candidateIndex}`;
        const proofRecord = searchSessionRecord.fractureProofs.get(
          JSON.stringify(starts[candidateIndex].fracturedRequirement)
        );
        const fullRouteLowerBound = proofRecord?.fullRouteLowerBoundChaos ??
          synthesis.lowerBoundChaos;
        if (synthesis.status === 'SKIPPED_DOMINATED') {
          return [{
            actionId: `synthesis_bound_${candidateId}`,
            name: `Self-fracture ${starts[candidateIndex].label} (structurally dominated)`,
            acquisitionCandidateId: candidateId,
            acquisitionMethodId: 'self-fracture_executable',
            expectedTotalCostChaos: null,
            lowerBoundChaos: fullRouteLowerBound,
            incumbentUpperBoundChaos: incumbentUpperBound ?? null,
            optimalityGapChaos: incumbentUpperBound === undefined
              ? null
              : Math.max(0, incumbentUpperBound - fullRouteLowerBound),
            status: 'DOMINATED_BY_BOUND',
            couldBeatResolvedIncumbent: false,
          }];
        }
        if (
          synthesis.status === 'RESOLVED' &&
          synthesis.proof?.unresolvedCandidatesCouldBeatIncumbent !== true &&
          !usesDirectCleanPolicy
        ) {
          return [];
        }
        const couldBeat = incumbentUpperBound !== undefined &&
          fullRouteLowerBound < incumbentUpperBound;
        const dominatedByBound = incumbentUpperBound !== undefined && !couldBeat;
        return [{
          actionId: `synthesis_frontier_${candidateId}`,
          name: dominatedByBound
            ? `Self-fracture ${starts[candidateIndex].label} (dominated by admissible bound)`
            : `Unresolved self-fracture frontier: ${starts[candidateIndex].label}`,
          acquisitionCandidateId: candidateId,
          acquisitionMethodId: 'self-fracture_executable',
          expectedTotalCostChaos: null,
          lowerBoundChaos: fullRouteLowerBound,
          incumbentUpperBoundChaos: incumbentUpperBound ?? null,
          optimalityGapChaos: incumbentUpperBound === undefined
            ? null
            : Math.max(0, incumbentUpperBound - fullRouteLowerBound),
          status: dominatedByBound ? 'DOMINATED_BY_BOUND' : 'UNRESOLVED',
          couldBeatResolvedIncumbent: couldBeat,
        }];
      }
    );
    const acquisitionRoutes = [...rankedAcquisitionRoutes, ...synthesisEvidenceRoutes]
      .sort((left, right) =>
        (left.expectedTotalCostChaos ?? Infinity) - (right.expectedTotalCostChaos ?? Infinity) ||
        left.lowerBoundChaos - right.lowerBoundChaos
      );
    const portfolioCandidateEvidence: AcquisitionPortfolioCandidateProofEvidence[] = starts.map(
      (start, candidateIndex) => {
        const candidateId = `candidate_${candidateIndex}`;
        const isClean = candidateIndex === cleanCandidateIndex;
        const sessionKey = isClean ? undefined : JSON.stringify(start.fracturedRequirement);
        const proofRecord = sessionKey === undefined
          ? undefined
          : searchSessionRecord.fractureProofs.get(sessionKey);
        const acquisitionLowerBoundChaos = isClean
          ? cleanEvidence.costChaos
          : proofRecord?.acquisitionLowerBoundChaos ??
            structuralBounds.get(candidateIndex)?.combinedLowerBoundChaos ?? 0;
        const downstreamLowerBoundChaos = isClean
          ? fastCleanResult
            ? genericSearchStartLowerBound(fastCleanResult, cleanStart.state, input.target)
            : 0
          : proofRecord?.downstreamLowerBoundChaos ?? 0;
        const fullRouteLowerBoundChaos = acquisitionLowerBoundChaos +
          downstreamLowerBoundChaos;
        const acquisitionUpperBoundChaos = isClean
          ? cleanEvidence.costChaos
          : proofRecord?.acquisitionUpperBoundChaos;
        const downstreamUpperBoundChaos = isClean && fastCleanRoute?.expectedTotalCostChaos !== null &&
            fastCleanRoute?.expectedTotalCostChaos !== undefined
          ? fastCleanRoute.expectedTotalCostChaos - cleanEvidence.costChaos
          : proofRecord?.downstreamUpperBoundChaos;
        const fullRouteUpperBoundChaos = isClean
          ? fastCleanRoute?.expectedTotalCostChaos ?? undefined
          : proofRecord?.fullRouteUpperBoundChaos;
        const selected = selectedParts.candidateId === candidateId;
        const dominated = incumbentUpperBound !== undefined && !selected &&
          fullRouteLowerBoundChaos >= incumbentUpperBound;
        const competitive = incumbentUpperBound !== undefined && !selected && !dominated;
        const status: AcquisitionPortfolioCandidateLifecycle = selected
          ? 'SELECTED'
          : dominated
            ? 'DOMINATED'
            : competitive
              ? 'COMPETITIVE_UNRESOLVED'
              : fullRouteUpperBoundChaos !== undefined
                ? 'FULL_ROUTE_RESOLVED'
                : acquisitionUpperBoundChaos !== undefined
                  ? 'ACQUISITION_RESOLVED'
                  : (searchSessionRecord.fractureAcquisitions.get(sessionKey ?? '')?.expansion.nodes.size ?? 0) > 0
                    ? 'COMPETITIVE_UNRESOLVED'
                    : 'NOT_STARTED';
        const proofReason: AcquisitionPortfolioProofReason = selected
          ? 'SELECTED_EXECUTABLE_ROUTE'
          : dominated
            ? 'DOMINATED_BY_FULL_ROUTE_BOUND'
            : competitive
              ? 'CAN_STILL_BEAT_INCUMBENT'
              : isClean ? 'CLEAN_ROUTE_PROVEN' : 'NO_EXECUTABLE_ROUTE';
        const acquisitionSession = sessionKey === undefined
          ? undefined
          : searchSessionRecord.fractureAcquisitions.get(sessionKey);
        const downstreamSession = sessionKey === undefined
          ? searchSessionRecord.cleanDownstream
          : searchSessionRecord.fractureDownstreams.get(sessionKey);
        const boundSession = sessionKey === undefined
          ? undefined
          : searchSessionRecord.fractureDownstreamBounds.get(sessionKey)?.continuation;
        return {
          candidateId,
          label: start.label,
          kind: isClean ? 'clean' : 'self-fracture',
          acquisitionLowerBoundChaos,
          downstreamLowerBoundChaos,
          fullRouteLowerBoundChaos,
          acquisitionUpperBoundChaos,
          downstreamUpperBoundChaos,
          fullRouteUpperBoundChaos,
          status,
          proofReason,
          acquisitionModeledOptimal: isClean ? true : proofRecord?.acquisitionModeledOptimal ?? false,
          downstreamModeledOptimal: isClean
            ? fastCleanResult ? genericSearchModeledOptimal(fastCleanResult) : false
            : proofRecord?.downstreamModeledOptimal ?? false,
          retainedAcquisitionStates: acquisitionSession?.expansion.nodes.size ?? 0,
          retainedDownstreamStates: (downstreamSession?.expansion.nodes.size ?? 0) +
            (boundSession?.expansion.nodes.size ?? 0),
          acquisitionTransitionDistributionsGenerated:
            acquisitionSession?.expansion.transitionDistributionsGeneratedTotal ?? 0,
          downstreamTransitionDistributionsGenerated:
            (downstreamSession?.expansion.transitionDistributionsGeneratedTotal ?? 0) +
            (boundSession?.expansion.transitionDistributionsGeneratedTotal ?? 0),
        };
      }
    );
    const acquisitionSelectionThreats = portfolioCandidateEvidence.filter(
      (candidate) => candidate.status === 'COMPETITIVE_UNRESOLVED'
    );
    const bestUnresolvedLowerBound = acquisitionSelectionThreats.reduce(
      (minimum, candidate) => Math.min(minimum, candidate.fullRouteLowerBoundChaos),
      Infinity
    );
    const acquisitionSelectionSafe = incumbentUpperBound !== undefined &&
      acquisitionSelectionThreats.length === 0;
    const acquisitionPotentialGap = incumbentUpperBound !== undefined && Number.isFinite(bestUnresolvedLowerBound)
      ? Math.max(0, incumbentUpperBound - bestUnresolvedLowerBound)
      : undefined;
    const selectedPortfolioEvidence = portfolioCandidateEvidence.find(
      (candidate) => candidate.candidateId === selectedParts.candidateId
    );
    const portfolioProofStatus: AcquisitionPortfolioProofStatus = incumbentUpperBound === undefined
      ? 'NO_EXECUTABLE_ROUTE'
      : acquisitionSelectionSafe && selectedPortfolioEvidence?.acquisitionModeledOptimal &&
          selectedPortfolioEvidence.downstreamModeledOptimal
        ? 'PORTFOLIO_OPTIMAL'
        : acquisitionSelectionSafe
          ? 'SELECTED_ACQUISITION_SAFE'
          : 'BEST_RESOLVED_UNPROVEN';
    const resolvedCompetitiveCandidates = acquisitionSelectionThreats.filter(
      (candidate) => candidate.fullRouteUpperBoundChaos !== undefined
    ).length;
    const dominatedCandidates = portfolioCandidateEvidence.filter(
      (candidate) => candidate.status === 'DOMINATED'
    ).length;
    const portfolioProof: AcquisitionPortfolioProofSummary = {
      status: portfolioProofStatus,
      selectedFullRouteUpperBoundChaos: incumbentUpperBound,
      bestCompetitiveLowerBoundChaos: Number.isFinite(bestUnresolvedLowerBound)
        ? bestUnresolvedLowerBound
        : undefined,
      potentialGapChaos: acquisitionPotentialGap,
      unresolvedCompetitiveCandidates: acquisitionSelectionThreats.length,
      resolvedCompetitiveCandidates,
      dominatedCandidates,
      candidateEvidence: portfolioCandidateEvidence,
      tranches: portfolioProofTranches,
      schedulerPolicy:
        'Admissible best-bound scheduling: deepen only non-selected families whose full-route L ' +
        'can beat incumbent U; resolve acquisition before executable downstream, then allocate to ' +
        'the larger acquisition/downstream proof debt. Stable exact-identity ordering breaks ties.',
    };
    currentPortfolioProofStatus = portfolioProofStatus;
    currentUnresolvedCompetitiveCandidates = acquisitionSelectionThreats.length;
    currentResolvedCompetitiveCandidates = resolvedCompetitiveCandidates;
    currentDominatedCandidates = dominatedCandidates;
    const selectedCandidateIndex = selectedParts.candidateId === undefined
      ? undefined
      : Number(/^candidate_(\d+)$/.exec(selectedParts.candidateId)?.[1]);
    const selectedSynthesis = selectedCandidateIndex === undefined || Number.isNaN(selectedCandidateIndex)
      ? undefined
      : synthesisSummaries.get(selectedCandidateIndex);
    const synthesisFrontiersCouldBeat = acquisitionSelectionThreats.length > 0;
    const overallModeledActionOptimalityProven =
      result.optimalityProof.modeledActionOptimalityProven &&
      (selectedSynthesis?.proof?.modeledActionOptimalityProven ?? true) &&
      !synthesisFrontiersCouldBeat;
    const overallGlobalOptimality = overallModeledActionOptimalityProven
      ? result.optimalityProof.globalOptimality
      : 'NOT YET PROVEN';
    const overallUnresolvedCompetitorCount =
      result.optimalityProof.potentiallyCompetitiveUnresolvedCount +
      acquisitionSelectionThreats.length;
    const overallUnresolvedCouldBeat =
      result.optimalityProof.unresolvedCandidatesCouldBeatIncumbent ||
      synthesisFrontiersCouldBeat;

    const directCleanCostOffset = usesDirectCleanPolicy ? cleanEvidence.costChaos : 0;
    const policyIncumbentHistory = result.searchSummary.incumbentHistory.map((entry) => ({
      ...entry,
      upperBoundChaos: entry.upperBoundChaos + directCleanCostOffset,
    }));
    const firstPolicyUpperBound = policyIncumbentHistory[0]?.upperBoundChaos;
    const finalPolicyUpperBound = recommended?.expectedTotalCostChaos ??
      policyIncumbentHistory.at(-1)?.upperBoundChaos;
    let lastMeaningfulImprovementRound: number | undefined;
    for (let index = 1; index < policyIncumbentHistory.length; index++) {
      const before = policyIncumbentHistory[index - 1].upperBoundChaos;
      const after = policyIncumbentHistory[index].upperBoundChaos;
      if (before - after > Math.max(0.01, before * 0.001)) {
        lastMeaningfulImprovementRound = policyIncumbentHistory[index].round;
      }
    }
    const finalHistoryDrop = policyIncumbentHistory.length < 2
      ? 0
      : policyIncumbentHistory.at(-2)!.upperBoundChaos -
        policyIncumbentHistory.at(-1)!.upperBoundChaos;
    const refinementStoppedAtBudget =
      result.searchSummary.refinementStopReason === 'STATE_BUDGET' ||
      result.searchSummary.refinementStopReason === 'ROUND_BUDGET' ||
      result.searchSummary.refinementStopReason === 'WALL_TIME';
    const budgetEndedWhileImproving = refinementStoppedAtBudget &&
      finalHistoryDrop > Math.max(
        0.01,
        (policyIncumbentHistory.at(-2)?.upperBoundChaos ?? 0) * 0.001
      );
    const policyStartDecision = result.policyMap.get(
      getCanonicalStateKey(result.startingState, input.target)
    );
    const selectedStartLowerBound = policyStartDecision?.candidateQValues.reduce(
      (minimum, candidate) => Math.min(minimum, candidate.lowerBoundChaos),
      Infinity
    );
    const unresolvedPolicyLowerBound = policyStartDecision?.candidateQValues
      .filter((candidate) =>
        candidate.status === 'UNRESOLVED' || candidate.couldBeatResolvedIncumbent
      )
      .reduce((minimum, candidate) => Math.min(minimum, candidate.lowerBoundChaos), Infinity);
    const normalizedSelectedStartLowerBound = selectedStartLowerBound !== undefined &&
      Number.isFinite(selectedStartLowerBound)
      ? selectedStartLowerBound + directCleanCostOffset
      : undefined;
    const normalizedUnresolvedPolicyLowerBound = unresolvedPolicyLowerBound !== undefined &&
      Number.isFinite(unresolvedPolicyLowerBound)
      ? unresolvedPolicyLowerBound + directCleanCostOffset
      : undefined;
    const downstreamPotentialGap = finalPolicyUpperBound !== undefined &&
      normalizedUnresolvedPolicyLowerBound !== undefined
      ? Math.max(0, finalPolicyUpperBound - normalizedUnresolvedPolicyLowerBound)
      : undefined;
    const policyRefinementStatus: PolicyRefinementSummary['status'] = recommended === null
      ? 'NO_EXECUTABLE_POLICY'
      : result.optimalityProof.modeledActionOptimalityProven
        ? 'MODELED_OPTIMAL'
        : budgetEndedWhileImproving
          ? 'STILL_IMPROVING_AT_BUDGET'
          : 'CURRENT_BEST_UNPROVEN';
    const policyRefinement: PolicyRefinementSummary = {
      status: policyRefinementStatus,
      firstCertifiedUpperBoundChaos: firstPolicyUpperBound,
      finalUpperBoundChaos: finalPolicyUpperBound,
      improvementChaos: firstPolicyUpperBound === undefined || finalPolicyUpperBound === undefined
        ? undefined
        : Math.max(0, firstPolicyUpperBound - finalPolicyUpperBound),
      improvementFraction: firstPolicyUpperBound === undefined ||
          finalPolicyUpperBound === undefined || firstPolicyUpperBound <= 0
        ? undefined
        : Math.max(0, firstPolicyUpperBound - finalPolicyUpperBound) / firstPolicyUpperBound,
      selectedStartLowerBoundChaos: normalizedSelectedStartLowerBound,
      unresolvedCompetitiveLowerBoundChaos: normalizedUnresolvedPolicyLowerBound,
      potentialGapChaos: downstreamPotentialGap,
      potentialGapFraction: downstreamPotentialGap === undefined || finalPolicyUpperBound === undefined ||
          finalPolicyUpperBound <= 0
        ? undefined
        : downstreamPotentialGap / finalPolicyUpperBound,
      incumbentHistory: policyIncumbentHistory,
      lastMeaningfulImprovementRound,
      budgetEndedWhileImproving,
      stopReason: result.searchSummary.refinementStopReason,
      explanation: policyRefinementStatus === 'MODELED_OPTIMAL'
        ? 'The final crafting policy is optimal over every modeled action in the completed graph.'
        : policyRefinementStatus === 'NO_EXECUTABLE_POLICY'
          ? 'No executable downstream crafting policy was certified within this search budget.'
          : policyRefinementStatus === 'STILL_IMPROVING_AT_BUDGET'
            ? 'The executable downstream policy improved materially in the final completed tranche; modeled optimality is not proven.'
            : 'This is the current best executable downstream policy; modeled optimality is not proven.',
    };

    const policyRules: PolicyRule[] = result.onPolicyRules.map((rule) => ({
      stateKey: rule.stateKey,
      state: describePolicyState(rule.state),
      selectedActionId: rule.selectedActionId,
      selectedAction: rule.selectedActionName,
      expectedVisits: rule.expectedVisits,
      totalCostChaos: finiteOrNull(rule.totalCostChaos),
      candidates: rule.candidateQValues.map(serializeCandidate),
    }));
    const policyExplanation = buildPolicyExplanation(result.onPolicyRules, input.target);
    if (usesDirectCleanPolicy && fastCleanRoute) {
      policyExplanation.unshift({
        condition: 'Start: choose an acquisition route',
        actionId: fastCleanRoute.actionId,
        action: fastCleanRoute.name,
        representedStateCount: 1,
        expectedVisits: 1,
        exampleState: 'Choose an acquisition route',
        context: {
          rarity: cleanStart.state.rarity,
          prefixCount: 0,
          suffixCount: 0,
          matchedTargetModIds: [],
          unmatchedTargetModIds: getAllTargetModRequirements(input.target).map(
            (requirement, index) => targetRequirementIdentity(requirement, index)
          ).sort(),
          prefixes: [],
          suffixes: [],
          influenced: false,
          synthesised: false,
          acquisitionMenu: true,
          disambiguateAffixes: false,
        },
      });
} else if (usesDirectFracturePolicy && bestFractureRoute && bestFractureSynthesis) {
      const fracturePolicyExplanation: PolicyExplanationRule[] = (bestFractureSynthesis.policy ?? []).map((rule) => ({
        condition: `Self-fracture preparation: ${rule.state}`,
        actionId: rule.selectedActionId,
        action: rule.selectedAction,
        representedStateCount: 1,
        expectedVisits: rule.expectedVisits,
        exampleState: rule.state,
        context: {
          rarity: 'rare' as const,
          prefixCount: 0,
          suffixCount: 0,
          matchedTargetModIds: [],
          unmatchedTargetModIds: [],
          prefixes: [],
          suffixes: [],
          influenced: false,
          synthesised: false,
          acquisitionMenu: false,
          disambiguateAffixes: false,
        },
      }));
      policyExplanation.unshift(
        {
          condition: 'Start: choose an acquisition route',
          actionId: bestFractureRoute.actionId,
          action: bestFractureRoute.name,
          representedStateCount: 1,
          expectedVisits: 1,
          exampleState: 'Choose an acquisition route',
          context: {
            rarity: starts[bestFractureCandidateIndex!].state.rarity,
            prefixCount: 0,
            suffixCount: 0,
            matchedTargetModIds: [],
            unmatchedTargetModIds: getAllTargetModRequirements(input.target).map(
              (requirement, index) => targetRequirementIdentity(requirement, index)
            ).sort(),
            prefixes: [],
            suffixes: [],
            influenced: false,
            synthesised: false,
            acquisitionMenu: true,
            disambiguateAffixes: false,
          },
        },
        ...fracturePolicyExplanation
      );
    }
    const expectedCostChaos = recommended?.expectedTotalCostChaos ?? null;
    const expectedProfitChaos = input.expectedSaleValueChaos === undefined || expectedCostChaos === null
      ? undefined
      : input.expectedSaleValueChaos - expectedCostChaos;
    const proofWarnings = [
      overallGlobalOptimality === 'NOT YET PROVEN'
        ? 'GLOBAL OPTIMALITY: NOT YET PROVEN'
        : undefined,
      overallUnresolvedCouldBeat
        ? 'UNRESOLVED COMPETITORS MAY BE CHEAPER'
        : undefined,
      result.searchSummary.budgetExhausted
        ? 'Search budget exhausted before every competitive candidate was resolved or bounded.'
        : undefined,
      recommended === null ? 'No fully resolved acquisition route was found within this search budget.' : undefined,
      synthesisFrontiersCouldBeat
        ? 'A self-fracture frontier has a lower bound below the current best route and was not fully resolved.'
        : undefined,
      selectedSynthesis?.status === 'RESOLVED' &&
        selectedSynthesis.proof?.modeledActionOptimalityProven !== true
        ? 'The selected executable self-fracture policy was resolved to a finite incumbent but was not proven modeled-optimal.'
        : undefined,
      recommended !== null && !acquisitionSelectionSafe
        ? `ACQUISITION SELECTION IS PROVISIONAL: resolved incumbent ${incumbentUpperBound!.toFixed(3)}c; ` +
          `best competitive full-route lower bound ${bestUnresolvedLowerBound.toFixed(3)}c; ` +
          `potential gap ${acquisitionPotentialGap!.toFixed(3)}c.`
        : undefined,
    ].filter((warning): warning is string => warning !== undefined);

    const recommendationStatus: RecommendationStatus = recommended === null
      ? 'NO_RESOLVED_ROUTE'
      : overallModeledActionOptimalityProven
        ? 'PROVEN_OPTIMAL'
        : acquisitionSelectionSafe
          ? 'BEST_RESOLVED_ACQUISITION_SAFE'
          : 'PROVISIONAL_RESOLVED';
    const selectedMechanicsEvidence = result.mechanicsConfidence.evidence.filter(
      (entry) => entry.onPolicySelections > 0
    );
    const selectedMechanicsWarnings = [
      ...result.mechanicsConfidence.warnings,
      ...(selectedSynthesis?.mechanicsConfidence?.warnings ?? []),
    ];
    const warningDetails: OptimizationWarning[] = [
      ...proofWarnings.map((message): OptimizationWarning => ({ category: 'PROOF_SEARCH', message })),
      ...result.priceConfidence.warnings.map((message): OptimizationWarning => ({ category: 'SELECTED_ROUTE', message })),
      ...selectedMechanicsWarnings.map((message): OptimizationWarning => ({ category: 'SELECTED_ROUTE', message })),
      ...result.consideredPriceConfidence.warnings
        .filter((message) => !result.priceConfidence.warnings.includes(message))
        .map((message): OptimizationWarning => ({ category: 'CONSIDERED_ALTERNATIVE', message })),
      ...result.mechanicsConfidence.warnings
        .filter((message) => !selectedMechanicsWarnings.includes(message))
        .map((message): OptimizationWarning => ({ category: 'CONSIDERED_ALTERNATIVE', message })),
      ...(input.marketContext?.snapshotStale
        ? [{
            category: 'DATA_FRESHNESS' as const,
            message: `Market snapshot file for ${input.marketContext.league} is stale (${input.marketContext.snapshotAt}).`,
          }]
        : []),
      ...(input.marketContext?.currencyRatesStale
        ? [{
            category: 'DATA_FRESHNESS' as const,
            message: `Currency rates for ${input.marketContext.league} are stale or unavailable (${input.marketContext.currencyRatesAt ?? 'no timestamp'}).`,
          }]
        : []),
      ...(input.marketContext?.cleanBaseQuote.status === 'AVAILABLE' && input.marketContext.cleanBaseQuote.stale
        ? [{
            category: 'DATA_FRESHNESS' as const,
            message: `The selected clean-base sampled-low quote is stale (${input.marketContext.cleanBaseQuote.at ?? 'no timestamp'}).`,
          }]
        : []),
      ...(input.marketContext?.cleanBaseQuote.status === 'UNAVAILABLE'
        ? [{
            category: 'DATA_FRESHNESS' as const,
            message: input.marketContext.cleanBaseQuote.provenance,
          }]
        : []),
    ];
    const uniqueWarningDetails = warningDetails.filter((warning, index, all) =>
      all.findIndex((candidate) =>
        candidate.category === warning.category && candidate.message === warning.message
      ) === index
    );

    const mergedPolicyRules: PolicyRule[] = [
      ...(usesDirectFracturePolicy && bestFractureSynthesis?.policy
        ? bestFractureSynthesis.policy.map((rule) => ({
            stateKey: rule.stateKey,
            state: rule.state,
            selectedActionId: rule.selectedActionId,
            selectedAction: rule.selectedAction,
            expectedVisits: rule.expectedVisits,
            totalCostChaos: typeof rule.totalCostChaos === 'number' ? finiteOrNull(rule.totalCostChaos) : null,
            candidates: [],
          }))
        : []),
      ...policyRules,
    ];

    const outputWithoutCraftPlan: Omit<OptimizeCraftResult, 'craftPlan'> = {
      target: input.target,
      validationNotices: validation.notices,
      recommendationStatus,
      recommended,
      alternatives: acquisitionRoutes.filter((route) => route.actionId !== recommended?.actionId),
      expectedCurrencies: Object.fromEntries(
        [
          ...(usesDirectCleanPolicy ? [['clean_base', 1] as const] : []),
          ...(usesDirectFracturePolicy && bestFractureSynthesis?.expectedCurrencies
            ? Object.entries(bestFractureSynthesis.expectedCurrencies)
            : []),
          ...Object.entries(result.expectedCurrencies),
        ].map(([currency, amount]) => [currency, finiteOrNull(amount)])
      ),
      expectedActionUsage: [
        ...(usesDirectCleanPolicy ? [{
          actionId: fastCleanRoute!.actionId,
          actionName: fastCleanRoute!.name,
          expectedCount: 1,
          expectedCostChaos: cleanEvidence.costChaos,
        }] : []),
        ...(usesDirectFracturePolicy && bestFractureSynthesis
          ? [
              {
                actionId: bestFractureRoute!.actionId,
                actionName: bestFractureRoute!.name,
                expectedCount: 1,
                expectedCostChaos: bestFractureSynthesis.expectedCostChaos ?? 0,
              },
              ...bestFractureSynthesis.expectedActionUsage,
            ]
          : []),
        ...result.expectedActionUsage.map((usage) => ({ ...usage })),
      ],
      policyExplanation,
      policyRules: mergedPolicyRules,
      acquisition: {
        selectedCandidateId: selectedParts.candidateId,
        selectedMethodId: selectedParts.methodId,
        candidates: starts.map((start, candidateIndex) => {
          const candidateId = `candidate_${candidateIndex}`;
          const rankedCandidate = portfolio.find((candidate) => candidate.id === candidateId);
          return {
          id: candidateId,
          label: start.label,
          physicalStateSignature: getPhysicalStateSignature(start.state),
          methods: (rankedCandidate?.methods ?? []).map((method) => ({
            id: method.id,
            label: method.label,
            costChaos: method.acquisitionCostChaos,
            confidence: method.confidence,
            provenance: method.provenance,
            approximate: false,
            executable: method.id === 'self-fracture_executable',
          })),
          synthesis: synthesisSummaries.get(candidateIndex),
        }}),
        methodCount: portfolio.reduce((sum, candidate) => sum + candidate.methods.length, 0),
        distinctPhysicalStateCount: new Set(
          starts.map((candidate) => getPhysicalStateSignature(candidate.state))
        ).size,
        selectionSafe: acquisitionSelectionSafe,
        resolvedIncumbentUpperBoundChaos: incumbentUpperBound,
        bestUnresolvedLowerBoundChaos: Number.isFinite(bestUnresolvedLowerBound)
          ? bestUnresolvedLowerBound
          : undefined,
        potentialGapChaos: acquisitionPotentialGap,
        portfolioProof,
        stage: {
          mode: stageMode,
          candidateCount: fractureEntries.length,
          attemptedCandidates: stageAttemptedCandidates,
          certifiedCandidates: synthesisResults.size,
          cacheHits: stageCacheHits,
          totalStateBudget: stageTotalStateBudget,
          totalWallTimeBudgetMs: stageTotalWallTimeBudgetMs,
          maxExpansionRoundsPerCandidate: stageMaxExpansionRounds,
          elapsedMs: stageElapsedMs,
          allocation:
            'Shared acquisition-stage state and wall-time totals are divided by integer quotient ' +
            'and remainder across all mechanically relevant fracture candidates in discovery order.',
          cacheIdentity:
            'Exact JSON identity: clean physical signature + fractured requirement + clean-base ' +
            'cost/confidence/provenance + complete active currency rates + enabled synthesis actions ' +
            '+ acquisition state-identity version + Harvest scope + fallback policy + search intent ' +
            '+ exact per-candidate budget.',
          cleanCertification: fastCleanResult ? {
            attempted: true,
            certified: fastCleanResult.optimalityProof.selectedPolicyStatus ===
              'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED',
            recommendationStatus: fastCleanResult.optimalityProof.selectedPolicyStatus,
            expectedTotalCostChaos: fastCleanRoute?.expectedTotalCostChaos ?? undefined,
            lowerBoundChaos: fastCleanRoute?.lowerBoundChaos ?? undefined,
            optimalityGapChaos: fastCleanRoute?.optimalityGapChaos ?? undefined,
            statesExpanded: fastCleanResult.searchSummary.statesExpanded,
            cumulativeExpansionWork: fastCleanResult.searchSummary.cumulativeExpansionWork,
            expansionRounds: fastCleanResult.searchSummary.expansionRounds,
            elapsedMs: fastCleanResult.searchSummary.elapsedMs,
            proper: fastCleanResult.onPolicyGraph.isProper,
            absorptionProbability: fastCleanResult.onPolicyGraph.terminalAbsorptionProbability,
            costReconciled: fastCleanResult.reconciliation.isReconciled,
            fullyResolvedOnPolicy: fastCleanResult.onPolicyGraph.isFullyResolved,
            unresolvedOnPolicyProbability:
              fastCleanResult.onPolicyGraph.onPolicyUnresolvedProbabilityMass,
            unresolvedCompetitorCount:
              fastCleanResult.optimalityProof.unresolvedCompetitorCount,
            startActionId: fastCleanRoute?.actionId,
          } : undefined,
        },
      },
      expectedCostChaos,
      expectedSaleValueChaos: input.expectedSaleValueChaos,
      expectedProfitChaos,
      risk: {
        onPolicyReachableStates: result.onPolicyGraph.onPolicyReachableStates +
          (selectedSynthesis?.risk?.onPolicyReachableStates ?? 0),
        onPolicyTerminalStates: result.onPolicyGraph.onPolicyTerminalStates +
          (selectedSynthesis?.risk?.onPolicyTerminalStates ?? 0),
        terminalAbsorptionProbability: result.onPolicyGraph.terminalAbsorptionProbability *
          (selectedSynthesis?.risk?.terminalAbsorptionProbability ?? 1),
        selectedPolicyProper: result.onPolicyGraph.isProper &&
          (selectedSynthesis?.risk?.selectedPolicyProper ?? true),
        unresolvedOnPolicyProbability: 1 -
          (1 - result.onPolicyGraph.onPolicyUnresolvedProbabilityMass) *
          (1 - (selectedSynthesis?.risk?.unresolvedOnPolicyProbability ?? 0)),
      },
      priceConfidence: {
        selectedPolicy: {
          complete: result.priceConfidence.complete,
          evidence: result.priceConfidence.evidence.map((evidence) => ({ ...evidence })),
          warnings: [...result.priceConfidence.warnings],
        },
        consideredSearchSpace: {
          complete: result.consideredPriceConfidence.complete,
          evidence: result.consideredPriceConfidence.evidence.map((evidence) => ({ ...evidence })),
          warnings: [...result.consideredPriceConfidence.warnings],
        },
      },
      mechanicsConfidence: {
        gameMechanicsFidelity: 'PARTIAL',
        selectedPolicy: mechanicsScope(selectedMechanicsEvidence),
        consideredSearchSpace: mechanicsScope(result.mechanicsConfidence.evidence),
      },
      proof: {
        selectedPolicyStatus: result.optimalityProof.selectedPolicyStatus,
        proofLevel: result.optimalityProof.proofLevel,
        globalOptimality: overallGlobalOptimality,
        modeledActionOptimalityProven: overallModeledActionOptimalityProven,
        unresolvedCompetitiveCandidates: overallUnresolvedCompetitorCount,
        unresolvedCompetitorsMayBeCheaper: overallUnresolvedCouldBeat,
      },
      policyRefinement,
      search: {
        ...result.searchSummary,
        maxWallTimeMs: runtimeBudget.requestedWallTimeMs,
        requestedWallTimeMs: runtimeBudget.requestedWallTimeMs,
        engineDeadlineMs: runtimeBudget.engineDeadlineMs,
        hostGuardDeadlineMs: runtimeBudget.hostGuardDeadlineMs,
        shutdownReserveMs: runtimeBudget.shutdownReserveMs,
        hostGuardTriggered: false,
        stageTimingMs: { ...result.stageTiming, serializationMs: 0 },
        sessionReuse: selectedSessionReuse,
        totalElapsedMs: Date.now() - optimizationStarted,
        harvestActionScope: {
          mode: harvestTags.length === 0
            ? 'DISABLED'
            : input.harvestTags === undefined
              ? 'TARGET_INFERRED'
              : 'EXPLICIT',
          tags: [...harvestTags],
          rawInferredTags: input.harvestTags === undefined ? [...harvestTags] : [],
          enabledCrafts: enabledHarvestCrafts,
        },
      },
      solver: {
        bellmanIterations: result.convergence.iterations +
          (selectedSynthesis?.solver?.bellmanIterations ?? 0),
        bellmanConverged: result.convergence.converged &&
          (selectedSynthesis?.solver?.bellmanConverged ?? true),
        occupancyIterations: result.reconciliation.visitIterations +
          (selectedSynthesis?.solver?.occupancyIterations ?? 0),
        occupancyConverged: result.reconciliation.visitConverged &&
          (selectedSynthesis?.solver?.occupancyConverged ?? true),
        reconciliationDifferenceChaos: result.reconciliation.differenceChaos +
          (selectedSynthesis?.solver?.reconciliationDifferenceChaos ?? 0),
        costReconciled: result.reconciliation.isReconciled &&
          (selectedSynthesis?.solver?.costReconciled ?? true),
      },
      marketContext: input.marketContext,
      harvestComparison,
      paretoAlternatives,
      objectiveProofStatus,
      objective: input.objective,
      costCeilingChaos,
      warningDetails: uniqueWarningDetails,
      warnings: [...new Set(uniqueWarningDetails.map((warning) => warning.message))],
    };
    const craftPlan = buildCraftPlan(outputWithoutCraftPlan);
    const methodPortfolio = buildMethodPortfolio(
      pool,
      allResolvedRoutes,
      recommended,
      fastCleanRoute,
      bestFractureRoute,
      synthesisSummaries,
      starts,
      harvestComparison,
      priceBook,
      craftPlan
    );
    const output: OptimizeCraftResult = {
      ...outputWithoutCraftPlan,
      craftPlan,
      methodPortfolio,
    };
    // never become a frontend integration surprise.
    const serializationStarted = Date.now();
    JSON.stringify(output);
    output.search.stageTimingMs.serializationMs = Date.now() - serializationStarted;
    JSON.stringify(output);

    currentBestUpperBound = output.expectedCostChaos ?? undefined;
    currentBestUnresolvedLowerBound = output.acquisition.bestUnresolvedLowerBoundChaos;
    currentPotentialGap = output.acquisition.potentialGapChaos;
    currentPortfolioProofStatus = output.acquisition.portfolioProof.status;
    currentUnresolvedCompetitiveCandidates =
      output.acquisition.portfolioProof.unresolvedCompetitiveCandidates;
    currentResolvedCompetitiveCandidates =
      output.acquisition.portfolioProof.resolvedCompetitiveCandidates;
    currentDominatedCandidates = output.acquisition.portfolioProof.dominatedCandidates;
    for (const candidate of progressCandidates.values()) {
      candidate.isActive = false;
      if (
        candidate.status === 'PROBING' ||
        candidate.status === 'ACQUISITION_PROBING' ||
        candidate.status === 'DOWNSTREAM_PROBING'
      ) candidate.status = 'COMPETITIVE_UNRESOLVED';
    }
    for (const evidence of output.acquisition.portfolioProof.candidateEvidence) {
      const progressId = evidence.kind === 'clean' ? 'clean' : evidence.candidateId;
      const candidate = progressCandidates.get(progressId);
      if (!candidate) continue;
      candidate.status = evidence.status;
      candidate.acquisitionLowerBoundChaos = evidence.acquisitionLowerBoundChaos;
      candidate.downstreamLowerBoundChaos = evidence.downstreamLowerBoundChaos;
      candidate.fullRouteLowerBoundChaos = evidence.fullRouteLowerBoundChaos;
      candidate.lowerBoundChaos = evidence.fullRouteLowerBoundChaos;
      candidate.acquisitionUpperBoundChaos = evidence.acquisitionUpperBoundChaos;
      candidate.downstreamUpperBoundChaos = evidence.downstreamUpperBoundChaos;
      candidate.fullRouteUpperBoundChaos = evidence.fullRouteUpperBoundChaos;
      candidate.proofReason = evidence.proofReason;
      candidate.retainedAcquisitionStates = evidence.retainedAcquisitionStates;
      candidate.retainedDownstreamStates = evidence.retainedDownstreamStates;
      candidate.retainedStates = evidence.retainedAcquisitionStates +
        evidence.retainedDownstreamStates;
    }
    const selectedProgressId = output.acquisition.selectedCandidateId ===
        `candidate_${cleanCandidateIndex}`
      ? 'clean'
      : output.acquisition.selectedCandidateId;
    if (selectedProgressId) {
      const selectedProgress = progressCandidates.get(selectedProgressId);
      if (selectedProgress) selectedProgress.status = 'SELECTED';
    }
    const portfolioMilestone = output.acquisition.portfolioProof.status === 'PORTFOLIO_OPTIMAL'
      ? 'Portfolio optimality proven over modeled acquisitions'
      : output.acquisition.portfolioProof.status === 'SELECTED_ACQUISITION_SAFE'
        ? 'Selected acquisition is safe against every modeled starting family'
        : undefined;
    if (portfolioMilestone && !recentMilestones.includes(portfolioMilestone)) {
      recentMilestones.push(portfolioMilestone);
      if (recentMilestones.length > 8) recentMilestones.shift();
    }
    const finalFocus = output.recommended === null
      ? 'Search finished without a resolved route'
      : `Selected route: ${output.recommended.name}`;
    emitProgress(
      'COMPLETE',
      'Search finished',
      finalFocus,
      true,
      output.recommended === null
        ? 'Search finished without a resolved route'
        : `Selected route: ${output.recommended.name}`
    );
    return output;
  }
}
