import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import { runExternalParityDiagnostics } from '../src/rules/externalParity.ts';
import {
  synthesizeAcquisition,
  type AcquisitionSynthesisResult,
} from '../src/solver/acquisitionSynthesis.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
  type OptimizeCraftResult,
} from '../src/service/optimizerService.ts';

const repo = new ClusterModRepository();
const service = new OptimizerService(repo);
const clusterType = '12% increased Attack Damage while holding a Shield';
const pool = ModPool.forCluster(repo, 'Large Cluster Jewel', clusterType);
const priceBook = new PriceBook();
const outputPath = fileURLToPath(new URL('../../output-acquisition-synthesis-phase2d.txt', import.meta.url));
const t1IntId = 'AfflictionJewelSmallPassivesGrantInt3';
const t1EsId = 'AfflictionJewelSmallPassivesGrantES3';
const t1AttributesId = 'AfflictionJewelSmallPassivesGrantAttributes3';

const cleanBase: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType,
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'normal',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};

function money(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'UNAVAILABLE'
    : `${value.toFixed(6)}c`;
}

function pct(value: number): string {
  return `${(value * 100).toFixed(9)}%`;
}

function optimizerLines(label: string, result: OptimizeCraftResult, elapsedMs: number): string[] {
  const fractureCandidates = result.acquisition.candidates.filter(
    (candidate) => candidate.synthesis !== undefined
  );
  return [
    `${label}:`,
    `  recommendation: ${result.recommendationStatus}`,
    `  winner: ${result.recommended?.name ?? 'NONE'}`,
    `  expected total: ${money(result.expectedCostChaos)}`,
    `  acquisition safe: ${result.acquisition.selectionSafe ? 'YES' : 'NO'}`,
    `  proper / absorption / reconciled: ${result.risk.selectedPolicyProper ? 'YES' : 'NO'} / ${pct(result.risk.terminalAbsorptionProbability)} / ${result.solver.costReconciled ? 'YES' : 'NO'}`,
    `  runtime: ${elapsedMs}ms; staged engine=${result.search.totalElapsedMs}ms; downstream=${result.search.elapsedMs}ms`,
    `  downstream states / cumulative work / repeated: ${result.search.statesExpanded} / ${result.search.cumulativeExpansionWork} / ${result.search.repeatedStatesExpanded}`,
    `  downstream expansion mode / rounds: ${result.search.expansionMode} / ${result.search.expansionRounds}`,
    `  synthesis stage: ${result.acquisition.stage.mode}; candidates=${result.acquisition.stage.candidateCount}; attempted=${result.acquisition.stage.attemptedCandidates}; certified=${result.acquisition.stage.certifiedCandidates}; cache hits=${result.acquisition.stage.cacheHits}`,
    `  synthesis shared budget: states=${result.acquisition.stage.totalStateBudget}; wall=${result.acquisition.stage.totalWallTimeBudgetMs}ms; rounds/candidate=${result.acquisition.stage.maxExpansionRoundsPerCandidate}`,
    ...fractureCandidates.map((candidate) => {
      const synthesis = candidate.synthesis!;
      return `  fracture ${candidate.label}: status=${synthesis.status}; U=${money(synthesis.expectedCostChaos)}; L=${money(synthesis.lowerBoundChaos)}; orbs=${synthesis.expectedFracturingOrbs?.toFixed(6) ?? 'N/A'}; restarts=${synthesis.expectedRestarts?.toFixed(6) ?? 'N/A'}; proper=${synthesis.risk?.selectedPolicyProper ?? 'N/A'}; global=${synthesis.proof?.globalOptimality ?? 'N/A'}; ranked executable method=${candidate.methods.some((method) => method.executable) ? 'YES' : 'NO'}`;
    }),
    `  fractured market methods present: ${result.acquisition.candidates.some((candidate) => candidate.methods.some((method) => method.id.startsWith('market'))) ? 'YES' : 'NO'}`,
  ];
}

function runOptimizer(label: string, input: OptimizeCraftInput): { result: OptimizeCraftResult; elapsedMs: number } {
  console.error(`[phase2d] ${label}`);
  const started = Date.now();
  const result = service.optimize(input);
  return { result, elapsedMs: Date.now() - started };
}

const baseInput: Omit<OptimizeCraftInput, 'target'> = {
  baseType: 'Large Cluster Jewel',
  clusterType,
  itemLevel: 84,
  passiveCount: 12,
  prices: {
    cleanBaseCostChaos: 4,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 2D controlled clean-base fixture',
  },
  allowResearchFallbackPrices: true,
  searchBudget: { maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
  searchIntent: 'RECOMMEND',
};

console.error('[phase2d] Diagnostic A/B/F standalone certified self-fracture');
const standaloneStarted = Date.now();
const standalone = synthesizeAcquisition(
  { pool, priceBook },
  {
    cleanStartingState: cleanBase,
    desiredPhysicalState: { fracturedMod: { modId: t1IntId } },
    cleanBaseAcquisition: {
      costChaos: 10,
      confidence: 'research-fallback',
      provenance: 'Phase 2D fixed standalone clean-base fixture',
    },
    searchBudget: { maxStates: 5_001, maxWallTimeMs: 30_000, maxExpansionRounds: 3 },
    searchIntent: 'RECOMMEND',
  }
);
const standaloneElapsedMs = Date.now() - standaloneStarted;

const t1Int = pool.findModById(t1IntId);
if (!t1Int) throw new Error('Missing T1 Intelligence diagnostic modifier');
const sameGenerationMods = pool.getAllMods().filter(
  (mod) => mod.genType === t1Int.genType && mod.ilvl <= cleanBase.itemLevel
);
const totalGenerationWeight = sameGenerationMods.reduce((sum, mod) => sum + mod.weight, 0);
const legacyExpectedAlterations = totalGenerationWeight / t1Int.weight;
const legacyPreparationPerAttempt = legacyExpectedAlterations * 0.11 + 10;
const legacyApproximateReference = 4 * (
  10 + legacyPreparationPerAttempt + priceBook.getRate('fracturing')
);

const oneMod = runOptimizer('R1 one-mod T1 ES', {
  ...baseInput,
  target: { requiredMods: [{ modId: t1EsId }] },
});
const twoModAny = runOptimizer('R2 two-mod Any', {
  ...baseInput,
  target: { requiredMods: [{ modId: t1EsId }, { modId: t1IntId }] },
});
const twoModClean = runOptimizer('R3 two-mod no-unwanted', {
  ...baseInput,
  target: {
    requiredMods: [{ modId: t1EsId }, { modId: t1IntId }],
    finalStateConstraints: { maxUnmatchedAffixes: 0 },
  },
});

const multiFracture = runOptimizer('Diagnostic C two-certifiable-fracture portfolio', {
  ...baseInput,
  target: {
    requiredMods: [{ modId: t1IntId }, { modId: t1AttributesId }],
    requiredRarity: 'rare',
  },
  searchBudget: {
    maxStates: 5_000,
    maxWallTimeMs: 120_000,
    maxExpansionRounds: 3,
    acquisitionMaxStates: 10_002,
    acquisitionMaxWallTimeMs: 50_000,
    acquisitionMaxExpansionRounds: 3,
  },
});

const forcedRareTwoMod = runOptimizer('R4 forced-Rare T1 ES + T1 Intelligence', {
  ...baseInput,
  target: {
    requiredMods: [{ modId: t1EsId }, { modId: t1IntId }],
    requiredRarity: 'rare',
  },
  searchBudget: {
    maxStates: 5_000,
    maxWallTimeMs: 120_000,
    maxExpansionRounds: 3,
    acquisitionMaxStates: 10_002,
    acquisitionMaxWallTimeMs: 50_000,
    acquisitionMaxExpansionRounds: 3,
  },
});
const forcedRareCleanRoute = [
  ...(forcedRareTwoMod.result.recommended ? [forcedRareTwoMod.result.recommended] : []),
  ...forcedRareTwoMod.result.alternatives,
].find((route) => route.acquisitionCandidateId === 'candidate_0');

const noMarketQuote = runOptimizer('Diagnostic D explicit fractured target without market quote', {
  ...baseInput,
  target: { requiredMods: [{ modId: t1IntId, mustBeFractured: true }] },
  searchBudget: {
    maxStates: 5_000,
    maxWallTimeMs: 45_000,
    maxExpansionRounds: 3,
    acquisitionMaxStates: 5_001,
    acquisitionMaxWallTimeMs: 32_000,
    acquisitionMaxExpansionRounds: 3,
  },
});
const noMarketQuoteCached = runOptimizer('Diagnostic D exact-cache repeat', {
  ...baseInput,
  target: { requiredMods: [{ modId: t1IntId, mustBeFractured: true }] },
  searchBudget: {
    maxStates: 5_000,
    maxWallTimeMs: 45_000,
    maxExpansionRounds: 3,
    acquisitionMaxStates: 5_001,
    acquisitionMaxWallTimeMs: 32_000,
    acquisitionMaxExpansionRounds: 3,
  },
});

console.error('[phase2d] Diagnostics E/R5/R6 external parity');
const parity = runExternalParityDiagnostics({ pool, priceBook });
const fractureParity = parity.results.find((result) => result.benchmarkId === 'fracture_t1_int');
const harvestParity = parity.results.filter((result) =>
  result.benchmarkId === 'harvest_defences_t1_int_es_raw_presence' ||
  result.benchmarkId === 'annul_once_after_harvest_t1_int_es_raw_hit' ||
  result.benchmarkId === 'harvest_then_one_annul_t1_int_es_presence'
);

const lines: string[] = [];
lines.push('PHASE 2D EXECUTABLE ACQUISITION SYNTHESIS — INTEGRATION DIAGNOSTIC');
lines.push('');
lines.push('DIAGNOSTIC A — STANDALONE SINGLE-TARGET EXECUTABLE FRACTURE');
lines.push(`  target modifier: ${t1IntId}`);
lines.push(`  status: ${standalone.status}`);
lines.push(`  expected total acquisition EV: ${money(standalone.expectedCostChaos)}`);
lines.push(`  expected preparation EV: ${money(standalone.expectedPreparationCostChaos)}`);
lines.push(`  optimistic lower bound: ${money(standalone.lowerBoundChaos)}`);
lines.push(`  expected action usage: ${standalone.expectedActionUsage.map((usage) => `${usage.actionId}=${usage.expectedCount.toFixed(6)} (${money(usage.expectedCostChaos)})`).join(' | ')}`);
lines.push(`  expected restarts / Fracturing Orbs: ${standalone.expectedRestarts.toFixed(9)} / ${standalone.expectedFracturingOrbs.toFixed(9)}`);
lines.push(`  proper / terminal absorption: ${standalone.risk.selectedPolicyProper ? 'YES' : 'NO'} / ${pct(standalone.risk.terminalAbsorptionProbability)}`);
lines.push(`  Bellman / occupancy: ${standalone.solver.bellmanConverged ? 'CONVERGED' : 'NOT CONVERGED'} (${standalone.solver.bellmanIterations}) / ${standalone.solver.occupancyConverged ? 'CONVERGED' : 'NOT CONVERGED'} (${standalone.solver.occupancyIterations})`);
lines.push(`  EV reconciliation: ${money(standalone.solver.reconciliationDifferenceChaos)} (${standalone.solver.costReconciled ? 'PASS' : 'FAIL'})`);
lines.push(`  states / runtime: ${standalone.search.statesExpanded} / ${standaloneElapsedMs}ms`);
lines.push(`  expansion mode / cumulative work / repeated / rounds: ${standalone.search.expansionMode} / ${standalone.search.cumulativeExpansionWork} / ${standalone.search.repeatedStatesExpanded} / ${standalone.search.expansionRounds}`);
lines.push(`  proof / global optimality: ${standalone.proof.selectedPolicyStatus} / ${standalone.proof.globalOptimality}`);
lines.push(`  unresolved candidates could beat incumbent: ${standalone.proof.unresolvedCandidatesCouldBeatIncumbent ? 'YES' : 'NO'}`);

lines.push('');
lines.push('DIAGNOSTIC B — WRONG-FRACTURE RECOVERY');
lines.push(`  wrong-fracture on-policy states / visits: ${standalone.wrongFractureRecovery.states} / ${standalone.wrongFractureRecovery.expectedVisits.toFixed(9)}`);
lines.push(`  recovery actions: ${standalone.wrongFractureRecovery.recoveryActions.map((action) => `${action.actionId}=${action.expectedVisits.toFixed(9)}`).join(' | ')}`);
lines.push(`  in-place reset available: ${standalone.wrongFractureRecovery.inPlaceResetAvailable ? 'YES' : 'NO'}`);
lines.push(`  restart EV: ${money(standalone.wrongFractureRecovery.expectedRestartCostChaos)}`);
lines.push(`  observed fracture source probabilities: ${standalone.fractureOutcomes.slice(0, 3).map((outcome) => `${outcome.affixesOnItem} affixes => desired=${pct(outcome.desiredOutcomeProbability)}, wrong=${pct(outcome.wrongOutcomeProbability)}`).join(' | ')}`);
lines.push(`  evidence: ${standalone.wrongFractureRecovery.note}`);

lines.push('');
lines.push('DIAGNOSTIC C — MULTIPLE FRACTURE-TARGET PORTFOLIO');
lines.push(...optimizerLines('  Forced-Rare T1 Intelligence + T1 Attributes', multiFracture.result, multiFracture.elapsedMs));
lines.push(`  all relevant physical families discovered: ${multiFracture.result.acquisition.candidates.length >= 3 ? 'YES' : 'NO'}`);
lines.push(`  both fracture families certified and sent to downstream ranking: ${multiFracture.result.acquisition.candidates.filter((candidate) => candidate.methods.some((method) => method.executable)).length >= 2 ? 'YES' : 'NO'}`);

lines.push('');
lines.push('DIAGNOSTIC D — NO-MARKET-QUOTE PRODUCT GATE / EXACT CACHE');
lines.push(...optimizerLines('  Explicit fractured T1 Intelligence target', noMarketQuote.result, noMarketQuote.elapsedMs));
lines.push(`  no fractured market prices supplied: ${noMarketQuote.result.acquisition.candidates.every((candidate) => candidate.methods.every((method) => !method.id.startsWith('market'))) ? 'YES' : 'NO'}`);
lines.push(`  fractured executable family exists: ${noMarketQuote.result.acquisition.candidates.some((candidate) => candidate.methods.some((method) => method.executable)) ? 'YES' : 'NO'}`);
lines.push(`  exact repeat cache hits / runtime: ${noMarketQuoteCached.result.acquisition.stage.cacheHits} / ${noMarketQuoteCached.elapsedMs}ms`);
lines.push(`  cache identity: ${noMarketQuote.result.acquisition.stage.cacheIdentity}`);

lines.push('');
lines.push('DIAGNOSTIC E — EXTERNAL FRACTURING ORB PARITY');
lines.push(`  external / analytical / seeded MC: ${fractureParity?.craftOfExileObservedPct.toFixed(4) ?? 'N/A'}% / ${fractureParity?.analyticalProbabilityPct.toFixed(4) ?? 'N/A'}% / ${fractureParity?.mcObservedProbabilityPct.toFixed(4) ?? 'N/A'}%`);
lines.push(`  external fixture: 250 / 1000; status: ${fractureParity?.status ?? 'MISSING'}`);
lines.push('  parity is evidence for the shared mechanic only; no 25% multiplier is inserted into acquisition EV.');

lines.push('');
lines.push('DIAGNOSTIC F — LEGACY REFERENCE COMPARISON');
lines.push(`  legacy approximate reference: ${money(legacyApproximateReference)}`);
lines.push(`  executable certified incumbent: ${money(standalone.expectedCostChaos)}`);
lines.push(`  difference: ${money((standalone.expectedCostChaos ?? Number.NaN) - legacyApproximateReference)}`);
lines.push(`  globalOptimality: ${standalone.proof.globalOptimality}`);
lines.push(`  unresolvedCandidatesCouldBeatIncumbent: ${standalone.proof.unresolvedCandidatesCouldBeatIncumbent}`);
lines.push('  explanation: the executable value is a certified proper route, not a global optimum. Unresolved cheaper branches may exist, active prices differ, and the modeled action set lacks an authoritative cheap Crafting Bench filler that the old +10c allowance assumed.');
lines.push('  ranking policy: the legacy reference is diagnostic-only and is absent from core acquisition methods.');

lines.push('');
lines.push('R1–R4 NORMAL OPTIMIZER REGRESSIONS');
lines.push(...optimizerLines('  R1 one-mod T1 ES', oneMod.result, oneMod.elapsedMs));
lines.push(...optimizerLines('  R2 two-mod T1 ES + T1 Int, Any', twoModAny.result, twoModAny.elapsedMs));
lines.push(...optimizerLines('  R3 two-mod no-unwanted', twoModClean.result, twoModClean.elapsedMs));
lines.push(...optimizerLines('  R4 forced-Rare T1 ES + T1 Int', forcedRareTwoMod.result, forcedRareTwoMod.elapsedMs));
lines.push(`  R4 clean-family U / L: ${money(forcedRareCleanRoute?.expectedTotalCostChaos)} / ${money(forcedRareCleanRoute?.lowerBoundChaos)}`);

lines.push('');
lines.push('R5 — HARVEST PARITY');
for (const result of harvestParity) {
  lines.push(`  ${result.benchmarkId}: external=${result.craftOfExileObservedPct.toFixed(7)}%; analytical=${result.analyticalProbabilityPct.toFixed(7)}%; MC=${result.mcObservedProbabilityPct.toFixed(7)}%; status=${result.status}; semantics=${result.targetDescription}`);
}
lines.push('  Raw presence and exactly-one-Annul presence semantics remain unchanged; no clean-finished interpretation is introduced.');

lines.push('');
lines.push('R6 — FRACTURING PARITY');
lines.push(`  analytical / seeded / status: ${fractureParity?.analyticalProbabilityPct.toFixed(4) ?? 'N/A'}% / ${fractureParity?.mcObservedProbabilityPct.toFixed(4) ?? 'N/A'}% / ${fractureParity?.status ?? 'MISSING'}`);

lines.push('');
lines.push('INTEGRATION INVARIANTS');
lines.push('  synthesizeAcquisition invocation: OptimizerService acquisition stage and generateStartingStrategies legacy entry path.');
lines.push('  pre-fractured market purchase in core ranking: NO. Compatibility input remains dormant and ignored.');
lines.push('  legacy approximate fracture formula in core ranking: NO. It is computed only above as Diagnostic F reference.');
lines.push('  unit tests added: NO.');
lines.push('  Craft-specific solver branches added: NO.');

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));

// Retain the type at this boundary so future diagnostic edits cannot accidentally accept a
// provisional standalone fixture as the certified reference without inspecting its proof fields.
const _certifiedStandalone: AcquisitionSynthesisResult = standalone;
void _certifiedStandalone;
