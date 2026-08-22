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
}

export interface RolledMod {
  modId: string;
  name: string;
  genType: GenType;
  modGroup: string;
  modGroups: string[];
  craftTags?: string[];
  tier: number;
  statText: string;
  statValues: StatValueRange[];
  currentRoll?: number[];
  isFractured: boolean;
  isNotable: boolean;
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
  };
}
