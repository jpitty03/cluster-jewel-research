import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { SolverContext, CraftAction } from '../domain/CraftAction.ts';
import type { ModPool } from '../domain/ModPool.ts';
import {
  ExpectedCostSolver,
  type CraftPlanStep,
  type AcquisitionOption,
  type FinalOutcomeDistribution,
} from './expectedCost.ts';
import { ExaltAction } from '../actions/exalt.ts';
import { AnnulAction } from '../actions/annul.ts';
import { HarvestReforgeAction } from '../actions/harvestReforge.ts';
import { AllflamePlugin } from '../plugins/allflame/index.ts';
import type {
  CraftingPolicyEngine,
  HarvestStrategyComparison,
  RepresentativeStateAudit,
  SuffixPoolAuditState,
} from './policyEngine.ts';

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
  step1Options?: AcquisitionOption[];
  isValidated: boolean;
  policyEngine?: CraftingPolicyEngine;
  harvestComparison?: HarvestStrategyComparison[];
  representativeDecisions?: RepresentativeStateAudit[];
  suffixPoolAudits?: SuffixPoolAuditState[];
  pool?: ModPool;
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
    const harvestTags = [
      'Defence',
      'Life',
      'Chaos',
      'Attack',
      'Caster',
      'Physical',
      'Fire',
      'Cold',
      'Lightning',
      'Speed',
      'Critical',
    ];

    let actions: CraftAction[] = [
      new ExaltAction(),
      new AnnulAction(),
      ...harvestTags.map((tag) => new HarvestReforgeAction(tag)),
    ];

    if (this.allflameEnabled) {
      const plugin = new AllflamePlugin(true);
      actions = plugin.transformActions(actions, this.context);
    }

    const solver = new ExpectedCostSolver(this.context, this.target, actions);
    const result = solver.solve(startState, baseCostChaos);

    const effectiveAcquisitionCost = baseCostChaos > 0 ? baseCostChaos : (result.step1Options?.[0]?.costChaos ?? 0);
    const totalExpectedCostChaos = effectiveAcquisitionCost + result.expectedCostChaos;
    const expectedCraftingCostChaos = result.expectedCostChaos;

    const effectiveSaleValue = saleValueChaos ?? result.expectedSaleValueChaos;
    let expectedProfitChaos: number | undefined;
    let roi: number | undefined;

    if (effectiveSaleValue !== undefined && effectiveSaleValue > 0) {
      expectedProfitChaos = effectiveSaleValue - totalExpectedCostChaos;
      roi = totalExpectedCostChaos > 0 ? (expectedProfitChaos / totalExpectedCostChaos) * 100 : 0;
    }

    return {
      strategyName,
      baseCostChaos: effectiveAcquisitionCost,
      expectedCraftingCostChaos,
      totalExpectedCostChaos,
      expectedCurrencies: result.expectedCurrencies,
      expectedProfitChaos,
      roi,
      expectedSaleValueChaos: effectiveSaleValue,
      outcomeDistribution: result.outcomeDistribution,
      steps: result.steps,
      step1Options: result.step1Options,
      isValidated: false,
      policyEngine: result.policyEngine,
      harvestComparison: result.harvestComparison,
      representativeDecisions: result.representativeDecisions,
      suffixPoolAudits: result.suffixPoolAudits,
      pool: result.pool ?? this.context.pool,
    };
  }
}
