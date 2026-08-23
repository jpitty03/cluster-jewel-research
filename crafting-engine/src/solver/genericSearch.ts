import type { ItemState } from '../domain/ItemState.ts';
import { cloneItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { SolverContext } from '../domain/CraftAction.ts';
import type { PriceConfidence, PriceSource } from '../domain/PriceBook.ts';
import type { RandomSource } from '../probability/random.ts';
import { matchesModRequirement, satisfiesTarget } from '../domain/TargetDefinition.ts';
import {
  CRAFT_MECHANICS,
  createRestartReacquireMechanic,
  type CraftMechanic,
  type CraftCost,
  type RestartReacquireDefinition,
  type TransitionDistribution,
} from '../rules/actionRegistry.ts';
import { getCanonicalStateKey } from '../rules/actionDiscovery.ts';

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
    return this.mechanic.isLegal(state, this.target, this.context);
  }

  getCost(): CraftCost {
    return this.mechanic.getCost(this.context);
  }

  getTransitions(state: ItemState): TransitionDistribution | undefined {
    if (!this.mechanic.getTransitions) return undefined;
    if (this.mechanic.id === 'alteration_orb') {
      const resetState = cloneItemState(state);
      resetState.prefixes = resetState.prefixes.filter(
        (mod) => mod.isFractured || state.fracturedModIds.includes(mod.modId)
      );
      resetState.suffixes = resetState.suffixes.filter(
        (mod) => mod.isFractured || state.fracturedModIds.includes(mod.modId)
      );
      const cacheKey = getCanonicalStateKey(resetState, this.target);
      const cached = this.transitionCache.get(cacheKey);
      if (cached) return cached;
      const distribution = this.mechanic.getTransitions(state, this.target, this.context);
      this.transitionCache.set(cacheKey, distribution);
      return distribution;
    }
    return this.mechanic.getTransitions(state, this.target, this.context);
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
  queuedButUnexpandedStates: number;
  transitionsToUnexpandedStates: number;
  transitionProbabilityMassToUnexpandedStates: number;
  terminalStatesFound: number;
  stateCountsByRarity: Record<string, number>;
  stateCountsByAffixes: Record<string, number>;
  hasCycles: boolean;
  actionAttribution: Record<string, ActionStateAttribution>;
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

export interface ValueIterationConvergence {
  iterations: number;
  converged: boolean;
  finalMaxResidual: number;
  epsilon: number;
  maxIterations: number;
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
  isTargetSatisfied: boolean;
  explanation: string;
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
  enabledActionIds?: string[];
  prioritizeTargetProgress?: boolean;
  maxMarkovIterations?: number;
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

  private precedes(
    left: { priority: number; sequence: number },
    right: { priority: number; sequence: number }
  ): boolean {
    return left.priority > right.priority || (left.priority === right.priority && left.sequence < right.sequence);
  }
}

function directedGraphHasCycle(adjacency: Map<string, string[]>): boolean {
  const indegree = new Map<string, number>();
  for (const key of adjacency.keys()) indegree.set(key, 0);
  for (const targets of adjacency.values()) {
    for (const target of targets) {
      if (indegree.has(target)) indegree.set(target, (indegree.get(target) ?? 0) + 1);
    }
  }
  const queue = [...indegree.entries()].filter(([, degree]) => degree === 0).map(([key]) => key);
  let removed = 0;
  while (queue.length > 0) {
    const key = queue.shift()!;
    removed++;
    for (const target of adjacency.get(key) ?? []) {
      if (!indegree.has(target)) continue;
      const next = (indegree.get(target) ?? 0) - 1;
      indegree.set(target, next);
      if (next === 0) queue.push(target);
    }
  }
  return removed !== indegree.size;
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

  constructor(context: SolverContext, target: TargetDefinition, options: GenericSearchOptions = {}) {
    this.context = context;
    this.target = target;
    this.allowFallbackPrices = options.allowResearchFallbackPrices ?? true;
    this.defaultOptions = options;

    const mechanics = [...CRAFT_MECHANICS];
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

  private expansionPriority(state: ItemState): number {
    if (!this.defaultOptions.prioritizeTargetProgress) return 0;
    const affixes = [...state.prefixes, ...state.suffixes];
    const requirements = [
      ...this.target.requiredMods,
      ...(this.target.outcomeBranches?.flatMap((branch) => branch.requiredMods) ?? []),
      ...(this.target.acceptableAnyOf?.flat() ?? []),
    ];
    let score = state.rarity === 'rare' ? 20 : state.rarity === 'magic' ? 10 : 0;
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
    return score;
  }

  /**
   * Builds the reachable canonical state graph starting from startState.
   * Tracks exact graph-build completeness metadata, unexpanded states, and missing probability mass.
   */
  public buildGraph(startState: ItemState, maxStates = 5000): GraphBuildResult {
    const nodes = new Map<string, CanonicalGraphNode>();
    const queue = new StateExpansionQueue();
    queue.push(startState, this.expansionPriority(startState));
    const queuedKeys = new Set<string>();
    queuedKeys.add(getCanonicalStateKey(startState, this.target));

    let terminalStatesFound = 0;
    const stateCountsByRarity: Record<string, number> = { normal: 0, magic: 0, rare: 0 };
    const stateCountsByAffixes: Record<string, number> = {};
    const actionAttribution: Record<string, ActionStateAttribution> = {};
    const actionLocalSuccessorKeys = new Map<string, Set<string>>();
    const aggregatedDistributionCache = new WeakMap<
      TransitionDistribution,
      Array<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>
    >();

    for (const adapter of this.adapters) {
      actionAttribution[adapter.id] = {
        actionId: adapter.id,
        actionName: adapter.name,
        actionLocalUniqueSuccessorKeysProduced: 0,
        newGlobalStatesFirstDiscovered: 0,
        onPolicyStatesSelectingAction: 0,
        unresolvedOutgoingEdges: 0,
      };
      actionLocalSuccessorKeys.set(adapter.id, new Set());
    }

    while (queue.length > 0 && nodes.size < maxStates) {
      const curr = queue.shift()!;
      const key = getCanonicalStateKey(curr, this.target);
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

      if (!isTerminal) {
        for (const adapter of this.adapters) {
          if (adapter.applicable(curr)) {
            const dist = adapter.getTransitions(curr);
            if (dist && dist.outcomes.length > 0) {
              const cachedTransitions = aggregatedDistributionCache.get(dist);
              if (cachedTransitions) {
                node.actions.set(adapter.id, {
                  action: adapter,
                  immediateCostChaos: dist.immediateCostChaos,
                  cost: adapter.getCost(),
                  isDirectlyResolved: true,
                  transitions: cachedTransitions,
                });
                continue;
              }
              const aggMap = new Map<string, { targetKey: string; probability: number; nextState: ItemState; label?: string }>();
              for (const out of dist.outcomes) {
                const outKey = getCanonicalStateKey(out.state, this.target);
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
                    queue.push(out.state, this.expansionPriority(out.state));
                    if (actionAttribution[adapter.id]) {
                      actionAttribution[adapter.id].newGlobalStatesFirstDiscovered++;
                    }
                  }
                }
              }

              const transitions = Array.from(aggMap.values());
              aggregatedDistributionCache.set(dist, transitions);
              node.actions.set(adapter.id, {
                action: adapter,
                immediateCostChaos: dist.immediateCostChaos,
                cost: adapter.getCost(),
                isDirectlyResolved: true,
                transitions,
              });
            }
          }
        }
      }

      nodes.set(key, node);
    }

    const hitStateLimit = nodes.size >= maxStates && queue.length > 0;
    const queuedButUnexpandedStates = queue.length;

    let transitionsToUnexpandedStates = 0;
    let totalUnexpandedProbMass = 0;
    let totalTransitionsCount = 0;

    for (const node of nodes.values()) {
      for (const [actId, act] of node.actions.entries()) {
        for (const t of act.transitions) {
          totalTransitionsCount++;
          if (!nodes.has(t.targetKey)) {
            act.isDirectlyResolved = false;
            transitionsToUnexpandedStates++;
            totalUnexpandedProbMass += t.probability;
            if (actionAttribution[actId]) {
              actionAttribution[actId].unresolvedOutgoingEdges++;
            }
          }
        }
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
      adjacency.set(
        key,
        [...node.actions.values()].flatMap((action) =>
          action.transitions.filter((transition) => nodes.has(transition.targetKey)).map((transition) => transition.targetKey)
        )
      );
    }

    return {
      nodes,
      maxStates,
      hitStateLimit,
      queuedButUnexpandedStates,
      transitionsToUnexpandedStates,
      transitionProbabilityMassToUnexpandedStates,
      terminalStatesFound,
      stateCountsByRarity,
      stateCountsByAffixes,
      hasCycles: directedGraphHasCycle(adjacency),
      actionAttribution,
    };
  }

  /**
   * Solves the Bellman value equations V(s) = min_a Q(s,a) over the reachable cyclic graph.
   */
  public search(startState: ItemState, options: GenericSearchOptions = {}): GenericSearchResult {
    const effectiveOptions = { ...this.defaultOptions, ...options };
    const maxIterations = effectiveOptions.maxIterations ?? 500;
    const epsilon = effectiveOptions.convergenceEpsilon ?? 1e-5;

    const graphResult = this.buildGraph(startState, effectiveOptions.maxStates ?? 5000);
    const nodes = graphResult.nodes;
    const startKey = getCanonicalStateKey(startState, this.target);

    // Initialize Value Function V(s): terminal = 0, non-terminal = initial estimate
    const V = new Map<string, number>();
    for (const [key, node] of nodes.entries()) {
      V.set(key, node.isTerminal ? 0 : 20.0);
    }

    // Value Iteration Loop (solves stochastic shortest path with cycles)
    let iteration = 0;
    let maxDelta = 0;
    for (; iteration < maxIterations; iteration++) {
      maxDelta = 0;

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
          let expCont = 0;
          for (const t of actData.transitions) {
            const targetVal = V.get(t.targetKey) ?? Infinity;
            expCont += t.probability * targetVal;
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
        }
        V.set(key, bestQ);
      }

      if (maxDelta < epsilon) {
        break;
      }
    }

    const valueIterationConverged = maxDelta < epsilon && Number.isFinite(V.get(startKey));

    // Extract the selected policy and candidate Q-values with explicit resolution status.
    const policyMap = new Map<string, StatePolicyDecision>();
    const representativeAudits: StatePolicyDecision[] = [];

    for (const [key, node] of nodes.entries()) {
      if (node.isTerminal) continue;

      const candidateQValues: CandidateActionQValue[] = [];
      let bestActionId = '';
      let bestActionName = '';
      let minQ = Infinity;

      for (const [actId, actData] of node.actions.entries()) {
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

    const computePolicyTrust = (): {
      downstreamUnresolved: Map<string, boolean>;
      absorption: Map<string, number>;
      iterations: number;
      residual: number;
      converged: boolean;
    } => {
      const downstreamUnresolved = new Map<string, boolean>();
      for (const [key, node] of nodes) {
        if (node.isTerminal) {
          downstreamUnresolved.set(key, false);
          continue;
        }
        const decision = policyMap.get(key);
        const action = decision ? node.actions.get(decision.bestActionId) : undefined;
        downstreamUnresolved.set(
          key,
          !action || action.transitions.some((transition) => !nodes.has(transition.targetKey))
        );
      }
      for (let pass = 0; pass < nodes.size; pass++) {
        let changed = false;
        for (const [key, node] of nodes) {
          if (node.isTerminal || downstreamUnresolved.get(key)) continue;
          const decision = policyMap.get(key);
          const action = decision ? node.actions.get(decision.bestActionId) : undefined;
          if (!action || action.transitions.some((transition) => downstreamUnresolved.get(transition.targetKey))) {
            downstreamUnresolved.set(key, true);
            changed = true;
          }
        }
        if (!changed) break;
      }

      const absorption = new Map<string, number>();
      for (const [key, node] of nodes) absorption.set(key, node.isTerminal ? 1 : 0);
      let absorptionIterations = 0;
      let absorptionResidual = Infinity;
      const maxMarkovIterations = effectiveOptions.maxMarkovIterations ?? 5000;
      for (; absorptionIterations < maxMarkovIterations; absorptionIterations++) {
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
      return {
        downstreamUnresolved,
        absorption,
        iterations: Math.min(absorptionIterations + 1, maxMarkovIterations),
        residual: absorptionResidual,
        converged: absorptionResidual < 1e-10,
      };
    };

    const classifyCandidates = (trust: ReturnType<typeof computePolicyTrust>): boolean => {
      let policyChanged = false;
      for (const [key, decision] of policyMap) {
        const node = nodes.get(key)!;
        for (const candidate of decision.candidateQValues) {
          const action = node.actions.get(candidate.actionId)!;
          const directMissing = action.transitions.filter((transition) => !nodes.has(transition.targetKey)).length;
          const downstreamMissing = action.transitions.some(
            (transition) => nodes.has(transition.targetKey) && trust.downstreamUnresolved.get(transition.targetKey)
          );
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
    for (let pass = 0; pass < nodes.size; pass++) {
      const changed = classifyCandidates(policyTrust);
      if (!changed) {
        candidateResolutionConverged = true;
        break;
      }
      policyTrust = computePolicyTrust();
    }

    for (const decision of policyMap.values()) {
      const resolvedIncumbent = decision.candidateQValues
        .filter((candidate) => candidate.status === 'RESOLVED' && Number.isFinite(candidate.totalQValueChaos))
        .sort((a, b) => a.totalQValueChaos - b.totalQValueChaos)[0];
      const incumbent = resolvedIncumbent?.totalQValueChaos ?? Infinity;
      for (const candidate of decision.candidateQValues) {
        if (candidate.status !== 'UNRESOLVED') continue;
        candidate.couldBeatResolvedIncumbent = candidate.lowerBoundChaos < incumbent;
        if (!candidate.couldBeatResolvedIncumbent && Number.isFinite(incumbent)) {
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

    // ------------------------------------------------------------- On-Policy Reachability Analysis
    // Trace all states reachable under the selected policy pi*(s) from startKey
    const onPolicyReachableKeys = new Set<string>();
    const onPolicyQueue: string[] = [startKey];
    onPolicyReachableKeys.add(startKey);

    let onPolicyTerminalStates = 0;
    let onPolicyUnresolvedTransitions = 0;
    let onPolicyUnresolvedProbMass = 0;

    while (onPolicyQueue.length > 0) {
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
      hasCycles: directedGraphHasCycle(onPolicyAdjacency),
      isProper,
      isFullyResolved,
    };

    // Compute Expected Currency Usage via Markov Visit Frequencies on on-policy graph
    const expectedVisits = new Map<string, number>();
    for (const key of onPolicyReachableKeys) expectedVisits.set(key, 0);
    expectedVisits.set(startKey, 1.0);

    let visitIteration = 0;
    let visitMaxResidual = 0;
    for (; visitIteration < (effectiveOptions.maxMarkovIterations ?? 1000); visitIteration++) {
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

      const currency = currencyByActionId[decision.bestActionId] ?? decision.bestActionId;
      expectedCurrencies[currency] = (expectedCurrencies[currency] ?? 0) + visits;
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
    const visitConverged = visitMaxResidual < 1e-6;
    const isReconciled = onPolicyGraph.isProper && visitConverged && reconciliationDiff < 0.05;

    const onPolicyDecisions = [...policyMap.values()].filter((decision) => onPolicyReachableKeys.has(decision.stateKey));
    const unresolvedCompetitors = onPolicyDecisions.flatMap((decision) =>
      decision.candidateQValues.filter((candidate) => candidate.status === 'UNRESOLVED')
    );
    const potentiallyCompetitiveUnresolved = unresolvedCompetitors.filter(
      (candidate) => candidate.couldBeatResolvedIncumbent
    );
    const modeledOptimalityProven =
      !graphResult.hitStateLimit &&
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

    const steps: GenericSearchStep[] = [];
    const startDecision = policyMap.get(startKey);
    if (startDecision) {
      const startNode = nodes.get(startKey);
      steps.push({
        stateDescription: `${startState.rarity.toUpperCase()} jewel (0 affixes)`,
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
    lines.push(`1. Reachable Canonical States: ${nodes.size} states explored across ${iteration} iterations.`);
    lines.push(`2. On-Policy Reachable States: ${onPolicyGraph.onPolicyReachableStates} states (${onPolicyGraph.isFullyResolved ? 'fully resolved' : 'unresolved'} on policy).`);
    lines.push(`3. Start State EV: ${totalExpectedCostChaos.toFixed(2)}c (~${(totalExpectedCostChaos / (this.context.priceBook.getRate('divine') || 200)).toFixed(3)} div).`);
    lines.push(`4. Selected policy: ${optimalityProof.selectedPolicyStatus}.`);
    lines.push(`5. Proof level: ${optimalityProof.proofLevel}; GLOBAL OPTIMALITY: ${optimalityProof.globalOptimality}.`);

    return {
      startingState: startState,
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
        iterations: Math.min(iteration, maxIterations),
        converged: valueIterationConverged,
        finalMaxResidual: maxDelta,
        epsilon,
        maxIterations,
      },
      reconciliation: {
        sumExpectedActionCostChaos,
        reportedDownstreamEVChaos: totalExpectedCostChaos,
        differenceChaos: reconciliationDiff,
        isReconciled,
        visitIterations: Math.min(visitIteration, effectiveOptions.maxMarkovIterations ?? 1000),
        visitMaxResidual,
        visitConverged,
      },
      optimalityProof,
      priceConfidence,
      isTargetSatisfied,
      explanation: lines.join('\n'),
    };
  }
}
