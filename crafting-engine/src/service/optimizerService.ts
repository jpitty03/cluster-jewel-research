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
import {
  createGenericSearchContinuationSession,
  GenericSearchEngine,
  type ActionResolutionStatus,
  type CandidateActionQValue,
  type GenericSearchContinuationSession,
  type GenericSearchResult,
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
    | 'UNRESOLVED'
    | 'PROVISIONAL'
    | 'RESOLVED'
    | 'DOWNSTREAM_UNRESOLVED'
    | 'FULL_ROUTE_RESOLVED'
    | 'DOMINATED'
    | 'SELECTED';
  lowerBoundChaos?: number;
  acquisitionUpperBoundChaos?: number;
  downstreamUpperBoundChaos?: number;
  fullRouteUpperBoundChaos?: number;
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
  sessionReuseStatus: 'COLD' | 'RESUMED' | 'INVALIDATED';
  sessionReuseMessage?: string;
}

export interface SearchSessionReuseSummary {
  status: 'COLD' | 'RESUMED' | 'INVALIDATED';
  identityHash: string;
  missReason?: string;
  retainedStates: number;
  retainedTransitionDistributions: number;
  scope: 'CLEAN_DOWNSTREAM' | 'ACQUISITION_PORTFOLIO';
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
      const retainedAcqStates = searchSessionRecord.fractureAcquisitions.get(sessionKey)?.expansion.nodes.size ?? 0;
      progressCandidates.set(id, {
        id,
        label: start.label,
        kind: 'self-fracture',
        targetModName: describeModRequirement(start.fracturedRequirement!),
        status: 'NOT_STARTED',
        lowerBoundChaos: structuralBounds.get(candidateIndex)?.combinedLowerBoundChaos,
        statesExpanded: 0,
        retainedStates: retainedAcqStates,
        elapsedMs: 0,
        isActive: false,
      });
    }

    let currentBestUpperBound: number | undefined;
    let currentBestUnresolvedLowerBound: number | undefined;
    let currentPotentialGap: number | undefined;

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

      const activeLowerBounds = candidateList
        .filter((c) => c.status !== 'DOMINATED' && (c.status === 'NOT_STARTED' || c.status === 'PROBING' || c.status === 'UNRESOLVED'))
        .map((c) => c.lowerBoundChaos)
        .filter((val): val is number => val !== undefined && Number.isFinite(val));
      currentBestUnresolvedLowerBound = activeLowerBounds.length > 0 ? Math.min(...activeLowerBounds) : undefined;
      currentPotentialGap = currentBestUpperBound !== undefined && currentBestUnresolvedLowerBound !== undefined
        ? Math.max(0, currentBestUpperBound - currentBestUnresolvedLowerBound)
        : undefined;

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
        sessionReuseStatus: invalidationReason === undefined && totalRetained > 0
          ? 'RESUMED'
          : invalidationReason ? 'INVALIDATED' : 'COLD',
        sessionReuseMessage: invalidationReason
          ? `Restarted — ${invalidationReason.toLowerCase().replace(/_/g, ' ')}`
          : totalRetained > 0
            ? `Resumed from prior run (${totalRetained.toLocaleString()} states retained)`
            : undefined,
      });
    };

    emitProgress('INITIALIZING', 'Analyzing craft targets and starting candidates', 'Evaluating starting base portfolio', true);

    let bestFractureDownstreamResult: GenericSearchResult | undefined;
    let bestFractureCandidateIndex: number | undefined;

    if (
      fractureEntries.length > 0 &&
      !targetExplicitlyRequiresFracture &&
      allStructuralBoundsProven
    ) {
      const requestedIntent = input.searchIntent ?? 'RECOMMEND';
      const isComplexMultiMod = validation.normalizedInput.target.requiredMods.length >= 3;
      const fastWallTimeCeiling = requestedIntent === 'RECOMMEND'
        ? (isComplexMultiMod ? Math.min(3_000, Math.floor(runtimeBudget.engineDeadlineMs * 0.15)) : Math.min(10_000, Math.floor(runtimeBudget.engineDeadlineMs * 0.35)))
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
          maxStates: input.searchBudget?.maxStates ?? 5_000,
          maxWallTimeMs: fastWallTimeMs,
          maxExpansionRounds: input.searchBudget?.maxExpansionRounds ?? 3,
          searchIntent: input.searchIntent ?? 'RECOMMEND',
          persistentExpansion: true,
          continuationSession: searchSessionRecord.cleanDownstream,
          recommendationRefinementRounds: 1,
          restartReacquire: {
            destination: cleanStart.state,
            acquisitionCostChaos: cleanEvidence.costChaos,
            confidence: cleanEvidence.confidence,
            provenance: cleanEvidence.provenance,
            label: 'Abandon attempt and reacquire a clean base',
          },
          onProgress: (ev) => {
            cleanProg.statesExpanded = ev.statesExpanded;
            cleanProg.elapsedMs = ev.elapsedMs;
            emitProgress('CLEAN_PROBE', 'Certifying physical clean-base route', `Clean Base: Round ${ev.currentRound}/${ev.totalRounds}`, false, ev.milestone);
          },
        }
      ).search(cleanStart.state);

      cleanProg.statesExpanded = fastCleanResult.graphBuild.nodes.size;
      cleanProg.elapsedMs = fastCleanResult.searchSummary.elapsedMs;
      cleanProg.isActive = false;

      const fastCertified = fastCleanResult.optimalityProof.selectedPolicyStatus ===
        'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED';
      if (fastCertified && Number.isFinite(fastCleanResult.totalExpectedCostChaos)) {
        const total = cleanEvidence.costChaos + fastCleanResult.totalExpectedCostChaos;
        cleanProg.status = 'RESOLVED';
        cleanProg.fullRouteUpperBoundChaos = total;
        currentBestUpperBound = total;
        progressIncumbents.push({
          elapsedMs: Date.now() - optimizationStarted,
          upperBoundChaos: total,
          label: 'Clean Base',
        });
        emitProgress('CLEAN_PROBE', 'Clean route certified', `Clean Base certified: ${total.toFixed(2)}c`, true, `Clean base certified: ${total.toFixed(2)}c`);

        const startDecision = fastCleanResult.policyMap.get(
          getCanonicalStateKey(cleanStart.state, input.target)
        );
        const downstreamLowerBound = Math.min(
          ...(startDecision?.candidateQValues
            .map((candidate) => candidate.lowerBoundChaos)
            .filter(Number.isFinite) ?? [])
        );
        const totalLowerBound = cleanEvidence.costChaos + (
          Number.isFinite(downstreamLowerBound) ? downstreamLowerBound : 0
        );
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
        };
      }
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
        emitProgress('COMPLETE', 'Clean route dominates all self-fractures', `Optimization complete (Clean Base: ${fastCleanRoute.expectedTotalCostChaos.toFixed(2)}c)`, true, 'Clean route dominates all fracture families');
      }
    }

    if (stageMode === 'CLEAN_ROUTE_DOMINANCE' && fastCleanResult) {
      stageElapsedMs = fastCleanResult.searchSummary.elapsedMs;
      portfolio = buildAcquisitionPortfolio([cleanStart], input);
      result = fastCleanResult;
    } else {
      const acquisitionStarted = Date.now();

      if (fractureEntries.length > 0) {
        let incumbentFullRouteU = fastCleanRoute?.expectedTotalCostChaos ?? Infinity;

        // Sort candidates by lowest mandatory mechanics lower bound (most competitive first)
        const sortedFractureEntries = [...fractureEntries].sort(
          (a, b) => (structuralBounds.get(a.candidateIndex)?.combinedLowerBoundChaos ?? 0) -
                    (structuralBounds.get(b.candidateIndex)?.combinedLowerBoundChaos ?? 0)
        );

        // Tranche 1: Probe each non-dominated fracture candidate
        for (const { start, candidateIndex } of sortedFractureEntries) {
          const bound = structuralBounds.get(candidateIndex)!;
          const pCand = progressCandidates.get(`candidate_${candidateIndex}`)!;
          if (bound.combinedLowerBoundChaos >= incumbentFullRouteU || Date.now() >= searchStopDeadline) {
            pCand.status = 'DOMINATED';
            continue;
          }
          const sessionKey = JSON.stringify(start.fracturedRequirement);
          let acqSession = searchSessionRecord.fractureAcquisitions.get(sessionKey);
          if (!acqSession) {
            acqSession = createGenericSearchContinuationSession();
            searchSessionRecord.fractureAcquisitions.set(sessionKey, acqSession);
          }

          pCand.status = 'PROBING';
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
              onProgress: (ev) => {
                pCand.statesExpanded = ev.statesExpanded;
                pCand.elapsedMs = ev.elapsedMs;
                emitProgress('FRACTURE_PROBE', 'Probing self-fracture acquisition', `${start.label}: ${ev.statesExpanded} states`, false, ev.milestone);
              },
            }
          );

          stageAttemptedCandidates++;
          pCand.statesExpanded = synthesis.search.statesExpanded;
          pCand.elapsedMs = synthesis.search.elapsedMs;
          pCand.lowerBoundChaos = synthesis.lowerBoundChaos;
          synthesisSummaries.set(
            candidateIndex,
            summarizeSynthesis(synthesis, probeAllocation, false, sessionKey)
          );

          if (synthesis.status === 'RESOLVED' && synthesis.expectedCostChaos !== undefined) {
            synthesisResults.set(candidateIndex, synthesis);
            pCand.status = 'RESOLVED';
            pCand.acquisitionUpperBoundChaos = synthesis.expectedCostChaos;
            emitProgress('FRACTURE_PROBE', 'Self-fracture acquisition resolved', `Acquisition resolved: ${start.label} (${synthesis.expectedCostChaos.toFixed(2)}c)`, true, `Acquisition resolved: ${start.label} (${synthesis.expectedCostChaos.toFixed(2)}c)`);

            // Evaluate downstream from this fractured state with accurate restart cost
            let downSession = searchSessionRecord.fractureDownstreams.get(sessionKey);
            if (!downSession) {
              downSession = createGenericSearchContinuationSession();
              searchSessionRecord.fractureDownstreams.set(sessionKey, downSession);
            }
            pCand.isActive = true;
            emitProgress('DOWNSTREAM_SOLVE', 'Solving downstream craft from fractured state', `Downstream: ${start.label}`, true);

            const downWallTimeMs = Math.min(5_000, Math.max(1_000, searchStopDeadline - Date.now() - 1_500));
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

            if (
              downstreamResult.optimalityProof.selectedPolicyStatus === 'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED' &&
              Number.isFinite(downstreamResult.totalExpectedCostChaos)
            ) {
              const fullRouteCost = synthesis.expectedCostChaos + downstreamResult.totalExpectedCostChaos;
              pCand.status = 'FULL_ROUTE_RESOLVED';
              pCand.downstreamUpperBoundChaos = downstreamResult.totalExpectedCostChaos;
              pCand.fullRouteUpperBoundChaos = fullRouteCost;
              if (fullRouteCost < incumbentFullRouteU) {
                incumbentFullRouteU = fullRouteCost;
                currentBestUpperBound = fullRouteCost;
                bestFractureDownstreamResult = downstreamResult;
                bestFractureCandidateIndex = candidateIndex;
                progressIncumbents.push({
                  elapsedMs: Date.now() - optimizationStarted,
                  upperBoundChaos: fullRouteCost,
                  label: start.label,
                });
                emitProgress('DOWNSTREAM_SOLVE', 'New best full route resolved', `New best route: ${start.label} (${fullRouteCost.toFixed(2)}c)`, true, `New best route: ${start.label} (${fullRouteCost.toFixed(2)}c)`);
              }
            }
          }
          pCand.isActive = false;
        }

        // Tranche 2: Deepen competitive candidates if time remains
        const remainingForDeepen = searchStopDeadline - Date.now() - 2_000;
        if (remainingForDeepen > 1_500) {
          const competitiveCandidates = sortedFractureEntries
            .filter(({ candidateIndex }) => {
              const s = synthesisSummaries.get(candidateIndex);
              const p = progressCandidates.get(`candidate_${candidateIndex}`);
              return (s?.lowerBoundChaos ?? Infinity) < incumbentFullRouteU && p?.status !== 'FULL_ROUTE_RESOLVED';
            })
            .sort((a, b) => (synthesisSummaries.get(a.candidateIndex)?.lowerBoundChaos ?? 0) - (synthesisSummaries.get(b.candidateIndex)?.lowerBoundChaos ?? 0));

          for (const { start, candidateIndex } of competitiveCandidates) {
            if (Date.now() + 1_000 >= searchStopDeadline) break;
            const sessionKey = JSON.stringify(start.fracturedRequirement);
            const acqSession = searchSessionRecord.fractureAcquisitions.get(sessionKey)!;
            const pCand = progressCandidates.get(`candidate_${candidateIndex}`)!;
            pCand.status = 'PROBING';
            pCand.isActive = true;
            emitProgress('FRACTURE_DEEPEN', 'Deepening competitive self-fracture acquisition', `Deepening: ${start.label}`, true);

            const deepenWallTimeMs = Math.min(6_000, Math.max(1_000, searchStopDeadline - Date.now() - 1_500));
            const deepenAllocation = {
              maxStates: input.searchBudget?.maxStates ?? 5_000,
              maxWallTimeMs: deepenWallTimeMs,
              maxExpansionRounds: input.searchBudget?.maxExpansionRounds ?? 3,
            };

            const synthesis = synthesizeAcquisition(
              { pool, priceBook },
              {
                cleanStartingState: cleanStart.state,
                desiredPhysicalState: { fracturedMod: start.fracturedRequirement! },
                cleanBaseAcquisition: cleanEvidence,
                searchBudget: deepenAllocation,
                allowResearchFallbackPrices: input.allowResearchFallbackPrices ?? true,
                searchIntent: input.searchIntent ?? 'RECOMMEND',
                continuationSession: acqSession,
                persistentExpansion: true,
              }
            );

            pCand.statesExpanded = synthesis.search.statesExpanded;
            pCand.elapsedMs = synthesis.search.elapsedMs;
            pCand.lowerBoundChaos = synthesis.lowerBoundChaos;
            synthesisSummaries.set(
              candidateIndex,
              summarizeSynthesis(synthesis, deepenAllocation, false, sessionKey)
            );

            if (synthesis.status === 'RESOLVED' && synthesis.expectedCostChaos !== undefined) {
              synthesisResults.set(candidateIndex, synthesis);
              pCand.status = 'RESOLVED';
              pCand.acquisitionUpperBoundChaos = synthesis.expectedCostChaos;

              const downSession = searchSessionRecord.fractureDownstreams.get(sessionKey) ?? createGenericSearchContinuationSession();
              searchSessionRecord.fractureDownstreams.set(sessionKey, downSession);

              const downstreamResult = new GenericSearchEngine(
                { pool, priceBook },
                input.target,
                {
                  includeHarvest: harvestTags.length > 0,
                  harvestTags,
                  prioritizeTargetProgress: true,
                  allowResearchFallbackPrices: input.allowResearchFallbackPrices ?? true,
                  maxStates: input.searchBudget?.maxStates ?? 5_000,
                  maxWallTimeMs: Math.min(5_000, Math.max(1_000, searchStopDeadline - Date.now() - 1_000)),
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

              if (
                downstreamResult.optimalityProof.selectedPolicyStatus === 'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED' &&
                Number.isFinite(downstreamResult.totalExpectedCostChaos)
              ) {
                const fullRouteCost = synthesis.expectedCostChaos + downstreamResult.totalExpectedCostChaos;
                pCand.status = 'FULL_ROUTE_RESOLVED';
                pCand.downstreamUpperBoundChaos = downstreamResult.totalExpectedCostChaos;
                pCand.fullRouteUpperBoundChaos = fullRouteCost;
                if (fullRouteCost < incumbentFullRouteU) {
                  incumbentFullRouteU = fullRouteCost;
                  currentBestUpperBound = fullRouteCost;
                  bestFractureDownstreamResult = downstreamResult;
                  bestFractureCandidateIndex = candidateIndex;
                  progressIncumbents.push({
                    elapsedMs: Date.now() - optimizationStarted,
                    upperBoundChaos: fullRouteCost,
                    label: start.label,
                  });
                  emitProgress('DOWNSTREAM_SOLVE', 'New best full route resolved', `New best route: ${start.label} (${fullRouteCost.toFixed(2)}c)`, true, `New best route: ${start.label} (${fullRouteCost.toFixed(2)}c)`);
                }
              }
            }
            pCand.isActive = false;
          }
        }

        // Mark any remaining candidate whose lower bound cannot beat the best full route as dominated
        for (const { candidateIndex } of fractureEntries) {
          const pCand = progressCandidates.get(`candidate_${candidateIndex}`);
          const s = synthesisSummaries.get(candidateIndex);
          if (pCand && s && s.lowerBoundChaos >= incumbentFullRouteU && pCand.status !== 'FULL_ROUTE_RESOLVED') {
            pCand.status = 'DOMINATED';
          }
        }

        // Mark winner
        if (bestFractureCandidateIndex !== undefined) {
          const winnerCand = progressCandidates.get(`candidate_${bestFractureCandidateIndex}`);
          if (winnerCand) winnerCand.status = 'SELECTED';
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

    const bestFractureSynthesis = usesDirectFracturePolicy
      ? synthesisResults.get(bestFractureCandidateIndex!)
      : undefined;
    const bestFractureTotalCost = usesDirectFracturePolicy && bestFractureSynthesis?.expectedCostChaos !== undefined && bestFractureDownstreamResult?.totalExpectedCostChaos !== undefined
      ? bestFractureSynthesis.expectedCostChaos + bestFractureDownstreamResult.totalExpectedCostChaos
      : undefined;
    const bestFractureRoute: RouteSummary | undefined = usesDirectFracturePolicy && bestFractureTotalCost !== undefined
      ? {
          actionId: `acquire_candidate_${bestFractureCandidateIndex}_self-fracture_executable`,
          name: `Start self-fracture: ${starts[bestFractureCandidateIndex!].label}`,
          acquisitionCandidateId: `candidate_${bestFractureCandidateIndex}`,
          acquisitionMethodId: 'self-fracture_executable',
          expectedTotalCostChaos: bestFractureTotalCost,
          lowerBoundChaos: bestFractureSynthesis?.lowerBoundChaos ?? 0,
          incumbentUpperBoundChaos: bestFractureTotalCost,
          optimalityGapChaos: Math.max(0, bestFractureTotalCost - (bestFractureSynthesis?.lowerBoundChaos ?? 0)),
          status: 'RESOLVED',
          couldBeatResolvedIncumbent: false,
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
    const selectedPolicyCertified =
      result.optimalityProof.selectedPolicyStatus ===
      'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED';
    const recommended = selectedPolicyCertified
      ? usesDirectCleanPolicy
        ? fastCleanRoute ?? null
        : usesDirectFracturePolicy
          ? bestFractureRoute ?? null
          : rankedAcquisitionRoutes.find(
            (route) =>
              route.actionId === acquisitionDecision?.bestActionId &&
              route.status === 'RESOLVED' &&
              route.expectedTotalCostChaos !== null
          ) ?? null
      : null;
    const selectedParts = recommended ? portfolioActionParts(recommended.actionId) : {};
    const incumbentUpperBound = recommended?.expectedTotalCostChaos ?? undefined;
    const synthesisEvidenceRoutes: RouteSummary[] = [...synthesisSummaries.entries()].flatMap(
      ([candidateIndex, synthesis]): RouteSummary[] => {
        const candidateId = `candidate_${candidateIndex}`;
        if (synthesis.status === 'SKIPPED_DOMINATED') {
          return [{
            actionId: `synthesis_bound_${candidateId}`,
            name: `Self-fracture ${starts[candidateIndex].label} (structurally dominated)`,
            acquisitionCandidateId: candidateId,
            acquisitionMethodId: 'self-fracture_executable',
            expectedTotalCostChaos: null,
            lowerBoundChaos: synthesis.lowerBoundChaos,
            incumbentUpperBoundChaos: incumbentUpperBound ?? null,
            optimalityGapChaos: incumbentUpperBound === undefined
              ? null
              : Math.max(0, incumbentUpperBound - synthesis.lowerBoundChaos),
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
          synthesis.lowerBoundChaos < incumbentUpperBound;
        const dominatedByBound = incumbentUpperBound !== undefined && !couldBeat;
        return [{
          actionId: `synthesis_frontier_${candidateId}`,
          name: dominatedByBound
            ? `Self-fracture ${starts[candidateIndex].label} (dominated by admissible bound)`
            : `Unresolved self-fracture frontier: ${starts[candidateIndex].label}`,
          acquisitionCandidateId: candidateId,
          acquisitionMethodId: 'self-fracture_executable',
          expectedTotalCostChaos: null,
          lowerBoundChaos: synthesis.lowerBoundChaos,
          incumbentUpperBoundChaos: incumbentUpperBound ?? null,
          optimalityGapChaos: incumbentUpperBound === undefined
            ? null
            : Math.max(0, incumbentUpperBound - synthesis.lowerBoundChaos),
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
    const unresolvedAcquisitionRoutes = acquisitionRoutes.filter(
      (route) => route.status === 'UNRESOLVED' || route.couldBeatResolvedIncumbent
    );
    const acquisitionSelectionThreats = unresolvedAcquisitionRoutes.filter(
      (route) => route.acquisitionCandidateId !== selectedParts.candidateId
    );
    const bestUnresolvedLowerBound = unresolvedAcquisitionRoutes.reduce(
      (minimum, route) => Math.min(minimum, route.lowerBoundChaos),
      Infinity
    );
    const acquisitionSelectionSafe = incumbentUpperBound !== undefined &&
      !acquisitionSelectionThreats.some((route) => route.lowerBoundChaos < incumbentUpperBound);
    const acquisitionPotentialGap = incumbentUpperBound !== undefined && Number.isFinite(bestUnresolvedLowerBound)
      ? Math.max(0, incumbentUpperBound - bestUnresolvedLowerBound)
      : undefined;
    const selectedCandidateIndex = selectedParts.candidateId === undefined
      ? undefined
      : Number(/^candidate_(\d+)$/.exec(selectedParts.candidateId)?.[1]);
    const selectedSynthesis = selectedCandidateIndex === undefined || Number.isNaN(selectedCandidateIndex)
      ? undefined
      : synthesisSummaries.get(selectedCandidateIndex);
    const synthesisFrontiersCouldBeat = acquisitionSelectionThreats.some(
      (route) => route.couldBeatResolvedIncumbent
    );
    const overallModeledActionOptimalityProven =
      result.optimalityProof.modeledActionOptimalityProven &&
      (selectedSynthesis?.proof?.modeledActionOptimalityProven ?? true) &&
      !synthesisFrontiersCouldBeat;
    const overallGlobalOptimality = overallModeledActionOptimalityProven
      ? result.optimalityProof.globalOptimality
      : 'NOT YET PROVEN';
    const overallUnresolvedCompetitorCount =
      result.optimalityProof.potentiallyCompetitiveUnresolvedCount +
      acquisitionSelectionThreats.filter((route) => route.couldBeatResolvedIncumbent).length;
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
          `best unresolved acquisition lower bound ${bestUnresolvedLowerBound.toFixed(3)}c; ` +
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
      warningDetails: uniqueWarningDetails,
      warnings: [...new Set(uniqueWarningDetails.map((warning) => warning.message))],
    };
    const output: OptimizeCraftResult = {
      ...outputWithoutCraftPlan,
      craftPlan: buildCraftPlan(outputWithoutCraftPlan),
    };

    // This assertion belongs at the boundary: an accidental Map/Infinity must
    // never become a frontend integration surprise.
    const serializationStarted = Date.now();
    JSON.stringify(output);
    output.search.stageTimingMs.serializationMs = Date.now() - serializationStarted;
    JSON.stringify(output);
    return output;
  }
}
