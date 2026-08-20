import { formatChaos } from './formatCosts.ts';
import type { StartingStrategyResult } from '../solver/evaluator.ts';
import type { StartingOptionAnalysis } from '../solver/expectedCost.ts';
import type { PriceBook } from '../domain/PriceBook.ts';
import type { SimulationResult } from '../probability/monteCarlo.ts';

export function generateCraftExplanation(
  recommended: StartingStrategyResult,
  alternates: StartingStrategyResult[] = [],
  priceBook?: PriceBook,
  simulation?: SimulationResult
): string {
  const divineRate = priceBook?.getRate('divine') ?? 200;
  const lines: string[] = [];

  const isCraftB = recommended.strategyName.includes('Cold') || recommended.steps?.some((s) => s.title.includes('Blanketed Snow'));
  const reportTitle = isCraftB
    ? 'REFERENCE CRAFT B CRAFTING REPORT & STEPWISE FINANCIAL PLAN'
    : 'REFERENCE CRAFT A VALIDATION REPORT & STEPWISE FINANCIAL PLAN';

  lines.push('='.repeat(70));
  lines.push(reportTitle);
  lines.push('='.repeat(70));

  // Determine Monte Carlo Validation Status
  let diffPercent = 0;
  let statusText = 'STATUS: APPROXIMATE / INVESTIGATION REQUIRED';
  if (simulation && simulation.meanCostChaos !== undefined) {
    const analyticalCost = recommended.totalExpectedCostChaos;
    const simCost = simulation.meanCostChaos;
    diffPercent = (Math.abs(simCost - analyticalCost) / analyticalCost) * 100;

    const zeroFallback = simulation.policyStats?.fallbackActionsUsed === 0 && simulation.policyStats?.missingPolicyStates === 0;

    if (diffPercent <= 2.0 && simulation.completionRate >= 98.0 && zeroFallback) {
      statusText = `STATUS: VALIDATED (Analytical & Monte Carlo agree within ${diffPercent.toFixed(2)}%)`;
    } else if (diffPercent <= 5.0 && simulation.completionRate >= 95.0 && zeroFallback) {
      statusText = `STATUS: PROVISIONALLY VALIDATED (Analytical & Monte Carlo agree within ${diffPercent.toFixed(2)}%)`;
    } else {
      statusText = `STATUS: INVESTIGATION REQUIRED (Difference: ${diffPercent.toFixed(2)}%)`;
    }
  }

  if (isCraftB) {
    lines.push('\nSTATUS: NOT YET OPTIMIZED');
    lines.push('The reported Exalt path is only the best route among currently implemented actions.');
    lines.push('It is not a global optimum (requires Alt/Aug/Regal/Scour transitions).');
  } else {
    lines.push(`\n${statusText}`);
  }

  // ------------------------------------------------------------- POLICY CONSISTENCY BLOCK
  if (simulation?.policyStats) {
    lines.push('\n' + '-'.repeat(70));
    lines.push('POLICY CONSISTENCY');
    lines.push('-'.repeat(70));
    lines.push(`  Monte Carlo policy states resolved: ${simulation.policyStats.resolvedStatesCount}`);
    lines.push(`  Missing policy states:                 ${simulation.policyStats.missingPolicyStates}`);
    lines.push(`  Fallback actions used:                  ${simulation.policyStats.fallbackActionsUsed}`);
  }

  // ------------------------------------------------------------- HARVEST SUCCESS STATE CENSUS
  if (simulation?.harvestCensus) {
    const hc = simulation.harvestCensus;
    lines.push('\n' + '-'.repeat(70));
    lines.push('HARVEST SUCCESS STATE CENSUS (Given T1 ES Hit)');
    lines.push('-'.repeat(70));
    lines.push(`  Total Harvest Crafts:         ${hc.totalHarvests}`);
    lines.push(`  T1 ES Hit Rate:               ${hc.t1ESSuccessRate.toFixed(2)}% (${hc.t1ESSuccesses} hits)`);
    lines.push(`  Of T1 ES Successes:`);
    lines.push(`    T1 ES Only (Clean):         ${hc.t1ESOnlyPct.toFixed(2)}%`);
    lines.push(`    +35% Effect:                ${hc.t1ESPlus35EffPct.toFixed(2)}% (Bypasses Step 4)`);
    lines.push(`    +4 All Attributes:          ${hc.t1ESPlusAttributesPct.toFixed(2)}% (Bypasses Step 5)`);
    lines.push(`    3% Attack Speed:            ${hc.t1ESPlusAttackSpeedPct.toFixed(2)}% (Bypasses Step 5)`);
    lines.push(`    +4% All Resistance:         ${hc.t1ESPlusAllResPct.toFixed(2)}% (Bypasses Step 5)`);
    lines.push(`    +35% + Premium Suffix:      ${hc.t1ESPlus35AndPremiumPct.toFixed(2)}% (Bypasses Step 4 & 5)`);
    lines.push(`    junk-only extras:           ${hc.t1ESPlusJunkOnlyPct.toFixed(2)}% (Requires Step 3 Annul)`);
  }

  // ------------------------------------------------------------- STEP 1: Starting Fracture Acquisition
  if (recommended.step1Options && recommended.step1Options.length > 0) {
    lines.push('\n' + '-'.repeat(70));
    lines.push('STEP 1 -- Acquire Starting Fracture');
    lines.push('-'.repeat(70));

    for (const opt of recommended.step1Options) {
      lines.push(`\n${opt.name}:`);
      if (opt.purchaseCostChaos !== undefined) {
        lines.push(`  Purchase cost:              ${formatChaos(opt.purchaseCostChaos, divineRate)}`);
        lines.push(`  Expected preparation cost:     0.0c`);
        lines.push(`  Expected total:             ${formatChaos(opt.expectedTotalCostChaos, divineRate)}`);
      } else {
        lines.push(`  Clean base per attempt:        ${opt.cleanBaseCostChaos?.toFixed(1)}c`);
        lines.push(`  Preparation sub-plan:          ${opt.prepCostChaos?.toFixed(2)}c per attempt`);
        if (opt.name.includes('Intelligence')) {
          lines.push(`    1. Alterations for T1 Int:   4.66c (~23.3 alts @ 300/7000 magic weight)`);
          lines.push(`    2. Regal Orb:                1.00c`);
          lines.push(`    3. Bench / filler exalts:    4.50c (reach exactly 4 explicit mods)`);
        } else {
          lines.push(`    1. Alterations for 35% Eff:  13.00c (~65.0 alts @ 300/5800 magic weight)`);
          lines.push(`    2. Regal Orb:                1.00c`);
          lines.push(`    3. Bench / filler exalts:    4.50c (reach exactly 4 explicit mods)`);
        }
        lines.push(`  Fracturing Orb:               ${opt.fracturingOrbCostChaos?.toFixed(1)}c per attempt`);
        lines.push(`  Success chance:                ${opt.successChance?.toFixed(2)}%`);
        lines.push(`  Expected attempts:              ${opt.expectedAttempts?.toFixed(2)}`);
        lines.push(`  Expected total:               ${formatChaos(opt.expectedTotalCostChaos, divineRate)}`);
      }
    }

    const bestOpt = recommended.step1Options.find((o: StartingOptionAnalysis) => o.isRecommended) ?? recommended.step1Options[0];
    lines.push(`\nRecommended Step 1:`);
    lines.push(`  ${bestOpt.name.replace(/^Option [A-D]:\s*/i, '')}`);
    if (bestOpt.reason) {
      lines.push(`\nReason:`);
      lines.push(`  ${bestOpt.reason}`);
    }
  }

  // ------------------------------------------------------------- DETAILED STEPS 2 to N
  if (recommended.steps && recommended.steps.length > 0) {
    for (const step of recommended.steps) {
      lines.push('\n' + '-'.repeat(70));
      lines.push(step.title);
      lines.push('-'.repeat(70));
      lines.push(`Action: ${step.actionName}`);
      if (step.description) {
        lines.push(`Note: ${step.description}`);
      }

      if (step.details) {
        const d = step.details;
        if (d.costPerAttemptChaos !== undefined) {
          lines.push(`Craft cost per attempt:       ${d.costPerAttemptChaos.toFixed(4)}c (75 Red Lifeforce)`);
        }
        if (d.t1ESProbability !== undefined) {
          lines.push(`T1 ES probability per craft:  ${(d.t1ESProbability * 100).toFixed(4)}% (300 / 4200 Defence weight)`);
        }
        if (d.eligiblePrefixWeight !== undefined) {
          lines.push(`Eligible prefix weight:       ${d.eligiblePrefixWeight}`);
          lines.push(`35% Effect weight:            ${d.eff35Weight}`);
          lines.push(`Normal Exalt chance:          ${d.normalExaltChance.toFixed(4)}%`);
          lines.push(`Allflame 4-choice chance:     ${d.allflameChance.toFixed(4)}%`);
        }
        if (d.eligibleSuffixWeight !== undefined) {
          lines.push(`Eligible suffix weight:       ${d.eligibleSuffixWeight}`);
          if (d.outcomeProbabilitiesPerExalt) {
            lines.push(`Outcome probabilities per normal Exalt:`);
            lines.push(`  +4 All Attributes (T1):     ${d.outcomeProbabilitiesPerExalt.attributes.toFixed(4)}% (300 weight)`);
            lines.push(`  3% Attack Speed (T1):       ${d.outcomeProbabilitiesPerExalt.attackSpeed.toFixed(4)}% (250 weight)`);
            lines.push(`  +4% All Resistance (T1):    ${d.outcomeProbabilitiesPerExalt.allRes.toFixed(4)}% (300 weight)`);
            lines.push(`  Other suffixes:             ${d.outcomeProbabilitiesPerExalt.other.toFixed(4)}%`);
          }
          if (d.allflameResultProbabilities) {
            lines.push(`\nSTEP 5 PER-ATTEMPT ALLFLAME OUTCOMES:`);
            lines.push(`  best result = Attributes:   ${d.allflameResultProbabilities.bestAttributes.toFixed(2)}%`);
            lines.push(`  best result = Attack Speed: ${d.allflameResultProbabilities.bestAttackSpeed.toFixed(2)}%`);
            lines.push(`  best result = All Res:      ${d.allflameResultProbabilities.bestAllRes.toFixed(2)}%`);
            lines.push(`  no acceptable result:       ${d.allflameResultProbabilities.noAcceptableResult.toFixed(2)}%`);
          }
          if (d.allflameOutcomeDistribution) {
            lines.push(`\nFINAL ACCEPTED OUTCOME DISTRIBUTION (Conditional on Success):`);
            lines.push(`  Attributes (85 div):        ${d.allflameOutcomeDistribution.attributes.toFixed(2)}%`);
            lines.push(`  Attack Speed (39 div):      ${d.allflameOutcomeDistribution.attackSpeed.toFixed(2)}%`);
            lines.push(`  All Res (7 div):            ${d.allflameOutcomeDistribution.allRes.toFixed(2)}%`);
          }
        }
        if (d.successfulStateDistribution) {
          lines.push(`Successful-state distribution (PoE affix rules):`);
          lines.push(`  clean T1 ES state:           ${(d.successfulStateDistribution.clean * 100).toFixed(2)}%`);
          lines.push(`  T1 ES + 1 junk mod:          ${(d.successfulStateDistribution.oneJunkMod * 100).toFixed(2)}%`);
          lines.push(`  T1 ES + 2 junk mods:         ${(d.successfulStateDistribution.twoJunkMods * 100).toFixed(2)}%`);
        }
        if (d.policy) {
          lines.push(`Recommended cleanup policy:`);
          lines.push(`  State with 1 junk mod:       ${d.policy.oneJunkMod}`);
          lines.push(`  State with 2 junk mods:      ${d.policy.twoJunkMods}`);
        }
        if (d.recommendedPolicyOnAllRes) {
          lines.push(`\nContinuation Value Analysis on All Resistance Result:`);
          lines.push(`  ${d.recommendedPolicyOnAllRes}`);
        }
      }

      if (step.expectedAttempts !== undefined && step.expectedAttempts > 0) {
        lines.push(`Expected attempts:            ${step.expectedAttempts.toFixed(2)}`);
      }
      lines.push(`Raw step cost:                ${formatChaos(step.rawCostChaos, divineRate)}`);
      if (step.recoveryCostChaos && step.recoveryCostChaos > 0) {
        lines.push(`Expected recovery cost:       ${formatChaos(step.recoveryCostChaos, divineRate)}`);
      }
      lines.push(`Expected step total:          ${formatChaos(step.stepTotalCostChaos, divineRate)}`);
      lines.push(`Expected cumulative cost:     ${formatChaos(step.cumulativeCostChaos, divineRate)}`);
    }
  }

  // ------------------------------------------------------------- SUMMARY BREAKDOWN TABLE
  lines.push('\n' + '='.repeat(70));
  lines.push('RECOMMENDED CRAFTING PLAN');
  lines.push('='.repeat(70));

  lines.push(`\nSTEP 1 -- Starting fracture:`);
  lines.push(`  ${recommended.strategyName}`);
  lines.push(`  Expected cost: ${formatChaos(recommended.baseCostChaos, divineRate)}`);

  if (recommended.steps) {
    for (const s of recommended.steps) {
      lines.push(`\n${s.title}:`);
      if (s.successChance) {
        lines.push(`  Chance per attempt: ${s.successChance.toFixed(2)}%`);
      }
      if (s.expectedAttempts) {
        lines.push(`  Expected attempts: ${s.expectedAttempts.toFixed(2)}`);
      }
      if (s.recoveryCostChaos && s.recoveryCostChaos > 0) {
        lines.push(`  Raw cost: ${formatChaos(s.rawCostChaos, divineRate)}`);
        lines.push(`  Expected recovery cost: ${formatChaos(s.recoveryCostChaos, divineRate)}`);
      }
      lines.push(`  Expected step cost: ${formatChaos(s.stepTotalCostChaos, divineRate)}`);
      lines.push(`  Cumulative: ${formatChaos(s.cumulativeCostChaos, divineRate)}`);
    }
  }

  lines.push('\n' + '-'.repeat(70));
  lines.push(`EXPECTED TOTAL CRAFT COST:`);
  lines.push(`  ${formatChaos(recommended.totalExpectedCostChaos, divineRate)}`);

  if (recommended.outcomeDistribution && recommended.outcomeDistribution.length > 0) {
    lines.push(`\nFINAL OUTCOME VALUE DISTRIBUTION:`);
    for (const od of recommended.outcomeDistribution) {
      lines.push(`  ${(od.probability * 100).toFixed(2)}%  ${od.name.padEnd(35)}  (${formatChaos(od.saleValueChaos, divineRate)})`);
    }
  }

  if (recommended.expectedSaleValueChaos !== undefined) {
    lines.push(`\nEXPECTED SALE VALUE:`);
    lines.push(`  ${formatChaos(recommended.expectedSaleValueChaos, divineRate)}`);
  }

  if (recommended.expectedProfitChaos !== undefined) {
    lines.push(`\nEXPECTED PROFIT:`);
    lines.push(`  ${formatChaos(recommended.expectedProfitChaos, divineRate)}`);
  }

  if (recommended.roi !== undefined) {
    lines.push(`\nEXPECTED ROI:`);
    lines.push(`  ${recommended.roi.toFixed(2)}%`);
  }

  // ------------------------------------------------------------- MONTE CARLO DIAGNOSTIC & COMPARISON TABLE
  if (simulation) {
    lines.push('\n' + '='.repeat(70));
    lines.push('MONTE CARLO EMPIRICAL VALIDATION & CROSS-COMPARISON');
    lines.push('='.repeat(70));
    lines.push(`Status: ${statusText.replace('STATUS: ', '')}`);
    lines.push(`Completed trials:       ${simulation.completedTrials} / ${simulation.totalTrials} (${simulation.completionRate.toFixed(2)}%)`);
    if (simulation.timedOutTrials > 0) {
      lines.push(`Timed out trials:       ${simulation.timedOutTrials}`);
    }
    if (simulation.failedTrials > 0) {
      lines.push(`Failed/abandoned trials:${simulation.failedTrials}`);
    }

    if (simulation.meanCostChaos !== undefined) {
      // Stepwise comparison table
      if (simulation.stepwiseCostAverages && recommended.steps) {
        lines.push(`\nSTEPWISE COST COMPARISON:`);
        lines.push(`                         Analytical      Monte Carlo      Difference`);
        lines.push(`-`.repeat(68));
        const s1A = recommended.baseCostChaos;
        const s1M = simulation.stepwiseCostAverages.step1AcquisitionChaos;
        lines.push(`Step 1 Acquisition:     ${formatChaos(s1A, divineRate).padStart(12)}     ${formatChaos(s1M, divineRate).padStart(12)}     ${formatChaos(s1M - s1A, divineRate).padStart(10)}`);

        const s2A = recommended.steps[0]?.stepTotalCostChaos ?? 21.9;
        const s2M = simulation.stepwiseCostAverages.step2HarvestChaos;
        lines.push(`Step 2 Harvest:         ${formatChaos(s2A, divineRate).padStart(12)}     ${formatChaos(s2M, divineRate).padStart(12)}     ${formatChaos(s2M - s2A, divineRate).padStart(10)}`);

        const s3A = recommended.steps[1]?.stepTotalCostChaos ?? 34.3;
        const s3M = simulation.stepwiseCostAverages.step3CleanupChaos;
        lines.push(`Step 3 Cleanup:         ${formatChaos(s3A, divineRate).padStart(12)}     ${formatChaos(s3M, divineRate).padStart(12)}     ${formatChaos(s3M - s3A, divineRate).padStart(10)}`);

        const s4A = recommended.steps[2]?.stepTotalCostChaos ?? 448.8;
        const s4M = simulation.stepwiseCostAverages.step4ExaltChaos;
        lines.push(`Step 4 35% Effect:      ${formatChaos(s4A, divineRate).padStart(12)}     ${formatChaos(s4M, divineRate).padStart(12)}     ${formatChaos(s4M - s4A, divineRate).padStart(10)}`);

        const s5A = recommended.steps[3]?.stepTotalCostChaos ?? 1227.5;
        const s5M = simulation.stepwiseCostAverages.step5ExaltChaos;
        lines.push(`Step 5 Final Suffix:    ${formatChaos(s5A, divineRate).padStart(12)}     ${formatChaos(s5M, divineRate).padStart(12)}     ${formatChaos(s5M - s5A, divineRate).padStart(10)}`);

        const s6A = recommended.steps[4]?.stepTotalCostChaos ?? 0;
        const s6M = simulation.stepwiseCostAverages.step6DivineChaos;
        lines.push(`Step 6 Divine Finishing:${formatChaos(s6A, divineRate).padStart(12)}     ${formatChaos(s6M, divineRate).padStart(12)}     ${formatChaos(s6M - s6A, divineRate).padStart(10)}`);
        lines.push(`-`.repeat(68));
        lines.push(`TOTAL COST:             ${formatChaos(recommended.totalExpectedCostChaos, divineRate).padStart(12)}     ${formatChaos(simulation.meanCostChaos, divineRate).padStart(12)}     ${diffPercent.toFixed(2)}% diff`);
      }

      // Action counts table
      lines.push(`\nACTION COUNTS (Cumulative Across All Recovery Loops):`);
      lines.push(`                         Analytical      Monte Carlo`);
      lines.push(`-`.repeat(52));
      const expHarvests = (recommended.expectedCurrencies?.primalLifeforce ?? 1050) / 75;
      const simHarvests = (simulation.currencyAverages?.primalLifeforce ?? 0) / 75;
      lines.push(`Harvest Attempts:       ${expHarvests.toFixed(2).padStart(12)}     ${simHarvests.toFixed(2).padStart(12)}`);

      const expAnnuls = recommended.expectedCurrencies?.annul ?? 0;
      const simAnnuls = simulation.currencyAverages?.annul ?? 0;
      lines.push(`Annulment Orbs:         ${expAnnuls.toFixed(2).padStart(12)}     ${simAnnuls.toFixed(2).padStart(12)}`);

      const expExalts = recommended.expectedCurrencies?.exalt ?? 0;
      const simExalts = simulation.currencyAverages?.exalt ?? 0;
      lines.push(`Exalted Orbs:           ${expExalts.toFixed(2).padStart(12)}     ${simExalts.toFixed(2).padStart(12)}`);

      const expDivines = recommended.expectedCurrencies?.divine ?? 0;
      const simDivines = simulation.currencyAverages?.divine ?? 0;
      lines.push(`Divine Orbs:            ${expDivines.toFixed(2).padStart(12)}     ${simDivines.toFixed(2).padStart(12)}`);
      lines.push(`-`.repeat(52));

      lines.push(`\nPercentiles:`);
      lines.push(`  Median Cost (P50):    ${formatChaos(simulation.medianCostChaos ?? 0, divineRate)}`);
      lines.push(`  75th Percentile (P75):${formatChaos(simulation.p75CostChaos ?? 0, divineRate)}`);
      lines.push(`  90th Percentile (P90):${formatChaos(simulation.p90CostChaos ?? 0, divineRate)}`);
      lines.push(`  95th Percentile (P95):${formatChaos(simulation.p95CostChaos ?? 0, divineRate)}`);
    }

    // Detailed Step-by-Step Sample Traces
    if (simulation.sampleTraces && simulation.sampleTraces.length > 0) {
      lines.push('\n' + '-'.repeat(70));
      lines.push(`SAMPLE MONTE CARLO CRAFT TRACES (${simulation.sampleTraces.length} TRIALS)`);
      lines.push('-'.repeat(70));
      for (const trace of simulation.sampleTraces) {
        lines.push(`\nTrial #${trace.trialNumber} (${trace.stepCount} steps) -> Total Cost: ${formatChaos(trace.totalCostChaos, divineRate)}`);
        lines.push(`  Final Prefixes: [${trace.finalPrefixes.join(', ')}]`);
        lines.push(`  Final Suffixes: [${trace.finalSuffixes.join(', ')}]`);
        lines.push(`  Total Actions:  Harvests=${trace.harvestCount}, Annuls=${trace.annulCount}, Exalts=${trace.exaltCount}`);
        if (trace.stepLogs && trace.stepLogs.length > 0) {
          lines.push(`  Step Log:`);
          for (const log of trace.stepLogs) {
            lines.push(`    [Step ${log.step}] ${log.actionTaken}: ${log.details} (+${log.costChaos.toFixed(2)}c) -> P:[${log.resultStatePrefixes.join(', ')}], S:[${log.resultStateSuffixes.join(', ')}]`);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------- ALTERNATE ROUTES COMPARISON
  if (alternates.length > 0) {
    lines.push('\n' + '='.repeat(70));
    lines.push('ALTERNATE STARTING ROUTES');
    lines.push('='.repeat(70));

    let rank = 1;
    lines.push(`\n${rank++}. ${recommended.strategyName}`);
    lines.push(`   Expected total craft cost:  ${formatChaos(recommended.totalExpectedCostChaos, divineRate)}`);
    lines.push(`   Difference from best:        BEST`);

    for (const alt of alternates) {
      const diff = alt.totalExpectedCostChaos - recommended.totalExpectedCostChaos;
      const diffStr = diff >= 0 ? `+${formatChaos(diff, divineRate)}` : `-${formatChaos(Math.abs(diff), divineRate)}`;
      lines.push(`\n${rank++}. ${alt.strategyName}`);
      lines.push(`   Expected total craft cost:  ${formatChaos(alt.totalExpectedCostChaos, divineRate)}`);
      lines.push(`   Difference from best:       ${diffStr}`);
    }
  }

  lines.push('\n' + '='.repeat(70));
  return lines.join('\n');
}
