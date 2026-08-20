import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { SolverContext, CraftAction } from '../domain/CraftAction.ts';
import {
  ExpectedCostSolver,
  type CraftPlanStep,
  type StartingOptionAnalysis,
  type FinalOutcomeDistribution,
} from './expectedCost.ts';
import { ExaltAction } from '../actions/exalt.ts';
import { AnnulAction } from '../actions/annul.ts';
import { HarvestReforgeAction } from '../actions/harvestReforge.ts';
import { AllflamePlugin } from '../plugins/allflame/index.ts';

export interface StartingStrategyResult {
  strategyName: string;
  baseCostChaos: number;
  expectedCraftingCostChaos: number;
  totalExpectedCostChaos: number;
  expectedCurrencies: Record<string, number>;
  expectedProfitChaos?: number;
  roi?: number;
  expectedSaleValueChaos?: number;
  outcomeDistribution?: FinalOutcomeDistribution[];
  steps?: CraftPlanStep[];
  step1Options?: StartingOptionAnalysis[];
  isValidated: boolean;
}

export class CraftEvaluator {
  private context: SolverContext;
  private target: TargetDefinition;
  private allflameEnabled: boolean;

  constructor(context: SolverContext, target: TargetDefinition, allflameEnabled = false) {
    this.context = context;
    this.target = target;
    this.allflameEnabled = allflameEnabled;
  }

  evaluateStartingStrategy(
    strategyName: string,
    startState: ItemState,
    baseCostChaos: number,
    saleValueChaos?: number
  ): StartingStrategyResult {
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

    const solver = new ExpectedCostSolver(this.context, this.target, actions);
    const result = solver.solve(startState, baseCostChaos);

    const expectedCraftingCostChaos = result.expectedCostChaos;
    const totalExpectedCostChaos = baseCostChaos + expectedCraftingCostChaos;

    const effectiveSaleValue = saleValueChaos ?? result.expectedSaleValueChaos;
    let expectedProfitChaos: number | undefined;
    let roi: number | undefined;

    if (effectiveSaleValue !== undefined) {
      expectedProfitChaos = effectiveSaleValue - totalExpectedCostChaos;
      roi = totalExpectedCostChaos > 0 ? (expectedProfitChaos / totalExpectedCostChaos) * 100 : 0;
    }

    return {
      strategyName,
      baseCostChaos,
      expectedCraftingCostChaos,
      totalExpectedCostChaos,
      expectedCurrencies: result.expectedCurrencies,
      expectedProfitChaos,
      roi,
      expectedSaleValueChaos: effectiveSaleValue,
      outcomeDistribution: result.outcomeDistribution,
      steps: result.steps,
      step1Options: result.step1Options,
      isValidated: true,
    };
  }
}
