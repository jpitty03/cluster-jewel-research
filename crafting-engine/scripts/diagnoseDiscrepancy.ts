import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { toRolledMod } from '../src/domain/Mod.ts';
import { getEligibleMods, calculateTotalWeight } from '../src/rules/modEligibility.ts';
import { canAcceptPrefix, canAcceptSuffix } from '../src/rules/affixRules.ts';
import { getRemovableAffixes } from '../src/domain/ItemState.ts';
import { satisfiesTarget, getMatchingOutcomeBranch, type TargetDefinition } from '../src/domain/TargetDefinition.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import type { Mod } from '../src/domain/Mod.ts';

const repo = new ClusterModRepository();
const pool = ModPool.forCluster(
  repo,
  'Large Cluster Jewel',
  '12% increased Attack Damage while holding a Shield'
);
const allMods = pool.getAllMods();
const t1Int = pool.findModById('AfflictionJewelSmallPassivesGrantInt3')!;

const target: TargetDefinition = {
  requiredMods: [
    { modGroup: 'AfflictionJewelSmallPassivesGrantES', maxTierNumber: 1 },
    { modGroup: 'AfflictionJewelSmallPassivesHaveIncreasedEffect', maxTierNumber: 1 },
    { modGroup: 'AfflictionJewelSmallPassivesGrantInt', maxTierNumber: 1 },
  ],
  outcomeBranches: [
    {
      name: '+4 All Attributes (T1)',
      requiredMods: [{ modGroup: 'AfflictionJewelSmallPassivesGrantAttributes', maxTierNumber: 1 }],
      saleValueChaos: 17000,
    },
    {
      name: '3% Attack Speed (T1)',
      requiredMods: [{ modGroup: 'Added Small Passive Skills also grant: #% increased Attack Speed', maxTierNumber: 1 }],
      saleValueChaos: 7800,
    },
    {
      name: '+4% All Elemental Resistance (T1)',
      requiredMods: [{ modGroup: 'AfflictionJewelSmallPassivesGrantElementalRes', maxTierNumber: 1 }],
      saleValueChaos: 1400,
    },
  ],
  finalRollRequirements: [{ modGroup: 'AfflictionJewelSmallPassivesGrantInt', minValue: 8 }],
};

function matchesTarget(m: Mod | { modId: string; modGroup: string; tier: number; name: string }): boolean {
  const matchesMain = target.requiredMods.some((req) =>
    (req.modGroup ? m.modGroup === req.modGroup : true) &&
    (req.modId ? m.modId === req.modId : true) &&
    (req.name ? m.name === req.name : true) &&
    (req.maxTierNumber !== undefined ? m.tier <= req.maxTierNumber : true)
  );
  if (matchesMain) return true;

  if (target.outcomeBranches) {
    return target.outcomeBranches.some((b) =>
      b.requiredMods.some((req) =>
        (req.modGroup ? m.modGroup === req.modGroup : true) &&
        (req.modId ? m.modId === req.modId : true) &&
        (req.name ? m.name === req.name : true) &&
        (req.maxTierNumber !== undefined ? m.tier <= req.maxTierNumber : true)
      )
    );
  }
  return false;
}

// Full Defence pool matching Shield Large Cluster (total weight ~4200)
const defenceMods = allMods.filter((m) =>
  (m.craftTags.includes('defences') ||
    m.tags.includes('defences') ||
    m.modGroup.includes('ES') ||
    m.modGroup.includes('Armour') ||
    m.modGroup.includes('Shield') ||
    m.modGroup.includes('Block')) &&
  m.ilvl <= 84
);

function sample(mods: Mod[]): Mod {
  const total = calculateTotalWeight(mods);
  const r = Math.random() * total;
  let acc = 0;
  for (const m of mods) {
    acc += m.weight;
    if (r <= acc) return m;
  }
  return mods[0];
}

console.log('='.repeat(80));
console.log('HARVEST SUCCESS STATE CENSUS & MONTE CARLO TRACE');
console.log('='.repeat(80));

// Census of Harvest T1 ES outcomes
let totalHarvests = 0;
let t1ESSuccesses = 0;
const census = {
  t1ESOnly: 0,
  t1ESPlus35Eff: 0,
  t1ESPlusPremiumSuffix: 0,
  t1ESPlus35AndPremium: 0,
  t1ESPlusJunkOnly: 0,
};

for (let i = 0; i < 50000; i++) {
  totalHarvests++;
  const chosen = sample(defenceMods);
  const isT1ES = chosen.modGroup === 'AfflictionJewelSmallPassivesGrantES' && chosen.tier === 1;
  if (!isT1ES) continue;

  t1ESSuccesses++;
  const testState: ItemState = {
    baseType: 'Large Cluster Jewel',
    clusterType: '12% increased Attack Damage while holding a Shield',
    itemLevel: 84,
    passiveCount: 12,
    rarity: 'rare',
    prefixes: [toRolledMod(chosen)],
    suffixes: [toRolledMod(t1Int, { isFractured: true, currentRoll: [8] })],
    fracturedModIds: [t1Int.modId],
  };

  const extraCount = Math.random() < 0.5 ? 1 : 2;
  const extraMods: Mod[] = [];
  for (let e = 0; e < extraCount; e++) {
    const el = getEligibleMods(testState, allMods);
    const ex = sample(el);
    if (ex) {
      extraMods.push(ex);
      if (ex.genType === 'Prefix' && canAcceptPrefix(testState)) testState.prefixes.push(toRolledMod(ex));
      else if (ex.genType === 'Suffix' && canAcceptSuffix(testState)) testState.suffixes.push(toRolledMod(ex));
    }
  }

  const has35 = extraMods.some((m) => m.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && m.tier === 1);
  const hasSuffix = extraMods.some((m) =>
    target.outcomeBranches!.some((b) =>
      b.requiredMods.some((req) => (req.modGroup ? m.modGroup === req.modGroup : true) && (req.maxTierNumber ? m.tier <= req.maxTierNumber : true))
    )
  );

  if (extraMods.length === 0) census.t1ESOnly++;
  else if (has35 && hasSuffix) census.t1ESPlus35AndPremium++;
  else if (has35) census.t1ESPlus35Eff++;
  else if (hasSuffix) census.t1ESPlusPremiumSuffix++;
  else census.t1ESPlusJunkOnly++;
}

console.log(`Total Harvests: ${totalHarvests}`);
console.log(`T1 ES Hits: ${t1ESSuccesses} (${((t1ESSuccesses / totalHarvests) * 100).toFixed(2)}%)`);
console.log('HARVEST SUCCESS STATE CENSUS (Given T1 ES):');
console.log(`  T1 ES + 35% Effect:          ${((census.t1ESPlus35Eff / t1ESSuccesses) * 100).toFixed(2)}%`);
console.log(`  T1 ES + Premium Suffix:      ${((census.t1ESPlusPremiumSuffix / t1ESSuccesses) * 100).toFixed(2)}%`);
console.log(`  T1 ES + 35% + Premium:       ${((census.t1ESPlus35AndPremium / t1ESSuccesses) * 100).toFixed(2)}%`);
console.log(`  T1 ES + Junk-Only Extras:    ${((census.t1ESPlusJunkOnly / t1ESSuccesses) * 100).toFixed(2)}%`);

// Trace 3 complete crafts
console.log('\n' + '='.repeat(80));
console.log('TRACE OF 3 COMPLETE CRAFTS');
console.log('='.repeat(80));

for (let trial = 1; trial <= 3; trial++) {
  console.log(`\n>>> TRIAL ${trial}`);
  const state: ItemState = {
    baseType: 'Large Cluster Jewel',
    clusterType: '12% increased Attack Damage while holding a Shield',
    itemLevel: 84,
    passiveCount: 12,
    rarity: 'rare',
    prefixes: [],
    suffixes: [toRolledMod(t1Int, { isFractured: true, currentRoll: [8] })],
    fracturedModIds: [t1Int.modId],
  };

  let step = 0;
  let harvestCount = 0;
  let annulCount = 0;
  let exaltCount = 0;

  while (step < 100) {
    step++;
    if (satisfiesTarget(state, target) || getMatchingOutcomeBranch(state, target)) {
      console.log(`[Step ${step}] TARGET SATISFIED!`);
      console.log(`  Final Prefixes:`, state.prefixes.map((p) => `${p.name} (t${p.tier})`));
      console.log(`  Final Suffixes:`, state.suffixes.map((s) => `${s.name} (t${s.tier})`));
      console.log(`  Usage: Harvests=${harvestCount}, Annuls=${annulCount}, Exalts=${exaltCount}`);
      break;
    }

    const hasT1ES = state.prefixes.some((p) => p.modGroup === 'AfflictionJewelSmallPassivesGrantES' && p.tier === 1);
    if (!hasT1ES) {
      harvestCount++;
      state.prefixes = state.prefixes.filter((m) => m.isFractured);
      state.suffixes = state.suffixes.filter((m) => m.isFractured);
      const chosen = sample(defenceMods);
      if (chosen) state.prefixes.push(toRolledMod(chosen));
      const extraCount = Math.random() < 0.5 ? 1 : 2;
      for (let e = 0; e < extraCount; e++) {
        const el = getEligibleMods(state, allMods);
        const ex = sample(el);
        if (ex) {
          if (ex.genType === 'Prefix' && canAcceptPrefix(state)) state.prefixes.push(toRolledMod(ex));
          else if (ex.genType === 'Suffix' && canAcceptSuffix(state)) state.suffixes.push(toRolledMod(ex));
        }
      }
      const isES = chosen?.modGroup === 'AfflictionJewelSmallPassivesGrantES' && chosen?.tier === 1;
      if (isES) {
        console.log(`[Step ${step}] Harvest hit T1 ES! State: P=[${state.prefixes.map((p) => p.name).join(', ')}], S=[${state.suffixes.map((s) => s.name).join(', ')}]`);
      }
      continue;
    }

    const removable = getRemovableAffixes(state);
    const junk = removable.filter((m) => !matchesTarget(m));
    if (junk.length > 0) {
      annulCount++;
      const idx = Math.floor(Math.random() * removable.length);
      const removed = removable[idx];
      if (removed.genType === 'Prefix') {
        state.prefixes = state.prefixes.filter((p) => p.modId !== removed.modId || p.isFractured);
      } else {
        state.suffixes = state.suffixes.filter((s) => s.modId !== removed.modId || s.isFractured);
      }
      console.log(`[Step ${step}] Annul removed "${removed.name}" (${removed.genType}) -> Removable left: ${removable.length - 1}`);
      continue;
    }

    const has35Eff = state.prefixes.some((p) => p.modGroup === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' && p.tier === 1);
    if (!has35Eff && canAcceptPrefix(state)) {
      exaltCount++;
      const el = getEligibleMods(state, allMods, { requiredGenType: 'Prefix' });
      const cands = [sample(el), sample(el), sample(el), sample(el)];
      const chosen = cands.find((c) => c.modGroup.includes('IncreasedEffect') && c.tier === 1) || cands[0];
      state.prefixes.push(toRolledMod(chosen));
      console.log(`[Step ${step}] Allflame Exalt Prefix slammed "${chosen.name}" (${chosen.modGroup}, t${chosen.tier})`);
      continue;
    }

    if (canAcceptSuffix(state)) {
      exaltCount++;
      const el = getEligibleMods(state, allMods, { requiredGenType: 'Suffix' });
      const cands = [sample(el), sample(el), sample(el), sample(el)];
      const chosen = cands.find((c) => matchesTarget(c)) || cands[0];
      state.suffixes.push(toRolledMod(chosen));
      console.log(`[Step ${step}] Allflame Exalt Suffix slammed "${chosen.name}" (${chosen.modGroup}, t${chosen.tier})`);
      continue;
    }

    break;
  }
}
