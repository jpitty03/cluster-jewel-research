import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import { toRolledMod } from '../src/domain/Mod.ts';
import { getEligibleMods, calculateTotalWeight } from '../src/rules/modEligibility.ts';

const repo = new ClusterModRepository();

console.log('='.repeat(80));
console.log('PHASE 1 DIAGNOSTIC REPORT: REFERENCE CRAFTS A & B');
console.log('='.repeat(80));

// ------------------------------------------------------------- Reference Craft A
console.log('\n--- REFERENCE CRAFT A: 12-Passive Shield Cluster (ilvl 84) ---');
const shieldPool = ModPool.forCluster(
  repo,
  'Large Cluster Jewel',
  '12% increased Attack Damage while holding a Shield'
);

const stateA0: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while holding a Shield',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};

const initialEligibleA = getEligibleMods(stateA0, shieldPool.getAllMods());
const initialPrefixesA = initialEligibleA.filter((m) => m.genType === 'Prefix');
const initialSuffixesA = initialEligibleA.filter((m) => m.genType === 'Suffix');
const notablesA = initialEligibleA.filter((m) => m.isNotable);

const totalWeightA = calculateTotalWeight(initialEligibleA);
const preWeightA = calculateTotalWeight(initialPrefixesA);
const sufWeightA = calculateTotalWeight(initialSuffixesA);

console.log(`Eligible Initial Prefix Pool Count: ${initialPrefixesA.length}, Total Prefix Weight: ${preWeightA}`);
console.log(`Eligible Initial Suffix Pool Count: ${initialSuffixesA.length}, Total Suffix Weight: ${sufWeightA}`);
console.log(`Combined Initial Pool Weight: ${totalWeightA} (Prefix: ${preWeightA}, Suffix: ${sufWeightA})`);
console.log(`Eligible Notables Count: ${notablesA.length}, Total Notables Weight: ${calculateTotalWeight(notablesA)}`);

// Reference Craft A Target Mods
const t1ES = initialPrefixesA.find((m) => m.name === 'Glowing')!;
const eff35 = initialPrefixesA.find((m) => m.name === 'Powerful')!;
const t1Int = initialSuffixesA.find((m) => m.name === 'of the Prodigy')!;
const attr4 = initialSuffixesA.find((m) => m.name === 'of the Meteor')!;
const as3 = initialSuffixesA.find((m) => m.name.includes('3% increased Attack Speed'))!;
const eleRes4 = initialSuffixesA.find((m) => m.name === 'of the Kaleidoscope')!;

console.log('\nTarget Mod Weights in Reference Craft A:');
console.log(`  T1 ES (Glowing): weight ${t1ES.weight}, group: ${t1ES.modGroup}`);
console.log(`  T1 35% Effect (Powerful): weight ${eff35.weight}, group: ${eff35.modGroup}`);
console.log(`  T1 Intelligence (of the Prodigy): weight ${t1Int.weight}, group: ${t1Int.modGroup}`);
console.log(`  +4 All Attributes (of the Meteor): weight ${attr4.weight}, group: ${attr4.modGroup}`);
console.log(`  3% Attack Speed: weight ${as3.weight}, group: ${as3.modGroup}`);
console.log(`  +4% All Elemental Res (of the Kaleidoscope): weight ${eleRes4.weight}, group: ${eleRes4.modGroup}`);

// Progressive blocked groups simulation (Starting from fractured T1 Int)
console.log('\nStep-by-step blocked groups & remaining weights (Starting from fractured T1 Int):');
const stateA1: ItemState = {
  ...stateA0,
  suffixes: [toRolledMod(t1Int, { isFractured: true, currentRoll: [8] })],
  fracturedModIds: [t1Int.modId],
};
const eligibleA1 = getEligibleMods(stateA1, shieldPool.getAllMods());
const preA1 = eligibleA1.filter((m) => m.genType === 'Prefix');
const sufA1 = eligibleA1.filter((m) => m.genType === 'Suffix');
console.log(`  [State 1: Fractured T1 Int] Blocked: ${t1Int.modGroup}`);
console.log(`    Remaining Prefix Weight: ${calculateTotalWeight(preA1)} (Conditional T1 ES chance on prefix roll: ${(t1ES.weight / calculateTotalWeight(preA1) * 100).toFixed(3)}%)`);
console.log(`    Remaining Suffix Weight: ${calculateTotalWeight(sufA1)}`);

const stateA2: ItemState = {
  ...stateA1,
  prefixes: [toRolledMod(t1ES, { currentRoll: [12] })],
};
const eligibleA2 = getEligibleMods(stateA2, shieldPool.getAllMods());
const preA2 = eligibleA2.filter((m) => m.genType === 'Prefix');
const sufA2 = eligibleA2.filter((m) => m.genType === 'Suffix');
console.log(`  [State 2: + T1 ES] Blocked: ${t1Int.modGroup}, ${t1ES.modGroup}`);
console.log(`    Remaining Prefix Weight: ${calculateTotalWeight(preA2)} (Conditional 35% Effect chance on prefix roll: ${(eff35.weight / calculateTotalWeight(preA2) * 100).toFixed(3)}%)`);
console.log(`    Remaining Suffix Weight: ${calculateTotalWeight(sufA2)}`);

const stateA3: ItemState = {
  ...stateA2,
  prefixes: [...stateA2.prefixes, toRolledMod(eff35)],
};
const eligibleA3 = getEligibleMods(stateA3, shieldPool.getAllMods());
const sufA3 = eligibleA3.filter((m) => m.genType === 'Suffix');
const premiumSuffixWeight = attr4.weight + as3.weight + eleRes4.weight;
console.log(`  [State 3: + 35% Effect (Prefixes full: 2/2)] Blocked: ${t1Int.modGroup}, ${t1ES.modGroup}, ${eff35.modGroup}`);
console.log(`    Remaining Suffix Weight: ${calculateTotalWeight(sufA3)}`);
console.log(`    Combined Premium Suffix Weight: ${premiumSuffixWeight} (Hit any premium suffix chance on final suffix slam: ${(premiumSuffixWeight / calculateTotalWeight(sufA3) * 100).toFixed(3)}%)`);

const stateA4: ItemState = {
  ...stateA3,
  suffixes: [...stateA3.suffixes, toRolledMod(attr4, { currentRoll: [4] })],
};
const eligibleA4 = getEligibleMods(stateA4, shieldPool.getAllMods());
console.log(`  [State 4: + +4 All Attributes (Terminal Full 4-Mod Craft A: 2P/2S)]`);
console.log(`    Remaining Eligible Mods: ${eligibleA4.length} (Item is full)`);

// ------------------------------------------------------------- Reference Craft B
console.log('\n--- REFERENCE CRAFT B: 8-Passive Cold Cluster (ilvl 83) ---');
const coldPool = ModPool.forCluster(
  repo,
  'Large Cluster Jewel',
  '12% increased Cold Damage'
);

const stateB0: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Cold Damage',
  itemLevel: 83,
  passiveCount: 8,
  rarity: 'rare',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};

const initialEligibleB = getEligibleMods(stateB0, coldPool.getAllMods());
const initialPrefixesB = initialEligibleB.filter((m) => m.genType === 'Prefix');
const initialSuffixesB = initialEligibleB.filter((m) => m.genType === 'Suffix');
const notablesB = initialEligibleB.filter((m) => m.isNotable);

const totalWeightB = calculateTotalWeight(initialEligibleB);
const preWeightB = calculateTotalWeight(initialPrefixesB);
const sufWeightB = calculateTotalWeight(initialSuffixesB);

console.log(`Eligible Initial Prefix Pool Count: ${initialPrefixesB.length}, Total Prefix Weight: ${preWeightB}`);
console.log(`Eligible Initial Suffix Pool Count: ${initialSuffixesB.length}, Total Suffix Weight: ${sufWeightB}`);
console.log(`Combined Initial Pool Weight: ${totalWeightB} (Prefix: ${preWeightB}, Suffix: ${sufWeightB})`);
console.log(`Eligible Notables Count: ${notablesB.length}, Total Notables Weight: ${calculateTotalWeight(notablesB)}`);

const bs = initialPrefixesB.find((m) => m.name === 'Blanketed Snow')!;
const ph = initialPrefixesB.find((m) => m.name === 'Prismatic Heart')!;
const wd = initialSuffixesB.find((m) => m.name === 'Widespread Destruction')!;

console.log('\nTarget Mod Weights in Reference Craft B:');
console.log(`  Blanketed Snow (Prefix): weight ${bs.weight}, group: ${bs.modGroup}`);
console.log(`  Prismatic Heart (Prefix): weight ${ph.weight}, group: ${ph.modGroup}`);
console.log(`  Widespread Destruction (Suffix): weight ${wd.weight}, group: ${wd.modGroup}`);

// Step-by-step blocked groups walk for Craft B
console.log('\nStep-by-step blocked groups & remaining weights for Craft B:');
const stateB1: ItemState = {
  ...stateB0,
  prefixes: [toRolledMod(bs)],
};
const eligibleB1 = getEligibleMods(stateB1, coldPool.getAllMods());
const preB1 = eligibleB1.filter((m) => m.genType === 'Prefix');
const sufB1 = eligibleB1.filter((m) => m.genType === 'Suffix');
console.log(`  [State 1: + Blanketed Snow] Blocked: ${bs.modGroup}`);
console.log(`    Remaining Prefix Weight: ${calculateTotalWeight(preB1)} (Conditional Prismatic Heart chance on prefix roll: ${(ph.weight / calculateTotalWeight(preB1) * 100).toFixed(3)}%)`);
console.log(`    Remaining Suffix Weight: ${calculateTotalWeight(sufB1)} (Conditional Widespread Destruction chance on suffix roll: ${(wd.weight / calculateTotalWeight(sufB1) * 100).toFixed(3)}%)`);

const stateB2: ItemState = {
  ...stateB1,
  prefixes: [...stateB1.prefixes, toRolledMod(ph)],
};
const eligibleB2 = getEligibleMods(stateB2, coldPool.getAllMods());
const sufB2 = eligibleB2.filter((m) => m.genType === 'Suffix');
console.log(`  [State 2: + Prismatic Heart (Prefixes full: 2/2)] Blocked: ${bs.modGroup}, ${ph.modGroup}`);
console.log(`    Remaining Suffix Weight: ${calculateTotalWeight(sufB2)} (Conditional Widespread Destruction chance on suffix slam: ${(wd.weight / calculateTotalWeight(sufB2) * 100).toFixed(3)}%)`);

const stateB3: ItemState = {
  ...stateB2,
  suffixes: [toRolledMod(wd)],
};
const eligibleB3 = getEligibleMods(stateB3, coldPool.getAllMods());
console.log(`  [State 3: + Widespread Destruction (3/3 Notables full)] Blocked: All remaining notables`);
console.log(`    Remaining Eligible Mods (Non-notable suffix fillers only): ${eligibleB3.length} mods (Total Weight: ${calculateTotalWeight(eligibleB3)})`);

const suffixFiller = eligibleB3[0];
const stateB4: ItemState = {
  ...stateB3,
  suffixes: [...stateB3.suffixes, toRolledMod(suffixFiller)],
};
const eligibleB4 = getEligibleMods(stateB4, coldPool.getAllMods());
console.log(`  [State 4: + Suffix Filler (${suffixFiller.name}) (Terminal Full 4-Mod Craft B: 2P/2S, 3 Notables)]`);
console.log(`    Remaining Eligible Mods: ${eligibleB4.length} (Item is full)`);

console.log('='.repeat(80));
