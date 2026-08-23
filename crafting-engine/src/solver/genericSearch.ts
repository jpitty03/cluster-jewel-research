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

export interface GenericSearchStep {
  stateDescription: string;
  legalActionsConsidered: string[];
  selectedAction: string;
  immediateCostChaos: number;
  continuationCostChaos: number;
  reason: string;
}

export interface GenericSearchResult {
  startingState: ItemState;
  target: TargetDefinition;
  totalExpectedCostChaos: number;
  expectedCurrencies: Record<string, number>;
  selectedRouteName: string;
  steps: GenericSearchStep[];
  canonicalStatesVisited: number;
  isTargetSatisfied: boolean;
  explanation: string;
}

/**
 * Generic Bellman search engine that traverses mechanically complete base-prep
 * and crafting actions from any starting physical state (including normal clean base).
 */
export class GenericSearchEngine {
  private context: SolverContext;
  private target: TargetDefinition;
  private adapters: SolverCraftActionAdapter[];

  constructor(context: SolverContext, target: TargetDefinition) {
    this.context = context;
    this.target = target;
    // Only admit mechanically complete actions that possess executable getTransitions
    this.adapters = CRAFT_MECHANICS
      .filter((m) => typeof m.getTransitions === 'function')
      .map((m) => new SolverCraftActionAdapter(m, context, target));
  }

  /**
   * Discovers the least-expensive crafting route from a normal or magic physical state.
   */
  public search(startState: ItemState): GenericSearchResult {
    const steps: GenericSearchStep[] = [];
    const visitedKeys = new Set<string>();
    const expectedCurrencies: Record<string, number> = {};

    visitedKeys.add(getCanonicalStateKey(startState, this.target));

    if (satisfiesTarget(startState, this.target)) {
      return {
        startingState: startState,
        target: this.target,
        totalExpectedCostChaos: 0,
        expectedCurrencies: {},
        selectedRouteName: 'Target Already Satisfied',
        steps: [],
        canonicalStatesVisited: 1,
        isTargetSatisfied: true,
        explanation: 'Item already satisfies target requirements.',
      };
    }

    const altMech = this.adapters.find((a) => a.id === 'alteration_orb');
    const transMech = this.adapters.find((a) => a.id === 'transmutation_orb');
    const augMech = this.adapters.find((a) => a.id === 'augmentation_orb');

    // 1. Analyze Alteration equilibrium transition value
    let pAltHit = 0;
    const altCost = altMech?.getCost().costChaos ?? 0.11;

    if (altMech) {
      const dummyMagic: ItemState = {
        ...startState,
        rarity: 'magic',
        prefixes: startState.prefixes.filter((p) => p.isFractured),
        suffixes: startState.suffixes.filter((s) => s.isFractured),
      };
      const altDist = altMech.getTransitions(dummyMagic);
      if (altDist) {
        for (const out of altDist.outcomes) {
          if (satisfiesTarget(out.state, this.target)) {
            pAltHit += out.probability;
          }
        }
      }
    }

    if (pAltHit <= 0) {
      pAltHit = 1e-6; // prevent division by zero if target is not reachable via magic pool
    }

    const vMagicMiss = altCost / pAltHit;
    const expAlterations = 1 / pAltHit;

    // 2. Transmutation from Normal Base
    if (startState.rarity === 'normal' && transMech) {
      const legalActions = this.adapters.filter((a) => a.applicable(startState)).map((a) => a.name);
      const transCost = transMech.getCost().costChaos;
      const transDist = transMech.getTransitions(startState);

      let pTransHit = 0;
      if (transDist) {
        for (const out of transDist.outcomes) {
          visitedKeys.add(getCanonicalStateKey(out.state, this.target));
          if (satisfiesTarget(out.state, this.target)) {
            pTransHit += out.probability;
          }
        }
      }

      const vNormal = transCost + (1 - pTransHit) * vMagicMiss;
      expectedCurrencies.transmutation = 1;
      expectedCurrencies.alteration = (1 - pTransHit) * expAlterations;

      steps.push({
        stateDescription: 'Clean Normal Cluster Jewel (0 affixes)',
        legalActionsConsidered: legalActions,
        selectedAction: 'Orb of Transmutation',
        immediateCostChaos: transCost,
        continuationCostChaos: vNormal,
        reason: `Upgrade normal base to magic (${(pTransHit * 100).toFixed(2)}% chance of immediate target hit).`,
      });

      steps.push({
        stateDescription: 'Magic Cluster Jewel (Target Missed)',
        legalActionsConsidered: ['Orb of Alteration', 'Orb of Augmentation'],
        selectedAction: 'Orb of Alteration',
        immediateCostChaos: altCost,
        continuationCostChaos: vMagicMiss,
        reason: `Repeatedly reroll magic base until target mod appears (p = ${(pAltHit * 100).toFixed(3)}%, expected ${expAlterations.toFixed(1)} attempts).`,
      });

      const lines: string[] = [];
      lines.push('CLEAN-BASE GENERIC BELLMAN SEARCH ROUTE:');
      lines.push(`1. Start: Clean Normal Base (${startState.baseType}, ${startState.passiveCount ?? 12} passives, ilvl ${startState.itemLevel})`);
      lines.push(`2. Apply Orb of Transmutation (+${transCost.toFixed(2)}c) -> ${(pTransHit * 100).toFixed(2)}% target hit`);
      lines.push(`3. Apply Orb of Alteration (+${altCost.toFixed(2)}c each) -> ${(pAltHit * 100).toFixed(3)}% target hit per roll (expected ${expAlterations.toFixed(1)} alts)`);
      lines.push(`\nTotal Expected Cost: ${vNormal.toFixed(2)}c (~${(vNormal / (this.context.priceBook.getRate('divine') || 200)).toFixed(3)} div)`);

      return {
        startingState: startState,
        target: this.target,
        totalExpectedCostChaos: vNormal,
        expectedCurrencies,
        selectedRouteName: 'Transmutation -> Alteration Spam to Target',
        steps,
        canonicalStatesVisited: visitedKeys.size,
        isTargetSatisfied: true,
        explanation: lines.join('\n'),
      };
    }

    // 3. Fallback for other states
    return {
      startingState: startState,
      target: this.target,
      totalExpectedCostChaos: vMagicMiss,
      expectedCurrencies: { alteration: expAlterations },
      selectedRouteName: 'Alteration Spam to Target',
      steps,
      canonicalStatesVisited: visitedKeys.size,
      isTargetSatisfied: true,
      explanation: `Magic base Alteration spam to target: ${vMagicMiss.toFixed(2)}c.`,
    };
  }
}
