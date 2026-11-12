/**
 * How many explicit affixes a full reroll leaves on a rare jewel (cap: 2 prefixes,
 * 2 suffixes), shared by the enumerated and the sampled Harvest reforge.
 *
 * Source: Craft of Exile's simulator, `numOfAffixes[2]` in the model snapshot under
 * docs/crafting-engine/references/raw/craftofexile/model-2026-09-06/package.js:
 * 3 affixes 65%, 4 affixes 35%. The same table gives 1 or 2 affixes at 50% each for
 * magic items, which is what MAGIC_ROLL_SHAPE uses. The engine previously assumed 50/50
 * here with no source. Craft of Exile's figures are community-measured, not published by
 * the game, so this stays marked approximate.
 */
export const RARE_JEWEL_AFFIX_COUNT = Object.freeze({
  threeAffixProbability: 0.65,
  fourAffixProbability: 0.35,
  provenance:
    'Craft of Exile numOfAffixes for items capped at 2 prefixes / 2 suffixes ' +
    '(model snapshot 2026-09-06): 3 affixes 65%, 4 affixes 35%.',
  version: 'RARE_JEWEL_AFFIX_COUNT_COE_2026_09',
});

export function rareJewelAffixCountProbability(totalAffixes: 3 | 4): number {
  return totalAffixes === 3
    ? RARE_JEWEL_AFFIX_COUNT.threeAffixProbability
    : RARE_JEWEL_AFFIX_COUNT.fourAffixProbability;
}
