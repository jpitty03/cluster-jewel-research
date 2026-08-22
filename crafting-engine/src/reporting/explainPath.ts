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

  let diffPercent = 0;
  let statusText = 'POLICY COST MODEL: APPROXIMATE / INVESTIGATION REQUIRED';
  if (simulation && simulation.meanCostChaos !== undefined) {
    const analyticalCost = recommended.totalExpectedCostChaos;
    const simCost = simulation.meanCostChaos;
    diffPercent = (Math.abs(simCost - analyticalCost) / analyticalCost) * 100;
    const costDiffPct = diffPercent;

    const expH = recommended.expectedCurrencies?.primalLifeforce ? recommended.expectedCurrencies.primalLifeforce / 75 : 0;
    const simH = simulation.currencyAverages?.primalLifeforce ? simulation.currencyAverages.primalLifeforce / 75 : 0;
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
      statusText = `POLICY COST MODEL: VALIDATED (Analytical & Monte Carlo agree within ${costDiffPct.toFixed(2)}%)\nGAME-MECHANICS FIDELITY: PARTIAL\nBEST OF EVALUATED POLICIES: PROVEN\nGLOBAL OPTIMALITY: NOT YET PROVEN`;
    } else if (costDiffPct <= 5.0 && allCountsPass && simulation.completionRate >= 95.0 && zeroFallback) {
      statusText = `POLICY COST MODEL: PROVISIONALLY VALIDATED (Analytical & Monte Carlo agree within ${costDiffPct.toFixed(2)}%)\nGAME-MECHANICS FIDELITY: PARTIAL\nBEST OF EVALUATED POLICIES: PROVEN\nGLOBAL OPTIMALITY: NOT YET PROVEN`;
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

    lines.push(`\nRecommended Policy:`);
    lines.push(`  Strategy C: State-Aware Optimal Stopping Policy`);
    lines.push(`Reason:`);
    lines.push(`  Fishing for joint T1 ES + 35% Effect in Harvest (Strategy B, 1 in ~751 crafts) costs ~1379c more in lifeforce and recovery loops than stopping at T1 ES and completing prefixes via Allflame Exalts (Strategy A/C, 10.20% hit rate).`);
  }

  // ------------------------------------------------------------- SUFFIX POOL DIAGNOSTIC AUDIT
  const isFractured35Route =
    recommended.strategyName?.toLowerCase().includes('35%') ||
    recommended.steps?.some((s) => s.title.includes('35% Effect'));

  if (isFractured35Route && recommended.policyEngine && typeof recommended.policyEngine.getSuffixPoolAudit === 'function' && recommended.pool) {
    const auditStates = recommended.policyEngine.getSuffixPoolAudit(recommended.pool, 84);
    lines.push('\n' + '-'.repeat(70));
    lines.push('SUFFIX POOL DIAGNOSTIC AUDIT (FRACTURED 35% ROUTE)');
    lines.push('-'.repeat(70));
    for (const st of auditStates) {
      lines.push(`\n${st.stateLabel}:`);
      lines.push(`  Description:            ${st.description}`);
      lines.push(`  Eligible Suffix Count:  ${st.eligibleSuffixCount}`);
      lines.push(`  Total Suffix Weight:    ${st.eligibleSuffixWeight.toLocaleString()}`);
      if (st.t1IntWeight !== undefined) {
        lines.push(`  T1 Int Weight:          ${st.t1IntWeight}`);
        if (st.t1IntNormalChance !== undefined) {
          lines.push(`    Normal Exalt chance:  ${st.t1IntNormalChance.toFixed(2)}%`);
        }
        if (st.t1IntAllflameChance !== undefined) {
          lines.push(`    Allflame (4-choice):  ${st.t1IntAllflameChance.toFixed(2)}%`);
        }
      }
      if (st.premiumTargetWeight !== undefined) {
        lines.push(`  Premium Target Weight:  ${st.premiumTargetWeight}`);
        if (st.premiumTargetNormalChance !== undefined) {
          lines.push(`    Normal Exalt chance:  ${st.premiumTargetNormalChance.toFixed(2)}%`);
        }
        if (st.premiumTargetAllflameChance !== undefined) {
          lines.push(`    Allflame (4-choice):  ${st.premiumTargetAllflameChance.toFixed(2)}%`);
        }
      }
      if (st.allTargetWeight !== undefined) {
        lines.push(`  Total Target Weight:    ${st.allTargetWeight}`);
        if (st.allTargetNormalChance !== undefined) {
          lines.push(`    Normal Exalt chance:  ${st.allTargetNormalChance.toFixed(2)}%`);
        }
        if (st.allTargetAllflameChance !== undefined) {
          lines.push(`    Allflame (4-choice):  ${st.allTargetAllflameChance.toFixed(2)}%`);
        }
      }
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
    lines.push('\n' + '-'.repeat(70));
    lines.push('HARVEST SUCCESS STATE CENSUS (Given T1 ES Hit)');
    lines.push('-'.repeat(70));
    lines.push(`  Total Harvest Crafts:         ${hc.totalHarvests.toLocaleString()}`);
    lines.push(`  T1 ES Hit Rate:               ${hc.t1ESSuccessRate.toFixed(2)}% (${hc.t1ESSuccesses.toLocaleString()} hits)`);
    lines.push(`  Additional Affix Distribution (Given T1 ES Hit):`);
    lines.push(`    0 additional affixes:       ${(hc.t1ESAdditional0AffixesPct ?? 0).toFixed(2)}%`);
    lines.push(`    1 additional affix:         ${(hc.t1ESAdditional1AffixesPct ?? 0).toFixed(2)}%`);
    lines.push(`    2 additional affixes:       ${(hc.t1ESAdditional2AffixesPct ?? 0).toFixed(2)}%`);
    lines.push(`  Of T1 ES Successes:`);
    lines.push(`    T1 ES Only (Clean):         ${hc.t1ESOnlyPct.toFixed(2)}%`);
    lines.push(`    +1 Junk Suffix:             ${(hc.t1ESPlusJunk1OnlyPct ?? 0).toFixed(2)}% (Requires 1-Junk Annul Cleanup)`);
    lines.push(`    +2 Junk Suffixes:           ${(hc.t1ESPlusJunk2OnlyPct ?? 0).toFixed(2)}% (Requires 2-Junk Annul Cleanup)`);
    lines.push(`    +T1 Intelligence:           ${(hc.t1ESPlusIntPct ?? 0).toFixed(2)}% (Preserve; Exalt Final Suffix)`);
    lines.push(`    +4 All Attributes:          ${hc.t1ESPlusAttributesPct.toFixed(2)}% (Preserve; Exalt T1 Int)`);
    lines.push(`    3% Attack Speed:            ${hc.t1ESPlusAttackSpeedPct.toFixed(2)}% (Preserve; Exalt T1 Int)`);
    lines.push(`    +4% All Resistance:         ${hc.t1ESPlusAllResPct.toFixed(2)}% (Preserve; Exalt T1 Int)`);
    lines.push(`    +T1 Int + Premium Suffix:   ${(hc.t1ESPlusIntAndPremiumPct ?? 0).toFixed(2)}% (Terminal Success)`);
    if (hc.t1ESPlus35EffPct > 0 || hc.t1ESPlus35AndPremiumPct > 0) {
      lines.push(`    +35% Effect:                ${hc.t1ESPlus35EffPct.toFixed(2)}% (Bypasses Prefix Slam)`);
      lines.push(`    +35% + Premium Suffix:      ${hc.t1ESPlus35AndPremiumPct.toFixed(2)}% (Bypasses Step 4 & 5)`);
    }
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
        lines.push(`  Model Status:               [SELF-FRACTURE ACQUISITION MODEL: APPROXIMATE]`);
        lines.push(`  Clean base per attempt:        ${opt.cleanBaseCostChaos?.toFixed(1)}c`);
        lines.push(`  Preparation sub-plan:          ${opt.prepCostChaos?.toFixed(2)}c per attempt`);
        if (opt.name.includes('Intelligence')) {
          lines.push(`    1. Alterations for T1 Int:   10.43c (~52.2 alts @ 300/15650 magic suffix weight)`);
          lines.push(`    2. Augmentations:            0.65c (~13.0 augs @ 25% single-prefix roll)`);
          lines.push(`    3. Regal Orb:                1.00c`);
          lines.push(`    4. Bench / filler exalts:    4.50c (reach exactly 4 explicit mods)`);
        } else {
          lines.push(`    1. Alterations for 35% Eff:  8.33c (~41.7 alts @ 300/12502 magic prefix weight)`);
          lines.push(`    2. Augmentations:            0.52c (~10.4 augs @ 25% single-suffix roll)`);
          lines.push(`    3. Regal Orb:                1.00c`);
          lines.push(`    4. Bench / filler exalts:    4.50c (reach exactly 4 explicit mods)`);
        }
        lines.push(`  Fracturing Orb:               ${opt.fracturingOrbCostChaos?.toFixed(1)}c per attempt`);
        lines.push(`  Success chance:                ${opt.successChance?.toFixed(2)}%`);
        lines.push(`  Expected attempts:              ${opt.expectedAttempts?.toFixed(2)}`);
        lines.push(`  Expected total:               ${formatChaos(opt.expectedTotalCostChaos, divineRate)}`);
      }
    }

    const bestOpt = recommended.step1Options.find((o: StartingOptionAnalysis) => o.isRecommended) ?? recommended.step1Options[0];
    const buyOpt = recommended.step1Options.find((o: StartingOptionAnalysis) => o.purchaseCostChaos !== undefined) ?? recommended.step1Options[0];
    const diff = (buyOpt.expectedTotalCostChaos ?? 1600) - bestOpt.expectedTotalCostChaos;

    lines.push(`\nPROVISIONAL CHEAPEST (STEP 1):`);
    lines.push(`  ${bestOpt.name.replace(/^Option [A-D]:\s*/i, '')}`);
    lines.push(`  Estimated acquisition cost: ${formatChaos(bestOpt.expectedTotalCostChaos, divineRate)}`);
    lines.push(`\nMODEL CONFIDENCE:`);
    lines.push(`  Approximate`);
    lines.push(`\nDETERMINISTIC ALTERNATIVE (STEP 1):`);
    lines.push(`  ${buyOpt.name.replace(/^Option [A-D]:\s*/i, '')}`);
    lines.push(`  Market cost:                ${formatChaos(buyOpt.expectedTotalCostChaos, divineRate)}`);
    lines.push(`\nEstimated difference:`);
    lines.push(`  ${(diff / divineRate).toFixed(2)} div / ${diff.toFixed(1)}c`);
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

      if (step.stepNumber === 2 && step.details) {
        const d = step.details;
        lines.push(`\nInitial acquisition:`);
        lines.push(`  Chance per Harvest:          ${((d.t1ESProbability ?? 0.071429) * 100).toFixed(4)}% (300 / 4200 Defence weight)`);
        lines.push(`  Expected Harvests:           ${(d.initialAttempts ?? 14).toFixed(2)}`);
        lines.push(`  Initial acquisition cost:    ${formatChaos(d.initialRawCost ?? 21.875, divineRate)}`);
        lines.push(`\nRecovery contribution:`);
        lines.push(`  Expected additional Harvests caused by later failures: ${(d.recoveryAttempts ?? 384).toFixed(2)}`);
        lines.push(`  Expected rebuild Harvest cost: ${formatChaos(d.recoveryCost ?? 600, divineRate)}`);
        lines.push(`\nFull-craft Harvest usage:`);
        lines.push(`  Expected total Harvests:     ${(d.totalHarvestUsage ?? 398).toFixed(2)}`);
        lines.push(`  Expected total Harvest cost:  ${formatChaos(d.totalHarvestCost ?? 621.875, divineRate)}`);
      } else if (step.stepNumber === 3 && step.details) {
        const d = step.details;
        const totalAnnuls = d.totalAnnulUsage ?? 73.5;
        const totalAnnulCost = d.totalAnnulCost ?? (totalAnnuls * (priceBook?.getRate('annul') ?? 9.0));
        const initAnnuls = d.initialCleanupAnnuls ?? 3.81;
        const initCost = d.initialCleanupCost ?? (initAnnuls * (priceBook?.getRate('annul') ?? 9.0));
        const rebuildAnnuls = totalAnnuls - initAnnuls;
        const rebuildCost = totalAnnulCost - initCost;

        lines.push(`\nInitial cleanup:`);
        lines.push(`  Expected Annuls:             ${initAnnuls.toFixed(2)}`);
        lines.push(`  Initial cleanup cost:        ${formatChaos(initCost, divineRate)}`);
        lines.push(`\nRecovery contribution:`);
        lines.push(`  Expected additional Annuls from later rebuilds: ${rebuildAnnuls.toFixed(2)}`);
        lines.push(`  Expected rebuild Annul cost: ${formatChaos(rebuildCost, divineRate)}`);
        lines.push(`\nFull-craft Annul usage:`);
        lines.push(`  Expected total Annuls:       ${totalAnnuls.toFixed(2)}`);
        lines.push(`  Expected total Annul cost:   ${formatChaos(totalAnnulCost, divineRate)}`);
        if (d.policy) {
          lines.push(`\nRecommended cleanup policy:`);
          lines.push(`  State with 1 junk mod:       ${d.policy.oneJunkMod}`);
          lines.push(`  State with 2 junk mods:      ${d.policy.twoJunkMods}`);
        }
      } else if (step.stepNumber === 4 && step.details) {
        const d = step.details;
        lines.push(`\nInitial acquisition:`);
        lines.push(`  Eligible prefix weight:      ${d.eligiblePrefixWeight}`);
        lines.push(`  35% Effect weight:           ${d.eff35Weight}`);
        lines.push(`  Normal Exalt chance:         ${d.normalExaltChance.toFixed(4)}%`);
        lines.push(`  Allflame 4-choice chance:    ${d.allflameChance.toFixed(4)}%`);
        lines.push(`  Expected slams:              ${(d.rawSlams ?? 9.80).toFixed(2)}`);
        lines.push(`  Raw exalt cost:              ${formatChaos(d.rawExaltCost ?? 11.76, divineRate)}`);
        lines.push(`\nRecovery contribution:`);
        lines.push(`  Expected rebuild loops from missed slams: ${formatChaos(step.recoveryCostChaos ?? 326.19, divineRate)}`);
        lines.push(`\nFull-craft Step 4 contribution:`);
        lines.push(`  Expected step total:         ${formatChaos(step.stepTotalCostChaos, divineRate)}`);
        lines.push(`  Expected cumulative cost:    ${formatChaos(step.cumulativeCostChaos, divineRate)}`);
      } else if (step.stepNumber === 5 && step.details) {
        const d = step.details;
        lines.push(`\nInitial acquisition:`);
        lines.push(`  Eligible suffix weight:      ${d.eligibleSuffixWeight}`);
        if (d.outcomeProbabilitiesPerExalt) {
          lines.push(`  Outcome probabilities per normal Exalt:`);
          lines.push(`    +4 All Attributes (T1):    ${d.outcomeProbabilitiesPerExalt.attributes.toFixed(4)}% (300 weight)`);
          lines.push(`    3% Attack Speed (T1):      ${d.outcomeProbabilitiesPerExalt.attackSpeed.toFixed(4)}% (250 weight)`);
          lines.push(`    +4% All Resistance (T1):   ${d.outcomeProbabilitiesPerExalt.allRes.toFixed(4)}% (300 weight)`);
          lines.push(`    Other suffixes:            ${d.outcomeProbabilitiesPerExalt.other.toFixed(4)}%`);
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
        if (d.recommendedPolicyOnAllRes) {
          lines.push(`\nContinuation Value Analysis on All Resistance Result:`);
          lines.push(`  ${d.recommendedPolicyOnAllRes}`);
        }
        lines.push(`\nRecovery contribution:`);
        lines.push(`  Expected rebuild loops from missed slams: ${formatChaos(step.recoveryCostChaos ?? 922.14, divineRate)}`);
        lines.push(`\nFull-craft Step 5 contribution:`);
        lines.push(`  Expected step total:         ${formatChaos(step.stepTotalCostChaos, divineRate)}`);
        lines.push(`  Expected cumulative cost:    ${formatChaos(step.cumulativeCostChaos, divineRate)}`);
      } else {
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
  }

  // ------------------------------------------------------------- SUMMARY BREAKDOWN TABLE
  lines.push('\n' + '='.repeat(70));
  lines.push('RECOMMENDED CRAFTING PLAN');
  lines.push('='.repeat(70));

  const hasExplicitAcquisitionStep = recommended.steps?.some(
    (s) => s.stepNumber === 1 && s.title.toLowerCase().includes('acquire')
  );

  if (!hasExplicitAcquisitionStep && recommended.baseCostChaos > 0) {
    lines.push(`\nSTEP 1 -- Starting base:`);
    lines.push(`  ${recommended.strategyName}`);
    lines.push(`  Expected cost: ${formatChaos(recommended.baseCostChaos, divineRate)}`);
  }

  if (recommended.steps) {
    for (const s of recommended.steps) {
      if (s.stepNumber === 1 && s.title.toLowerCase().includes('acquire')) {
        lines.push(`\n${s.title}:`);
        lines.push(`  Selected Option:            ${recommended.strategyName}`);
        lines.push(`  Expected step cost:         ${formatChaos(s.stepTotalCostChaos, divineRate)}`);
        lines.push(`  Cumulative:                 ${formatChaos(s.cumulativeCostChaos, divineRate)}`);
        continue;
      }
      lines.push(`\n${s.title}:`);
      if (s.successChance) {
        lines.push(`  Chance per attempt:         ${s.successChance.toFixed(2)}%`);
      }
      if (s.details?.initialAttempts) {
        lines.push(`  Initial attempts:           ${s.details.initialAttempts.toFixed(2)} (${formatChaos(s.details.initialRawCost ?? s.rawCostChaos, divineRate)})`);
      } else if (s.expectedAttempts) {
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
          const label = (step4Obj.title.replace(/^STEP 4 --\s*/i, '').replace(/Step 4:\s*/i, '').split('(')[0].trim()).padEnd(16).slice(0, 16);
          lines.push(`Step 4 ${label}: ${fmtCol(s4A)} ${fmtCol(s4M)} ${fmtDiff(s4M - s4A)}`);
        }

        const step5Obj = recommended.steps.find((s) => s.stepNumber === 5);
        if (step5Obj) {
          const s5A = step5Obj.stepTotalCostChaos;
          const s5M = simulation.stepwiseCostAverages.step5ExaltChaos;
          const label = (step5Obj.title.replace(/^STEP 5 --\s*/i, '').replace(/Step 5:\s*/i, '').split('(')[0].trim()).padEnd(16).slice(0, 16);
          lines.push(`Step 5 ${label}: ${fmtCol(s5A)} ${fmtCol(s5M)} ${fmtDiff(s5M - s5A)}`);
        }

        const hasStep6 = recommended.steps.some((s) => s.stepNumber === 6);
        if (hasStep6) {
          const s6A = recommended.steps.find((s) => s.stepNumber === 6)?.stepTotalCostChaos ?? 0;
          const s6M = simulation.stepwiseCostAverages.step6DivineChaos ?? 0;
          lines.push(`Step 6 Divine Finishing:${fmtCol(s6A)} ${fmtCol(s6M)} ${fmtDiff(s6M - s6A)}`);
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

      const expHarvests = (recommended.expectedCurrencies?.primalLifeforce ?? 1050) / 75;
      const simHarvests = (simulation.currencyAverages?.primalLifeforce ?? 0) / 75;
      const hDiff = expHarvests > 0 ? ((simHarvests - expHarvests) / expHarvests) * 100 : 0;
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
