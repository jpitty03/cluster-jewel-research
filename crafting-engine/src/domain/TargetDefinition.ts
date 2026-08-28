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

/** Stable identity for one modifier requirement. Player-facing text is never required. */
export function modRequirementIdentity(requirement: ModRequirement): string {
  return JSON.stringify([
    requirement.modId ?? null,
    requirement.modGroup ?? null,
    requirement.name ?? null,
    requirement.minTierNumber ?? null,
    requirement.maxTierNumber ?? null,
    requirement.mustBeFractured ?? null,
  ]);
}

function canonicalRequirements(requirements: readonly ModRequirement[]): ModRequirement[] {
  const byIdentity = new Map<string, ModRequirement>();
  for (const requirement of requirements) {
    const identity = modRequirementIdentity(requirement);
    if (!byIdentity.has(identity)) byIdentity.set(identity, { ...requirement });
  }
  return [...byIdentity.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, requirement]) => requirement);
}

/** Canonical OR branches retain their boundaries while ignoring selection order. */
export function canonicalAcceptableAnyOf(
  branches: readonly (readonly ModRequirement[])[] | undefined,
): ModRequirement[][] | undefined {
  if (branches === undefined) return undefined;
  const canonical = branches.map((branch) => canonicalRequirements(branch));
  return canonical.sort((left, right) =>
    JSON.stringify(left.map(modRequirementIdentity)).localeCompare(
      JSON.stringify(right.map(modRequirementIdentity)),
    )
  );
}

/** Shared canonical target shape for validation, Worker/session keys, sharing, and replay. */
export function canonicalizeTargetDefinition(target: TargetDefinition): TargetDefinition {
  const { acceptableAnyOf: rawAcceptableAnyOf, ...targetWithoutAcceptableAnyOf } = target;
  const acceptableAnyOf = canonicalAcceptableAnyOf(rawAcceptableAnyOf);
  return {
    ...targetWithoutAcceptableAnyOf,
    requiredMods: canonicalRequirements(target.requiredMods),
    outcomeBranches: target.outcomeBranches?.map((branch) => ({
      ...branch,
      requiredMods: canonicalRequirements(branch.requiredMods),
    })),
    ...(acceptableAnyOf === undefined ? {} : { acceptableAnyOf }),
    finalRollRequirements: target.finalRollRequirements?.map((requirement) => ({ ...requirement })),
    finalStateConstraints: target.finalStateConstraints
      ? { ...target.finalStateConstraints }
      : undefined,
  };
}

/** JSON-safe material whose OR branch boundaries are part of canonical target identity. */
export function canonicalTargetFingerprintMaterial(target: TargetDefinition): TargetDefinition {
  return canonicalizeTargetDefinition(target);
}

/** Every independently feasible completion scenario, never the union of OR alternatives. */
export function getTargetRequirementScenarios(target: TargetDefinition): ModRequirement[][] {
  let scenarios: ModRequirement[][] = [[...target.requiredMods]];
  if (target.outcomeBranches?.length) {
    scenarios = scenarios.flatMap((base) =>
      target.outcomeBranches!.map((branch) => [...base, ...branch.requiredMods])
    );
  }
  if (target.acceptableAnyOf?.length) {
    scenarios = scenarios.flatMap((base) =>
      target.acceptableAnyOf!.map((branch) => [...base, ...branch])
    );
  }
  return scenarios.map(canonicalRequirements);
}

function requirementDisplayIdentity(requirement: ModRequirement, index: number): string {
  return requirement.modId ?? requirement.modGroup ?? requirement.name ?? `target_${index + 1}`;
}

export interface TargetProgressEvaluation {
  required: {
    requirementIds: string[];
    matchedRequirementIds: string[];
    missingRequirementIds: string[];
    complete: boolean;
  };
  acceptable: {
    required: boolean;
    branchRequirementIds: string[][];
    matchedRequirementIds: string[];
    satisfiedBranchIndices: number[];
    satisfied: boolean;
  };
  terminal: boolean;
}

/** Structured progress keeps mandatory completion separate from acceptable OR progress. */
export function evaluateTargetProgress(
  state: ItemState,
  target: TargetDefinition,
): TargetProgressEvaluation {
  const affixes = [...state.prefixes, ...state.suffixes];
  const required = canonicalRequirements(target.requiredMods);
  const requiredRows = required.map((requirement, index) => ({
    requirement,
    id: requirementDisplayIdentity(requirement, index),
  }));
  const matchedRequired = requiredRows
    .filter(({ requirement }) => affixes.some((mod) => matchesModRequirement(mod, requirement)))
    .map(({ id }) => id);
  const missingRequired = requiredRows
    .filter(({ id }) => !matchedRequired.includes(id))
    .map(({ id }) => id);

  const branches = canonicalAcceptableAnyOf(target.acceptableAnyOf) ?? [];
  const branchRows = branches.map((branch) => branch.map((requirement, index) => ({
    requirement,
    id: requirementDisplayIdentity(requirement, index),
  })));
  const satisfiedBranchIndices = branchRows.flatMap((branch, index) =>
    branch.every(({ requirement }) =>
      affixes.some((mod) => matchesModRequirement(mod, requirement))
    ) ? [index] : []
  );
  const matchedAcceptable = [...new Set(branchRows.flatMap((branch) =>
    branch
      .filter(({ requirement }) => affixes.some((mod) => matchesModRequirement(mod, requirement)))
      .map(({ id }) => id)
  ))].sort();
  const acceptableRequired = branches.length > 0;

  return {
    required: {
      requirementIds: requiredRows.map(({ id }) => id).sort(),
      matchedRequirementIds: matchedRequired.sort(),
      missingRequirementIds: missingRequired.sort(),
      complete: missingRequired.length === 0,
    },
    acceptable: {
      required: acceptableRequired,
      branchRequirementIds: branchRows.map((branch) => branch.map(({ id }) => id).sort()),
      matchedRequirementIds: matchedAcceptable,
      satisfiedBranchIndices,
      satisfied: !acceptableRequired || satisfiedBranchIndices.length > 0,
    },
    terminal: satisfiesTarget(state, target),
  };
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
    const key = modRequirementIdentity(requirement);
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
