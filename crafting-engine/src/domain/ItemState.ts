import type { RolledMod } from './Mod.ts';

export type BaseType = 'Large Cluster Jewel' | 'Medium Cluster Jewel' | 'Small Cluster Jewel';
export type ItemRarity = 'normal' | 'magic' | 'rare';

/** Flags that change modeled action legality or transition behavior. */
export interface ItemStateFlags {
  influenced?: boolean;
  synthesised?: boolean;
  /** Solver-only synthetic state exposing the acquisition portfolio. */
  acquisitionMenu?: boolean;
  /**
   * Solver-only evidence carried by a constrained method-family search.
   *
   * This is mechanical state, not presentation metadata: a family whose contract
   * requires an action (for example Harvest Reforge Defences) must not terminate
   * until one of those actions has actually occurred. Keeping the evidence in the
   * canonical state prevents pre-action and post-action states from being merged.
   */
  methodFamilyActionEvidence?: string[];
}

export interface ItemState {
  baseType: BaseType;
  clusterType: string;
  itemLevel: number;
  passiveCount?: number;
  rarity: ItemRarity;
  prefixes: RolledMod[];
  suffixes: RolledMod[];
  /** Derived compatibility index. RolledMod.isFractured is authoritative. */
  fracturedModIds: string[];
  flags?: ItemStateFlags;
  /** Non-mechanical annotations only. Never use this object for action legality. */
  metadata?: Record<string, unknown>;
}

function cloneMod(m: RolledMod): RolledMod {
  return {
    ...m,
    modGroups: [...m.modGroups],
    tags: m.tags ? [...m.tags] : undefined,
    craftTags: m.craftTags ? [...m.craftTags] : undefined,
    statValues: m.statValues.map((s) => ({ ...s })),
    currentRoll: m.currentRoll ? [...m.currentRoll] : undefined,
  };
}

/**
 * Normalizes every externally supplied/fixture state into the solver invariant:
 * RolledMod.isFractured is authoritative and fracturedModIds is derived from it.
 * Legacy metadata flags are migrated into the typed mechanics flags once.
 */
export function normalizeItemState(state: ItemState): ItemState {
  const prefixes = state.prefixes.map(cloneMod);
  const suffixes = state.suffixes.map(cloneMod);
  const affixes = [...prefixes, ...suffixes];
  const flags: ItemStateFlags = {
    influenced: state.flags?.influenced ?? (state.metadata?.influenced === true || undefined),
    synthesised: state.flags?.synthesised ?? (state.metadata?.synthesised === true || undefined),
    acquisitionMenu: state.flags?.acquisitionMenu,
    methodFamilyActionEvidence: state.flags?.methodFamilyActionEvidence
      ? [...new Set(state.flags.methodFamilyActionEvidence)].sort()
      : undefined,
  };

  return {
    baseType: state.baseType,
    clusterType: state.clusterType,
    itemLevel: state.itemLevel,
    passiveCount: state.passiveCount,
    rarity: state.rarity,
    prefixes,
    suffixes,
    fracturedModIds: affixes.filter((mod) => mod.isFractured).map((mod) => mod.modId),
    flags: flags.influenced || flags.synthesised || flags.acquisitionMenu ||
        (flags.methodFamilyActionEvidence?.length ?? 0) > 0
      ? flags
      : undefined,
    metadata: state.metadata ? structuredClone(state.metadata) : undefined,
  };
}

export function cloneItemState(state: ItemState): ItemState {
  return normalizeItemState(state);
}

export function isFracturedMod(_state: ItemState, mod: RolledMod): boolean {
  return mod.isFractured;
}

export function getPhysicalStateSignature(state: ItemState): string {
  const normalized = normalizeItemState(state);
  const modKey = (mod: RolledMod): string => [
    mod.genType,
    mod.modId,
    mod.tier,
    mod.isFractured ? 'F' : 'N',
    mod.currentRoll?.join(',') ?? '',
  ].join(':');
  return [
    normalized.baseType,
    normalized.clusterType,
    normalized.itemLevel,
    normalized.passiveCount ?? '',
    normalized.rarity,
    `influenced=${normalized.flags?.influenced === true}`,
    `synthesised=${normalized.flags?.synthesised === true}`,
    `acquisitionMenu=${normalized.flags?.acquisitionMenu === true}`,
    `methodFamilyActionEvidence=${normalized.flags?.methodFamilyActionEvidence?.join(',') ?? ''}`,
    ...normalized.prefixes.map(modKey).sort(),
    ...normalized.suffixes.map(modKey).sort(),
  ].join('|');
}

export function getAllAffixes(state: ItemState): RolledMod[] {
  return [...state.prefixes, ...state.suffixes];
}

export function getRemovableAffixes(state: ItemState): RolledMod[] {
  return getAllAffixes(state).filter((mod) => !isFracturedMod(state, mod));
}
