import type { BaseType } from '../domain/ItemState.ts';
import type { GenType, Mod, StatValueRange } from '../domain/Mod.ts';

export interface RawNotable {
  name: string;
  weight: number;
  ilvl: number;
  genType: string;
  tags: string[];
}

export interface RawEnchantPool {
  clusterType: string;
  totalWeight: number;
  notables: RawNotable[];
}

export interface RawBaseMod {
  name: string;
  modId: string | null;
  genType: string;
  weight: number;
  ilvl: number;
  modGroup: string | null;
  modGroups: string[];
  tags: string[];
  craftTags: string[];
  spawnTags: string[];
  statText: string;
  statValues: StatValueRange[];
  tier?: number;
  tierCount?: number;
  pct?: number;
}

export interface RawClusterData {
  fetchedAt: string;
  source: string;
  bases: Record<string, RawEnchantPool[]>;
  baseMods: Record<string, { totalWeight: { Prefix: number; Suffix: number }; mods: RawBaseMod[] }>;
}

function parseStatValuesFromText(text: string): StatValueRange[] {
  const values: StatValueRange[] = [];
  const rangeMatch = text.match(/\(\s*(-?[\d.]+)\s*[—–-]\s*(-?[\d.]+)\s*\)/);
  if (rangeMatch) {
    values.push({ text: rangeMatch[0], min: Number(rangeMatch[1]), max: Number(rangeMatch[2]) });
    return values;
  }
  const singleMatch = text.match(/(\d+(?:\.\d+)?%?)/g);
  if (singleMatch) {
    for (const match of singleMatch) {
      const value = Number(match.replace('%', ''));
      if (!Number.isNaN(value)) values.push({ text: match, min: value, max: value });
    }
  }
  return values;
}

function normalizeTieredModName(name: string): string {
  return name.replace(/\b\d+(\.\d+)?%?\b/g, '#');
}

/** Environment-neutral parser/repository. The caller owns data acquisition. */
export class ClusterModRepository {
  private readonly rawData: RawClusterData;
  private readonly baseModsCache = new Map<BaseType, Mod[]>();
  private readonly clusterTypePoolsCache = new Map<string, Mod[]>();

  constructor(rawData: RawClusterData) {
    this.rawData = rawData;
  }

  getBaseTypes(): BaseType[] {
    return Object.keys(this.rawData.bases)
      .filter((value): value is BaseType =>
        value === 'Large Cluster Jewel' ||
        value === 'Medium Cluster Jewel' ||
        value === 'Small Cluster Jewel'
      )
      .sort();
  }

  getClusterTypes(baseType: BaseType): string[] {
    return (this.rawData.bases[baseType] ?? [])
      .map((pool) => pool.clusterType)
      .sort((left, right) => left.localeCompare(right));
  }

  getBaseMods(baseType: BaseType): Mod[] {
    const cached = this.baseModsCache.get(baseType);
    if (cached) return cached;
    const raw = this.rawData.baseMods[baseType];
    if (!raw?.mods) return [];

    const mods: Mod[] = raw.mods.map((mod) => {
      const genType: GenType = mod.genType === 'Prefix' ? 'Prefix' : 'Suffix';
      const modGroup = mod.modGroup ?? mod.modId ?? mod.name;
      return {
        modId: mod.modId ?? `${mod.name}_${mod.ilvl}`,
        name: mod.name,
        genType,
        weight: mod.weight,
        ilvl: mod.ilvl,
        modGroup,
        modGroups: mod.modGroups?.length > 0 ? mod.modGroups : [modGroup],
        tags: mod.tags ?? [],
        craftTags: mod.craftTags ?? [],
        spawnTags: mod.spawnTags ?? [],
        statText: mod.statText,
        statValues: mod.statValues ?? [],
        tier: mod.tier ?? 1,
        tierCount: mod.tierCount ?? 1,
        isNotable: false,
      };
    });
    this.baseModsCache.set(baseType, mods);
    return mods;
  }

  getClusterTypeMods(baseType: BaseType, clusterType: string): Mod[] {
    const cacheKey = `${baseType}||${clusterType}`;
    const cached = this.clusterTypePoolsCache.get(cacheKey);
    if (cached) return cached;
    const targetPool = (this.rawData.bases[baseType] ?? []).find(
      (pool) => pool.clusterType.toLowerCase() === clusterType.toLowerCase()
    );
    if (!targetPool) return [];

    const byNormalizedName = new Map<string, RawNotable[]>();
    for (const rawNotable of targetPool.notables) {
      const normalizedName = normalizeTieredModName(rawNotable.name);
      const entries = byNormalizedName.get(normalizedName) ?? [];
      entries.push(rawNotable);
      byNormalizedName.set(normalizedName, entries);
    }

    const mods: Mod[] = [];
    for (const [normalizedName, entries] of byNormalizedName) {
      const isTiered = entries.some((entry) =>
        entry.name.startsWith('Added Small Passive Skills also grant:')
      );
      const sorted = [...entries].sort((left, right) => right.ilvl - left.ilvl);
      sorted.forEach((entry, index) => {
        const genType: GenType = entry.genType === 'Prefix' ? 'Prefix' : 'Suffix';
        const isNotable = !isTiered;
        const modGroup = isTiered ? normalizedName : entry.name;
        const tier = index + 1;
        mods.push({
          modId: isTiered ? `${normalizedName}_T${tier}` : entry.name,
          name: entry.name,
          genType,
          weight: entry.weight,
          ilvl: entry.ilvl,
          modGroup,
          modGroups: [modGroup],
          tags: entry.tags ?? [],
          craftTags: isNotable ? [] : (entry.tags ?? []),
          spawnTags: ['default'],
          statText: entry.name,
          statValues: parseStatValuesFromText(entry.name),
          tier,
          tierCount: sorted.length,
          isNotable,
        });
      });
    }
    this.clusterTypePoolsCache.set(cacheKey, mods);
    return mods;
  }

  getCombinedModPool(baseType: BaseType, clusterType: string): Mod[] {
    return [...this.getBaseMods(baseType), ...this.getClusterTypeMods(baseType, clusterType)];
  }
}
