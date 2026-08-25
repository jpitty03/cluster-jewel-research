import type { ClusterModRepository } from '../data/clusterModRepository.ts';
import type { BaseType } from '../domain/ItemState.ts';
import {
  resolveModifierDisplayDescriptor,
  type ModifierDisplayDescriptor,
} from '../domain/ModifierDisplay.ts';

export interface CraftingCatalogMod extends ModifierDisplayDescriptor {
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
> & Partial<Pick<CraftingCatalogMod, 'tierLabel'>>;

type SelectionDisambiguationFields = SelectionLabelFields & Pick<
  CraftingCatalogMod,
  'modId' | 'selectionLabel'
>;

type SortableCatalogMod = Pick<CraftingCatalogMod, 'displayName' | 'tier' | 'modId'>;

const MODIFIER_LABEL_COLLATOR = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'variant',
});

/** Backward-compatible alias for the shared Phase 2U descriptor primary text. */
export function formatModifierPrimaryLabel(mod: PrimaryLabelFields): string {
  return resolveModifierDisplayDescriptor({
    modId: mod.modId,
    name: mod.technicalName,
    statText: mod.statText,
    tier: mod.tier,
    tierCount: mod.tierCount,
    genType: 'Prefix',
    ilvl: 1,
    modGroup: mod.modId,
    isNotable: mod.isNotable,
  }).primaryText;
}

export function formatModifierSelectionLabel(mod: SelectionLabelFields): string {
  const tier = mod.tierLabel ? ` · ${mod.tierLabel}` : '';
  return `${mod.displayName} · ${mod.genType}${tier} · ilvl ${mod.requiredItemLevel}`;
}

/**
 * Keep the primary label compact unless a real collision requires more information. Generation
 * type, tier, and level are the first fallback. A stable player-facing variant number is the
 * final tie-breaker; raw IDs remain confined to Technical details.
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
  const duplicateGroups = new Map<string, T[]>();
  for (const mod of contextual) {
    if (contextualCounts.get(mod.selectionLabel) === 1) continue;
    const group = duplicateGroups.get(mod.selectionLabel) ?? [];
    group.push(mod);
    duplicateGroups.set(mod.selectionLabel, group);
  }
  const variants = new Map<string, number>();
  for (const group of duplicateGroups.values()) {
    group.sort((left, right) => left.modId.localeCompare(right.modId));
    group.forEach((mod, index) => variants.set(mod.modId, index + 1));
  }
  return contextual.map((mod) => {
    const variant = variants.get(mod.modId);
    return variant === undefined
      ? mod
      : { ...mod, selectionLabel: `${mod.selectionLabel} · variant ${variant}` };
  });
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
  mod: Pick<CraftingCatalogMod, 'technicalName' | 'modId'> & Partial<Pick<CraftingCatalogMod, 'modGroup'>>
): string {
  return `Internal affix: ${mod.technicalName} · exact modifier ID: ${mod.modId}${mod.modGroup ? ` · exclusion group: ${mod.modGroup}` : ''}`;
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
        const descriptor = resolveModifierDisplayDescriptor(mod);
        const displayName = descriptor.primaryText;
        const catalogMod: CraftingCatalogMod = {
          ...descriptor,
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
        catalogMod.technicalLabel = descriptor.technicalText;
        catalogMod.searchAliases = buildModifierSearchAliases(catalogMod);
        return catalogMod;
      });

    return disambiguateModifierSelectionLabels(mods).sort(compareCraftingCatalogMods);
  }
}
