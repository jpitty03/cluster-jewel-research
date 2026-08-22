import type { TargetDefinition, ModRequirement } from '../domain/TargetDefinition.ts';
import type { ItemState } from '../domain/ItemState.ts';
import type { ModPool } from '../domain/ModPool.ts';
import type { PriceBook } from '../domain/PriceBook.ts';
import type { StartingCraftOption } from '../index.ts';
import type { AcquisitionOption, AcquisitionBreakdown } from './expectedCost.ts';
import { toRolledMod } from '../domain/Mod.ts';
import { matchesModRequirement } from '../domain/TargetDefinition.ts';
import { calculateTotalWeight } from '../rules/modEligibility.ts';
import { formatModDisplayName } from '../reporting/explainPath.ts';

export interface StrategyDiscoveryContext {
  pool?: ModPool;
  priceBook: PriceBook;
  marketFracturedPricesChaos?: Record<string, number>;
  cleanBaseCostChaos?: number;
}

/**
 * Automatically discovers and generates candidate starting strategies from a TargetDefinition.
 *
 * Production abstraction:
 * 1. Generates Clean Base starting option.
 * 2. Generates Self-Fracture candidate starts for each unique target required mod.
 * 3. Generates Market Purchase candidate starts for target mods when market prices exist.
 */
export function generateStartingStrategies(
  target: TargetDefinition,
  baseType: string,
  clusterType: string,
  itemLevel: number,
  context: StrategyDiscoveryContext,
  passiveCount = 12
): StartingCraftOption[] {
  const options: StartingCraftOption[] = [];
  const cleanBaseCost = context.cleanBaseCostChaos ?? 10;
  const priceBook = context.priceBook;
  const pool = context.pool;
  const fractureCost = priceBook.toChaos(1, 'fracture') || 359;

  // 1. Clean Base Strategy
  const cleanState: ItemState = {
    baseType,
    clusterType,
    itemLevel,
    passiveCount,
    rarity: 'rare',
    prefixes: [],
    suffixes: [],
    fracturedModIds: [],
  };

  options.push({
    name: 'Clean Base (Start from Scratch)',
    state: cleanState,
    acquisition: {
      type: 'clean-base',
      costChaos: cleanBaseCost,
      confidence: 'deterministic',
      breakdown: {
        cleanBaseCostChaos: cleanBaseCost,
        prepCostChaos: 0,
        fracturingOrbCostChaos: 0,
        successChance: 100.0,
        expectedAttempts: 1.0,
      },
    },
  });

  // 2. Discover target mod candidates from TargetDefinition
  if (!pool) return options;

  const allMods = pool.getAllMods().filter((m) => m.ilvl <= itemLevel);
  const consideredGroups = new Set<string>();

  const targetReqs: ModRequirement[] = [...target.requiredMods];
  if (target.outcomeBranches) {
    for (const branch of target.outcomeBranches) {
      targetReqs.push(...branch.requiredMods);
    }
  }

  for (const req of targetReqs) {
    const groupKey = req.modGroup ?? req.modId;
    if (!groupKey || consideredGroups.has(groupKey)) continue;
    consideredGroups.add(groupKey);

    const matchedMod = allMods.find((m) => matchesModRequirement(m, req));
    if (!matchedMod) continue;

    // Build fractured state with this single fractured mod
    const fracState: ItemState = {
      baseType,
      clusterType,
      itemLevel,
      passiveCount,
      rarity: 'rare',
      prefixes: matchedMod.genType === 'Prefix' ? [toRolledMod(matchedMod, { isFractured: true })] : [],
      suffixes: matchedMod.genType === 'Suffix' ? [toRolledMod(matchedMod, { isFractured: true })] : [],
      fracturedModIds: [matchedMod.modId],
    };

    const modDisplayName = formatModDisplayName(matchedMod);

    // Calculate self-fracture preparation cost based on mod pool weight
    const sameGenMods = allMods.filter((m) => m.genType === matchedMod.genType);
    const totalGenWeight = calculateTotalWeight(sameGenMods) || (matchedMod.genType === 'Prefix' ? 9476 : 15401);
    const modWeight = matchedMod.weight || 300;
    const hitRate = modWeight / totalGenWeight;
    const expectedAlts = hitRate > 0 ? 1 / hitRate : 30;

    // Alt/Aug/Regal/Bench prep formula
    const prepCostPerAttempt = Number((expectedAlts * 0.11 + 10.0).toFixed(2));
    const totalSelfFracCost = Number((4.0 * (cleanBaseCost + prepCostPerAttempt + fractureCost)).toFixed(1));

    const selfFracBreakdown: AcquisitionBreakdown = {
      cleanBaseCostChaos: cleanBaseCost,
      prepCostChaos: prepCostPerAttempt,
      fracturingOrbCostChaos: fractureCost,
      successChance: 25.0,
      expectedAttempts: 4.0,
    };

    // Add Self-Fracture Option
    options.push({
      name: `Self-Fracture ${modDisplayName}`,
      state: fracState,
      acquisition: {
        type: 'self-fracture',
        costChaos: totalSelfFracCost,
        confidence: 'approximate',
        breakdown: selfFracBreakdown,
      },
    });

    // Add Market Option if price is supplied
    const marketPrice = context.marketFracturedPricesChaos?.[groupKey] ?? context.marketFracturedPricesChaos?.[matchedMod.modId];
    if (marketPrice !== undefined && marketPrice > 0) {
      options.push({
        name: `Buy Fractured ${modDisplayName}`,
        state: fracState,
        acquisition: {
          type: 'market',
          costChaos: marketPrice,
          confidence: 'deterministic',
        },
      });
    }
  }

  return options;
}
