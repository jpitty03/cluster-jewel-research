import type { PriceBook, PriceSource } from '../domain/PriceBook.ts';

export type LifeforceType = 'wildLifeforce' | 'vividLifeforce' | 'primalLifeforce';

export interface HarvestCraftDefinition {
  craftId: string;
  name: string;
  tag: string;
  lifeforceType: LifeforceType;
  lifeforceAmount: number;
  /** Crystallised Rancour charged per application, on top of the lifeforce. */
  rancourAmount?: number;
}

/**
 * Harvest "Reforge a Rare item … including a <tag> modifier" crafts and what the
 * Horticrafting bench charges for each. The engine has no file access, so the
 * costs live here; `harvestCosts.test.ts` asserts every row against the scraped
 * `src/data/poedb-horticrafting.json`, so a re-scrape that moves a cost fails the
 * suite instead of being silently ignored.
 *
 * `tag` is the engine's mod tag (poedb's bench calls "defences" "Defence").
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
    lifeforceAmount: 100,
  },
  speed: {
    craftId: 'harvest_reforge_speed',
    name: 'Harvest Reforge Speed',
    tag: 'speed',
    lifeforceType: 'vividLifeforce',
    lifeforceAmount: 150,
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
    lifeforceAmount: 150,
  },
  physical: {
    craftId: 'harvest_reforge_physical',
    name: 'Harvest Reforge Physical',
    tag: 'physical',
    lifeforceType: 'vividLifeforce',
    lifeforceAmount: 50,
  },
  fire: {
    craftId: 'harvest_reforge_fire',
    name: 'Harvest Reforge Fire',
    tag: 'fire',
    lifeforceType: 'wildLifeforce',
    lifeforceAmount: 50,
  },
  cold: {
    craftId: 'harvest_reforge_cold',
    name: 'Harvest Reforge Cold',
    tag: 'cold',
    lifeforceType: 'vividLifeforce',
    lifeforceAmount: 50,
  },
  lightning: {
    craftId: 'harvest_reforge_lightning',
    name: 'Harvest Reforge Lightning',
    tag: 'lightning',
    lifeforceType: 'primalLifeforce',
    lifeforceAmount: 50,
  },
  elemental: {
    craftId: 'harvest_reforge_elemental',
    name: 'Harvest Reforge Elemental',
    tag: 'elemental',
    lifeforceType: 'wildLifeforce',
    lifeforceAmount: 200,
    rancourAmount: 1,
  },
  attribute: {
    craftId: 'harvest_reforge_attribute',
    name: 'Harvest Reforge Attribute',
    tag: 'attribute',
    lifeforceType: 'vividLifeforce',
    lifeforceAmount: 200,
    rancourAmount: 2,
  },
  minion: {
    craftId: 'harvest_reforge_minion',
    name: 'Harvest Reforge Minion',
    tag: 'minion',
    lifeforceType: 'primalLifeforce',
    lifeforceAmount: 200,
    rancourAmount: 3,
  },
  mana: {
    craftId: 'harvest_reforge_mana',
    name: 'Harvest Reforge Mana',
    tag: 'mana',
    lifeforceType: 'primalLifeforce',
    lifeforceAmount: 200,
    rancourAmount: 2,
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
  const lifeforceCost = evaluation.costChaos * def.lifeforceAmount;
  if (!def.rancourAmount) {
    return {
      costChaos: lifeforceCost,
      confidence: evaluation.confidence,
      source: evaluation.source,
      provenance: `${def.lifeforceAmount} ${def.lifeforceType} (${def.craftId})`,
    };
  }
  // Two inputs: the craft is only as well-priced as its weaker one.
  const rancour = priceBook.evaluateRate('crystallisedRancour');
  const weaker = CONFIDENCE_RANK[rancour.confidence] > CONFIDENCE_RANK[evaluation.confidence]
    ? rancour
    : evaluation;
  return {
    costChaos: lifeforceCost + rancour.costChaos * def.rancourAmount,
    confidence: weaker.confidence,
    source: weaker.source,
    provenance:
      `${def.lifeforceAmount} ${def.lifeforceType} + ${def.rancourAmount} crystallisedRancour (${def.craftId})`,
  };
}

const CONFIDENCE_RANK: Record<CraftCostResult['confidence'], number> = {
  known: 0,
  'research-fallback': 1,
  unavailable: 2,
};
