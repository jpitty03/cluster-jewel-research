import type { ItemState } from '../domain/ItemState.ts';
import {
  cloneItemState,
  isFracturedMod,
  normalizeItemState,
} from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { SolverContext } from '../domain/CraftAction.ts';
import type { PriceConfidence, PriceSource } from '../domain/PriceBook.ts';
import type { RandomSource } from '../probability/random.ts';
import {
  getAllTargetModRequirements,
  matchesModRequirement,
  satisfiesTarget,
} from '../domain/TargetDefinition.ts';
import {
  CRAFT_MECHANICS,
  createAcquisitionPortfolioMechanics,
  createHarvestReforgeMechanics,
  createRestartReacquireMechanic,
  TransitionGenerationDeadlineExceeded,
  type AcquisitionPortfolioCandidate,
  type CraftMechanic,
  type CraftCost,
  type MechanicsConfidence,
  type RestartReacquireDefinition,
  type TransitionDistribution,
} from '../rules/actionRegistry.ts';
import { getCanonicalStateKey } from '../rules/actionDiscovery.ts';
import type { SearchIntent } from '../service/searchRuntime.ts';
import {
  deriveMinimumFeasibleRarity,
  type MinimumFeasibleRarityResult,
} from './targetFeasibility.ts';

/**
 * Adapter bridging the authoritative CraftMechanic registry into the solver action interface.
 * Preserves the single source of truth for legality, cost, analytical transitions, and sampling.
 */
export class SolverCraftActionAdapter {
  public id: string;
  public name: string;
  public mechanic: CraftMechanic;
  private context: SolverContext;
  private target: TargetDefinition;
  private transitionCache = new Map<string, TransitionDistribution>();

  constructor(mechanic: CraftMechanic, context: SolverContext, target: TargetDefinition) {
    this.mechanic = mechanic;
    this.id = mechanic.id;
    this.name = mechanic.name;
    this.context = context;
    this.target = target;
  }

  applicable(state: ItemState): boolean {
    if (
      state.flags?.acquisitionMenu === true &&
      this.mechanic.actionType !== 'RESTART_REACQUIRE'
    ) {
      return false;
    }
    return this.mechanic.isLegal(state, this.target, this.context);
  }

  getCost(): CraftCost {
    return this.mechanic.getCost(this.context);
  }

  getTransitions(state: ItemState, deadlineMs?: number): TransitionDistribution | undefined {
    if (!this.mechanic.getTransitions) return undefined;
    const control = { deadlineMs };
    if (this.mechanic.id === 'alteration_orb') {
      const resetState = cloneItemState(state);
      resetState.prefixes = resetState.prefixes.filter(
        (mod) => isFracturedMod(state, mod)
      );
      resetState.suffixes = resetState.suffixes.filter(
        (mod) => isFracturedMod(state, mod)
      );
      const cacheKey = getCanonicalStateKey(resetState, this.target);
      const cached = this.transitionCache.get(cacheKey);
      if (cached) return cached;
      const distribution = this.mechanic.getTransitions(state, this.target, this.context, control);
      this.transitionCache.set(cacheKey, distribution);
      return distribution;
    }
    if (this.mechanic.actionType === 'HARVEST_REFORGE') {
      // A Harvest reforge removes every non-fractured explicit before rolling.
      // Cache by that post-removal physical input so a full-pool graph does not
      // regenerate the same large analytical distribution for every rare miss.
      const resetState = cloneItemState(state);
      resetState.rarity = 'rare';
      resetState.prefixes = resetState.prefixes.filter((mod) => isFracturedMod(state, mod));
      resetState.suffixes = resetState.suffixes.filter((mod) => isFracturedMod(state, mod));
      resetState.fracturedModIds = [...resetState.prefixes, ...resetState.suffixes]
        .filter((mod) => mod.isFractured)
        .map((mod) => mod.modId);
      const cacheKey = getCanonicalStateKey(resetState, this.target);
      const cached = this.transitionCache.get(cacheKey);
      if (cached) return cached;
      const distribution = this.mechanic.getTransitions(state, this.target, this.context, control);
      this.transitionCache.set(cacheKey, distribution);
      return distribution;
    }
    return this.mechanic.getTransitions(state, this.target, this.context, control);
  }

  sampleTransition(state: ItemState, rng: RandomSource): ItemState {
    if (!this.mechanic.sampleTransition) return state;
    return this.mechanic.sampleTransition(state, this.target, this.context, rng);
  }
}

export type ActionResolutionStatus = 'RESOLVED' | 'UNRESOLVED' | 'IMPROPER' | 'DOMINATED_BY_BOUND';

export interface CandidateActionQValue {
  actionId: string;
  actionName: string;
  immediateCostChaos: number;
  expectedContinuationChaos: number;
  totalQValueChaos: number;
  lowerBoundChaos: number;
  incumbentUpperBoundChaos: number;
  optimalityGapChaos: number;
  couldBeatResolvedIncumbent: boolean;
  status: ActionResolutionStatus;
  unresolvedTargetCount: number;
}

export interface StatePolicyDecision {
  stateKey: string;
  state: ItemState;
  bestActionId: string;
  bestActionName: string;
  optimalValueChaos: number;
  candidateQValues: CandidateActionQValue[];
}

export interface GenericSearchStep {
  stateDescription: string;
  legalActionsConsidered: string[];
  candidateQValues: CandidateActionQValue[];
  selectedAction: string;
  immediateCostChaos: number;
  continuationCostChaos: number;
  totalQValueChaos: number;
  reason: string;
}

export interface ActionStateAttribution {
  actionId: string;
  actionName: string;
  actionLocalUniqueSuccessorKeysProduced: number;
  newGlobalStatesFirstDiscovered: number;
  onPolicyStatesSelectingAction: number;
  unresolvedOutgoingEdges: number;
}

export interface GraphBuildResult {
  nodes: Map<string, CanonicalGraphNode>;
  maxStates: number;
  hitStateLimit: boolean;
  hitWallTimeLimit: boolean;
  queuedButUnexpandedStates: number;
  transitionsToUnexpandedStates: number;
  transitionProbabilityMassToUnexpandedStates: number;
  terminalStatesFound: number;
  stateCountsByRarity: Record<string, number>;
  stateCountsByAffixes: Record<string, number>;
  hasCycles: boolean;
  actionAttribution: Record<string, ActionStateAttribution>;
  /** Distinct states expanded by this round only. Equals `nodes.size` for a fresh graph. */
  statesExpandedThisRound: number;
  /** True when this round extended a retained graph instead of rebuilding it. */
  extendedPersistentGraph: boolean;
  /** Actual mechanic transition distributions generated during this graph-build call. */
  transitionDistributionsGeneratedThisRound: number;
  /** Retained nodes revisited only to materialize an edge deferred by an earlier round. */
  previouslyExpandedNodesRevisitedThisRound: number;
  timing: {
    transitionGenerationMs: number;
    graphAggregationAndSetupMs: number;
  };
}

export interface OnPolicyGraphResult {
  onPolicyReachableStates: number;
  onPolicyTerminalStates: number;
  onPolicyUnresolvedTransitions: number;
  onPolicyUnresolvedProbabilityMass: number;
  terminalAbsorptionProbability: number;
  absorptionIterations: number;
  absorptionMaxResidual: number;
  absorptionConverged: boolean;
  hasCycles: boolean;
  isProper: boolean;
  isFullyResolved: boolean;
}

export interface OptimalityProofResult {
  selectedPolicyStatus: 'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED' | 'NOT CERTIFIED';
  proofLevel: 'BEST FULLY RESOLVED POLICY FOUND' | 'OPTIMAL OVER MODELED ACTIONS: PROVEN' | 'NO FULLY RESOLVED POLICY FOUND';
  globalOptimality: 'PROVEN OVER MODELED ACTIONS' | 'NOT YET PROVEN';
  modeledActionOptimalityProven: boolean;
  candidateResolutionConverged: boolean;
  unresolvedCompetitorCount: number;
  potentiallyCompetitiveUnresolvedCount: number;
  unresolvedCandidatesCouldBeatIncumbent: boolean;
}

export interface PriceConfidenceResult {
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

export interface MechanicsConfidenceResult {
  evidence: Array<{
    actionId: string;
    actionName: string;
    confidence: MechanicsConfidence;
    provenance?: string;
    onPolicySelections: number;
  }>;
  warnings: string[];
}

export interface OnPolicyRuleResult {
  stateKey: string;
  state: ItemState;
  selectedActionId: string;
  selectedActionName: string;
  expectedVisits: number;
  totalCostChaos: number;
  candidateQValues: CandidateActionQValue[];
}

export interface ExpectedActionUsageResult {
  actionId: string;
  actionName: string;
  expectedCount: number;
  expectedCostChaos: number;
}

export interface ValueIterationConvergence {
  iterations: number;
  converged: boolean;
  finalMaxResidual: number;
  epsilon: number;
  maxIterations: number;
  /**
   * How many times an improper greedy policy (a closed class that can never reach a
   * terminal, whose exact cost is therefore +Infinity) was detected and eliminated
   * during the solve, and how many states that removed. Zero on any solve whose greedy
   * policy absorbs from the first check onwards.
   */
  improperPolicyEliminationPasses: number;
  improperPolicyStatesPinned: number;
}

export interface ExpectedCostReconciliation {
  sumExpectedActionCostChaos: number;
  reportedDownstreamEVChaos: number;
  differenceChaos: number;
  isReconciled: boolean;
  visitIterations: number;
  visitMaxResidual: number;
  visitConverged: boolean;
}

export interface GenericSearchResult {
  startingState: ItemState;
  target: TargetDefinition;
  totalExpectedCostChaos: number;
  expectedCurrencies: Record<string, number>;
  selectedRouteName: string;
  steps: GenericSearchStep[];
  policyMap: Map<string, StatePolicyDecision>;
  representativeAudits: StatePolicyDecision[];
  canonicalStatesVisited: number;
  graphBuild: GraphBuildResult;
  onPolicyGraph: OnPolicyGraphResult;
  convergence: ValueIterationConvergence;
  reconciliation: ExpectedCostReconciliation;
  optimalityProof: OptimalityProofResult;
  priceConfidence: PriceConfidenceResult;
  consideredPriceConfidence: PriceConfidenceResult;
  mechanicsConfidence: MechanicsConfidenceResult;
  onPolicyRules: OnPolicyRuleResult[];
  expectedActionUsage: ExpectedActionUsageResult[];
  searchSummary: SearchSummary;
  stageTiming: SearchStageTiming;
  isTargetSatisfied: boolean;
  /**
   * Unexpanded successor keys sitting on the tips of the currently most promising
   * partial route (AO-star style best-partial-solution frontier). Expanding these,
   * and only these, is what turns the incumbent route from optimistic into resolved.
   */
  optimisticResolutionFrontier: string[];
  explanation: string;
}

export interface SearchStageTiming {
  seedResultMs: number;
  transitionGenerationMs: number;
  graphAggregationAndSetupMs: number;
  bellmanMs: number;
  candidateClassificationAndTrustMs: number;
  absorptionMs: number;
  occupancyMs: number;
  competitiveFrontierCollectionMs: number;
  resultAssemblyMs: number;
  repeatedRoundWorkMs: number;
  unattributedOrInterruptedMs: number;
}

export interface SearchSummary {
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
  timeToFirstCompletedRoundMs?: number;
  timeToFirstCertifiedPolicyMs?: number;
  timeToFirstUsefulRecommendationMs?: number;
  expansionMode: 'REBUILT_EACH_ROUND' | 'PERSISTENT_EXTENDED';
  repeatedStatesExpanded: number;
  /** Minimal proof-honest seed graph work performed before staged rounds. */
  seedStatesExpanded: number;
  /** Newly expanded canonical states in each completed staged round. */
  newStatesByRound: number[];
  /** Previously expanded canonical states retained with their generated edges in each round. */
  retainedStatesReusedByRound: number[];
  /** Actual mechanic transition distributions generated across seed, probes, and main rounds. */
  transitionDistributionsGenerated: number;
  transitionDistributionsGeneratedByRound: number[];
  /** Retained nodes revisited to materialize deferred edges; they are not full state re-expansions. */
  previouslyExpandedNodesRevisited: number;
  previouslyExpandedNodesRevisitedByRound: number[];
  /** Work in separate bounded acquisition-feasibility graphs, not duplicate main-graph expansion. */
  acquisitionFeasibilityStatesExpanded: number;
  /** Canonical states expanded in a round whose proof solve was interrupted before it could return. */
  interruptedStatesExpanded: number;
  optimisticLowerBoundIterations: number;
  optimisticLowerBoundConverged: boolean;
  optimisticLowerBoundMethod: 'KNOWN_PARTIAL_GRAPH_WITH_ZERO_COST_UNKNOWN_SUCCESSORS';
  minimumFeasibleRarity: MinimumFeasibleRarityResult;
  acquisitionFeasibility: AcquisitionFeasibilitySummary;
  deepenProgress: DeepenProgressSummary;
}

export interface SearchProgressSnapshot {
  canonicalStates: number;
  acquisitionFeasibleUpperBounds: number;
  unresolvedAcquisitionCandidates: number;
  bestUnresolvedAcquisitionLowerBoundChaos?: number;
  incumbentUpperBoundChaos?: number;
  candidatesDominatedByBound: number;
  optimalityGapChaos?: number;
}

export interface DeepenProgressSummary {
  before: SearchProgressSnapshot;
  after: SearchProgressSnapshot;
  newCanonicalStates: number;
  newAcquisitionFeasibleUpperBounds: number;
  newlyDominatedByBound: number;
  meaningfulProgress: boolean;
  stoppedEarlyNoMeaningfulProgress: boolean;
  message?: string;
}

export interface AcquisitionFeasibilityAttempt {
  candidateId: string;
  label: string;
  stateKey: string;
  statesExpanded: number;
  elapsedMs: number;
  certified: boolean;
  interrupted: boolean;
  downstreamUpperBoundChaos?: number;
  totalUpperBoundChaos?: number;
}

export interface AcquisitionFeasibilitySummary {
  attemptedCandidates: number;
  certifiedCandidates: number;
  distinctPhysicalStates: number;
  fairStateBudgetPerCandidate: number;
  attempts: AcquisitionFeasibilityAttempt[];
}

export interface CanonicalGraphNode {
  key: string;
  state: ItemState;
  isTerminal: boolean;
  actions: Map<
    string,
    {
      action: SolverCraftActionAdapter;
      immediateCostChaos: number;
      cost: CraftCost;
      isDirectlyResolved: boolean;
      /**
       * True when this edge is a placeholder for an action whose transition
       * distribution was intentionally not generated in the round that first
       * expanded the node. Persistent extension uses this to top the edge up
       * later instead of rebuilding the whole graph.
       */
      deferred?: boolean;
      transitions: Array<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>;
    }
  >;
}

export interface GenericSearchOptions {
  allowResearchFallbackPrices?: boolean;
  maxStates?: number;
  maxIterations?: number;
  convergenceEpsilon?: number;
  restartReacquire?: RestartReacquireDefinition;
  acquisitionPortfolio?: AcquisitionPortfolioCandidate[];
  includeHarvest?: boolean;
  harvestTags?: string[];
  enabledActionIds?: string[];
  prioritizeTargetProgress?: boolean;
  maxMarkovIterations?: number;
  maxWallTimeMs?: number;
  maxExpansionRounds?: number;
  searchIntent?: SearchIntent;
  /** Internal staged-search control; expensive proof actions remain explicit unresolved candidates. */
  deferExpensiveProofActions?: boolean;
  /** Internal seed control; creates a minimal result without generating any successor distribution. */
  deferAllActions?: boolean;
  /**
   * Persistent graph extension within a single request. Rounds share one canonical
   * node map and one live frontier and only expand states that are genuinely new.
   * Defaults to true; set false to restore legacy rebuild-each-round behaviour for
   * before/after comparison.
   */
  persistentExpansion?: boolean;
  /** Internal feasibility control; prevents a physical-state probe from abandoning into another acquisition. */
  excludeAcquisitionActions?: boolean;
  /**
   * Integration-stage control for a one-candidate clean-only certification pass. The caller must
   * account for every omitted acquisition family with an independent sound bound before using it.
   */
  skipAcquisitionFeasibility?: boolean;
  /**
   * Optional correctness-scoped state quotient supplied by a specialized caller. Every state
   * sharing a returned key must have equivalent modeled action values after successor aggregation.
   * Normal product search uses the full canonical identity.
   */
  canonicalStateKey?: (state: ItemState, target: TargetDefinition) => string;
}

class StateExpansionQueue {
  private heap: Array<{ state: ItemState; priority: number; sequence: number }> = [];
  private sequence = 0;

  get length(): number {
    return this.heap.length;
  }

  push(state: ItemState, priority: number): void {
    const entry = { state, priority, sequence: this.sequence++ };
    this.heap.push(entry);
    let index = this.heap.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!this.precedes(entry, this.heap[parent])) break;
      this.heap[index] = this.heap[parent];
      index = parent;
    }
    this.heap[index] = entry;
  }

  shift(): ItemState | undefined {
    if (this.heap.length === 0) return undefined;
    const first = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        const right = left + 1;
        if (left >= this.heap.length) break;
        let child = left;
        if (right < this.heap.length && this.precedes(this.heap[right], this.heap[left])) child = right;
        if (this.precedes(last, this.heap[child])) break;
        this.heap[index] = this.heap[child];
        index = child;
      }
      this.heap[index] = last;
    }
    return first.state;
  }

  /**
   * Re-scores every still-queued state in place and re-heapifies.
   *
   * Persistent extension keeps one frontier alive across expansion rounds, but the
   * competitive-frontier set changes between rounds. Re-scoring the retained queue
   * lets a later round honour the new priorities without re-expanding anything that
   * is already in the graph. Original insertion sequence numbers are preserved so
   * equal-priority ties keep their deterministic FIFO order.
   */
  reprioritize(score: (state: ItemState) => number): void {
    for (const entry of this.heap) entry.priority = score(entry.state);
    for (let index = Math.floor(this.heap.length / 2) - 1; index >= 0; index--) {
      this.siftDown(index);
    }
  }

  private siftDown(start: number): void {
    const entry = this.heap[start];
    let index = start;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.heap.length) break;
      let child = left;
      if (right < this.heap.length && this.precedes(this.heap[right], this.heap[left])) child = right;
      if (this.precedes(entry, this.heap[child])) break;
      this.heap[index] = this.heap[child];
      index = child;
    }
    this.heap[index] = entry;
  }

  private precedes(
    left: { priority: number; sequence: number },
    right: { priority: number; sequence: number }
  ): boolean {
    return left.priority > right.priority || (left.priority === right.priority && left.sequence < right.sequence);
  }
}

/**
 * Retained expansion state for persistent graph extension inside a single request.
 *
 * Rounds share one canonical node map and one live frontier instead of rebuilding
 * from the start state every round. Everything that can change canonical identity
 * (base/ilvl/passives/flags, target and final-state constraints, fracture state,
 * mod-group exclusions, roll sensitivity) is already folded into the canonical state
 * key and into the engine instance itself, so a session is only ever valid for the
 * exact engine, start state and action scope that created it. Deferred actions are
 * the one round-varying dimension and are tracked per edge so they can be topped up
 * rather than silently reused in a stale form.
 */
export function createPersistentExpansionSession(): PersistentExpansionSession {
  return {
    startKey: '',
    excludedActionIdsKey: '',
    nodes: new Map(),
    queue: new StateExpansionQueue(),
    queuedKeys: new Set(),
    terminalStatesFound: 0,
    stateCountsByRarity: { normal: 0, magic: 0, rare: 0 },
    stateCountsByAffixes: {},
    actionAttribution: {},
    actionLocalSuccessorKeys: new Map(),
    deferredEdges: new Set(),
    statesExpandedThisRound: 0,
    statesExpandedTotal: 0,
    transitionGenerationMs: 0,
    transitionDistributionsGeneratedTotal: 0,
    previouslyExpandedNodesRevisitedTotal: 0,
  };
}

export interface PersistentExpansionSession {
  startKey: string;
  excludedActionIdsKey: string;
  nodes: Map<string, CanonicalGraphNode>;
  queue: StateExpansionQueue;
  queuedKeys: Set<string>;
  terminalStatesFound: number;
  stateCountsByRarity: Record<string, number>;
  stateCountsByAffixes: Record<string, number>;
  actionAttribution: Record<string, ActionStateAttribution>;
  actionLocalSuccessorKeys: Map<string, Set<string>>;
  /** Deferred-edge ids (state key and action id, NUL-joined) still holding a placeholder. */
  deferredEdges: Set<string>;
  /** Distinct states expanded by the most recent round only. */
  statesExpandedThisRound: number;
  /** Distinct states expanded across every round that used this session. */
  statesExpandedTotal: number;
  transitionGenerationMs: number;
  /** Mechanic distributions generated across completed graph builds in this session. */
  transitionDistributionsGeneratedTotal: number;
  /** Retained nodes revisited only to materialize deferred edges across this session. */
  previouslyExpandedNodesRevisitedTotal: number;
}

function directedGraphHasCycle(adjacency: Map<string, string[]>, deadlineMs?: number): boolean {
  let work = 0;
  const checkDeadline = (): void => {
    if ((work++ & 1023) === 0 && deadlineMs !== undefined && Date.now() >= deadlineMs) {
      throw new SearchRoundDeadlineExceeded();
    }
  };
  const indegree = new Map<string, number>();
  for (const key of adjacency.keys()) {
    checkDeadline();
    indegree.set(key, 0);
  }
  for (const targets of adjacency.values()) {
    for (const target of targets) {
      checkDeadline();
      if (indegree.has(target)) indegree.set(target, (indegree.get(target) ?? 0) + 1);
    }
  }
  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([key]) => key);
  let removed = 0;
  while (queue.length > 0) {
    checkDeadline();
    const key = queue.shift()!;
    removed++;
    for (const target of adjacency.get(key) ?? []) {
      checkDeadline();
      if (!indegree.has(target)) continue;
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  return removed !== indegree.size;
}

class SearchRoundDeadlineExceeded extends Error {
  constructor() {
    super('Search round exceeded its wall-time deadline');
    this.name = 'SearchRoundDeadlineExceeded';
  }
}

function emptyStageTiming(): SearchStageTiming {
  return {
    seedResultMs: 0,
    transitionGenerationMs: 0,
    graphAggregationAndSetupMs: 0,
    bellmanMs: 0,
    candidateClassificationAndTrustMs: 0,
    absorptionMs: 0,
    occupancyMs: 0,
    competitiveFrontierCollectionMs: 0,
    resultAssemblyMs: 0,
    repeatedRoundWorkMs: 0,
    unattributedOrInterruptedMs: 0,
  };
}

function addStageTiming(target: SearchStageTiming, source: SearchStageTiming): void {
  target.transitionGenerationMs += source.transitionGenerationMs;
  target.graphAggregationAndSetupMs += source.graphAggregationAndSetupMs;
  target.bellmanMs += source.bellmanMs;
  target.candidateClassificationAndTrustMs += source.candidateClassificationAndTrustMs;
  target.absorptionMs += source.absorptionMs;
  target.occupancyMs += source.occupancyMs;
  target.competitiveFrontierCollectionMs += source.competitiveFrontierCollectionMs;
  target.resultAssemblyMs += source.resultAssemblyMs;
}

interface LinearPolicySolveResult {
  values: Map<string, number>;
  iterations: number;
  residual: number;
  converged: boolean;
}

/**
 * Solves (I - P)x=b or (I - P^T)x=b for a fixed selected policy.
 * Transition arrays are shared aggressively by reset mechanics, so both matrix
 * products preserve that grouping rather than materializing a dense matrix.
 */
function solveSelectedPolicyLinearSystem(
  nodes: Map<string, CanonicalGraphNode>,
  policyMap: Map<string, StatePolicyDecision>,
  includedKeys: ReadonlySet<string>,
  rhsForKey: (key: string, action: CanonicalGraphNode['actions'] extends Map<string, infer T> ? T : never) => number,
  transpose = false,
  initialValues?: ReadonlyMap<string, number>,
  tolerance = 1e-9,
  maxIterations = 2000,
  deadlineMs?: number
): LinearPolicySolveResult {
  const keys = [...includedKeys];
  const indexByKey = new Map(keys.map((key, index) => [key, index]));
  const size = keys.length;
  if (size === 0) {
    return { values: new Map(), iterations: 0, residual: 0, converged: true };
  }
  const actions = keys.map((key) => {
    const node = nodes.get(key);
    const decision = policyMap.get(key);
    return node && decision ? node.actions.get(decision.bestActionId) : undefined;
  });
  if (actions.some((action) => action === undefined)) {
    return { values: new Map(), iterations: 0, residual: Infinity, converged: false };
  }

  const multiply = (input: Float64Array): Float64Array => {
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      throw new SearchRoundDeadlineExceeded();
    }
    const output = new Float64Array(input);
    if (!transpose) {
      const continuationByTransitions = new Map<
        NonNullable<(typeof actions)[number]>['transitions'],
        number
      >();
      for (let row = 0; row < size; row++) {
        const action = actions[row]!;
        let continuation = continuationByTransitions.get(action.transitions);
        if (continuation === undefined) {
          continuation = 0;
          for (const transition of action.transitions) {
            const targetIndex = indexByKey.get(transition.targetKey);
            if (targetIndex !== undefined) continuation += transition.probability * input[targetIndex];
          }
          continuationByTransitions.set(action.transitions, continuation);
        }
        output[row] -= continuation;
      }
      return output;
    }

    const sourceMassByTransitions = new Map<
      NonNullable<(typeof actions)[number]>['transitions'],
      number
    >();
    for (let row = 0; row < size; row++) {
      const transitions = actions[row]!.transitions;
      sourceMassByTransitions.set(
        transitions,
        (sourceMassByTransitions.get(transitions) ?? 0) + input[row]
      );
    }
    for (const [transitions, sourceMass] of sourceMassByTransitions) {
      for (const transition of transitions) {
        const targetIndex = indexByKey.get(transition.targetKey);
        if (targetIndex !== undefined) {
          output[targetIndex] -= transition.probability * sourceMass;
        }
      }
    }
    return output;
  };

  const dot = (left: Float64Array, right: Float64Array): number => {
    let result = 0;
    for (let index = 0; index < size; index++) result += left[index] * right[index];
    return result;
  };
  const maxAbs = (values: Float64Array): number => {
    let result = 0;
    for (const value of values) result = Math.max(result, Math.abs(value));
    return result;
  };

  const x = new Float64Array(size);
  const b = new Float64Array(size);
  for (let index = 0; index < size; index++) {
    if (initialValues?.has(keys[index])) x[index] = initialValues.get(keys[index])!;
    b[index] = rhsForKey(keys[index], actions[index]!);
  }
  const initialProduct = multiply(x);
  let residualVector = new Float64Array(size);
  for (let index = 0; index < size; index++) residualVector[index] = b[index] - initialProduct[index];
  const shadowResidual = new Float64Array(residualVector);
  let residual = maxAbs(residualVector);
  if (residual <= tolerance) {
    return {
      values: new Map(keys.map((key, index) => [key, x[index]])),
      iterations: 0,
      residual,
      converged: true,
    };
  }

  let rhoPrevious = 1;
  let alpha = 1;
  let omega = 1;
  let p: Float64Array<ArrayBufferLike> = new Float64Array(size);
  let v: Float64Array<ArrayBufferLike> = new Float64Array(size);
  let iterations = 0;
  for (; iterations < maxIterations; iterations++) {
    if ((iterations & 15) === 0 && deadlineMs !== undefined && Date.now() >= deadlineMs) {
      throw new SearchRoundDeadlineExceeded();
    }
    const rho = dot(shadowResidual, residualVector);
    if (!Number.isFinite(rho) || Math.abs(rho) < 1e-30) break;
    const beta = (rho / rhoPrevious) * (alpha / omega);
    for (let index = 0; index < size; index++) {
      p[index] = residualVector[index] + beta * (p[index] - omega * v[index]);
    }
    v = multiply(p);
    const shadowDotV = dot(shadowResidual, v);
    if (!Number.isFinite(shadowDotV) || Math.abs(shadowDotV) < 1e-30) break;
    alpha = rho / shadowDotV;
    const s = new Float64Array(size);
    for (let index = 0; index < size; index++) s[index] = residualVector[index] - alpha * v[index];
    if (maxAbs(s) <= tolerance) {
      for (let index = 0; index < size; index++) x[index] += alpha * p[index];
      residualVector = s;
      iterations++;
      residual = maxAbs(residualVector);
      break;
    }
    const t = multiply(s);
    const tDotT = dot(t, t);
    if (!Number.isFinite(tDotT) || Math.abs(tDotT) < 1e-30) break;
    omega = dot(t, s) / tDotT;
    if (!Number.isFinite(omega) || Math.abs(omega) < 1e-30) break;
    for (let index = 0; index < size; index++) {
      x[index] += alpha * p[index] + omega * s[index];
      residualVector[index] = s[index] - omega * t[index];
    }
    residual = maxAbs(residualVector);
    if (residual <= tolerance) {
      iterations++;
      break;
    }
    rhoPrevious = rho;
  }

  let finalResidualVector = multiply(x);
  residual = 0;
  for (let index = 0; index < size; index++) {
    residual = Math.max(residual, Math.abs(b[index] - finalResidualVector[index]));
  }
  let converged = Number.isFinite(residual) && residual <= Math.max(tolerance * 10, 1e-8);

  // BiCGSTAB can break down on highly symmetric reset-policy matrices. A
  // small restarted GMRES fallback is robust for those same grouped products.
  if (!converged) {
    const restart = Math.min(40, size);
    const gmresLimit = Math.min(maxIterations, 800);
    const norm2 = (values: Float64Array): number => Math.sqrt(dot(values, values));
    let gmresIterations = 0;
    while (gmresIterations < gmresLimit) {
      if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
        throw new SearchRoundDeadlineExceeded();
      }
      finalResidualVector = multiply(x);
      const initialResidual = new Float64Array(size);
      for (let index = 0; index < size; index++) {
        initialResidual[index] = b[index] - finalResidualVector[index];
      }
      const betaNorm = norm2(initialResidual);
      if (betaNorm <= tolerance) break;
      const basis: Float64Array[] = [
        Float64Array.from(initialResidual, (value) => value / betaNorm),
      ];
      const h = Array.from({ length: restart + 1 }, () => new Float64Array(restart));
      const cosines = new Float64Array(restart);
      const sines = new Float64Array(restart);
      const g = new Float64Array(restart + 1);
      g[0] = betaNorm;
      let usedColumns = 0;

      for (let column = 0; column < restart && gmresIterations < gmresLimit; column++) {
        let w = multiply(basis[column]);
        for (let row = 0; row <= column; row++) {
          h[row][column] = dot(w, basis[row]);
          for (let index = 0; index < size; index++) {
            w[index] -= h[row][column] * basis[row][index];
          }
        }
        h[column + 1][column] = norm2(w);
        if (h[column + 1][column] > 1e-30) {
          basis.push(Float64Array.from(
            w,
            (value) => value / h[column + 1][column]
          ));
        } else {
          basis.push(new Float64Array(size));
        }
        for (let row = 0; row < column; row++) {
          const upper = h[row][column];
          const lower = h[row + 1][column];
          h[row][column] = cosines[row] * upper + sines[row] * lower;
          h[row + 1][column] = -sines[row] * upper + cosines[row] * lower;
        }
        const diagonal = h[column][column];
        const subdiagonal = h[column + 1][column];
        const rotationNorm = Math.hypot(diagonal, subdiagonal);
        cosines[column] = rotationNorm > 0 ? diagonal / rotationNorm : 1;
        sines[column] = rotationNorm > 0 ? subdiagonal / rotationNorm : 0;
        h[column][column] = cosines[column] * diagonal + sines[column] * subdiagonal;
        h[column + 1][column] = 0;
        const priorG = g[column];
        g[column] = cosines[column] * priorG;
        g[column + 1] = -sines[column] * priorG;
        usedColumns = column + 1;
        gmresIterations++;
        if (Math.abs(g[column + 1]) <= tolerance) break;
      }

      const y = new Float64Array(usedColumns);
      for (let row = usedColumns - 1; row >= 0; row--) {
        let value = g[row];
        for (let column = row + 1; column < usedColumns; column++) {
          value -= h[row][column] * y[column];
        }
        if (Math.abs(h[row][row]) < 1e-30) break;
        y[row] = value / h[row][row];
      }
      for (let column = 0; column < usedColumns; column++) {
        for (let index = 0; index < size; index++) {
          x[index] += y[column] * basis[column][index];
        }
      }
      finalResidualVector = multiply(x);
      residual = 0;
      for (let index = 0; index < size; index++) {
        residual = Math.max(residual, Math.abs(b[index] - finalResidualVector[index]));
      }
      if (residual <= Math.max(tolerance * 10, 1e-8)) {
        converged = true;
        break;
      }
      if (usedColumns === 0) break;
    }
    iterations += gmresIterations;
  }
  return {
    values: new Map(keys.map((key, index) => [key, x[index]])),
    iterations,
    residual,
    converged,
  };
}

/**
 * Generic Stochastic Shortest-Path / Bellman Value Iteration solver.
 * Evaluates candidate Q-values, on-policy vs full-graph reachability,
 * and exact expected-cost reconciliation.
 */
export class GenericSearchEngine {
  private context: SolverContext;
  private target: TargetDefinition;
  private adapters: SolverCraftActionAdapter[];
  private allowFallbackPrices: boolean;
  private defaultOptions: GenericSearchOptions;
  private minimumFeasibleRarity: MinimumFeasibleRarityResult;

  private stateKey(state: ItemState): string {
    return this.defaultOptions.canonicalStateKey?.(state, this.target) ??
      getCanonicalStateKey(state, this.target);
  }

  constructor(context: SolverContext, target: TargetDefinition, options: GenericSearchOptions = {}) {
    this.context = context;
    this.target = target;
    this.allowFallbackPrices = options.allowResearchFallbackPrices ?? true;
    this.defaultOptions = options;
    this.minimumFeasibleRarity = deriveMinimumFeasibleRarity(target, context.pool);

    const mechanics = [...CRAFT_MECHANICS];
    if (options.includeHarvest) {
      mechanics.push(...createHarvestReforgeMechanics(context, options.harvestTags));
    }
    if (options.acquisitionPortfolio) {
      mechanics.push(...createAcquisitionPortfolioMechanics(options.acquisitionPortfolio));
    }
    if (options.restartReacquire) {
      mechanics.push(createRestartReacquireMechanic(options.restartReacquire));
    }
    const enabledActionIds = options.enabledActionIds ? new Set(options.enabledActionIds) : undefined;

    // Only admit mechanically complete actions that possess executable getTransitions
    this.adapters = mechanics.filter((m) => {
      if (enabledActionIds && !enabledActionIds.has(m.id)) return false;
      if (typeof m.getTransitions !== 'function') return false;
      if (!this.allowFallbackPrices) {
        const cost = m.getCost(context);
        if (cost.confidence === 'research-fallback' || cost.confidence === 'unavailable') {
          return false;
        }
      }
      return true;
    }).map((m) => new SolverCraftActionAdapter(m, context, target));
  }

  private expansionPriority(
    state: ItemState,
    prioritizedStateKeys?: ReadonlySet<string>,
    searchIntent: SearchIntent = 'RECOMMEND',
    resolutionFrontierKeys?: ReadonlySet<string>
  ): number {
    const key = this.stateKey(state);
    // Completing the currently best partial route outranks widening the competitive
    // set, which in turn outranks generic target-progress scoring.
    const competitiveBonus = (resolutionFrontierKeys?.has(key) ? 4_000_000 : 0) +
      (prioritizedStateKeys?.has(key) ? 1_000_000 : 0);
    if (!this.defaultOptions.prioritizeTargetProgress) return competitiveBonus;
    const affixes = [...state.prefixes, ...state.suffixes];
    const requirements = getAllTargetModRequirements(this.target);
    let score: number;
    if (searchIntent === 'RECOMMEND' && this.minimumFeasibleRarity.rarity === 'magic') {
      score = state.rarity === 'magic' ? 20 : state.rarity === 'normal' ? 10 : 0;
    } else if (searchIntent === 'RECOMMEND' && this.minimumFeasibleRarity.rarity === 'normal') {
      score = state.rarity === 'normal' ? 20 : 0;
    } else {
      score = state.rarity === 'rare' ? 20 : state.rarity === 'magic' ? 10 : 0;
    }
    score += affixes.length;
    for (const requirement of requirements) {
      if (affixes.some((mod) => matchesModRequirement(mod, requirement))) {
        score += requirement.mustBeFractured ? 1000 : 100;
        continue;
      }
      if (requirement.mustBeFractured) {
        const unfracturedRequirement = { ...requirement, mustBeFractured: undefined };
        if (affixes.some((mod) => matchesModRequirement(mod, unfracturedRequirement))) {
          score += 300 + affixes.length * 20;
        }
      }
    }
    return score + competitiveBonus;
  }

  /**
   * Builds the reachable canonical state graph starting from startState.
   * Tracks exact graph-build completeness metadata, unexpanded states, and missing probability mass.
   */
  public buildGraph(
    startState: ItemState,
    maxStates = 5000,
    prioritizedStateKeys?: ReadonlySet<string>,
    deadlineMs?: number,
    deferredActionIds?: ReadonlySet<string>,
    searchIntent: SearchIntent = 'RECOMMEND',
    excludedActionIds?: ReadonlySet<string>,
    session?: PersistentExpansionSession,
    resolutionFrontierKeys?: ReadonlySet<string>
  ): GraphBuildResult {
    const graphBuildStarted = Date.now();
    let transitionGenerationMs = 0;
    const normalizedStartState = normalizeItemState(startState);
    const startKey = this.stateKey(normalizedStartState);
    const excludedActionIdsKey = excludedActionIds ? [...excludedActionIds].sort().join(',') : '';
    if (session !== undefined && session.startKey === '') {
      session.startKey = startKey;
      session.excludedActionIdsKey = excludedActionIdsKey;
    }
    if (
      session !== undefined &&
      (session.startKey !== startKey || session.excludedActionIdsKey !== excludedActionIdsKey)
    ) {
      // A session is only ever valid for the exact start state and action scope that
      // produced it. Refusing to reuse a mismatched session keeps canonical identity
      // authoritative instead of trading correctness for reuse.
      throw new Error('Persistent expansion session does not match the requested search scope.');
    }
    const nodes = session?.nodes ?? new Map<string, CanonicalGraphNode>();
    const queue = session?.queue ?? new StateExpansionQueue();
    const queuedKeys = session?.queuedKeys ?? new Set<string>();
    // AO-star frontier tips describe only the *currently known* boundary of the best
    // partial route. Expanding a tip does not end that route: the tip's own successors
    // become the new boundary of the same route. A frozen frontier set therefore acts
    // as a strict one-layer-per-round barrier, because the large frontier bonus makes
    // every stale tip outrank every freshly discovered deeper state regardless of how
    // promising it is. Letting frontier membership be inherited by successors lets a
    // single round drive the incumbent route all the way down to a terminal, and leaves
    // ordering *inside* that route to the target-progress score where it belongs.
    const liveResolutionFrontier = new Set<string>(resolutionFrontierKeys ?? []);
    if (session === undefined || !queuedKeys.has(startKey)) {
      queuedKeys.add(startKey);
      queue.push(normalizedStartState, this.expansionPriority(normalizedStartState, prioritizedStateKeys, searchIntent, liveResolutionFrontier));
    } else {
      // Retained frontier: re-score against this round's competitive set without
      // re-expanding anything already in the graph.
      queue.reprioritize((state) => this.expansionPriority(state, prioritizedStateKeys, searchIntent, liveResolutionFrontier));
    }

    let terminalStatesFound = session?.terminalStatesFound ?? 0;
    const stateCountsByRarity: Record<string, number> =
      session?.stateCountsByRarity ?? { normal: 0, magic: 0, rare: 0 };
    const stateCountsByAffixes: Record<string, number> = session?.stateCountsByAffixes ?? {};
    const actionAttribution: Record<string, ActionStateAttribution> = session?.actionAttribution ?? {};
    const actionLocalSuccessorKeys = session?.actionLocalSuccessorKeys ?? new Map<string, Set<string>>();
    const statesExpandedBefore = nodes.size;
    const aggregatedDistributionCache = new WeakMap<
      TransitionDistribution,
      Array<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>
    >();
    let transitionGenerationInterrupted = false;
    let transitionDistributionsGeneratedThisRound = 0;
    const previouslyExpandedNodesRevisited = new Set<string>();

    for (const adapter of this.adapters) {
      const existing = actionAttribution[adapter.id];
      if (existing === undefined) {
        actionAttribution[adapter.id] = {
          actionId: adapter.id,
          actionName: adapter.name,
          actionLocalUniqueSuccessorKeysProduced: 0,
          newGlobalStatesFirstDiscovered: 0,
          onPolicyStatesSelectingAction: 0,
          unresolvedOutgoingEdges: 0,
        };
      } else {
        // Discovery counters stay cumulative across a persistent session because they
        // describe work actually performed. Counters that are recomputed from scratch
        // over the whole graph every round must not accumulate.
        existing.onPolicyStatesSelectingAction = 0;
        existing.unresolvedOutgoingEdges = 0;
      }
      if (!actionLocalSuccessorKeys.has(adapter.id)) {
        actionLocalSuccessorKeys.set(adapter.id, new Set());
      }
    }

    /**
     * Generates one action edge on an already-created node. Returns false when
     * transition generation was interrupted by the cooperative deadline.
     */
    const materializeAction = (
      node: CanonicalGraphNode,
      curr: ItemState,
      key: string,
      adapter: SolverCraftActionAdapter
    ): boolean => {
      if (deferredActionIds?.has(adapter.id)) {
        const deferredKey = `__deferred_action__:${adapter.id}:${key}`;
        actionLocalSuccessorKeys.get(adapter.id)?.add(deferredKey);
        node.actions.set(adapter.id, {
          action: adapter,
          immediateCostChaos: adapter.getCost().costChaos,
          cost: adapter.getCost(),
          isDirectlyResolved: false,
          deferred: true,
          transitions: [{
            targetKey: deferredKey,
            probability: 1,
            nextState: curr,
            label: 'Deferred until DEEPEN/PROVE search intent',
          }],
        });
        session?.deferredEdges.add(`${key}\u0000${adapter.id}`);
        return true;
      }
      let dist: TransitionDistribution | undefined;
      const transitionStarted = Date.now();
      try {
        dist = adapter.getTransitions(curr, deadlineMs);
        transitionDistributionsGeneratedThisRound++;
      } catch (error) {
        if (error instanceof TransitionGenerationDeadlineExceeded) {
          transitionGenerationInterrupted = true;
          return false;
        }
        throw error;
      } finally {
        transitionGenerationMs += Date.now() - transitionStarted;
      }
      if (!dist || dist.outcomes.length === 0) return true;
      const cachedTransitions = aggregatedDistributionCache.get(dist);
      if (cachedTransitions) {
        node.actions.set(adapter.id, {
          action: adapter,
          immediateCostChaos: dist.immediateCostChaos,
          cost: adapter.getCost(),
          isDirectlyResolved: true,
          transitions: cachedTransitions,
        });
        return true;
      }
      const aggMap = new Map<string, { targetKey: string; probability: number; nextState: ItemState; label?: string }>();
      for (let outcomeIndex = 0; outcomeIndex < dist.outcomes.length; outcomeIndex++) {
        if (
          (outcomeIndex & 255) === 0 &&
          deadlineMs !== undefined &&
          Date.now() >= deadlineMs
        ) {
          transitionGenerationInterrupted = true;
          return false;
        }
        const out = dist.outcomes[outcomeIndex];
        // Zero-mass analytical entries are not graph edges. Keeping one
        // can poison continuation arithmetic through 0 * Infinity = NaN.
        if (!Number.isFinite(out.probability) || out.probability <= 0) continue;
        const outKey = this.stateKey(out.state);
        actionLocalSuccessorKeys.get(adapter.id)?.add(outKey);
        const existing = aggMap.get(outKey);
        if (existing) {
          existing.probability += out.probability;
        } else {
          aggMap.set(outKey, {
            targetKey: outKey,
            probability: out.probability,
            nextState: out.state,
            label: out.label,
          });
          if (!queuedKeys.has(outKey)) {
            queuedKeys.add(outKey);
            if (liveResolutionFrontier.has(key)) liveResolutionFrontier.add(outKey);
            queue.push(out.state, this.expansionPriority(out.state, prioritizedStateKeys, searchIntent, liveResolutionFrontier));
            if (actionAttribution[adapter.id]) {
              actionAttribution[adapter.id].newGlobalStatesFirstDiscovered++;
            }
          }
        }
      }

      const transitions = Array.from(aggMap.values());
      if (transitions.length === 0) return true;
      aggregatedDistributionCache.set(dist, transitions);
      node.actions.set(adapter.id, {
        action: adapter,
        immediateCostChaos: dist.immediateCostChaos,
        cost: adapter.getCost(),
        isDirectlyResolved: true,
        transitions,
      });
      return true;
    };

    // Persistent extension top-up: edges parked as deferred placeholders in an
    // earlier round are regenerated in place as soon as the round no longer defers
    // that action. Nodes without deferred edges are never revisited.
    if (session !== undefined && session.deferredEdges.size > 0) {
      for (const edgeId of [...session.deferredEdges]) {
        if (deadlineMs !== undefined && Date.now() >= deadlineMs) break;
        const separator = edgeId.indexOf('\u0000');
        const nodeKey = edgeId.slice(0, separator);
        const actionId = edgeId.slice(separator + 1);
        if (deferredActionIds?.has(actionId)) continue;
        const node = nodes.get(nodeKey);
        if (!node) {
          session.deferredEdges.delete(edgeId);
          continue;
        }
        const adapter = this.adapters.find((candidate) => candidate.id === actionId);
        if (!adapter || excludedActionIds?.has(actionId) || !adapter.applicable(node.state)) {
          session.deferredEdges.delete(edgeId);
          node.actions.delete(actionId);
          continue;
        }
        const placeholder = node.actions.get(actionId);
        previouslyExpandedNodesRevisited.add(nodeKey);
        node.actions.delete(actionId);
        session.deferredEdges.delete(edgeId);
        if (!materializeAction(node, node.state, nodeKey, adapter)) {
          // Interrupted mid-generation. Restore the placeholder rather than leaving a
          // node that silently looks as though the action does not exist at all.
          if (placeholder) {
            node.actions.set(actionId, placeholder);
            session.deferredEdges.add(edgeId);
          }
          break;
        }
      }
    }

    while (
      queue.length > 0 &&
      nodes.size < maxStates &&
      (deadlineMs === undefined || Date.now() < deadlineMs) &&
      !transitionGenerationInterrupted
    ) {
      const curr = queue.shift()!;
      const key = this.stateKey(curr);
      if (nodes.has(key)) continue;

      const isTerminal = satisfiesTarget(curr, this.target);
      if (isTerminal) terminalStatesFound++;

      stateCountsByRarity[curr.rarity] = (stateCountsByRarity[curr.rarity] ?? 0) + 1;
      const affixKey = `${curr.rarity.toUpperCase()}_${curr.prefixes.length}P_${curr.suffixes.length}S`;
      stateCountsByAffixes[affixKey] = (stateCountsByAffixes[affixKey] ?? 0) + 1;

      const node: CanonicalGraphNode = {
        key,
        state: curr,
        isTerminal,
        actions: new Map(),
      };

      let nodeInterrupted = false;
      if (!isTerminal) {
        for (const adapter of this.adapters) {
          if (excludedActionIds?.has(adapter.id)) continue;
          if (!adapter.applicable(curr)) continue;
          if (!materializeAction(node, curr, key, adapter)) {
            nodeInterrupted = true;
            break;
          }
        }
      }
      if (nodeInterrupted) {
        // Never commit a half-expanded node: a missing action is indistinguishable
        // from an illegal action downstream and would corrupt the policy proof.
        if (isTerminal) terminalStatesFound--;
        stateCountsByRarity[curr.rarity] -= 1;
        stateCountsByAffixes[affixKey] -= 1;
        for (const [actionId] of node.actions) {
          session?.deferredEdges.delete(`${key}\u0000${actionId}`);
        }
        // Keep the state on the retained frontier so a later round can expand it.
        queue.push(curr, this.expansionPriority(curr, prioritizedStateKeys, searchIntent, liveResolutionFrontier));
        break;
      }

      nodes.set(key, node);
    }

    const hitStateLimit = nodes.size >= maxStates && queue.length > 0;
    const hitWallTimeLimit = transitionGenerationInterrupted || (
      deadlineMs !== undefined && Date.now() >= deadlineMs && queue.length > 0
    );
    const queuedButUnexpandedStates = queue.length;

    let transitionsToUnexpandedStates = 0;
    let totalUnexpandedProbMass = 0;
    let totalTransitionsCount = 0;

    let graphFinalizationWork = 0;
    const assertGraphDeadline = (): void => {
      if (
        (graphFinalizationWork++ & 1023) === 0 &&
        deadlineMs !== undefined &&
        Date.now() >= deadlineMs
      ) {
        throw new SearchRoundDeadlineExceeded();
      }
    };
    for (const node of nodes.values()) {
      assertGraphDeadline();
      for (const [actId, act] of node.actions.entries()) {
        // Recomputed from scratch every round: persistent extension can expand the
        // missing successors of an edge that was unresolved in an earlier round, and
        // that edge must be allowed to become resolved again.
        let edgeResolved = act.deferred !== true;
        for (const t of act.transitions) {
          assertGraphDeadline();
          totalTransitionsCount++;
          if (!nodes.has(t.targetKey)) {
            edgeResolved = false;
            transitionsToUnexpandedStates++;
            totalUnexpandedProbMass += t.probability;
            if (actionAttribution[actId]) {
              actionAttribution[actId].unresolvedOutgoingEdges++;
            }
          }
        }
        act.isDirectlyResolved = edgeResolved;
      }
    }

    const transitionProbabilityMassToUnexpandedStates =
      totalTransitionsCount > 0 ? totalUnexpandedProbMass / totalTransitionsCount : 0;

    for (const [actionId, keys] of actionLocalSuccessorKeys) {
      if (actionAttribution[actionId]) {
        actionAttribution[actionId].actionLocalUniqueSuccessorKeysProduced = keys.size;
      }
    }

    const adjacency = new Map<string, string[]>();
    for (const [key, node] of nodes) {
      assertGraphDeadline();
      const targets: string[] = [];
      for (const action of node.actions.values()) {
        for (const transition of action.transitions) {
          assertGraphDeadline();
          if (nodes.has(transition.targetKey)) targets.push(transition.targetKey);
        }
      }
      adjacency.set(key, targets);
    }

    const statesExpandedThisRound = Math.max(0, nodes.size - statesExpandedBefore);
    if (session !== undefined) {
      session.terminalStatesFound = terminalStatesFound;
      session.statesExpandedThisRound = statesExpandedThisRound;
      session.statesExpandedTotal += statesExpandedThisRound;
      session.transitionGenerationMs += transitionGenerationMs;
      session.transitionDistributionsGeneratedTotal += transitionDistributionsGeneratedThisRound;
      session.previouslyExpandedNodesRevisitedTotal += previouslyExpandedNodesRevisited.size;
    }

    return {
      nodes,
      maxStates,
      hitStateLimit,
      hitWallTimeLimit,
      queuedButUnexpandedStates,
      transitionsToUnexpandedStates,
      transitionProbabilityMassToUnexpandedStates,
      terminalStatesFound,
      stateCountsByRarity,
      stateCountsByAffixes,
      hasCycles: directedGraphHasCycle(adjacency, deadlineMs),
      actionAttribution,
      statesExpandedThisRound,
      extendedPersistentGraph: session !== undefined && statesExpandedBefore > 0,
      transitionDistributionsGeneratedThisRound,
      previouslyExpandedNodesRevisitedThisRound: previouslyExpandedNodesRevisited.size,
      timing: {
        transitionGenerationMs,
        graphAggregationAndSetupMs: Math.max(
          0,
          Date.now() - graphBuildStarted - transitionGenerationMs
        ),
      },
    };
  }

  /**
   * Solves the Bellman value equations V(s) = min_a Q(s,a) over the reachable cyclic graph.
   */
  public search(startState: ItemState, options: GenericSearchOptions = {}): GenericSearchResult {
    const effectiveOptions = { ...this.defaultOptions, ...options };
    const intent = effectiveOptions.searchIntent ?? 'RECOMMEND';
    const maxStates = effectiveOptions.maxStates ?? 5000;
    const maxExpansionRounds = Math.max(1, effectiveOptions.maxExpansionRounds ?? 1);
    const startTime = Date.now();
    const deadlineMs = effectiveOptions.maxWallTimeMs === undefined
      ? undefined
      : startTime + Math.max(1, effectiveOptions.maxWallTimeMs);
    const statesPerRound = Math.max(1, Math.ceil(maxStates / maxExpansionRounds));
    const stagedRecommendationRounds = startState.flags?.acquisitionMenu === true
      ? Math.min(2, Math.max(1, maxExpansionRounds - 1))
      : 1;
    let roundStateBudget = Math.min(maxStates, statesPerRound);
    let prioritizedStateKeys = new Set<string>();
    const persistentExpansion = effectiveOptions.persistentExpansion !== false;
    const expansionSession = persistentExpansion ? createPersistentExpansionSession() : undefined;
    let resolutionFrontierKeys = new Set<string>();
    let cumulativeExpansionWork = 0;
    let transitionDistributionsGenerated = 0;
    let previouslyExpandedNodesRevisited = 0;
    let interruptedStatesExpanded = 0;
    let roundsExecuted = 0;
    const aggregateTiming = emptyStageTiming();
    const seedStarted = Date.now();
    // Establish a tiny bounded proof-honest result before the cooperative
    // deadline. This replaces the old unbounded post-deadline fallback.
    let result = this.searchOnce(
      startState,
      {
        ...effectiveOptions,
        maxStates: 1,
        maxExpansionRounds: 1,
        deferAllActions: true,
      },
      undefined,
      undefined,
      expansionSession,
      undefined
    );
    aggregateTiming.seedResultMs = Date.now() - seedStarted;
    addStageTiming(aggregateTiming, result.stageTiming);
    cumulativeExpansionWork += result.graphBuild.statesExpandedThisRound;
    transitionDistributionsGenerated += result.graphBuild.transitionDistributionsGeneratedThisRound;
    previouslyExpandedNodesRevisited += result.graphBuild.previouslyExpandedNodesRevisitedThisRound;
    const seedStatesExpanded = result.graphBuild.statesExpandedThisRound;
    let returnedProofGraphStates = result.graphBuild.nodes.size;
    const newStatesByRound: number[] = [];
    const retainedStatesReusedByRound: number[] = [];
    const transitionDistributionsGeneratedByRound: number[] = [];
    const previouslyExpandedNodesRevisitedByRound: number[] = [];
    let wallTimeInterrupted = false;
    let recommendationSatisfied = false;
    let certifiedRecommendationFound = false;
    let timeToFirstCompletedRoundMs: number | undefined;
    let timeToFirstCertifiedPolicyMs: number | undefined;
    let timeToFirstUsefulRecommendationMs: number | undefined;
    let priorCompletedRoundWorkMs = 0;
    let lastCompletedRoundWorkMs = 0;
    const acquisitionCandidates = effectiveOptions.acquisitionPortfolio ?? [];
    const fairStateBudgetPerCandidate = acquisitionCandidates.length > 0
      ? Math.max(1, Math.floor(maxStates / acquisitionCandidates.length))
      : 0;
    const acquisitionFeasibilityAttempts: AcquisitionFeasibilityAttempt[] = [];
    let firstRoundProgress: SearchProgressSnapshot | undefined;
    let previousRoundProgress: SearchProgressSnapshot | undefined;
    let finalRoundProgress: SearchProgressSnapshot | undefined;
    let stoppedEarlyNoMeaningfulProgress = false;

    const hasCertifiedPolicy = (candidateResult: GenericSearchResult): boolean =>
      candidateResult.optimalityProof.selectedPolicyStatus ===
      'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED';

    const hasAcquisitionSafeCertifiedPolicy = (candidateResult: GenericSearchResult): boolean => {
      if (!hasCertifiedPolicy(candidateResult)) return false;
      const startKey = this.stateKey(candidateResult.startingState);
      const startDecision = candidateResult.policyMap.get(startKey);
      if (!startDecision) return false;
      return !startDecision.candidateQValues.some(
        (candidate) =>
          candidate.actionId.startsWith('acquire_') &&
          candidate.actionId !== startDecision.bestActionId &&
          candidate.couldBeatResolvedIncumbent
      );
    };
    const progressSnapshot = (candidateResult: GenericSearchResult): SearchProgressSnapshot => {
      const startKey = this.stateKey(candidateResult.startingState);
      const acquisitionCandidatesAtStart = candidateResult.policyMap.get(startKey)?.candidateQValues
        .filter((candidate) => candidate.actionId.startsWith('acquire_')) ?? [];
      const resolved = acquisitionCandidatesAtStart.filter(
        (candidate) => candidate.status === 'RESOLVED' && Number.isFinite(candidate.totalQValueChaos)
      );
      const unresolved = acquisitionCandidatesAtStart.filter(
        (candidate) => candidate.status === 'UNRESOLVED' || candidate.couldBeatResolvedIncumbent
      );
      const incumbent = resolved.reduce(
        (minimum, candidate) => Math.min(minimum, candidate.totalQValueChaos),
        Infinity
      );
      const lowerBound = unresolved.reduce(
        (minimum, candidate) => Math.min(minimum, candidate.lowerBoundChaos),
        Infinity
      );
      const dominated = [...candidateResult.policyMap.values()].reduce(
        (sum, decision) => sum + decision.candidateQValues.filter(
          (candidate) => candidate.status === 'DOMINATED_BY_BOUND'
        ).length,
        0
      );
      return {
        canonicalStates: candidateResult.graphBuild.nodes.size,
        acquisitionFeasibleUpperBounds: resolved.length,
        unresolvedAcquisitionCandidates: unresolved.length,
        bestUnresolvedAcquisitionLowerBoundChaos: Number.isFinite(lowerBound) ? lowerBound : undefined,
        incumbentUpperBoundChaos: Number.isFinite(incumbent) ? incumbent : undefined,
        candidatesDominatedByBound: dominated,
        optimalityGapChaos: Number.isFinite(incumbent) && Number.isFinite(lowerBound)
          ? Math.max(0, incumbent - lowerBound)
          : undefined,
      };
    };
    const madeMeaningfulProgress = (
      before: SearchProgressSnapshot,
      after: SearchProgressSnapshot
    ): boolean =>
      after.canonicalStates > before.canonicalStates ||
      after.acquisitionFeasibleUpperBounds > before.acquisitionFeasibleUpperBounds ||
      after.unresolvedAcquisitionCandidates < before.unresolvedAcquisitionCandidates ||
      (after.bestUnresolvedAcquisitionLowerBoundChaos ?? -Infinity) >
        (before.bestUnresolvedAcquisitionLowerBoundChaos ?? -Infinity) + 1e-9 ||
      (after.incumbentUpperBoundChaos ?? Infinity) <
        (before.incumbentUpperBoundChaos ?? Infinity) - 1e-9 ||
      after.candidatesDominatedByBound > before.candidatesDominatedByBound;

    // Give every distinct physical acquisition a bounded feasibility attempt
    // before global proof competition. Certified on-policy states become the
    // first global expansion frontier; unresolved probes remain explicit.
    if (
      startState.flags?.acquisitionMenu === true &&
      acquisitionCandidates.length > 0 &&
      effectiveOptions.skipAcquisitionFeasibility !== true
    ) {
      const feasibilityDeadline = deadlineMs === undefined
        ? undefined
        : startTime + Math.max(1, Math.floor((deadlineMs - startTime) * 0.4));
      for (let candidateIndex = 0; candidateIndex < acquisitionCandidates.length; candidateIndex++) {
        if (feasibilityDeadline !== undefined && Date.now() >= feasibilityDeadline) break;
        const candidate = acquisitionCandidates[candidateIndex];
        const attemptStarted = Date.now();
        const attemptsRemaining = acquisitionCandidates.length - candidateIndex;
        const candidateDeadline = feasibilityDeadline === undefined
          ? undefined
          : Math.min(
              feasibilityDeadline,
              Date.now() + Math.max(1, Math.floor((feasibilityDeadline - Date.now()) / attemptsRemaining))
            );
        try {
          const feasibilityResult = this.searchOnce(
            candidate.physicalState,
            {
              ...effectiveOptions,
              maxStates: fairStateBudgetPerCandidate,
              maxExpansionRounds: 1,
              deferExpensiveProofActions: true,
              excludeAcquisitionActions: true,
            },
            undefined,
            candidateDeadline
          );
          cumulativeExpansionWork += feasibilityResult.graphBuild.nodes.size;
          transitionDistributionsGenerated +=
            feasibilityResult.graphBuild.transitionDistributionsGeneratedThisRound;
          previouslyExpandedNodesRevisited +=
            feasibilityResult.graphBuild.previouslyExpandedNodesRevisitedThisRound;
          addStageTiming(aggregateTiming, feasibilityResult.stageTiming);
          const certified = hasCertifiedPolicy(feasibilityResult);
          if (certified) {
            for (const rule of feasibilityResult.onPolicyRules) {
              prioritizedStateKeys.add(rule.stateKey);
            }
          }
          const downstreamUpperBound = certified && Number.isFinite(feasibilityResult.totalExpectedCostChaos)
            ? feasibilityResult.totalExpectedCostChaos
            : undefined;
          const minimumAcquisitionCost = candidate.methods.reduce(
            (minimum, method) => Math.min(minimum, method.acquisitionCostChaos),
            Infinity
          );
          acquisitionFeasibilityAttempts.push({
            candidateId: candidate.id,
            label: candidate.label,
            stateKey: this.stateKey(candidate.physicalState),
            statesExpanded: feasibilityResult.graphBuild.nodes.size,
            elapsedMs: Date.now() - attemptStarted,
            certified,
            interrupted: false,
            downstreamUpperBoundChaos: downstreamUpperBound,
            totalUpperBoundChaos: downstreamUpperBound === undefined || !Number.isFinite(minimumAcquisitionCost)
              ? undefined
              : downstreamUpperBound + minimumAcquisitionCost,
          });
        } catch (error) {
          if (!(error instanceof SearchRoundDeadlineExceeded)) throw error;
          acquisitionFeasibilityAttempts.push({
            candidateId: candidate.id,
            label: candidate.label,
            stateKey: this.stateKey(candidate.physicalState),
            statesExpanded: 0,
            elapsedMs: Date.now() - attemptStarted,
            certified: false,
            interrupted: true,
          });
        }
      }
    }

    for (let round = 0; round < maxExpansionRounds; round++) {
      if (deadlineMs !== undefined && Date.now() >= deadlineMs) break;
      if (
        intent === 'DEEPEN' &&
        roundsExecuted > 0 &&
        deadlineMs !== undefined &&
        lastCompletedRoundWorkMs > 0 &&
        Date.now() + Math.ceil(lastCompletedRoundWorkMs * 1.25) >= deadlineMs
      ) {
        // A deeper retained-graph round grows monotonically. Do not begin one when the latest
        // measured round no longer fits with a modest proof-assembly margin; returning the last
        // completed proof is more useful than spending the remainder on an interrupted graph.
        stoppedEarlyNoMeaningfulProgress = true;
        break;
      }
      let completedRound: GenericSearchResult;
      const roundStarted = Date.now();
      const deferredThisRound = !certifiedRecommendationFound &&
        (intent === 'RECOMMEND' || round < stagedRecommendationRounds);
      const roundDeadlineMs = deadlineMs;
      const sessionKeysBeforeRound = expansionSession
        ? new Set(expansionSession.nodes.keys())
        : undefined;
      const sessionStatesBeforeRound = expansionSession?.statesExpandedTotal ?? 0;
      const sessionDistributionsBeforeRound =
        expansionSession?.transitionDistributionsGeneratedTotal ?? 0;
      const sessionRevisitsBeforeRound =
        expansionSession?.previouslyExpandedNodesRevisitedTotal ?? 0;
      try {
        completedRound = this.searchOnce(
          startState,
          {
            ...effectiveOptions,
            maxStates: roundStateBudget,
            deferExpensiveProofActions: deferredThisRound,
          },
          prioritizedStateKeys,
          roundDeadlineMs,
          expansionSession,
          resolutionFrontierKeys
        );
      } catch (error) {
        if (error instanceof SearchRoundDeadlineExceeded) {
          // buildGraph may have completed and updated the retained session before a later proof
          // stage met the round deadline. Count that real work, but do not call it a completed
          // result round or imply that the prior returned policy was solved over those nodes.
          const interruptedNewStates = Math.max(
            0,
            (expansionSession?.statesExpandedTotal ?? 0) - sessionStatesBeforeRound
          );
          interruptedStatesExpanded += interruptedNewStates;
          cumulativeExpansionWork += interruptedNewStates;
          transitionDistributionsGenerated += Math.max(
            0,
            (expansionSession?.transitionDistributionsGeneratedTotal ?? 0) -
              sessionDistributionsBeforeRound
          );
          previouslyExpandedNodesRevisited += Math.max(
            0,
            (expansionSession?.previouslyExpandedNodesRevisitedTotal ?? 0) -
              sessionRevisitsBeforeRound
          );
          if (sessionKeysBeforeRound && expansionSession) {
            for (const key of expansionSession.nodes.keys()) {
              if (!sessionKeysBeforeRound.has(key)) expansionSession.nodes.delete(key);
            }
          }
          if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
            wallTimeInterrupted = true;
          } else if (intent === 'DEEPEN') {
            stoppedEarlyNoMeaningfulProgress = true;
          }
          break;
        }
        throw error;
      }
      result = completedRound;
      returnedProofGraphStates = result.graphBuild.nodes.size;
      roundsExecuted++;
      cumulativeExpansionWork += result.graphBuild.statesExpandedThisRound;
      transitionDistributionsGenerated += result.graphBuild.transitionDistributionsGeneratedThisRound;
      previouslyExpandedNodesRevisited +=
        result.graphBuild.previouslyExpandedNodesRevisitedThisRound;
      newStatesByRound.push(result.graphBuild.statesExpandedThisRound);
      retainedStatesReusedByRound.push(
        Math.max(0, result.graphBuild.nodes.size - result.graphBuild.statesExpandedThisRound)
      );
      transitionDistributionsGeneratedByRound.push(
        result.graphBuild.transitionDistributionsGeneratedThisRound
      );
      previouslyExpandedNodesRevisitedByRound.push(
        result.graphBuild.previouslyExpandedNodesRevisitedThisRound
      );
      const roundWorkMs = Date.now() - roundStarted;
      if (roundsExecuted > 1) priorCompletedRoundWorkMs += lastCompletedRoundWorkMs;
      lastCompletedRoundWorkMs = roundWorkMs;
      addStageTiming(aggregateTiming, result.stageTiming);
      timeToFirstCompletedRoundMs ??= Date.now() - startTime;
      const currentProgress = progressSnapshot(result);
      firstRoundProgress ??= currentProgress;
      finalRoundProgress = currentProgress;
      if (
        intent === 'DEEPEN' &&
        previousRoundProgress !== undefined &&
        !madeMeaningfulProgress(previousRoundProgress, currentProgress)
      ) {
        stoppedEarlyNoMeaningfulProgress = true;
        break;
      }
      previousRoundProgress = currentProgress;

      if (hasCertifiedPolicy(result)) {
        timeToFirstCertifiedPolicyMs ??= Date.now() - startTime;
      }

      const certifiedRecommendation = hasAcquisitionSafeCertifiedPolicy(result);
      if (certifiedRecommendation) {
        certifiedRecommendationFound = true;
        timeToFirstUsefulRecommendationMs ??= Date.now() - startTime;
        if (intent === 'RECOMMEND') {
          recommendationSatisfied = true;
          break;
        }
      }

      if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
        wallTimeInterrupted = true;
        break;
      }
      let competitiveKeys: Set<string>;
      const frontierStarted = Date.now();
      try {
        competitiveKeys = this.collectCompetitiveMissingStateKeys(result, deadlineMs);
      } catch (error) {
        if (error instanceof SearchRoundDeadlineExceeded) {
          wallTimeInterrupted = true;
          break;
        }
        throw error;
      } finally {
        aggregateTiming.competitiveFrontierCollectionMs += Date.now() - frontierStarted;
      }
      if (
        competitiveKeys.size === 0 ||
        !result.optimalityProof.unresolvedCandidatesCouldBeatIncumbent ||
        (!deferredThisRound && !result.graphBuild.hitStateLimit && !result.graphBuild.hitWallTimeLimit)
      ) {
        prioritizedStateKeys = competitiveKeys;
        resolutionFrontierKeys = new Set(result.optimisticResolutionFrontier);
        break;
      }
      prioritizedStateKeys = competitiveKeys;
      resolutionFrontierKeys = new Set(result.optimisticResolutionFrontier);
      if (roundStateBudget >= maxStates) break;
      roundStateBudget = Math.min(maxStates, roundStateBudget + statesPerRound);
    }

    const elapsedMs = Date.now() - startTime;
    const competitiveRemain = result.optimalityProof.unresolvedCandidatesCouldBeatIncumbent;
    const stateBudgetExhausted = !recommendationSatisfied && competitiveRemain && result.graphBuild.hitStateLimit && roundStateBudget >= maxStates;
    const wallTimeBudgetExhausted = competitiveRemain && (
      wallTimeInterrupted ||
      result.graphBuild.hitWallTimeLimit ||
      (effectiveOptions.maxWallTimeMs !== undefined && elapsedMs >= effectiveOptions.maxWallTimeMs)
    );
    const roundBudgetExhausted = !recommendationSatisfied && competitiveRemain && roundsExecuted >= maxExpansionRounds;
    aggregateTiming.repeatedRoundWorkMs = priorCompletedRoundWorkMs;
    const attributedMs = aggregateTiming.seedResultMs +
      aggregateTiming.transitionGenerationMs +
      aggregateTiming.graphAggregationAndSetupMs +
      aggregateTiming.bellmanMs +
      aggregateTiming.candidateClassificationAndTrustMs +
      aggregateTiming.absorptionMs +
      aggregateTiming.occupancyMs +
      aggregateTiming.competitiveFrontierCollectionMs +
      aggregateTiming.resultAssemblyMs;
    aggregateTiming.unattributedOrInterruptedMs = Math.max(0, elapsedMs - attributedMs);
    result.stageTiming = aggregateTiming;
    const fallbackProgress = progressSnapshot(result);
    const beforeProgress = firstRoundProgress ?? fallbackProgress;
    const afterProgress = finalRoundProgress ?? fallbackProgress;
    const meaningfulDeepenProgress = madeMeaningfulProgress(beforeProgress, afterProgress);
    result.searchSummary = {
      intent,
      // This is the canonical graph on which the returned policy/proof was actually solved.
      // Work from an interrupted later round is reported separately and remains in cumulative work.
      statesExpanded: returnedProofGraphStates,
      cumulativeExpansionWork,
      elapsedMs,
      expansionRounds: roundsExecuted,
      maxStates,
      maxWallTimeMs: effectiveOptions.maxWallTimeMs,
      maxExpansionRounds,
      prioritizedCompetitiveStateKeys: prioritizedStateKeys.size,
      stateBudgetExhausted,
      wallTimeBudgetExhausted,
      roundBudgetExhausted,
      budgetExhausted: stateBudgetExhausted || wallTimeBudgetExhausted || roundBudgetExhausted,
      returnedAtBudget: wallTimeBudgetExhausted,
      timeToFirstCompletedRoundMs,
      timeToFirstCertifiedPolicyMs,
      timeToFirstUsefulRecommendationMs,
      expansionMode: persistentExpansion ? 'PERSISTENT_EXTENDED' : 'REBUILT_EACH_ROUND',
      // Persistent sessions never fully expand a canonical node twice. Rebuilt searches report
      // the prior complete-graph work literally, excluding separate feasibility probes and
      // interrupted one-time nodes; retained-node edge top-ups remain exposed independently.
      repeatedStatesExpanded: persistentExpansion
        ? 0
        : Math.max(
            0,
            cumulativeExpansionWork -
              acquisitionFeasibilityAttempts.reduce(
                (sum, attempt) => sum + attempt.statesExpanded,
                0
              ) -
              interruptedStatesExpanded -
              returnedProofGraphStates
          ),
      seedStatesExpanded,
      newStatesByRound,
      retainedStatesReusedByRound,
      transitionDistributionsGenerated,
      transitionDistributionsGeneratedByRound,
      previouslyExpandedNodesRevisited,
      previouslyExpandedNodesRevisitedByRound,
      acquisitionFeasibilityStatesExpanded: acquisitionFeasibilityAttempts.reduce(
        (sum, attempt) => sum + attempt.statesExpanded,
        0
      ),
      interruptedStatesExpanded,
      optimisticLowerBoundIterations: result.searchSummary.optimisticLowerBoundIterations,
      optimisticLowerBoundConverged: result.searchSummary.optimisticLowerBoundConverged,
      optimisticLowerBoundMethod: 'KNOWN_PARTIAL_GRAPH_WITH_ZERO_COST_UNKNOWN_SUCCESSORS',
      minimumFeasibleRarity: this.minimumFeasibleRarity,
      acquisitionFeasibility: {
        attemptedCandidates: acquisitionFeasibilityAttempts.length,
        certifiedCandidates: acquisitionFeasibilityAttempts.filter((attempt) => attempt.certified).length,
        distinctPhysicalStates: acquisitionCandidates.length,
        fairStateBudgetPerCandidate,
        attempts: acquisitionFeasibilityAttempts,
      },
      deepenProgress: {
        before: beforeProgress,
        after: afterProgress,
        newCanonicalStates: Math.max(0, afterProgress.canonicalStates - beforeProgress.canonicalStates),
        newAcquisitionFeasibleUpperBounds: Math.max(
          0,
          afterProgress.acquisitionFeasibleUpperBounds - beforeProgress.acquisitionFeasibleUpperBounds
        ),
        newlyDominatedByBound: Math.max(
          0,
          afterProgress.candidatesDominatedByBound - beforeProgress.candidatesDominatedByBound
        ),
        meaningfulProgress: meaningfulDeepenProgress,
        stoppedEarlyNoMeaningfulProgress,
        message: stoppedEarlyNoMeaningfulProgress
          ? 'No meaningful additional progress in this deeper budget.'
          : undefined,
      },
    };
    return result;
  }

  private collectCompetitiveMissingStateKeys(
    result: GenericSearchResult,
    deadlineMs?: number
  ): Set<string> {
    const prioritized = new Set<string>();
    const nodes = result.graphBuild.nodes;
    const queue: Array<{ key: string; competitivePath: boolean }> = [{
      key: this.stateKey(result.startingState),
      competitivePath: false,
    }];
    const queuedOnPolicy = new Set([this.stateKey(result.startingState)]);
    const queuedCompetitive = new Set<string>();
    const inspectedOnPolicy = new Set<string>();
    const inspectedCompetitive = new Set<string>();
    const enqueue = (key: string, competitivePath: boolean): void => {
      const queued = competitivePath ? queuedCompetitive : queuedOnPolicy;
      if (queued.has(key)) return;
      queued.add(key);
      queue.push({ key, competitivePath });
    };

    for (let queueIndex = 0; queueIndex < queue.length; queueIndex++) {
      if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
        throw new SearchRoundDeadlineExceeded();
      }
      const { key, competitivePath } = queue[queueIndex];
      const inspected = competitivePath ? inspectedCompetitive : inspectedOnPolicy;
      if (inspected.has(key)) continue;
      inspected.add(key);
      if (competitivePath) prioritized.add(key);

      const node = nodes.get(key);
      const decision = result.policyMap.get(key);
      if (!node || !decision) continue;

      // Preserve the selected continuation leading to an unresolved descendant.
      const selected = node.actions.get(decision.bestActionId);
      for (const transition of selected?.transitions ?? []) {
        if (!nodes.has(transition.targetKey)) {
          if (competitivePath) prioritized.add(transition.targetKey);
        } else {
          enqueue(transition.targetKey, competitivePath);
        }
      }

      // Inspect competitive actions recursively even when this state is reached
      // only through an off-policy acquisition candidate. Queue ownership must
      // not hide a cheaper unresolved rolling family from later rounds.
      for (const candidate of decision.candidateQValues) {
        if (!candidate.couldBeatResolvedIncumbent) continue;
        const action = node.actions.get(candidate.actionId);
        if (!action) continue;
        for (let transitionIndex = 0; transitionIndex < action.transitions.length; transitionIndex++) {
          if (
            (transitionIndex & 255) === 0 &&
            deadlineMs !== undefined &&
            Date.now() >= deadlineMs
          ) {
            throw new SearchRoundDeadlineExceeded();
          }
          const transition = action.transitions[transitionIndex];
          prioritized.add(transition.targetKey);
          if (candidate.status === 'RESOLVED' && nodes.has(transition.targetKey)) {
            enqueue(transition.targetKey, true);
          }
        }
      }
    }
    return prioritized;
  }

  private searchOnce(
    startState: ItemState,
    options: GenericSearchOptions = {},
    prioritizedStateKeys?: ReadonlySet<string>,
    deadlineMs?: number,
    session?: PersistentExpansionSession,
    resolutionFrontierKeys?: ReadonlySet<string>
  ): GenericSearchResult {
    let absorptionMs = 0;
    const normalizedStartState = normalizeItemState(startState);
    const effectiveOptions = { ...this.defaultOptions, ...options };
    const maxIterations = effectiveOptions.maxIterations ?? 1000;
    const epsilon = effectiveOptions.convergenceEpsilon ?? 1e-5;
    const assertWithinDeadline = (): void => {
      if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
        throw new SearchRoundDeadlineExceeded();
      }
    };

    const deferredActionIds = effectiveOptions.deferAllActions === true
      ? new Set(this.adapters.map((adapter) => adapter.id))
      : effectiveOptions.deferExpensiveProofActions === true
        ? new Set(this.adapters
            .filter((adapter) =>
              adapter.mechanic.actionType === 'HARVEST_REFORGE' ||
              (
                adapter.id === 'regal_orb' &&
                this.minimumFeasibleRarity.rarity !== 'rare' &&
                !getAllTargetModRequirements(this.target).some(
                  (requirement) => requirement.mustBeFractured === true
                )
              )
            )
            .map((adapter) => adapter.id))
        : undefined;
    const graphResult = this.buildGraph(
      normalizedStartState,
      effectiveOptions.maxStates ?? 5000,
      prioritizedStateKeys,
      deadlineMs,
      deferredActionIds,
      effectiveOptions.searchIntent ?? 'RECOMMEND',
      effectiveOptions.excludeAcquisitionActions === true
        ? new Set(this.adapters
            .filter((adapter) => adapter.mechanic.actionType === 'RESTART_REACQUIRE')
            .map((adapter) => adapter.id))
        : undefined,
      session,
      resolutionFrontierKeys
    );
    if (deadlineMs !== undefined && Date.now() >= deadlineMs) {
      throw new SearchRoundDeadlineExceeded();
    }
    const nodes = graphResult.nodes;
    const startKey = this.stateKey(normalizedStartState);

    // Initialize Value Function V(s): terminal = 0, non-terminal = a small optimistic
    // seed, i.e. strictly from below.
    //
    // Stochastic shortest path with restart cycles must be solved from below. Seeding
    // non-terminals with +Infinity looks attractive - improper cycles stay pinned at
    // infinity - but value iteration from above converges to the GREATEST fixed point
    // of the Bellman operator, and V = +Infinity on every non-terminal is itself a
    // fixed point of exactly the shape self-fracture acquisition produces: the only
    // route to a terminal runs through a Fracturing Orb whose unwanted outcomes can
    // only recover by restarting on a fresh base, so every action at the staging state
    // keeps a successor valued at infinity and nothing ever becomes finite. Starting
    // below V* and rising is the only initialization that reaches the least fixed point
    // (the true expected cost) for this class of graph.
    //
    // The cost of converging from below is that a truncated run can report a cheap
    // finite value for an improper policy that never absorbs. That is handled where it
    // belongs - by the policy trust machinery (terminal absorption, proper/absorbing
    // certification and Bellman convergence reporting) - not by biasing the solve.
    const V = new Map<string, number>();
    for (const [key, node] of nodes.entries()) {
      V.set(key, node.isTerminal ? 0 : 20.0);
    }

    // --- Improper greedy policy detection --------------------------------------------
    //
    // Impropriety is a reachability property, not a numeric one: under a fixed policy a
    // state that cannot reach any terminal costs exactly +Infinity. Counting those states
    // is therefore an exact policy-evaluation fact and is cheap, whereas waiting for value
    // iteration to price the same cycle out costs one sweep per unit of cycle cost.
    //
    // Only states on-policy reachable from the start are considered, so a policy that
    // already absorbs reports zero and leaves the solve bit-for-bit unchanged.
    const countImproperOnPolicyStates = (): number => {
      const greedy = new Map<string, ReadonlyArray<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>>();
      for (const [key, node] of nodes.entries()) {
        if (node.isTerminal || node.actions.size === 0) continue;
        let bestQ = Infinity;
        let bestTransitions: ReadonlyArray<{ targetKey: string; probability: number; nextState: ItemState; label?: string }> | undefined;
        for (const actData of node.actions.values()) {
          if (!actData.isDirectlyResolved) continue;
          let expCont = 0;
          for (const t of actData.transitions) {
            expCont += t.probability * (V.get(t.targetKey) ?? Infinity);
          }
          const q = actData.immediateCostChaos + expCont;
          if (q < bestQ) {
            bestQ = q;
            bestTransitions = actData.transitions;
          }
        }
        if (bestTransitions !== undefined) greedy.set(key, bestTransitions);
      }

      // States able to reach a terminal under the greedy policy (least fixpoint).
      const predecessors = new Map<string, string[]>();
      for (const [key, transitions] of greedy.entries()) {
        for (const t of transitions) {
          const bucket = predecessors.get(t.targetKey);
          if (bucket) bucket.push(key);
          else predecessors.set(t.targetKey, [key]);
        }
      }
      const absorbing = new Set<string>();
      const backward: string[] = [];
      for (const [key, node] of nodes.entries()) {
        if (!node.isTerminal) continue;
        absorbing.add(key);
        backward.push(key);
      }
      while (backward.length > 0) {
        const key = backward.pop()!;
        for (const predecessor of predecessors.get(key) ?? []) {
          if (absorbing.has(predecessor)) continue;
          absorbing.add(predecessor);
          backward.push(predecessor);
        }
      }

      // On-policy reachable set from the start state.
      const onPolicy = new Set<string>([startKey]);
      const forward: string[] = [startKey];
      while (forward.length > 0) {
        const key = forward.pop()!;
        for (const t of greedy.get(key) ?? []) {
          if (onPolicy.has(t.targetKey) || !nodes.has(t.targetKey)) continue;
          onPolicy.add(t.targetKey);
          forward.push(t.targetKey);
        }
      }

      let improper = 0;
      for (const key of onPolicy) {
        const node = nodes.get(key);
        if (!node || node.isTerminal) continue;
        if (absorbing.has(key)) continue;
        improper++;
      }
      return improper;
    };

    // --- Escaping an improper policy by re-seeding from above -------------------------
    //
    // Value iteration from below only removes an improper cycle from contention once the
    // cycle has accumulated more cost than the real route, which takes one sweep per unit
    // of per-visit cost: a 0.11c alteration loop needs several thousand sweeps before a
    // ~1500c self-fracture route wins, and no truncated solve can pay that.
    //
    // Pinning the improper states at +Infinity is exact for the *current* policy but
    // useless as an initialization, because the real route recovers from an unwanted
    // fracture by restarting on a fresh base: pinning the clean base at infinity makes
    // every route through it infinite too, and the solve deadlocks on the greatest fixed
    // point. Re-seeding every non-terminal at a finite value *above* the answer avoids
    // both traps - the Bellman operator is monotone, so it descends geometrically at the
    // route's own failure rate instead of climbing linearly at the cycle's cost rate.
    //
    // The seed is derived, not hardcoded: it starts at the largest immediate action cost
    // the modeled mechanics actually charge (the Fracturing Orb price, in the fracture
    // case) and quadruples on every subsequent detection, so the search calibrates itself
    // to the answer's magnitude rather than assuming it.
    let improperEscapeSeedChaos = 0;
    for (const node of nodes.values()) {
      for (const actData of node.actions.values()) {
        if (actData.immediateCostChaos > improperEscapeSeedChaos) {
          improperEscapeSeedChaos = actData.immediateCostChaos;
        }
      }
    }
    if (!(improperEscapeSeedChaos > 0)) improperEscapeSeedChaos = 1;

    const reseedAboveForImproperPolicy = (): void => {
      for (const [key, node] of nodes.entries()) {
        V.set(key, node.isTerminal ? 0 : improperEscapeSeedChaos);
      }
      improperEscapeSeedChaos *= 4;
    };

    const IMPROPER_POLICY_CHECK_INTERVAL = 25;
    const IMPROPER_POLICY_DESCENT_BUDGET = 250;
    const MAX_IMPROPER_POLICY_ELIMINATION_PASSES = 12;
    let nextImproperPolicyCheck = IMPROPER_POLICY_CHECK_INTERVAL;
    let improperPolicyEliminationPasses = 0;
    let improperPolicyStatesPinned = 0;

    // Value Iteration Loop (solves stochastic shortest path with cycles)
    const bellmanStarted = Date.now();
    let iteration = 0;
    let maxDelta = 0;
    let valueIterationSweepExecuted = false;
    let valueIterationSweeps = 0;
    for (
      ;
      iteration < maxIterations && (deadlineMs === undefined || Date.now() < deadlineMs);
      iteration++
    ) {
      valueIterationSweepExecuted = true;
      valueIterationSweeps++;
      maxDelta = 0;
      const continuationValueCache = new Map<
        ReadonlyArray<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>,
        number
      >();

      for (const [key, node] of nodes.entries()) {
        if (node.isTerminal) {
          V.set(key, 0);
          continue;
        }

        if (node.actions.size === 0) {
          V.set(key, Infinity);
          continue;
        }

        let bestQ = Infinity;
        for (const actData of node.actions.values()) {
          if (!actData.isDirectlyResolved) continue;
          let expCont = continuationValueCache.get(actData.transitions);
          if (expCont === undefined) {
            expCont = 0;
            for (const t of actData.transitions) {
              const targetVal = V.get(t.targetKey) ?? Infinity;
              expCont += t.probability * targetVal;
            }
            continuationValueCache.set(actData.transitions, expCont);
          }
          const q = actData.immediateCostChaos + expCont;
          if (q < bestQ) {
            bestQ = q;
          }
        }

        const prevV = V.get(key) ?? Infinity;
        if (Number.isFinite(bestQ) && Number.isFinite(prevV)) {
          const delta = Math.abs(bestQ - prevV);
          if (delta > maxDelta) maxDelta = delta;
        } else if (Number.isFinite(bestQ) !== Number.isFinite(prevV)) {
          // A state that just became finite (or lost finiteness) is a real change and
          // must not be allowed to look like a converged sweep.
          maxDelta = Infinity;
        }
        V.set(key, bestQ);
      }

      const converging = maxDelta < epsilon;
      if (
        improperPolicyEliminationPasses < MAX_IMPROPER_POLICY_ELIMINATION_PASSES &&
        (converging || iteration + 1 >= nextImproperPolicyCheck)
      ) {
        const improper = countImproperOnPolicyStates();
        if (improper > 0) {
          improperPolicyEliminationPasses++;
          improperPolicyStatesPinned += improper;
          reseedAboveForImproperPolicy();
          // Give the descent room to finish before judging the policy again, otherwise a
          // mid-descent snapshot would escalate the seed for no reason.
          nextImproperPolicyCheck = iteration + 1 + IMPROPER_POLICY_DESCENT_BUDGET;
          maxDelta = Infinity;
          continue;
        }
        nextImproperPolicyCheck = iteration + 1 + IMPROPER_POLICY_CHECK_INTERVAL;
      }

      if (converging) {
        break;
      }
    }

    let valueIterationConverged =
      valueIterationSweepExecuted && maxDelta < epsilon && Number.isFinite(V.get(startKey));
    assertWithinDeadline();

    // Extract the selected policy and candidate Q-values with explicit resolution status.
    const policyMap = new Map<string, StatePolicyDecision>();
    const representativeAudits: StatePolicyDecision[] = [];
    const extractedContinuationCache = new Map<
      ReadonlyArray<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>,
      { expected: number; unresolvedCount: number }
    >();

    let extractedNodeCount = 0;
    for (const [key, node] of nodes.entries()) {
      if ((extractedNodeCount++ & 63) === 0) assertWithinDeadline();
      if (node.isTerminal) continue;

      const candidateQValues: CandidateActionQValue[] = [];
      let bestActionId = '';
      let bestActionName = '';
      let minQ = Infinity;

      for (const [actId, actData] of node.actions.entries()) {
        let continuation = extractedContinuationCache.get(actData.transitions);
        if (!continuation) {
          let expCont = 0;
          let unresolvedCount = 0;
          for (const t of actData.transitions) {
            if (nodes.has(t.targetKey)) {
              expCont += t.probability * (V.get(t.targetKey) ?? Infinity);
            } else {
              unresolvedCount++;
              expCont = Infinity;
            }
          }
          continuation = { expected: expCont, unresolvedCount };
          extractedContinuationCache.set(actData.transitions, continuation);
        }
        const expCont = continuation.expected;
        const unresolvedCount = continuation.unresolvedCount;

        const totalQ = actData.immediateCostChaos + expCont;
        const status: ActionResolutionStatus =
          unresolvedCount > 0 ? 'UNRESOLVED' : actData.transitions.length === 0 ? 'IMPROPER' : 'RESOLVED';

        candidateQValues.push({
          actionId: actId,
          actionName: actData.action.name,
          immediateCostChaos: actData.immediateCostChaos,
          expectedContinuationChaos: expCont,
          totalQValueChaos: totalQ,
          lowerBoundChaos: actData.immediateCostChaos,
          incumbentUpperBoundChaos: Infinity,
          optimalityGapChaos: Infinity,
          couldBeatResolvedIncumbent: false,
          status,
          unresolvedTargetCount: unresolvedCount,
        });

        if (totalQ < minQ) {
          minQ = totalQ;
          bestActionId = actId;
          bestActionName = actData.action.name;
        }
      }

      candidateQValues.sort((a, b) => a.totalQValueChaos - b.totalQValueChaos);

      const decision: StatePolicyDecision = {
        stateKey: key,
        state: node.state,
        bestActionId,
        bestActionName,
        optimalValueChaos: minQ,
        candidateQValues,
      };

      policyMap.set(key, decision);
    }

    // Low-probability cyclic policies converge painfully slowly under plain
    // Bellman sweeps. Evaluate and improve the selected policy with a grouped
    // sparse linear solve; unresolved actions remain excluded from selection
    // and continue to participate only through their admissible lower bounds.
    let linearPolicyStable = false;
    let linearPolicyIterations = 0;
    for (let policyPass = 0; policyPass < 20; policyPass++) {
      assertWithinDeadline();
      const includedKeys = new Set<string>();
      let selectedPolicyDirectlyClosed = true;
      for (const [key, node] of nodes) {
        if (node.isTerminal) continue;
        const decision = policyMap.get(key);
        const action = decision ? node.actions.get(decision.bestActionId) : undefined;
        if (
          !action ||
          !action.isDirectlyResolved ||
          action.transitions.some((transition) => !nodes.has(transition.targetKey))
        ) {
          selectedPolicyDirectlyClosed = false;
          break;
        }
        includedKeys.add(key);
      }
      if (!selectedPolicyDirectlyClosed) break;
      const solve = solveSelectedPolicyLinearSystem(
        nodes,
        policyMap,
        includedKeys,
        (_key, action) => action.immediateCostChaos,
        false,
        V,
        Math.min(epsilon, 1e-9),
        2000,
        deadlineMs
      );
      linearPolicyIterations += solve.iterations;
      if (!solve.converged) break;
      for (const [key, value] of solve.values) V.set(key, value);

      let policyChanged = false;
      for (const [key, decision] of policyMap) {
        const node = nodes.get(key)!;
        let bestActionId = '';
        let bestActionName = '';
        let bestQ = Infinity;
        for (const candidate of decision.candidateQValues) {
          const action = node.actions.get(candidate.actionId)!;
          if (!action.isDirectlyResolved) continue;
          let continuation = 0;
          for (const transition of action.transitions) {
            const targetValue = V.get(transition.targetKey);
            if (targetValue === undefined) {
              continuation = Infinity;
              break;
            }
            continuation += transition.probability * targetValue;
          }
          candidate.expectedContinuationChaos = continuation;
          candidate.totalQValueChaos = action.immediateCostChaos + continuation;
          if (candidate.totalQValueChaos < bestQ) {
            bestQ = candidate.totalQValueChaos;
            bestActionId = candidate.actionId;
            bestActionName = candidate.actionName;
          }
        }
        if (bestActionId && bestActionId !== decision.bestActionId) {
          decision.bestActionId = bestActionId;
          decision.bestActionName = bestActionName;
          policyChanged = true;
        }
        if (bestActionId) decision.optimalValueChaos = bestQ;
        decision.candidateQValues.sort((left, right) =>
          left.totalQValueChaos - right.totalQValueChaos
        );
      }
      maxDelta = solve.residual;
      if (!policyChanged) {
        linearPolicyStable = true;
        break;
      }
    }
    if (linearPolicyStable) {
      valueIterationConverged = Number.isFinite(V.get(startKey));
      valueIterationSweeps += linearPolicyIterations;
    }
    const bellmanMs = Date.now() - bellmanStarted;
    const candidateClassificationStarted = Date.now();

    const computePolicyTrust = (): {
      downstreamUnresolved: Map<string, boolean>;
      absorption: Map<string, number>;
      iterations: number;
      residual: number;
      converged: boolean;
    } => {
      const downstreamUnresolved = new Map<string, boolean>();
      const selectedParentsByTarget = new Map<string, Set<string>>();
      const unresolvedQueue: string[] = [];
      const directPolicyMissingCache = new Map<
        ReadonlyArray<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>,
        boolean
      >();
      let trustNodeCount = 0;
      for (const [key, node] of nodes) {
        if ((trustNodeCount++ & 63) === 0) assertWithinDeadline();
        if (node.isTerminal) {
          downstreamUnresolved.set(key, false);
          continue;
        }
        const decision = policyMap.get(key);
        const action = decision ? node.actions.get(decision.bestActionId) : undefined;
        let hasMissing = action ? directPolicyMissingCache.get(action.transitions) : undefined;
        if (action && hasMissing === undefined) {
          hasMissing = action.transitions.some((transition) => !nodes.has(transition.targetKey));
          directPolicyMissingCache.set(action.transitions, hasMissing);
        }
        downstreamUnresolved.set(
          key,
          !action || hasMissing === true
        );
        if (!action || hasMissing === true) {
          unresolvedQueue.push(key);
          continue;
        }
        for (const transition of action.transitions) {
          if (!nodes.has(transition.targetKey)) continue;
          const parents = selectedParentsByTarget.get(transition.targetKey) ?? new Set<string>();
          parents.add(key);
          selectedParentsByTarget.set(transition.targetKey, parents);
        }
      }
      for (let queueIndex = 0; queueIndex < unresolvedQueue.length; queueIndex++) {
        if ((queueIndex & 63) === 0) assertWithinDeadline();
        const unresolvedKey = unresolvedQueue[queueIndex];
        for (const parentKey of selectedParentsByTarget.get(unresolvedKey) ?? []) {
          if (downstreamUnresolved.get(parentKey)) continue;
          downstreamUnresolved.set(parentKey, true);
          unresolvedQueue.push(parentKey);
        }
      }

      const absorption = new Map<string, number>();
      for (const [key, node] of nodes) absorption.set(key, node.isTerminal ? 1 : 0);
      let absorptionIterations = 0;
      let absorptionSweeps = 0;
      let absorptionResidual = Infinity;
      const maxMarkovIterations = effectiveOptions.maxMarkovIterations ?? 5000;
      const absorptionStarted = Date.now();
      const canReachTerminal = new Set<string>();
      const reverseQueue = [...nodes.values()]
        .filter((node) => node.isTerminal)
        .map((node) => node.key);
      for (const key of reverseQueue) canReachTerminal.add(key);
      for (let queueIndex = 0; queueIndex < reverseQueue.length; queueIndex++) {
        const targetKey = reverseQueue[queueIndex];
        for (const parentKey of selectedParentsByTarget.get(targetKey) ?? []) {
          if (canReachTerminal.has(parentKey)) continue;
          canReachTerminal.add(parentKey);
          reverseQueue.push(parentKey);
        }
      }
      const linearKeys = new Set(
        [...nodes.entries()]
          .filter(([, node]) => !node.isTerminal)
          .map(([key]) => key)
          .filter((key) => canReachTerminal.has(key) && !downstreamUnresolved.get(key))
      );
      const linearAbsorption = solveSelectedPolicyLinearSystem(
        nodes,
        policyMap,
        linearKeys,
        (_key, action) => action.transitions.reduce(
          (sum, transition) => sum + (nodes.get(transition.targetKey)?.isTerminal ? transition.probability : 0),
          0
        ),
        false,
        undefined,
        1e-10,
        2000,
        deadlineMs
      );
      if (linearAbsorption.converged) {
        for (const [key, value] of linearAbsorption.values) {
          absorption.set(key, Math.max(0, Math.min(1, value)));
        }
        absorptionMs += Date.now() - absorptionStarted;
        return {
          downstreamUnresolved,
          absorption,
          iterations: linearAbsorption.iterations,
          residual: linearAbsorption.residual,
          converged: true,
        };
      }
      for (
        ;
        absorptionIterations < maxMarkovIterations &&
        (deadlineMs === undefined || Date.now() < deadlineMs);
        absorptionIterations++
      ) {
        absorptionSweeps++;
        absorptionResidual = 0;
        const next = new Map(absorption);
        const absorptionContinuationCache = new Map<
          ReadonlyArray<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>,
          number
        >();
        for (const [key, node] of nodes) {
          if (node.isTerminal) continue;
          const decision = policyMap.get(key);
          const action = decision ? node.actions.get(decision.bestActionId) : undefined;
          if (!action || downstreamUnresolved.get(key)) {
            next.set(key, 0);
            continue;
          }
          let probability = absorptionContinuationCache.get(action.transitions);
          if (probability === undefined) {
            probability = 0;
            for (const transition of action.transitions) {
              probability += transition.probability * (absorption.get(transition.targetKey) ?? 0);
            }
            absorptionContinuationCache.set(action.transitions, probability);
          }
          absorptionResidual = Math.max(absorptionResidual, Math.abs(probability - (absorption.get(key) ?? 0)));
          next.set(key, probability);
        }
        for (const [key, value] of next) absorption.set(key, value);
        if (absorptionResidual < 1e-10) break;
      }
      absorptionMs += Date.now() - absorptionStarted;
      return {
        downstreamUnresolved,
        absorption,
        iterations: absorptionSweeps,
        residual: absorptionResidual,
        converged: absorptionResidual < 1e-10,
      };
    };

    const classifyCandidates = (trust: ReturnType<typeof computePolicyTrust>): boolean => {
      let policyChanged = false;
      const directMissingCache = new Map<
        ReadonlyArray<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>,
        number
      >();
      const downstreamMissingCache = new Map<
        ReadonlyArray<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>,
        boolean
      >();
      for (const [key, decision] of policyMap) {
        const node = nodes.get(key)!;
        for (const candidate of decision.candidateQValues) {
          const action = node.actions.get(candidate.actionId)!;
          let directMissing = directMissingCache.get(action.transitions);
          if (directMissing === undefined) {
            directMissing = action.transitions.filter((transition) => !nodes.has(transition.targetKey)).length;
            directMissingCache.set(action.transitions, directMissing);
          }
          let downstreamMissing = downstreamMissingCache.get(action.transitions);
          if (downstreamMissing === undefined) {
            downstreamMissing = action.transitions.some(
              (transition) => nodes.has(transition.targetKey) && trust.downstreamUnresolved.get(transition.targetKey)
            );
            downstreamMissingCache.set(action.transitions, downstreamMissing);
          }
          candidate.unresolvedTargetCount = directMissing + (downstreamMissing ? 1 : 0);
          if (directMissing > 0 || downstreamMissing) {
            candidate.status = 'UNRESOLVED';
            continue;
          }
          const absorptionProbability = action.transitions.reduce(
            (sum, transition) => sum + transition.probability * (trust.absorption.get(transition.targetKey) ?? 0),
            0
          );
          candidate.status = absorptionProbability >= 1 - 1e-8 ? 'RESOLVED' : 'IMPROPER';
        }

        const resolvedCandidates = decision.candidateQValues.filter(
          (candidate) => candidate.status === 'RESOLVED' && Number.isFinite(candidate.totalQValueChaos)
        );
        const bestResolved = resolvedCandidates.sort((a, b) => a.totalQValueChaos - b.totalQValueChaos)[0];
        if (bestResolved && decision.bestActionId !== bestResolved.actionId) {
          decision.bestActionId = bestResolved.actionId;
          decision.bestActionName = bestResolved.actionName;
          decision.optimalValueChaos = bestResolved.totalQValueChaos;
          policyChanged = true;
        }
      }
      return policyChanged;
    };

    let policyTrust = computePolicyTrust();
    let candidateResolutionConverged = false;
    for (
      let pass = 0;
      pass < nodes.size && (deadlineMs === undefined || Date.now() < deadlineMs);
      pass++
    ) {
      const changed = classifyCandidates(policyTrust);
      if (!changed) {
        candidateResolutionConverged = true;
        break;
      }
      policyTrust = computePolicyTrust();
    }
    assertWithinDeadline();

    // Optimistic partial-graph value bounds. Missing successors are assigned
    // zero continuation cost, so every iterate is an admissible lower bound
    // when modeled action costs are non-negative. Monotone iteration can only
    // tighten that bound; stopping early cannot make it unsafe.
    const optimisticValues = new Map<string, number>();
    for (const [key, node] of nodes) optimisticValues.set(key, node.isTerminal ? 0 : 0);
    let optimisticLowerBoundIterations = 0;
    let optimisticLowerBoundResidual = Infinity;
    const maxLowerBoundIterations = Math.min(maxIterations, 500);
    for (let iteration = 0; iteration < maxLowerBoundIterations; iteration++) {
      if (deadlineMs !== undefined && Date.now() >= deadlineMs) break;
      optimisticLowerBoundIterations++;
      optimisticLowerBoundResidual = 0;
      const prior = new Map(optimisticValues);
      const continuationCache = new Map<
        ReadonlyArray<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>,
        number
      >();
      for (const [key, node] of nodes) {
        if (node.isTerminal) continue;
        let best = Infinity;
        for (const action of node.actions.values()) {
          let continuation = continuationCache.get(action.transitions);
          if (continuation === undefined) {
            continuation = 0;
            for (const transition of action.transitions) {
              continuation += transition.probability * (prior.get(transition.targetKey) ?? 0);
            }
            continuationCache.set(action.transitions, continuation);
          }
          best = Math.min(best, action.immediateCostChaos + continuation);
        }
        const previous = prior.get(key) ?? 0;
        const next = Number.isFinite(best) ? Math.max(previous, best) : previous;
        optimisticValues.set(key, next);
        optimisticLowerBoundResidual = Math.max(optimisticLowerBoundResidual, next - previous);
      }
      if (optimisticLowerBoundResidual < epsilon) break;
    }
    const optimisticLowerBoundConverged = optimisticLowerBoundResidual < epsilon;

    // Best-partial-solution frontier (AO-star style).
    //
    // Unexpanded successors carry zero continuation cost, so the greedy policy over the
    // optimistic values is exactly the "most promising route that is not yet proven".
    // Its unexpanded tips are the states whose expansion can actually turn that route
    // into a resolved one. A purely score-based expansion heuristic cannot express this:
    // a region that already satisfies part of the target (for example every rare that
    // already carries the requested fracture) keeps regenerating high-scoring siblings
    // and starves the states the route still needs.
    const optimisticResolutionFrontier = new Set<string>();
    {
      const visited = new Set<string>();
      const stack: string[] = [startKey];
      const frontierContinuationCache = new Map<
        ReadonlyArray<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>,
        number
      >();
      let frontierWork = 0;
      while (stack.length > 0) {
        if ((frontierWork++ & 255) === 0) assertWithinDeadline();
        const key = stack.pop()!;
        if (visited.has(key)) continue;
        visited.add(key);
        const node = nodes.get(key);
        if (!node || node.isTerminal) continue;
        let bestTransitions:
          | ReadonlyArray<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>
          | undefined;
        let bestQ = Infinity;
        for (const action of node.actions.values()) {
          let continuation = frontierContinuationCache.get(action.transitions);
          if (continuation === undefined) {
            continuation = 0;
            for (const transition of action.transitions) {
              continuation += transition.probability * (optimisticValues.get(transition.targetKey) ?? 0);
            }
            frontierContinuationCache.set(action.transitions, continuation);
          }
          const q = action.immediateCostChaos + continuation;
          if (q < bestQ) {
            bestQ = q;
            bestTransitions = action.transitions;
          }
        }
        if (!bestTransitions) continue;
        for (const transition of bestTransitions) {
          if (nodes.has(transition.targetKey)) stack.push(transition.targetKey);
          else optimisticResolutionFrontier.add(transition.targetKey);
        }
      }
    }

    const candidateLowerBoundCache = new Map<
      ReadonlyArray<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>,
      number
    >();
    for (const [key, decision] of policyMap) {
      const node = nodes.get(key)!;
      for (const candidate of decision.candidateQValues) {
        const action = node.actions.get(candidate.actionId)!;
        let continuation = candidateLowerBoundCache.get(action.transitions);
        if (continuation === undefined) {
          continuation = 0;
          for (const transition of action.transitions) {
            continuation += transition.probability * (optimisticValues.get(transition.targetKey) ?? 0);
          }
          candidateLowerBoundCache.set(action.transitions, continuation);
        }
        candidate.lowerBoundChaos = action.immediateCostChaos + continuation;
      }
    }
    assertWithinDeadline();

    // A proper selected continuation is not automatically a trustworthy value.
    // A successor can follow a fully absorbing incumbent while still containing
    // an unresolved competing action whose lower bound could improve that value.
    // Propagate that uncertainty back through every candidate that consumes the
    // successor value, including off-policy acquisition routes.
    const valueUnresolved = new Map<string, boolean>();
    for (const key of nodes.keys()) valueUnresolved.set(key, false);
    type GraphTransitions = ReadonlyArray<{
      targetKey: string;
      probability: number;
      nextState: ItemState;
      label?: string;
    }>;
    const parentsByTransitions = new Map<GraphTransitions, Set<string>>();
    const transitionsByTarget = new Map<string, Set<GraphTransitions>>();
    const unresolvedValueQueue: string[] = [];
    let valueDependencyDecisionCount = 0;
    for (const [key, decision] of policyMap) {
      if ((valueDependencyDecisionCount++ & 63) === 0) assertWithinDeadline();
      const incumbent = decision.candidateQValues
        .filter((candidate) => candidate.status === 'RESOLVED' && Number.isFinite(candidate.totalQValueChaos))
        .reduce((best, candidate) => Math.min(best, candidate.totalQValueChaos), Infinity);
      const node = nodes.get(key)!;
      for (const candidate of decision.candidateQValues) {
        const canAffectIncumbent = candidate.actionId === decision.bestActionId ||
          candidate.lowerBoundChaos < incumbent;
        if (!canAffectIncumbent) continue;
        if (candidate.status === 'UNRESOLVED') {
          if (!valueUnresolved.get(key)) {
            valueUnresolved.set(key, true);
            unresolvedValueQueue.push(key);
          }
          continue;
        }
        if (candidate.status !== 'RESOLVED') continue;
        const transitions = node.actions.get(candidate.actionId)!.transitions;
        const parents = parentsByTransitions.get(transitions) ?? new Set<string>();
        parents.add(key);
        parentsByTransitions.set(transitions, parents);
        if (parents.size > 1) continue;
        for (const transition of transitions) {
          const consumers = transitionsByTarget.get(transition.targetKey) ?? new Set<GraphTransitions>();
          consumers.add(transitions);
          transitionsByTarget.set(transition.targetKey, consumers);
        }
      }
    }
    const propagatedTransitionSets = new Set<GraphTransitions>();
    while (unresolvedValueQueue.length > 0) {
      if ((unresolvedValueQueue.length & 63) === 0) assertWithinDeadline();
      const unresolvedKey = unresolvedValueQueue.shift()!;
      for (const transitions of transitionsByTarget.get(unresolvedKey) ?? []) {
        if (propagatedTransitionSets.has(transitions)) continue;
        propagatedTransitionSets.add(transitions);
        for (const parentKey of parentsByTransitions.get(transitions) ?? []) {
          if (valueUnresolved.get(parentKey)) continue;
          valueUnresolved.set(parentKey, true);
          unresolvedValueQueue.push(parentKey);
        }
      }
    }
    assertWithinDeadline();

    const finalDownstreamValueUnresolvedCache = new Map<
      ReadonlyArray<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>,
      boolean
    >();
    let finalizedDecisionCount = 0;
    for (const [key, decision] of policyMap) {
      if ((finalizedDecisionCount++ & 63) === 0) assertWithinDeadline();
      const node = nodes.get(key)!;
      const resolvedIncumbent = decision.candidateQValues
        .filter((candidate) => candidate.status === 'RESOLVED' && Number.isFinite(candidate.totalQValueChaos))
        .sort((a, b) => a.totalQValueChaos - b.totalQValueChaos)[0];
      const incumbent = resolvedIncumbent?.totalQValueChaos ?? Infinity;
      for (const candidate of decision.candidateQValues) {
        candidate.incumbentUpperBoundChaos = incumbent;
        candidate.optimalityGapChaos = Number.isFinite(incumbent)
          ? Math.max(0, incumbent - candidate.lowerBoundChaos)
          : Infinity;
        candidate.couldBeatResolvedIncumbent = false;
        const action = node.actions.get(candidate.actionId)!;
        let downstreamValueUnresolved = finalDownstreamValueUnresolvedCache.get(action.transitions);
        if (downstreamValueUnresolved === undefined) {
          downstreamValueUnresolved = action.transitions.some(
            (transition) => valueUnresolved.get(transition.targetKey)
          );
          finalDownstreamValueUnresolvedCache.set(action.transitions, downstreamValueUnresolved);
        }
        const consumesUncertifiedValue = candidate.status === 'RESOLVED' && downstreamValueUnresolved;
        const hasUnresolvedValue = candidate.status === 'UNRESOLVED' || consumesUncertifiedValue;
        candidate.couldBeatResolvedIncumbent = hasUnresolvedValue &&
          candidate.actionId !== decision.bestActionId &&
          candidate.lowerBoundChaos < incumbent;
        if (
          candidate.status === 'UNRESOLVED' &&
          !candidate.couldBeatResolvedIncumbent &&
          Number.isFinite(incumbent)
        ) {
          candidate.status = 'DOMINATED_BY_BOUND';
        }
      }
      decision.candidateQValues.sort((a, b) => a.totalQValueChaos - b.totalQValueChaos);
      if (
        decision.state.rarity === 'normal' ||
        (decision.state.rarity === 'magic' &&
          (decision.state.prefixes.length === 1 || decision.state.suffixes.length === 1))
      ) {
        if (representativeAudits.length < 8) representativeAudits.push(decision);
      }
    }

    const candidateClassificationAndTrustMs = Math.max(
      0,
      Date.now() - candidateClassificationStarted - absorptionMs
    );

    // ------------------------------------------------------------- On-Policy Reachability Analysis
    // Trace all states reachable under the selected policy pi*(s) from startKey
    const onPolicyReachableKeys = new Set<string>();
    const onPolicyQueue: string[] = [startKey];
    onPolicyReachableKeys.add(startKey);

    let onPolicyTerminalStates = 0;
    let onPolicyUnresolvedTransitions = 0;
    let onPolicyUnresolvedProbMass = 0;

    while (onPolicyQueue.length > 0) {
      if ((onPolicyReachableKeys.size & 63) === 0) assertWithinDeadline();
      const currKey = onPolicyQueue.shift()!;
      const node = nodes.get(currKey);
      if (!node) continue;

      if (node.isTerminal) {
        onPolicyTerminalStates++;
        continue;
      }

      const decision = policyMap.get(currKey);
      if (!decision) {
        onPolicyUnresolvedTransitions++;
        onPolicyUnresolvedProbMass = 1;
        continue;
      }

      const actData = node.actions.get(decision.bestActionId);
      if (!actData) {
        onPolicyUnresolvedTransitions++;
        onPolicyUnresolvedProbMass = 1;
        continue;
      }

      // Track action usage on policy
      if (graphResult.actionAttribution[decision.bestActionId]) {
        graphResult.actionAttribution[decision.bestActionId].onPolicyStatesSelectingAction++;
      }

      for (const t of actData.transitions) {
        if (nodes.has(t.targetKey)) {
          if (!onPolicyReachableKeys.has(t.targetKey)) {
            onPolicyReachableKeys.add(t.targetKey);
            onPolicyQueue.push(t.targetKey);
          }
        } else {
          onPolicyUnresolvedTransitions++;
          onPolicyUnresolvedProbMass += t.probability;
        }
      }
    }

    const onPolicyAdjacency = new Map<string, string[]>();
    for (const key of onPolicyReachableKeys) {
      if ((onPolicyAdjacency.size & 63) === 0) assertWithinDeadline();
      const node = nodes.get(key);
      const decision = policyMap.get(key);
      const action = node && decision ? node.actions.get(decision.bestActionId) : undefined;
      onPolicyAdjacency.set(
        key,
        action?.transitions.filter((transition) => onPolicyReachableKeys.has(transition.targetKey)).map((transition) => transition.targetKey) ?? []
      );
    }
    const terminalAbsorptionProbability = policyTrust.absorption.get(startKey) ?? 0;
    const isFullyResolved = onPolicyUnresolvedTransitions === 0 && !policyTrust.downstreamUnresolved.get(startKey);
    const isProper =
      isFullyResolved &&
      policyTrust.converged &&
      terminalAbsorptionProbability >= 1 - 1e-8;

    const onPolicyGraph: OnPolicyGraphResult = {
      onPolicyReachableStates: onPolicyReachableKeys.size,
      onPolicyTerminalStates,
      onPolicyUnresolvedTransitions,
      onPolicyUnresolvedProbabilityMass: isFullyResolved
        ? 0
        : Math.max(onPolicyUnresolvedProbMass, 1 - terminalAbsorptionProbability),
      terminalAbsorptionProbability,
      absorptionIterations: policyTrust.iterations,
      absorptionMaxResidual: policyTrust.residual,
      absorptionConverged: policyTrust.converged,
      hasCycles: directedGraphHasCycle(onPolicyAdjacency, deadlineMs),
      isProper,
      isFullyResolved,
    };
    assertWithinDeadline();

    // Compute Expected Currency Usage via Markov Visit Frequencies on on-policy graph
    const occupancyStarted = Date.now();
    const expectedVisits = new Map<string, number>();
    for (const key of onPolicyReachableKeys) expectedVisits.set(key, 0);
    expectedVisits.set(startKey, 1.0);

    let visitIteration = 0;
    let visitMaxResidual = 0;
    let visitSweepExecuted = false;
    let visitSweeps = 0;
    const occupancyKeys = new Set(
      [...onPolicyReachableKeys].filter((key) => !nodes.get(key)?.isTerminal)
    );
    const linearOccupancy = isProper
      ? solveSelectedPolicyLinearSystem(
          nodes,
          policyMap,
          occupancyKeys,
          (key) => key === startKey ? 1 : 0,
          true,
          undefined,
          1e-9,
          2000,
          deadlineMs
        )
      : undefined;
    if (linearOccupancy?.converged) {
      for (const key of onPolicyReachableKeys) expectedVisits.set(key, 0);
      for (const [key, value] of linearOccupancy.values) {
        expectedVisits.set(key, Math.max(0, value));
      }
      visitSweepExecuted = true;
      visitSweeps = linearOccupancy.iterations;
      visitMaxResidual = linearOccupancy.residual;
    } else {
      for (
        ;
        visitIteration < (effectiveOptions.maxMarkovIterations ?? 1000) &&
        (deadlineMs === undefined || Date.now() < deadlineMs);
        visitIteration++
      ) {
        visitSweepExecuted = true;
        visitSweeps++;
        visitMaxResidual = 0;
        const nextVisits = new Map<string, number>();
        for (const key of onPolicyReachableKeys) nextVisits.set(key, key === startKey ? 1.0 : 0);
        const groupedVisitMass = new Map<
          ReadonlyArray<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>,
          number
        >();

        for (const key of onPolicyReachableKeys) {
          const visits = expectedVisits.get(key) ?? 0;
          if (visits <= 1e-12) continue;

          const node = nodes.get(key);
          if (!node || node.isTerminal) continue;

          const decision = policyMap.get(key);
          if (!decision) continue;

          const actData = node.actions.get(decision.bestActionId);
          if (!actData) continue;

          groupedVisitMass.set(actData.transitions, (groupedVisitMass.get(actData.transitions) ?? 0) + visits);
        }

        for (const [transitions, visits] of groupedVisitMass) {
          for (const t of transitions) {
            if (!onPolicyReachableKeys.has(t.targetKey)) continue;
            const prev = nextVisits.get(t.targetKey) ?? 0;
            nextVisits.set(t.targetKey, prev + visits * t.probability);
          }
        }

        for (const key of onPolicyReachableKeys) {
          const v = nextVisits.get(key) ?? 0;
          const delta = Math.abs(v - (expectedVisits.get(key) ?? 0));
          if (delta > visitMaxResidual) visitMaxResidual = delta;
          expectedVisits.set(key, v);
        }

        if (visitMaxResidual < 1e-8) break;
      }
    }
    const occupancyMs = Date.now() - occupancyStarted;
    const resultAssemblyStarted = Date.now();

    const expectedCurrencies: Record<string, number> = {};
    let sumExpectedActionCostChaos = 0;
    const currencyByActionId: Record<string, string> = {
      transmutation_orb: 'transmutation',
      alteration_orb: 'alteration',
      augmentation_orb: 'augmentation',
      regal_orb: 'regal',
      scouring_orb: 'scour',
      annulment_orb: 'annul',
      exalted_orb: 'exalt',
      fracturing_orb: 'fracturing',
      restart_reacquire: 'reacquisition',
    };
    const selectedPriceEvidence = new Map<string, PriceConfidenceResult['evidence'][number]>();
    const expectedActionUsageById = new Map<string, ExpectedActionUsageResult>();

    for (const key of onPolicyReachableKeys) {
      const visits = expectedVisits.get(key) ?? 0;
      const decision = policyMap.get(key);
      if (!decision) continue;
      const node = nodes.get(key);
      if (!node || node.isTerminal) continue;

      const actData = node.actions.get(decision.bestActionId);
      if (!actData) continue;

      const actCost = actData.immediateCostChaos;
      sumExpectedActionCostChaos += visits * actCost;
      const priorUsage = expectedActionUsageById.get(decision.bestActionId);
      expectedActionUsageById.set(decision.bestActionId, {
        actionId: decision.bestActionId,
        actionName: decision.bestActionName,
        expectedCount: (priorUsage?.expectedCount ?? 0) + visits,
        expectedCostChaos: (priorUsage?.expectedCostChaos ?? 0) + visits * actCost,
      });

      if (actData.action.mechanic.actionType === 'HARVEST_REFORGE') {
        const lifeforceType = String(actData.action.mechanic.parameters?.lifeforceType ?? 'lifeforce');
        const amount = Number(actData.action.mechanic.parameters?.lifeforceAmount ?? 0);
        expectedCurrencies[lifeforceType] = (expectedCurrencies[lifeforceType] ?? 0) + visits * amount;
      } else {
        const currency = actData.action.mechanic.actionType === 'RESTART_REACQUIRE'
          ? 'reacquisition'
          : currencyByActionId[decision.bestActionId] ?? decision.bestActionId;
        expectedCurrencies[currency] = (expectedCurrencies[currency] ?? 0) + visits;
      }
      selectedPriceEvidence.set(decision.bestActionId, {
        actionId: decision.bestActionId,
        actionName: decision.bestActionName,
        costChaos: actData.cost.costChaos,
        confidence: actData.cost.confidence,
        source: actData.cost.source,
        provenance: actData.cost.provenance,
      });
    }

    const totalExpectedCostChaos = policyMap.get(startKey)?.optimalValueChaos ?? V.get(startKey) ?? Infinity;
    const isTargetSatisfied = Number.isFinite(totalExpectedCostChaos) && onPolicyGraph.isProper;
    const reconciliationDiff = Math.abs(sumExpectedActionCostChaos - totalExpectedCostChaos);
    const visitConverged = visitSweepExecuted && visitMaxResidual < 1e-6;
    const isReconciled = onPolicyGraph.isProper && visitConverged && reconciliationDiff < 0.05;

    const onPolicyDecisions = [...policyMap.values()].filter((decision) => onPolicyReachableKeys.has(decision.stateKey));
    const unresolvedCompetitors = onPolicyDecisions.flatMap((decision) =>
      decision.candidateQValues.filter((candidate) => candidate.status === 'UNRESOLVED')
    );
    const potentiallyCompetitiveUnresolved = onPolicyDecisions.flatMap((decision) =>
      decision.candidateQValues.filter((candidate) => candidate.couldBeatResolvedIncumbent)
    );
    const modeledOptimalityProven =
      !graphResult.hitStateLimit &&
      !graphResult.hitWallTimeLimit &&
      graphResult.transitionsToUnexpandedStates === 0 &&
      valueIterationConverged &&
      candidateResolutionConverged &&
      onPolicyGraph.isProper &&
      isReconciled &&
      unresolvedCompetitors.length === 0;
    const selectedPolicyCertified =
      candidateResolutionConverged &&
      onPolicyGraph.isFullyResolved &&
      onPolicyGraph.isProper &&
      isReconciled;
    const optimalityProof: OptimalityProofResult = {
      selectedPolicyStatus: selectedPolicyCertified
        ? 'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED'
        : 'NOT CERTIFIED',
      proofLevel: modeledOptimalityProven
        ? 'OPTIMAL OVER MODELED ACTIONS: PROVEN'
        : selectedPolicyCertified
          ? 'BEST FULLY RESOLVED POLICY FOUND'
          : 'NO FULLY RESOLVED POLICY FOUND',
      globalOptimality: 'NOT YET PROVEN',
      modeledActionOptimalityProven: modeledOptimalityProven,
      candidateResolutionConverged,
      unresolvedCompetitorCount: unresolvedCompetitors.length,
      potentiallyCompetitiveUnresolvedCount: potentiallyCompetitiveUnresolved.length,
      unresolvedCandidatesCouldBeatIncumbent: potentiallyCompetitiveUnresolved.length > 0,
    };
    const priceEvidence = [...selectedPriceEvidence.values()];
    const priceWarnings = priceEvidence
      .filter((evidence) => evidence.confidence !== 'known')
      .map(
        (evidence) =>
          `${evidence.actionName}: ${evidence.costChaos.toFixed(3)}c uses ${evidence.confidence} pricing` +
          (evidence.provenance ? ` (${evidence.provenance})` : '')
      );
    const priceConfidence: PriceConfidenceResult = {
      complete: priceEvidence.every((evidence) => evidence.confidence !== 'unavailable'),
      evidence: priceEvidence,
      warnings: priceWarnings,
    };
    const consideredPriceEvidenceById = new Map<string, PriceConfidenceResult['evidence'][number]>();
    for (const node of nodes.values()) {
      for (const [actionId, actionData] of node.actions) {
        if (consideredPriceEvidenceById.has(actionId)) continue;
        consideredPriceEvidenceById.set(actionId, {
          actionId,
          actionName: actionData.action.name,
          costChaos: actionData.cost.costChaos,
          confidence: actionData.cost.confidence,
          source: actionData.cost.source,
          provenance: actionData.cost.provenance,
        });
      }
    }
    const consideredEvidence = [...consideredPriceEvidenceById.values()];
    const consideredPriceConfidence: PriceConfidenceResult = {
      complete: consideredEvidence.every((evidence) => evidence.confidence !== 'unavailable'),
      evidence: consideredEvidence,
      warnings: consideredEvidence
        .filter((evidence) => evidence.confidence !== 'known')
        .map((evidence) =>
          `${evidence.actionName}: ${evidence.costChaos.toFixed(3)}c uses ${evidence.confidence} pricing` +
          (evidence.provenance ? ` (${evidence.provenance})` : '')
        ),
    };
    const mechanicsEvidence: MechanicsConfidenceResult['evidence'] = this.adapters
      .filter((adapter) => {
        const attribution = graphResult.actionAttribution[adapter.id];
        return (attribution?.actionLocalUniqueSuccessorKeysProduced ?? 0) > 0 ||
          (attribution?.onPolicyStatesSelectingAction ?? 0) > 0 ||
          (attribution?.unresolvedOutgoingEdges ?? 0) > 0;
      })
      .map((adapter) => ({
        actionId: adapter.id,
        actionName: adapter.name,
        confidence: adapter.mechanic.mechanicsConfidence ?? 'VALIDATED',
        provenance: adapter.mechanic.mechanicsProvenance,
        onPolicySelections: graphResult.actionAttribution[adapter.id]?.onPolicyStatesSelectingAction ?? 0,
      }));
    const mechanicsConfidence: MechanicsConfidenceResult = {
      evidence: mechanicsEvidence,
      warnings: mechanicsEvidence
        .filter((evidence) => evidence.confidence !== 'VALIDATED')
        .map((evidence) =>
          `${evidence.actionName}: ${evidence.confidence}` +
          (evidence.provenance ? ` (${evidence.provenance})` : '')
        ),
    };
    const onPolicyRules: OnPolicyRuleResult[] = onPolicyDecisions
      .map((decision) => ({
        stateKey: decision.stateKey,
        state: decision.state,
        selectedActionId: decision.bestActionId,
        selectedActionName: decision.bestActionName,
        expectedVisits: expectedVisits.get(decision.stateKey) ?? 0,
        totalCostChaos: decision.optimalValueChaos,
        candidateQValues: decision.candidateQValues,
      }))
      .sort((left, right) => right.expectedVisits - left.expectedVisits);
    const expectedActionUsage = [...expectedActionUsageById.values()]
      .sort((left, right) => right.expectedCostChaos - left.expectedCostChaos);

    const steps: GenericSearchStep[] = [];
    const startDecision = policyMap.get(startKey);
    if (startDecision) {
      const startNode = nodes.get(startKey);
      steps.push({
        stateDescription: `${normalizedStartState.rarity.toUpperCase()} jewel (0 affixes)`,
        legalActionsConsidered: startNode ? Array.from(startNode.actions.values()).map((a) => a.action.name) : [],
        candidateQValues: startDecision.candidateQValues,
        selectedAction: startDecision.bestActionName,
        immediateCostChaos: startNode?.actions.get(startDecision.bestActionId)?.immediateCostChaos ?? 0,
        continuationCostChaos: startDecision.optimalValueChaos - (startNode?.actions.get(startDecision.bestActionId)?.immediateCostChaos ?? 0),
        totalQValueChaos: startDecision.optimalValueChaos,
        reason: `IF normal (0 affixes) -> ${startDecision.bestActionName} (Immediate: ${(startNode?.actions.get(startDecision.bestActionId)?.immediateCostChaos ?? 0).toFixed(2)}c, Cont EV: ${(startDecision.optimalValueChaos - (startNode?.actions.get(startDecision.bestActionId)?.immediateCostChaos ?? 0)).toFixed(2)}c, Q: ${startDecision.optimalValueChaos.toFixed(2)}c)`,
      });
    }

    const samplePrefixDecision = Array.from(policyMap.values()).find(
      (d) => onPolicyReachableKeys.has(d.stateKey) && d.state.rarity === 'magic' && d.state.prefixes.length === 1 && d.state.suffixes.length === 0
    );
    if (samplePrefixDecision) {
      const node = nodes.get(samplePrefixDecision.stateKey);
      const imm = node?.actions.get(samplePrefixDecision.bestActionId)?.immediateCostChaos ?? 0;
      steps.push({
        stateDescription: `MAGIC jewel with 1 Prefix (e.g. ${samplePrefixDecision.state.prefixes[0]?.name})`,
        legalActionsConsidered: node ? Array.from(node.actions.values()).map((a) => a.action.name) : [],
        candidateQValues: samplePrefixDecision.candidateQValues,
        selectedAction: samplePrefixDecision.bestActionName,
        immediateCostChaos: imm,
        continuationCostChaos: samplePrefixDecision.optimalValueChaos - imm,
        totalQValueChaos: samplePrefixDecision.optimalValueChaos,
        reason: `IF 1-prefix magic miss -> ${samplePrefixDecision.bestActionName} (Immediate: ${imm.toFixed(2)}c, Cont EV: ${(samplePrefixDecision.optimalValueChaos - imm).toFixed(2)}c, Q: ${samplePrefixDecision.optimalValueChaos.toFixed(2)}c)`,
      });
    }

    const sample2AffixDecision = Array.from(policyMap.values()).find(
      (d) => onPolicyReachableKeys.has(d.stateKey) && d.state.rarity === 'magic' && d.state.prefixes.length === 1 && d.state.suffixes.length === 1
    );
    if (sample2AffixDecision) {
      const node = nodes.get(sample2AffixDecision.stateKey);
      const imm = node?.actions.get(sample2AffixDecision.bestActionId)?.immediateCostChaos ?? 0;
      steps.push({
        stateDescription: `MAGIC jewel with 2 Non-Target Affixes`,
        legalActionsConsidered: node ? Array.from(node.actions.values()).map((a) => a.action.name) : [],
        candidateQValues: sample2AffixDecision.candidateQValues,
        selectedAction: sample2AffixDecision.bestActionName,
        immediateCostChaos: imm,
        continuationCostChaos: sample2AffixDecision.optimalValueChaos - imm,
        totalQValueChaos: sample2AffixDecision.optimalValueChaos,
        reason: `IF 2-affix magic miss -> ${sample2AffixDecision.bestActionName} (Immediate: ${imm.toFixed(2)}c, Cont EV: ${(sample2AffixDecision.optimalValueChaos - imm).toFixed(2)}c, Q: ${sample2AffixDecision.optimalValueChaos.toFixed(2)}c)`,
      });
    }

    const lines: string[] = [];
    lines.push('GENERIC BELLMAN VALUE ITERATION SEARCH REPORT:');
    lines.push(`1. Reachable Canonical States: ${nodes.size} states explored across ${valueIterationSweeps} Bellman sweeps.`);
    lines.push(`2. On-Policy Reachable States: ${onPolicyGraph.onPolicyReachableStates} states (${onPolicyGraph.isFullyResolved ? 'fully resolved' : 'unresolved'} on policy).`);
    lines.push(`3. Start State EV: ${totalExpectedCostChaos.toFixed(2)}c (~${(totalExpectedCostChaos / (this.context.priceBook.getRate('divine') || 200)).toFixed(3)} div).`);
    lines.push(`4. Selected policy: ${optimalityProof.selectedPolicyStatus}.`);
    lines.push(`5. Proof level: ${optimalityProof.proofLevel}; GLOBAL OPTIMALITY: ${optimalityProof.globalOptimality}.`);
    const resultAssemblyMs = Date.now() - resultAssemblyStarted;
    const stageTiming: SearchStageTiming = {
      seedResultMs: 0,
      transitionGenerationMs: graphResult.timing.transitionGenerationMs,
      graphAggregationAndSetupMs: graphResult.timing.graphAggregationAndSetupMs,
      bellmanMs,
      candidateClassificationAndTrustMs,
      absorptionMs,
      occupancyMs,
      competitiveFrontierCollectionMs: 0,
      resultAssemblyMs,
      repeatedRoundWorkMs: 0,
      unattributedOrInterruptedMs: 0,
    };

    return {
      startingState: normalizedStartState,
      target: this.target,
      totalExpectedCostChaos,
      expectedCurrencies,
      selectedRouteName: steps[0]?.selectedAction
        ? `${steps[0].selectedAction} -> Best Fully Resolved Policy`
        : 'Generic Policy',
      steps,
      policyMap,
      representativeAudits,
      canonicalStatesVisited: nodes.size,
      graphBuild: graphResult,
      onPolicyGraph,
      convergence: {
        iterations: valueIterationSweeps,
        converged: valueIterationConverged,
        finalMaxResidual: maxDelta,
        epsilon,
        maxIterations,
        improperPolicyEliminationPasses,
        improperPolicyStatesPinned,
      },
      reconciliation: {
        sumExpectedActionCostChaos,
        reportedDownstreamEVChaos: totalExpectedCostChaos,
        differenceChaos: reconciliationDiff,
        isReconciled,
        visitIterations: visitSweeps,
        visitMaxResidual,
        visitConverged,
      },
      optimalityProof,
      priceConfidence,
      consideredPriceConfidence,
      mechanicsConfidence,
      onPolicyRules,
      expectedActionUsage,
      searchSummary: {
        intent: effectiveOptions.searchIntent ?? 'RECOMMEND',
        statesExpanded: nodes.size,
        cumulativeExpansionWork: nodes.size,
        elapsedMs: 0,
        expansionRounds: 1,
        maxStates: effectiveOptions.maxStates ?? 5000,
        maxWallTimeMs: effectiveOptions.maxWallTimeMs,
        maxExpansionRounds: effectiveOptions.maxExpansionRounds ?? 1,
        prioritizedCompetitiveStateKeys: prioritizedStateKeys?.size ?? 0,
        stateBudgetExhausted: graphResult.hitStateLimit,
        wallTimeBudgetExhausted: graphResult.hitWallTimeLimit,
        roundBudgetExhausted: false,
        budgetExhausted: graphResult.hitStateLimit || graphResult.hitWallTimeLimit,
        returnedAtBudget: graphResult.hitWallTimeLimit,
        expansionMode: graphResult.extendedPersistentGraph ? 'PERSISTENT_EXTENDED' : 'REBUILT_EACH_ROUND',
        repeatedStatesExpanded: 0,
        seedStatesExpanded: 0,
        newStatesByRound: [],
        retainedStatesReusedByRound: [],
        transitionDistributionsGenerated: graphResult.transitionDistributionsGeneratedThisRound,
        transitionDistributionsGeneratedByRound: [],
        previouslyExpandedNodesRevisited: graphResult.previouslyExpandedNodesRevisitedThisRound,
        previouslyExpandedNodesRevisitedByRound: [],
        acquisitionFeasibilityStatesExpanded: 0,
        interruptedStatesExpanded: 0,
        optimisticLowerBoundIterations,
        optimisticLowerBoundConverged,
        optimisticLowerBoundMethod: 'KNOWN_PARTIAL_GRAPH_WITH_ZERO_COST_UNKNOWN_SUCCESSORS',
        minimumFeasibleRarity: this.minimumFeasibleRarity,
        acquisitionFeasibility: {
          attemptedCandidates: 0,
          certifiedCandidates: 0,
          distinctPhysicalStates: 0,
          fairStateBudgetPerCandidate: 0,
          attempts: [],
        },
        deepenProgress: {
          before: {
            canonicalStates: nodes.size,
            acquisitionFeasibleUpperBounds: 0,
            unresolvedAcquisitionCandidates: 0,
            candidatesDominatedByBound: 0,
          },
          after: {
            canonicalStates: nodes.size,
            acquisitionFeasibleUpperBounds: 0,
            unresolvedAcquisitionCandidates: 0,
            candidatesDominatedByBound: 0,
          },
          newCanonicalStates: 0,
          newAcquisitionFeasibleUpperBounds: 0,
          newlyDominatedByBound: 0,
          meaningfulProgress: false,
          stoppedEarlyNoMeaningfulProgress: false,
        },
      },
      stageTiming,
      isTargetSatisfied,
      optimisticResolutionFrontier: [...optimisticResolutionFrontier],
      explanation: lines.join('\n'),
    };
  }
}
