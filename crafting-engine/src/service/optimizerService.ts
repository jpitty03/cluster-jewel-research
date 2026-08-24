import type { ClusterModRepository } from '../data/clusterModRepository.ts';
import { ModPool } from '../domain/ModPool.ts';
import {
  DEFAULT_CURRENCY_RATES,
  PriceBook,
  type CurrencyRates,
  type PriceConfidence,
  type PriceSource,
} from '../domain/PriceBook.ts';
import type { BaseType, ItemState } from '../domain/ItemState.ts';
import { getAllAffixes, getPhysicalStateSignature, normalizeItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import { getAllTargetModRequirements, matchesModRequirement } from '../domain/TargetDefinition.ts';
import type {
  AcquisitionMethodDefinition,
  AcquisitionPortfolioCandidate,
  MechanicsConfidence,
} from '../rules/actionRegistry.ts';
import { createHarvestReforgeMechanics } from '../rules/actionRegistry.ts';
import { getTaggedModsForCluster } from '../rules/clusterPoolHelpers.ts';
import {
  GenericSearchEngine,
  type ActionResolutionStatus,
  type CandidateActionQValue,
  type GenericSearchResult,
} from '../solver/genericSearch.ts';
import {
  generateStartingStateCandidates,
  type StartingStateCandidate,
} from '../solver/strategyDiscovery.ts';
import {
  DEFAULT_ACQUISITION_SYNTHESIS_ACTION_IDS,
  synthesizeAcquisition,
  type AcquisitionSynthesisResult,
} from '../solver/acquisitionSynthesis.ts';
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
  provenance: AcquisitionSynthesisResult['provenance'] | 'STRUCTURAL FRACTURE LOWER BOUND';
  expectedCostChaos?: number;
  expectedPreparationCostChaos?: number;
  lowerBoundChaos: number;
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
  mode: 'NO_FRACTURE_CANDIDATES' | 'CLEAN_ROUTE_DOMINANCE' | 'EXECUTABLE_SYNTHESIS';
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
  optimisticLowerBoundIterations: number;
  optimisticLowerBoundConverged: boolean;
  optimisticLowerBoundMethod: 'KNOWN_PARTIAL_GRAPH_WITH_ZERO_COST_UNKNOWN_SUCCESSORS';
  minimumFeasibleRarity: GenericSearchResult['searchSummary']['minimumFeasibleRarity'];
  acquisitionFeasibility: GenericSearchResult['searchSummary']['acquisitionFeasibility'];
  deepenProgress: GenericSearchResult['searchSummary']['deepenProgress'];
  stageTimingMs: GenericSearchResult['stageTiming'] & { serializationMs: number };
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

function acquisitionCacheIdentity(
  start: StartingStateCandidate,
  cleanBase: ReturnType<typeof cleanBaseEvidence>,
  input: OptimizeCraftInput,
  budget: { maxStates: number; maxWallTimeMs: number; maxExpansionRounds: number }
): string {
  return JSON.stringify({
    version: 1,
    cleanPhysicalState: getPhysicalStateSignature(normalizeItemState({
      ...start.state,
      rarity: 'normal',
      prefixes: [],
      suffixes: [],
      fracturedModIds: [],
    })),
    fracturedRequirement: start.fracturedRequirement,
    cleanBase,
    currencyRates: sortedRecord({
      ...DEFAULT_CURRENCY_RATES,
      ...(input.prices?.currencyRates ?? {}),
    }),
    enabledActionIds: [...DEFAULT_ACQUISITION_SYNTHESIS_ACTION_IDS],
    includeHarvest: false,
    allowResearchFallbackPrices: input.allowResearchFallbackPrices ?? true,
    searchIntent: input.searchIntent ?? 'RECOMMEND',
    budget,
  });
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

function buildPolicyExplanation(
  rules: GenericSearchResult['onPolicyRules'],
  target: TargetDefinition
): PolicyExplanationRule[] {
  const grouped = new Map<string, PolicyExplanationRule>();
  for (const rule of rules) {
    const condition = describePolicyCondition(rule.state, target);
    const key = `${condition}\u0000${rule.selectedActionId}`;
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

/** Serializable optimizer boundary intended for the thin Developer UI. */
export class OptimizerService {
  private readonly repo: ClusterModRepository;
  private readonly acquisitionSynthesisCache = new Map<string, AcquisitionSynthesisResult>();

  constructor(repo: ClusterModRepository) {
    this.repo = repo;
  }

  optimize(input: OptimizeCraftInput): OptimizeCraftResult {
    const optimizationStarted = Date.now();
    const validation = validateOptimizeCraftInput(this.repo, input);
    if (!validation.valid) throw new OptimizerInputValidationError(validation.errors);
    input = validation.normalizedInput;
    const runtimeBudget = getSearchRuntimeBudget(input.searchBudget?.maxWallTimeMs);
    const overallDeadline = optimizationStarted + runtimeBudget.engineDeadlineMs;
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
    const cleanEvidence = cleanBaseEvidence(cleanStart, input);
    const fractureEntries = starts
      .map((start, candidateIndex) => ({ start, candidateIndex }))
      .filter((entry) => entry.start.fracturedRequirement !== undefined);
    const harvestTags = input.harvestTags ?? inferHarvestTags(input.target, pool);
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
    ): GenericSearchResult => new GenericSearchEngine(
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
          skipAcquisitionFeasibility,
        }
      ).search(startState);

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

    // Simple clean routes receive a short certification pass first. If its executable upper bound
    // is already below the unavoidable price of one clean base plus one Fracturing Orb, every
    // self-fracture family is soundly dominated without paying off-policy synthesis latency.
    let fastCleanResult: GenericSearchResult | undefined;
    let fastCleanRoute: RouteSummary | undefined;
    const targetExplicitlyRequiresFracture = getAllTargetModRequirements(input.target)
      .some((requirement) => requirement.mustBeFractured === true);
    const fracturePrice = priceBook.evaluateRate('fracturing');
    const fracturePriceUsable = fracturePrice.confidence === 'known' ||
      (input.allowResearchFallbackPrices ?? true);
    const structuralFractureLowerBound = cleanEvidence.costChaos + fracturePrice.costChaos;
    if (
      fractureEntries.length > 0 &&
      !targetExplicitlyRequiresFracture &&
      input.target.requiredRarity !== 'rare' &&
      fracturePriceUsable &&
      fracturePrice.costChaos > 0
    ) {
      const fastWallTimeMs = Math.max(
        1,
        Math.min(22_000, Math.floor(runtimeBudget.engineDeadlineMs * 0.75))
      );
      const cleanPortfolio = buildAcquisitionPortfolio([cleanStart], input);
      // The bounded clean feasibility pass intentionally uses the established rebuilt-round
      // mode: it is the fast, stable Phase 2C path for simple clean targets. Acquisition
      // synthesis itself retains persistent extension and reports it independently.
      fastCleanResult = runDownstreamSearch(cleanPortfolio, fastWallTimeMs, false, true);
      const fastDecision = [...fastCleanResult.policyMap.values()].find(
        (decision) => decision.state.flags?.acquisitionMenu === true
      );
      fastCleanRoute = (fastDecision?.candidateQValues ?? [])
        .filter((candidate) => candidate.actionId.startsWith('acquire_'))
        .map(routeSummary)
        .find((route) =>
          route.actionId === fastDecision?.bestActionId &&
          route.status === 'RESOLVED' &&
          route.expectedTotalCostChaos !== null
        );
      const fastCertified = fastCleanResult.optimalityProof.selectedPolicyStatus ===
        'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED';
      if (
        fastCertified &&
        fastCleanRoute?.expectedTotalCostChaos !== null &&
        fastCleanRoute?.expectedTotalCostChaos !== undefined &&
        fastCleanRoute.expectedTotalCostChaos <= structuralFractureLowerBound
      ) {
        stageMode = 'CLEAN_ROUTE_DOMINANCE';
        for (const { candidateIndex } of fractureEntries) {
          synthesisSummaries.set(candidateIndex, {
            status: 'SKIPPED_DOMINATED',
            provenance: 'STRUCTURAL FRACTURE LOWER BOUND',
            lowerBoundChaos: structuralFractureLowerBound,
            explanation:
              `Certified clean route ${fastCleanRoute.expectedTotalCostChaos.toFixed(3)}c is no ` +
              `more expensive than the unavoidable ${cleanEvidence.costChaos.toFixed(3)}c clean ` +
              `base + ${fracturePrice.costChaos.toFixed(3)}c first Fracturing Orb lower bound.`,
            cacheHit: false,
            allocatedMaxStates: 0,
            allocatedMaxWallTimeMs: 0,
            allocatedMaxExpansionRounds: stageMaxExpansionRounds,
          });
        }
      }
    }

    if (stageMode === 'CLEAN_ROUTE_DOMINANCE' && fastCleanResult) {
      stageElapsedMs = fastCleanResult.searchSummary.elapsedMs;
      portfolio = buildAcquisitionPortfolio([cleanStart], input);
      result = fastCleanResult;
    } else {
      const acquisitionStarted = Date.now();
      if (fractureEntries.length > 0) {
        stageTotalStateBudget = Math.max(
          fractureEntries.length,
          input.searchBudget?.acquisitionMaxStates ??
            Math.max(5_001, input.searchBudget?.maxStates ?? 5_000)
        );
        const downstreamReserveMs = Math.max(
          1_000,
          Math.min(8_000, Math.floor(runtimeBudget.engineDeadlineMs * 0.25))
        );
        const availableAcquisitionWallTimeMs = Math.max(
          fractureEntries.length,
          overallDeadline - Date.now() - downstreamReserveMs
        );
        stageTotalWallTimeBudgetMs = Math.max(
          fractureEntries.length,
          Math.min(
            input.searchBudget?.acquisitionMaxWallTimeMs ??
              Math.floor(runtimeBudget.engineDeadlineMs * 0.75),
            availableAcquisitionWallTimeMs
          )
        );
        if (
          input.searchBudget?.acquisitionMaxWallTimeMs === undefined &&
          Math.floor(stageTotalStateBudget / fractureEntries.length) < 5_001
        ) {
          stageTotalWallTimeBudgetMs = Math.min(
            stageTotalWallTimeBudgetMs,
            5_000 * fractureEntries.length
          );
        }
        const stateQuotient = Math.floor(stageTotalStateBudget / fractureEntries.length);
        const stateRemainder = stageTotalStateBudget % fractureEntries.length;
        const wallQuotient = Math.floor(stageTotalWallTimeBudgetMs / fractureEntries.length);
        const wallRemainder = stageTotalWallTimeBudgetMs % fractureEntries.length;

        for (const [fractureIndex, { start, candidateIndex }] of fractureEntries.entries()) {
          const allocation = {
            maxStates: stateQuotient + (fractureIndex < stateRemainder ? 1 : 0),
            maxWallTimeMs: wallQuotient + (fractureIndex < wallRemainder ? 1 : 0),
            maxExpansionRounds: stageMaxExpansionRounds,
          };
          const cacheIdentity = acquisitionCacheIdentity(start, cleanEvidence, input, allocation);
          let synthesis = this.acquisitionSynthesisCache.get(cacheIdentity);
          const cacheHit = synthesis !== undefined;
          if (!synthesis) {
            synthesis = synthesizeAcquisition(
              { pool, priceBook },
              {
                cleanStartingState: cleanStart.state,
                desiredPhysicalState: { fracturedMod: start.fracturedRequirement! },
                cleanBaseAcquisition: cleanEvidence,
                searchBudget: allocation,
                allowResearchFallbackPrices: input.allowResearchFallbackPrices ?? true,
                searchIntent: input.searchIntent ?? 'RECOMMEND',
              }
            );
            if (this.acquisitionSynthesisCache.size >= 64) {
              const oldestKey = this.acquisitionSynthesisCache.keys().next().value;
              if (oldestKey !== undefined) this.acquisitionSynthesisCache.delete(oldestKey);
            }
            this.acquisitionSynthesisCache.set(cacheIdentity, synthesis);
          }
          stageAttemptedCandidates++;
          if (cacheHit) stageCacheHits++;
          synthesisSummaries.set(
            candidateIndex,
            summarizeSynthesis(synthesis, allocation, cacheHit, cacheIdentity)
          );
          if (synthesis.status === 'RESOLVED' && synthesis.expectedCostChaos !== undefined) {
            synthesisResults.set(candidateIndex, synthesis);
          }
        }
      }
      stageElapsedMs = Date.now() - acquisitionStarted;
      portfolio = buildAcquisitionPortfolio(starts, input, synthesisResults);
      result = runDownstreamSearch(portfolio, Math.max(1, overallDeadline - Date.now()));
    }

    const acquisitionDecision = [...result.policyMap.values()].find(
      (decision) => decision.state.flags?.acquisitionMenu === true
    );
    const rankedAcquisitionRoutes = (acquisitionDecision?.candidateQValues ?? [])
      .filter((candidate) => candidate.actionId.startsWith('acquire_'))
      .map(routeSummary)
      .sort((left, right) =>
        (left.expectedTotalCostChaos ?? Infinity) - (right.expectedTotalCostChaos ?? Infinity)
      );
    const selectedPolicyCertified =
      result.optimalityProof.selectedPolicyStatus ===
      'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED';
    const recommended = selectedPolicyCertified
      ? rankedAcquisitionRoutes.find(
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
          synthesis.proof?.unresolvedCandidatesCouldBeatIncumbent !== true
        ) {
          return [];
        }
        const couldBeat = incumbentUpperBound !== undefined &&
          synthesis.lowerBoundChaos < incumbentUpperBound;
        return [{
          actionId: `synthesis_frontier_${candidateId}`,
          name: `Unresolved self-fracture frontier: ${starts[candidateIndex].label}`,
          acquisitionCandidateId: candidateId,
          acquisitionMethodId: 'self-fracture_executable',
          expectedTotalCostChaos: null,
          lowerBoundChaos: synthesis.lowerBoundChaos,
          incumbentUpperBoundChaos: incumbentUpperBound ?? null,
          optimalityGapChaos: incumbentUpperBound === undefined
            ? null
            : Math.max(0, incumbentUpperBound - synthesis.lowerBoundChaos),
          status: 'UNRESOLVED',
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

    const policyRules: PolicyRule[] = result.onPolicyRules.map((rule) => ({
      stateKey: rule.stateKey,
      state: describePolicyState(rule.state),
      selectedActionId: rule.selectedActionId,
      selectedAction: rule.selectedActionName,
      expectedVisits: rule.expectedVisits,
      totalCostChaos: finiteOrNull(rule.totalCostChaos),
      candidates: rule.candidateQValues.map(serializeCandidate),
    }));
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
    const selectedMechanicsWarnings = mechanicsScope(selectedMechanicsEvidence).warnings;
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

    const output: OptimizeCraftResult = {
      target: input.target,
      validationNotices: validation.notices,
      recommendationStatus,
      recommended,
      alternatives: acquisitionRoutes.filter((route) => route.actionId !== recommended?.actionId),
      expectedCurrencies: Object.fromEntries(
        Object.entries(result.expectedCurrencies).map(([currency, amount]) => [currency, finiteOrNull(amount)])
      ),
      expectedActionUsage: result.expectedActionUsage.map((usage) => ({ ...usage })),
      policyExplanation: buildPolicyExplanation(result.onPolicyRules, input.target),
      policyRules,
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
            '+ Harvest scope + fallback policy + search intent + exact per-candidate budget.',
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
      search: {
        ...result.searchSummary,
        maxWallTimeMs: runtimeBudget.requestedWallTimeMs,
        requestedWallTimeMs: runtimeBudget.requestedWallTimeMs,
        engineDeadlineMs: runtimeBudget.engineDeadlineMs,
        hostGuardDeadlineMs: runtimeBudget.hostGuardDeadlineMs,
        shutdownReserveMs: runtimeBudget.shutdownReserveMs,
        hostGuardTriggered: false,
        stageTimingMs: { ...result.stageTiming, serializationMs: 0 },
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

    // This assertion belongs at the boundary: an accidental Map/Infinity must
    // never become a frontend integration surprise.
    const serializationStarted = Date.now();
    JSON.stringify(output);
    output.search.stageTimingMs.serializationMs = Date.now() - serializationStarted;
    JSON.stringify(output);
    return output;
  }
}
