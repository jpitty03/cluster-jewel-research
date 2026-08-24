import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { BaseType, ItemState } from '../domain/ItemState.ts';
import type { ModPool } from '../domain/ModPool.ts';
import type { PriceBook, PriceConfidence } from '../domain/PriceBook.ts';
import type { ModRequirement } from '../domain/TargetDefinition.ts';
import type { AcquisitionOption } from './expectedCost.ts';
import { toRolledMod } from '../domain/Mod.ts';
import { getAllTargetModRequirements, matchesModRequirement } from '../domain/TargetDefinition.ts';
import {
  synthesizeAcquisition,
  type AcquisitionSearchBudget,
} from './acquisitionSynthesis.ts';

export interface StrategyDiscoveryContext {
  pool?: ModPool;
  priceBook: PriceBook;
  marketFracturedPricesChaos?: Record<string, number>;
  cleanBaseCostChaos?: number;
  cleanBasePriceConfidence?: PriceConfidence;
  cleanBasePriceProvenance?: string;
  acquisitionSearchBudget?: AcquisitionSearchBudget;
  allowResearchFallbackPrices?: boolean;
}

export interface StartingStateCandidate {
  state: ItemState;
  label: string;
  acquisitions: AcquisitionOption[];
  /** Present only for physical families that must be manufactured by self-fracture. */
  fracturedRequirement?: ModRequirement;
}

export interface StartingCraftOption {
  name: string;
  state: ItemState;
  acquisition?: AcquisitionOption;
  baseCostChaos?: number;
}

function formatStartingModDisplayName(mod: { name: string; tier: number; tierCount: number }): string {
  return `${mod.name}${mod.tierCount > 1 ? ` (T${mod.tier})` : ''}`;
}

/**
 * Discovers and generates physical starting state candidates with their attached acquisition routes
 * from a TargetDefinition.
 *
 * Physical candidate state is separated from acquisition methods. Fractured candidates deliberately
 * have no acquisition method at this stage: executable synthesis must certify one before the family
 * can enter economic ranking. Legacy market purchase and approximate-formula methods are not emitted.
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
  const pool = context.pool;

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

  const targetReqs = getAllTargetModRequirements(target);

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

    const modDisplayName = formatStartingModDisplayName(matchedMod);

    candidates.push({
      state: fracState,
      label: modDisplayName,
      acquisitions: [],
      fracturedRequirement: { ...poolRequirement },
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

  const cleanCandidate = candidates.find((candidate) => !candidate.fracturedRequirement);
  if (!cleanCandidate) return [];
  const fracturedCandidates = candidates.filter(
    (candidate): candidate is StartingStateCandidate & { fracturedRequirement: ModRequirement } =>
      candidate.fracturedRequirement !== undefined
  );
  const totalStateBudget = Math.max(
    fracturedCandidates.length,
    context.acquisitionSearchBudget?.maxStates ?? 5_001
  );
  const totalWallTimeMs = Math.max(
    fracturedCandidates.length,
    context.acquisitionSearchBudget?.maxWallTimeMs ?? 20_000
  );
  const stateQuotient = fracturedCandidates.length > 0
    ? Math.floor(totalStateBudget / fracturedCandidates.length)
    : 0;
  const stateRemainder = fracturedCandidates.length > 0
    ? totalStateBudget % fracturedCandidates.length
    : 0;
  const wallQuotient = fracturedCandidates.length > 0
    ? Math.floor(totalWallTimeMs / fracturedCandidates.length)
    : 0;
  const wallRemainder = fracturedCandidates.length > 0
    ? totalWallTimeMs % fracturedCandidates.length
    : 0;

  for (const [index, candidate] of fracturedCandidates.entries()) {
    const synthesis = synthesizeAcquisition(
      { pool: context.pool!, priceBook: context.priceBook },
      {
        cleanStartingState: cleanCandidate.state,
        desiredPhysicalState: { fracturedMod: candidate.fracturedRequirement },
        cleanBaseAcquisition: {
          costChaos: context.cleanBaseCostChaos ?? 10,
          confidence: context.cleanBasePriceConfidence ?? 'research-fallback',
          provenance:
            context.cleanBasePriceProvenance ??
            'strategy-discovery clean-base research fallback',
        },
        searchBudget: {
          maxStates: stateQuotient + (index < stateRemainder ? 1 : 0),
          maxWallTimeMs: wallQuotient + (index < wallRemainder ? 1 : 0),
          maxExpansionRounds: context.acquisitionSearchBudget?.maxExpansionRounds ?? 3,
        },
        allowResearchFallbackPrices: context.allowResearchFallbackPrices ?? true,
      }
    );
    if (synthesis.status !== 'RESOLVED' || synthesis.expectedCostChaos === undefined) continue;
    candidate.acquisitions.push({
      type: 'self-fracture',
      costChaos: synthesis.expectedCostChaos,
      confidence: 'executable',
      description: synthesis.explanation,
    });
  }

  const options: StartingCraftOption[] = [];
  for (const candidate of candidates) {
    for (const acq of candidate.acquisitions) {
      const modeLabel = acq.type === 'clean-base' ? 'Start Clean Base' : 'Executable Self-Fracture';
      options.push({
        name: `${modeLabel} ${candidate.label}`,
        state: candidate.state,
        acquisition: acq,
      });
    }
  }

  return options;
}
