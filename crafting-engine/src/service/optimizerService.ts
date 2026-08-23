import type { ClusterModRepository } from '../data/clusterModRepository.ts';
import { ModPool } from '../domain/ModPool.ts';
import {
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
}

export interface AcquisitionCandidateSummary {
  id: string;
  label: string;
  physicalStateSignature: string;
  methods: AcquisitionMethodSummary[];
}

export interface AcquisitionSummary {
  selectedCandidateId?: string;
  selectedMethodId?: string;
  candidates: AcquisitionCandidateSummary[];
  methodCount: number;
  distinctPhysicalStateCount: number;
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
  | 'BEST_RESOLVED'
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
  expansionMode: 'REBUILT_EACH_ROUND';
  repeatedStatesExpanded: number;
  optimisticLowerBoundIterations: number;
  optimisticLowerBoundConverged: boolean;
  optimisticLowerBoundMethod: 'KNOWN_PARTIAL_GRAPH_WITH_ZERO_COST_UNKNOWN_SUCCESSORS';
  stageTimingMs: GenericSearchResult['stageTiming'] & { serializationMs: number };
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

function buildAcquisitionPortfolio(
  starts: StartingStateCandidate[],
  input: OptimizeCraftInput
): AcquisitionPortfolioCandidate[] {
  return starts.map((start, candidateIndex) => ({
    id: `candidate_${candidateIndex}`,
    label: start.label,
    physicalState: normalizeItemState(start.state),
    methods: start.acquisitions.map((method, methodIndex): AcquisitionMethodDefinition => ({
      id: `${method.type}_${methodIndex}`,
      label: method.type === 'self-fracture'
        ? `Approximate self-fracture: ${start.label}`
        : `${method.type}: ${start.label}`,
      acquisitionCostChaos: method.costChaos,
      confidence: methodConfidence(start, methodIndex, input),
      provenance: method.type === 'market'
        ? 'user-supplied fractured-base market price'
        : method.type === 'clean-base' && input.prices?.cleanBaseCostChaos !== undefined
          ? input.prices.cleanBasePriceProvenance ??
            (input.prices.cleanBasePriceSource === 'market'
              ? 'league trade snapshot clean-base quote'
              : 'user-supplied clean-base price')
          : method.type === 'self-fracture'
            ? 'Approximate self-fracture acquisition estimate; preparation is a research model, not an executable solver route'
            : `${method.type} research estimate`,
    })),
  }));
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

  constructor(repo: ClusterModRepository) {
    this.repo = repo;
  }

  optimize(input: OptimizeCraftInput): OptimizeCraftResult {
    const validation = validateOptimizeCraftInput(this.repo, input);
    if (!validation.valid) throw new OptimizerInputValidationError(validation.errors);
    input = validation.normalizedInput;
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
        marketFracturedPricesChaos: input.prices?.marketFracturedPricesChaos,
      },
      input.passiveCount
    );
    const portfolio = buildAcquisitionPortfolio(starts, input);
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
    const runtimeBudget = getSearchRuntimeBudget(input.searchBudget?.maxWallTimeMs);
    const result = new GenericSearchEngine(
      { pool, priceBook },
      input.target,
      {
        acquisitionPortfolio: portfolio,
        includeHarvest: harvestTags.length > 0,
        harvestTags,
        prioritizeTargetProgress: true,
        allowResearchFallbackPrices: input.allowResearchFallbackPrices ?? true,
        maxStates: input.searchBudget?.maxStates ?? 5000,
        maxWallTimeMs: runtimeBudget.engineDeadlineMs,
        maxExpansionRounds: input.searchBudget?.maxExpansionRounds ?? 3,
        searchIntent: input.searchIntent ?? 'RECOMMEND',
      }
    ).search(startState);

    const acquisitionDecision = [...result.policyMap.values()].find(
      (decision) => decision.state.flags?.acquisitionMenu === true
    );
    const acquisitionRoutes = (acquisitionDecision?.candidateQValues ?? [])
      .filter((candidate) => candidate.actionId.startsWith('acquire_'))
      .map(routeSummary)
      .sort((left, right) =>
        (left.expectedTotalCostChaos ?? Infinity) - (right.expectedTotalCostChaos ?? Infinity)
      );
    const selectedPolicyCertified =
      result.optimalityProof.selectedPolicyStatus ===
      'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED';
    const recommended = selectedPolicyCertified
      ? acquisitionRoutes.find(
          (route) =>
            route.actionId === acquisitionDecision?.bestActionId &&
            route.status === 'RESOLVED' &&
            route.expectedTotalCostChaos !== null
        ) ?? null
      : null;
    const selectedParts = recommended ? portfolioActionParts(recommended.actionId) : {};

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
      result.optimalityProof.globalOptimality === 'NOT YET PROVEN'
        ? 'GLOBAL OPTIMALITY: NOT YET PROVEN'
        : undefined,
      result.optimalityProof.unresolvedCandidatesCouldBeatIncumbent
        ? 'UNRESOLVED COMPETITORS MAY BE CHEAPER'
        : undefined,
      result.searchSummary.budgetExhausted
        ? 'Search budget exhausted before every competitive candidate was resolved or bounded.'
        : undefined,
      recommended === null ? 'No fully resolved acquisition route was found within this search budget.' : undefined,
    ].filter((warning): warning is string => warning !== undefined);

    const recommendationStatus: RecommendationStatus = recommended === null
      ? 'NO_RESOLVED_ROUTE'
      : result.optimalityProof.modeledActionOptimalityProven
        ? 'PROVEN_OPTIMAL'
        : 'BEST_RESOLVED';
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
        candidates: portfolio.map((candidate) => ({
          id: candidate.id,
          label: candidate.label,
          physicalStateSignature: getPhysicalStateSignature(candidate.physicalState),
          methods: candidate.methods.map((method) => ({
            id: method.id,
            label: method.label,
            costChaos: method.acquisitionCostChaos,
            confidence: method.confidence,
            provenance: method.provenance,
            approximate: method.confidence !== 'known' && method.id.startsWith('self-fracture_'),
          })),
        })),
        methodCount: portfolio.reduce((sum, candidate) => sum + candidate.methods.length, 0),
        distinctPhysicalStateCount: new Set(
          portfolio.map((candidate) => getPhysicalStateSignature(candidate.physicalState))
        ).size,
      },
      expectedCostChaos,
      expectedSaleValueChaos: input.expectedSaleValueChaos,
      expectedProfitChaos,
      risk: {
        onPolicyReachableStates: result.onPolicyGraph.onPolicyReachableStates,
        onPolicyTerminalStates: result.onPolicyGraph.onPolicyTerminalStates,
        terminalAbsorptionProbability: result.onPolicyGraph.terminalAbsorptionProbability,
        selectedPolicyProper: result.onPolicyGraph.isProper,
        unresolvedOnPolicyProbability: result.onPolicyGraph.onPolicyUnresolvedProbabilityMass,
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
        globalOptimality: result.optimalityProof.globalOptimality,
        modeledActionOptimalityProven: result.optimalityProof.modeledActionOptimalityProven,
        unresolvedCompetitiveCandidates: result.optimalityProof.potentiallyCompetitiveUnresolvedCount,
        unresolvedCompetitorsMayBeCheaper: result.optimalityProof.unresolvedCandidatesCouldBeatIncumbent,
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
        bellmanIterations: result.convergence.iterations,
        bellmanConverged: result.convergence.converged,
        occupancyIterations: result.reconciliation.visitIterations,
        occupancyConverged: result.reconciliation.visitConverged,
        reconciliationDifferenceChaos: result.reconciliation.differenceChaos,
        costReconciled: result.reconciliation.isReconciled,
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
