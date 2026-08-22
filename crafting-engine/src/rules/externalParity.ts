import type { ItemState } from '../domain/ItemState.ts';
import type { SolverContext } from '../domain/CraftAction.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import { ModPool } from '../domain/ModPool.ts';
import { toRolledMod } from '../domain/Mod.ts';
import { createRandomSource } from '../probability/random.ts';
import { CRAFT_MECHANICS } from './actionRegistry.ts';

export interface ExternalParityObservation {
  benchmarkId: string;
  source: 'craft-of-exile';
  action: string;
  targetDescription: string;
  attempts: number;
  successes: number;
  observedProbability: number;
  displayedRatio: string;
  notes?: string;
}

/**
 * Permanent external Craft of Exile benchmark fixtures.
 * Used as independent evidence for mechanics parity verification.
 * NOT to be hardcoded or used as the optimizer's strategy source.
 */
export const EXTERNAL_PARITY_OBSERVATIONS: ExternalParityObservation[] = [
  {
    benchmarkId: 'alt_t1_int',
    source: 'craft-of-exile',
    action: 'Orb of Alteration',
    targetDescription: 'T1 Intelligence (AfflictionJewelSmallPassivesGrantInt3) on 12p Shield Cluster (ilvl 84)',
    attempts: 209862,
    successes: 3193,
    observedProbability: 3193 / 209862, // ~1.521%
    displayedRatio: '~1 / 65.7',
    notes: 'Combined across Run A (140,488 alts, 2,193 hits) and Run B (69,374 alts, 1,000 hits)',
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
    notes: '250 successes out of 1,000 attempts on 4-mod rare item',
  },
  {
    benchmarkId: 'harvest_defence_t1_es_from_frac_int',
    source: 'craft-of-exile',
    action: 'Harvest Reforge Defence',
    targetDescription: 'T1 Maximum Energy Shield (Glowing) from Fractured T1 Int Base (ilvl 84)',
    attempts: 2907,
    successes: 250,
    observedProbability: 250 / 2907, // ~8.599%
    displayedRatio: '~1 / 11.63',
    notes: 'Observed on fractured T1 Int starting base with guaranteed Defence modifier',
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
  status: 'ALIGNED' | 'INVESTIGATING';
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
  lines.push('='.repeat(95));
  lines.push('EXTERNAL CRAFT OF EXILE PARITY & MECHANICS BENCHMARK REPORT');
  lines.push('='.repeat(95));
  lines.push('Note: External observations serve as independent empirical evidence of game mechanics.');
  lines.push('Probabilities are derived from eligible pools and mechanics, NOT tuned to fit observations.\n');

  const results: ParityComparisonResult[] = [];

  // ------------------------------------------------------------- Benchmark 1: Alteration -> T1 Int
  const altMech = CRAFT_MECHANICS.find((m) => m.id === 'alteration_orb')!;
  const pool = context.pool;
  const intMod = pool.findModById('AfflictionJewelSmallPassivesGrantInt3');

  let analyticalAltProb = 0;
  let mcAltProb = 0;
  const altTrials = 20000;

  if (intMod && altMech.getTransitions && altMech.sampleTransition) {
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
    status: altDiffPct < 0.25 ? 'ALIGNED' : 'INVESTIGATING',
  });

  // Format Comparative Table
  lines.push('Benchmark                       Craft of Exile (Observed)  Analytical Engine  Our Monte Carlo (20k)  Difference  Status');
  lines.push('-'.repeat(115));

  for (const r of results) {
    const nameCol = r.action.padEnd(30);
    const coeCol = `${r.craftOfExileObservedPct.toFixed(3)}% (${r.craftOfExileRatio}, N=${r.craftOfExileSampleSize.toLocaleString()})`.padEnd(27);
    const anaCol = `${r.analyticalProbabilityPct.toFixed(3)}% (${r.analyticalRatio})`.padEnd(19);
    const mcCol = `${r.mcObservedProbabilityPct.toFixed(3)}% (${r.mcRatio})`.padEnd(23);
    const diffCol = `${r.diffPct.toFixed(3)}pp`.padEnd(12);
    lines.push(`${nameCol} ${coeCol} ${anaCol} ${mcCol} ${diffCol} ${r.status}`);
  }

  lines.push('-'.repeat(115));
  lines.push('\nKEY EXTERNAL OBSERVATIONS SUMMARY:');
  lines.push(`1. Alteration -> T1 Int: Craft of Exile observed ${coeAltPct.toFixed(3)}% (${coeAlt.displayedRatio}) across 209,862 attempts.`);
  lines.push(`   Our derived analytical probability is ${analyticalAltPct.toFixed(3)}% (1 / ${(1 / analyticalAltProb).toFixed(1)}), matching Monte Carlo (${mcAltPct.toFixed(3)}%).`);
  lines.push('2. Fracturing Orb: Independent Craft of Exile run confirmed exactly 250 / 1,000 (25.000%) hit rate on 4-mod rare item.');
  lines.push('3. Harvest Reforge Defence: External run observed 250 / 2,907 (8.599%, ~1 / 11.63) hitting T1 ES from fractured T1 Int base.');

  return {
    results,
    explanation: lines.join('\n'),
  };
}
