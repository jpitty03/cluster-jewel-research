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

  lines.push('='.repeat(70));
  lines.push('END-TO-END CRAFTING PLAN & STEPWISE FINANCIAL REPORT');
  lines.push('='.repeat(70));

  // Determine Monte Carlo Validation Status
  let diffPercent = 0;
  let mcPassed = false;
  if (simulation && simulation.meanCostChaos !== undefined) {
    const analyticalCost = recommended.totalExpectedCostChaos;
    const simCost = simulation.meanCostChaos;
    diffPercent = Math.abs(simCost - analyticalCost) / analyticalCost * 100;
    mcPassed = diffPercent <= 5.0 && simulation.completionRate >= 95.0;
  }

  // Status Indicator
  if (recommended.strategyName.includes('Cold')) {
    lines.push('\nSTATUS: NOT YET OPTIMIZED');
    lines.push('The reported Exalt path is only the best route among currently implemented actions.');
    lines.push('It is not a global optimum (requires Alt/Aug/Regal/Scour transitions).');
  } else if (mcPassed) {
    lines.push(`\nSTATUS: MATHEMATICALLY VALIDATED (Analytical & Monte Carlo agree within ${diffPercent.toFixed(2)}%)`);
  } else {
    lines.push('\nSTATUS: APPROXIMATE / NOT VALIDATED');
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
        lines.push(`  Preparation sub-plan:          ${opt.prepCostChaos?.toFixed(2)}c per attempt (Alt/Regal/Bench)`);
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
    lines.push(`Status: ${mcPassed ? 'PASS (Valid Agreement <= 5%)' : 'APPROXIMATE / INVESTIGATION REQUIRED'}`);
    lines.push(`Completed trials:       ${simulation.completedTrials} / ${simulation.totalTrials} (${simulation.completionRate.toFixed(2)}%)`);
    if (simulation.timedOutTrials > 0) {
      lines.push(`Timed out trials:       ${simulation.timedOutTrials}`);
    }
    if (simulation.failedTrials > 0) {
      lines.push(`Failed/abandoned trials:${simulation.failedTrials}`);
    }

    if (simulation.meanCostChaos !== undefined) {
      lines.push(`\nStepwise Currency & Cost Comparison:`);
      lines.push(`                     Analytical     Monte Carlo     Difference`);
      lines.push(`-`.repeat(65));
      
      const prLifeforce = recommended.expectedCurrencies?.primalLifeforce ?? 1050;
      const simLifeforce = simulation.currencyAverages?.primalLifeforce ?? 0;
      lines.push(`Primal Lifeforce:   ${prLifeforce.toFixed(1).padStart(8)}       ${simLifeforce.toFixed(1).padStart(8)}       ${(simLifeforce - prLifeforce).toFixed(1).padStart(8)}`);

      const expAnnuls = recommended.expectedCurrencies?.annul ?? 0;
      const simAnnuls = simulation.currencyAverages?.annul ?? 0;
      lines.push(`Annulment Orbs:     ${expAnnuls.toFixed(2).padStart(8)}       ${simAnnuls.toFixed(2).padStart(8)}       ${(simAnnuls - expAnnuls).toFixed(2).padStart(8)}`);

      const expExalts = recommended.expectedCurrencies?.exalt ?? 0;
      const simExalts = simulation.currencyAverages?.exalt ?? 0;
      lines.push(`Exalted Orbs:       ${expExalts.toFixed(2).padStart(8)}       ${simExalts.toFixed(2).padStart(8)}       ${(simExalts - expExalts).toFixed(2).padStart(8)}`);

      const expDivines = recommended.expectedCurrencies?.divine ?? 0;
      const simDivines = simulation.currencyAverages?.divine ?? 0;
      lines.push(`Divine Orbs:        ${expDivines.toFixed(2).padStart(8)}       ${simDivines.toFixed(2).padStart(8)}       ${(simDivines - expDivines).toFixed(2).padStart(8)}`);

      lines.push(`-`.repeat(65));
      lines.push(`Total Expected Cost:${formatChaos(recommended.totalExpectedCostChaos, divineRate).padStart(12)}   ${formatChaos(simulation.meanCostChaos, divineRate).padStart(12)}   ${diffPercent.toFixed(2)}% diff`);
      lines.push(`Median Cost (P50):                 ${formatChaos(simulation.medianCostChaos ?? 0, divineRate).padStart(12)}`);
      lines.push(`75th Percentile (P75):             ${formatChaos(simulation.p75CostChaos ?? 0, divineRate).padStart(12)}`);
      lines.push(`90th Percentile (P90):             ${formatChaos(simulation.p90CostChaos ?? 0, divineRate).padStart(12)}`);
      lines.push(`95th Percentile (P95):             ${formatChaos(simulation.p95CostChaos ?? 0, divineRate).padStart(12)}`);
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
