import type { ItemRarity } from '../domain/ItemState.ts';
import type { ModPool } from '../domain/ModPool.ts';
import type { GenType } from '../domain/Mod.ts';
import type { ModRequirement, TargetDefinition } from '../domain/TargetDefinition.ts';
import { matchesModRequirement } from '../domain/TargetDefinition.ts';
import { getMaxPrefixes, getMaxSuffixes } from '../rules/affixRules.ts';

export interface MinimumFeasibleRarityResult {
  rarity: ItemRarity;
  requiredPrefixes: number;
  requiredSuffixes: number;
  complete: boolean;
  reason: string;
}

function requirementKey(requirement: ModRequirement): string {
  return [
    requirement.modId ?? '',
    requirement.modGroup ?? '',
    requirement.name ?? '',
    requirement.minTierNumber ?? '',
    requirement.maxTierNumber ?? '',
    requirement.mustBeFractured ?? '',
  ].join('|');
}

function uniqueRequirements(requirements: ModRequirement[]): ModRequirement[] {
  const seen = new Set<string>();
  return requirements.filter((requirement) => {
    const key = requirementKey(requirement);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function targetRequirementSets(target: TargetDefinition): ModRequirement[][] {
  let sets: ModRequirement[][] = [[...target.requiredMods]];
  if (target.outcomeBranches?.length) {
    sets = sets.flatMap((base) =>
      target.outcomeBranches!.map((branch) => [...base, ...branch.requiredMods])
    );
  }
  if (target.acceptableAnyOf?.length) {
    sets = sets.flatMap((base) =>
      target.acceptableAnyOf!.map((branch) => [...base, ...branch])
    );
  }
  return sets.map(uniqueRequirements);
}

function possibleGenTypes(requirement: ModRequirement, pool: ModPool): GenType[] {
  const types = new Set(
    pool.getAllMods()
      .filter((mod) => matchesModRequirement(mod, requirement))
      .map((mod) => mod.genType)
  );
  return [...types];
}

/**
 * Derives the lowest rarity capable of holding one feasible target branch plus
 * any requested open slots. This is a search-priority fact, never a legality filter.
 */
export function deriveMinimumFeasibleRarity(
  target: TargetDefinition,
  pool: ModPool
): MinimumFeasibleRarityResult {
  const allowedRarities: ItemRarity[] = target.requiredRarity
    ? [target.requiredRarity]
    : ['normal', 'magic', 'rare'];
  let best: MinimumFeasibleRarityResult | undefined;
  let missingRequirement = false;

  for (const requirements of targetRequirementSets(target)) {
    const assignments: Array<{ prefixes: number; suffixes: number }> = [{ prefixes: 0, suffixes: 0 }];
    for (const requirement of requirements) {
      const types = possibleGenTypes(requirement, pool);
      if (types.length === 0) {
        missingRequirement = true;
        assignments.length = 0;
        break;
      }
      const prior = assignments.splice(0, assignments.length);
      for (const assignment of prior) {
        for (const type of types) {
          assignments.push({
            prefixes: assignment.prefixes + (type === 'Prefix' ? 1 : 0),
            suffixes: assignment.suffixes + (type === 'Suffix' ? 1 : 0),
          });
        }
      }
    }

    for (const assignment of assignments) {
      for (const rarity of allowedRarities) {
        const prefixCapacity = getMaxPrefixes(rarity);
        const suffixCapacity = getMaxSuffixes(rarity);
        if (
          assignment.prefixes + (target.finalStateConstraints?.minOpenPrefixes ?? 0) > prefixCapacity ||
          assignment.suffixes + (target.finalStateConstraints?.minOpenSuffixes ?? 0) > suffixCapacity
        ) {
          continue;
        }
        const candidate: MinimumFeasibleRarityResult = {
          rarity,
          requiredPrefixes: assignment.prefixes,
          requiredSuffixes: assignment.suffixes,
          complete: true,
          reason: `${assignment.prefixes} Prefix target(s) + ${assignment.suffixes} Suffix target(s) fit ${rarity} capacity (${prefixCapacity}P/${suffixCapacity}S).`,
        };
        if (!best || allowedRarities.indexOf(candidate.rarity) < allowedRarities.indexOf(best.rarity)) {
          best = candidate;
        }
        break;
      }
    }
  }

  return best ?? {
    rarity: target.requiredRarity ?? 'rare',
    requiredPrefixes: 0,
    requiredSuffixes: 0,
    complete: false,
    reason: missingRequirement
      ? 'At least one target requirement was not found in the modeled pool; Rare is the conservative staging fallback.'
      : 'No target branch fits modeled affix capacity; Rare is the conservative staging fallback.',
  };
}
