import { ClusterModRepository } from './data/loadClusterMods.ts';
import { ModPool } from './domain/ModPool.ts';
import { PriceBook } from './domain/PriceBook.ts';
import type { ItemState, BaseType } from './domain/ItemState.ts';
import type { TargetDefinition } from './domain/TargetDefinition.ts';
import { CraftEvaluator, type StartingStrategyResult } from './solver/evaluator.ts';
import type { AcquisitionOption } from './solver/expectedCost.ts';
import { generateCraftExplanation } from './reporting/explainPath.ts';
import { MonteCarloSimulator, type SimulationResult } from './probability/monteCarlo.ts';

export interface StartingCraftOption {
  name: string;
  state: ItemState;
  acquisition?: AcquisitionOption;
  baseCostChaos?: number;
}

export interface OptimizeCraftRequest {
  baseType: BaseType;
  clusterType: string;
  itemLevel: number;
  passiveCount?: number;
  target: TargetDefinition;
  startingStates?: StartingCraftOption[];
  saleValueChaos?: number;
  enableAllflame?: boolean;
  priceBook?: PriceBook;
  runMonteCarloValidation?: boolean;
  monteCarloTrials?: number;
  traceTrialsCount?: number;
  seed?: number;
  rng?: any;
}

export interface OptimizeCraftResponse {
  recommendedStrategy: StartingStrategyResult;
  alternateStrategies: StartingStrategyResult[];
  explanation: string;
  simulationValidation?: SimulationResult;
}

export class CraftingOptimizer {
  private repo: ClusterModRepository;
  private defaultPriceBook: PriceBook;

  constructor(repo?: ClusterModRepository, priceBook?: PriceBook) {
    this.repo = repo ?? new ClusterModRepository();
    this.defaultPriceBook = priceBook ?? new PriceBook();
  }

  optimizeCraft(request: OptimizeCraftRequest): OptimizeCraftResponse {
    const priceBook = request.priceBook ?? this.defaultPriceBook;
    const pool = ModPool.forCluster(this.repo, request.baseType, request.clusterType);
    const context = { pool, priceBook };
    const evaluator = new CraftEvaluator(context, request.target, request.enableAllflame ?? false);

    const evaluatedStrategies: StartingStrategyResult[] = [];

    if (request.startingStates && request.startingStates.length > 0) {
      for (const start of request.startingStates) {
        const acquisitionInput = start.acquisition ?? start.baseCostChaos ?? 0;
        const result = evaluator.evaluateStartingStrategy(
          start.name,
          start.state,
          acquisitionInput,
          request.saleValueChaos
        );
        evaluatedStrategies.push(result);
      }
    } else {
      // Default clean state
      const defaultState: ItemState = {
        baseType: request.baseType,
        clusterType: request.clusterType,
        itemLevel: request.itemLevel,
        passiveCount: request.passiveCount,
        rarity: 'rare',
        prefixes: [],
        suffixes: [],
        fracturedModIds: [],
      };
      const result = evaluator.evaluateStartingStrategy(
        'Clean Base',
        defaultState,
        0,
        request.saleValueChaos
      );
      evaluatedStrategies.push(result);
    }

    evaluatedStrategies.sort((a, b) => a.totalExpectedCostChaos - b.totalExpectedCostChaos);
    const recommended = evaluatedStrategies[0];
    const alternates = evaluatedStrategies.slice(1);

    let simulationValidation: SimulationResult | undefined;
    if (request.runMonteCarloValidation && request.startingStates && request.startingStates.length > 0) {
      const bestStart = request.startingStates.find((s) => s.name === recommended.strategyName) ?? request.startingStates[0];
      if (bestStart) {
        const startCost = bestStart.acquisition?.costChaos ?? bestStart.baseCostChaos ?? recommended.baseCostChaos ?? 0;
        const mc = new MonteCarloSimulator(
          context,
          request.target,
          request.enableAllflame ?? false,
          recommended.policyEngine,
          request.rng ?? request.seed
        );
        simulationValidation = mc.runSimulation(
          bestStart.state,
          request.monteCarloTrials ?? 2000,
          startCost,
          75000,
          undefined,
          recommended.totalExpectedCostChaos
        );

        if (simulationValidation && simulationValidation.meanCostChaos !== undefined) {
          const costDiffPct = (Math.abs(simulationValidation.meanCostChaos - recommended.totalExpectedCostChaos) / recommended.totalExpectedCostChaos) * 100;

          const expPrimal = recommended.expectedCurrencies?.primalLifeforce ? recommended.expectedCurrencies.primalLifeforce / 75 : 0;
          const expWild = recommended.expectedCurrencies?.wildLifeforce ? recommended.expectedCurrencies.wildLifeforce / 75 : 0;
          const expVivid = recommended.expectedCurrencies?.vividLifeforce ? recommended.expectedCurrencies.vividLifeforce / 75 : 0;
          const expH = expPrimal + expWild + expVivid;

          const simPrimal = simulationValidation.currencyAverages?.primalLifeforce ? simulationValidation.currencyAverages.primalLifeforce / 75 : 0;
          const simWild = simulationValidation.currencyAverages?.wildLifeforce ? simulationValidation.currencyAverages.wildLifeforce / 75 : 0;
          const simVivid = simulationValidation.currencyAverages?.vividLifeforce ? simulationValidation.currencyAverages.vividLifeforce / 75 : 0;
          const simH = simPrimal + simWild + simVivid;
          const harvestDiffPct = expH > 0 ? (Math.abs(simH - expH) / expH) * 100 : 0;

          const expA = recommended.expectedCurrencies?.annul ?? 0;
          const simA = simulationValidation.currencyAverages?.annul ?? 0;
          const annulDiffPct = expA > 0 ? (Math.abs(simA - expA) / expA) * 100 : 0;

          const expE = recommended.expectedCurrencies?.exalt ?? 0;
          const simE = simulationValidation.currencyAverages?.exalt ?? 0;
          const exaltDiffPct = expE > 0 ? (Math.abs(simE - expE) / expE) * 100 : 0;

          const zeroFallback = simulationValidation.policyStats.fallbackActionsUsed === 0 && simulationValidation.policyStats.missingPolicyStates === 0;
          const allCountsPass = (expH === 0 || harvestDiffPct <= 10.0) && (expA === 0 || annulDiffPct <= 10.0) && (expE === 0 || exaltDiffPct <= 10.0);

          recommended.isValidated = costDiffPct <= 2.0 && allCountsPass && simulationValidation.completionRate >= 98.0 && zeroFallback;
        }
      }
    }

    const explanation = generateCraftExplanation(recommended, alternates, priceBook, simulationValidation);

    return {
      recommendedStrategy: recommended,
      alternateStrategies: alternates,
      explanation,
      simulationValidation,
    };
  }
}

export const optimizer = new CraftingOptimizer();
