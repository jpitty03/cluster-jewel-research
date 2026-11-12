export type GenType = 'Prefix' | 'Suffix';

export interface StatValueRange {
  text: string;
  min: number;
  max: number;
}

export interface Mod {
  modId: string;
  name: string;
  genType: GenType;
  weight: number;
  ilvl: number;
  modGroup: string;
  modGroups: string[];
  tags: string[];
  craftTags: string[];
  spawnTags: string[];
  statText: string;
  statValues: StatValueRange[];
  tier: number;
  tierCount: number;
  isNotable: boolean;
  /** The same display/name key exists in another exclusion group in this pool. */
  eligibilityNameSensitive?: boolean;
  /** Set by ModPool: see ExclusionClass. */
  exclusionClass?: ExclusionClass;
}

/**
 * Interchangeability class for a mod that is NOT part of the craft target.
 *
 * Every modeled action sees a non-target ("junk") mod only through (a) the side it
 * occupies, (b) whether it uses notable capacity, and (c) which pool mods its
 * exclusion group removes from later rolls. Two mods whose groups contain the same
 * multiset of (side, notable, ilvl, weight) members therefore produce identical
 * legality, costs and transition probabilities at every item level, so search may
 * treat them as one state. `signature` is that multiset; `memberIds`/`memberNames`
 * let a caller detect that the group also hosts a target mod, in which case the
 * junk mod blocks the target and must keep its own identity.
 */
export interface ExclusionClass {
  signature: string;
  memberIds: ReadonlySet<string>;
  memberNames: ReadonlySet<string>;
}

export interface RolledMod {
  modId: string;
  name: string;
  genType: GenType;
  modGroup: string;
  modGroups: string[];
  /** Legacy policy fixtures still expose this deprecated tag field. */
  tags?: string[];
  craftTags?: string[];
  tier: number;
  statText: string;
  statValues: StatValueRange[];
  currentRoll?: number[];
  isFractured: boolean;
  isNotable: boolean;
  /** Preserve the name in canonical identity because duplicate-name eligibility can differ. */
  eligibilityNameSensitive?: boolean;
  /** Shared reference to the pool mod's class; see ExclusionClass. */
  exclusionClass?: ExclusionClass;
}

export function toRolledMod(
  mod: Mod,
  options: {
    isFractured?: boolean;
    currentRoll?: number[];
  } = {}
): RolledMod {
  return {
    modId: mod.modId,
    name: mod.name,
    genType: mod.genType,
    modGroup: mod.modGroup,
    modGroups: mod.modGroups && mod.modGroups.length > 0 ? [...mod.modGroups] : [mod.modGroup],
    craftTags: mod.craftTags ? [...mod.craftTags] : [],
    tier: mod.tier,
    statText: mod.statText,
    statValues: mod.statValues.map((s) => ({ ...s })),
    currentRoll: options.currentRoll ? [...options.currentRoll] : undefined,
    isFractured: options.isFractured ?? false,
    isNotable: mod.isNotable,
    eligibilityNameSensitive: mod.eligibilityNameSensitive,
    exclusionClass: mod.exclusionClass,
  };
}
