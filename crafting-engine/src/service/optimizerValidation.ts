import type { ClusterModRepository } from '../data/clusterModRepository.ts';
import type { BaseType, ItemRarity } from '../domain/ItemState.ts';
import { ModPool } from '../domain/ModPool.ts';
import {
  canonicalizeTargetDefinition,
  getTargetRequirementScenarios,
  modRequirementIdentity,
} from '../domain/TargetDefinition.ts';
import { getMaxNotables, getMaxPrefixes, getMaxSuffixes } from '../rules/affixRules.ts';
import { deriveMinimumFeasibleRarity } from '../solver/targetFeasibility.ts';
import type { OptimizeCraftInput } from './optimizerService.ts';

export type OptimizerValidationField =
  | 'baseType'
  | 'clusterType'
  | 'passiveCount'
  | 'itemLevel'
  | 'target.requiredMods'
  | 'target.acceptableAnyOf'
  | 'target.requiredRarity'
  | 'target.finalStateConstraints'
  | 'searchBudget'
  | 'searchIntent';

export interface OptimizerValidationIssue {
  code: string;
  field: OptimizerValidationField;
  message: string;
}

export interface OptimizerValidationResult {
  valid: boolean;
  errors: OptimizerValidationIssue[];
  notices: OptimizerValidationIssue[];
  normalizedInput: OptimizeCraftInput;
}

const PASSIVE_COUNTS: Record<BaseType, readonly number[]> = {
  'Large Cluster Jewel': [8, 9, 10, 11, 12],
  'Medium Cluster Jewel': [4, 5, 6],
  'Small Cluster Jewel': [2, 3],
};

function runtimeBaseType(value: unknown): value is BaseType {
  return value === 'Large Cluster Jewel' ||
    value === 'Medium Cluster Jewel' ||
    value === 'Small Cluster Jewel';
}

function maximumRarity(input: OptimizeCraftInput): ItemRarity {
  if (input.target.requiredRarity) return input.target.requiredRarity;
  return 'rare';
}

function exclusionConflict(left: { modGroup: string; modGroups: string[] }, right: { modGroup: string; modGroups: string[] }): boolean {
  const leftGroups = new Set(left.modGroups.length > 0 ? left.modGroups : [left.modGroup]);
  const rightGroups = right.modGroups.length > 0 ? right.modGroups : [right.modGroup];
  return rightGroups.some((group) => leftGroups.has(group));
}

/** Shared browser/worker/service validator for the exact-ID optimizer contract. */
export function validateOptimizeCraftInput(
  repository: ClusterModRepository,
  input: OptimizeCraftInput
): OptimizerValidationResult {
  const errors: OptimizerValidationIssue[] = [];
  const notices: OptimizerValidationIssue[] = [];
  const modCount = input.target.requiredMods.length;
  let normalizedInput: OptimizeCraftInput = {
    ...input,
    target: canonicalizeTargetDefinition(input.target),
  };

  if (!runtimeBaseType(input.baseType) || !repository.getBaseTypes().includes(input.baseType)) {
    errors.push({ code: 'INVALID_BASE_TYPE', field: 'baseType', message: 'Choose a supported cluster-jewel base type.' });
  }
  const baseValid = runtimeBaseType(input.baseType);
  if (baseValid && !repository.getClusterTypes(input.baseType).includes(input.clusterType)) {
    errors.push({ code: 'INVALID_CLUSTER_TYPE', field: 'clusterType', message: 'Choose an enchantment valid for this base type.' });
  }
  if (!Number.isInteger(input.passiveCount) || !baseValid || !PASSIVE_COUNTS[input.baseType].includes(input.passiveCount)) {
    errors.push({ code: 'INVALID_PASSIVE_COUNT', field: 'passiveCount', message: 'Choose a passive count valid for this base type.' });
  }
  if (!Number.isInteger(input.itemLevel) || input.itemLevel < 1 || input.itemLevel > 100) {
    errors.push({ code: 'INVALID_ITEM_LEVEL', field: 'itemLevel', message: 'Item level must be an integer from 1 to 100.' });
  }
  if (modCount < 1 || modCount > 4) {
    errors.push({ code: 'INVALID_MOD_COUNT', field: 'target.requiredMods', message: 'Choose between 1 and 4 exact modifiers.' });
  }
  if (input.target.requiredMods.some((requirement) => !requirement.modId)) {
    errors.push({ code: 'EXACT_MOD_ID_REQUIRED', field: 'target.requiredMods', message: 'Every required modifier must use an exact modifier ID.' });
  }

  const requestedIds = input.target.requiredMods.flatMap((requirement) =>
    requirement.modId ? [requirement.modId] : []
  );
  if (new Set(requestedIds).size !== requestedIds.length) {
    errors.push({ code: 'DUPLICATE_MOD_ID', field: 'target.requiredMods', message: 'Required modifier IDs must be unique.' });
  }

  const rawAlternativeBranches = input.target.acceptableAnyOf;
  const rawAlternativeRequirements = rawAlternativeBranches?.flat() ?? [];
  const alternativeIds = rawAlternativeRequirements.flatMap((requirement) =>
    requirement.modId ? [requirement.modId] : []
  );
  if (rawAlternativeBranches !== undefined && rawAlternativeBranches.length === 0) {
    errors.push({
      code: 'EMPTY_ACCEPTABLE_ALTERNATIVE_GROUP',
      field: 'target.acceptableAnyOf',
      message: 'An enabled acceptable-alternative group must contain at least one valid branch.',
    });
  }
  if (rawAlternativeBranches?.some((branch) => branch.length === 0)) {
    errors.push({
      code: 'EMPTY_ACCEPTABLE_ALTERNATIVE_BRANCH',
      field: 'target.acceptableAnyOf',
      message: 'Acceptable-alternative branches cannot be empty.',
    });
  }
  if (rawAlternativeRequirements.some((requirement) => !requirement.modId)) {
    errors.push({
      code: 'EXACT_ALTERNATIVE_MOD_ID_REQUIRED',
      field: 'target.acceptableAnyOf',
      message: 'Every acceptable alternative must use an exact modifier ID.',
    });
  }
  if (new Set(alternativeIds).size !== alternativeIds.length) {
    errors.push({
      code: 'DUPLICATE_ACCEPTABLE_ALTERNATIVE',
      field: 'target.acceptableAnyOf',
      message: 'Acceptable alternative modifier IDs must be unique across branches.',
    });
  }
  const branchIdentities = rawAlternativeBranches?.map((branch) =>
    JSON.stringify([...new Set(branch.map(modRequirementIdentity))].sort())
  ) ?? [];
  if (new Set(branchIdentities).size !== branchIdentities.length) {
    errors.push({
      code: 'DUPLICATE_ACCEPTABLE_ALTERNATIVE_BRANCH',
      field: 'target.acceptableAnyOf',
      message: 'Acceptable-alternative branches must be unique.',
    });
  }
  const requiredIdSet = new Set(requestedIds);
  const overlappingIds = [...new Set(alternativeIds.filter((modId) => requiredIdSet.has(modId)))];
  if (overlappingIds.length > 0) {
    errors.push({
      code: 'REQUIRED_ALTERNATIVE_OVERLAP',
      field: 'target.acceptableAnyOf',
      message: `Acceptable alternatives cannot duplicate required modifiers: ${overlappingIds.join(', ')}.`,
    });
  }

  const pool = baseValid && repository.getClusterTypes(input.baseType).includes(input.clusterType)
    ? repository.getCombinedModPool(input.baseType, input.clusterType)
    : [];
  const eligibleById = new Map(pool.filter((mod) => mod.ilvl <= input.itemLevel).map((mod) => [mod.modId, mod]));
  const resolveIds = (ids: readonly string[], field: 'target.requiredMods' | 'target.acceptableAnyOf') => ids.flatMap((modId) => {
    const mod = eligibleById.get(modId);
    if (!mod) {
      errors.push({
        code: 'INELIGIBLE_MOD_ID',
        field,
        message: `${field === 'target.requiredMods' ? 'Required modifier' : 'Acceptable alternative'} ${modId} is not eligible for this base, enchantment, and item level.`,
      });
      return [];
    }
    return [mod];
  });
  const selectedMods = resolveIds(requestedIds, 'target.requiredMods');
  resolveIds(alternativeIds, 'target.acceptableAnyOf');

  for (let leftIndex = 0; leftIndex < selectedMods.length; leftIndex++) {
    const left = selectedMods[leftIndex];
    for (let rightIndex = leftIndex + 1; rightIndex < selectedMods.length; rightIndex++) {
      const right = selectedMods[rightIndex];
      if (exclusionConflict(left, right)) {
        errors.push({
          code: 'MOD_GROUP_CONFLICT',
          field: 'target.requiredMods',
          message: `${left.name} and ${right.name} share an exclusion group and cannot coexist.`,
        });
      }
    }
  }

  const eligiblePool = new ModPool([...eligibleById.values()]);
  const minimumFeasible = deriveMinimumFeasibleRarity(normalizedInput.target, eligiblePool);
  const autoRare = input.target.requiredRarity === undefined && minimumFeasible.rarity === 'rare';
  if (autoRare) {
    normalizedInput = {
      ...normalizedInput,
      target: { ...normalizedInput.target, requiredRarity: 'rare' },
    };
  }
  const rarity = maximumRarity(normalizedInput);
  const prefixCount = selectedMods.filter((mod) => mod.genType === 'Prefix').length;
  const suffixCount = selectedMods.filter((mod) => mod.genType === 'Suffix').length;
  const notableCount = selectedMods.filter((mod) => mod.isNotable).length;
  if (prefixCount > getMaxPrefixes(rarity) || suffixCount > getMaxSuffixes(rarity)) {
    errors.push({
      code: 'AFFIX_CAPACITY_EXCEEDED',
      field: 'target.requiredRarity',
      message: `${rarity} items cannot hold the requested Prefix/Suffix combination.`,
    });
  }
  if (baseValid && notableCount > getMaxNotables(input.baseType)) {
    errors.push({
      code: 'NOTABLE_CAPACITY_EXCEEDED',
      field: 'target.requiredMods',
      message: `${input.baseType} cannot hold ${notableCount} notable modifiers.`,
    });
  }
  const scenarios = getTargetRequirementScenarios(normalizedInput.target);
  for (const [scenarioIndex, requirements] of scenarios.entries()) {
    const scenarioMods = requirements.flatMap((requirement) =>
      requirement.modId ? eligibleById.get(requirement.modId) ?? [] : []
    );
    for (let leftIndex = 0; leftIndex < scenarioMods.length; leftIndex++) {
      for (let rightIndex = leftIndex + 1; rightIndex < scenarioMods.length; rightIndex++) {
        if (!exclusionConflict(scenarioMods[leftIndex], scenarioMods[rightIndex])) continue;
        errors.push({
          code: 'ALTERNATIVE_MOD_GROUP_CONFLICT',
          field: normalizedInput.target.acceptableAnyOf
            ? 'target.acceptableAnyOf'
            : 'target.requiredMods',
          message: `${scenarioMods[leftIndex].name} and ${scenarioMods[rightIndex].name} cannot coexist in completion scenario ${scenarioIndex + 1}.`,
        });
      }
    }
    const scenarioPrefixes = scenarioMods.filter((mod) => mod.genType === 'Prefix').length;
    const scenarioSuffixes = scenarioMods.filter((mod) => mod.genType === 'Suffix').length;
    if (scenarioPrefixes > getMaxPrefixes(rarity) || scenarioSuffixes > getMaxSuffixes(rarity)) {
      errors.push({
        code: 'SCENARIO_AFFIX_CAPACITY_EXCEEDED',
        field: normalizedInput.target.acceptableAnyOf ? 'target.acceptableAnyOf' : 'target.requiredRarity',
        message: `${rarity} items cannot hold completion scenario ${scenarioIndex + 1} (${scenarioPrefixes}P/${scenarioSuffixes}S).`,
      });
    }
    const scenarioNotables = scenarioMods.filter((mod) => mod.isNotable).length;
    if (baseValid && scenarioNotables > getMaxNotables(input.baseType)) {
      errors.push({
        code: 'SCENARIO_NOTABLE_CAPACITY_EXCEEDED',
        field: normalizedInput.target.acceptableAnyOf ? 'target.acceptableAnyOf' : 'target.requiredMods',
        message: `${input.baseType} cannot hold completion scenario ${scenarioIndex + 1} with ${scenarioNotables} notable modifiers.`,
      });
    }
  }
  if (normalizedInput.target.requiredRarity === 'normal' && modCount > 0) {
    errors.push({ code: 'RARITY_INFEASIBLE', field: 'target.requiredRarity', message: 'A normal item cannot satisfy explicit modifier requirements.' });
  }

  const finalConstraints = normalizedInput.target.finalStateConstraints;
  if (finalConstraints) {
    const constraintValues = [
      finalConstraints.maxTotalExplicitAffixes,
      finalConstraints.maxUnmatchedAffixes,
      finalConstraints.minOpenPrefixes,
      finalConstraints.minOpenSuffixes,
    ];
    if (constraintValues.some(
      (value) => value !== undefined && (!Number.isInteger(value) || value < 0)
    )) {
      errors.push({
        code: 'INVALID_FINAL_STATE_CONSTRAINT',
        field: 'target.finalStateConstraints',
        message: 'Final-state affix and open-slot constraints must be non-negative integers.',
      });
    }
    const maxPrefixes = getMaxPrefixes(rarity);
    const maxSuffixes = getMaxSuffixes(rarity);
    const minimumScenarioAffixes = Math.min(...scenarios.map((scenario) => scenario.length));
    if (
      finalConstraints.maxTotalExplicitAffixes !== undefined &&
      finalConstraints.maxTotalExplicitAffixes < minimumScenarioAffixes
    ) {
      errors.push({
        code: 'FINAL_AFFIX_CAP_BELOW_TARGET_COUNT',
        field: 'target.finalStateConstraints',
        message: 'Maximum final explicit affixes cannot be lower than the smallest valid completion scenario.',
      });
    }
    for (const [scenarioIndex, requirements] of scenarios.entries()) {
      const scenarioMods = requirements.flatMap((requirement) =>
        requirement.modId ? eligibleById.get(requirement.modId) ?? [] : []
      );
      const scenarioPrefixes = scenarioMods.filter((mod) => mod.genType === 'Prefix').length;
      const scenarioSuffixes = scenarioMods.filter((mod) => mod.genType === 'Suffix').length;
      if (
        (finalConstraints.minOpenPrefixes ?? 0) + scenarioPrefixes > maxPrefixes ||
        (finalConstraints.minOpenSuffixes ?? 0) + scenarioSuffixes > maxSuffixes
      ) {
        errors.push({
          code: 'FINAL_OPEN_SLOT_REQUIREMENT_INFEASIBLE',
          field: 'target.finalStateConstraints',
          message: `${rarity} completion scenario ${scenarioIndex + 1} cannot preserve the requested open slots.`,
        });
      }
    }
  }
  if (autoRare) {
    notices.push({
      code: 'RARITY_AUTOMATICALLY_RARE',
      field: 'target.requiredRarity',
      message: `Final rarity was set to Rare because the minimum valid completion shape is ${minimumFeasible.requiredPrefixes}P/${minimumFeasible.requiredSuffixes}S.`,
    });
  }

  const budget = input.searchBudget;
  if (
    budget?.preset !== undefined &&
    !['NORMAL', 'DEEP', 'VERY_DEEP', 'RESEARCH', 'CUSTOM'].includes(budget.preset)
  ) {
    errors.push({
      code: 'INVALID_SEARCH_BUDGET_PRESET',
      field: 'searchBudget',
      message: 'Search budget preset must be Normal, Deep, Very Deep, Research, or Custom.',
    });
  }
  if (budget && [
    budget.maxStates,
    budget.maxWallTimeMs,
    budget.maxExpansionRounds,
    budget.acquisitionMaxStates,
    budget.acquisitionMaxWallTimeMs,
    budget.acquisitionMaxExpansionRounds,
  ].some(
    (value) => value !== undefined && (!Number.isInteger(value) || value < 1)
  )) {
    errors.push({ code: 'INVALID_SEARCH_BUDGET', field: 'searchBudget', message: 'Search budgets must be positive integers.' });
  }
  if (
    input.searchIntent !== undefined &&
    !['RECOMMEND', 'DEEPEN', 'PROVE'].includes(input.searchIntent)
  ) {
    errors.push({ code: 'INVALID_SEARCH_INTENT', field: 'searchIntent', message: 'Choose Recommend, Deepen, or Prove search intent.' });
  }

  if (input.objective !== undefined) {
    const validKinds = [
      'CHEAPEST_CHAOS',
      'FEWEST_ACTIONS_WITHIN_COST',
      'FASTEST_WITHIN_COST',
      'BALANCED_VALUE_OF_TIME',
      'UNCONSTRAINED_FEWEST_ACTIONS',
      'UNCONSTRAINED_FASTEST',
    ];
    if (!validKinds.includes(input.objective.kind)) {
      errors.push({
        code: 'INVALID_OBJECTIVE_KIND',
        field: 'target.requiredMods' as OptimizerValidationField,
        message: `Optimization objective kind '${input.objective.kind}' is not supported.`,
      });
    }
    if (
      input.objective.maxExpectedCostChaos !== undefined &&
      (!Number.isFinite(input.objective.maxExpectedCostChaos) || input.objective.maxExpectedCostChaos < 0)
    ) {
      errors.push({
        code: 'INVALID_COST_CEILING',
        field: 'target.requiredMods' as OptimizerValidationField,
        message: 'Maximum expected chaos cost must be a non-negative number.',
      });
    }
  }

  return { valid: errors.length === 0, errors, notices, normalizedInput };
}

export class OptimizerInputValidationError extends Error {
  readonly issues: OptimizerValidationIssue[];

  constructor(issues: OptimizerValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(' '));
    this.name = 'OptimizerInputValidationError';
    this.issues = issues;
  }
}
