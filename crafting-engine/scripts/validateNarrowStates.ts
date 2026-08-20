import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { toRolledMod } from '../src/domain/Mod.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import { getEligibleMods, calculateTotalWeight } from '../src/rules/modEligibility.ts';

const repo = new ClusterModRepository();
const shieldPool = ModPool.forCluster(
  repo,
  'Large Cluster Jewel',
  '12% increased Attack Damage while holding a Shield'
);

const t1Int = shieldPool.findModById('AfflictionJewelSmallPassivesGrantInt3')!;
const t1ES = shieldPool.getAllMods().find(
  (m) => m.genType === 'Prefix' && m.modGroup === 'AfflictionJewelSmallPassivesGrantES' && m.tier === 1
)!;
const eff35 = shieldPool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2')!;

console.log('='.repeat(80));
console.log('PRIORITY 6: NARROW EXALT STATE OUTCOME VALIDATION');
console.log('='.repeat(80));

// ------------------------------------------------------------- STATE 1: Fractured T1 Int + T1 ES
console.log('\n>>> STATE 1: [Fractured T1 Int, T1 ES]');
const state1: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while holding a Shield',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(t1ES)],
  suffixes: [toRolledMod(t1Int, { isFractured: true, currentRoll: [8] })],
  fracturedModIds: [t1Int.modId],
};

const eligiblePrefixesState1 = getEligibleMods(state1, shieldPool.getAllMods(), { requiredGenType: 'Prefix' });
const totalPrefixWeightState1 = calculateTotalWeight(eligiblePrefixesState1);
const eff35Weight = eff35.weight;
const pNormalEff35 = eff35Weight / totalPrefixWeightState1;
const pAllflameEff35 = 1 - Math.pow(1 - pNormalEff35, 4);

console.log(`Eligible Prefix Count: ${eligiblePrefixesState1.length}`);
console.log(`Total Eligible Prefix Weight: ${totalPrefixWeightState1}`);
console.log(`35% Effect Weight: ${eff35Weight}`);
console.log(`P(35% Effect | Normal Exalt): ${(pNormalEff35 * 100).toFixed(4)}%`);
console.log(`P(35% Effect | Allflame Best of 4): ${(pAllflameEff35 * 100).toFixed(4)}%`);

let prefixProbSum = 0;
for (const m of eligiblePrefixesState1) {
  prefixProbSum += m.weight / totalPrefixWeightState1;
}
console.log(`Sum of all legal prefix probabilities: ${prefixProbSum.toFixed(6)} (Validated: ${Math.abs(prefixProbSum - 1.0) < 1e-5})`);

// ------------------------------------------------------------- STATE 2: Fractured T1 Int + T1 ES + 35% Effect
console.log('\n>>> STATE 2: [Fractured T1 Int, T1 ES, 35% Effect] (Prefixes Full 2/2)');
const state2: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while holding a Shield',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(t1ES), toRolledMod(eff35)],
  suffixes: [toRolledMod(t1Int, { isFractured: true, currentRoll: [8] })],
  fracturedModIds: [t1Int.modId],
};

const eligibleSuffixesState2 = getEligibleMods(state2, shieldPool.getAllMods());
const totalSuffixWeightState2 = calculateTotalWeight(eligibleSuffixesState2);

console.log(`Eligible Forced-Suffix Count: ${eligibleSuffixesState2.length}`);
console.log(`Total Eligible Suffix Weight: ${totalSuffixWeightState2}`);

let suffixProbSum = 0;
for (const m of eligibleSuffixesState2) {
  suffixProbSum += m.weight / totalSuffixWeightState2;
}
console.log(`Sum of all legal suffix probabilities: ${suffixProbSum.toFixed(6)} (Validated: ${Math.abs(suffixProbSum - 1.0) < 1e-5})`);

console.log('\nTop Target Suffix Probabilities:');
for (const mod of eligibleSuffixesState2) {
  if (
    mod.modGroup.includes('Attributes') ||
    mod.name.includes('Attack Speed') ||
    mod.modGroup.includes('ElementalRes')
  ) {
    const p = mod.weight / totalSuffixWeightState2;
    console.log(`  ${mod.name.padEnd(35)} (weight: ${mod.weight.toString().padStart(4)}) -> ${(p * 100).toFixed(4)}%`);
  }
}

console.log('='.repeat(80));
