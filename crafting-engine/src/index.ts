import { ClusterModRepository } from './data/loadClusterMods.ts';
import { ModPool } from './domain/ModPool.ts';
import { PriceBook } from './domain/PriceBook.ts';
import type { ItemState, BaseType } from './domain/ItemState.ts';
import type { TargetDefinition } from './domain/TargetDefinition.ts';
import { CraftEvaluator, type StartingStrategyResult } from './solver/evaluator.ts';
import { generateCraftExplanation } from './reporting/explainPath.ts';
import { MonteCarloSimulator, type SimulationResult } from './probability/monteCarlo.ts';

export interface OptimizeCraftRequest {
  baseType: BaseType;
  clusterType: string;
  itemLevel: number;
  passiveCount?: number;
  target: TargetDefinition;
  startingStates?: Array<{
    name: string;
    state: ItemState;
    baseCostChaos: number;
  }>;
  saleValueChaos?: number;
  enableAllflame?: boolean;
  priceBook?: PriceBook;
  runMonteCarloValidation?: boolean;
  monteCarloTrials?: number;
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
        const result = evaluator.evaluateStartingStrategy(
          start.name,
          start.state,
          start.baseCostChaos,
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

    const explanation = generateCraftExplanation(recommended, alternates, priceBook);

    let simulationValidation: SimulationResult | undefined;
    if (request.runMonteCarloValidation && request.startingStates && request.startingStates.length > 0) {
      const bestStart = request.startingStates.find((s) => s.name === recommended.strategyName);
      if (bestStart) {
        const mc = new MonteCarloSimulator(context, request.target, request.enableAllflame ?? false);
        simulationValidation = mc.runSimulation(
          () => structuredClone(bestStart.state),
          bestStart.baseCostChaos,
          request.monteCarloTrials ?? 1000
        );
      }
    }

    return {
      recommendedStrategy: recommended,
      alternateStrategies: alternates,
      explanation,
      simulationValidation,
    };
  }
}

export const optimizer = new CraftingOptimizer();
