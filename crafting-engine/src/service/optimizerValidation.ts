import type { ClusterModRepository } from '../data/clusterModRepository.ts';
import type { BaseType, ItemRarity } from '../domain/ItemState.ts';
import { getMaxNotables, getMaxPrefixes, getMaxSuffixes } from '../rules/affixRules.ts';
import type { OptimizeCraftInput } from './optimizerService.ts';

export type OptimizerValidationField =
  | 'baseType'
  | 'clusterType'
  | 'passiveCount'
  | 'itemLevel'
  | 'target.requiredMods'
  | 'target.requiredRarity'
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

/** Shared browser/worker/service validator for the exact-ID optimizer contract. */
export function validateOptimizeCraftInput(
  repository: ClusterModRepository,
  input: OptimizeCraftInput
): OptimizerValidationResult {
  const errors: OptimizerValidationIssue[] = [];
  const notices: OptimizerValidationIssue[] = [];
  const modCount = input.target.requiredMods.length;
  const autoRare = modCount >= 3 && input.target.requiredRarity === undefined;
  const normalizedInput: OptimizeCraftInput = autoRare
    ? { ...input, target: { ...input.target, requiredRarity: 'rare' } }
    : input;

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
    errors.push({ code: 'EXACT_MOD_ID_REQUIRED', field: 'target.requiredMods', message: 'Every desired modifier must use an exact modifier ID.' });
  }

  const requestedIds = input.target.requiredMods.flatMap((requirement) => requirement.modId ? [requirement.modId] : []);
  if (new Set(requestedIds).size !== requestedIds.length) {
    errors.push({ code: 'DUPLICATE_MOD_ID', field: 'target.requiredMods', message: 'Desired modifier IDs must be unique.' });
  }

  const pool = baseValid && repository.getClusterTypes(input.baseType).includes(input.clusterType)
    ? repository.getCombinedModPool(input.baseType, input.clusterType)
    : [];
  const eligibleById = new Map(pool.filter((mod) => mod.ilvl <= input.itemLevel).map((mod) => [mod.modId, mod]));
  const selectedMods = requestedIds.flatMap((modId) => {
    const mod = eligibleById.get(modId);
    if (!mod) {
      errors.push({
        code: 'INELIGIBLE_MOD_ID',
        field: 'target.requiredMods',
        message: `${modId} is not eligible for this base, enchantment, and item level.`,
      });
      return [];
    }
    return [mod];
  });

  for (let leftIndex = 0; leftIndex < selectedMods.length; leftIndex++) {
    const left = selectedMods[leftIndex];
    const leftGroups = new Set(left.modGroups.length > 0 ? left.modGroups : [left.modGroup]);
    for (let rightIndex = leftIndex + 1; rightIndex < selectedMods.length; rightIndex++) {
      const right = selectedMods[rightIndex];
      const rightGroups = right.modGroups.length > 0 ? right.modGroups : [right.modGroup];
      if (rightGroups.some((group) => leftGroups.has(group))) {
        errors.push({
          code: 'MOD_GROUP_CONFLICT',
          field: 'target.requiredMods',
          message: `${left.name} and ${right.name} share an exclusion group and cannot coexist.`,
        });
      }
    }
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
  if (normalizedInput.target.requiredRarity === 'normal' && modCount > 0) {
    errors.push({ code: 'RARITY_INFEASIBLE', field: 'target.requiredRarity', message: 'A normal item cannot satisfy explicit modifier requirements.' });
  }
  if (autoRare) {
    notices.push({
      code: 'RARITY_AUTOMATICALLY_RARE',
      field: 'target.requiredRarity',
      message: 'Final rarity was set to Rare because three or more explicit modifiers were requested.',
    });
  }

  const budget = input.searchBudget;
  if (budget && [budget.maxStates, budget.maxWallTimeMs, budget.maxExpansionRounds].some(
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
