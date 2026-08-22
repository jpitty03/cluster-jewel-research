import type { CraftingOptimizer, OptimizeCraftRequest, OptimizeCraftResponse } from '../index.ts';
import { MonteCarloSimulator } from './monteCarlo.ts';
import { formatChaos } from '../reporting/formatCosts.ts';

export interface SeedResult {
  seed: number;
  mcMeanChaos: number;
  totalCostDiffPct: number;
  harvestCount: number;
  harvestDiffPct: number;
  annulCount: number;
  annulDiffPct: number;
  exaltCount: number;
  exaltDiffPct: number;
  completionRate: number;
  timedOutTrials: number;
}

export interface PooledActionStats {
  actionName: string;
  analyticalExpected: number;
  pooledMcMean: number;
  pooledDiffPct: number;
  betweenSeedStdDev: number;
}

export interface MultiSeedSummary {
  craftName: string;
  analyticalCostChaos: number;
  seeds: number[];
  seedResults: SeedResult[];
  minMcMeanChaos: number;
  maxMcMeanChaos: number;
  meanOfMeansChaos: number;
  pointEstimateDiffRangePct: [number, number];
  pooledActions: {
    harvest: PooledActionStats;
    annul: PooledActionStats;
    exalt: PooledActionStats;
  };
  isStable: boolean;
  explanation: string;
}

function calculateStdDev(values: number[]): number {
  if (values.length <= 1) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Executes a deterministic multi-seed Monte Carlo validation suite across an already-resolved
 * or newly resolved crafting policy.
 *
 * Implements solve-once, validate-many architecture to avoid repeated Bellman solving.
 */
export function runMultiSeedValidation(
  craftName: string,
  optimizer: CraftingOptimizer,
  baseRequest: OptimizeCraftRequest,
  seeds: number[] = [42, 1337, 2026, 9001, 123456]
): MultiSeedSummary {
  const seedResults: SeedResult[] = [];
  const divineRate = baseRequest.priceBook?.getRate('divine') ?? 200;
  const trialsPerSeed = baseRequest.monteCarloTrials ?? 2000;

  // 1. Solve the deterministic analytical policy once
  const baseResponse: OptimizeCraftResponse = optimizer.optimizeCraft({
    ...baseRequest,
    runMonteCarloValidation: false,
  });

  const analyticalCostChaos = baseResponse.recommendedStrategy.totalExpectedCostChaos;
  const recommended = baseResponse.recommendedStrategy;

  const expPrimal = recommended.expectedCurrencies?.primalLifeforce ? recommended.expectedCurrencies.primalLifeforce / 75 : 0;
  const expWild = recommended.expectedCurrencies?.wildLifeforce ? recommended.expectedCurrencies.wildLifeforce / 75 : 0;
  const expVivid = recommended.expectedCurrencies?.vividLifeforce ? recommended.expectedCurrencies.vividLifeforce / 75 : 0;
  const expHarvest = expPrimal + expWild + expVivid;
  const expAnnul = recommended.expectedCurrencies?.annul ?? 0;
  const expExalt = recommended.expectedCurrencies?.exalt ?? 0;

  // 2. Validate the resolved policy across multiple deterministic seeds
  for (const seed of seeds) {
    const simReq: OptimizeCraftRequest = {
      ...baseRequest,
      seed,
      runMonteCarloValidation: true,
      monteCarloTrials: trialsPerSeed,
    };

    const simResponse = optimizer.optimizeCraft(simReq);
    const sim = simResponse.simulationValidation;

    if (sim && sim.meanCostChaos !== undefined) {
      const totalCostDiffPct =
        (Math.abs(sim.meanCostChaos - analyticalCostChaos) / analyticalCostChaos) * 100;

      const simPrimal = sim.currencyAverages?.primalLifeforce ? sim.currencyAverages.primalLifeforce / 75 : 0;
      const simWild = sim.currencyAverages?.wildLifeforce ? sim.currencyAverages.wildLifeforce / 75 : 0;
      const simVivid = sim.currencyAverages?.vividLifeforce ? sim.currencyAverages.vividLifeforce / 75 : 0;
      const simHarvest = simPrimal + simWild + simVivid;
      const harvestDiffPct = expHarvest > 0 ? (Math.abs(simHarvest - expHarvest) / expHarvest) * 100 : 0;

      const simAnnul = sim.currencyAverages?.annul ?? 0;
      const annulDiffPct = expAnnul > 0 ? (Math.abs(simAnnul - expAnnul) / expAnnul) * 100 : 0;

      const simExalt = sim.currencyAverages?.exalt ?? 0;
      const exaltDiffPct = expExalt > 0 ? (Math.abs(simExalt - expExalt) / expExalt) * 100 : 0;

      seedResults.push({
        seed,
        mcMeanChaos: sim.meanCostChaos,
        totalCostDiffPct,
        harvestCount: simHarvest,
        harvestDiffPct,
        annulCount: simAnnul,
        annulDiffPct,
        exaltCount: simExalt,
        exaltDiffPct,
        completionRate: sim.completionRate,
        timedOutTrials: sim.timedOutTrials,
      });
    }
  }

  const mcMeans = seedResults.map((r) => r.mcMeanChaos);
  const minMcMeanChaos = Math.min(...mcMeans);
  const maxMcMeanChaos = Math.max(...mcMeans);
  const meanOfMeansChaos = mcMeans.reduce((s, m) => s + m, 0) / Math.max(1, mcMeans.length);
  const diffPcts = seedResults.map((r) => r.totalCostDiffPct);
  const pointEstimateDiffRangePct: [number, number] = [
    Math.min(...diffPcts),
    Math.max(...diffPcts),
  ];

  // 3. Compute pooled action statistics across all seeds
  const harvestCounts = seedResults.map((r) => r.harvestCount);
  const pooledHarvestMean = harvestCounts.reduce((s, v) => s + v, 0) / Math.max(1, harvestCounts.length);
  const pooledHarvestDiffPct = expHarvest > 0 ? (Math.abs(pooledHarvestMean - expHarvest) / expHarvest) * 100 : 0;
  const harvestStdDev = calculateStdDev(harvestCounts);

  const annulCounts = seedResults.map((r) => r.annulCount);
  const pooledAnnulMean = annulCounts.reduce((s, v) => s + v, 0) / Math.max(1, annulCounts.length);
  const pooledAnnulDiffPct = expAnnul > 0 ? (Math.abs(pooledAnnulMean - expAnnul) / expAnnul) * 100 : 0;
  const annulStdDev = calculateStdDev(annulCounts);

  const exaltCounts = seedResults.map((r) => r.exaltCount);
  const pooledExaltMean = exaltCounts.reduce((s, v) => s + v, 0) / Math.max(1, exaltCounts.length);
  const pooledExaltDiffPct = expExalt > 0 ? (Math.abs(pooledExaltMean - expExalt) / expExalt) * 100 : 0;
  const exaltStdDev = calculateStdDev(exaltCounts);

  const pooledActions = {
    harvest: {
      actionName: 'Harvest Reforges',
      analyticalExpected: expHarvest,
      pooledMcMean: pooledHarvestMean,
      pooledDiffPct: pooledHarvestDiffPct,
      betweenSeedStdDev: harvestStdDev,
    },
    annul: {
      actionName: 'Orb of Annulment',
      analyticalExpected: expAnnul,
      pooledMcMean: pooledAnnulMean,
      pooledDiffPct: pooledAnnulDiffPct,
      betweenSeedStdDev: annulStdDev,
    },
    exalt: {
      actionName: 'Exalted Orb Slam',
      analyticalExpected: expExalt,
      pooledMcMean: pooledExaltMean,
      pooledDiffPct: pooledExaltDiffPct,
      betweenSeedStdDev: exaltStdDev,
    },
  };

  // Stability heuristic: all pooled action counts <= 10%, completion >= 99%
  const isStable =
    pooledHarvestDiffPct <= 10 &&
    pooledAnnulDiffPct <= 10 &&
    pooledExaltDiffPct <= 10 &&
    seedResults.every((r) => r.completionRate >= 99);

  const lines: string[] = [];
  lines.push('\n' + '='.repeat(80));
  lines.push(`MULTI-SEED MONTE CARLO STABILITY HARNESS: ${craftName} (${seeds.length} SEEDS, ${(seeds.length * trialsPerSeed).toLocaleString()} TOTAL TRIALS)`);
  lines.push('='.repeat(80));
  lines.push(`Analytical Expected Total: ${formatChaos(analyticalCostChaos, divineRate)}`);
  lines.push(`\nPER-SEED RESULTS SUMMARY:`);
  lines.push(`Seed        MC Mean              Cost Diff     Harvest Diff  Annul Diff   Exalt Diff   Completion   Timeouts`);
  lines.push('-'.repeat(105));

  for (const r of seedResults) {
    const seedCol = String(r.seed).padEnd(11);
    const mcCol = formatChaos(r.mcMeanChaos, divineRate).padEnd(20);
    const costDiffCol = `${r.totalCostDiffPct.toFixed(2)}%`.padStart(10);
    const hDiffCol = `${r.harvestDiffPct.toFixed(2)}%`.padStart(13);
    const aDiffCol = `${r.annulDiffPct.toFixed(2)}%`.padStart(12);
    const eDiffCol = `${r.exaltDiffPct.toFixed(2)}%`.padStart(12);
    const compCol = `${r.completionRate.toFixed(2)}%`.padStart(12);
    const toCol = String(r.timedOutTrials).padStart(10);
    lines.push(`${seedCol} ${mcCol} ${costDiffCol} ${hDiffCol} ${aDiffCol} ${eDiffCol} ${compCol} ${toCol}`);
  }

  lines.push('-'.repeat(105));
  lines.push(`\nAGGREGATE MULTI-SEED TOTAL COST METRICS:`);
  lines.push(`  Min MC Mean:           ${formatChaos(minMcMeanChaos, divineRate)}`);
  lines.push(`  Max MC Mean:           ${formatChaos(maxMcMeanChaos, divineRate)}`);
  lines.push(`  Mean of Seed Means:    ${formatChaos(meanOfMeansChaos, divineRate)} (${(((meanOfMeansChaos - analyticalCostChaos) / analyticalCostChaos) * 100).toFixed(2)}% vs analytical)`);
  lines.push(`  Point Diff Range:      [${pointEstimateDiffRangePct[0].toFixed(2)}% - ${pointEstimateDiffRangePct[1].toFixed(2)}%]`);

  lines.push(`\nPOOLED MULTI-SEED ACTION COUNT METRICS (${(seeds.length * trialsPerSeed).toLocaleString()} TRIALS):`);
  lines.push(`Action               Analytical EV     Pooled MC Mean    Pooled Diff %   Between-Seed SD`);
  lines.push('-'.repeat(85));

  for (const pa of [pooledActions.harvest, pooledActions.annul, pooledActions.exalt]) {
    const actCol = pa.actionName.padEnd(20);
    const aEvCol = pa.analyticalExpected.toFixed(2).padStart(17);
    const pMcCol = pa.pooledMcMean.toFixed(2).padStart(18);
    const diffCol = `${pa.pooledDiffPct.toFixed(2)}%`.padStart(16);
    const sdCol = pa.betweenSeedStdDev.toFixed(2).padStart(18);
    lines.push(`${actCol} ${aEvCol} ${pMcCol} ${diffCol} ${sdCol}`);
  }

  lines.push('-'.repeat(85));
  lines.push(`\nSTABILITY CONCLUSION:`);
  lines.push(`  Status:                ${isStable ? 'MULTI-SEED STABLE' : 'PROVISIONAL / MULTI-SEED CAUTION'}`);
  lines.push(`  Assessment:            ${isStable ? 'Pooled action counts <=10% and completion >=99% across all deterministic seeds.' : 'Observed heavy-tail variance across individual seeds; pooled statistics quantify aggregate alignment.'}`);

  const explanation = lines.join('\n');

  return {
    craftName,
    analyticalCostChaos,
    seeds,
    seedResults,
    minMcMeanChaos,
    maxMcMeanChaos,
    meanOfMeansChaos,
    pointEstimateDiffRangePct,
    pooledActions,
    isStable,
    explanation,
  };
}
