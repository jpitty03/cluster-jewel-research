import type { CraftingOptimizer, OptimizeCraftRequest, OptimizeCraftResponse } from '../index.ts';
import { formatChaos } from '../reporting/formatCosts.ts';

export interface SeedResult {
  seed: number;
  mcMeanChaos: number;
  totalCostDiffPct: number;
  harvestDiffPct: number;
  annulDiffPct: number;
  exaltDiffPct: number;
  completionRate: number;
  timedOutTrials: number;
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
  isStable: boolean;
  explanation: string;
}

export function runMultiSeedValidation(
  craftName: string,
  optimizer: CraftingOptimizer,
  baseRequest: OptimizeCraftRequest,
  seeds: number[] = [42, 1337, 2026, 9001, 123456]
): MultiSeedSummary {
  const seedResults: SeedResult[] = [];
  const divineRate = baseRequest.priceBook?.getRate('divine') ?? 200;

  let analyticalCostChaos = 0;

  for (const seed of seeds) {
    const requestWithSeed: OptimizeCraftRequest = {
      ...baseRequest,
      seed,
      runMonteCarloValidation: true,
    };

    const response: OptimizeCraftResponse = optimizer.optimizeCraft(requestWithSeed);
    analyticalCostChaos = response.recommendedStrategy.totalExpectedCostChaos;

    const sim = response.simulationValidation;
    if (sim && sim.meanCostChaos !== undefined) {
      const totalCostDiffPct =
        (Math.abs(sim.meanCostChaos - analyticalCostChaos) / analyticalCostChaos) * 100;

      const expPrimal = response.recommendedStrategy.expectedCurrencies?.primalLifeforce ? response.recommendedStrategy.expectedCurrencies.primalLifeforce / 75 : 0;
      const expWild = response.recommendedStrategy.expectedCurrencies?.wildLifeforce ? response.recommendedStrategy.expectedCurrencies.wildLifeforce / 75 : 0;
      const expVivid = response.recommendedStrategy.expectedCurrencies?.vividLifeforce ? response.recommendedStrategy.expectedCurrencies.vividLifeforce / 75 : 0;
      const expH = expPrimal + expWild + expVivid;
      const simPrimal = sim.currencyAverages?.primalLifeforce ? sim.currencyAverages.primalLifeforce / 75 : 0;
      const simWild = sim.currencyAverages?.wildLifeforce ? sim.currencyAverages.wildLifeforce / 75 : 0;
      const simVivid = sim.currencyAverages?.vividLifeforce ? sim.currencyAverages.vividLifeforce / 75 : 0;
      const simH = simPrimal + simWild + simVivid;
      const harvestDiffPct = expH > 0 ? (Math.abs(simH - expH) / expH) * 100 : 0;

      const expA = response.recommendedStrategy.expectedCurrencies?.annul ?? 0;
      const simA = sim.currencyAverages?.annul ?? 0;
      const annulDiffPct = expA > 0 ? (Math.abs(simA - expA) / expA) * 100 : 0;

      const expE = response.recommendedStrategy.expectedCurrencies?.exalt ?? 0;
      const simE = sim.currencyAverages?.exalt ?? 0;
      const exaltDiffPct = expE > 0 ? (Math.abs(simE - expE) / expE) * 100 : 0;

      seedResults.push({
        seed,
        mcMeanChaos: sim.meanCostChaos,
        totalCostDiffPct,
        harvestDiffPct,
        annulDiffPct,
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

  // Stability heuristic: all action counts <= 10%, point estimates within reasonable tolerance
  const isStable = seedResults.every((r) => r.harvestDiffPct <= 10 && r.annulDiffPct <= 10 && r.exaltDiffPct <= 10 && r.completionRate >= 99);

  const lines: string[] = [];
  lines.push('\n' + '='.repeat(80));
  lines.push(`MULTI-SEED MONTE CARLO STABILITY HARNESS: ${craftName} (${seeds.length} SEEDS)`);
  lines.push('='.repeat(80));
  lines.push(`Analytical Expected Total: ${formatChaos(analyticalCostChaos, divineRate)}`);
  lines.push(`\nSEED RESULTS SUMMARY:`);
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
  lines.push(`\nAGGREGATE STABILITY DIAGNOSTICS:`);
  lines.push(`  Min MC Mean:           ${formatChaos(minMcMeanChaos, divineRate)}`);
  lines.push(`  Max MC Mean:           ${formatChaos(maxMcMeanChaos, divineRate)}`);
  lines.push(`  Mean of Seed Means:    ${formatChaos(meanOfMeansChaos, divineRate)} (${(((meanOfMeansChaos - analyticalCostChaos) / analyticalCostChaos) * 100).toFixed(2)}% vs analytical)`);
  lines.push(`  Point Diff Range:      [${pointEstimateDiffRangePct[0].toFixed(2)}% - ${pointEstimateDiffRangePct[1].toFixed(2)}%]`);
  lines.push(`  Stability Conclusion:  ${isStable ? 'STABLE (Action counts <=10% and completion >=99% across all seeds)' : 'PROVISIONAL / CAUTION (Observed variation across seeds)'}`);

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
    isStable,
    explanation,
  };
}
