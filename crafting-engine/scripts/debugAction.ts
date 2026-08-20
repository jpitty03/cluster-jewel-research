import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import { toRolledMod } from '../src/domain/Mod.ts';
import { ExaltAction } from '../src/actions/exalt.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';
import type { SolverContext } from '../src/domain/CraftAction.ts';
import { getEligibleMods, calculateTotalWeight } from '../src/rules/modEligibility.ts';

const repo = new ClusterModRepository();
const shieldPool = ModPool.forCluster(
  repo,
  'Large Cluster Jewel',
  '12% increased Attack Damage while holding a Shield'
);
const priceBook = new PriceBook();
const context: SolverContext = { pool: shieldPool, priceBook };

const exalt = new ExaltAction();

const t1ES = shieldPool.findModById('AfflictionJewelSmallPassivesGrantES3')!;
const t1Int = shieldPool.findModById('AfflictionJewelSmallPassivesGrantInt3')!;
const eff35 = shieldPool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2')!;

// Reference Craft A fixture: T1 ES + fractured T1 Int
const fixtureState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while holding a Shield',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(t1ES)],
  suffixes: [toRolledMod(t1Int, { isFractured: true })],
  fracturedModIds: [t1Int.modId],
};

const eligible = getEligibleMods(fixtureState, shieldPool.getAllMods());
const totalWeight = calculateTotalWeight(eligible);
const outcomes = exalt.outcomes(fixtureState, context);

const targetOutcome = outcomes.find((o) =>
  o.state.prefixes.some((p) => p.modId === eff35.modId)
);

const targetProbability = targetOutcome ? (targetOutcome.probability * 100).toFixed(4) : '0.0000';

console.log('='.repeat(60));
console.log(`Action: ${exalt.name}`);
console.log(`Eligible mods: ${eligible.length}`);
console.log(`Total eligible weight: ${totalWeight}`);
console.log(`Target mod (35% Effect) probability: ${targetProbability}%`);
console.log('\nTop 10 outcomes:');
const topOutcomes = [...outcomes].sort((a, b) => b.probability - a.probability).slice(0, 10);
topOutcomes.forEach((o, i) => {
  console.log(`  ${i + 1}. ${(o.probability * 100).toFixed(3)}% - ${o.description}`);
});
console.log('='.repeat(60));
