import type { ItemState } from './ItemState.ts';

export interface ModRequirement {
  name?: string;
  modId?: string;
  modGroup?: string;
  tier?: number;
  maxTierNumber?: number; // e.g. 1 means T1 only; 2 means T1 or T2
}

export interface NumericRollRequirement {
  name?: string;
  modGroup?: string;
  modId?: string;
  statIndex?: number;
  minValue: number;
}

export interface TargetOutcomeBranch {
  name: string;
  requiredMods: ModRequirement[];
  saleValueChaos?: number;
}

export interface TargetDefinition {
  requiredMods: ModRequirement[];
  acceptableAnyOf?: ModRequirement[][];
  outcomeBranches?: TargetOutcomeBranch[];
  finalRollRequirements?: NumericRollRequirement[];
  minimumSaleValue?: number;
}

export function matchesModRequirement(mod: { name: string; modId: string; modGroup: string; tier: number }, req: ModRequirement): boolean {
  if (req.modId && mod.modId !== req.modId) return false;
  if (req.name && mod.name !== req.name) return false;
  if (req.modGroup && mod.modGroup !== req.modGroup) return false;
  if (req.tier !== undefined && mod.tier !== req.tier) return false;
  if (req.maxTierNumber !== undefined && mod.tier > req.maxTierNumber) return false;
  return true;
}

export function satisfiesTarget(state: ItemState, target: TargetDefinition): boolean {
  const affixes = [...state.prefixes, ...state.suffixes];

  // 1. All requiredMods must be present
  for (const req of target.requiredMods) {
    const found = affixes.some((m) => matchesModRequirement(m, req));
    if (!found) return false;
  }

  // 2. If acceptableAnyOf is present, at least one group of requirements must be satisfied
  if (target.acceptableAnyOf && target.acceptableAnyOf.length > 0) {
    const anySatisfied = target.acceptableAnyOf.some((optionGroup) =>
      optionGroup.every((req) => affixes.some((m) => matchesModRequirement(m, req)))
    );
    if (!anySatisfied) return false;
  }

  // 2b. If outcomeBranches is present, at least one branch must be satisfied
  if (target.outcomeBranches && target.outcomeBranches.length > 0) {
    const anyBranchSatisfied = target.outcomeBranches.some((branch) =>
      branch.requiredMods.every((req) => affixes.some((m) => matchesModRequirement(m, req)))
    );
    if (!anyBranchSatisfied) return false;
  }

  // 3. Numeric roll requirements check
  if (target.finalRollRequirements && target.finalRollRequirements.length > 0) {
    for (const rollReq of target.finalRollRequirements) {
      if (!rollReq.name && !rollReq.modGroup && !rollReq.modId) {
        return false; // Requirement must specify a selector
      }

      const matchingAffixes = affixes.filter((m) => {
        if (rollReq.modId && m.modId !== rollReq.modId) return false;
        if (rollReq.name && m.name !== rollReq.name) return false;
        if (rollReq.modGroup && m.modGroup !== rollReq.modGroup) return false;
        return true;
      });

      if (matchingAffixes.length === 0) {
        return false;
      }

      const anySatisfiesRoll = matchingAffixes.some((m) => {
        const val = m.currentRoll?.[rollReq.statIndex ?? 0];
        return val !== undefined && val >= rollReq.minValue;
      });

      if (!anySatisfiesRoll) {
        return false;
      }
    }
  }

  return true;
}

export function getMatchingOutcomeBranch(
  state: ItemState,
  target: TargetDefinition
): TargetOutcomeBranch | undefined {
  if (!target.outcomeBranches || target.outcomeBranches.length === 0) {
    return undefined;
  }
  const affixes = [...state.prefixes, ...state.suffixes];
  return target.outcomeBranches.find((branch) =>
    branch.requiredMods.every((req) => affixes.some((m) => matchesModRequirement(m, req)))
  );
}
