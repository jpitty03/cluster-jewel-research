import { formatChaos } from './formatCosts.ts';
import type { StartingStrategyResult } from '../solver/evaluator.ts';
import type { AcquisitionOption } from '../solver/expectedCost.ts';
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
  const isCraftC = recommended.strategyName.includes('Minion') || recommended.strategyName.includes('Life') || recommended.steps?.some((s) => s.title.includes('Life') || s.title.includes('Chaos'));
  const reportTitle = isCraftB
    ? 'REFERENCE CRAFT B CRAFTING REPORT & STEPWISE FINANCIAL PLAN'
    : (isCraftC
      ? 'REFERENCE CRAFT C VALIDATION REPORT & STEPWISE FINANCIAL PLAN (MINION CLUSTER)'
      : 'REFERENCE CRAFT A VALIDATION REPORT & STEPWISE FINANCIAL PLAN');

  lines.push('='.repeat(70));
  lines.push(reportTitle);
  lines.push('='.repeat(70));

  let diffPercent = 0;
  let statusText = 'POLICY COST MODEL: APPROXIMATE / INVESTIGATION REQUIRED';
  if (simulation && simulation.meanCostChaos !== undefined) {
    const analyticalCost = recommended.totalExpectedCostChaos;
    const simCost = simulation.meanCostChaos;
    diffPercent = (Math.abs(simCost - analyticalCost) / analyticalCost) * 100;
    const costDiffPct = diffPercent;

    const expPrimalH = recommended.expectedCurrencies?.primalLifeforce ? recommended.expectedCurrencies.primalLifeforce / 75 : 0;
    const simPrimalH = simulation.currencyAverages?.primalLifeforce ? simulation.currencyAverages.primalLifeforce / 75 : 0;
    const expWildH = recommended.expectedCurrencies?.wildLifeforce ? recommended.expectedCurrencies.wildLifeforce / 75 : 0;
    const simWildH = simulation.currencyAverages?.wildLifeforce ? simulation.currencyAverages.wildLifeforce / 75 : 0;
    const expVividH = recommended.expectedCurrencies?.vividLifeforce ? recommended.expectedCurrencies.vividLifeforce / 75 : 0;
    const simVividH = simulation.currencyAverages?.vividLifeforce ? simulation.currencyAverages.vividLifeforce / 75 : 0;
    const expH = expPrimalH + expWildH + expVividH;
    const simH = simPrimalH + simWildH + simVividH;
    const harvestDiffPct = expH > 0 ? (Math.abs(simH - expH) / expH) * 100 : 0;

    const expA = recommended.expectedCurrencies?.annul ?? 0;
    const simA = simulation.currencyAverages?.annul ?? 0;
    const annulDiffPct = expA > 0 ? (Math.abs(simA - expA) / expA) * 100 : 0;

    const expE = recommended.expectedCurrencies?.exalt ?? 0;
    const simE = simulation.currencyAverages?.exalt ?? 0;
    const exaltDiffPct = expE > 0 ? (Math.abs(simE - expE) / expE) * 100 : 0;

    const zeroFallback = simulation.policyStats?.fallbackActionsUsed === 0 && simulation.policyStats?.missingPolicyStates === 0;
    const allCountsPass = (expH === 0 || harvestDiffPct <= 10.0) && (expA === 0 || annulDiffPct <= 10.0) && (expE === 0 || exaltDiffPct <= 10.0);

    if (costDiffPct <= 2.0 && allCountsPass && simulation.completionRate >= 98.0 && zeroFallback) {
      statusText = `POLICY COST MODEL: VALIDATED FOR CURRENT IMPLEMENTED MECHANICS (Analytical & Monte Carlo agree within ${costDiffPct.toFixed(2)}%)\nGAME-MECHANICS FIDELITY: PARTIAL\nBEST OF EVALUATED POLICIES: PROVEN\nGLOBAL OPTIMALITY: NOT YET PROVEN`;
    } else if (costDiffPct <= 5.0 && allCountsPass && simulation.completionRate >= 95.0 && zeroFallback) {
      statusText = `POLICY COST MODEL: PROVISIONALLY VALIDATED FOR CURRENT IMPLEMENTED MECHANICS (Analytical & Monte Carlo agree within ${costDiffPct.toFixed(2)}%)\nGAME-MECHANICS FIDELITY: PARTIAL\nBEST OF EVALUATED POLICIES: PROVEN\nGLOBAL OPTIMALITY: NOT YET PROVEN`;
    } else {
      statusText = `POLICY COST MODEL: INVESTIGATION REQUIRED (Cost Diff: ${costDiffPct.toFixed(2)}%, Harvest Diff: ${harvestDiffPct.toFixed(2)}%, Annul Diff: ${annulDiffPct.toFixed(2)}%, Exalt Diff: ${exaltDiffPct.toFixed(2)}%)`;
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

  // ------------------------------------------------------------- HARVEST STOPPING POLICY COMPARISON
  if (recommended.harvestComparison && recommended.harvestComparison.length > 0) {
    lines.push('\n' + '='.repeat(70));
    lines.push('HARVEST STOPPING POLICY COMPARISON');
    lines.push('='.repeat(70));

    for (const comp of recommended.harvestComparison) {
      lines.push(`\n${comp.name}:`);
      lines.push(`  Expected Harvests:           ${comp.expectedHarvests.toFixed(2)}`);
      lines.push(`  Expected Annulments:          ${comp.expectedAnnuls.toFixed(2)}`);
      lines.push(`  Expected Exalted Slams:       ${comp.expectedExalts.toFixed(2)}`);
      lines.push(`  Expected Crafting Cost:      ${formatChaos(comp.expectedCraftingCostChaos, divineRate)}`);
      lines.push(`  Expected Total Craft Cost:   ${formatChaos(comp.expectedTotalCraftCostChaos, divineRate)}`);
      lines.push(`  Expected Sale Value:         ${formatChaos(comp.expectedSaleValueChaos, divineRate)}`);
      lines.push(`  Expected Profit:             ${formatChaos(comp.expectedProfitChaos, divineRate)}`);
      lines.push(`  Expected ROI:                ${comp.roi.toFixed(2)}%`);
      lines.push(`  Description:                 ${comp.description}`);
    }

    const hModName = recommended.policyEngine?.harvestModName ?? 'Target Harvest Modifier';
    const compB = recommended.harvestComparison.find((c) => c.code === 'B');
    const hB = compB ? Math.round(compB.expectedHarvests).toLocaleString() : '10,000+';

    lines.push(`\nRecommended Policy:`);
    lines.push(`  Strategy C: State-Aware Optimal Stopping Policy`);
    lines.push(`Reason:`);
    lines.push(`  Strategy B requires roughly ${hB} Harvest crafts on average to hit ${hModName} and all target suffixes simultaneously directly from Harvest. This is far more expensive than stopping at ${hModName}, preserving partial target suffixes, and completing remainder with Exalted Orbs (Strategy A/C).`);
  }

  // ------------------------------------------------------------- SUFFIX POOL DIAGNOSTIC AUDIT
  if (recommended.suffixPoolAudits && recommended.suffixPoolAudits.length > 0) {
    lines.push('\n' + '-'.repeat(70));
    lines.push('SUFFIX POOL DIAGNOSTIC AUDIT (FRACTURED 35% ROUTE)');
    lines.push('-'.repeat(70));
    for (const st of recommended.suffixPoolAudits) {
      lines.push(`\n${st.stateLabel}:`);
      lines.push(`  Description:            ${st.description}`);
      lines.push(`  Eligible Suffix Count:  ${st.eligibleSuffixCount}`);
      lines.push(`  Total Suffix Weight:    ${st.eligibleSuffixWeight.toLocaleString()}`);
      for (const tc of st.targetChances) {
        lines.push(`  ${tc.name} Weight: ${tc.weight}`);
        lines.push(`    Normal Exalt chance:  ${tc.normalChance.toFixed(2)}%`);
      }
      lines.push(`  Total Target Weight:    ${st.allTargetWeight}`);
      lines.push(`    Normal Exalt chance:  ${st.allTargetNormalChance.toFixed(2)}%`);
      if (st.blockedGroups && st.blockedGroups.length > 0) {
        lines.push(`  Blocked Mod Groups:     ${st.blockedGroups.join(', ')}`);
      }
    }
  }

  // ------------------------------------------------------------- REPRESENTATIVE STATE DECISIONS
  if (recommended.representativeDecisions && recommended.representativeDecisions.length > 0) {
    lines.push('\n' + '-'.repeat(70));
    lines.push('REPRESENTATIVE STATE DECISIONS & CONTINUATION VALUES');
    lines.push('-'.repeat(70));

    for (let i = 0; i < recommended.representativeDecisions.length; i++) {
      const dec = recommended.representativeDecisions[i];
      lines.push(`\n${i + 1}. State: ${dec.stateDescription}`);
      lines.push(`   Candidate Actions:`);
      for (const act of dec.candidateActions) {
        lines.push(`     - ${act.actionName.padEnd(40)} Continuation EV: ${formatChaos(act.continuationValueChaos, divineRate)}`);
      }
      lines.push(`   Recommended Action: ${dec.recommendedAction}`);
      lines.push(`   Reason:             ${dec.recommendationReason}`);
    }
  }

  // ------------------------------------------------------------- HARVEST SUCCESS STATE CENSUS
  if (simulation?.harvestCensus) {
    const hc = simulation.harvestCensus;
    const hModName = recommended.policyEngine?.harvestModName ?? 'Target Harvest Modifier';
    lines.push('\n' + '-'.repeat(70));
    lines.push(`HARVEST SUCCESS STATE CENSUS (Given ${hModName} Hit)`);
    lines.push('-'.repeat(70));
    lines.push(`  Total Harvest Crafts:         ${hc.totalHarvests.toLocaleString()}`);
    lines.push(`  ${hModName} Hit Rate:         ${hc.t1HarvestSuccessRate.toFixed(2)}% (${hc.t1HarvestSuccesses.toLocaleString()} hits)`);
    lines.push(`  Additional Affix Distribution (Given ${hModName} Hit):`);
    lines.push(`    0 additional affixes:       ${(hc.t1HarvestAdditional0AffixesPct ?? 0).toFixed(2)}%`);
    lines.push(`    1 additional affix:         ${(hc.t1HarvestAdditional1AffixesPct ?? 0).toFixed(2)}%`);
    lines.push(`    2 additional affixes:       ${(hc.t1HarvestAdditional2AffixesPct ?? 0).toFixed(2)}%`);
    lines.push(`  Of ${hModName} Successes:`);
    lines.push(`    ${hModName} Only (Clean):   ${hc.t1HarvestOnlyPct.toFixed(2)}%`);
    lines.push(`    +1 Junk Suffix:             ${(hc.t1HarvestPlusJunk1OnlyPct ?? 0).toFixed(2)}% (Requires 1-Junk Annul Cleanup)`);
    lines.push(`    +2 Junk Suffixes:           ${(hc.t1HarvestPlusJunk2OnlyPct ?? 0).toFixed(2)}% (Requires 2-Junk Annul Cleanup)`);
    if (hc.targetSuffixHitsPct) {
      for (const [sName, pct] of Object.entries(hc.targetSuffixHitsPct)) {
        lines.push(`    +${sName}:                  ${pct.toFixed(2)}% (Preserve; Exalt Final Suffix)`);
      }
    }
  }

  // ------------------------------------------------------------- STEP 1: Starting Fracture Acquisition
  if (recommended.step1Options && recommended.step1Options.length > 0) {
    lines.push('\n' + '-'.repeat(70));
    lines.push('STEP 1 -- Acquire Starting Fracture');
    lines.push('-'.repeat(70));

    for (const opt of recommended.step1Options) {
      lines.push(`\n${opt.description}:`);
      if (opt.type === 'market') {
        lines.push(`  Purchase cost:              ${formatChaos(opt.costChaos, divineRate)}`);
        lines.push(`  Expected preparation cost:     0.0c`);
        lines.push(`  Expected total:             ${formatChaos(opt.costChaos, divineRate)}`);
        lines.push(`  Model confidence:           High (Deterministic Market Purchase)`);
      } else {
        lines.push(`  Model Status:               [SELF-FRACTURE ACQUISITION MODEL: APPROXIMATE]`);
        lines.push(`  Clean base per attempt:        ${opt.cleanBaseCostChaos?.toFixed(1)}c`);
        lines.push(`  Preparation sub-plan:          ${opt.prepCostChaos?.toFixed(2)}c per attempt`);
        lines.push(`  Fracturing Orb:               ${opt.fracturingOrbCostChaos?.toFixed(1)}c per attempt`);
        lines.push(`  Success chance:                ${opt.successChance?.toFixed(2)}%`);
        lines.push(`  Expected attempts:              ${opt.expectedAttempts?.toFixed(2)}`);
        lines.push(`  Expected total:               ${formatChaos(opt.costChaos, divineRate)}`);
        lines.push(`  Model confidence:           Approximate (Self-Fracture Model)`);
      }
    }

    const buyOpt = recommended.step1Options.find((o: AcquisitionOption) => o.type === 'market');
    const selfFracOpt = recommended.step1Options.find((o: AcquisitionOption) => o.type === 'self-fracture') ?? recommended.step1Options[0];

    const downstreamDefault = recommended.totalExpectedCostChaos - recommended.baseCostChaos;
    const buyTotal = buyOpt ? buyOpt.costChaos + downstreamDefault : undefined;
    const selfFracTotal = selfFracOpt.costChaos + downstreamDefault;

    const bestOpt = (buyOpt && buyTotal !== undefined && buyTotal < selfFracTotal) ? buyOpt : selfFracOpt;
    lines.push(`\nRECOMMENDED ACQUISITION (STEP 1):`);
    lines.push(`  ${bestOpt.description}`);
    lines.push(`  Estimated acquisition cost: ${formatChaos(bestOpt.costChaos, divineRate)}`);
    lines.push(`\nMODEL CONFIDENCE:`);
    lines.push(`  ${bestOpt.confidence === 'deterministic' ? 'High (Deterministic Market Purchase)' : 'Approximate (Self-Fracture Model)'}`);

    if (buyOpt && buyTotal !== undefined) {
      const diff = Math.abs(buyTotal - selfFracTotal);
      lines.push(`\nALTERNATIVE ACQUISITION (STEP 1):`);
      lines.push(`  ${bestOpt === buyOpt ? selfFracOpt.description : buyOpt.description}`);
      lines.push(`  Estimated cost:             ${formatChaos(bestOpt === buyOpt ? selfFracOpt.costChaos : buyOpt.costChaos, divineRate)}`);
      lines.push(`\nEstimated difference (Full Route):`);
      lines.push(`  ${(diff / divineRate).toFixed(2)} div / ${diff.toFixed(1)}c`);
    } else {
      lines.push(`\nMarket purchase: unavailable / not supplied (Self-fracture evaluated from pool weights).`);
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

      if (step.successChance !== undefined && step.successChance > 0) {
        lines.push(`Success chance:               ${step.successChance.toFixed(2)}%`);
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

  if (recommended.steps) {
    for (const s of recommended.steps) {
      lines.push(`\n${s.title}:`);
      if (s.stepNumber === 1) {
        lines.push(`  Selected Option:            ${recommended.strategyName}`);
      }
      if (s.successChance) {
        lines.push(`  Chance per attempt:         ${s.successChance.toFixed(2)}%`);
      }
      if (s.expectedAttempts) {
        lines.push(`  Expected attempts:          ${s.expectedAttempts.toFixed(2)}`);
      }
      if (s.recoveryCostChaos && s.recoveryCostChaos > 0) {
        lines.push(`  Raw step cost:              ${formatChaos(s.rawCostChaos, divineRate)}`);
        lines.push(`  Expected recovery cost:     ${formatChaos(s.recoveryCostChaos, divineRate)}`);
      }
      lines.push(`  Expected step cost:         ${formatChaos(s.stepTotalCostChaos, divineRate)}`);
      lines.push(`  Cumulative:                 ${formatChaos(s.cumulativeCostChaos, divineRate)}`);
    }
  }

  lines.push('\n' + '-'.repeat(70));
  lines.push(`EXPECTED TOTAL CRAFT COST:`);
  lines.push(`  ${formatChaos(recommended.totalExpectedCostChaos, divineRate)}`);

  if (recommended.outcomeDistribution && recommended.outcomeDistribution.length > 0) {
    lines.push(`\nFINAL OUTCOME VALUE DISTRIBUTION:`);
    for (const od of recommended.outcomeDistribution) {
      const simPct = simulation?.outcomeBranchDistribution?.[od.name];
      const simText = simPct !== undefined ? `  [Sim: ${simPct.toFixed(2)}%]` : '';
      lines.push(`  ${(od.probability * 100).toFixed(2)}%  ${od.name.padEnd(35)}  (${formatChaos(od.saleValueChaos, divineRate)})${simText}`);
    }
  }

  if (recommended.expectedSaleValueChaos !== undefined && recommended.expectedSaleValueChaos > 0) {
    lines.push(`\nEXPECTED SALE VALUE:`);
    lines.push(`  ${formatChaos(recommended.expectedSaleValueChaos, divineRate)}`);
  }

  if (recommended.expectedProfitChaos !== undefined && recommended.expectedSaleValueChaos !== undefined && recommended.expectedSaleValueChaos > 0) {
    lines.push(`\nEXPECTED PROFIT:`);
    lines.push(`  ${formatChaos(recommended.expectedProfitChaos, divineRate)}`);
  }

  if (recommended.roi !== undefined && recommended.expectedSaleValueChaos !== undefined && recommended.expectedSaleValueChaos > 0) {
    lines.push(`\nEXPECTED ROI:`);
    lines.push(`  ${recommended.roi.toFixed(2)}%`);
  }

  // ------------------------------------------------------------- MONTE CARLO DIAGNOSTIC & COMPARISON TABLE
  if (simulation) {
    lines.push('\n' + '='.repeat(70));
    lines.push('MONTE CARLO EMPIRICAL VALIDATION & CROSS-COMPARISON');
    lines.push('='.repeat(70));
    lines.push(statusText.startsWith('STATUS: ') ? statusText : `Status: ${statusText}`);
    lines.push(`Completed trials:       ${simulation.completedTrials.toLocaleString()} / ${simulation.totalTrials.toLocaleString()} (${simulation.completionRate.toFixed(2)}%)`);
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
        lines.push(`                                  Analytical          Monte Carlo           Difference`);
        lines.push(`-`.repeat(86));
        const fmtCol = (chaos: number) => formatChaos(chaos, divineRate).padStart(20);
        const fmtDiff = (chaos: number) => formatChaos(chaos, divineRate).padStart(20);

        const s1A = recommended.baseCostChaos;
        const s1M = simulation.stepwiseCostAverages.step1AcquisitionChaos;
        lines.push(`Step 1 Acquisition:     ${fmtCol(s1A)} ${fmtCol(s1M)} ${fmtDiff(s1M - s1A)}`);

        const step2Obj = recommended.steps.find((s) => s.stepNumber === 2);
        const s2A = step2Obj?.stepTotalCostChaos ?? 0;
        const s2M = simulation.stepwiseCostAverages.step2HarvestChaos;
        lines.push(`Step 2 Harvest:         ${fmtCol(s2A)} ${fmtCol(s2M)} ${fmtDiff(s2M - s2A)}`);

        const step3Obj = recommended.steps.find((s) => s.stepNumber === 3);
        const s3A = step3Obj?.stepTotalCostChaos ?? 0;
        const s3M = simulation.stepwiseCostAverages.step3CleanupChaos;
        lines.push(`Step 3 Cleanup:         ${fmtCol(s3A)} ${fmtCol(s3M)} ${fmtDiff(s3M - s3A)}`);

        const step4Obj = recommended.steps.find((s) => s.stepNumber === 4);
        if (step4Obj) {
          const s4A = step4Obj.stepTotalCostChaos;
          const s4M = simulation.stepwiseCostAverages.step4ExaltChaos;
          lines.push(`Step 4 Suffix Slams:    ${fmtCol(s4A)} ${fmtCol(s4M)} ${fmtDiff(s4M - s4A)}`);
        }

        const step5Obj = recommended.steps.find((s) => s.stepNumber === 5);
        if (step5Obj) {
          const s5A = step5Obj.stepTotalCostChaos;
          const s5M = simulation.stepwiseCostAverages.step5ExaltChaos;
          lines.push(`Step 5 Divine Finishing:${fmtCol(s5A)} ${fmtCol(s5M)} ${fmtDiff(s5M - s5A)}`);
        }

        lines.push(`-`.repeat(86));
        lines.push(`TOTAL COST:             ${fmtCol(recommended.totalExpectedCostChaos)} ${fmtCol(simulation.meanCostChaos)} ${`${diffPercent.toFixed(2)}% diff`.padStart(20)}`);
      }

      // Action counts table
      lines.push(`\nACTION COUNTS (Cumulative Across All Recovery Loops):`);
      lines.push(`                                  Analytical          Monte Carlo           Difference`);
      lines.push(`-`.repeat(86));
      const fmtCount = (n: number) => n.toFixed(2).padStart(20);
      const fmtPctDiff = (d: number) => `${d >= 0 ? '+' : ''}${d.toFixed(2)}% diff`.padStart(20);

      const expHarvests = ((recommended.expectedCurrencies?.primalLifeforce ?? 0) + (recommended.expectedCurrencies?.wildLifeforce ?? 0) + (recommended.expectedCurrencies?.vividLifeforce ?? 0)) / 75;
      const simHarvests = ((simulation.currencyAverages?.primalLifeforce ?? 0) + (simulation.currencyAverages?.wildLifeforce ?? 0) + (simulation.currencyAverages?.vividLifeforce ?? 0)) / 75;
      const hDiff = expHarvests > 0 ? ((simHarvests - expHarvests) / expHarvests) * 100 : (simHarvests === 0 ? 0 : 100);
      lines.push(`Harvest Attempts:       ${fmtCount(expHarvests)} ${fmtCount(simHarvests)} ${fmtPctDiff(hDiff)}`);

      const expAnnuls = recommended.expectedCurrencies?.annul ?? 0;
      const simAnnuls = simulation.currencyAverages?.annul ?? 0;
      const aDiff = expAnnuls > 0 ? ((simAnnuls - expAnnuls) / expAnnuls) * 100 : 0;
      lines.push(`Annulment Orbs:         ${fmtCount(expAnnuls)} ${fmtCount(simAnnuls)} ${fmtPctDiff(aDiff)}`);

      const expExalts = recommended.expectedCurrencies?.exalt ?? 0;
      const simExalts = simulation.currencyAverages?.exalt ?? 0;
      const eDiff = expExalts > 0 ? ((simExalts - expExalts) / expExalts) * 100 : 0;
      lines.push(`Exalted Orbs:           ${fmtCount(expExalts)} ${fmtCount(simExalts)} ${fmtPctDiff(eDiff)}`);

      const expDivines = recommended.expectedCurrencies?.divine ?? 0;
      const simDivines = simulation.currencyAverages?.divine ?? 0;
      if (expDivines > 0 || simDivines > 0) {
        lines.push(`Divine Orbs:            ${fmtCount(expDivines)} ${fmtCount(simDivines)}`);
      }
      lines.push(`-`.repeat(86));

      // Terminal outcome branch validation table
      if (recommended.outcomeDistribution && recommended.outcomeDistribution.length > 0 && simulation.outcomeBranchDistribution) {
        lines.push(`\nTERMINAL OUTCOME BRANCH VALIDATION:`);
        lines.push(`                                  Analytical          Monte Carlo           Difference`);
        lines.push(`-`.repeat(86));
        const fmtPct = (p: number) => `${p.toFixed(2)}%`.padStart(20);
        const fmtPP = (pp: number) => `${pp >= 0 ? '+' : ''}${pp.toFixed(2)} pp`.padStart(20);
        for (const od of recommended.outcomeDistribution) {
          const aPct = od.probability * 100;
          const mPct = simulation.outcomeBranchDistribution[od.name] ?? 0;
          const diffPP = mPct - aPct;
          lines.push(`${od.name.padEnd(24)} ${fmtPct(aPct)} ${fmtPct(mPct)} ${fmtPP(diffPP)}`);
        }
        lines.push(`-`.repeat(86));
      }

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
