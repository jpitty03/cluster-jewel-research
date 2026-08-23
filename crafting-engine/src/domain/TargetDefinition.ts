import type { Mod, RolledMod } from './Mod.ts';
import type { ItemRarity, ItemState } from './ItemState.ts';
import { getMaxPrefixes, getMaxSuffixes } from '../rules/affixRules.ts';

export interface ModRequirement {
  modId?: string;
  modGroup?: string;
  name?: string;
  minTierNumber?: number; // 1 = T1, 2 = T2, etc.
  maxTierNumber?: number; // e.g. 1 means must be T1
  mustBeFractured?: boolean;
}

export interface RollRequirement {
  modId?: string;
  modGroup?: string;
  name?: string;
  statIndex?: number;
  minValue?: number;
  maxValue?: number;
}

export interface TargetOutcomeBranch {
  name: string;
  requiredMods: ModRequirement[];
  saleValueChaos?: number;
  weight?: number;
}

export interface FinalStateConstraints {
  /** Maximum number of explicit prefixes plus suffixes on a terminal item. */
  maxTotalExplicitAffixes?: number;
  /** Maximum affixes that do not match any requested target modifier. */
  maxUnmatchedAffixes?: number;
  /** Minimum unused prefix capacity on the terminal item's actual rarity. */
  minOpenPrefixes?: number;
  /** Minimum unused suffix capacity on the terminal item's actual rarity. */
  minOpenSuffixes?: number;
}

export interface TargetDefinition {
  requiredMods: ModRequirement[];
  requiredRarity?: ItemRarity;
  outcomeBranches?: TargetOutcomeBranch[];
  acceptableAnyOf?: ModRequirement[][];
  finalRollRequirements?: RollRequirement[];
  finalStateConstraints?: FinalStateConstraints;
  saleValueChaos?: number;
}

/** Flatten all mod-shaped target requirements once for identity, discovery, and heuristics. */
export function getAllTargetModRequirements(target: TargetDefinition): ModRequirement[] {
  const requirements = [
    ...target.requiredMods,
    ...(target.outcomeBranches?.flatMap((branch) => branch.requiredMods) ?? []),
    ...(target.acceptableAnyOf?.flat() ?? []),
  ];
  const seen = new Set<string>();
  return requirements.filter((requirement) => {
    const key = [
      requirement.modId ?? '',
      requirement.modGroup ?? '',
      requirement.name ?? '',
      requirement.minTierNumber ?? '',
      requirement.maxTierNumber ?? '',
      requirement.mustBeFractured ?? '',
    ].join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function matchesModRequirement(mod: RolledMod | Mod, req: ModRequirement): boolean {
  if (req.modId && mod.modId !== req.modId) return false;
  if (req.modGroup && mod.modGroup !== req.modGroup) return false;
  if (req.name && mod.name !== req.name) return false;
  if (req.minTierNumber !== undefined && mod.tier < req.minTierNumber) return false;
  if (req.maxTierNumber !== undefined && mod.tier > req.maxTierNumber) return false;
  if (req.mustBeFractured !== undefined) {
    const isFractured = 'isFractured' in mod && mod.isFractured;
    if (isFractured !== req.mustBeFractured) return false;
  }
  return true;
}

export interface RollEvaluationResult {
  matchesMod: boolean;
  passes: boolean;
  actualValue?: number;
}

export function evaluateRollRequirement(
  mod: RolledMod,
  req: RollRequirement
): RollEvaluationResult {
  const matchesMod =
    (req.modGroup ? mod.modGroup === req.modGroup || mod.modGroups?.includes(req.modGroup) : true) &&
    (req.modId ? mod.modId === req.modId : true) &&
    (req.name ? mod.name === req.name : true);

  if (!matchesMod) {
    return { matchesMod: false, passes: false };
  }

  const statIndex = req.statIndex ?? 0;
  const actualValue = mod.currentRoll?.[statIndex];
  if (actualValue === undefined) {
    return { matchesMod: true, passes: true };
  }

  let passes = true;
  if (req.minValue !== undefined && actualValue < req.minValue) passes = false;
  if (req.maxValue !== undefined && actualValue > req.maxValue) passes = false;

  return { matchesMod: true, passes, actualValue };
}

/** Applies generic terminal-shape requirements independently of how the item was crafted. */
export function satisfiesFinalStateConstraints(
  state: ItemState,
  target: TargetDefinition
): boolean {
  const constraints = target.finalStateConstraints;
  if (!constraints) return true;
  const affixes = [...state.prefixes, ...state.suffixes];
  if (
    constraints.maxTotalExplicitAffixes !== undefined &&
    affixes.length > constraints.maxTotalExplicitAffixes
  ) {
    return false;
  }
  if (constraints.maxUnmatchedAffixes !== undefined) {
    const requirements = getAllTargetModRequirements(target);
    const unmatched = affixes.filter(
      (mod) => !requirements.some((requirement) => matchesModRequirement(mod, requirement))
    ).length;
    if (unmatched > constraints.maxUnmatchedAffixes) return false;
  }
  const openPrefixes = getMaxPrefixes(state.rarity) - state.prefixes.length;
  const openSuffixes = getMaxSuffixes(state.rarity) - state.suffixes.length;
  if (
    constraints.minOpenPrefixes !== undefined &&
    openPrefixes < constraints.minOpenPrefixes
  ) {
    return false;
  }
  if (
    constraints.minOpenSuffixes !== undefined &&
    openSuffixes < constraints.minOpenSuffixes
  ) {
    return false;
  }
  return true;
}

export function satisfiesTarget(state: ItemState, target: TargetDefinition): boolean {
  if (target.requiredRarity && state.rarity !== target.requiredRarity) return false;
  if (!satisfiesFinalStateConstraints(state, target)) return false;
  const affixes = [...state.prefixes, ...state.suffixes];

  // 1. Check all base required mods
  for (const req of target.requiredMods) {
    const found = affixes.some((m) => matchesModRequirement(m, req));
    if (!found) return false;
  }

  // 2. Check final roll requirements if specified
  if (target.finalRollRequirements) {
    for (const rollReq of target.finalRollRequirements) {
      const match = affixes.find((m) => evaluateRollRequirement(m, rollReq).matchesMod);
      if (!match) return false;
      const res = evaluateRollRequirement(match, rollReq);
      if (!res.passes) return false;
    }
  }

  // 3. If outcome branches exist, check if at least one branch is satisfied
  if (target.outcomeBranches && target.outcomeBranches.length > 0) {
    const hasBranchMatch = target.outcomeBranches.some((branch) =>
      branch.requiredMods.every((req) => affixes.some((m) => matchesModRequirement(m, req)))
    );
    if (!hasBranchMatch) return false;
  }

  // 4. If acceptableAnyOf exists, check if at least one branch is satisfied
  if (target.acceptableAnyOf && target.acceptableAnyOf.length > 0) {
    const hasAnyMatch = target.acceptableAnyOf.some((branch) =>
      branch.every((req) => affixes.some((m) => matchesModRequirement(m, req)))
    );
    if (!hasAnyMatch) return false;
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
  if (target.requiredRarity && state.rarity !== target.requiredRarity) return undefined;
  if (!satisfiesFinalStateConstraints(state, target)) return undefined;
  const affixes = [...state.prefixes, ...state.suffixes];

  // 1. All base requiredMods must be present first
  for (const req of target.requiredMods) {
    const found = affixes.some((m) => matchesModRequirement(m, req));
    if (!found) return undefined;
  }

  // 2. Check final roll requirements if present
  if (target.finalRollRequirements) {
    for (const rollReq of target.finalRollRequirements) {
      const match = affixes.find((m) =>
        (rollReq.modGroup ? m.modGroup === rollReq.modGroup : true) &&
        (rollReq.modId ? m.modId === rollReq.modId : true) &&
        (rollReq.name ? m.name === rollReq.name : true)
      );
      if (!match) return undefined;
      const currentVal = match.currentRoll?.[rollReq.statIndex ?? 0];
      if (currentVal !== undefined && rollReq.minValue !== undefined && currentVal < rollReq.minValue) {
        return undefined;
      }
    }
  }

  // 3. Find matching branch
  return target.outcomeBranches.find((branch) =>
    branch.requiredMods.every((req) => affixes.some((m) => matchesModRequirement(m, req)))
  );
}
