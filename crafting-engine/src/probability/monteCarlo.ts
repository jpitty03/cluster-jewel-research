import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { SolverContext, CraftAction } from '../domain/CraftAction.ts';
import { satisfiesTarget } from '../domain/TargetDefinition.ts';
import { DivineAction } from '../actions/divine.ts';
import { ExaltAction } from '../actions/exalt.ts';
import { AnnulAction } from '../actions/annul.ts';
import { HarvestReforgeAction } from '../actions/harvestReforge.ts';
import { AllflamePlugin } from '../plugins/allflame/index.ts';

export interface SimulationResult {
  trials: number;
  meanCostChaos: number;
  medianCostChaos: number;
  p75CostChaos: number;
  p90CostChaos: number;
  p95CostChaos: number;
  currencyAverages: Record<string, number>;
}

export class MonteCarloSimulator {
  private context: SolverContext;
  private target: TargetDefinition;
  private allflameEnabled: boolean;
  private divineAction = new DivineAction();

  constructor(context: SolverContext, target: TargetDefinition, allflameEnabled = false) {
    this.context = context;
    this.target = target;
    this.allflameEnabled = allflameEnabled;
  }

  runSimulation(
    startStateFactory: () => ItemState,
    baseCostChaos: number,
    numTrials = 10000
  ): SimulationResult {
    let actions: CraftAction[] = [
      new ExaltAction(),
      new AnnulAction(),
      new HarvestReforgeAction('Defence'),
      new HarvestReforgeAction('Attribute'),
    ];

    if (this.allflameEnabled) {
      const plugin = new AllflamePlugin(true);
      actions = plugin.transformActions(actions, this.context);
    }

    const exaltAction = actions.find((a) => a.id.includes('exalt'))!;
    const annulAction = actions.find((a) => a.id === 'annul')!;
    const harvestDefence = actions.find((a) => a.id.includes('defence'))!;

    const costs: number[] = [];
    const currencyTotals: Record<string, number> = {};

    for (let trial = 0; trial < numTrials; trial++) {
      let state = startStateFactory();
      let trialCostChaos = baseCostChaos;
      const trialCurrencies: Record<string, number> = {};

      let steps = 0;
      const maxSteps = 1000;

      while (!satisfiesTarget(state, this.target) && steps < maxSteps) {
        steps++;

        // Crafting strategy policy execution:
        // 1. If prefixes missing T1 ES -> Harvest Reforge Defence
        const hasT1ES = state.prefixes.some(
          (p) => p.modGroup === 'AfflictionJewelSmallPassivesGrantES' && p.tier === 1
        );

        if (!hasT1ES) {
          const outcomes = harvestDefence.outcomes(state, this.context);
          state = this.sampleOutcome(outcomes);
          trialCostChaos += this.context.priceBook.toChaos(75, 'primalLifeforce');
          trialCurrencies.primalLifeforce = (trialCurrencies.primalLifeforce ?? 0) + 75;
          continue;
        }

        // 2. If junk prefixes or suffixes exist beyond T1 Int + T1 ES -> Annul
        const nonTargetAffixes = [...state.prefixes, ...state.suffixes].filter((m) => {
          if (m.isFractured) return false;
          if (m.modGroup === 'AfflictionJewelSmallPassivesGrantES' && m.tier === 1) return false;
          if (m.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && m.tier === 1) return false;
          if (m.modGroup === 'AfflictionJewelSmallPassivesGrantAttributes' && m.tier === 1) return false;
          return true;
        });

        if (nonTargetAffixes.length > 0) {
          const outcomes = annulAction.outcomes(state, this.context);
          state = this.sampleOutcome(outcomes);
          trialCostChaos += this.context.priceBook.toChaos(1, 'annul');
          trialCurrencies.annul = (trialCurrencies.annul ?? 0) + 1;
          continue;
        }

        // 3. If open slots -> Exalt slam
        if (exaltAction.isAvailable(state, this.context)) {
          const outcomes = exaltAction.outcomes(state, this.context);
          state = this.sampleOutcome(outcomes);
          trialCostChaos += this.context.priceBook.toChaos(1, 'exalt');
          trialCurrencies.exalt = (trialCurrencies.exalt ?? 0) + 1;
          continue;
        }
      }

      // Final Divine finishing
      const finishingDivines = this.divineAction.calculateExpectedFinishingCost(state, this.target);
      trialCostChaos += finishingDivines * this.context.priceBook.getRate('divine');
      trialCurrencies.divine = (trialCurrencies.divine ?? 0) + finishingDivines;

      if (steps < maxSteps) {
        costs.push(trialCostChaos);
        for (const [curr, amount] of Object.entries(trialCurrencies)) {
          currencyTotals[curr] = (currencyTotals[curr] ?? 0) + amount;
        }
      }
    }

    if (costs.length === 0) {
      costs.push(baseCostChaos);
    }

    costs.sort((a, b) => a - b);
    const validCount = costs.length;
    const meanCostChaos = costs.reduce((s, c) => s + c, 0) / validCount;
    const medianCostChaos = costs[Math.floor(validCount * 0.5)];
    const p75CostChaos = costs[Math.floor(validCount * 0.75)];
    const p90CostChaos = costs[Math.floor(validCount * 0.9)];
    const p95CostChaos = costs[Math.floor(validCount * 0.95)];

    const currencyAverages: Record<string, number> = {};
    for (const [curr, total] of Object.entries(currencyTotals)) {
      currencyAverages[curr] = total / validCount;
    }

    return {
      trials: validCount,
      meanCostChaos,
      medianCostChaos,
      p75CostChaos,
      p90CostChaos,
      p95CostChaos,
      currencyAverages,
    };
  }

  private sampleOutcome<T extends { probability: number }>(outcomes: T[]): T['probability'] extends number ? any : never {
    const r = Math.random();
    let cumulative = 0;
    for (const outcome of outcomes) {
      cumulative += outcome.probability;
      if (r <= cumulative) {
        return (outcome as any).state;
      }
    }
    return (outcomes[outcomes.length - 1] as any).state;
  }
}
