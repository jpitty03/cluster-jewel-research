import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BaseType } from '../domain/ItemState.ts';
import type { Mod, GenType, StatValueRange } from '../domain/Mod.ts';

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
    for (const m of singleMatch) {
      const num = Number(m.replace('%', ''));
      if (!Number.isNaN(num)) {
        values.push({ text: m, min: num, max: num });
      }
    }
  }
  return values;
}

function normalizeTieredModName(name: string): string {
  // Normalize "Added Small Passive Skills also grant: 1% increased Attack Speed"
  // to "Added Small Passive Skills also grant: #% increased Attack Speed"
  return name.replace(/\b\d+(\.\d+)?%?\b/g, '#');
}

export class ClusterModRepository {
  private rawData: RawClusterData;
  private baseModsCache = new Map<BaseType, Mod[]>();
  private clusterTypePoolsCache = new Map<string, Mod[]>();

  constructor(customData?: RawClusterData) {
    if (customData) {
      this.rawData = customData;
    } else {
      const currentDir = dirname(fileURLToPath(import.meta.url));
      const projectRoot = join(currentDir, '..', '..', '..');
      const canonicalPath = join(projectRoot, 'data', 'poedb-cluster-mods.json');
      const content = readFileSync(canonicalPath, 'utf-8');
      this.rawData = JSON.parse(content);
    }
  }

  getBaseMods(baseType: BaseType): Mod[] {
    if (this.baseModsCache.has(baseType)) {
      return this.baseModsCache.get(baseType)!;
    }

    const raw = this.rawData.baseMods[baseType];
    if (!raw || !raw.mods) {
      return [];
    }

    const mods: Mod[] = raw.mods.map((m) => {
      const genType = m.genType === 'Prefix' ? 'Prefix' : 'Suffix';
      const modGroup = m.modGroup ?? m.modId ?? m.name;
      return {
        modId: m.modId ?? `${m.name}_${m.ilvl}`,
        name: m.name,
        genType,
        weight: m.weight,
        ilvl: m.ilvl,
        modGroup,
        modGroups: m.modGroups && m.modGroups.length > 0 ? m.modGroups : [modGroup],
        tags: m.tags || [],
        craftTags: m.craftTags || [],
        spawnTags: m.spawnTags || [],
        statText: m.statText,
        statValues: m.statValues || [],
        tier: m.tier ?? 1,
        tierCount: m.tierCount ?? 1,
        isNotable: false,
      };
    });

    this.baseModsCache.set(baseType, mods);
    return mods;
  }

  getClusterTypeMods(baseType: BaseType, clusterType: string): Mod[] {
    const cacheKey = `${baseType}||${clusterType}`;
    if (this.clusterTypePoolsCache.has(cacheKey)) {
      return this.clusterTypePoolsCache.get(cacheKey)!;
    }

    const pools = this.rawData.bases[baseType] || [];
    const targetPool = pools.find(
      (p) => p.clusterType === clusterType || p.clusterType.toLowerCase() === clusterType.toLowerCase()
    );

    if (!targetPool) {
      return [];
    }

    // Group notables by normalized name to identify tiered small passives vs unique notables
    const byNormalizedName = new Map<string, RawNotable[]>();
    for (const rawNotable of targetPool.notables) {
      const norm = normalizeTieredModName(rawNotable.name);
      if (!byNormalizedName.has(norm)) {
        byNormalizedName.set(norm, []);
      }
      byNormalizedName.get(norm)!.push(rawNotable);
    }

    const mods: Mod[] = [];

    for (const [normGroup, entries] of byNormalizedName.entries()) {
      const isTiered = entries.some((e) => e.name.startsWith('Added Small Passive Skills also grant:'));
      // Sort descending by ilvl (highest ilvl = tier 1)
      const sorted = [...entries].sort((a, b) => b.ilvl - a.ilvl);

      sorted.forEach((entry, idx) => {
        const genType: GenType = entry.genType === 'Prefix' ? 'Prefix' : 'Suffix';
        const isNotable = !isTiered;
        const modGroup = isTiered ? normGroup : entry.name;
        const tier = idx + 1;
        const tierCount = sorted.length;

        mods.push({
          modId: isTiered ? `${normGroup}_T${tier}` : entry.name,
          name: entry.name,
          genType,
          weight: entry.weight,
          ilvl: entry.ilvl,
          modGroup,
          modGroups: [modGroup],
          tags: entry.tags || [],
          craftTags: isNotable ? [] : (entry.tags || []),
          spawnTags: ['default'],
          statText: entry.name,
          statValues: parseStatValuesFromText(entry.name),
          tier,
          tierCount,
          isNotable,
        });
      });
    }

    this.clusterTypePoolsCache.set(cacheKey, mods);
    return mods;
  }

  getCombinedModPool(baseType: BaseType, clusterType: string): Mod[] {
    const baseMods = this.getBaseMods(baseType);
    const clusterMods = this.getClusterTypeMods(baseType, clusterType);
    return [...baseMods, ...clusterMods];
  }
}
