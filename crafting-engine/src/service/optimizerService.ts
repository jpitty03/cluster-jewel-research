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
  TransitionGenerationDeadlineExceeded,
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
  MethodFamilyEvaluationSource,
  MethodFamilyStageStatus,
  MethodFamilyStatus,
  MethodFamilySpec,
  MethodFamilyResult,
} from '../domain/MethodFamily.ts';
import {
  HARVEST_CRAFT_DEFINITIONS,
  type LifeforceType,
} from '../rules/harvestCrafts.ts';
import {
  certifyRepeatableReroll,
  type CertifiedRepeatableReroll,
} from '../solver/repeatableRerollCertification.ts';

export type {
  ActionCostVector,
  ActionEffortProfile,
  EffortConfidence,
  MethodFamilyKind,
  MethodFamilyEvaluationSource,
  MethodFamilyStageStatus,
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
  /** Independently solve constrained method families after the open recommendation. */
  compareMethodFamilies?: boolean;
}

export type ResultMetricScope =
  | 'ACQUISITION'
  | 'DOWNSTREAM'
  | 'FULL_ROUTE'
  | 'PORTFOLIO_TOTAL_WORK'
  | 'SELECTED_POLICY_GRAPH'
  | 'METHOD_FAMILY_GRAPH';

export interface ScopedExpectedActionUsage extends ExpectedActionUsage {
  scope: 'ACQUISITION' | 'DOWNSTREAM' | 'FULL_ROUTE';
  additive: true;
}

export interface FullRouteUsageSummary {
  acquisitionActions: ScopedExpectedActionUsage[];
  downstreamActions: ScopedExpectedActionUsage[];
  combinedActions: ScopedExpectedActionUsage[];
  combinedCurrencies: Record<string, number>;
  acquisitionCostChaos: number;
  downstreamCostChaos: number;
  fullRouteCostChaos: number;
  reconciliationDifferenceChaos: number;
}

export type HarvestLifecycleStatus =
  | 'NOT_ELIGIBLE'
  | 'PRICE_UNAVAILABLE_OR_DISABLED'
  | 'ENABLED_NOT_SEARCHED'
  | 'SEARCHING'
  | 'ENABLED_UNRESOLVED'
  | 'RESOLVED_MORE_EXPENSIVE'
  | 'RESOLVED_FASTER_BUT_OVER_CEILING'
  | 'SELECTED'
  | 'DOMINATED_BY_PROOF';

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
  harvestActionId?: string;
  harvestActionName?: string;
  harvestTag?: string;
  lifeforceType?: LifeforceType;
  lifeforcePerApplication?: number;
  expectedHarvestApplications?: number;
  certifiedSuccessProbabilityPerApplication?: number;
  expectedLifeforce?: number;
  harvestNonLifeforceCostChaos?: number;
  harvestTotalAtCurrentPriceChaos?: number;
  currentLifeforceUnitPriceChaos?: number;
  costDifferenceChaos?: number;
  actionsSaved?: number;
  timeSavedMs?: number;
  lifeforceCrossoverPriceChaosPerUnit?: number;
  status: HarvestLifecycleStatus;
  actionEvidenceObserved: boolean;
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
  expectedPhysicalActions?: number;
  expectedPreparationPhysicalActions?: number;
  estimatedManualTimeMs?: number;
  expectedPreparationManualTimeMs?: number;
  expectedActionUsage?: ExpectedActionUsage[];
  policy?: AcquisitionSynthesisResult['policy'];
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
  | 'NO_RESOLVED_ROUTE'
  | 'INTERNAL_RESULT_MISMATCH';

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
  firstCertifiedDownstreamU?: number;
  finalDownstreamU?: number;
  firstCertifiedFullRouteU?: number;
  finalFullRouteU?: number;
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
  timeToFirstUsefulExecutableRecommendationMs?: number;
  timeToFirstAcquisitionSafeRecommendationMs?: number;
  /** @deprecated Use timeToFirstUsefulExecutableRecommendationMs. */
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
  workScopes: {
    portfolioTotalStatesExpanded: number;
    portfolioRetainedStates: number;
    selectedPolicyGraphStates: number;
    acquisitionSynthesisStates: number;
    methodFamilyStates: number;
    proofBoundStates: number;
  };
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
  fullRouteUsage: FullRouteUsageSummary;
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
  internalConsistency: InternalResultConsistency;
  presentation: CanonicalResultPresentation;
  warningDetails: OptimizationWarning[];
  warnings: string[];
}

export const CANONICAL_RECONCILIATION_TOLERANCE_CHAOS = 0.05;

export interface InternalResultConsistency {
  status: 'OK' | 'INTERNAL_RESULT_MISMATCH';
  toleranceChaos: number;
  selectedBundleId?: string;
  selectedBundleSource?: ResolvedPolicySourceKind;
  routeActionId?: string;
  acquisitionCandidateId?: string;
  acquisitionMethodId?: string;
  routeCostChaos?: number;
  solverCostChaos?: number;
  usageCostChaos?: number;
  metricsCostChaos?: number;
  maximumDifferenceChaos: number;
}

export interface CanonicalResultPresentation {
  schemaVersion: '2W.1';
  releaseStatus: 'RELEASE_CANDIDATE_BROWSER_VERIFIED';
  selectedRouteName?: string;
  selectedRouteStatus: RecommendationStatus;
  proofLabel: string;
  pricingLabel: 'CURRENT_PRICING' | 'RESEARCH_ESTIMATE_STALE_PRICING';
  harvestLifecycle: HarvestLifecycleStatus;
  acquisitionContext: {
    kind: 'CLEAN' | 'SELF_FRACTURE' | 'OTHER';
    candidateId?: string;
    methodId?: string;
    targetModId?: string;
  };
  fullRouteCostChaos?: number;
  routeScopes: {
    acquisitionU?: number;
    downstreamU?: number;
    fullRouteU?: number;
  };
  timingScopes: {
    firstCompletedRoundMs?: number;
    firstCertifiedDownstreamPolicyMs?: number;
    firstUsefulExecutableFullRouteMs?: number;
    firstAcquisitionSafeRecommendationMs?: number;
  };
  workScopes: OptimizationSearchSummary['workScopes'];
  methodFamilyCounts: Record<MethodFamilyStatus, number>;
}

function finiteOrNull(value: number): number | null {
  return Number.isFinite(value) ? value : null;
}

const CURRENCY_BY_ACTION_ID: Readonly<Record<string, string>> = {
  transmutation_orb: 'transmutation',
  alteration_orb: 'alteration',
  augmentation_orb: 'augmentation',
  regal_orb: 'regal',
  scouring_orb: 'scour',
  annulment_orb: 'annul',
  exalted_orb: 'exalt',
  fracturing_orb: 'fracturing',
  restart_reacquire: 'clean_base_reacquisition',
  clean_base_initial: 'clean_base',
};

function mergeActionUsage(
  usages: readonly ScopedExpectedActionUsage[],
  scope: ScopedExpectedActionUsage['scope']
): ScopedExpectedActionUsage[] {
  const merged = new Map<string, ScopedExpectedActionUsage>();
  for (const usage of usages) {
    const existing = merged.get(usage.actionId);
    if (existing) {
      existing.expectedCount += usage.expectedCount;
      existing.expectedCostChaos += usage.expectedCostChaos;
      continue;
    }
    merged.set(usage.actionId, { ...usage, scope, additive: true });
  }
  return [...merged.values()].sort((left, right) =>
    right.expectedCostChaos - left.expectedCostChaos ||
    left.actionId.localeCompare(right.actionId)
  );
}

function currencyVectorFromActions(
  usages: readonly ScopedExpectedActionUsage[]
): Record<string, number> {
  const totals: Record<string, number> = {};
  const harvestByActionId = new Map(
    Object.values(HARVEST_CRAFT_DEFINITIONS).map((definition) => [definition.craftId, definition])
  );
  for (const usage of usages) {
    const harvest = harvestByActionId.get(usage.actionId);
    if (harvest) {
      totals[harvest.lifeforceType] = (totals[harvest.lifeforceType] ?? 0) +
        usage.expectedCount * harvest.lifeforceAmount;
      continue;
    }
    const currency = CURRENCY_BY_ACTION_ID[usage.actionId];
    if (currency) totals[currency] = (totals[currency] ?? 0) + usage.expectedCount;
  }
  return Object.fromEntries(
    Object.entries(totals)
      .filter(([, quantity]) => Number.isFinite(quantity) && quantity > 0)
      .sort(([left], [right]) => left.localeCompare(right))
  );
}

function buildFullRouteUsageSummary(options: {
  recommended: RouteSummary | null;
  cleanBaseCostChaos: number;
  selectedSynthesis?: AcquisitionSynthesisSummary;
  downstreamActionUsage: readonly ExpectedActionUsage[];
}): FullRouteUsageSummary {
  if (!options.recommended) {
    return {
      acquisitionActions: [],
      downstreamActions: [],
      combinedActions: [],
      combinedCurrencies: {},
      acquisitionCostChaos: 0,
      downstreamCostChaos: 0,
      fullRouteCostChaos: 0,
      reconciliationDifferenceChaos: 0,
    };
  }

  const acquisitionActions: ScopedExpectedActionUsage[] = [{
    actionId: 'clean_base_initial',
    actionName: 'Initial clean cluster jewel base',
    expectedCount: 1,
    expectedCostChaos: options.cleanBaseCostChaos,
    scope: 'ACQUISITION',
    additive: true,
  }];
  if (options.selectedSynthesis) {
    acquisitionActions.push(...(options.selectedSynthesis.expectedActionUsage ?? []).map((usage) => ({
      ...usage,
      scope: 'ACQUISITION' as const,
      additive: true as const,
    })));
  }
  const downstreamActions: ScopedExpectedActionUsage[] = options.downstreamActionUsage
    .filter((usage) => !usage.actionId.startsWith('acquire_'))
    .map((usage) => ({
      ...usage,
      scope: 'DOWNSTREAM' as const,
      additive: true as const,
    }));
  const normalizedAcquisition = mergeActionUsage(acquisitionActions, 'ACQUISITION');
  const normalizedDownstream = mergeActionUsage(downstreamActions, 'DOWNSTREAM');
  const combinedActions = mergeActionUsage(
    [...normalizedAcquisition, ...normalizedDownstream],
    'FULL_ROUTE'
  );
  const acquisitionCostChaos = normalizedAcquisition.reduce(
    (sum, usage) => sum + usage.expectedCostChaos,
    0
  );
  const downstreamCostChaos = normalizedDownstream.reduce(
    (sum, usage) => sum + usage.expectedCostChaos,
    0
  );
  const fullRouteCostChaos = acquisitionCostChaos + downstreamCostChaos;
  return {
    acquisitionActions: normalizedAcquisition,
    downstreamActions: normalizedDownstream,
    combinedActions,
    combinedCurrencies: currencyVectorFromActions(combinedActions),
    acquisitionCostChaos,
    downstreamCostChaos,
    fullRouteCostChaos,
    reconciliationDifferenceChaos: Math.abs(
      fullRouteCostChaos - (options.recommended.expectedTotalCostChaos ?? fullRouteCostChaos)
    ),
  };
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
      tradeoffSummary = `Dominates the currently resolved alternatives: ${cost.toFixed(1)}c (${Math.round(act)} actions, ${(time / 1000).toFixed(1)}s)`;
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

const CONVENTIONAL_METHOD_ACTION_IDS = [
  'transmutation_orb',
  'alteration_orb',
  'augmentation_orb',
  'regal_orb',
  'scouring_orb',
  'annulment_orb',
  'exalted_orb',
] as const;

interface MethodPortfolioBuildContext {
  pool: ModPool;
  priceBook: PriceBook;
  input: OptimizeCraftInput;
  starts: StartingStateCandidate[];
  cleanStart: StartingStateCandidate;
  cleanEvidence: { costChaos: number; confidence: PriceConfidence; provenance: string };
  recommended: RouteSummary | null;
  recommendationStatus: RecommendationStatus;
  craftPlan: CraftPlanSummary;
  openResult: GenericSearchResult;
  fastCleanResult?: GenericSearchResult;
  fastCleanRoute?: RouteSummary;
  synthesisSummaries: Map<number, AcquisitionSynthesisSummary>;
  acquisition: AcquisitionSummary;
  enabledHarvestCrafts: Array<{ actionId: string; actionName: string; tag: string }>;
  session: OptimizerSearchSessionRecord;
  searchIdentityHash: string;
  deadlineMs: number;
}

export type ResolvedPolicySourceKind =
  | 'OPEN'
  | 'CLEAN_DIRECT'
  | 'SELF_FRACTURE'
  | 'CONVENTIONAL'
  | 'HARVEST'
  | 'SELF_FRACTURE_HARVEST'
  | 'OTHER';

interface ResolvedMethodPolicySource {
  id: string;
  familyId: string;
  source: ResolvedPolicySourceKind;
  route: RouteSummary;
  solverResult: GenericSearchResult;
  acquisitionCandidateId: string;
  acquisitionMethodId: string;
  acquisitionSynthesis?: AcquisitionSynthesisSummary;
  actionEvidence: string[];
}

interface MethodPortfolioBuildOutput {
  families: MethodFamilyResult[];
  resolvedPolicies: ResolvedMethodPolicySource[];
}

function methodFamilyStatus(
  route: RouteSummary | undefined,
  recommended: RouteSummary | null
): Pick<MethodFamilyResult, 'status' | 'costDifferenceChaos' | 'costDifferencePercent'> {
  if (!route || route.expectedTotalCostChaos === null) return { status: 'UNRESOLVED_AT_BUDGET' };
  const selectedCost = recommended?.expectedTotalCostChaos;
  if (selectedCost === null || selectedCost === undefined) return { status: 'DOMINATED' };
  const difference = route.expectedTotalCostChaos - selectedCost;
  const percent = selectedCost > 0 ? difference / selectedCost * 100 : undefined;
  return {
    status: Math.abs(difference) <= 0.05 ? 'SELECTED_WINNER' : difference > 0 ? 'MORE_EXPENSIVE' : 'DOMINATED',
    costDifferenceChaos: difference,
    costDifferencePercent: percent,
  };
}

function stageStatus(
  upper: number | undefined,
  lower: number | undefined,
  dominated = false
): MethodFamilyStageStatus {
  if (dominated) return 'DOMINATED';
  if (upper !== undefined && Number.isFinite(upper)) return 'RESOLVED';
  if (lower !== undefined) return 'UNRESOLVED';
  return 'NOT_SEARCHED';
}

function methodPolicyHealth(
  result: GenericSearchResult,
): NonNullable<MethodFamilyResult['policyHealth']> {
  return {
    selectedPolicyStatus: result.optimalityProof.selectedPolicyStatus,
    proofLevel: result.optimalityProof.proofLevel,
    onPolicyReachableStates: result.onPolicyGraph.onPolicyReachableStates,
    onPolicyTerminalStates: result.onPolicyGraph.onPolicyTerminalStates,
    onPolicyUnresolvedTransitions: result.onPolicyGraph.onPolicyUnresolvedTransitions,
    terminalAbsorptionProbability: result.onPolicyGraph.terminalAbsorptionProbability,
    proper: result.onPolicyGraph.isProper,
    fullyResolved: result.onPolicyGraph.isFullyResolved,
    bellmanConverged: result.convergence.converged,
    occupancyConverged: result.reconciliation.visitConverged,
    costReconciled: result.reconciliation.isReconciled,
    reconciliationDifferenceChaos: Number.isFinite(result.reconciliation.differenceChaos)
      ? result.reconciliation.differenceChaos
      : undefined,
  };
}

function buildMethodPortfolio(context: MethodPortfolioBuildContext): MethodPortfolioBuildOutput {
  const {
    pool,
    priceBook,
    input,
    starts,
    cleanStart,
    cleanEvidence,
    recommended,
    recommendationStatus,
    craftPlan,
    openResult,
    fastCleanResult,
    fastCleanRoute,
    synthesisSummaries,
    acquisition,
    enabledHarvestCrafts,
    session,
    searchIdentityHash,
    deadlineMs,
  } = context;
  const results: MethodFamilyResult[] = [];
  const resolvedPolicies: ResolvedMethodPolicySource[] = [];
  const compare = input.compareMethodFamilies === true ||
    (input.objective?.kind ?? 'CHEAPEST_CHAOS') !== 'CHEAPEST_CHAOS';
  const selectedEvidence = acquisition.portfolioProof.candidateEvidence.find(
    (candidate) => candidate.candidateId === acquisition.selectedCandidateId
  );
  const openUsage = openResult.expectedActionUsage.map((usage) => ({ ...usage }));
  results.push({
    spec: {
      id: 'family_open',
      kind: 'OPEN',
      name: 'Open Policy (All Modeled Mechanics)',
      description: 'Unconstrained search across every legal and enabled modeled mechanic.',
      badge: 'Open search',
      forcedAcquisitionType: 'OPEN',
    },
    status: recommended ? 'SELECTED_WINNER' : 'UNRESOLVED_AT_BUDGET',
    evaluationSource: 'INDEPENDENT_SOLVE',
    route: recommended ?? undefined,
    craftPlan,
    whyNotSelectedExplanation: recommended
      ? recommendationStatus === 'PROVEN_OPTIMAL'
        ? 'Portfolio optimality is proven over the modeled search space.'
        : 'Best executable open-search route at the current proof budget.'
      : 'The open search did not certify an executable full route at this budget.',
    acquisitionStatus: stageStatus(selectedEvidence?.acquisitionUpperBoundChaos, selectedEvidence?.acquisitionLowerBoundChaos),
    acquisitionL: selectedEvidence?.acquisitionLowerBoundChaos,
    acquisitionU: selectedEvidence?.acquisitionUpperBoundChaos,
    downstreamStatus: stageStatus(selectedEvidence?.downstreamUpperBoundChaos, selectedEvidence?.downstreamLowerBoundChaos),
    downstreamL: selectedEvidence?.downstreamLowerBoundChaos,
    downstreamU: selectedEvidence?.downstreamUpperBoundChaos,
    fullRouteStatus: stageStatus(selectedEvidence?.fullRouteUpperBoundChaos, selectedEvidence?.fullRouteLowerBoundChaos),
    fullRouteL: selectedEvidence?.fullRouteLowerBoundChaos,
    fullRouteU: selectedEvidence?.fullRouteUpperBoundChaos,
    requiredActionObservedOnPolicy: true,
    onPolicyActionIds: [...new Set(openUsage.map((usage) => usage.actionId))].sort(),
    expectedActionUsage: openUsage,
    policyHealth: methodPolicyHealth(openResult),
    sessionIdentity: `${searchIdentityHash}:family_open`,
    retainedStates: openResult.graphBuild.nodes.size,
    transitionDistributionsGenerated: openResult.searchSummary.transitionDistributionsGenerated,
    budget: {
      maxStates: openResult.searchSummary.maxStates,
      maxWallTimeMs: openResult.searchSummary.maxWallTimeMs ?? 0,
      maxExpansionRounds: openResult.searchSummary.maxExpansionRounds,
      elapsedMs: openResult.searchSummary.elapsedMs,
    },
  });

  const independentlyRunnableHarvestCount = enabledHarvestCrafts.filter((craft) => {
    const definition = HARVEST_CRAFT_DEFINITIONS[craft.tag];
    return definition !== undefined &&
      priceBook.evaluateRate(definition.lifeforceType).confidence !== 'unavailable';
  }).length;
  const independentlyRunnableFractureHarvestCount = starts.reduce((count, _start, index) =>
    count + (synthesisSummaries.get(index)?.expectedCostChaos !== undefined
      ? independentlyRunnableHarvestCount
      : 0), 0);
  let remainingConstrainedFamilies = Math.max(
    1,
    1 +
      independentlyRunnableHarvestCount +
      independentlyRunnableFractureHarvestCount,
  );
  const runConstrainedFamily = (
    spec: MethodFamilySpec,
    startState: ItemState,
    acquisitionCostChaos: number,
    acquisitionLowerBoundChaos: number,
    enabledActionIds: string[],
    requiredActionIds: string[],
    includeHarvest: boolean,
    harvestTags: string[]
  ): MethodFamilyResult => {
    const remainingMs = Math.max(1, deadlineMs - Date.now());
    const fairShareWallTimeMs = Math.floor(remainingMs / remainingConstrainedFamilies);
    const repeatableCertificationReserveMs = spec.kind === 'HARVEST' ? 6_000 : 1;
    const allocatedWallTimeMs = Math.max(
      1,
      Math.min(remainingMs, 15_000, Math.max(fairShareWallTimeMs, repeatableCertificationReserveMs)),
    );
    remainingConstrainedFamilies = Math.max(1, remainingConstrainedFamilies - 1);
    const maxStates = Math.max(100, input.searchBudget?.maxStates ?? 5_000);
    let continuation = session.methodFamilies.get(spec.id);
    if (!continuation) {
      continuation = createGenericSearchContinuationSession();
      session.methodFamilies.set(spec.id, continuation);
    }
    const started = Date.now();
    const enabledIdSet = new Set(enabledActionIds);
    const enabledMechanics = [
      ...CRAFT_MECHANICS,
      ...(includeHarvest ? createHarvestReforgeMechanics({ pool, priceBook }, harvestTags) : []),
    ].filter((mechanic) => enabledIdSet.has(mechanic.id));
    const requiredRepeatableMechanic = (
      spec.kind === 'HARVEST' || spec.kind === 'SELF_FRACTURE_HARVEST'
    ) && requiredActionIds.length === 1
      ? enabledMechanics.find((mechanic) =>
          mechanic.id === requiredActionIds[0] && mechanic.repeatableFullReroll !== undefined
        )
      : undefined;
    let repeatableCertification: CertifiedRepeatableReroll | undefined;
    if (requiredRepeatableMechanic) {
      try {
        repeatableCertification = certifyRepeatableReroll({
          mechanic: requiredRepeatableMechanic,
          enabledMechanics,
          seedState: startState,
          target: input.target,
          context: { pool, priceBook },
          requiredActionIds,
          deadlineMs: Math.min(deadlineMs, started + allocatedWallTimeMs),
        });
      } catch (error) {
        if (!(error instanceof TransitionGenerationDeadlineExceeded)) throw error;
      }
    }
    const remainingSearchWallTimeMs = Math.max(
      1,
      allocatedWallTimeMs - (Date.now() - started),
    );
    const precomputedRepeatableRerollTransitions = repeatableCertification
      ? new Map([[
          requiredRepeatableMechanic!.id,
          {
            kernelIdentity: repeatableCertification.evidence.kernelIdentity,
            distribution: repeatableCertification.distribution,
          },
        ]])
      : undefined;
    const familyResult = new GenericSearchEngine(
      { pool, priceBook },
      input.target,
      {
        includeHarvest,
        harvestTags,
        enabledActionIds,
        requiredAnyActionIds: requiredActionIds,
        prioritizeTargetProgress: true,
        allowResearchFallbackPrices: input.allowResearchFallbackPrices ?? true,
        maxStates,
        maxWallTimeMs: remainingSearchWallTimeMs,
        maxExpansionRounds: input.searchBudget?.maxExpansionRounds ?? 3,
        searchIntent: 'DEEPEN',
        objective: input.objective,
        effortProfile: input.effortProfile,
        persistentExpansion: true,
        continuationSession: continuation,
        canonicalStateKey: repeatableCertification?.stateKey,
        precomputedRepeatableRerollTransitions,
        recommendationRefinementRounds: 1,
        skipAcquisitionFeasibility: startState.flags?.acquisitionMenu === true,
      }
    ).search(startState);
    const elapsedMs = Date.now() - started;
    const usage = familyResult.expectedActionUsage.map((entry) => ({ ...entry }));
    const onPolicyActionIds = [...new Set(usage
      .filter((entry) => entry.expectedCount > 0)
      .map((entry) => entry.actionId))].sort();
    const requiredActionObservedOnPolicy = requiredActionIds.length === 0 ||
      requiredActionIds.some((actionId) => onPolicyActionIds.includes(actionId));
    const requiredRepeatableKernelCertified = requiredRepeatableMechanic === undefined ||
      repeatableCertification !== undefined;
    const certified = familyResult.optimalityProof.selectedPolicyStatus ===
      'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED' &&
      requiredActionObservedOnPolicy &&
      requiredRepeatableKernelCertified;
    const rawLower = genericSearchStartLowerBound(familyResult, startState, input.target);
    const searchIncludesAcquisition = startState.flags?.acquisitionMenu === true;
    const downstreamLower = searchIncludesAcquisition
      ? Math.max(0, rawLower - acquisitionLowerBoundChaos)
      : rawLower;
    const downstreamUpper = certified
      ? searchIncludesAcquisition
        ? Math.max(0, familyResult.totalExpectedCostChaos - acquisitionCostChaos)
        : familyResult.totalExpectedCostChaos
      : undefined;
    const fullRouteLower = acquisitionLowerBoundChaos + downstreamLower;
    const fullRouteUpper = downstreamUpper === undefined
      ? undefined
      : acquisitionCostChaos + downstreamUpper;
    const route: RouteSummary | undefined = fullRouteUpper === undefined ? undefined : {
      actionId: `method:${spec.id}`,
      name: recommended && Math.abs((recommended.expectedTotalCostChaos ?? Infinity) - fullRouteUpper) <= 0.05
        ? recommended.name
        : spec.name,
      expectedTotalCostChaos: fullRouteUpper,
      lowerBoundChaos: fullRouteLower,
      incumbentUpperBoundChaos: fullRouteUpper,
      optimalityGapChaos: Math.max(0, fullRouteUpper - fullRouteLower),
      status: 'RESOLVED',
      couldBeatResolvedIncumbent: recommended?.expectedTotalCostChaos !== null &&
        recommended?.expectedTotalCostChaos !== undefined &&
        fullRouteLower < recommended.expectedTotalCostChaos,
      metrics: familyResult.metrics ? {
        ...familyResult.metrics,
        expectedChaosCost: fullRouteUpper,
      } : undefined,
      acquisitionMetrics: {
        expectedChaosCost: acquisitionCostChaos,
        expectedPhysicalActions: searchIncludesAcquisition ? 1 : 0,
        estimatedManualTimeMs: searchIncludesAcquisition ? 1_000 : 0,
        objectiveScore: acquisitionCostChaos,
        effortConfidence: 'DEFAULT_APPROXIMATE',
      },
      downstreamMetrics: familyResult.metrics ? {
        ...familyResult.metrics,
        expectedChaosCost: downstreamUpper ?? familyResult.totalExpectedCostChaos,
      } : undefined,
    };
    const comparison = methodFamilyStatus(route, recommended);
    if (route) {
      const familySource: ResolvedPolicySourceKind = spec.kind === 'CONVENTIONAL'
        ? 'CONVENTIONAL'
        : spec.kind === 'HARVEST'
          ? 'HARVEST'
          : spec.kind === 'SELF_FRACTURE_HARVEST'
            ? 'SELF_FRACTURE_HARVEST'
            : 'OTHER';
      const targetFractureIndex = spec.targetFractureModId === undefined
        ? -1
        : starts.findIndex((start) => start.fracturedRequirement?.modId === spec.targetFractureModId);
      resolvedPolicies.push({
        id: `bundle:${spec.id}`,
        familyId: spec.id,
        source: familySource,
        route,
        solverResult: familyResult,
        acquisitionCandidateId: targetFractureIndex >= 0
          ? `candidate_${targetFractureIndex}`
          : `candidate_${starts.indexOf(cleanStart)}`,
        acquisitionMethodId: targetFractureIndex >= 0
          ? 'self-fracture_executable'
          : `clean-base_${cleanStart.acquisitions.findIndex((method) => method.type === 'clean-base')}`,
        acquisitionSynthesis: targetFractureIndex >= 0
          ? synthesisSummaries.get(targetFractureIndex)
          : undefined,
        actionEvidence: onPolicyActionIds,
      });
    }
    return {
      spec,
      ...comparison,
      evaluationSource: 'INDEPENDENT_SOLVE',
      route,
      acquisitionStatus: 'RESOLVED',
      acquisitionL: acquisitionLowerBoundChaos,
      acquisitionU: acquisitionCostChaos,
      downstreamStatus: stageStatus(downstreamUpper, downstreamLower),
      downstreamL: downstreamLower,
      downstreamU: downstreamUpper,
      fullRouteStatus: stageStatus(fullRouteUpper, fullRouteLower),
      fullRouteL: fullRouteLower,
      fullRouteU: fullRouteUpper,
      requiredActionObservedOnPolicy,
      onPolicyActionIds,
      expectedActionUsage: usage,
      policyHealth: methodPolicyHealth(familyResult),
      repeatableRerollCertification: repeatableCertification?.evidence,
      sessionIdentity: `${searchIdentityHash}:${spec.id}`,
      retainedStates: continuation.expansion.nodes.size,
      transitionDistributionsGenerated:
        continuation.expansion.transitionDistributionsGeneratedTotal +
        (repeatableCertification ? 1 : 0),
      budget: {
        maxStates,
        maxWallTimeMs: allocatedWallTimeMs,
        maxExpansionRounds: input.searchBudget?.maxExpansionRounds ?? 3,
        elapsedMs,
      },
      whyNotSelectedExplanation: !requiredActionObservedOnPolicy
        ? `The constrained policy did not contain a required ${spec.badge} action on-policy, so the family is unresolved.`
        : !requiredRepeatableKernelCertified
          ? `The required repeatable ${spec.badge} kernel was not certified within this request budget, so the family is unresolved.`
        : route
          ? comparison.status === 'SELECTED_WINNER'
            ? 'Independent constrained solve reproduces the selected policy at the current objective.'
            : `${spec.name} independently resolved at ${route.expectedTotalCostChaos?.toFixed(1)}c.` +
              (repeatableCertification
                ? ` A certified repeatable full-reroll quotient used the authoritative ` +
                  `${repeatableCertification.evidence.transitionOutcomeCount.toLocaleString()}-outcome distribution.`
                : '')
          : `Independent constrained search remained unresolved after ${continuation.expansion.nodes.size.toLocaleString()} retained states.`,
    };
  };

  const conventionalSpec: MethodFamilySpec = {
    id: 'family_conventional',
    kind: 'CONVENTIONAL',
    name: 'Conventional Alt / Aug / Regal',
    description: 'Clean-base rolling constrained to currency preparation, cleanup, promotion, and slams; Harvest and self-fracture are forbidden.',
    badge: 'Alt + Regal',
    allowedActionIds: [...CONVENTIONAL_METHOD_ACTION_IDS],
    forbiddenActionIds: ['fracturing_orb', ...enabledHarvestCrafts.map((craft) => craft.actionId)],
    forcedAcquisitionType: 'CLEAN',
  };
  if (compare) {
    results.push(runConstrainedFamily(
      conventionalSpec,
      cleanStart.state,
      cleanEvidence.costChaos,
      cleanEvidence.costChaos,
      conventionalSpec.allowedActionIds ?? [],
      [],
      false,
      []
    ));
  } else {
    const comparison = methodFamilyStatus(fastCleanRoute, recommended);
    results.push({
      spec: conventionalSpec,
      ...comparison,
      status: fastCleanRoute ? comparison.status : 'NOT_SEARCHED',
      evaluationSource: fastCleanRoute ? 'OPEN_SEARCH_SUMMARY' : 'NOT_SEARCHED',
      route: fastCleanRoute,
      acquisitionStatus: 'RESOLVED',
      acquisitionL: cleanEvidence.costChaos,
      acquisitionU: cleanEvidence.costChaos,
      downstreamStatus: fastCleanRoute ? 'RESOLVED' : 'NOT_SEARCHED',
      downstreamU: fastCleanRoute?.expectedTotalCostChaos === null
        ? undefined
        : fastCleanRoute?.expectedTotalCostChaos !== undefined
          ? fastCleanRoute.expectedTotalCostChaos - cleanEvidence.costChaos
          : undefined,
      fullRouteStatus: fastCleanRoute ? 'RESOLVED' : 'NOT_SEARCHED',
      fullRouteL: fastCleanRoute?.lowerBoundChaos,
      fullRouteU: fastCleanRoute?.expectedTotalCostChaos ?? undefined,
      requiredActionObservedOnPolicy: true,
      onPolicyActionIds: fastCleanResult
        ? [...new Set(fastCleanResult.expectedActionUsage.map((usage) => usage.actionId))].sort()
        : [],
      expectedActionUsage: fastCleanResult?.expectedActionUsage.map((usage) => ({ ...usage })),
      policyHealth: fastCleanResult ? methodPolicyHealth(fastCleanResult) : undefined,
      retainedStates: fastCleanResult?.graphBuild.nodes.size ?? 0,
      transitionDistributionsGenerated: fastCleanResult?.searchSummary.transitionDistributionsGenerated ?? 0,
      whyNotSelectedExplanation: fastCleanRoute
        ? 'Summarized from the clean candidate found by open search; use Compare Methods for an independent constrained solve.'
        : 'Not independently searched yet. Use Compare Methods.',
    });
  }

  for (const craft of enabledHarvestCrafts) {
    const definition = HARVEST_CRAFT_DEFINITIONS[craft.tag];
    const priceAvailable = definition !== undefined &&
      priceBook.evaluateRate(definition.lifeforceType).confidence !== 'unavailable';
    const spec: MethodFamilySpec = {
      id: `family_harvest_${craft.tag}`,
      kind: 'HARVEST',
      name: craft.actionName,
      description: `Clean-base family constrained to ${craft.actionName}; the selected policy must contain that action.`,
      badge: `Harvest ${craft.tag}`,
      allowedActionIds: ['transmutation_orb', 'regal_orb', craft.actionId],
      requiredActionIds: [craft.actionId],
      forbiddenActionIds: ['fracturing_orb'],
      forcedAcquisitionType: 'CLEAN',
    };
    if (!priceAvailable) {
      results.push({
        spec,
        status: 'DISABLED',
        evaluationSource: 'NOT_SEARCHED',
        acquisitionStatus: 'RESOLVED',
        acquisitionL: cleanEvidence.costChaos,
        acquisitionU: cleanEvidence.costChaos,
        downstreamStatus: 'NOT_SEARCHED',
        fullRouteStatus: 'NOT_SEARCHED',
        requiredActionObservedOnPolicy: false,
        onPolicyActionIds: [],
        retainedStates: 0,
        transitionDistributionsGenerated: 0,
        whyNotSelectedExplanation: `${definition?.lifeforceType ?? 'Lifeforce'} price evidence is unavailable.`,
      });
    } else if (compare) {
      results.push(runConstrainedFamily(
        spec,
        cleanStart.state,
        cleanEvidence.costChaos,
        cleanEvidence.costChaos,
        spec.allowedActionIds ?? [],
        [craft.actionId],
        true,
        [craft.tag]
      ));
    } else {
      results.push({
        spec,
        status: 'NOT_SEARCHED',
        evaluationSource: 'NOT_SEARCHED',
        acquisitionStatus: 'RESOLVED',
        acquisitionL: cleanEvidence.costChaos,
        acquisitionU: cleanEvidence.costChaos,
        downstreamStatus: 'NOT_SEARCHED',
        fullRouteStatus: 'NOT_SEARCHED',
        requiredActionObservedOnPolicy: false,
        onPolicyActionIds: [],
        retainedStates: session.methodFamilies.get(spec.id)?.expansion.nodes.size ?? 0,
        transitionDistributionsGenerated: session.methodFamilies.get(spec.id)?.expansion.transitionDistributionsGeneratedTotal ?? 0,
        whyNotSelectedExplanation: 'Enabled but not searched. Use Compare Methods to run the required-action family solve.',
      });
    }
  }

  for (let index = 0; index < starts.length; index++) {
    const start = starts[index];
    const requirement = start.fracturedRequirement;
    if (!requirement?.modId) continue;
    const mod = pool.findModById(requirement.modId);
    const modName = mod ? `${mod.name} (T${mod.tier})` : requirement.modId;
    const synthesis = synthesisSummaries.get(index);
    const evidence = acquisition.portfolioProof.candidateEvidence.find(
      (candidate) => candidate.candidateId === `candidate_${index}`
    );
    const proofRecord = session.fractureProofs.get(JSON.stringify(requirement));
    const downstreamUsage = proofRecord?.downstream?.expectedActionUsage ?? [];
    const allUsage = [
      ...(synthesis?.expectedActionUsage ?? []),
      ...downstreamUsage,
    ];
    const onPolicyActionIds = [...new Set(allUsage
      .filter((usage) => usage.expectedCount > 0)
      .map((usage) => usage.actionId))].sort();
    const acquisitionL = synthesis?.lowerBoundChaos ?? evidence?.acquisitionLowerBoundChaos;
    const acquisitionU = synthesis?.expectedCostChaos ?? evidence?.acquisitionUpperBoundChaos;
    const fullU = evidence?.fullRouteUpperBoundChaos;
    const fullL = evidence?.fullRouteLowerBoundChaos ?? 0;
    const route: RouteSummary | undefined = fullU === undefined ? undefined : {
      actionId: `method:family_fracture_${requirement.modId}`,
      name: recommended?.acquisitionCandidateId === `candidate_${index}`
        ? recommended.name
        : `Self-Fracture ${modName}`,
      acquisitionCandidateId: `candidate_${index}`,
      acquisitionMethodId: 'self-fracture_executable',
      expectedTotalCostChaos: fullU,
      lowerBoundChaos: fullL,
      incumbentUpperBoundChaos: fullU,
      optimalityGapChaos: Math.max(0, fullU - fullL),
      status: 'RESOLVED',
      couldBeatResolvedIncumbent: recommended?.expectedTotalCostChaos !== null &&
        recommended?.expectedTotalCostChaos !== undefined &&
        fullL < recommended.expectedTotalCostChaos,
      metrics: proofRecord?.downstream?.metrics && synthesis?.expectedCostChaos !== undefined ? {
        expectedChaosCost: fullU,
        expectedPhysicalActions: (synthesis.expectedPhysicalActions ?? 0) +
          proofRecord.downstream.metrics.expectedPhysicalActions,
        estimatedManualTimeMs: (synthesis.estimatedManualTimeMs ?? 0) +
          proofRecord.downstream.metrics.estimatedManualTimeMs,
        objectiveScore: fullU,
        effortConfidence: proofRecord.downstream.metrics.effortConfidence,
      } : undefined,
    };
    const comparison = methodFamilyStatus(route, recommended);
    const dominated = evidence?.status === 'DOMINATED';
    if (
      route && proofRecord?.downstream &&
      synthesis?.status === 'RESOLVED' && synthesis.expectedCostChaos !== undefined
    ) {
      resolvedPolicies.push({
        id: `bundle:family_fracture_${requirement.modId}`,
        familyId: `family_fracture_${requirement.modId}`,
        source: 'SELF_FRACTURE',
        route,
        solverResult: proofRecord.downstream,
        acquisitionCandidateId: `candidate_${index}`,
        acquisitionMethodId: 'self-fracture_executable',
        acquisitionSynthesis: synthesis,
        actionEvidence: onPolicyActionIds,
      });
    }
    results.push({
      spec: {
        id: `family_fracture_${requirement.modId}`,
        kind: 'SELF_FRACTURE',
        name: `Self-Fracture ${modName}`,
        description: `Independently synthesize a fractured ${modName} base, then solve its downstream policy.`,
        badge: `Fracture: ${modName}`,
        allowedActionIds: [...DEFAULT_ACQUISITION_SYNTHESIS_ACTION_IDS],
        requiredActionIds: ['fracturing_orb'],
        forcedAcquisitionType: 'SELF_FRACTURE',
        targetFractureModId: requirement.modId,
        targetFractureModName: modName,
      },
      ...comparison,
      status: dominated ? 'DOMINATED' : route ? comparison.status : 'UNRESOLVED_AT_BUDGET',
      evaluationSource: synthesis || evidence?.retainedAcquisitionStates || evidence?.retainedDownstreamStates
        ? 'INDEPENDENT_SOLVE'
        : 'NOT_SEARCHED',
      route,
      acquisitionStatus: stageStatus(acquisitionU, acquisitionL, dominated && acquisitionU === undefined),
      acquisitionL,
      acquisitionU,
      downstreamStatus: stageStatus(evidence?.downstreamUpperBoundChaos, evidence?.downstreamLowerBoundChaos, dominated),
      downstreamL: evidence?.downstreamLowerBoundChaos,
      downstreamU: evidence?.downstreamUpperBoundChaos,
      fullRouteStatus: stageStatus(evidence?.fullRouteUpperBoundChaos, evidence?.fullRouteLowerBoundChaos, dominated),
      fullRouteL: evidence?.fullRouteLowerBoundChaos,
      fullRouteU: evidence?.fullRouteUpperBoundChaos,
      requiredActionObservedOnPolicy: onPolicyActionIds.includes('fracturing_orb'),
      onPolicyActionIds,
      expectedActionUsage: allUsage.map((usage) => ({ ...usage })),
      sessionIdentity: `${searchIdentityHash}:family_fracture_${requirement.modId}`,
      retainedStates: (evidence?.retainedAcquisitionStates ?? 0) + (evidence?.retainedDownstreamStates ?? 0),
      transitionDistributionsGenerated: (evidence?.acquisitionTransitionDistributionsGenerated ?? 0) +
        (evidence?.downstreamTransitionDistributionsGenerated ?? 0),
      whyNotSelectedExplanation: synthesis?.expectedCostChaos !== undefined && evidence?.downstreamUpperBoundChaos === undefined
        ? `Acquisition synthesis produced a finite executable upper bound at ${synthesis.expectedCostChaos.toFixed(1)}c; the independent downstream/full-route solve remains unresolved.`
        : route
          ? comparison.status === 'SELECTED_WINNER'
            ? 'The independently synthesized acquisition and downstream policy form the selected full route.'
            : `Acquisition and downstream policy resolved independently at ${fullU?.toFixed(1)}c full-route cost.`
          : dominated
            ? 'The family was dominated by an admissible full-route lower bound.'
            : 'Acquisition and downstream status are reported separately; the full route remains unresolved.',
    });

    for (const craft of enabledHarvestCrafts) {
      const spec: MethodFamilySpec = {
        id: `family_fracture_harvest_${requirement.modId}_${craft.tag}`,
        kind: 'SELF_FRACTURE_HARVEST',
        name: `Self-Fracture ${modName} + ${craft.actionName}`,
        description: 'Reuse the independently synthesized fractured acquisition, then require a tagged Harvest action in the downstream policy.',
        badge: `Fracture + Harvest ${craft.tag}`,
        allowedActionIds: ['regal_orb', craft.actionId],
        requiredActionIds: [craft.actionId],
        forcedAcquisitionType: 'SELF_FRACTURE',
        targetFractureModId: requirement.modId,
        targetFractureModName: modName,
      };
      if (compare && synthesis?.expectedCostChaos !== undefined) {
        results.push(runConstrainedFamily(
          spec,
          start.state,
          synthesis.expectedCostChaos,
          synthesis.lowerBoundChaos,
          spec.allowedActionIds ?? [],
          [craft.actionId],
          true,
          [craft.tag]
        ));
      } else {
        results.push({
          spec,
          status: 'NOT_SEARCHED',
          evaluationSource: 'NOT_SEARCHED',
          acquisitionStatus: stageStatus(synthesis?.expectedCostChaos, synthesis?.lowerBoundChaos),
          acquisitionL: synthesis?.lowerBoundChaos,
          acquisitionU: synthesis?.expectedCostChaos,
          downstreamStatus: 'NOT_SEARCHED',
          fullRouteStatus: 'NOT_SEARCHED',
          requiredActionObservedOnPolicy: false,
          onPolicyActionIds: [],
          retainedStates: session.methodFamilies.get(spec.id)?.expansion.nodes.size ?? 0,
          transitionDistributionsGenerated: session.methodFamilies.get(spec.id)?.expansion.transitionDistributionsGeneratedTotal ?? 0,
          whyNotSelectedExplanation: synthesis?.status === 'RESOLVED'
            ? 'Acquisition is resolved; the required-Harvest downstream family has not been searched. Use Compare Methods.'
            : 'Required self-fracture acquisition is unresolved, so its Harvest downstream family has not started.',
        });
      }
    }
  }

  results.push({
    spec: {
      id: 'family_chaos_reforge',
      kind: 'CHAOS_REFORGE',
      name: 'Chaos Reforge',
      description: 'Chaos Orb transitions are not yet modeled with an executable distribution.',
      badge: 'Chaos',
      requiredActionIds: ['chaos_orb'],
    },
    status: 'NOT_MODELED',
    evaluationSource: 'NOT_SEARCHED',
    acquisitionStatus: 'NOT_APPLICABLE',
    downstreamStatus: 'NOT_APPLICABLE',
    fullRouteStatus: 'NOT_APPLICABLE',
    requiredActionObservedOnPolicy: false,
    onPolicyActionIds: [],
    retainedStates: 0,
    transitionDistributionsGenerated: 0,
    whyNotSelectedExplanation: 'Chaos Reforge is advertised only as not modeled; it is never assigned a synthetic route.',
  });

  const fingerprints = new Map<string, string>();
  for (const family of results) {
    if (family.evaluationSource !== 'INDEPENDENT_SOLVE' || family.fullRouteStatus !== 'RESOLVED') continue;
    const fingerprint = JSON.stringify({
      actions: family.expectedActionUsage
        ?.filter((usage) => usage.expectedCount > 1e-9)
        .map((usage) => [usage.actionId, usage.expectedCount.toFixed(6)])
        .sort(),
      cost: family.fullRouteU?.toFixed(6),
    });
    const original = fingerprints.get(fingerprint);
    if (original) family.duplicateOfMethodFamilyId = original;
    else fingerprints.set(fingerprint, family.spec.id);
  }
  return { families: results, resolvedPolicies };
}

function buildHarvestComparisonSummary(options: {
  enabledHarvestCrafts: Array<{ actionId: string; actionName: string; tag: string }>;
  methodPortfolio: MethodFamilyResult[];
  selectedActionUsage: readonly ExpectedActionUsage[];
  priceBook: PriceBook;
  costCeilingChaos?: number;
}): HarvestComparisonSummary {
  const { enabledHarvestCrafts, methodPortfolio, selectedActionUsage, priceBook, costCeilingChaos } = options;
  if (enabledHarvestCrafts.length === 0) {
    return {
      harvestConsidered: false,
      harvestEligible: false,
      consideredHarvestActions: [],
      status: 'NOT_ELIGIBLE',
      actionEvidenceObserved: false,
      explanation: 'No target modifier is eligible for an available modeled Harvest reforge tag.',
    };
  }
  const harvestFamilies = methodPortfolio.filter((family) => family.spec.kind === 'HARVEST');
  const conventional = methodPortfolio.find((family) => family.spec.kind === 'CONVENTIONAL');
  const resolvedHarvest = harvestFamilies
    .filter((family) => family.evaluationSource === 'INDEPENDENT_SOLVE' &&
      family.fullRouteStatus === 'RESOLVED' && family.requiredActionObservedOnPolicy && family.route)
    .sort((left, right) => (left.fullRouteU ?? Infinity) - (right.fullRouteU ?? Infinity))[0];
  const disabled = harvestFamilies.find((family) => family.status === 'DISABLED');
  const notSearched = harvestFamilies.every((family) => family.evaluationSource === 'NOT_SEARCHED');
  if (disabled && !resolvedHarvest) {
    return {
      harvestConsidered: true,
      harvestEligible: true,
      consideredHarvestActions: enabledHarvestCrafts,
      status: 'PRICE_UNAVAILABLE_OR_DISABLED',
      actionEvidenceObserved: false,
      explanation: disabled.whyNotSelectedExplanation ?? 'Required Lifeforce price evidence is unavailable.',
    };
  }
  if (notSearched) {
    return {
      harvestConsidered: true,
      harvestEligible: true,
      consideredHarvestActions: enabledHarvestCrafts,
      status: 'ENABLED_NOT_SEARCHED',
      actionEvidenceObserved: false,
      explanation: 'Harvest crafts are enabled and eligible, but their required-action families have not been independently searched. Use Compare Methods.',
    };
  }
  if (!resolvedHarvest?.route) {
    return {
      harvestConsidered: true,
      harvestEligible: true,
      consideredHarvestActions: enabledHarvestCrafts,
      status: 'ENABLED_UNRESOLVED',
      actionEvidenceObserved: false,
      explanation: 'Harvest was independently searched, but no policy containing a Harvest action resolved within its family budget.',
    };
  }
  const harvestAction = enabledHarvestCrafts.find((craft) =>
    resolvedHarvest.onPolicyActionIds.includes(craft.actionId)
  );
  const definition = harvestAction ? HARVEST_CRAFT_DEFINITIONS[harvestAction.tag] : undefined;
  const harvestUsage = harvestAction
    ? resolvedHarvest.expectedActionUsage?.find((usage) => usage.actionId === harvestAction.actionId)
    : undefined;
  if (!harvestAction || !definition || !harvestUsage || harvestUsage.expectedCount <= 0) {
    return {
      harvestConsidered: true,
      harvestEligible: true,
      consideredHarvestActions: enabledHarvestCrafts,
      status: 'ENABLED_UNRESOLVED',
      actionEvidenceObserved: false,
      explanation: 'The constrained family returned no positive expected visits for its required Harvest action.',
    };
  }
  const expectedHarvestApplications = harvestUsage.expectedCount;
  const expectedLifeforce = expectedHarvestApplications * definition.lifeforceAmount;
  const currentUnitPrice = priceBook.getRate(definition.lifeforceType);
  const harvestTotal = resolvedHarvest.fullRouteU!;
  const nonLifeforceCost = harvestTotal - expectedLifeforce * currentUnitPrice;
  const conventionalTotal = conventional?.fullRouteU;
  const crossover = conventionalTotal === undefined
    ? undefined
    : priceBook.calculateHarvestCrossoverPrice(
        conventionalTotal,
        nonLifeforceCost,
        expectedLifeforce
      );
  const costDifference = conventionalTotal === undefined ? undefined : harvestTotal - conventionalTotal;
  const actionsSaved = conventional?.route?.metrics?.expectedPhysicalActions === undefined ||
      resolvedHarvest.route.metrics?.expectedPhysicalActions === undefined
    ? undefined
    : conventional.route.metrics.expectedPhysicalActions -
      resolvedHarvest.route.metrics.expectedPhysicalActions;
  const timeSavedMs = conventional?.route?.metrics?.estimatedManualTimeMs === undefined ||
      resolvedHarvest.route.metrics?.estimatedManualTimeMs === undefined
    ? undefined
    : conventional.route.metrics.estimatedManualTimeMs -
      resolvedHarvest.route.metrics.estimatedManualTimeMs;
  const selectedUsesHarvest = selectedActionUsage.some((usage) =>
    usage.actionId === harvestAction.actionId && usage.expectedCount > 0
  );
  const status: HarvestLifecycleStatus = selectedUsesHarvest
    ? 'SELECTED'
    : costCeilingChaos !== undefined && harvestTotal > costCeilingChaos && (actionsSaved ?? 0) > 0
      ? 'RESOLVED_FASTER_BUT_OVER_CEILING'
      : (costDifference ?? 0) > 0
        ? 'RESOLVED_MORE_EXPENSIVE'
        : 'DOMINATED_BY_PROOF';
  return {
    harvestConsidered: true,
    harvestEligible: true,
    consideredHarvestActions: enabledHarvestCrafts,
    resolvedHarvestRoute: resolvedHarvest.route,
    conventionalRoute: conventional?.route,
    harvestActionId: harvestAction.actionId,
    harvestActionName: harvestAction.actionName,
    harvestTag: harvestAction.tag,
    lifeforceType: definition.lifeforceType,
    lifeforcePerApplication: definition.lifeforceAmount,
    expectedHarvestApplications,
    certifiedSuccessProbabilityPerApplication:
      resolvedHarvest.repeatableRerollCertification?.successProbabilityPerApplication,
    expectedLifeforce,
    harvestNonLifeforceCostChaos: nonLifeforceCost,
    harvestTotalAtCurrentPriceChaos: harvestTotal,
    currentLifeforceUnitPriceChaos: currentUnitPrice,
    costDifferenceChaos: costDifference,
    actionsSaved,
    timeSavedMs,
    lifeforceCrossoverPriceChaosPerUnit: crossover,
    status,
    actionEvidenceObserved: true,
    explanation: `${harvestAction.actionName} was independently solved with ${expectedHarvestApplications.toFixed(3)} expected applications ` +
      `(${expectedLifeforce.toFixed(3)} ${definition.lifeforceType}, ${definition.lifeforceAmount} per application). ` +
      (costDifference === undefined
        ? 'A resolved Conventional comparison is unavailable, so no crossover is reported.'
        : `${costDifference >= 0 ? '+' : ''}${costDifference.toFixed(3)}c versus Conventional.`) +
      (crossover === undefined ? '' : ` Crossover: ${crossover.toFixed(6)}c per ${definition.lifeforceType}.`),
  };
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
    expectedPhysicalActions: result.expectedPhysicalActions,
    expectedPreparationPhysicalActions: result.expectedPreparationPhysicalActions,
    estimatedManualTimeMs: result.estimatedManualTimeMs,
    expectedPreparationManualTimeMs: result.expectedPreparationManualTimeMs,
    expectedActionUsage: result.expectedActionUsage.map((usage) => ({ ...usage })),
    policy: result.policy.map((rule) => ({ ...rule })),
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

interface ResolvedPolicyBundle {
  id: string;
  familyId?: string;
  source: ResolvedPolicySourceKind;
  route: RouteSummary;
  acquisitionCandidateId: string;
  acquisitionMethodId: string;
  acquisitionSynthesis?: AcquisitionSynthesisSummary;
  solverResult: GenericSearchResult;
  downstreamActionUsage: ExpectedActionUsage[];
  fullRouteUsage: FullRouteUsageSummary;
  metrics: RouteMetricVector;
  policyRules: PolicyRule[];
  policyExplanation: PolicyExplanationRule[];
  actionEvidence: string[];
  consistency: InternalResultConsistency;
}

function objectiveScoreForMetrics(
  metrics: Pick<RouteMetricVector, 'expectedChaosCost' | 'expectedPhysicalActions' | 'estimatedManualTimeMs'>,
  objective: OptimizationObjectiveSpec,
): number {
  const lambda = objective.scalarizationPenaltyLambda ?? 1e-6;
  switch (objective.kind) {
    case 'FEWEST_ACTIONS_WITHIN_COST':
    case 'UNCONSTRAINED_FEWEST_ACTIONS':
      return metrics.expectedPhysicalActions + lambda * metrics.expectedChaosCost;
    case 'FASTEST_WITHIN_COST':
    case 'UNCONSTRAINED_FASTEST':
      return metrics.estimatedManualTimeMs + lambda * metrics.expectedChaosCost;
    case 'BALANCED_VALUE_OF_TIME':
      return metrics.expectedChaosCost +
        metrics.estimatedManualTimeMs / 60_000 *
          (objective.valueOfTimeChaosPerMinute ?? objective.chaosValuePerMinute ?? 50);
    case 'CHEAPEST_CHAOS':
    default:
      return metrics.expectedChaosCost;
  }
}

function serializedPolicyRules(result: GenericSearchResult): PolicyRule[] {
  return result.onPolicyRules.map((rule) => ({
    stateKey: rule.stateKey,
    state: describePolicyState(rule.state),
    selectedActionId: rule.selectedActionId,
    selectedAction: rule.selectedActionName,
    expectedVisits: rule.expectedVisits,
    totalCostChaos: finiteOrNull(rule.totalCostChaos),
    candidates: rule.candidateQValues.map(serializeCandidate),
  }));
}

function acquisitionMenuExplanation(
  route: RouteSummary,
  start: StartingStateCandidate,
  target: TargetDefinition,
): PolicyExplanationRule {
  return {
    condition: 'Start: choose an acquisition route',
    actionId: route.actionId,
    action: route.name,
    representedStateCount: 1,
    expectedVisits: 1,
    exampleState: 'Choose an acquisition route',
    context: {
      rarity: start.state.rarity,
      prefixCount: 0,
      suffixCount: 0,
      matchedTargetModIds: [],
      unmatchedTargetModIds: getAllTargetModRequirements(target).map(
        (requirement, index) => targetRequirementIdentity(requirement, index)
      ).sort(),
      prefixes: [],
      suffixes: [],
      influenced: false,
      synthesised: false,
      acquisitionMenu: true,
      disambiguateAffixes: false,
    },
  };
}

function synthesisPolicyExplanation(
  synthesis: AcquisitionSynthesisSummary | undefined,
): PolicyExplanationRule[] {
  return (synthesis?.policy ?? []).map((rule) => ({
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
}

function createResolvedPolicyBundle(options: {
  id: string;
  familyId?: string;
  source: ResolvedPolicySourceKind;
  route: RouteSummary;
  solverResult: GenericSearchResult;
  acquisitionCandidateId: string;
  acquisitionMethodId: string;
  acquisitionStart: StartingStateCandidate;
  acquisitionSynthesis?: AcquisitionSynthesisSummary;
  cleanBaseCostChaos: number;
  target: TargetDefinition;
  objective: OptimizationObjectiveSpec;
}): ResolvedPolicyBundle | undefined {
  if (
    options.solverResult.optimalityProof.selectedPolicyStatus !==
      'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED' ||
    !Number.isFinite(options.solverResult.totalExpectedCostChaos)
  ) return undefined;

  const downstreamActionUsage = options.solverResult.expectedActionUsage
    .filter((usage) => !usage.actionId.startsWith('acquire_'))
    .map((usage) => ({ ...usage }));
  const fullRouteUsage = buildFullRouteUsageSummary({
    recommended: options.route,
    cleanBaseCostChaos: options.cleanBaseCostChaos,
    selectedSynthesis: options.acquisitionSynthesis,
    downstreamActionUsage,
  });
  const synthesisActions = options.acquisitionSynthesis?.expectedPhysicalActions ?? 0;
  const synthesisTimeMs = options.acquisitionSynthesis?.estimatedManualTimeMs ?? 0;
  const baseMetrics = options.solverResult.metrics;
  const metricParts = {
    expectedChaosCost: fullRouteUsage.fullRouteCostChaos,
    expectedPhysicalActions: (baseMetrics?.expectedPhysicalActions ?? 0) + synthesisActions,
    estimatedManualTimeMs: (baseMetrics?.estimatedManualTimeMs ?? 0) + synthesisTimeMs,
  };
  const metrics: RouteMetricVector = {
    ...metricParts,
    objectiveScore: objectiveScoreForMetrics(metricParts, options.objective),
    effortConfidence: baseMetrics?.effortConfidence ?? 'DEFAULT_APPROXIMATE',
  };
  const solverCostChaos = options.solverResult.startingState.flags?.acquisitionMenu === true
    ? options.solverResult.totalExpectedCostChaos
    : fullRouteUsage.acquisitionCostChaos + options.solverResult.totalExpectedCostChaos;
  const routeCostChaos = options.route.expectedTotalCostChaos ?? NaN;
  const metricsCostChaos = options.route.metrics?.expectedChaosCost ?? solverCostChaos;
  const comparableCosts = [
    routeCostChaos,
    solverCostChaos,
    fullRouteUsage.fullRouteCostChaos,
    metricsCostChaos,
  ].filter(Number.isFinite);
  let maximumDifferenceChaos = 0;
  for (const left of comparableCosts) {
    for (const right of comparableCosts) {
      maximumDifferenceChaos = Math.max(maximumDifferenceChaos, Math.abs(left - right));
    }
  }
  fullRouteUsage.reconciliationDifferenceChaos = maximumDifferenceChaos;
  const consistency: InternalResultConsistency = {
    status: maximumDifferenceChaos <= CANONICAL_RECONCILIATION_TOLERANCE_CHAOS
      ? 'OK'
      : 'INTERNAL_RESULT_MISMATCH',
    toleranceChaos: CANONICAL_RECONCILIATION_TOLERANCE_CHAOS,
    selectedBundleId: options.id,
    selectedBundleSource: options.source,
    routeActionId: options.route.actionId,
    acquisitionCandidateId: options.acquisitionCandidateId,
    acquisitionMethodId: options.acquisitionMethodId,
    routeCostChaos: Number.isFinite(routeCostChaos) ? routeCostChaos : undefined,
    solverCostChaos,
    usageCostChaos: fullRouteUsage.fullRouteCostChaos,
    metricsCostChaos,
    maximumDifferenceChaos,
  };
  const route: RouteSummary = {
    ...options.route,
    acquisitionCandidateId: options.acquisitionCandidateId,
    acquisitionMethodId: options.acquisitionMethodId,
    expectedTotalCostChaos: fullRouteUsage.fullRouteCostChaos,
    incumbentUpperBoundChaos: fullRouteUsage.fullRouteCostChaos,
    metrics,
  };
  const baseExplanation = buildPolicyExplanation(options.solverResult.onPolicyRules, options.target);
  const hasAcquisitionMenu = baseExplanation.some((rule) => rule.context.acquisitionMenu);
  const policyExplanation = [
    ...(hasAcquisitionMenu
      ? []
      : [acquisitionMenuExplanation(route, options.acquisitionStart, options.target)]),
    ...synthesisPolicyExplanation(options.acquisitionSynthesis),
    ...baseExplanation,
  ];
  const policyRules = [
    ...(options.acquisitionSynthesis?.policy?.map((rule, index): PolicyRule => ({
      stateKey: `acquisition:${options.acquisitionCandidateId}:${index}`,
      state: rule.state,
      selectedActionId: rule.selectedActionId,
      selectedAction: rule.selectedAction,
      expectedVisits: rule.expectedVisits,
      totalCostChaos: typeof rule.totalCostChaos === 'number'
        ? finiteOrNull(rule.totalCostChaos)
        : null,
      candidates: [],
    })) ?? []),
    ...serializedPolicyRules(options.solverResult),
  ];
  const actionEvidence = [...new Set([
    ...fullRouteUsage.combinedActions
      .filter((usage) => usage.expectedCount > 1e-9)
      .map((usage) => usage.actionId),
  ])].sort();
  return {
    id: options.id,
    familyId: options.familyId,
    source: options.source,
    route,
    acquisitionCandidateId: options.acquisitionCandidateId,
    acquisitionMethodId: options.acquisitionMethodId,
    acquisitionSynthesis: options.acquisitionSynthesis,
    solverResult: options.solverResult,
    downstreamActionUsage,
    fullRouteUsage,
    metrics,
    policyRules,
    policyExplanation,
    actionEvidence,
    consistency,
  };
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
  methodFamilies: Map<string, GenericSearchContinuationSession>;
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
    const requestedObjective = input.objective ?? { kind: 'CHEAPEST_CHAOS' as const };
    const objectiveNeedsUnifiedFamilies = requestedObjective.kind !== 'CHEAPEST_CHAOS';
    const searchStopDeadline = optimizationStarted + Math.floor(
      runtimeBudget.engineDeadlineMs * (objectiveNeedsUnifiedFamilies ? 0.48 : 0.85)
    );
    const absoluteCostCeiling = requestedObjective.maxExpectedCostChaos;
    const costLowerBoundExcludesCandidate = (
      lowerBoundChaos: number,
      cheapestIncumbentChaos: number,
    ): boolean => {
      if (requestedObjective.kind === 'CHEAPEST_CHAOS') {
        return lowerBoundChaos >= cheapestIncumbentChaos;
      }
      if (
        requestedObjective.kind === 'FEWEST_ACTIONS_WITHIN_COST' ||
        requestedObjective.kind === 'FASTEST_WITHIN_COST'
      ) {
        return absoluteCostCeiling !== undefined && lowerBoundChaos > absoluteCostCeiling;
      }
      // Premium ceilings are normalized only after a cheapest executable U exists.
      // Balanced and unconstrained effort objectives have no admissible service-level
      // scalar lower bound here, so a chaos incumbent cannot safely prune them.
      return false;
    };
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
        methodFamilies: new Map(),
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
          objective: requestedObjective,
          effortProfile: input.effortProfile,
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
      if (milestone && recentMilestones.at(-1) !== milestone) {
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
          objective: requestedObjective,
          effortProfile: input.effortProfile,
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
        requestedObjective.kind === 'CHEAPEST_CHAOS' &&
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
          const retainedSynthesis = synthesisSummaries.get(candidateIndex);
          if (
            retainedSynthesis?.status !== 'RESOLVED' ||
            retainedSynthesis.expectedCostChaos === undefined
          ) {
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
              objective: requestedObjective,
              effortProfile: input.effortProfile,
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
          if (costLowerBoundExcludesCandidate(
            proofRecord.fullRouteLowerBoundChaos,
            incumbentFullRouteU,
          )) {
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
                objective: requestedObjective,
                effortProfile: input.effortProfile,
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
              return !costLowerBoundExcludesCandidate(
                proofRecord.fullRouteLowerBoundChaos,
                incumbentFullRouteU,
              );
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
              objective: requestedObjective,
              effortProfile: input.effortProfile,
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
          if (pCand && costLowerBoundExcludesCandidate(
            proofRecord.fullRouteLowerBoundChaos,
            incumbentFullRouteU,
          )) {
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
          costLowerBoundExcludesCandidate(fullRouteLowerBoundChaos, incumbentUpperBound);
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

    const selectedAcquisitionCostForScope = recommended === null
      ? 0
      : selectedSynthesis?.expectedCostChaos ?? cleanEvidence.costChaos;
    const resultIncludesAcquisition = !usesDirectCleanPolicy && !usesDirectFracturePolicy;
    const directAcquisitionCostOffset = resultIncludesAcquisition
      ? 0
      : selectedAcquisitionCostForScope;
    const policyIncumbentHistory = result.searchSummary.incumbentHistory.map((entry) => ({
      ...entry,
      upperBoundChaos: entry.upperBoundChaos + directAcquisitionCostOffset,
    }));
    const firstCertifiedDownstreamU = result.searchSummary.incumbentHistory[0] === undefined
      ? undefined
      : Math.max(
          0,
          result.searchSummary.incumbentHistory[0].upperBoundChaos -
            (resultIncludesAcquisition ? selectedAcquisitionCostForScope : 0)
        );
    const finalDownstreamU = recommended === null
      ? undefined
      : Math.max(
          0,
          result.totalExpectedCostChaos -
            (resultIncludesAcquisition ? selectedAcquisitionCostForScope : 0)
        );
    const firstPolicyUpperBound = firstCertifiedDownstreamU === undefined
      ? undefined
      : selectedAcquisitionCostForScope + firstCertifiedDownstreamU;
    const finalPolicyUpperBound = finalDownstreamU === undefined
      ? undefined
      : selectedAcquisitionCostForScope + finalDownstreamU;
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
      ? Math.max(
          0,
          selectedStartLowerBound -
            (resultIncludesAcquisition ? selectedAcquisitionCostForScope : 0)
        )
      : undefined;
    const normalizedUnresolvedPolicyLowerBound = unresolvedPolicyLowerBound !== undefined &&
      Number.isFinite(unresolvedPolicyLowerBound)
      ? Math.max(
          0,
          unresolvedPolicyLowerBound -
            (resultIncludesAcquisition ? selectedAcquisitionCostForScope : 0)
        )
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
      firstCertifiedDownstreamU,
      finalDownstreamU,
      firstCertifiedFullRouteU: firstPolicyUpperBound,
      finalFullRouteU: finalPolicyUpperBound,
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

    const portfolioTotalStatesExpanded = Math.max(
      result.searchSummary.cumulativeExpansionWork,
      [...progressCandidates.values()].reduce((sum, candidate) => sum + candidate.statesExpanded, 0)
    );
    const portfolioRetainedStates = searchSessionRecord.cleanDownstream.expansion.nodes.size +
      [...searchSessionRecord.fractureAcquisitions.values()].reduce(
        (sum, continuation) => sum + continuation.expansion.nodes.size,
        0
      ) +
      [...searchSessionRecord.fractureDownstreams.values()].reduce(
        (sum, continuation) => sum + continuation.expansion.nodes.size,
        0
      );
    const outputWithoutCraftPlan: Omit<
      OptimizeCraftResult,
      'craftPlan' | 'methodPortfolio' | 'presentation' | 'fullRouteUsage' | 'harvestComparison'
    > = {
      target: input.target,
      validationNotices: validation.notices,
      recommendationStatus,
      recommended,
      alternatives: acquisitionRoutes.filter((route) => route.actionId !== recommended?.actionId),
      expectedCurrencies: {},
      expectedActionUsage: result.expectedActionUsage
        .filter((usage) => !usage.actionId.startsWith('acquire_'))
        .map((usage) => ({ ...usage })),
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
        timeToFirstUsefulExecutableRecommendationMs:
          result.searchSummary.timeToFirstUsefulRecommendationMs,
        timeToFirstAcquisitionSafeRecommendationMs: acquisitionSelectionSafe
          ? Date.now() - optimizationStarted
          : undefined,
        stageTimingMs: { ...result.stageTiming, serializationMs: 0 },
        sessionReuse: selectedSessionReuse,
        totalElapsedMs: Date.now() - optimizationStarted,
        workScopes: {
          portfolioTotalStatesExpanded,
          portfolioRetainedStates,
          selectedPolicyGraphStates: result.graphBuild.nodes.size,
          acquisitionSynthesisStates: selectedSynthesis?.search?.statesExpanded ?? 0,
          methodFamilyStates: 0,
          proofBoundStates: result.searchSummary.acquisitionFeasibilityStatesExpanded,
        },
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
      paretoAlternatives,
      objectiveProofStatus,
      objective: input.objective,
      costCeilingChaos,
      internalConsistency: {
        status: 'OK',
        toleranceChaos: CANONICAL_RECONCILIATION_TOLERANCE_CHAOS,
        maximumDifferenceChaos: 0,
      },
      warningDetails: uniqueWarningDetails,
      warnings: [...new Set(uniqueWarningDetails.map((warning) => warning.message))],
    };
    const craftPlan = buildCraftPlan(outputWithoutCraftPlan);
    const methodPortfolioBuild = buildMethodPortfolio({
      pool,
      priceBook,
      input,
      starts,
      cleanStart,
      cleanEvidence,
      recommended,
      recommendationStatus: outputWithoutCraftPlan.recommendationStatus,
      craftPlan,
      openResult: result,
      fastCleanResult,
      fastCleanRoute,
      synthesisSummaries,
      acquisition: outputWithoutCraftPlan.acquisition,
      enabledHarvestCrafts,
      session: searchSessionRecord,
      searchIdentityHash,
      deadlineMs: optimizationStarted + Math.floor(runtimeBudget.engineDeadlineMs * 0.97),
    });
    const resolvedBundles: ResolvedPolicyBundle[] = [];
    const appendBundle = (bundle: ResolvedPolicyBundle | undefined): void => {
      if (bundle) resolvedBundles.push(bundle);
    };

    if (result.startingState.flags?.acquisitionMenu === true) {
      const startDecision = result.policyMap.get(
        getCanonicalStateKey(result.startingState, input.target)
      );
      const acquisitionAction = startDecision?.candidateQValues.find(
        (candidate) => candidate.actionId === startDecision.bestActionId
      );
      const parts = portfolioActionParts(startDecision?.bestActionId ?? '');
      const candidateIndex = parts.candidateId === undefined
        ? undefined
        : Number(/^candidate_(\d+)$/.exec(parts.candidateId)?.[1]);
      if (
        startDecision && acquisitionAction && parts.candidateId && parts.methodId &&
        candidateIndex !== undefined && Number.isFinite(candidateIndex)
      ) {
        const exactRoute: RouteSummary = {
          actionId: startDecision.bestActionId,
          name: startDecision.bestActionName,
          acquisitionCandidateId: parts.candidateId,
          acquisitionMethodId: parts.methodId,
          expectedTotalCostChaos: result.totalExpectedCostChaos,
          lowerBoundChaos: acquisitionAction.lowerBoundChaos,
          incumbentUpperBoundChaos: result.totalExpectedCostChaos,
          optimalityGapChaos: acquisitionAction.optimalityGapChaos,
          status: 'RESOLVED',
          couldBeatResolvedIncumbent: false,
          metrics: result.metrics,
        };
        appendBundle(createResolvedPolicyBundle({
          id: 'core:open-selected-policy',
          familyId: 'family_open',
          source: 'OPEN',
          route: exactRoute,
          solverResult: result,
          acquisitionCandidateId: parts.candidateId,
          acquisitionMethodId: parts.methodId,
          acquisitionStart: starts[candidateIndex],
          acquisitionSynthesis: synthesisSummaries.get(candidateIndex),
          cleanBaseCostChaos: cleanEvidence.costChaos,
          target: input.target,
          objective,
        }));
      }
    }
    if (fastCleanResult && fastCleanRoute) {
      appendBundle(createResolvedPolicyBundle({
        id: 'core:clean-open-policy',
        familyId: 'family_open',
        source: 'OPEN',
        route: fastCleanRoute,
        solverResult: fastCleanResult,
        acquisitionCandidateId: `candidate_${cleanCandidateIndex}`,
        acquisitionMethodId: `clean-base_${cleanMethodIndex}`,
        acquisitionStart: cleanStart,
        cleanBaseCostChaos: cleanEvidence.costChaos,
        target: input.target,
        objective,
      }));
    }
    for (const source of methodPortfolioBuild.resolvedPolicies) {
      const candidateIndex = Number(/^candidate_(\d+)$/.exec(source.acquisitionCandidateId)?.[1]);
      if (!Number.isFinite(candidateIndex) || !starts[candidateIndex]) continue;
      appendBundle(createResolvedPolicyBundle({
        id: source.id,
        familyId: source.familyId,
        source: source.source,
        route: source.route,
        solverResult: source.solverResult,
        acquisitionCandidateId: source.acquisitionCandidateId,
        acquisitionMethodId: source.acquisitionMethodId,
        acquisitionStart: starts[candidateIndex],
        acquisitionSynthesis: source.acquisitionSynthesis,
        cleanBaseCostChaos: cleanEvidence.costChaos,
        target: input.target,
        objective,
      }));
    }

    const uniqueBundles = new Map<string, ResolvedPolicyBundle>();
    for (const bundle of [...resolvedBundles].sort((left, right) => left.id.localeCompare(right.id))) {
      const fingerprint = JSON.stringify({
        actions: bundle.fullRouteUsage.combinedActions.map((usage) => [
          usage.actionId,
          usage.expectedCount.toFixed(8),
          usage.expectedCostChaos.toFixed(8),
        ]),
        cost: bundle.metrics.expectedChaosCost.toFixed(8),
        physicalActions: bundle.metrics.expectedPhysicalActions.toFixed(8),
        manualTimeMs: bundle.metrics.estimatedManualTimeMs.toFixed(8),
      });
      if (!uniqueBundles.has(fingerprint)) uniqueBundles.set(fingerprint, bundle);
    }
    const unifiedBundles = [...uniqueBundles.values()];
    const cheapestBundle = unifiedBundles.reduce<ResolvedPolicyBundle | undefined>(
      (best, candidate) => !best ||
        candidate.metrics.expectedChaosCost < best.metrics.expectedChaosCost
        ? candidate
        : best,
      undefined,
    );
    const cheapestResolvedCost = cheapestBundle?.metrics.expectedChaosCost;
    costCeilingChaos = undefined;
    if (cheapestResolvedCost !== undefined) {
      if (objective.maxExpectedCostChaos !== undefined) {
        costCeilingChaos = objective.maxExpectedCostChaos;
      } else if (objective.maxPremiumChaos !== undefined) {
        costCeilingChaos = cheapestResolvedCost + objective.maxPremiumChaos;
      } else if (objective.maxPremiumFraction !== undefined) {
        costCeilingChaos = cheapestResolvedCost * (1 + objective.maxPremiumFraction);
      }
    }
    const eligibleBundles = costCeilingChaos === undefined
      ? unifiedBundles
      : unifiedBundles.filter((bundle) =>
          bundle.metrics.expectedChaosCost <= costCeilingChaos! + 1e-9
        );
    const compareBundles = (
      left: ResolvedPolicyBundle,
      right: ResolvedPolicyBundle,
    ): number => {
      const byCost = left.metrics.expectedChaosCost - right.metrics.expectedChaosCost;
      const byActions = left.metrics.expectedPhysicalActions - right.metrics.expectedPhysicalActions;
      const byTime = left.metrics.estimatedManualTimeMs - right.metrics.estimatedManualTimeMs;
      switch (objective.kind) {
        case 'FEWEST_ACTIONS_WITHIN_COST':
        case 'UNCONSTRAINED_FEWEST_ACTIONS':
          return byActions || byCost || byTime || left.id.localeCompare(right.id);
        case 'FASTEST_WITHIN_COST':
        case 'UNCONSTRAINED_FASTEST':
          return byTime || byCost || byActions || left.id.localeCompare(right.id);
        case 'BALANCED_VALUE_OF_TIME':
          return left.metrics.objectiveScore - right.metrics.objectiveScore ||
            byCost || byTime || byActions || left.id.localeCompare(right.id);
        case 'CHEAPEST_CHAOS':
        default:
          return byCost || byActions || byTime || left.id.localeCompare(right.id);
      }
    };
    const selectedBundle = [...eligibleBundles].sort(compareBundles)[0];
    const unresolvedRelevantFamilies = methodPortfolioBuild.families.filter((family) => {
      if (
        family.spec.kind === 'OPEN' || family.spec.kind === 'CHAOS_REFORGE' ||
        family.status === 'DISABLED' || family.status === 'NOT_ELIGIBLE' ||
        family.fullRouteStatus === 'RESOLVED'
      ) return false;
      return costCeilingChaos === undefined || family.fullRouteL === undefined ||
        family.fullRouteL <= costCeilingChaos + 1e-9;
    });
    if (unifiedBundles.length === 0) {
      objectiveProofStatus = 'CHEAPEST_ROUTE_UNRESOLVED';
    } else if (!selectedBundle) {
      objectiveProofStatus = 'NO_RESOLVED_ROUTE_WITHIN_COST';
    } else if (
      (objective.kind === 'FEWEST_ACTIONS_WITHIN_COST' ||
        objective.kind === 'FASTEST_WITHIN_COST') &&
      unresolvedRelevantFamilies.length === 0 &&
      unifiedBundles.every((bundle) => bundle.solverResult.optimalityProof.modeledActionOptimalityProven)
    ) {
      objectiveProofStatus = 'CONSTRAINED_OPTIMAL_PROVEN';
    } else if (
      objective.kind === 'FEWEST_ACTIONS_WITHIN_COST' ||
      objective.kind === 'FASTEST_WITHIN_COST'
    ) {
      objectiveProofStatus = 'BEST_RESOLVED_WITHIN_COST';
    } else {
      objectiveProofStatus = 'UNCONSTRAINED_RESOLVED';
    }
    const selectedConsistency = selectedBundle?.consistency ?? {
      status: 'OK' as const,
      toleranceChaos: CANONICAL_RECONCILIATION_TOLERANCE_CHAOS,
      maximumDifferenceChaos: 0,
    };
    const consistencyFailed = selectedConsistency.status === 'INTERNAL_RESULT_MISMATCH';
    const canonicalRecommended = selectedBundle && !consistencyFailed
      ? selectedBundle.route
      : null;
    const canonicalCost = canonicalRecommended?.expectedTotalCostChaos ?? null;
    const finalAcquisition = {
      ...outputWithoutCraftPlan.acquisition,
      selectedCandidateId: canonicalRecommended?.acquisitionCandidateId,
      selectedMethodId: canonicalRecommended?.acquisitionMethodId,
      resolvedIncumbentUpperBoundChaos: canonicalCost ?? undefined,
      portfolioProof: {
        ...outputWithoutCraftPlan.acquisition.portfolioProof,
        selectedFullRouteUpperBoundChaos: canonicalCost ?? undefined,
        candidateEvidence: outputWithoutCraftPlan.acquisition.portfolioProof.candidateEvidence
          .map((candidate) => ({
            ...candidate,
            status: canonicalRecommended?.acquisitionCandidateId === candidate.candidateId
              ? 'SELECTED' as const
              : candidate.status === 'SELECTED'
                ? 'FULL_ROUTE_RESOLVED' as const
                : candidate.status,
            proofReason: canonicalRecommended?.acquisitionCandidateId === candidate.candidateId
              ? 'SELECTED_EXECUTABLE_ROUTE' as const
              : candidate.proofReason === 'SELECTED_EXECUTABLE_ROUTE'
                ? 'CAN_STILL_BEAT_INCUMBENT' as const
                : candidate.proofReason,
          })),
      },
    };
    const finalRecommendationStatus: RecommendationStatus = consistencyFailed
      ? 'INTERNAL_RESULT_MISMATCH'
      : !canonicalRecommended
        ? 'NO_RESOLVED_ROUTE'
        : objectiveProofStatus === 'CONSTRAINED_OPTIMAL_PROVEN' &&
            selectedBundle.solverResult.optimalityProof.modeledActionOptimalityProven &&
            finalAcquisition.selectionSafe
          ? 'PROVEN_OPTIMAL'
          : finalAcquisition.selectionSafe
            ? 'BEST_RESOLVED_ACQUISITION_SAFE'
            : 'PROVISIONAL_RESOLVED';
    const selectedFamilyId = selectedBundle?.familyId ?? 'family_open';
    const bundlesByFamilyId = new Map<string, ResolvedPolicyBundle[]>();
    for (const bundle of unifiedBundles) {
      if (!bundle.familyId) continue;
      const familyBundles = bundlesByFamilyId.get(bundle.familyId) ?? [];
      familyBundles.push(bundle);
      bundlesByFamilyId.set(bundle.familyId, familyBundles);
    }
    const methodPortfolio = methodPortfolioBuild.families.map((family): MethodFamilyResult => {
      const familyBundles = bundlesByFamilyId.get(family.spec.id) ?? [];
      const familyBundle = family.spec.id === selectedFamilyId && selectedBundle
        ? familyBundles.find((bundle) => bundle.id === selectedBundle.id)
        : [...familyBundles].sort(compareBundles)[0];
      if (!familyBundle) {
        if (
          family.status === 'DISABLED' || family.status === 'NOT_ELIGIBLE' ||
          family.status === 'NOT_MODELED'
        ) return family;
        const summarizedResolvedCost = family.route?.expectedTotalCostChaos ?? family.fullRouteU;
        if (family.fullRouteStatus === 'RESOLVED' && summarizedResolvedCost !== undefined &&
          summarizedResolvedCost !== null) {
          const overCostCeiling = costCeilingChaos !== undefined &&
            summarizedResolvedCost > costCeilingChaos + 1e-9;
          return {
            ...family,
            status: overCostCeiling ? 'MORE_EXPENSIVE' : 'DOMINATED',
            objectiveEligibility: overCostCeiling
              ? 'OVER_COST_CEILING'
              : 'OBJECTIVE_DOMINATED',
            whyNotSelectedExplanation: overCostCeiling
              ? `Its resolved ${summarizedResolvedCost.toFixed(3)}c cost exceeds the ${costCeilingChaos!.toFixed(3)}c objective ceiling.`
              : 'This summary does not add a distinct resolved policy to the canonical candidate set.',
          };
        }
        const excludedByBound = costCeilingChaos !== undefined && family.fullRouteL !== undefined &&
          family.fullRouteL > costCeilingChaos + 1e-9;
        return {
          ...family,
          objectiveEligibility: excludedByBound
            ? 'UNRESOLVED_COST_INELIGIBLE_BY_BOUND'
            : 'UNRESOLVED_COULD_QUALIFY',
          whyNotSelectedExplanation: excludedByBound
            ? `Its certified lower bound exceeds the ${costCeilingChaos!.toFixed(3)}c objective ceiling.`
            : 'This family remains unresolved and could still qualify for the requested objective.',
        };
      }
      const selected = !consistencyFailed && familyBundle.id === selectedBundle?.id;
      const difference = canonicalCost === null
        ? undefined
        : familyBundle.metrics.expectedChaosCost - canonicalCost;
      const overCostCeiling = costCeilingChaos !== undefined &&
        familyBundle.metrics.expectedChaosCost > costCeilingChaos + 1e-9;
      const objectiveEligibility = selected || !overCostCeiling
        ? selected
          ? 'RESOLVED_ELIGIBLE' as const
          : 'OBJECTIVE_DOMINATED' as const
        : 'OVER_COST_CEILING' as const;
      return {
        ...family,
        route: familyBundle.route,
        fullRouteU: familyBundle.metrics.expectedChaosCost,
        objectiveEligibility,
        status: selected
          ? 'SELECTED_WINNER'
          : overCostCeiling
            ? 'MORE_EXPENSIVE'
            : difference === undefined
            ? family.status
            : objective.kind === 'CHEAPEST_CHAOS' &&
                difference > CANONICAL_RECONCILIATION_TOLERANCE_CHAOS
              ? 'MORE_EXPENSIVE'
              : 'DOMINATED',
        costDifferenceChaos: difference,
        costDifferencePercent: difference === undefined || canonicalCost === null || canonicalCost <= 0
          ? undefined
          : difference / canonicalCost * 100,
        whyNotSelectedExplanation: selected
          ? 'This exact independently resolved policy is selected by the requested objective.'
          : overCostCeiling
            ? `Its resolved ${familyBundle.metrics.expectedChaosCost.toFixed(3)}c cost exceeds the ${costCeilingChaos!.toFixed(3)}c objective ceiling.`
            : 'This resolved eligible policy is dominated by the selected policy for the requested objective and its tie-breakers.',
      };
    });
    const selectedRoutes = unifiedBundles.map((bundle) => bundle.route);
    const finalParetoAlternatives = computeParetoAlternatives(selectedRoutes, objective);
    for (const alternative of finalParetoAlternatives) {
      alternative.isRequestedObjective = alternative.route.actionId === canonicalRecommended?.actionId &&
        Math.abs(
          (alternative.route.expectedTotalCostChaos ?? Infinity) - (canonicalCost ?? -Infinity)
        ) <= CANONICAL_RECONCILIATION_TOLERANCE_CHAOS;
    }
    const selectedUsage = selectedBundle?.fullRouteUsage ?? buildFullRouteUsageSummary({
      recommended: null,
      cleanBaseCostChaos: cleanEvidence.costChaos,
      downstreamActionUsage: [],
    });
    const selectedExpectedUsage = selectedUsage.combinedActions.map((usage) => ({
      actionId: usage.actionId,
      actionName: usage.actionName,
      expectedCount: usage.expectedCount,
      expectedCostChaos: usage.expectedCostChaos,
    }));
    const finalPolicyExplanation = selectedBundle?.policyExplanation ?? [];
    const finalPolicyRules = selectedBundle?.policyRules ?? [];
    const selectedSolverResult = selectedBundle?.solverResult;
    const finalProofGlobalOptimality = finalRecommendationStatus === 'PROVEN_OPTIMAL'
      ? 'PROVEN OVER MODELED ACTIONS' as const
      : 'NOT YET PROVEN' as const;
    const finalCraftPlan = buildCraftPlan({
      target: input.target,
      recommendationStatus: finalRecommendationStatus,
      recommended: canonicalRecommended,
      expectedActionUsage: consistencyFailed ? [] : selectedExpectedUsage,
      policyExplanation: consistencyFailed ? [] : finalPolicyExplanation,
      acquisition: finalAcquisition,
      proof: { globalOptimality: finalProofGlobalOptimality },
    });
    for (const family of methodPortfolio) {
      if (family.spec.id === selectedFamilyId && canonicalRecommended) family.craftPlan = finalCraftPlan;
    }
    const harvestComparison = buildHarvestComparisonSummary({
      enabledHarvestCrafts,
      methodPortfolio,
      selectedActionUsage: consistencyFailed ? [] : selectedUsage.combinedActions,
      priceBook,
      costCeilingChaos,
    });
    const methodFamilyStates = methodPortfolio.reduce(
      (sum, family) => sum + family.retainedStates,
      0
    );
    const methodFamilyCounts: Record<MethodFamilyStatus, number> = {
      SELECTED_WINNER: 0,
      MORE_EXPENSIVE: 0,
      DOMINATED: 0,
      NOT_ELIGIBLE: 0,
      UNRESOLVED_AT_BUDGET: 0,
      DISABLED: 0,
      NOT_MODELED: 0,
      NOT_SEARCHED: 0,
    };
    for (const family of methodPortfolio) methodFamilyCounts[family.status]++;
    const selectedAcquisitionEvidence = finalAcquisition.portfolioProof.candidateEvidence
      .find((candidate) =>
        candidate.candidateId === finalAcquisition.selectedCandidateId
      );
    const selectedStartIndex = starts.findIndex((_, index) =>
      `candidate_${index}` === finalAcquisition.selectedCandidateId
    );
    const selectedStart = selectedStartIndex >= 0 ? starts[selectedStartIndex] : undefined;
    const acquisitionContext: CanonicalResultPresentation['acquisitionContext'] = {
      kind: selectedAcquisitionEvidence?.kind === 'clean'
        ? 'CLEAN'
        : selectedAcquisitionEvidence?.kind === 'self-fracture'
          ? 'SELF_FRACTURE'
          : 'OTHER',
      candidateId: finalAcquisition.selectedCandidateId,
      methodId: finalAcquisition.selectedMethodId,
      targetModId: selectedAcquisitionEvidence?.kind === 'self-fracture'
        ? selectedStart?.fracturedRequirement?.modId
        : undefined,
    };
    const presentation: CanonicalResultPresentation = {
      schemaVersion: '2W.1',
      releaseStatus: 'RELEASE_CANDIDATE_BROWSER_VERIFIED',
      selectedRouteName: canonicalRecommended?.name,
      selectedRouteStatus: finalRecommendationStatus,
      proofLabel: finalRecommendationStatus === 'INTERNAL_RESULT_MISMATCH'
        ? 'Internal result mismatch - recommendation withheld'
        : finalRecommendationStatus === 'PROVEN_OPTIMAL'
        ? 'Portfolio optimal — proven'
        : canonicalRecommended
          ? 'Best among resolved alternatives'
          : 'No executable route certified',
      pricingLabel: input.marketContext?.stale
        ? 'RESEARCH_ESTIMATE_STALE_PRICING'
        : 'CURRENT_PRICING',
      harvestLifecycle: harvestComparison.status,
      acquisitionContext,
      fullRouteCostChaos: canonicalCost ?? undefined,
      routeScopes: {
        acquisitionU: canonicalRecommended ? selectedUsage.acquisitionCostChaos : undefined,
        downstreamU: canonicalRecommended ? selectedUsage.downstreamCostChaos : undefined,
        fullRouteU: canonicalCost ?? undefined,
      },
      timingScopes: {
        firstCompletedRoundMs: selectedSolverResult?.searchSummary.timeToFirstCompletedRoundMs,
        firstCertifiedDownstreamPolicyMs: selectedSolverResult?.searchSummary.timeToFirstCertifiedPolicyMs,
        firstUsefulExecutableFullRouteMs: selectedSolverResult?.searchSummary.timeToFirstUsefulRecommendationMs,
        firstAcquisitionSafeRecommendationMs:
          outputWithoutCraftPlan.search.timeToFirstAcquisitionSafeRecommendationMs,
      },
      workScopes: {
        ...outputWithoutCraftPlan.search.workScopes,
        selectedPolicyGraphStates: selectedSolverResult?.graphBuild.nodes.size ?? 0,
        acquisitionSynthesisStates:
          selectedBundle?.acquisitionSynthesis?.search?.statesExpanded ?? 0,
        methodFamilyStates,
      },
      methodFamilyCounts,
    };
    const finalWarningDetails: OptimizationWarning[] = [
      ...uniqueWarningDetails,
      ...(consistencyFailed ? [{
        category: 'SELECTED_ROUTE' as const,
        message:
          `INTERNAL_RESULT_MISMATCH: canonical bundle ${selectedConsistency.selectedBundleId ?? 'unknown'} ` +
          `differed by ${selectedConsistency.maximumDifferenceChaos.toFixed(6)}c ` +
          `(tolerance ${selectedConsistency.toleranceChaos.toFixed(3)}c); recommendation withheld.`,
      }] : []),
    ];
    const output: OptimizeCraftResult = {
      ...outputWithoutCraftPlan,
      recommendationStatus: finalRecommendationStatus,
      recommended: canonicalRecommended,
      expectedCostChaos: canonicalCost,
      expectedProfitChaos: input.expectedSaleValueChaos === undefined || canonicalCost === null
        ? undefined
        : input.expectedSaleValueChaos - canonicalCost,
      expectedCurrencies: Object.fromEntries(
        Object.entries(selectedUsage.combinedCurrencies).map(([currency, amount]) => [
          currency,
          finiteOrNull(amount),
        ])
      ),
      expectedActionUsage: selectedExpectedUsage,
      fullRouteUsage: selectedUsage,
      policyExplanation: consistencyFailed ? [] : finalPolicyExplanation,
      policyRules: consistencyFailed ? [] : finalPolicyRules,
      acquisition: finalAcquisition,
      alternatives: selectedRoutes.filter((route) =>
        route.actionId !== canonicalRecommended?.actionId ||
        Math.abs((route.expectedTotalCostChaos ?? Infinity) - (canonicalCost ?? -Infinity)) >
          CANONICAL_RECONCILIATION_TOLERANCE_CHAOS
      ),
      craftPlan: finalCraftPlan,
      methodPortfolio,
      harvestComparison,
      paretoAlternatives: finalParetoAlternatives,
      objectiveProofStatus,
      costCeilingChaos,
      internalConsistency: selectedConsistency,
      presentation,
      warningDetails: finalWarningDetails,
      warnings: [...new Set(finalWarningDetails.map((warning) => warning.message))],
      risk: selectedSolverResult ? {
        onPolicyReachableStates: selectedSolverResult.onPolicyGraph.onPolicyReachableStates +
          (selectedBundle?.acquisitionSynthesis?.risk?.onPolicyReachableStates ?? 0),
        onPolicyTerminalStates: selectedSolverResult.onPolicyGraph.onPolicyTerminalStates +
          (selectedBundle?.acquisitionSynthesis?.risk?.onPolicyTerminalStates ?? 0),
        terminalAbsorptionProbability:
          selectedSolverResult.onPolicyGraph.terminalAbsorptionProbability *
          (selectedBundle?.acquisitionSynthesis?.risk?.terminalAbsorptionProbability ?? 1),
        selectedPolicyProper: selectedSolverResult.onPolicyGraph.isProper &&
          (selectedBundle?.acquisitionSynthesis?.risk?.selectedPolicyProper ?? true),
        unresolvedOnPolicyProbability: 1 -
          (1 - selectedSolverResult.onPolicyGraph.onPolicyUnresolvedProbabilityMass) *
          (1 - (selectedBundle?.acquisitionSynthesis?.risk?.unresolvedOnPolicyProbability ?? 0)),
      } : outputWithoutCraftPlan.risk,
      priceConfidence: selectedSolverResult ? {
        selectedPolicy: {
          complete: selectedSolverResult.priceConfidence.complete,
          evidence: selectedSolverResult.priceConfidence.evidence.map((evidence) => ({ ...evidence })),
          warnings: [...selectedSolverResult.priceConfidence.warnings],
        },
        consideredSearchSpace: outputWithoutCraftPlan.priceConfidence.consideredSearchSpace,
      } : outputWithoutCraftPlan.priceConfidence,
      mechanicsConfidence: selectedSolverResult ? {
        gameMechanicsFidelity: 'PARTIAL',
        selectedPolicy: mechanicsScope(selectedSolverResult.mechanicsConfidence.evidence.filter(
          (evidence) => evidence.onPolicySelections > 0
        )),
        consideredSearchSpace: outputWithoutCraftPlan.mechanicsConfidence.consideredSearchSpace,
      } : outputWithoutCraftPlan.mechanicsConfidence,
      proof: selectedSolverResult ? {
        selectedPolicyStatus: selectedSolverResult.optimalityProof.selectedPolicyStatus,
        proofLevel: selectedSolverResult.optimalityProof.proofLevel,
        globalOptimality: finalProofGlobalOptimality,
        modeledActionOptimalityProven:
          finalRecommendationStatus === 'PROVEN_OPTIMAL' &&
          selectedSolverResult.optimalityProof.modeledActionOptimalityProven,
        unresolvedCompetitiveCandidates:
          selectedSolverResult.optimalityProof.potentiallyCompetitiveUnresolvedCount +
          unresolvedRelevantFamilies.length,
        unresolvedCompetitorsMayBeCheaper:
          selectedSolverResult.optimalityProof.unresolvedCandidatesCouldBeatIncumbent ||
          unresolvedRelevantFamilies.length > 0,
      } : outputWithoutCraftPlan.proof,
      policyRefinement: selectedSolverResult ? {
        ...outputWithoutCraftPlan.policyRefinement,
        status: selectedSolverResult.optimalityProof.modeledActionOptimalityProven
          ? 'MODELED_OPTIMAL'
          : 'CURRENT_BEST_UNPROVEN',
        finalUpperBoundChaos: canonicalCost ?? undefined,
        finalDownstreamU: canonicalRecommended ? selectedUsage.downstreamCostChaos : undefined,
        finalFullRouteU: canonicalCost ?? undefined,
        explanation: selectedSolverResult.optimalityProof.modeledActionOptimalityProven
          ? 'The selected canonical policy is optimal over its completed modeled action graph.'
          : 'This is the current best resolved canonical policy for the requested objective; relevant unresolved competitors remain explicit.',
      } : outputWithoutCraftPlan.policyRefinement,
      search: {
        ...outputWithoutCraftPlan.search,
        totalElapsedMs: Date.now() - optimizationStarted,
        workScopes: presentation.workScopes,
      },
      solver: {
        bellmanIterations: selectedSolverResult?.convergence.iterations ?? 0,
        bellmanConverged: selectedSolverResult?.convergence.converged ?? false,
        occupancyIterations: selectedSolverResult?.reconciliation.visitIterations ?? 0,
        occupancyConverged: selectedSolverResult?.reconciliation.visitConverged ?? false,
        reconciliationDifferenceChaos: selectedConsistency.maximumDifferenceChaos,
        costReconciled: !consistencyFailed &&
          (selectedSolverResult?.reconciliation.isReconciled ?? false),
      },
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
