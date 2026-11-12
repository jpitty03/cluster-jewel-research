import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { HARVEST_CRAFT_DEFINITIONS } from '../../src/rules/harvestCrafts.ts';

interface ScrapedCraft {
  action: string;
  modTag: string | null;
  cost: { itemId: string; amount: number }[];
}

const scraped = JSON.parse(
  readFileSync(new URL('../../../src/data/poedb-horticrafting.json', import.meta.url), 'utf8')
) as { crafts: ScrapedCraft[] };

// poedb's bench label -> engine mod tag, where they differ.
const BENCH_TAG: Record<string, string> = { defences: 'Defence' };
const LIFEFORCE_ITEM: Record<string, string> = {
  wildLifeforce: 'Wild_Crystallised_Lifeforce',
  vividLifeforce: 'Vivid_Crystallised_Lifeforce',
  primalLifeforce: 'Primal_Crystallised_Lifeforce',
};

describe('Harvest reforge costs', () => {
  it.each(Object.values(HARVEST_CRAFT_DEFINITIONS))(
    '$name matches the scraped Horticrafting bench',
    (definition) => {
      const benchTag = BENCH_TAG[definition.tag] ?? definition.tag;
      const craft = scraped.crafts.find(
        (candidate) =>
          candidate.action === 'Reforge' &&
          candidate.modTag?.toLowerCase() === benchTag.toLowerCase()
      );
      expect(craft, `no scraped reforge for ${definition.tag}`).toBeDefined();
      const expected = [
        { itemId: LIFEFORCE_ITEM[definition.lifeforceType], amount: definition.lifeforceAmount },
        ...(definition.rancourAmount
          ? [{ itemId: 'Crystallised_Rancour', amount: definition.rancourAmount }]
          : []),
      ];
      expect(craft!.cost.map(({ itemId, amount }) => ({ itemId, amount }))).toEqual(expected);
    }
  );
});
