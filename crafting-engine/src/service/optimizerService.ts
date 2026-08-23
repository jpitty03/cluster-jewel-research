import { ClusterModRepository } from '../data/loadClusterMods.ts';
import { ModPool } from '../domain/ModPool.ts';
import {
  PriceBook,
  type CurrencyRates,
  type PriceConfidence,
  type PriceSource,
} from '../domain/PriceBook.ts';
import type { BaseType, ItemState } from '../domain/ItemState.ts';
import { getPhysicalStateSignature, normalizeItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import { getAllTargetModRequirements, matchesModRequirement } from '../domain/TargetDefinition.ts';
import type {
  AcquisitionMethodDefinition,
  AcquisitionPortfolioCandidate,
  MechanicsConfidence,
} from '../rules/actionRegistry.ts';
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

export interface OptimizeCraftPriceContext {
  currencyRates?: Partial<CurrencyRates>;
  cleanBaseCostChaos?: number;
  marketFracturedPricesChaos?: Record<string, number>;
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
  expectedSaleValueChaos?: number;
}

export interface SerializableCandidateQValue {
  actionId: string;
  actionName: string;
  immediateCostChaos: number;
  continuationCostChaos: number | null;
  totalCostChaos: number | null;
  lowerBoundChaos: number;
  status: ActionResolutionStatus;
  couldBeatResolvedIncumbent: boolean;
}

export interface PolicyRule {
  state: string;
  selectedAction: string;
  totalCostChaos: number | null;
  candidates: SerializableCandidateQValue[];
}

export interface RouteSummary {
  actionId: string;
  name: string;
  acquisitionCandidateId?: string;
  acquisitionMethodId?: string;
  expectedTotalCostChaos: number | null;
  lowerBoundChaos: number;
  status: ActionResolutionStatus;
  couldBeatResolvedIncumbent: boolean;
}

export interface AcquisitionMethodSummary {
  id: string;
  label: string;
  costChaos: number;
  confidence: PriceConfidence;
  provenance: string;
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
  gameMechanicsFidelity: 'PARTIAL';
  evidence: Array<{
    actionId: string;
    actionName: string;
    confidence: MechanicsConfidence;
    provenance?: string;
    onPolicySelections: number;
  }>;
  warnings: string[];
}

export interface OptimizationProofSummary {
  selectedPolicyStatus: GenericSearchResult['optimalityProof']['selectedPolicyStatus'];
  proofLevel: GenericSearchResult['optimalityProof']['proofLevel'];
  globalOptimality: GenericSearchResult['optimalityProof']['globalOptimality'];
  modeledActionOptimalityProven: boolean;
  unresolvedCompetitiveCandidates: number;
  unresolvedCompetitorsMayBeCheaper: boolean;
}

export interface OptimizationSearchSummary {
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
}

export interface OptimizeCraftResult {
  recommended: RouteSummary | null;
  alternatives: RouteSummary[];
  expectedCurrencies: Record<string, number | null>;
  policyRules: PolicyRule[];
  acquisition: AcquisitionSummary;
  expectedCostChaos: number | null;
  expectedSaleValueChaos?: number;
  expectedProfitChaos?: number | null;
  risk: {
    terminalAbsorptionProbability: number;
    selectedPolicyProper: boolean;
    unresolvedOnPolicyProbability: number;
  };
  priceConfidence: PriceConfidenceSummary;
  mechanicsConfidence: MechanicsConfidenceSummary;
  proof: OptimizationProofSummary;
  search: OptimizationSearchSummary;
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
      label: `${method.type}: ${start.label}`,
      acquisitionCostChaos: method.costChaos,
      confidence: methodConfidence(start, methodIndex, input),
      provenance: method.type === 'market'
        ? 'user-supplied fractured-base market price'
        : method.type === 'clean-base' && input.prices?.cleanBaseCostChaos !== undefined
          ? 'user-supplied clean-base price'
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
    status: candidate.status,
    couldBeatResolvedIncumbent: candidate.couldBeatResolvedIncumbent,
  };
}

/** Serializable optimizer boundary intended for the thin Developer UI. */
export class OptimizerService {
  private readonly repo: ClusterModRepository;

  constructor(repo = new ClusterModRepository()) {
    this.repo = repo;
  }

  optimize(input: OptimizeCraftInput): OptimizeCraftResult {
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
    const startState = virtualAcquisitionState(input);
    const result = new GenericSearchEngine(
      { pool, priceBook },
      input.target,
      {
        acquisitionPortfolio: portfolio,
        includeHarvest: harvestTags.length > 0,
        harvestTags,
        prioritizeTargetProgress: true,
        maxStates: input.searchBudget?.maxStates ?? 5000,
        maxWallTimeMs: input.searchBudget?.maxWallTimeMs ?? 30_000,
        maxExpansionRounds: input.searchBudget?.maxExpansionRounds ?? 3,
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

    const policyRules: PolicyRule[] = result.steps.map((step) => ({
      state: step.stateDescription,
      selectedAction: step.selectedAction,
      totalCostChaos: finiteOrNull(step.totalQValueChaos),
      candidates: step.candidateQValues.map(serializeCandidate),
    }));
    const portfolioPriceWarnings = portfolio
      .flatMap((candidate) => candidate.methods)
      .filter((method) => method.confidence !== 'known')
      .map((method) =>
        `${method.label}: ${method.acquisitionCostChaos.toFixed(3)}c uses ${method.confidence} pricing (${method.provenance})`
      );
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

    const output: OptimizeCraftResult = {
      recommended,
      alternatives: acquisitionRoutes.filter((route) => route.actionId !== recommended?.actionId),
      expectedCurrencies: Object.fromEntries(
        Object.entries(result.expectedCurrencies).map(([currency, amount]) => [currency, finiteOrNull(amount)])
      ),
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
        terminalAbsorptionProbability: result.onPolicyGraph.terminalAbsorptionProbability,
        selectedPolicyProper: result.onPolicyGraph.isProper,
        unresolvedOnPolicyProbability: result.onPolicyGraph.onPolicyUnresolvedProbabilityMass,
      },
      priceConfidence: {
        complete: result.priceConfidence.complete,
        evidence: result.priceConfidence.evidence.map((evidence) => ({ ...evidence })),
        warnings: [...new Set([...result.priceConfidence.warnings, ...portfolioPriceWarnings])],
      },
      mechanicsConfidence: {
        gameMechanicsFidelity: 'PARTIAL',
        evidence: result.mechanicsConfidence.evidence.map((evidence) => ({ ...evidence })),
        warnings: [...result.mechanicsConfidence.warnings],
      },
      proof: {
        selectedPolicyStatus: result.optimalityProof.selectedPolicyStatus,
        proofLevel: result.optimalityProof.proofLevel,
        globalOptimality: result.optimalityProof.globalOptimality,
        modeledActionOptimalityProven: result.optimalityProof.modeledActionOptimalityProven,
        unresolvedCompetitiveCandidates: result.optimalityProof.potentiallyCompetitiveUnresolvedCount,
        unresolvedCompetitorsMayBeCheaper: result.optimalityProof.unresolvedCandidatesCouldBeatIncumbent,
      },
      search: { ...result.searchSummary },
      warnings: [...new Set([
        ...proofWarnings,
        ...result.priceConfidence.warnings,
        ...portfolioPriceWarnings,
        ...result.mechanicsConfidence.warnings,
      ])],
    };

    // This assertion belongs at the boundary: an accidental Map/Infinity must
    // never become a frontend integration surprise.
    JSON.stringify(output);
    return output;
  }
}

export const optimizerService = new OptimizerService();
