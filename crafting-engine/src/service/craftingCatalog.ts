import type { ClusterModRepository } from '../data/clusterModRepository.ts';
import type { BaseType } from '../domain/ItemState.ts';

export interface CraftingCatalogMod {
  modId: string;
  displayName: string;
  name: string;
  statText: string;
  genType: 'Prefix' | 'Suffix';
  modGroup: string;
  tier: number;
  tierCount: number;
  requiredItemLevel: number;
  weight: number;
  isNotable: boolean;
}

const PASSIVE_COUNTS: Record<BaseType, number[]> = {
  'Large Cluster Jewel': [8, 9, 10, 11, 12],
  'Medium Cluster Jewel': [4, 5, 6],
  'Small Cluster Jewel': [2, 3],
};

/** Browser-safe query facade; React never needs to interpret the raw snapshot. */
export class CraftingCatalog {
  private readonly repository: ClusterModRepository;

  constructor(repository: ClusterModRepository) {
    this.repository = repository;
  }

  getBaseTypes(): BaseType[] {
    return this.repository.getBaseTypes();
  }

  getClusterTypes(baseType: BaseType): string[] {
    return this.repository.getClusterTypes(baseType);
  }

  getPassiveCounts(baseType: BaseType): number[] {
    return [...PASSIVE_COUNTS[baseType]];
  }

  getEligibleMods(
    baseType: BaseType,
    clusterType: string,
    itemLevel: number
  ): CraftingCatalogMod[] {
    return this.repository
      .getCombinedModPool(baseType, clusterType)
      .filter((mod) => mod.ilvl <= itemLevel)
      .map((mod) => ({
        modId: mod.modId,
        displayName: `${mod.name}${mod.tierCount > 1 ? ` (T${mod.tier})` : ''}`,
        name: mod.name,
        statText: mod.statText,
        genType: mod.genType,
        modGroup: mod.modGroup,
        tier: mod.tier,
        tierCount: mod.tierCount,
        requiredItemLevel: mod.ilvl,
        weight: mod.weight,
        isNotable: mod.isNotable,
      }))
      .sort((left, right) =>
        left.displayName.localeCompare(right.displayName) || left.modId.localeCompare(right.modId)
      );
  }
}
