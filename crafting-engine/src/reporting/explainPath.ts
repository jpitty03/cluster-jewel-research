import { formatChaos } from './formatCosts.ts';
import type { StartingStrategyResult } from '../solver/evaluator.ts';
import type { AcquisitionOption } from '../solver/expectedCost.ts';
import type { PriceBook } from '../domain/PriceBook.ts';
import type { SimulationResult } from '../probability/monteCarlo.ts';
import type { ItemState } from '../domain/ItemState.ts';

export function formatModDisplayName(mod: any): string {
  if (!mod) return 'Unknown Mod';
  const name: string = typeof mod === 'string' ? mod : mod.name;
  const group: string | undefined = typeof mod === 'object' ? mod.modGroup : undefined;
  const tier: number | undefined = typeof mod === 'object' ? mod.tier : undefined;

  // Generic Affliction Jewel modifier resolution
  if (group === 'AfflictionJewelSmallPassivesHaveIncreasedEffect' || name === 'Powerful' || name.includes('35% increased Effect')) {
    const pct = tier === 1 || name === 'Powerful' || name.includes('35%') ? '35%' : (tier === 2 ? '25%' : '20%');
    const affixName = name === 'Powerful' ? 'Powerful' : (typeof mod === 'object' && mod.name ? mod.name : 'Powerful');
    return `${pct} Increased Effect [${affixName}]`;
  }
  if (group === 'AfflictionJewelSmallPassivesGrantES' || name === 'Glowing' || name.includes('Maximum Energy Shield')) {
    const tNum = tier ?? (name === 'Glowing' ? 1 : 1);
    const affixName = name === 'Glowing' ? 'Glowing' : (typeof mod === 'object' && mod.name ? mod.name : 'Glowing');
    return `T${tNum} Maximum Energy Shield [${affixName}]`;
  }
  if (group === 'AfflictionJewelSmallPassivesGrantLife' || name === 'Sanguine' || name.includes('Maximum Life')) {
    const tNum = tier ?? (name === 'Sanguine' ? 1 : 1);
    const affixName = name === 'Sanguine' ? 'Sanguine' : (typeof mod === 'object' && mod.name ? mod.name : 'Sanguine');
    return `T${tNum} Maximum Life [${affixName}]`;
  }
  if (group === 'AfflictionJewelSmallPassivesGrantInt' || name === 'of the Prodigy' || name.includes('Intelligence')) {
    const tNum = tier ?? (name === 'of the Prodigy' ? 1 : 1);
    const affixName = name === 'of the Prodigy' ? 'of the Prodigy' : (typeof mod === 'object' && mod.name ? mod.name : 'of the Prodigy');
    return `T${tNum} Intelligence [${affixName}]`;
  }
  if (group === 'AfflictionJewelSmallPassivesGrantAttributes' || name === 'of the Meteor' || name.includes('All Attributes')) {
    const val = tier === 1 || name === 'of the Meteor' ? '+4' : (tier === 2 ? '+3' : '+2');
    const affixName = name === 'of the Meteor' ? 'of the Meteor' : (typeof mod === 'object' && mod.name ? mod.name : 'of the Meteor');
    return `${val} to all Attributes [${affixName}]`;
  }
  if (group === 'AfflictionJewelSmallPassivesGrantChaosRes' || name === 'of Eviction' || name.includes('Chaos Resistance')) {
    const val = tier === 1 || name === 'of Eviction' ? '+5%' : (tier === 2 ? '+4%' : '+3%');
    const affixName = name === 'of Eviction' ? 'of Eviction' : (typeof mod === 'object' && mod.name ? mod.name : 'of Eviction');
    return `${val} to Chaos Resistance [${affixName}]`;
  }
  if (group === 'AfflictionJewelSmallPassivesGrantElementalRes' || name === 'of the Kaleidoscope' || name.includes('All Elemental Resistance')) {
    const val = tier === 1 || name === 'of the Kaleidoscope' ? '+4%' : (tier === 2 ? '+3%' : '+2%');
    const affixName = name === 'of the Kaleidoscope' ? 'of the Kaleidoscope' : (typeof mod === 'object' && mod.name ? mod.name : 'of the Kaleidoscope');
    return `${val} to all Elemental Resistance [${affixName}]`;
  }
  if (group?.includes('Attack Speed') || name.includes('Attack Speed')) {
    const val = tier === 1 || name.includes('3%') ? '3%' : (tier === 2 || name.includes('2%') ? '2%' : '1%');
    const affixName = typeof mod === 'object' && mod.name ? mod.name : `T${tier ?? 1}`;
    return `${val} increased Attack Speed [${affixName}]`;
  }

  // Generic fallback with tier and bracketed name
  const tierSuffix = tier ? ` (t${tier})` : '';
  return `${name}${tierSuffix}`;
}

export function getStartingFractureBaseLabel(state?: ItemState): string {
  if (!state) return 'Clean Base';
  const fracP = state.prefixes.find((p) => p.isFractured);
  const fracS = state.suffixes.find((s) => s.isFractured);
  const frac = fracP ?? fracS;
  if (!frac) return 'Clean Base';
  return formatModDisplayName(frac);
}

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
  const allStartingRoutes = [recommended, ...alternates];
  const startBaseLabel = getStartingFractureBaseLabel(recommended.state);
  const matchingBaseStrategies = allStartingRoutes.filter(
    (s) => getStartingFractureBaseLabel(s.state) === startBaseLabel
  );

  const selfFracStrat = matchingBaseStrategies.find((s) => s.acquisition?.type === 'self-fracture');
  const marketStrat = matchingBaseStrategies.find((s) => s.acquisition?.type === 'market');

  lines.push('\n' + '-'.repeat(70));
  lines.push('STEP 1 -- Acquire Starting Fracture');
  lines.push('-'.repeat(70));
  lines.push(`Target Starting Base: ${startBaseLabel}`);

  if (selfFracStrat) {
    const bd = selfFracStrat.acquisition?.breakdown ?? selfFracStrat.step1Options?.find((o) => o.type === 'self-fracture')?.breakdown;
    lines.push(`\nSelf-Fracture Route (${startBaseLabel}):`);
    lines.push(`  Model Status:               [SELF-FRACTURE ACQUISITION MODEL: APPROXIMATE]`);
    if (bd) {
      lines.push(`  Clean base per attempt:        ${bd.cleanBaseCostChaos.toFixed(1)}c`);
      lines.push(`  Preparation sub-plan:          ${bd.prepCostChaos.toFixed(2)}c per attempt`);
      lines.push(`  Fracturing Orb:               ${bd.fracturingOrbCostChaos.toFixed(1)}c per attempt`);
      lines.push(`  Success chance:                ${bd.successChance.toFixed(2)}%`);
      lines.push(`  Expected attempts:              ${bd.expectedAttempts.toFixed(2)}`);
    }
    lines.push(`  Expected total acquisition:   ${formatChaos(selfFracStrat.baseCostChaos, divineRate)}`);
    lines.push(`  Model confidence:           Approximate (Self-Fracture Model)`);
  }

  if (marketStrat) {
    lines.push(`\nDirect Market Purchase Route (${startBaseLabel}):`);
    lines.push(`  Purchase cost:              ${formatChaos(marketStrat.baseCostChaos, divineRate)}`);
    lines.push(`  Expected preparation cost:     0.0c`);
    lines.push(`  Expected total acquisition:   ${formatChaos(marketStrat.baseCostChaos, divineRate)}`);
    lines.push(`  Model confidence:           High (Deterministic Market Purchase)`);
  }

  const downstreamEv = recommended.expectedCraftingCostChaos;
  const selfFracTotal = selfFracStrat ? selfFracStrat.totalExpectedCostChaos : undefined;
  const marketTotal = marketStrat ? marketStrat.totalExpectedCostChaos : undefined;

  lines.push(`\nFULL-ROUTE ACQUISITION EVALUATION (${startBaseLabel}):`);
  lines.push(`  Downstream Crafting EV:     ${formatChaos(downstreamEv, divineRate)}`);
  if (selfFracTotal !== undefined) {
    lines.push(`  Full Self-Fracture Route:   ${formatChaos(selfFracTotal, divineRate)}`);
  }
  if (marketTotal !== undefined) {
    lines.push(`  Full Market Purchase Route: ${formatChaos(marketTotal, divineRate)}`);
  }

  if (selfFracTotal !== undefined && marketTotal !== undefined) {
    const diff = Math.abs(marketTotal - selfFracTotal);
    const recIsMarket = marketTotal < selfFracTotal;
    lines.push(`\nRECOMMENDED ACQUISITION (STEP 1):`);
    lines.push(`  ${recIsMarket ? 'Direct Market Purchase' : 'Self-Fracture'}`);
    lines.push(`  Estimated acquisition cost: ${formatChaos(recIsMarket ? marketStrat!.baseCostChaos : selfFracStrat!.baseCostChaos, divineRate)}`);
    lines.push(`  Full route difference:      ${(diff / divineRate).toFixed(2)} div / ${diff.toFixed(1)}c savings vs ${recIsMarket ? 'Self-Fracture' : 'Market Purchase'}`);
    lines.push(`  Model confidence:           ${recIsMarket ? 'High (Deterministic Market Purchase)' : 'Approximate (Self-Fracture Model)'}`);
  } else if (selfFracStrat) {
    lines.push(`\nRECOMMENDED ACQUISITION (STEP 1):`);
    lines.push(`  Self-Fracture (Clean Base prep + Fracturing Orb)`);
    lines.push(`  Estimated acquisition cost: ${formatChaos(selfFracStrat.baseCostChaos, divineRate)}`);
    lines.push(`  Market purchase:            not supplied / unavailable (Self-fracture evaluated from pool weights).`);
    lines.push(`  Model confidence:           Approximate (Self-Fracture Model)`);
  } else if (marketStrat) {
    lines.push(`\nRECOMMENDED ACQUISITION (STEP 1):`);
    lines.push(`  Direct Market Purchase`);
    lines.push(`  Estimated acquisition cost: ${formatChaos(marketStrat.baseCostChaos, divineRate)}`);
    lines.push(`  Model confidence:           High (Deterministic Market Purchase)`);
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

        for (const s of recommended.steps) {
          let simStepCost = 0;
          if (s.stepNumber === 1) simStepCost = simulation.stepwiseCostAverages.step1AcquisitionChaos;
          else if (s.stepNumber === 2) simStepCost = simulation.stepwiseCostAverages.step2HarvestChaos;
          else if (s.stepNumber === 3) simStepCost = simulation.stepwiseCostAverages.step3CleanupChaos;
          else if (s.stepNumber === 4) simStepCost = simulation.stepwiseCostAverages.step4ExaltChaos;
          else if (s.stepNumber === 5) simStepCost = simulation.stepwiseCostAverages.step5ExaltChaos;
          else if (s.stepNumber === 6) simStepCost = simulation.stepwiseCostAverages.step6DivineChaos;

          const diffVal = simStepCost - s.stepTotalCostChaos;
          lines.push(
            `${s.title.padEnd(24)} ${fmtCol(s.stepTotalCostChaos)} ${fmtCol(simStepCost)} ${fmtDiff(diffVal)}`
          );
        }
        lines.push(`-`.repeat(86));
        const totalDiffVal = (Math.abs(simulation.meanCostChaos - recommended.totalExpectedCostChaos) / recommended.totalExpectedCostChaos) * 100;
        lines.push(
          `${'TOTAL COST:'.padEnd(24)} ${fmtCol(recommended.totalExpectedCostChaos)} ${fmtCol(simulation.meanCostChaos)} ${`${totalDiffVal.toFixed(2)}% diff`.padStart(20)}`
        );
      }

      // Action counts comparison table
      lines.push(`\nACTION COUNTS (Cumulative Across All Recovery Loops):`);
      lines.push(`                                  Analytical          Monte Carlo           Difference`);
      lines.push(`-`.repeat(86));
      const fmtCount = (c: number) => c.toFixed(2).padStart(20);
      const fmtPctDiff = (diff: number) => `${diff >= 0 ? '+' : ''}${diff.toFixed(2)}% diff`.padStart(20);

      const expPrimalH = recommended.expectedCurrencies?.primalLifeforce ? recommended.expectedCurrencies.primalLifeforce / 75 : 0;
      const simPrimalH = simulation.currencyAverages?.primalLifeforce ? simulation.currencyAverages.primalLifeforce / 75 : 0;
      const expWildH = recommended.expectedCurrencies?.wildLifeforce ? recommended.expectedCurrencies.wildLifeforce / 75 : 0;
      const simWildH = simulation.currencyAverages?.wildLifeforce ? simulation.currencyAverages.wildLifeforce / 75 : 0;
      const expVividH = recommended.expectedCurrencies?.vividLifeforce ? recommended.expectedCurrencies.vividLifeforce / 75 : 0;
      const simVividH = simulation.currencyAverages?.vividLifeforce ? simulation.currencyAverages.vividLifeforce / 75 : 0;
      const expHarvests = expPrimalH + expWildH + expVividH;
      const simHarvests = simPrimalH + simWildH + simVividH;
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

      // Uncertainty & Stability Metrics
      if (simulation.uncertaintyMetrics) {
        const um = simulation.uncertaintyMetrics;
        lines.push(`\nMONTE CARLO UNCERTAINTY & STABILITY METRICS:`);
        lines.push(`  Sample Mean Cost:       ${formatChaos(simulation.meanCostChaos ?? 0, divineRate)}`);
        lines.push(`  Sample Standard Dev:    ${formatChaos(um.sampleStandardDeviationChaos, divineRate)}`);
        lines.push(`  Standard Error of Mean: ${formatChaos(um.standardErrorChaos, divineRate)}`);
        lines.push(`  95% Confidence Interval:[${formatChaos(um.confidenceInterval95Chaos[0], divineRate)} - ${formatChaos(um.confidenceInterval95Chaos[1], divineRate)}]`);
        if (um.analyticalExpectedCostChaos !== undefined) {
          lines.push(`  Analytical Expected:    ${formatChaos(um.analyticalExpectedCostChaos, divineRate)} -> Inside 95% CI: ${um.analyticalInsideCi95 ? 'YES (Statistically Consistent)' : 'NO'}`);
        }
      }

      // Timeout & Step Censoring Diagnostics
      if (simulation.timeoutDiagnostics) {
        const td = simulation.timeoutDiagnostics;
        lines.push(`\nMONTE CARLO TIMEOUT & STEP CENSORING DIAGNOSTICS:`);
        lines.push(`  Completed trials:       ${simulation.completedTrials.toLocaleString()} / ${simulation.totalTrials.toLocaleString()} (${simulation.completionRate.toFixed(2)}%)`);
        lines.push(`  Timed out trials:       ${simulation.timedOutTrials.toLocaleString()} (${td.timeoutRatePercentage.toFixed(2)}%)`);
        lines.push(`  Average steps / trial:  ${Math.round(td.averageStepsCompleted).toLocaleString()} steps`);
        lines.push(`  Maximum steps observed: ${td.maxStepsCompleted.toLocaleString()} steps`);
        lines.push(`  Trials > 5,000 steps:   ${td.trialsExceeding5kSteps.toLocaleString()} (${((td.trialsExceeding5kSteps / simulation.totalTrials) * 100).toFixed(2)}%)`);
        lines.push(`  Trials > 10,000 steps:  ${td.trialsExceeding10kSteps.toLocaleString()} (${((td.trialsExceeding10kSteps / simulation.totalTrials) * 100).toFixed(2)}%)`);
        lines.push(`  Trials > 20,000 steps:  ${td.trialsExceeding20kSteps.toLocaleString()} (${((td.trialsExceeding20kSteps / simulation.totalTrials) * 100).toFixed(2)}%)`);
        if (td.timeoutPartialCostChaos > 0) {
          lines.push(`  Timeout partial cost:   ${formatChaos(td.timeoutPartialCostChaos, divineRate)} accumulated across timed-out trials`);
        } else {
          lines.push(`  Timeout censoring bias: None (0 timed-out trials)`);
        }
      }

      // Cost Percentiles
      lines.push(`\nPercentiles (Craft Cost Distribution):`);
      lines.push(`  Median Cost (P50):    ${formatChaos(simulation.medianCostChaos ?? 0, divineRate)}`);
      lines.push(`  75th Percentile (P75):${formatChaos(simulation.p75CostChaos ?? 0, divineRate)}`);
      lines.push(`  90th Percentile (P90):${formatChaos(simulation.p90CostChaos ?? 0, divineRate)}`);
      lines.push(`  95th Percentile (P95):${formatChaos(simulation.p95CostChaos ?? 0, divineRate)}`);

      // Profit & Risk Distribution Metrics
      if (simulation.riskMetrics && simulation.riskMetrics.saleValueChaos > 0) {
        const rm = simulation.riskMetrics;
        if (rm.isBranchSpecific) {
          lines.push(`\nPROFIT & RISK DISTRIBUTION METRICS (BRANCH-SPECIFIC SALE VALUES):`);
          lines.push(`  Probability Realized Profit >= 0:${rm.profitProbabilityPercentage.toFixed(2)}% (${rm.profitableTrialsCount.toLocaleString()} / ${simulation.completedTrials.toLocaleString()} trials profitable)`);
          lines.push(`  Expected Realized Profit (EV):   ${rm.meanRealizedProfitChaos >= 0 ? '+' : ''}${formatChaos(rm.meanRealizedProfitChaos, divineRate)}`);
          lines.push(`  Realized Median Profit (P50):    ${rm.medianRealizedProfitChaos >= 0 ? '+' : ''}${formatChaos(rm.medianRealizedProfitChaos, divineRate)}`);
          if (rm.p75ProfitChaos !== undefined) {
            lines.push(`  75th Percentile Profit (P75):    ${rm.p75ProfitChaos >= 0 ? '+' : ''}${formatChaos(rm.p75ProfitChaos, divineRate)}`);
          }
          if (rm.p25ProfitChaos !== undefined) {
            lines.push(`  25th Percentile Profit (P25):    ${rm.p25ProfitChaos >= 0 ? '+' : ''}${formatChaos(rm.p25ProfitChaos, divineRate)}`);
          }
          if (rm.p10ProfitChaos !== undefined) {
            lines.push(`  10th Percentile Profit (P10):    ${rm.p10ProfitChaos >= 0 ? '+' : ''}${formatChaos(rm.p10ProfitChaos, divineRate)}`);
          }
          if (rm.p5ProfitChaos !== undefined) {
            lines.push(`  5th Percentile Profit (P5):      ${rm.p5ProfitChaos >= 0 ? '+' : ''}${formatChaos(rm.p5ProfitChaos, divineRate)}`);
          }
          lines.push(`  Expected Shortfall (CVaR 95):    ${formatChaos(rm.cvar95CostChaos, divineRate)} (Average cost in worst 5% tail)`);
          lines.push(`  Economic Risk Assessment:        ${rm.medianRealizedProfitChaos > 0 && (recommended.expectedProfitChaos ?? 0) < 0 ? 'Heavy Right-Tail Risk (Median craft is profitable, but long recovery chains drag Expected Value negative)' : ((recommended.expectedProfitChaos ?? 0) > 0 ? 'Favorable Risk-Neutral EV (Positive Expected Value and robust median profit)' : 'Unfavorable EV under current ordinary currency action set')}`);
        } else {
          const p75Loss = rm.saleValueChaos - rm.p75CostChaos;
          const p90Loss = rm.saleValueChaos - rm.p90CostChaos;
          const p95Loss = rm.saleValueChaos - rm.p95CostChaos;

          lines.push(`\nPROFIT & RISK DISTRIBUTION METRICS (SALE VALUE: ${formatChaos(rm.saleValueChaos, divineRate)}):`);
          lines.push(`  Probability Craft < Sale:    ${rm.profitProbabilityPercentage.toFixed(2)}% (${rm.profitableTrialsCount.toLocaleString()} / ${simulation.completedTrials.toLocaleString()} trials profitable)`);
          lines.push(`  Realized Median Profit (P50):${rm.medianRealizedProfitChaos >= 0 ? '+' : ''}${formatChaos(rm.medianRealizedProfitChaos, divineRate)}`);
          lines.push(`  75th Percentile Cost (P75):  ${formatChaos(rm.p75CostChaos, divineRate)} (Realized: ${p75Loss >= 0 ? '+' : ''}${formatChaos(p75Loss, divineRate)})`);
          lines.push(`  90th Percentile Cost (P90):  ${formatChaos(rm.p90CostChaos, divineRate)} (Realized: ${p90Loss >= 0 ? '+' : ''}${formatChaos(p90Loss, divineRate)})`);
          lines.push(`  95th Percentile Cost (P95):  ${formatChaos(rm.p95CostChaos, divineRate)} (Realized: ${p95Loss >= 0 ? '+' : ''}${formatChaos(p95Loss, divineRate)})`);
          lines.push(`  Expected Shortfall (CVaR 95):${formatChaos(rm.cvar95CostChaos, divineRate)} (Average cost in worst 5% tail)`);
          lines.push(`  Economic Risk Assessment:    ${rm.medianRealizedProfitChaos > 0 && (recommended.expectedProfitChaos ?? 0) < 0 ? 'Heavy Right-Tail Risk (Median craft is profitable, but long recovery chains drag Expected Value negative)' : ((recommended.expectedProfitChaos ?? 0) > 0 ? 'Favorable Risk-Neutral EV (Positive Expected Value and robust median profit)' : 'Unfavorable EV under current ordinary currency action set')}`);
        }
      }
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

  // ------------------------------------------------------------- STARTING FRACTURE ROUTE COMPARISON TABLE
  if (allStartingRoutes.length > 1) {
    // Group strategies by unique target base label
    const baseGroups = new Map<string, StartingStrategyResult[]>();
    for (const strat of allStartingRoutes) {
      const lbl = getStartingFractureBaseLabel(strat.state);
      if (!baseGroups.has(lbl)) {
        baseGroups.set(lbl, []);
      }
      baseGroups.get(lbl)!.push(strat);
    }

    lines.push('\n' + '='.repeat(70));
    lines.push('STARTING FRACTURE ROUTE COMPARISON');
    lines.push('='.repeat(70));
    lines.push(
      `${'Starting Base / Target'.padEnd(38)} ${'Acquisition Mode'.padEnd(20)} ${'Acquisition Cost'.padEnd(20)} ${'Downstream EV'.padEnd(20)} ${'Full Route EV'.padEnd(20)} Status`
    );
    lines.push('-'.repeat(128));

    for (const [baseLabel, strats] of baseGroups.entries()) {
      for (let i = 0; i < strats.length; i++) {
        const r = strats[i];
        const isBest = r === recommended;
        const acqTypeStr = r.acquisition?.type === 'market' ? 'Market Purchase' : 'Self-Fracture' + (isBest ? ' (Rec)' : '');
        const acqCostStr = formatChaos(r.baseCostChaos, divineRate);
        const downStr = formatChaos(r.expectedCraftingCostChaos, divineRate);
        const totStr = formatChaos(r.totalExpectedCostChaos, divineRate);
        const diff = r.totalExpectedCostChaos - recommended.totalExpectedCostChaos;
        const statusStr = isBest ? 'BEST' : `+${formatChaos(diff, divineRate)}`;

        const baseCol = i === 0 ? baseLabel.padEnd(38) : ''.padEnd(38);
        lines.push(
          `${baseCol} ${acqTypeStr.padEnd(20)} ${acqCostStr.padEnd(20)} ${downStr.padEnd(20)} ${totStr.padEnd(20)} ${statusStr}`
        );
      }
    }
    lines.push('-'.repeat(128));
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

  // ------------------------------------------------------------- LABELED GAME MECHANICS ASSUMPTIONS
  lines.push('\n' + '='.repeat(70));
  lines.push('LABELED GAME MECHANICS ASSUMPTIONS');
  lines.push('='.repeat(70));
  lines.push('1. Harvest Additional Affixes: Modeled as 50% chance of 1 additional affix / 50% chance of 2 additional affixes (PoE 4-mod rare cluster jewel affix distribution).');
  lines.push('2. Base Self-Fracture Model: Approximate Alteration/Augmentation/Regal/Bench preparation + Fracturing Orb (25% hit rate).');
  lines.push('3. Market Purchase Prices: Any unsupplied market price is reported as not supplied / unavailable rather than inferred.');
  lines.push('4. Allflame Crafting: Stateful Intangibility stacking remains deferred and disabled.');

  lines.push('\n' + '='.repeat(70));
  return lines.join('\n');
}
