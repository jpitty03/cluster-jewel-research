import type { ItemState } from '../domain/ItemState.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type { SolverContext } from '../domain/CraftAction.ts';
import type { RolledMod } from '../domain/Mod.ts';
import {
  matchesModRequirement,
  evaluateRollRequirement,
  getAllTargetModRequirements,
} from '../domain/TargetDefinition.ts';

import {
  CRAFT_MECHANICS,
  getHarvestMechanicsForState,
  type DiscoveredActionType,
} from './actionRegistry.ts';

export interface ActionDiscoveryContext extends SolverContext {
  availableHarvestTags?: string[];
  enableAllflame?: boolean;
  allowResearchFallbackPrices?: boolean;
}

export interface LegalCraftAction {
  actionType: DiscoveredActionType;
  name: string;
  category: 'base-prep' | 'core-reforge' | 'cleanup' | 'slam' | 'finishing' | 'terminal';
  costChaos: number;
  priceConfidence: 'known' | 'research-fallback' | 'unavailable';
  parameters?: Record<string, any>;
}

/**
 * Discovers and enumerates all legal crafting actions from a given item state.
 * Routes through the authoritative CRAFT_MECHANICS registry.
 */
export function getLegalActions(
  state: ItemState,
  target: TargetDefinition,
  context: ActionDiscoveryContext
): LegalCraftAction[] {
  const actions: LegalCraftAction[] = [];
  const allowFallbacks = context.allowResearchFallbackPrices ?? true;

  // 1. Standard currency mechanics from registry
  for (const mechanic of CRAFT_MECHANICS) {
    if (mechanic.isLegal(state, target, context)) {
      const price = mechanic.getCost(context);
      if (!allowFallbacks && price.confidence !== 'known') {
        continue;
      }
      actions.push({
        actionType: mechanic.actionType,
        name: mechanic.name,
        category: mechanic.category,
        costChaos: price.costChaos,
        priceConfidence: price.confidence,
        parameters: mechanic.parameters,
      });
    }
  }

  // 2. Data-driven Harvest mechanics
  const harvestMechanics = getHarvestMechanicsForState(state, target, context);
  for (const hMech of harvestMechanics) {
    const price = hMech.getCost(context);
    if (!allowFallbacks && price.confidence !== 'known') {
      continue;
    }
    actions.push({
      actionType: hMech.actionType,
      name: hMech.name,
      category: hMech.category,
      costChaos: price.costChaos,
      priceConfidence: price.confidence,
      parameters: hMech.parameters,
    });
  }

  return actions;
}

export interface CanonicalStateKeyOptions {
  includeContextScope?: boolean;
}

/**
 * STRICT STATE-EQUIVALENCE CONTRACT FOR BELLMAN SEARCH:
 *
 * Two ItemStates may share a canonical key if and only if every modeled legal action
 * from both states has:
 * 1. Identical legality (e.g. prefix/suffix capacity, removable affixes, fractured constraints);
 * 2. Identical immediate currency cost;
 * 3. Identical transition probabilities into equivalent successor states (preserving mod-group
 *    blocking for Exalts, Harvest tag pools, and target satisfaction).
 *
 * Rolls are normalized only when the target and all modeled transitions are invariant to numeric values.
 */
export function getCanonicalStateKey(
  state: ItemState,
  target?: TargetDefinition,
  options: CanonicalStateKeyOptions = { includeContextScope: true }
): string {
  const reqs = target ? getAllTargetModRequirements(target) : [];

  const formatMod = (m: RolledMod): string => {
    const matchingTargetRequirements = reqs
      .map((requirement, index) => matchesModRequirement(m, requirement) ? index : -1)
      .filter((index) => index >= 0);
    const isTarget = matchingTargetRequirements.length > 0;
    const targetSuffix = isTarget ? `:target(${matchingTargetRequirements.join(',')})` : '';
    const fractureRequirement = reqs.some(
      (r) => r.mustBeFractured !== undefined &&
        (r.modId ? r.modId === m.modId : true) &&
        (r.modGroup ? r.modGroup === m.modGroup || m.modGroups?.includes(r.modGroup) : true) &&
        (r.name ? r.name === m.name : true)
    );
    const isFrac = m.isFractured ? 'FRAC:' : '';
    const craftTags = (m.craftTags ?? []).slice().sort().join(',');
    const tagsSuffix = craftTags.length > 0 ? `:tags(${craftTags})` : '';

    // Check if target definition has specific roll requirements for this mod
    let rollSuffix = '';
    if (isTarget && target?.finalRollRequirements) {
      for (const rollReq of target.finalRollRequirements) {
        const evalRes = evaluateRollRequirement(m, rollReq);
        if (evalRes.matchesMod) {
          const reqKey = rollReq.modGroup ?? rollReq.modId ?? rollReq.name ?? `stat${rollReq.statIndex ?? 0}`;
          const passStatus = evalRes.passes ? 'PASS' : 'FAIL';
          const valStr = evalRes.actualValue !== undefined ? `:${evalRes.actualValue}` : '';
          rollSuffix += `:roll(${reqKey}:${passStatus}${valStr})`;
        }
      }
    }

    // Always preserve full sorted modGroups exclusion set to ensure mod-group blocking and eligibility are preserved
    const allGroups = (m.modGroups && m.modGroups.length > 0 ? m.modGroups : [m.modGroup ?? m.modId]).slice().sort().join('+');
    return `${isFrac}groups(${allGroups}):t${m.tier}${targetSuffix}${fractureRequirement ? ':fracture-sensitive' : ''}${tagsSuffix}${rollSuffix}`;
  };

  const pKeys = state.prefixes.map(formatMod).sort().join('|');
  const sKeys = state.suffixes.map(formatMod).sort().join('|');

  const contextPrefix = options.includeContextScope
    ? `${state.baseType ?? 'Large Cluster Jewel'}:${state.clusterType ?? 'generic'}:${state.itemLevel ?? 84}:${state.passiveCount ?? 12}:` +
      `flags(influenced=${state.flags?.influenced === true || state.metadata?.influenced === true},` +
      `synthesised=${state.flags?.synthesised === true || state.metadata?.synthesised === true},` +
      `acquisitionMenu=${state.flags?.acquisitionMenu === true}):`
    : '';

  return `${contextPrefix}${state.rarity}|P:[${pKeys}]|S:[${sKeys}]`;
}
