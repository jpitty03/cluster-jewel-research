import type { PriceBook, PriceSource } from '../domain/PriceBook.ts';

export type LifeforceType = 'wildLifeforce' | 'vividLifeforce' | 'primalLifeforce';

export interface HarvestCraftDefinition {
  craftId: string;
  name: string;
  tag: string;
  lifeforceType: LifeforceType;
  lifeforceAmount: number;
}

/**
 * Authoritative data-driven definitions for Harvest cluster jewel reforge crafts.
 * Eliminates silent fallback assumptions for unmodeled crafts.
 */
export const HARVEST_CRAFT_DEFINITIONS: Record<string, HarvestCraftDefinition> = {
  life: {
    craftId: 'harvest_reforge_life',
    name: 'Harvest Reforge Life',
    tag: 'life',
    lifeforceType: 'wildLifeforce',
    lifeforceAmount: 75,
  },
  defences: {
    craftId: 'harvest_reforge_defences',
    name: 'Harvest Reforge Defences',
    tag: 'defences',
    lifeforceType: 'primalLifeforce',
    lifeforceAmount: 75,
  },
  chaos: {
    craftId: 'harvest_reforge_chaos',
    name: 'Harvest Reforge Chaos',
    tag: 'chaos',
    lifeforceType: 'vividLifeforce',
    lifeforceAmount: 75,
  },
  speed: {
    craftId: 'harvest_reforge_speed',
    name: 'Harvest Reforge Speed',
    tag: 'speed',
    lifeforceType: 'vividLifeforce',
    lifeforceAmount: 75,
  },
  attack: {
    craftId: 'harvest_reforge_attack',
    name: 'Harvest Reforge Attack',
    tag: 'attack',
    lifeforceType: 'wildLifeforce',
    lifeforceAmount: 75,
  },
  caster: {
    craftId: 'harvest_reforge_caster',
    name: 'Harvest Reforge Caster',
    tag: 'caster',
    lifeforceType: 'primalLifeforce',
    lifeforceAmount: 75,
  },
  critical: {
    craftId: 'harvest_reforge_critical',
    name: 'Harvest Reforge Critical',
    tag: 'critical',
    lifeforceType: 'primalLifeforce',
    lifeforceAmount: 75,
  },
  physical: {
    craftId: 'harvest_reforge_physical',
    name: 'Harvest Reforge Physical',
    tag: 'physical',
    lifeforceType: 'wildLifeforce',
    lifeforceAmount: 75,
  },
  fire: {
    craftId: 'harvest_reforge_fire',
    name: 'Harvest Reforge Fire',
    tag: 'fire',
    lifeforceType: 'wildLifeforce',
    lifeforceAmount: 75,
  },
  cold: {
    craftId: 'harvest_reforge_cold',
    name: 'Harvest Reforge Cold',
    tag: 'cold',
    lifeforceType: 'primalLifeforce',
    lifeforceAmount: 75,
  },
  lightning: {
    craftId: 'harvest_reforge_lightning',
    name: 'Harvest Reforge Lightning',
    tag: 'lightning',
    lifeforceType: 'primalLifeforce',
    lifeforceAmount: 75,
  },
};

export interface CraftCostResult {
  costChaos: number;
  confidence: 'known' | 'research-fallback' | 'unavailable';
  source: PriceSource;
  provenance: string;
}

export function getHarvestCraftCost(
  tag: string,
  priceBook: PriceBook
): CraftCostResult {
  const def = HARVEST_CRAFT_DEFINITIONS[tag.toLowerCase()];
  if (!def) {
    return {
      costChaos: 0,
      confidence: 'unavailable',
      source: 'unavailable',
      provenance: `No Harvest craft definition for tag ${tag}`,
    };
  }
  const evaluation = priceBook.evaluateRate(def.lifeforceType);
  return {
    costChaos: evaluation.costChaos * def.lifeforceAmount,
    confidence: evaluation.confidence,
    source: evaluation.source,
    provenance: `${def.lifeforceAmount} ${def.lifeforceType} (${def.craftId})`,
  };
}
