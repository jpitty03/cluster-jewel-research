import { CraftingOptimizer } from '../src/index.ts';
import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { toRolledMod } from '../src/domain/Mod.ts';
import type { ItemState } from '../src/domain/ItemState.ts';

const optimizer = new CraftingOptimizer();
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

const cleanBaseState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while holding a Shield',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
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
      { modGroup: 'AfflictionJewelSmallPassivesGrantAttributes', maxTierNumber: 1 },
    ],
    finalRollRequirements: [
      { modGroup: 'AfflictionJewelSmallPassivesGrantInt', minValue: 8 },
    ],
  },
  startingStates: [
    {
      name: 'Purchased Fractured T1 Intelligence Base',
      state: fracIntState,
      baseCostChaos: 1000, // 5 divines
    },
    {
      name: 'Purchased Fractured 35% Effect Base',
      state: fracEffState,
      baseCostChaos: 6000, // 30 divines
    },
    {
      name: 'Clean 12-Passive Base (Self-Fracture Route)',
      state: cleanBaseState,
      baseCostChaos: 400, // 2 divines base
    },
  ],
  saleValueChaos: 12000, // 60 divines finished sale price
  enableAllflame: true,
  runMonteCarloValidation: true,
  monteCarloTrials: 2000,
});

console.log(craftAResponse.explanation);
if (craftAResponse.simulationValidation) {
  const mc = craftAResponse.simulationValidation;
  console.log('\nMonte Carlo Empirical Validation (2,000 Trials):');
  console.log(`  Empirical Mean Total Cost: ${mc.meanCostChaos.toFixed(1)}c (~${(mc.meanCostChaos / 200).toFixed(2)} div)`);
  console.log(`  Median Cost: ${mc.medianCostChaos.toFixed(1)}c (~${(mc.medianCostChaos / 200).toFixed(2)} div)`);
  console.log(`  75th Percentile: ${mc.p75CostChaos.toFixed(1)}c (~${(mc.p75CostChaos / 200).toFixed(2)} div)`);
  console.log(`  90th Percentile: ${mc.p90CostChaos.toFixed(1)}c (~${(mc.p90CostChaos / 200).toFixed(2)} div)`);
  console.log(`  95th Percentile: ${mc.p95CostChaos.toFixed(1)}c (~${(mc.p95CostChaos / 200).toFixed(2)} div)`);
}

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
});

console.log(craftBResponse.explanation);
console.log('='.repeat(80));
