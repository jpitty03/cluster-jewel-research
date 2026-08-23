import type { TargetDefinition, ModRequirement } from '../domain/TargetDefinition.ts';
import type { BaseType, ItemState } from '../domain/ItemState.ts';
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

export interface StartingStateCandidate {
  state: ItemState;
  label: string;
  acquisitions: AcquisitionOption[];
}

/**
 * Discovers and generates physical starting state candidates with their attached acquisition routes
 * from a TargetDefinition.
 *
 * Physical candidate state is separated from acquisition methods (Self-Fracture, Market Purchase).
 */
export function generateStartingStateCandidates(
  target: TargetDefinition,
  baseType: BaseType,
  clusterType: string,
  itemLevel: number,
  context: StrategyDiscoveryContext,
  passiveCount = 12
): StartingStateCandidate[] {
  const candidates: StartingStateCandidate[] = [];
  const cleanBaseCost = context.cleanBaseCostChaos ?? 10;
  const priceBook = context.priceBook;
  const pool = context.pool;
  const fractureCost = priceBook.getRate('fracturing') || 359;

  // 1. Clean Base Physical State
  const cleanState: ItemState = {
    baseType,
    clusterType,
    itemLevel,
    passiveCount,
    rarity: 'normal',
    prefixes: [],
    suffixes: [],
    fracturedModIds: [],
  };

  candidates.push({
    state: cleanState,
    label: 'Clean Base',
    acquisitions: [
      {
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
    ],
  });

  if (!pool) return candidates;

  // 2. Discover required mod fracture candidates
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

    const poolRequirement = req.mustBeFractured ? { ...req, mustBeFractured: undefined } : req;
    const matchedMod = allMods.find((m) => matchesModRequirement(m, poolRequirement));
    if (!matchedMod) continue;

    // Physical state with single fractured mod
    const fracState: ItemState = {
      baseType,
      clusterType,
      itemLevel,
      passiveCount,
      // The reusable fractured base is the post-Scour physical state: one
      // fractured explicit remains, so the item is magic.
      rarity: 'magic',
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

    const candidateAcquisitions: AcquisitionOption[] = [
      {
        type: 'self-fracture',
        costChaos: totalSelfFracCost,
        confidence: 'approximate',
        breakdown: selfFracBreakdown,
      },
    ];

    // Add Market Purchase if price is available
    const marketPrice =
      context.marketFracturedPricesChaos?.[groupKey] ??
      context.marketFracturedPricesChaos?.[matchedMod.modId];
    if (marketPrice !== undefined && marketPrice > 0) {
      candidateAcquisitions.push({
        type: 'market',
        costChaos: marketPrice,
        confidence: 'deterministic',
      });
    }

    candidates.push({
      state: fracState,
      label: modDisplayName,
      acquisitions: candidateAcquisitions,
    });
  }

  return candidates;
}

/**
 * Convenience helper to convert StartingStateCandidate[] into StartingCraftOption[]
 * for evaluation in CraftingOptimizer.
 */
export function generateStartingStrategies(
  target: TargetDefinition,
  baseType: BaseType,
  clusterType: string,
  itemLevel: number,
  context: StrategyDiscoveryContext,
  passiveCount = 12
): StartingCraftOption[] {
  const candidates = generateStartingStateCandidates(
    target,
    baseType,
    clusterType,
    itemLevel,
    context,
    passiveCount
  );

  const options: StartingCraftOption[] = [];
  for (const candidate of candidates) {
    for (const acq of candidate.acquisitions) {
      const modeLabel = acq.type === 'market' ? 'Buy Fractured' : (acq.type === 'clean-base' ? 'Start Clean Base' : 'Self-Fracture');
      options.push({
        name: `${modeLabel} ${candidate.label}`,
        state: candidate.state,
        acquisition: acq,
      });
    }
  }

  return options;
}
