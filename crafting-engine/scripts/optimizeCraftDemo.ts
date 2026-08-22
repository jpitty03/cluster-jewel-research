import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CraftingOptimizer } from '../src/index.ts';
import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { toRolledMod } from '../src/domain/Mod.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';

const priceBook = new PriceBook();
const optimizer = new CraftingOptimizer(undefined, priceBook);
const repo = new ClusterModRepository();

function outputPath(fileName: string): string {
  return fileURLToPath(new URL(`../../${fileName}`, import.meta.url));
}

function writeCraftOutput(fileName: string, explanation: string): void {
  writeFileSync(outputPath(fileName), `${explanation.trimEnd()}\n`, 'utf8');
  console.log(`\n[output] Wrote ${fileName}`);
}

/**
 * Keep a compact, connector-friendly review artifact alongside the full output.
 * The explanation can become very large because Monte Carlo traces and detailed
 * diagnostics are intentionally verbose. For review purposes, retain the head
 * (policy/route/diagnostic summary) and tail (validation/final results) while
 * omitting the verbose middle when necessary.
 */
function buildReviewOutput(explanation: string): string {
  const lines = explanation.replace(/\r\n/g, '\n').split('\n');
  const headLines = 420;
  const tailLines = 260;

  if (lines.length <= headLines + tailLines) {
    return explanation.trimEnd();
  }

  const omitted = lines.length - headLines - tailLines;
  return [
    ...lines.slice(0, headLines),
    '',
    '='.repeat(70),
    `REVIEW FILE NOTE: ${omitted} verbose middle lines omitted from this compact artifact.`,
    'See the corresponding full output-craft-*.txt file for complete Monte Carlo traces/details.',
    '='.repeat(70),
    '',
    ...lines.slice(-tailLines),
  ].join('\n').trimEnd();
}

function writeCraftReview(fileName: string, explanation: string): void {
  const review = buildReviewOutput(explanation);
  writeFileSync(outputPath(fileName), `${review}\n`, 'utf8');
  console.log(`[output] Wrote ${fileName}`);
}

console.log('='.repeat(80));
console.log('END-TO-END CRAFTING OPTIMIZER: DEMONSTRATION & BENCHMARKS');
console.log('='.repeat(80));

// ------------------------------------------------------------- DEMO 1: Reference Craft A
console.log('\n>>> OPTIMIZING REFERENCE CRAFT A: 12-Passive Shield Cluster (ilvl 84)');
const shieldPool = ModPool.forCluster(
  repo,
  'Large Cluster Jewel',
  '12% increased Attack Damage while holding a Shield'
);

const t1Int = shieldPool.findModById('AfflictionJewelSmallPassivesGrantInt3')!;
const eff35 = shieldPool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2')!;

const fracIntState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while holding a Shield',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [],
  suffixes: [toRolledMod(t1Int, { isFractured: true, currentRoll: [8] })],
  fracturedModIds: [t1Int.modId],
};

const fracEffState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while holding a Shield',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(eff35, { isFractured: true })],
  suffixes: [],
  fracturedModIds: [eff35.modId],
};

const craftAResponse = optimizer.optimizeCraft({
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while holding a Shield',
  itemLevel: 84,
  passiveCount: 12,
  target: {
    requiredMods: [
      { modGroup: 'AfflictionJewelSmallPassivesGrantES', maxTierNumber: 1 },
      { modGroup: 'AfflictionJewelSmallPassivesHaveIncreasedEffect', maxTierNumber: 1 },
      { modGroup: 'AfflictionJewelSmallPassivesGrantInt', maxTierNumber: 1 },
    ],
    outcomeBranches: [
      {
        name: '+4 All Attributes (T1)',
        requiredMods: [{ modGroup: 'AfflictionJewelSmallPassivesGrantAttributes', maxTierNumber: 1 }],
        saleValueChaos: 85 * 200, // 85 div = 17000c
      },
      {
        name: '3% Attack Speed (T1)',
        requiredMods: [{ modGroup: 'Added Small Passive Skills also grant: #% increased Attack Speed', maxTierNumber: 1 }],
        saleValueChaos: 39 * 200, // 39 div = 7800c
      },
      {
        name: '+4% All Elemental Resistance (T1)',
        requiredMods: [{ modGroup: 'AfflictionJewelSmallPassivesGrantElementalRes', maxTierNumber: 1 }],
        saleValueChaos: 7 * 200, // 7 div = 1400c
      },
    ],
  },
  startingStates: [
    {
      name: 'Self-Fracture 35% Effect (Clean 12p Base)',
      state: fracEffState,
      baseCostChaos: 1533.4, // 4 * (10c base + 14.35c prep + 359c fracture)
    },
    {
      name: 'Buy Fractured 35% Effect Base',
      state: fracEffState,
      baseCostChaos: 2600, // 13 divines
    },
    {
      name: 'Self-Fracture T1 Intelligence (Clean 12p Base)',
      state: fracIntState,
      baseCostChaos: 1542.3, // 4 * (10c base + 16.58c prep + 359c fracture)
    },
    {
      name: 'Buy Fractured T1 Intelligence Base',
      state: fracIntState,
      baseCostChaos: 1600, // 8 divines
    },
  ],
  enableAllflame: false,
  priceBook,
  runMonteCarloValidation: true,
  monteCarloTrials: 2000,
});

console.log(craftAResponse.explanation);
writeCraftOutput('output-craft-a.txt', craftAResponse.explanation);
writeCraftReview('output-craft-a-review.txt', craftAResponse.explanation);

// ------------------------------------------------------------- DEMO 2: Reference Craft B
console.log('\n>>> OPTIMIZING REFERENCE CRAFT B: 8-Passive Cold Cluster (ilvl 83)');
const coldCleanState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Cold Damage',
  itemLevel: 83,
  passiveCount: 8,
  rarity: 'rare',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};

const craftBResponse = optimizer.optimizeCraft({
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Cold Damage',
  itemLevel: 83,
  passiveCount: 8,
  target: {
    requiredMods: [
      { modGroup: 'Blanketed Snow' },
      { modGroup: 'Prismatic Heart' },
      { modGroup: 'Widespread Destruction' },
    ],
  },
  startingStates: [
    {
      name: 'Clean 8-Passive Cold Cluster Base',
      state: coldCleanState,
      baseCostChaos: 100, // 0.5 div base
    },
  ],
  saleValueChaos: 800, // 4 div finished sale price
  priceBook,
});

console.log(craftBResponse.explanation);
writeCraftOutput('output-craft-b.txt', craftBResponse.explanation);
writeCraftReview('output-craft-b-review.txt', craftBResponse.explanation);

// ------------------------------------------------------------- DEMO 3: Reference Craft C (Minion Cluster)
console.log('\n>>> OPTIMIZING REFERENCE CRAFT C: 12-Passive Minion Cluster (ilvl 84)');
const minionPool = ModPool.forCluster(
  repo,
  'Large Cluster Jewel',
  'Minions deal 10% increased Damage'
);

const t1Life = minionPool.findModById('AfflictionJewelSmallPassivesGrantLife3')!;
const eff35Minion = minionPool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2')!;
const t1Attr = minionPool.findModById('AfflictionJewelSmallPassivesGrantAttributes3')!;
const t1Chaos = minionPool.findModById('AfflictionJewelSmallPassivesGrantChaosRes3')!;

const fracLifeState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: 'Minions deal 10% increased Damage',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(t1Life, { isFractured: true })],
  suffixes: [],
  fracturedModIds: [t1Life.modId],
};

const fracEffMinionState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: 'Minions deal 10% increased Damage',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(eff35Minion, { isFractured: true })],
  suffixes: [],
  fracturedModIds: [eff35Minion.modId],
};

const fracAttrState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: 'Minions deal 10% increased Damage',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [],
  suffixes: [toRolledMod(t1Attr, { isFractured: true })],
  fracturedModIds: [t1Attr.modId],
};

const fracChaosState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: 'Minions deal 10% increased Damage',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [],
  suffixes: [toRolledMod(t1Chaos, { isFractured: true })],
  fracturedModIds: [t1Chaos.modId],
};

const craftCResponse = optimizer.optimizeCraft({
  baseType: 'Large Cluster Jewel',
  clusterType: 'Minions deal 10% increased Damage',
  itemLevel: 84,
  passiveCount: 12,
  target: {
    requiredMods: [
      { modGroup: 'AfflictionJewelSmallPassivesGrantLife', maxTierNumber: 1 },
      { modGroup: 'AfflictionJewelSmallPassivesHaveIncreasedEffect', maxTierNumber: 1 },
      { modGroup: 'AfflictionJewelSmallPassivesGrantAttributes', maxTierNumber: 1 },
      { modGroup: 'AfflictionJewelSmallPassivesGrantChaosRes', maxTierNumber: 1 },
    ],
  },
  startingStates: [
    {
      name: 'Fractured T1 Maximum Life Base (Self-Fracture)',
      state: fracLifeState,
      baseCostChaos: 1527.4, // 4 * (10c base + 12.85c prep + 359c fracture)
    },
    {
      name: 'Fractured 35% Increased Effect Base (Self-Fracture)',
      state: fracEffMinionState,
      baseCostChaos: 1533.4, // 4 * (10c base + 14.35c prep + 359c fracture)
    },
    {
      name: 'Fractured +4 to All Attributes Base (Self-Fracture)',
      state: fracAttrState,
      baseCostChaos: 1542.3, // 4 * (10c base + 16.58c prep + 359c fracture)
    },
    {
      name: 'Fractured +5% to Chaos Resistance Base (Self-Fracture)',
      state: fracChaosState,
      baseCostChaos: 1542.3, // 4 * (10c base + 16.58c prep + 359c fracture)
    },
  ],
  saleValueChaos: 160 * 200, // 160 divines = 32,000c
  enableAllflame: false,
  priceBook,
  runMonteCarloValidation: true,
  monteCarloTrials: 2000,
});

console.log(craftCResponse.explanation);
writeCraftOutput('output-craft-c.txt', craftCResponse.explanation);
writeCraftReview('output-craft-c-review.txt', craftCResponse.explanation);
console.log('='.repeat(80));
