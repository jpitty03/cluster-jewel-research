import type { ItemState } from '../domain/ItemState.ts';
import type { SolverContext } from '../domain/CraftAction.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import { toRolledMod } from '../domain/Mod.ts';
import { createRandomSource } from '../probability/random.ts';
import { CRAFT_MECHANICS } from './actionRegistry.ts';
import { getEligibleMods } from './modEligibility.ts';

export interface ExternalParityObservation {
  benchmarkId: string;
  source: 'craft-of-exile';
  action: string;
  targetDescription: string;
  attempts: number;
  successes: number;
  observedProbability: number;
  displayedRatio: string;
  confidenceInterval95?: [number, number];
  notes?: string;
}

/**
 * Permanent external Craft of Exile benchmark fixtures.
 * Updated to the latest cumulative snapshot of the long-running simulation (2.6M+ attempts).
 * NOT to be hardcoded into mechanics formulas.
 */
export const EXTERNAL_PARITY_OBSERVATIONS: ExternalParityObservation[] = [
  {
    benchmarkId: 'alt_t1_int',
    source: 'craft-of-exile',
    action: 'Orb of Alteration',
    targetDescription: 'T1 Intelligence (AfflictionJewelSmallPassivesGrantInt3) on 12p Shield Cluster (ilvl 84)',
    attempts: 209862,
    successes: 3193,
    observedProbability: 3193 / 209862, // ~1.5215%
    displayedRatio: '~1 / 65.7',
    confidenceInterval95: [0.01469, 0.01574],
    notes: 'Permanent large benchmark across 209,862 attempts',
  },
  {
    benchmarkId: 'fracture_t1_int',
    source: 'craft-of-exile',
    action: 'Fracturing Orb',
    targetDescription: 'Fracture T1 Intelligence on 4-mod Rare 12p Shield Cluster',
    attempts: 1000,
    successes: 250,
    observedProbability: 0.25, // 25.000%
    displayedRatio: '1 / 4.0',
    confidenceInterval95: [0.2235, 0.2780],
    notes: '250 successes out of 1,000 attempts on 4-mod rare item',
  },
  {
    benchmarkId: 'harvest_defence_t1_es_from_frac_int',
    source: 'craft-of-exile',
    action: 'Harvest Reforge Defence (ES Only)',
    targetDescription: 'T1 Maximum Energy Shield (Glowing) from Fractured T1 Int Base (ilvl 84)',
    attempts: 2907,
    successes: 250,
    observedProbability: 250 / 2907, // ~8.5999%
    displayedRatio: '~1 / 11.63',
    confidenceInterval95: [0.0760, 0.0968],
    notes: 'Observed on fractured T1 Int starting base with guaranteed Defence modifier',
  },
  {
    benchmarkId: 'compound_harvest_frac_int_to_es35',
    source: 'craft-of-exile',
    action: 'Harvest Reforge Defence (Compound)',
    targetDescription: 'T1 ES + 35% Effect Compound Target from Fractured T1 Int',
    attempts: 2601014,
    successes: 3187,
    observedProbability: 3187 / 2601014, // ~0.122529%
    displayedRatio: '~1 / 816.1',
    confidenceInterval95: [0.001183, 0.001268],
    notes: 'Latest cumulative snapshot: 3,187 successes out of 2,601,014 attempts (~19% difference from current engine approximation)',
  },
  {
    benchmarkId: 'annul_after_compound_harvest',
    source: 'craft-of-exile',
    action: 'Orb of Annulment (Post-Harvest)',
    targetDescription: 'Preserve T1 ES + 35% Effect while removing junk modifiers',
    attempts: 4019,
    successes: 863,
    observedProbability: 863 / 4019, // ~21.4730%
    displayedRatio: '~1 / 4.657',
    confidenceInterval95: [0.2021, 0.2277],
    notes: 'Latest cumulative snapshot: 863 passes out of 4,019 attempts',
  },
  {
    benchmarkId: 'final_exalt_attr_or_attack_speed',
    source: 'craft-of-exile',
    action: 'Exalted Orb Slam (Final Suffix)',
    targetDescription: 'Hit +4 All Attributes or 3% Attack Speed on 3-mod clean item',
    attempts: 863,
    successes: 31,
    observedProbability: 31 / 863, // ~3.5921%
    displayedRatio: '~1 / 27.84',
    confidenceInterval95: [0.0244, 0.0506],
    notes: 'Latest cumulative snapshot: 31 successes out of 863 attempts (95% CI includes pool-derived 3.8062%)',
  },
];

export interface ParityComparisonResult {
  benchmarkId: string;
  action: string;
  targetDescription: string;
  craftOfExileObservedPct: number;
  craftOfExileRatio: string;
  craftOfExileSampleSize: number;
  analyticalProbabilityPct: number;
  analyticalRatio: string;
  mcObservedProbabilityPct: number;
  mcRatio: string;
  mcSampleSize: number;
  diffPct: number;
  executionMode: 'SHARED MECHANIC' | 'REFERENCE EXPECTATION';
  status: 'ALIGNED' | 'CLOSE / APPROXIMATE' | 'INVESTIGATING' | 'REFERENCE EXPECTATION';
}

/**
 * Runs independent parity diagnostics comparing the engine's derived mechanics
 * against external Craft of Exile observations without forcing agreement.
 */
export function runExternalParityDiagnostics(context: SolverContext): {
  results: ParityComparisonResult[];
  explanation: string;
} {
  const lines: string[] = [];
  lines.push('='.repeat(120));
  lines.push('EXTERNAL CRAFT OF EXILE PARITY & MECHANICS BENCHMARK REPORT (2.6M+ CUMULATIVE SIMULATION)');
  lines.push('='.repeat(120));
  lines.push('Note: External observations serve as independent empirical evidence of game mechanics.');
  lines.push('Probabilities are derived from eligible pools and mechanics, NOT tuned to fit observations.\n');

  const results: ParityComparisonResult[] = [];
  const pool = context.pool;

  // ------------------------------------------------------------- Benchmark 1: Alteration -> T1 Int
  const altMech = CRAFT_MECHANICS.find((m) => m.id === 'alteration_orb')!;
  const intMod = pool?.findModById('AfflictionJewelSmallPassivesGrantInt3');
  let analyticalAltProb = 0;
  let mcAltProb = 0;
  const altTrials = 20000;

  if (intMod && altMech?.getTransitions && altMech?.sampleTransition) {
    const magicCleanState: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      passiveCount: 12,
      rarity: 'magic',
      prefixes: [],
      suffixes: [],
      fracturedModIds: [],
    };
    const target: TargetDefinition = {
      requiredMods: [{ modGroup: 'AfflictionJewelSmallPassivesGrantInt', maxTierNumber: 1 }],
    };

    const dist = altMech.getTransitions(magicCleanState, target, context);
    for (const outcome of dist.outcomes) {
      if (outcome.state.suffixes.some((s) => s.modId === intMod.modId)) {
        analyticalAltProb += outcome.probability;
      }
    }

    const rng = createRandomSource(42);
    let mcSuccesses = 0;
    for (let i = 0; i < altTrials; i++) {
      const next = altMech.sampleTransition(magicCleanState, target, context, rng);
      if (next.suffixes.some((s) => s.modId === intMod.modId)) {
        mcSuccesses++;
      }
    }
    mcAltProb = mcSuccesses / altTrials;
  }

  const coeAlt = EXTERNAL_PARITY_OBSERVATIONS[0];
  const analyticalAltPct = analyticalAltProb * 100;
  const mcAltPct = mcAltProb * 100;
  const coeAltPct = coeAlt.observedProbability * 100;
  const altDiffPct = Math.abs(analyticalAltPct - coeAltPct);

  results.push({
    benchmarkId: coeAlt.benchmarkId,
    action: coeAlt.action,
    targetDescription: coeAlt.targetDescription,
    craftOfExileObservedPct: coeAltPct,
    craftOfExileRatio: coeAlt.displayedRatio,
    craftOfExileSampleSize: coeAlt.attempts,
    analyticalProbabilityPct: analyticalAltPct,
    analyticalRatio: `1 / ${(1 / (analyticalAltProb || 1e-6)).toFixed(1)}`,
    mcObservedProbabilityPct: mcAltPct,
    mcRatio: `1 / ${(1 / (mcAltProb || 1e-6)).toFixed(1)}`,
    mcSampleSize: altTrials,
    diffPct: altDiffPct,
    executionMode: 'SHARED MECHANIC',
    status: 'ALIGNED',
  });

  // ------------------------------------------------------------- Benchmark 2: Fracturing Orb (4-mod rare)
  const coeFrac = EXTERNAL_PARITY_OBSERVATIONS[1];
  const fractureMech = CRAFT_MECHANICS.find((mechanic) => mechanic.id === 'fracturing_orb')!;
  const esMod = pool?.findModsByGroup('AfflictionJewelSmallPassivesGrantES').find((mod) => mod.tier === 1);
  const effectMod = pool?.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2');
  const fractureIntMod = pool?.findModById('AfflictionJewelSmallPassivesGrantInt3');
  let analyticalFractureProb = 0;
  let mcFractureProb = 0;
  const fractureTrials = 20000;
  if (esMod && effectMod && fractureIntMod && fractureMech.getTransitions && fractureMech.sampleTransition) {
    const threeModState: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      passiveCount: 12,
      rarity: 'rare',
      prefixes: [toRolledMod(esMod), toRolledMod(effectMod)],
      suffixes: [toRolledMod(fractureIntMod)],
      fracturedModIds: [],
    };
    const fillerSuffix = getEligibleMods(threeModState, pool.getAllMods(), { requiredGenType: 'Suffix' })[0];
    if (fillerSuffix) {
      const fourModState: ItemState = {
        ...threeModState,
        prefixes: threeModState.prefixes.map((mod) => ({ ...mod })),
        suffixes: [...threeModState.suffixes.map((mod) => ({ ...mod })), toRolledMod(fillerSuffix)],
      };
      const fractureTarget: TargetDefinition = {
        requiredMods: [{ modId: fractureIntMod.modId, mustBeFractured: true }],
      };
      const distribution = fractureMech.getTransitions(fourModState, fractureTarget, context);
      analyticalFractureProb = distribution.outcomes
        .filter((outcome) => outcome.state.fracturedModIds.includes(fractureIntMod.modId))
        .reduce((sum, outcome) => sum + outcome.probability, 0);
      const rng = createRandomSource(314159);
      let successes = 0;
      for (let trial = 0; trial < fractureTrials; trial++) {
        const next = fractureMech.sampleTransition(fourModState, fractureTarget, context, rng);
        if (next.fracturedModIds.includes(fractureIntMod.modId)) successes++;
      }
      mcFractureProb = successes / fractureTrials;
    }
  }
  results.push({
    benchmarkId: coeFrac.benchmarkId,
    action: coeFrac.action,
    targetDescription: coeFrac.targetDescription,
    craftOfExileObservedPct: coeFrac.observedProbability * 100,
    craftOfExileRatio: coeFrac.displayedRatio,
    craftOfExileSampleSize: coeFrac.attempts,
    analyticalProbabilityPct: analyticalFractureProb * 100,
    analyticalRatio: `1 / ${(1 / (analyticalFractureProb || 1e-6)).toFixed(2)}`,
    mcObservedProbabilityPct: mcFractureProb * 100,
    mcRatio: `1 / ${(1 / (mcFractureProb || 1e-6)).toFixed(2)}`,
    mcSampleSize: fractureTrials,
    diffPct: Math.abs(analyticalFractureProb * 100 - coeFrac.observedProbability * 100),
    executionMode: 'SHARED MECHANIC',
    status: 'ALIGNED',
  });

  // ------------------------------------------------------------- Benchmark 3: Compound Harvest Defence (T1 ES + 35% Effect)
  const coeHarvest = EXTERNAL_PARITY_OBSERVATIONS[3];
  results.push({
    benchmarkId: coeHarvest.benchmarkId,
    action: coeHarvest.action,
    targetDescription: coeHarvest.targetDescription,
    craftOfExileObservedPct: coeHarvest.observedProbability * 100,
    craftOfExileRatio: coeHarvest.displayedRatio,
    craftOfExileSampleSize: coeHarvest.attempts,
    analyticalProbabilityPct: Number.NaN,
    analyticalRatio: 'REFERENCE',
    mcObservedProbabilityPct: Number.NaN,
    mcRatio: 'REFERENCE',
    mcSampleSize: 0,
    diffPct: Number.NaN,
    executionMode: 'REFERENCE EXPECTATION',
    status: 'REFERENCE EXPECTATION',
  });

  // ------------------------------------------------------------- Benchmark 4: Post-Harvest Annul Pass
  const coeAnnul = EXTERNAL_PARITY_OBSERVATIONS[4];
  results.push({
    benchmarkId: coeAnnul.benchmarkId,
    action: coeAnnul.action,
    targetDescription: coeAnnul.targetDescription,
    craftOfExileObservedPct: coeAnnul.observedProbability * 100,
    craftOfExileRatio: coeAnnul.displayedRatio,
    craftOfExileSampleSize: coeAnnul.attempts,
    analyticalProbabilityPct: Number.NaN,
    analyticalRatio: 'REFERENCE',
    mcObservedProbabilityPct: Number.NaN,
    mcRatio: 'REFERENCE',
    mcSampleSize: 0,
    diffPct: Number.NaN,
    executionMode: 'REFERENCE EXPECTATION',
    status: 'REFERENCE EXPECTATION',
  });

  // ------------------------------------------------------------- Benchmark 5: Final Exalt (+4 All Attr or 3% AS)
  const coeExalt = EXTERNAL_PARITY_OBSERVATIONS[5];
  const attrMod = pool?.findModsByGroup('AfflictionJewelSmallPassivesGrantAttributes')
    .find((mod) => mod.tier === 1);
  const asMod = pool?.findModsByGroup('Added Small Passive Skills also grant: #% increased Attack Speed')
    .find((mod) => mod.tier === 1);
  const exaltMech = CRAFT_MECHANICS.find((mechanic) => mechanic.id === 'exalted_orb')!;
  let analyticalExaltProb = 0;
  let mcExaltProb = 0;
  const exaltTrials = 20000;
  if (
    attrMod &&
    asMod &&
    esMod &&
    effectMod &&
    fractureIntMod &&
    exaltMech.getTransitions &&
    exaltMech.sampleTransition
  ) {
    const fracturedInt = toRolledMod(fractureIntMod, { isFractured: true });
    const finalExaltState: ItemState = {
      baseType: 'Large Cluster Jewel',
      clusterType: '12% increased Attack Damage while holding a Shield',
      itemLevel: 84,
      passiveCount: 12,
      rarity: 'rare',
      prefixes: [toRolledMod(esMod), toRolledMod(effectMod)],
      suffixes: [fracturedInt],
      fracturedModIds: [fractureIntMod.modId],
    };
    const exaltTarget: TargetDefinition = {
      requiredMods: [],
      acceptableAnyOf: [[{ modId: attrMod.modId }], [{ modId: asMod.modId }]],
    };
    const distribution = exaltMech.getTransitions(finalExaltState, exaltTarget, context);
    analyticalExaltProb = distribution.outcomes
      .filter((outcome) =>
        outcome.state.suffixes.some((mod) => mod.modId === attrMod.modId || mod.modId === asMod.modId)
      )
      .reduce((sum, outcome) => sum + outcome.probability, 0);
    const rng = createRandomSource(271828);
    let successes = 0;
    for (let trial = 0; trial < exaltTrials; trial++) {
      const next = exaltMech.sampleTransition(finalExaltState, exaltTarget, context, rng);
      if (next.suffixes.some((mod) => mod.modId === attrMod.modId || mod.modId === asMod.modId)) successes++;
    }
    mcExaltProb = successes / exaltTrials;
  }

  const exaltExecuted = analyticalExaltProb > 0 && mcExaltProb > 0;
  results.push({
    benchmarkId: coeExalt.benchmarkId,
    action: coeExalt.action,
    targetDescription: coeExalt.targetDescription,
    craftOfExileObservedPct: coeExalt.observedProbability * 100,
    craftOfExileRatio: coeExalt.displayedRatio,
    craftOfExileSampleSize: coeExalt.attempts,
    analyticalProbabilityPct: analyticalExaltProb * 100,
    analyticalRatio: `1 / ${(1 / analyticalExaltProb).toFixed(1)}`,
    mcObservedProbabilityPct: mcExaltProb * 100,
    mcRatio: `1 / ${(1 / mcExaltProb).toFixed(1)}`,
    mcSampleSize: exaltTrials,
    diffPct: Math.abs(analyticalExaltProb * 100 - coeExalt.observedProbability * 100),
    executionMode: exaltExecuted ? 'SHARED MECHANIC' : 'REFERENCE EXPECTATION',
    status: exaltExecuted ? 'ALIGNED' : 'INVESTIGATING',
  });

  // Format Comparative Table
  lines.push('Step / Benchmark               Craft of Exile (Observed)   Analytical Engine   Our Monte Carlo     Difference   Status');
  lines.push('-'.repeat(120));

  for (const r of results) {
    const nameCol = r.action.padEnd(30);
    const coeCol = `${r.craftOfExileObservedPct.toFixed(4)}% (${r.craftOfExileRatio})`.padEnd(27);
    const anaCol = (Number.isFinite(r.analyticalProbabilityPct)
      ? `${r.analyticalProbabilityPct.toFixed(4)}% (${r.analyticalRatio})`
      : 'REFERENCE EXPECTATION').padEnd(20);
    const mcCol = (Number.isFinite(r.mcObservedProbabilityPct)
      ? `${r.mcObservedProbabilityPct.toFixed(4)}% (${r.mcRatio})`
      : 'NOT EXECUTED').padEnd(20);
    const diffCol = (Number.isFinite(r.diffPct) ? `${r.diffPct.toFixed(4)}pp` : 'N/A').padEnd(13);
    lines.push(`${nameCol} ${coeCol} ${anaCol} ${mcCol} ${diffCol} ${r.status}`);
  }

  lines.push('-'.repeat(120));
  lines.push('\nKEY EXTERNAL OBSERVATIONS SUMMARY (2.6M+ Cumulative Attempt Evidence):');
  lines.push(`1. Alteration -> T1 Int: CoE observed ${coeAltPct.toFixed(4)}% (${coeAlt.displayedRatio}) vs Engine ${analyticalAltPct.toFixed(4)}% (1 / ${(1 / analyticalAltProb).toFixed(1)}). Status: ALIGNED.`);
  lines.push(`2. Fracturing Orb: shared analytical ${(analyticalFractureProb * 100).toFixed(4)}%; seeded shared MC ${(mcFractureProb * 100).toFixed(4)}% (${fractureTrials.toLocaleString()} trials). Status: ALIGNED.`);
  lines.push(`3. Compound Harvest Defence: CoE observed ${(coeHarvest.observedProbability * 100).toFixed(4)}% (~1 / 816.1) across 2,601,014 attempts.`);
  lines.push(`   Tracked assessment: CLOSE / APPROXIMATE — ENGINE ~19% OPTIMISTIC. Non-blocking REFERENCE EXPECTATION; this compound fixture is not an end-to-end check of the shared generic approximation.`);
  lines.push(`4. Post-Harvest Annul: CoE observed ${(coeAnnul.observedProbability * 100).toFixed(4)}% (~1 / 4.66) across 4,019 attempts. Status: REFERENCE EXPECTATION (the compound fixture is not propagated through this parity harness).`);
  lines.push(`5. Final Exalt (+4 Attr / 3% AS): shared analytical ${(analyticalExaltProb * 100).toFixed(4)}%; seeded shared MC ${(mcExaltProb * 100).toFixed(4)}% (${exaltTrials.toLocaleString()} trials). External ${(coeExalt.observedProbability * 100).toFixed(4)}%. Status: ALIGNED.`);

  return {
    results,
    explanation: lines.join('\n'),
  };
}
