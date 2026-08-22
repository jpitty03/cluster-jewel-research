import { CraftingOptimizer } from '../src/index.ts';
import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { toRolledMod } from '../src/domain/Mod.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';

const priceBook = new PriceBook();
const optimizer = new CraftingOptimizer(undefined, priceBook);
const repo = new ClusterModRepository();

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
      name: 'Buy Fractured T1 Intelligence Base',
      state: fracIntState,
      baseCostChaos: 1600, // 8 divines
    },
    {
      name: 'Self-Fracture T1 Intelligence (Clean 12p Base)',
      state: fracIntState,
      baseCostChaos: 1516.6, // 4 * (10c base + 10.16c prep + 359c fracture)
    },
    {
      name: 'Self-Fracture 35% Effect (Clean 12p Base)',
      state: fracEffState,
      baseCostChaos: 1550.0, // 4 * (10c base + 18.5c prep + 359c fracture)
    },
    {
      name: 'Buy Fractured 35% Effect Base',
      state: fracEffState,
      baseCostChaos: 2600, // 13 divines
    },
  ],
  enableAllflame: true,
  priceBook,
  runMonteCarloValidation: true,
  monteCarloTrials: 2000,
});

console.log(craftAResponse.explanation);

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
console.log('='.repeat(80));
