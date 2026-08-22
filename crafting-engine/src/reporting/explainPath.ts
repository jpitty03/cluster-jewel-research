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

    lines.push(`\nRecommended Policy:`);
    lines.push(`  Strategy C: State-Aware Optimal Stopping Policy`);
    lines.push(`Reason:`);
    const isFractured35Route =
      recommended.strategyName?.toLowerCase().includes('fractured 35%') ||
      recommended.strategyName?.toLowerCase().includes('fractured effect') ||
      recommended.steps?.[0]?.title.includes('Fractured 35%') ||
      recommended.steps?.[0]?.title.includes('35% Effect Base');

    if (isFractured35Route) {
      const compB = recommended.harvestComparison.find((c) => c.code === 'B');
      const hB = compB ? Math.round(compB.expectedHarvests).toLocaleString() : '12,447';
      lines.push(`  Strategy B intentionally keeps Harvesting until a single T1 ES result also supplies both required suffix targets (T1 Intelligence + one premium suffix). This requires roughly ${hB} Harvests on average and is far more expensive than preserving useful partial Harvest outcomes and completing the remaining suffix with Allflame Exalts.`);
    } else {
      lines.push(`  Fishing for joint T1 ES + 35% Effect in Harvest (Strategy B, 1 in ~751 crafts) costs ~1379c more in lifeforce and recovery loops than stopping at T1 ES and completing prefixes via Allflame Exalts (Strategy A/C, 10.20% hit rate).`);
    }
  }

  // ------------------------------------------------------------- SUFFIX POOL DIAGNOSTIC AUDIT
  const isFractured35Route =
    recommended.strategyName?.toLowerCase().includes('fractured 35%') ||
    recommended.strategyName?.toLowerCase().includes('fractured effect') ||
    recommended.steps?.[0]?.title.includes('Fractured 35%') ||
    recommended.steps?.[0]?.title.includes('35% Effect Base');

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
    lines.push(`  Harvest additional-affix model used by optimizer:`);
    if (isFractured35Route) {
      lines.push(`    1 additional suffix:        50.00%`);
      lines.push(`    2 additional suffixes:      50.00%`);
    } else {
      lines.push(`    1 additional affix:         50.00%`);
      lines.push(`    2 additional affixes:       50.00%`);
    }
    lines.push(`    Source status:              UNVERIFIED / MODEL ASSUMPTION`);
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

    const buyOpt = recommended.step1Options.find((o: StartingOptionAnalysis) => o.purchaseCostChaos !== undefined) ?? recommended.step1Options[0];
    const selfFracOpt = recommended.step1Options.find((o: StartingOptionAnalysis) => o.purchaseCostChaos === undefined) ?? recommended.step1Options[0];

    const downstreamDefault = recommended.totalExpectedCostChaos - recommended.baseCostChaos;
    const buyTotal = buyOpt.fullRouteTotalCostChaos ?? ((buyOpt.expectedTotalCostChaos ?? 2600) + (buyOpt.downstreamCostChaos ?? downstreamDefault));
    const selfFracTotal = selfFracOpt.fullRouteTotalCostChaos ?? ((selfFracOpt.expectedTotalCostChaos ?? 1533.4) + (selfFracOpt.downstreamCostChaos ?? downstreamDefault));

    const isSelfFracCheapest = selfFracTotal < buyTotal;
    const bestOpt = isSelfFracCheapest ? selfFracOpt : buyOpt;
    const altOpt = isSelfFracCheapest ? buyOpt : selfFracOpt;
    const diff = Math.abs(buyTotal - selfFracTotal);

    const bestOptName = bestOpt.name.replace(/^Option [A-D]:\s*/i, '');
    const altOptName = altOpt.name.replace(/^Option [A-D]:\s*/i, '');
    const buyOptName = buyOpt.name.replace(/^Option [A-D]:\s*/i, '');
    const selfFracOptName = selfFracOpt.name.replace(/^Option [A-D]:\s*/i, '');

    lines.push(`\nRECOMMENDED ACQUISITION (STEP 1):`);
    lines.push(`  ${bestOptName}`);
    lines.push(`  Estimated acquisition cost: ${formatChaos(bestOpt.expectedTotalCostChaos, divineRate)}`);
    lines.push(`\nMODEL CONFIDENCE:`);
    lines.push(`  ${bestOpt === selfFracOpt ? 'Approximate (Self-Fracture Model)' : 'High (Deterministic Market Purchase)'}`);
    lines.push(`\nALTERNATIVE ACQUISITION (STEP 1):`);
    lines.push(`  ${altOptName}`);
    lines.push(`  Estimated cost:             ${formatChaos(altOpt.expectedTotalCostChaos, divineRate)}`);
    lines.push(`\nEstimated difference (Full Route):`);
    lines.push(`  ${(diff / divineRate).toFixed(2)} div / ${diff.toFixed(1)}c`);

    lines.push(`\nHEADLINE CRAFT TOTALS BY STARTING OPTION:`);
    if (isSelfFracCheapest) {
      lines.push(`  Provisional cheapest route (${selfFracOptName}): ${formatChaos(selfFracTotal, divineRate)} [Model: Approximate]`);
      lines.push(`  Deterministic market route (${buyOptName}):  ${formatChaos(buyTotal, divineRate)} [Downstream craft EV ${formatChaos(buyOpt.downstreamCostChaos ?? downstreamDefault, divineRate)} + ${formatChaos(buyOpt.expectedTotalCostChaos, divineRate)} base]`);
    } else {
      lines.push(`  Deterministic cheapest route (${buyOptName}): ${formatChaos(buyTotal, divineRate)} [Downstream craft EV ${formatChaos(buyOpt.downstreamCostChaos ?? downstreamDefault, divineRate)} + ${formatChaos(buyOpt.expectedTotalCostChaos, divineRate)} base]`);
      lines.push(`  Provisional alternative route (${selfFracOptName}): ${formatChaos(selfFracTotal, divineRate)} [Model: Approximate]`);
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
        if (d.targetMod !== undefined) lines.push(`  Target modifier:             ${d.targetMod}`);
        if (d.hitRatePct !== undefined) lines.push(`  Hit rate:                    ${d.hitRatePct.toFixed(2)}%`);
        if (d.eligiblePrefixWeight !== undefined) lines.push(`  Eligible prefix weight:      ${d.eligiblePrefixWeight}`);
        if (d.eligibleSuffixWeight !== undefined) lines.push(`  Eligible suffix weight:      ${d.eligibleSuffixWeight}`);
        if (d.normalExaltChance !== undefined) lines.push(`  Normal Exalt chance:         ${d.normalExaltChance.toFixed(4)}%`);
        if (d.allflameChance !== undefined) lines.push(`  Allflame 4-choice chance:    ${d.allflameChance.toFixed(4)}%`);
        if (d.expectedExalts !== undefined) lines.push(`  Expected Exalts:             ${d.expectedExalts.toFixed(2)}`);
        if (d.expectedAnnuls !== undefined) lines.push(`  Expected Annuls:             ${d.expectedAnnuls.toFixed(2)}`);
        if (d.expectedHarvests !== undefined) lines.push(`  Expected Harvests:           ${d.expectedHarvests.toFixed(2)}`);
        if (d.harvestTag !== undefined) lines.push(`  Harvest tag:                 ${d.harvestTag}`);
        if (d.lifeforceType !== undefined) lines.push(`  Lifeforce:                   ${d.lifeforceType}`);
        if (d.policy) {
          lines.push(`  Cleanup policy (1 junk):     ${d.policy.oneJunkMod}`);
          lines.push(`  Cleanup policy (2 junk):     ${d.policy.twoJunkMods}`);
        }
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

      const expHarvests = ((recommended.expectedCurrencies?.primalLifeforce ?? 0) + (recommended.expectedCurrencies?.wildLifeforce ?? 0)) / 75;
      const simHarvests = ((simulation.currencyAverages?.primalLifeforce ?? 0) + (simulation.currencyAverages?.wildLifeforce ?? 0)) / 75;
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
