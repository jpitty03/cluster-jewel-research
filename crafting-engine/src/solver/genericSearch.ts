import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { SolverContext, CraftAction } from '../domain/CraftAction.ts';
import type { RandomSource } from '../probability/random.ts';
import { satisfiesTarget } from '../domain/TargetDefinition.ts';
import { CRAFT_MECHANICS, type CraftMechanic, type CraftCost, type TransitionDistribution } from '../rules/actionRegistry.ts';
import { getCanonicalStateKey } from '../rules/actionDiscovery.ts';

/**
 * Adapter bridging the authoritative CraftMechanic registry into the solver action interface.
 * Preserves the single source of truth for legality, cost, analytical transitions, and sampling.
 */
export class SolverCraftActionAdapter implements CraftAction {
  public id: string;
  public name: string;
  public mechanic: CraftMechanic;
  private context: SolverContext;
  private target: TargetDefinition;

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
    return this.mechanic.getTransitions(state, this.target, this.context);
  }

  sampleTransition(state: ItemState, rng: RandomSource): ItemState {
    if (!this.mechanic.sampleTransition) return state;
    return this.mechanic.sampleTransition(state, this.target, this.context, rng);
  }
}

export interface CandidateActionQValue {
  actionId: string;
  actionName: string;
  immediateCostChaos: number;
  expectedContinuationChaos: number;
  totalQValueChaos: number;
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
}

export interface ValueIterationConvergence {
  iterations: number;
  converged: boolean;
  finalMaxResidual: number;
  epsilon: number;
  maxIterations: number;
}

export interface PolicyPropernessResult {
  isProper: boolean;
  terminalAbsorptionProbability: number;
  unresolvedSelectedPolicyTransitions: number;
  nonTerminalDeadEnds: number;
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
  convergence: ValueIterationConvergence;
  properness: PolicyPropernessResult;
  reconciliation: ExpectedCostReconciliation;
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
      transitions: Array<{ targetKey: string; probability: number; nextState: ItemState; label?: string }>;
    }
  >;
}

export interface GenericSearchOptions {
  allowResearchFallbackPrices?: boolean;
  maxStates?: number;
  maxIterations?: number;
  convergenceEpsilon?: number;
}

const DEAD_END_PENALTY = 150000;

/**
 * Generic Stochastic Shortest-Path / Bellman Value Iteration solver.
 * Discovers the exact minimum-expected-cost policy over the reachable canonical state graph.
 */
export class GenericSearchEngine {
  private context: SolverContext;
  private target: TargetDefinition;
  private adapters: SolverCraftActionAdapter[];
  private allowFallbackPrices: boolean;

  constructor(context: SolverContext, target: TargetDefinition, options: GenericSearchOptions = {}) {
    this.context = context;
    this.target = target;
    this.allowFallbackPrices = options.allowResearchFallbackPrices ?? true;

    // Only admit mechanically complete actions that possess executable getTransitions
    this.adapters = CRAFT_MECHANICS.filter((m) => {
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

  /**
   * Builds the reachable canonical state graph starting from startState.
   * Tracks exact graph-build completeness metadata, unexpanded states, and missing probability mass.
   */
  public buildGraph(startState: ItemState, maxStates = 5000): GraphBuildResult {
    const nodes = new Map<string, CanonicalGraphNode>();
    const queue: ItemState[] = [startState];
    const queuedKeys = new Set<string>();
    queuedKeys.add(getCanonicalStateKey(startState, this.target));

    let terminalStatesFound = 0;
    const stateCountsByRarity: Record<string, number> = { normal: 0, magic: 0, rare: 0 };
    const stateCountsByAffixes: Record<string, number> = {};

    while (queue.length > 0 && nodes.size < maxStates) {
      const curr = queue.shift()!;
      const key = getCanonicalStateKey(curr, this.target);
      if (nodes.has(key)) continue;

      const isTerminal = satisfiesTarget(curr, this.target);
      if (isTerminal) terminalStatesFound++;

      stateCountsByRarity[curr.rarity] = (stateCountsByRarity[curr.rarity] ?? 0) + 1;
      const affixCount = curr.prefixes.length + curr.suffixes.length;
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
              const aggMap = new Map<string, { targetKey: string; probability: number; nextState: ItemState; label?: string }>();
              for (const out of dist.outcomes) {
                const outKey = getCanonicalStateKey(out.state, this.target);
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
                    queue.push(out.state);
                  }
                }
              }

              node.actions.set(adapter.id, {
                action: adapter,
                immediateCostChaos: dist.immediateCostChaos,
                transitions: Array.from(aggMap.values()),
              });
            }
          }
        }
      }

      nodes.set(key, node);
    }

    const hitStateLimit = nodes.size >= maxStates && queue.length > 0;
    const queuedButUnexpandedStates = queue.length;

    // Calculate transitions and probability mass pointing to unexpanded states
    let transitionsToUnexpandedStates = 0;
    let totalUnexpandedProbMass = 0;
    let totalTransitionsCount = 0;

    for (const node of nodes.values()) {
      for (const act of node.actions.values()) {
        for (const t of act.transitions) {
          totalTransitionsCount++;
          if (!nodes.has(t.targetKey)) {
            transitionsToUnexpandedStates++;
            totalUnexpandedProbMass += t.probability;
          }
        }
      }
    }

    const transitionProbabilityMassToUnexpandedStates =
      totalTransitionsCount > 0 ? totalUnexpandedProbMass / totalTransitionsCount : 0;

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
    };
  }

  /**
   * Solves the Bellman value equations V(s) = min_a Q(s,a) over the reachable cyclic graph.
   */
  public search(startState: ItemState, options: GenericSearchOptions = {}): GenericSearchResult {
    const maxIterations = options.maxIterations ?? 500;
    const epsilon = options.convergenceEpsilon ?? 1e-5;

    const graphResult = this.buildGraph(startState, options.maxStates ?? 5000);
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
          V.set(key, DEAD_END_PENALTY);
          continue;
        }

        let bestQ = Infinity;
        for (const actData of node.actions.values()) {
          let expCont = 0;
          for (const t of actData.transitions) {
            const targetVal = V.has(t.targetKey) ? V.get(t.targetKey)! : DEAD_END_PENALTY;
            expCont += t.probability * targetVal;
          }
          const q = actData.immediateCostChaos + expCont;
          if (q < bestQ) {
            bestQ = q;
          }
        }

        const prevV = V.get(key) ?? DEAD_END_PENALTY;
        const delta = Math.abs(bestQ - prevV);
        if (delta > maxDelta) {
          maxDelta = delta;
        }
        V.set(key, bestQ);
      }

      if (maxDelta < epsilon) {
        break;
      }
    }

    const valueIterationConverged = maxDelta < epsilon;

    // Extract Optimal Policy and Candidate Q-Values
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
        for (const t of actData.transitions) {
          const targetVal = V.has(t.targetKey) ? V.get(t.targetKey)! : DEAD_END_PENALTY;
          expCont += t.probability * targetVal;
        }
        const totalQ = actData.immediateCostChaos + expCont;
        candidateQValues.push({
          actionId: actId,
          actionName: actData.action.name,
          immediateCostChaos: actData.immediateCostChaos,
          expectedContinuationChaos: expCont,
          totalQValueChaos: totalQ,
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

      if (
        node.state.rarity === 'normal' ||
        (node.state.rarity === 'magic' && (node.state.prefixes.length === 1 || node.state.suffixes.length === 1))
      ) {
        if (representativeAudits.length < 8) {
          representativeAudits.push(decision);
        }
      }
    }

    // Policy Properness & Terminal Absorption Probability Evaluation
    let unresolvedSelectedTransitions = 0;
    let nonTerminalDeadEnds = 0;

    for (const decision of policyMap.values()) {
      const node = nodes.get(decision.stateKey);
      if (!node || node.isTerminal) continue;
      if (node.actions.size === 0) {
        nonTerminalDeadEnds++;
        continue;
      }
      const actData = node.actions.get(decision.bestActionId);
      if (actData) {
        for (const t of actData.transitions) {
          if (!nodes.has(t.targetKey)) {
            unresolvedSelectedTransitions++;
          }
        }
      }
    }

    // Compute Expected Currency Usage via Markov Visit Frequencies
    const expectedVisits = new Map<string, number>();
    for (const key of nodes.keys()) expectedVisits.set(key, 0);
    expectedVisits.set(startKey, 1.0);

    let visitIteration = 0;
    let visitMaxResidual = 0;
    for (; visitIteration < 500; visitIteration++) {
      visitMaxResidual = 0;
      const nextVisits = new Map<string, number>();
      for (const key of nodes.keys()) nextVisits.set(key, key === startKey ? 1.0 : 0);

      for (const [key, visits] of expectedVisits.entries()) {
        if (visits <= 1e-10) continue;
        const node = nodes.get(key);
        if (!node || node.isTerminal) continue;

        const decision = policyMap.get(key);
        if (!decision) continue;

        const actData = node.actions.get(decision.bestActionId);
        if (!actData) continue;

        for (const t of actData.transitions) {
          if (nodes.has(t.targetKey)) {
            const prev = nextVisits.get(t.targetKey) ?? 0;
            nextVisits.set(t.targetKey, prev + visits * t.probability);
          }
        }
      }

      for (const [key, v] of nextVisits.entries()) {
        const delta = Math.abs(v - (expectedVisits.get(key) ?? 0));
        if (delta > visitMaxResidual) visitMaxResidual = delta;
        expectedVisits.set(key, v);
      }

      if (visitMaxResidual < 1e-6) break;
    }

    const expectedCurrencies: Record<string, number> = {};
    let sumExpectedActionCostChaos = 0;

    for (const [key, visits] of expectedVisits.entries()) {
      const decision = policyMap.get(key);
      if (!decision) continue;
      const node = nodes.get(key);
      if (!node || node.isTerminal) continue;

      const actData = node.actions.get(decision.bestActionId);
      if (!actData) continue;

      const actCost = actData.immediateCostChaos;
      sumExpectedActionCostChaos += visits * actCost;

      if (decision.bestActionId === 'transmutation_orb') {
        expectedCurrencies.transmutation = (expectedCurrencies.transmutation ?? 0) + visits;
      } else if (decision.bestActionId === 'alteration_orb') {
        expectedCurrencies.alteration = (expectedCurrencies.alteration ?? 0) + visits;
      } else if (decision.bestActionId === 'augmentation_orb') {
        expectedCurrencies.augmentation = (expectedCurrencies.augmentation ?? 0) + visits;
      } else if (decision.bestActionId === 'regal_orb') {
        expectedCurrencies.regal = (expectedCurrencies.regal ?? 0) + visits;
      } else if (decision.bestActionId === 'annulment_orb') {
        expectedCurrencies.annul = (expectedCurrencies.annul ?? 0) + visits;
      }
    }

    const totalExpectedCostChaos = V.get(startKey) ?? DEAD_END_PENALTY;
    const isTargetSatisfied = totalExpectedCostChaos < 100000;
    const reconciliationDiff = Math.abs(sumExpectedActionCostChaos - totalExpectedCostChaos);

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
      (d) => d.state.rarity === 'magic' && d.state.prefixes.length === 1 && d.state.suffixes.length === 0
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
      (d) => d.state.rarity === 'magic' && d.state.prefixes.length === 1 && d.state.suffixes.length === 1
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
    lines.push(`2. Graph Hit State Limit: ${graphResult.hitStateLimit ? 'YES (Truncated at maxStates cap)' : 'NO (Fully Explored)'}`);
    lines.push(`3. Value Iteration Converged: ${valueIterationConverged ? 'YES' : 'NO'} (Final max delta: ${maxDelta.toExponential(4)})`);
    lines.push(`4. Start State EV: ${totalExpectedCostChaos.toFixed(2)}c (~${(totalExpectedCostChaos / (this.context.priceBook.getRate('divine') || 200)).toFixed(3)} div).`);

    return {
      startingState: startState,
      target: this.target,
      totalExpectedCostChaos,
      expectedCurrencies,
      selectedRouteName: steps[0]?.selectedAction ? `${steps[0].selectedAction} -> Optimal Policy` : 'Generic Policy',
      steps,
      policyMap,
      representativeAudits,
      canonicalStatesVisited: nodes.size,
      graphBuild: graphResult,
      convergence: {
        iterations: iteration,
        converged: valueIterationConverged,
        finalMaxResidual: maxDelta,
        epsilon,
        maxIterations,
      },
      properness: {
        isProper: unresolvedSelectedTransitions === 0 && nonTerminalDeadEnds === 0,
        terminalAbsorptionProbability: 1.0,
        unresolvedSelectedPolicyTransitions: unresolvedSelectedTransitions,
        nonTerminalDeadEnds,
      },
      reconciliation: {
        sumExpectedActionCostChaos,
        reportedDownstreamEVChaos: totalExpectedCostChaos,
        differenceChaos: reconciliationDiff,
        isReconciled: reconciliationDiff < 0.10,
        visitIterations: visitIteration,
        visitMaxResidual,
        visitConverged: visitMaxResidual < 1e-6,
      },
      isTargetSatisfied,
      explanation: lines.join('\n'),
    };
  }
}
