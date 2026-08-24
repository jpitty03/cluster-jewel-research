import type { ClusterModRepository } from '../data/clusterModRepository.ts';
import type { BaseType } from '../domain/ItemState.ts';

export interface CraftingCatalogMod {
  modId: string;
  /** Player-facing identity: the granted stat/notable statement, plus tier when needed. */
  displayName: string;
  /** Compact dropdown label, expanded with stable technical disambiguation only on collision. */
  selectionLabel: string;
  /** PoE/internal affix name retained for search and diagnostics, never as the ordinary primary. */
  technicalName: string;
  /** Compact technical/debug identity retaining both the internal name and exact mod ID. */
  technicalLabel: string;
  /** Complete case-preserving aliases; consumers choose their own case-folding strategy. */
  searchAliases: string[];
  /** Backward-compatible internal-name field. Prefer `technicalName` in presentation code. */
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

type PrimaryLabelFields = Pick<
  CraftingCatalogMod,
  'modId' | 'statText' | 'technicalName' | 'tier' | 'tierCount' | 'isNotable'
>;

type SelectionLabelFields = Pick<
  CraftingCatalogMod,
  'displayName' | 'genType' | 'requiredItemLevel'
>;

type SelectionDisambiguationFields = SelectionLabelFields & Pick<
  CraftingCatalogMod,
  'modId' | 'selectionLabel'
>;

type SortableCatalogMod = Pick<CraftingCatalogMod, 'displayName' | 'tier' | 'modId'>;

const MODIFIER_LABEL_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'variant',
});

/** Shared Phase 2F player-facing label contract for ordinary mods and notables. */
export function formatModifierPrimaryLabel(mod: PrimaryLabelFields): string {
  const playerText = mod.statText.trim() ||
    (mod.isNotable ? mod.technicalName : `Modifier ${mod.modId}`);
  return mod.tierCount > 1 ? `${playerText} (T${mod.tier})` : playerText;
}

export function formatModifierSelectionLabel(mod: SelectionLabelFields): string {
  return `${mod.displayName} · ${mod.genType}, ilvl ${mod.requiredItemLevel}`;
}

/**
 * Keep the primary label compact unless a real collision requires more information. Generation
 * type and level are the first fallback; exact mod ID is the final deterministic tie-breaker.
 */
export function disambiguateModifierSelectionLabels<T extends SelectionDisambiguationFields>(
  mods: T[]
): T[] {
  const primaryCounts = new Map<string, number>();
  for (const mod of mods) {
    primaryCounts.set(mod.displayName, (primaryCounts.get(mod.displayName) ?? 0) + 1);
  }
  const contextual = mods.map((mod) => primaryCounts.get(mod.displayName) === 1
    ? { ...mod, selectionLabel: mod.displayName }
    : { ...mod, selectionLabel: formatModifierSelectionLabel(mod) });
  const contextualCounts = new Map<string, number>();
  for (const mod of contextual) {
    contextualCounts.set(
      mod.selectionLabel,
      (contextualCounts.get(mod.selectionLabel) ?? 0) + 1
    );
  }
  return contextual.map((mod) => contextualCounts.get(mod.selectionLabel) === 1
    ? mod
    : { ...mod, selectionLabel: `${mod.selectionLabel} · ${mod.modId}` });
}

export function compareCraftingCatalogMods(
  left: SortableCatalogMod,
  right: SortableCatalogMod
): number {
  return MODIFIER_LABEL_COLLATOR.compare(left.displayName, right.displayName) ||
    left.tier - right.tier ||
    (left.modId < right.modId ? -1 : left.modId > right.modId ? 1 : 0);
}

export function formatModifierTechnicalLabel(
  mod: Pick<CraftingCatalogMod, 'technicalName' | 'modId'>
): string {
  return `Internal affix: ${mod.technicalName} · exact modifier ID: ${mod.modId}`;
}

export function buildModifierSearchAliases(
  mod: Pick<
    CraftingCatalogMod,
    'displayName' | 'statText' | 'technicalName' | 'modId' | 'tier' | 'genType' | 'isNotable'
      | 'tierCount'
  >
): string[] {
  return [...new Set([
    mod.displayName,
    mod.statText,
    mod.technicalName,
    mod.modId,
    ...(mod.tierCount > 1 ? [`T${mod.tier}`] : []),
    mod.genType,
    mod.isNotable ? 'Notable' : 'Ordinary',
  ])];
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
    const mods = this.repository
      .getCombinedModPool(baseType, clusterType)
      .filter((mod) => mod.ilvl <= itemLevel)
      .map((mod): CraftingCatalogMod => {
        const labelFields = {
          modId: mod.modId,
          statText: mod.statText,
          technicalName: mod.name,
          tier: mod.tier,
          tierCount: mod.tierCount,
          isNotable: mod.isNotable,
        };
        const displayName = formatModifierPrimaryLabel(labelFields);
        const catalogMod: CraftingCatalogMod = {
          modId: mod.modId,
          displayName,
          selectionLabel: displayName,
          technicalName: mod.name,
          technicalLabel: '',
          searchAliases: [],
          name: mod.name,
          statText: mod.statText,
          genType: mod.genType,
          modGroup: mod.modGroup,
          tier: mod.tier,
          tierCount: mod.tierCount,
          requiredItemLevel: mod.ilvl,
          weight: mod.weight,
          isNotable: mod.isNotable,
        };
        catalogMod.technicalLabel = formatModifierTechnicalLabel(catalogMod);
        catalogMod.searchAliases = buildModifierSearchAliases(catalogMod);
        return catalogMod;
      });

    return disambiguateModifierSelectionLabels(mods).sort(compareCraftingCatalogMods);
  }
}
