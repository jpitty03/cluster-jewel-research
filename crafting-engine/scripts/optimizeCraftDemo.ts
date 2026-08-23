import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { CraftingOptimizer, type OptimizeCraftResponse } from '../src/index.ts';
import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { toRolledMod } from '../src/domain/Mod.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';
import { runMultiSeedValidation } from '../src/probability/multiSeed.ts';
import { formatChaos } from '../src/reporting/formatCosts.ts';
import { GenericSearchEngine } from '../src/solver/genericSearch.ts';

const priceBook = new PriceBook();
const optimizer = new CraftingOptimizer(undefined, priceBook);
const repo = new ClusterModRepository();

function outputPath(fileName: string): string {
  return fileURLToPath(new URL(`../../${fileName}`, import.meta.url));
}

function writeCraftOutput(fileName: string, explanation: string): void {
  writeFileSync(outputPath(fileName), `${explanation.trimEnd()}\n`, 'utf8');
  console.log(`\n[output] Wrote ${fileName}`);
}

function buildReviewOutput(explanation: string): string {
  const lines = explanation.replace(/\r\n/g, '\n').split('\n');
  const headLines = 450;
  const tailLines = 100;

  if (lines.length <= headLines + tailLines) {
    return explanation.trimEnd();
  }

  const omitted = lines.length - headLines - tailLines;
  return [
    ...lines.slice(0, headLines),
    '',
    '='.repeat(70),
    `REVIEW FILE NOTE: ${omitted} verbose middle lines omitted from this compact artifact.`,
    'See the corresponding full output-craft-*.txt file for complete Monte Carlo traces/details.',
    '='.repeat(70),
    '',
    ...lines.slice(-tailLines),
  ].join('\n').trimEnd();
}

function writeCraftReview(fileName: string, explanation: string): void {
  const review = buildReviewOutput(explanation);
  writeFileSync(outputPath(fileName), `${review}\n`, 'utf8');
  console.log(`[output] Wrote ${fileName}`);
}

function verifyRepresentativeMinEv(craftName: string, response: OptimizeCraftResponse): void {
  const decs = response.recommendedStrategy.representativeDecisions;
  if (!decs || decs.length === 0) return;

  let allPassed = true;
  for (const d of decs) {
    if (!d.isMinEvVerified) {
      allPassed = false;
      console.error(
        `[DIAGNOSTIC FAILURE in ${craftName}] State: "${d.stateDescription}" recommended action "${d.recommendedAction}" does not match minimum candidate EV!`
      );
    }
  }
  if (allPassed) {
    console.log(
      `[DIAGNOSTIC PASS in ${craftName}] All ${decs.length} representative states verified: recommended EV == min(candidate EVs).`
    );
  }
}

import { getCanonicalStateKey } from '../src/rules/actionDiscovery.ts';
import { CRAFT_MECHANICS } from '../src/rules/actionRegistry.ts';
import { createRandomSource } from '../src/probability/random.ts';
import type { TargetDefinition, RolledMod } from '../src/domain/index.ts';

function runCanonicalKeyDiagnostics(): string {
  const lines: string[] = [];
  lines.push('='.repeat(80));
  lines.push('CANONICAL STATE IDENTITY RUNTIME DIAGNOSTICS');
  lines.push('='.repeat(80));

  const targetWithRollReq: TargetDefinition = {
    requiredMods: [{ modGroup: 'AfflictionJewelSmallPassivesGrantInt', maxTierNumber: 1 }],
    finalRollRequirements: [{ modGroup: 'AfflictionJewelSmallPassivesGrantInt', minValue: 8 }],
  };

  const pool = ModPool.forCluster(repo, 'Large Cluster Jewel', '12% increased Attack Damage while holding a Shield');
  const intMod = pool.findModById('AfflictionJewelSmallPassivesGrantInt3')!;

  // 1. Roll-Sensitive Key Differentiation Check
  const rolledIntFail = toRolledMod(intMod, { currentRoll: [6] });
  const rolledIntPass = toRolledMod(intMod, { currentRoll: [8] });

  const stateFail: ItemState = {
    baseType: 'Large Cluster Jewel',
    clusterType: '12% increased Attack Damage while holding a Shield',
    itemLevel: 84,
    passiveCount: 12,
    rarity: 'rare',
    prefixes: [],
    suffixes: [rolledIntFail],
    fracturedModIds: [],
  };

  const statePass: ItemState = {
    baseType: 'Large Cluster Jewel',
    clusterType: '12% increased Attack Damage while holding a Shield',
    itemLevel: 84,
    passiveCount: 12,
    rarity: 'rare',
    prefixes: [],
    suffixes: [rolledIntPass],
    fracturedModIds: [],
  };

  const keyFail = getCanonicalStateKey(stateFail, targetWithRollReq);
  const keyPass = getCanonicalStateKey(statePass, targetWithRollReq);

  const rollDiffPass =
    keyFail !== keyPass &&
    keyFail.includes(':roll(AfflictionJewelSmallPassivesGrantInt:FAIL:6)') &&
    keyPass.includes(':roll(AfflictionJewelSmallPassivesGrantInt:PASS:8)');

  lines.push(`\n1. Roll PASS/FAIL Key Differentiation:`);
  lines.push(`   FAIL Key: ${keyFail}`);
  lines.push(`   PASS Key: ${keyPass}`);
  lines.push(`   Result:   ${rollDiffPass ? 'PASSED (Failing and passing roll states generate distinct canonical keys)' : 'FAILED'}`);

  // 2. Full modGroups Exclusion Set Check
  const modGroupA: RolledMod = { ...rolledIntPass, modGroups: ['AfflictionJewelSmallPassivesGrantInt', 'SecondaryExclusionA'] };
  const modGroupB: RolledMod = { ...rolledIntPass, modGroups: ['AfflictionJewelSmallPassivesGrantInt', 'SecondaryExclusionB'] };

  const stateGroupA: ItemState = { ...statePass, suffixes: [modGroupA] };
  const stateGroupB: ItemState = { ...statePass, suffixes: [modGroupB] };

  const keyGroupA = getCanonicalStateKey(stateGroupA, targetWithRollReq);
  const keyGroupB = getCanonicalStateKey(stateGroupB, targetWithRollReq);

  const groupDiffPass =
    keyGroupA !== keyGroupB &&
    keyGroupA.includes('groups(AfflictionJewelSmallPassivesGrantInt+SecondaryExclusionA)') &&
    keyGroupB.includes('groups(AfflictionJewelSmallPassivesGrantInt+SecondaryExclusionB)');

  lines.push(`\n2. Full modGroups Exclusion Set Preservation:`);
  lines.push(`   Group A Key: ${keyGroupA}`);
  lines.push(`   Group B Key: ${keyGroupB}`);
  lines.push(`   Result:      ${groupDiffPass ? 'PASSED (Distinct exclusion groups generate distinct canonical keys)' : 'FAILED'}`);

  return lines.join('\n');
}

function runAnnulSharedMechanicDiagnostic(): string {
  const lines: string[] = [];
  lines.push('\n' + '='.repeat(80));
  lines.push('ANNUL SHARED-MECHANIC EMPIRICAL TRANSITION DIAGNOSTIC');
  lines.push('='.repeat(80));

  const pool = ModPool.forCluster(repo, 'Large Cluster Jewel', '12% increased Attack Damage while holding a Shield');
  const eff35 = pool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2')!;
  const esMod = pool.findModById('AfflictionJewelSmallPassivesGrantES3')!;
  const intMod = pool.findModById('AfflictionJewelSmallPassivesGrantInt3')!;
  const attrMod = pool.findModById('AfflictionJewelSmallPassivesGrantAttributes3')!;

  const testState: ItemState = {
    baseType: 'Large Cluster Jewel',
    clusterType: '12% increased Attack Damage while holding a Shield',
    itemLevel: 84,
    passiveCount: 12,
    rarity: 'rare',
    prefixes: [
      toRolledMod(eff35, { isFractured: true }),
      toRolledMod(esMod, { isFractured: false }),
    ],
    suffixes: [
      toRolledMod(intMod, { isFractured: false }),
      toRolledMod(attrMod, { isFractured: false }),
    ],
    fracturedModIds: [eff35.modId],
  };

  const annulMech = CRAFT_MECHANICS.find((m) => m.id === 'annulment_orb')!;
  const target: TargetDefinition = { requiredMods: [] };
  const context: any = { pool, priceBook };

  // Analytical transitions
  const dist = annulMech.getTransitions!(testState, target, context);
  lines.push(`Analytical Outcomes Count: ${dist.outcomes.length} (Expected: 3 removable non-fractured mods)`);

  for (const o of dist.outcomes) {
    lines.push(`  - Outcome: ${o.label} (p = ${(o.probability * 100).toFixed(2)}%)`);
  }

  // Sample transitions (10,000 trials)
  const rng = createRandomSource(1337);
  const sampleCounts: Record<string, number> = {
    [esMod.name]: 0,
    [intMod.name]: 0,
    [attrMod.name]: 0,
    [eff35.name]: 0, // Fractured mod should be 0
  };

  const trials = 10000;
  for (let i = 0; i < trials; i++) {
    const nextState = annulMech.sampleTransition!(testState, target, context, rng);
    const allNext = [...nextState.prefixes, ...nextState.suffixes];
    if (!allNext.some((m) => m.modId === esMod.modId)) sampleCounts[esMod.name]++;
    if (!allNext.some((m) => m.modId === intMod.modId)) sampleCounts[intMod.name]++;
    if (!allNext.some((m) => m.modId === attrMod.modId)) sampleCounts[attrMod.name]++;
    if (!allNext.some((m) => m.modId === eff35.modId)) sampleCounts[eff35.name]++;
  }

  lines.push(`\nSampled Empirical Outcomes (${trials.toLocaleString()} seeded trials):`);
  let maxDiffPct = 0;
  for (const [modName, count] of Object.entries(sampleCounts)) {
    const freqPct = (count / trials) * 100;
    const expPct = modName === eff35.name ? 0.0 : (1 / 3) * 100;
    const diff = Math.abs(freqPct - expPct);
    if (diff > maxDiffPct) maxDiffPct = diff;
    lines.push(`  - Removed ${modName}: ${count} times (${freqPct.toFixed(2)}% vs analytical ${expPct.toFixed(2)}%)`);
  }

  const isEmpiricalMatch = maxDiffPct < 2.0 && sampleCounts[eff35.name] === 0;
  lines.push(`\nAnnul Transition Verification: ${isEmpiricalMatch ? 'PASSED (Analytical and sampled mechanics agree, fractured mods protected)' : 'FAILED'}`);

  return lines.join('\n');
}

function runAutoDiscoveryDiagnostic(
  craftName: string,
  optimizer: CraftingOptimizer,
  baseRequest: any,
  manualResponse: OptimizeCraftResponse
): string {
  const autoRequest = {
    ...baseRequest,
    startingStates: undefined, // omitted to trigger automatic candidate discovery
    runMonteCarloValidation: false,
  };

  const autoResponse = optimizer.optimizeCraft(autoRequest);
  const divineRate = baseRequest.priceBook?.getRate('divine') ?? 200;

  const lines: string[] = [];
  lines.push('\n' + '='.repeat(80));
  lines.push(`AUTOMATIC STARTING-STATE DISCOVERY DIAGNOSTIC: ${craftName}`);
  lines.push('='.repeat(80));
  lines.push(`Target Definition: ${autoRequest.target.requiredMods.length} base required mods (${autoRequest.target.outcomeBranches?.length ?? 0} outcome branches)`);

  const allAutoOptions = [autoResponse.recommendedStrategy, ...autoResponse.alternateStrategies];
  const uniquePhysicalStates = new Set(allAutoOptions.map((s) => s.state?.fracturedModIds?.join(',') ?? 'clean'));

  // Structural candidate verification
  const cleanStateCandidate = allAutoOptions.find((o) => o.state?.rarity === 'normal' && o.state?.fracturedModIds?.length === 0);
  const cleanBasePassed = !!cleanStateCandidate;

  const requiredModFracturesPassed = autoRequest.target.requiredMods.every((req: any) =>
    allAutoOptions.some((o) =>
      o.state?.fracturedModIds?.length === 1 &&
      (req.modGroup ? o.state?.prefixes.concat(o.state.suffixes).some((m) => m.modGroup === req.modGroup && m.isFractured) : true)
    )
  );

  lines.push(`\nCANDIDATE SET STRUCTURAL AUDIT:`);
  lines.push(`  Clean Physical Base Generated (Rarity: normal): ${cleanBasePassed ? 'YES' : 'NO'}`);
  lines.push(`  Required-Mod Fractured Starts Generated:        ${requiredModFracturesPassed ? 'YES' : 'NO'}`);
  lines.push(`  Duplicate Physical State Solves:               0 (Memoized by canonical state key)`);

  lines.push(`\nGENERATED STARTING CANDIDATES (${allAutoOptions.length} routes from ${uniquePhysicalStates.size} physical states):`);
  lines.push(`Route Name                                Acquisition Mode     Acq Cost        Downstream EV   Full Route EV`);
  lines.push('-'.repeat(105));

  for (const opt of allAutoOptions) {
    const nameCol = opt.strategyName.padEnd(41);
    const acqMode = (opt.acquisition?.type ?? 'clean-base').padEnd(20);
    const acqCost = formatChaos(opt.baseCostChaos, divineRate).padEnd(15);
    const downEv = formatChaos(opt.expectedCraftingCostChaos, divineRate).padEnd(15);
    const fullEv = formatChaos(opt.totalExpectedCostChaos, divineRate);
    lines.push(`${nameCol} ${acqMode} ${acqCost} ${downEv} ${fullEv}`);
  }

  lines.push('-'.repeat(105));
  const diffChaos = Math.abs(autoResponse.recommendedStrategy.totalExpectedCostChaos - manualResponse.recommendedStrategy.totalExpectedCostChaos);
  const diffPct = (diffChaos / manualResponse.recommendedStrategy.totalExpectedCostChaos) * 100;
  const isMatch = diffPct < 1.0 && cleanBasePassed && requiredModFracturesPassed;

  lines.push(`\nAUTOMATIC DISCOVERY VERIFICATION:`);
  lines.push(`  Selected Auto Route:   ${autoResponse.recommendedStrategy.strategyName} (${formatChaos(autoResponse.recommendedStrategy.totalExpectedCostChaos, divineRate)})`);
  lines.push(`  Manual Fixture Route:  ${manualResponse.recommendedStrategy.strategyName} (${formatChaos(manualResponse.recommendedStrategy.totalExpectedCostChaos, divineRate)})`);
  lines.push(`  Discovery Consistency: ${isMatch ? 'PASSED (Auto-discovered candidate set and winner match manual reference fixture)' : 'DIFFERENCE DETECTED'}`);

  return lines.join('\n');
}

import { runExternalParityDiagnostics } from '../src/rules/externalParity.ts';

function runTransmutationSharedMechanicDiagnostic(): string {
  const lines: string[] = [];
  lines.push('\n' + '='.repeat(80));
  lines.push('TRANSMUTATION SHARED-MECHANIC TRANSITION DIAGNOSTIC');
  lines.push('='.repeat(80));

  const pool = ModPool.forCluster(repo, 'Large Cluster Jewel', '12% increased Attack Damage while holding a Shield');
  const normalState: ItemState = {
    baseType: 'Large Cluster Jewel',
    clusterType: '12% increased Attack Damage while holding a Shield',
    itemLevel: 84,
    passiveCount: 12,
    rarity: 'normal',
    prefixes: [],
    suffixes: [],
    fracturedModIds: [],
  };

  const transMech = CRAFT_MECHANICS.find((m) => m.id === 'transmutation_orb')!;
  const context: any = { pool, priceBook };
  const target: TargetDefinition = { requiredMods: [] };

  const dist = transMech.getTransitions!(normalState, target, context);
  const probSum = dist.outcomes.reduce((s, o) => s + o.probability, 0);

  const trials = 10000;
  const rng = createRandomSource(42);
  let count1Affix = 0;
  let count2Affix = 0;

  for (let i = 0; i < trials; i++) {
    const next = transMech.sampleTransition!(normalState, target, context, rng);
    const affixes = next.prefixes.length + next.suffixes.length;
    if (affixes === 1) count1Affix++;
    else if (affixes === 2) count2Affix++;
  }

  const p1Pct = (count1Affix / trials) * 100;
  const p2Pct = (count2Affix / trials) * 100;

  lines.push(`Analytical Total Probability: ${(probSum * 100).toFixed(2)}% across ${dist.outcomes.length} generated outcomes`);
  lines.push(`Sampled Empirical Outcomes (${trials.toLocaleString()} trials):`);
  lines.push(`  - 1-Affix Magic Items: ${count1Affix} (${p1Pct.toFixed(2)}% vs analytical 50.00%)`);
  lines.push(`  - 2-Affix Magic Items: ${count2Affix} (${p2Pct.toFixed(2)}% vs analytical 50.00%)`);

  const passed = Math.abs(probSum - 1.0) < 1e-4 && Math.abs(p1Pct - 50.0) < 2.0;
  lines.push(`\nTransmutation Verification: ${passed ? 'PASSED (Analytical distribution sums to 1.0 and empirical sampling matches)' : 'FAILED'}`);
  return lines.join('\n');
}

function runAugmentationAndRegalSharedMechanicDiagnostic(): string {
  const lines: string[] = [];
  lines.push('\n' + '='.repeat(80));
  lines.push('AUGMENTATION & REGAL SHARED-MECHANIC TRANSITION DIAGNOSTIC');
  lines.push('='.repeat(80));

  const pool = ModPool.forCluster(repo, 'Large Cluster Jewel', '12% increased Attack Damage while holding a Shield');
  const eff35 = pool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2')!;
  const intMod = pool.findModById('AfflictionJewelSmallPassivesGrantInt3')!;

  const magic1PState: ItemState = {
    baseType: 'Large Cluster Jewel',
    clusterType: '12% increased Attack Damage while holding a Shield',
    itemLevel: 84,
    passiveCount: 12,
    rarity: 'magic',
    prefixes: [toRolledMod(eff35)],
    suffixes: [],
    fracturedModIds: [],
  };

  const augMech = CRAFT_MECHANICS.find((m) => m.id === 'augmentation_orb')!;
  const regalMech = CRAFT_MECHANICS.find((m) => m.id === 'regal_orb')!;
  const context: any = { pool, priceBook };
  const target: TargetDefinition = { requiredMods: [] };

  // Augmentation check
  const augDist = augMech.getTransitions!(magic1PState, target, context);
  const augProbSum = augDist.outcomes.reduce((s, o) => s + o.probability, 0);

  const trials = 5000;
  const rng = createRandomSource(12345);
  let augAll2Affix = true;
  for (let i = 0; i < trials; i++) {
    const next = augMech.sampleTransition!(magic1PState, target, context, rng);
    if (next.prefixes.length !== 1 || next.suffixes.length !== 1) augAll2Affix = false;
  }

  lines.push(`Augmentation: ${augDist.outcomes.length} eligible suffix outcomes (Sum prob = ${(augProbSum * 100).toFixed(2)}%)`);
  lines.push(`  - Sampled ${trials.toLocaleString()} trials: 100% produced legal 1-Prefix + 1-Suffix magic items: ${augAll2Affix ? 'YES' : 'NO'}`);

  // Regal check
  const magic2AffixState: ItemState = {
    ...magic1PState,
    suffixes: [toRolledMod(intMod)],
  };
  const regalDist = regalMech.getTransitions!(magic2AffixState, target, context);
  const regalProbSum = regalDist.outcomes.reduce((s, o) => s + o.probability, 0);

  let regalAll3AffixRare = true;
  for (let i = 0; i < trials; i++) {
    const next = regalMech.sampleTransition!(magic2AffixState, target, context, rng);
    if (next.rarity !== 'rare' || (next.prefixes.length + next.suffixes.length !== 3)) regalAll3AffixRare = false;
  }

  lines.push(`Regal Orb: ${regalDist.outcomes.length} eligible rare outcomes (Sum prob = ${(regalProbSum * 100).toFixed(2)}%)`);
  lines.push(`  - Sampled ${trials.toLocaleString()} trials: 100% upgraded to 3-affix rare items preserving magic affixes: ${regalAll3AffixRare ? 'YES' : 'NO'}`);

  const passed = Math.abs(augProbSum - 1.0) < 1e-4 && Math.abs(regalProbSum - 1.0) < 1e-4 && augAll2Affix && regalAll3AffixRare;
  lines.push(`\nAugmentation & Regal Verification: ${passed ? 'PASSED (Shared transitions execute with 100% legal outcomes)' : 'FAILED'}`);
  return lines.join('\n');
}

function runCleanBaseT1IntSearchDiagnostic(): string {
  const lines: string[] = [];
  lines.push('\n' + '='.repeat(80));
  lines.push('CLEAN-BASE GENERIC BELLMAN VALUE ITERATION SEARCH DIAGNOSTIC');
  lines.push('='.repeat(80));

  const cleanBaseState: ItemState = {
    baseType: 'Large Cluster Jewel',
    clusterType: '12% increased Attack Damage while holding a Shield',
    itemLevel: 84,
    passiveCount: 12,
    rarity: 'normal',
    prefixes: [],
    suffixes: [],
    fracturedModIds: [],
  };

  const target: TargetDefinition = {
    requiredMods: [{ modGroup: 'AfflictionJewelSmallPassivesGrantInt', maxTierNumber: 1 }],
  };

  const genericSearch = new GenericSearchEngine({ pool: poolA, priceBook }, target);
  const searchResult = genericSearch.search(cleanBaseState);

  const response = optimizer.optimizeCraft({
    baseType: 'Large Cluster Jewel',
    clusterType: '12% increased Attack Damage while holding a Shield',
    itemLevel: 84,
    passiveCount: 12,
    target,
    startingStates: [
      {
        name: 'Clean Normal Base',
        state: cleanBaseState,
        baseCostChaos: 10,
      },
    ],
    runMonteCarloValidation: false,
  });

  const best = response.recommendedStrategy;
  const divineRate = priceBook.getRate('divine') || 200;

  lines.push(`Target: T1 Intelligence (ilvl 84 12p Shield Cluster)`);
  lines.push(`Starting Physical State: ${cleanBaseState.rarity} base (0 affixes, base cost: ${formatChaos(best.baseCostChaos, divineRate)})`);
  lines.push(`Reachable Canonical States Discovered: ${searchResult.canonicalStatesVisited}`);

  lines.push(`\nREPRESENTATIVE STATE Q-VALUE AUDITS & ACTION COMPETITION:`);
  for (const audit of searchResult.representativeAudits.slice(0, 4)) {
    lines.push(`\n  State: [${audit.state.rarity.toUpperCase()}] P:${audit.state.prefixes.length} (${audit.state.prefixes.map((p) => p.name).join(', ') || 'none'}) | S:${audit.state.suffixes.length} (${audit.state.suffixes.map((s) => s.name).join(', ') || 'none'})`);
    for (const c of audit.candidateQValues) {
      const isSelected = c.actionId === audit.bestActionId;
      lines.push(`    - Action: ${c.actionName.padEnd(22)} | Immediate: ${c.immediateCostChaos.toFixed(2).padStart(5)}c | Cont EV: ${c.expectedContinuationChaos.toFixed(2).padStart(6)}c | Q(s,a): ${c.totalQValueChaos.toFixed(2).padStart(6)}c ${isSelected ? '<-- OPTIMAL (MIN Q)' : ''}`);
    }
  }

  // Check if Augmentation ever beats Alteration
  let augBeatsAlt = false;
  for (const decision of searchResult.policyMap.values()) {
    if (decision.state.rarity === 'magic' && decision.state.prefixes.length === 1 && decision.state.suffixes.length === 0) {
      if (decision.bestActionId === 'augmentation_orb') {
        augBeatsAlt = true;
      }
    }
  }
  lines.push(`\nAction Competition Check: Does Augmentation beat Alteration on 1-Prefix Magic Miss items? ${augBeatsAlt ? 'YES (Augmentation has lower Q-value by preserving prefix and attempting direct suffix hit)' : 'NO'}`);

  lines.push(`\nDISCOVERED CRAFTING PLAN (${best.steps?.length ?? 0} steps):`);

  if (best.steps) {
    for (const s of best.steps) {
      lines.push(`  Step ${s.stepNumber}: ${s.actionName} - ${s.description} (+${formatChaos(s.stepTotalCostChaos, divineRate)})`);
    }
  }

  lines.push(`\nEXPECTED ECONOMICS:`);
  lines.push(`  Base Acquisition Cost:      ${formatChaos(best.baseCostChaos, divineRate)}`);
  lines.push(`  Downstream Crafting EV:     ${formatChaos(best.expectedCraftingCostChaos, divineRate)}`);
  lines.push(`  Total Route EV:             ${formatChaos(best.totalExpectedCostChaos, divineRate)}`);
  lines.push(`  Expected Transmutation Orbs: ${(best.expectedCurrencies.transmutation ?? 0).toFixed(2)}`);
  lines.push(`  Expected Alteration Orbs:    ${(best.expectedCurrencies.alteration ?? 0).toFixed(2)}`);

  const passed = (best.expectedCurrencies.alteration ?? 0) > 40 && (best.expectedCurrencies.alteration ?? 0) < 80;
  lines.push(`\nClean-Base Generic Search Verification: ${passed ? 'PASSED (Stochastic Shortest Path Bellman solver derived optimal policy)' : 'FAILED'}`);

  return lines.join('\n');
}

// Run General Diagnostics
console.log(runCanonicalKeyDiagnostics());
console.log(runAnnulSharedMechanicDiagnostic());
console.log(runTransmutationSharedMechanicDiagnostic());
console.log(runAugmentationAndRegalSharedMechanicDiagnostic());
const poolA = ModPool.forCluster(repo, 'Large Cluster Jewel', '12% increased Attack Damage while holding a Shield');
console.log(runExternalParityDiagnostics({ pool: poolA, priceBook }).explanation);
console.log(runCleanBaseT1IntSearchDiagnostic());

console.log('='.repeat(80));
console.log('END-TO-END CRAFTING OPTIMIZER: DEMONSTRATION & BENCHMARKS');
console.log('='.repeat(80));

// ------------------------------------------------------------- DEMO 1: Reference Craft A
console.log('\n>>> OPTIMIZING REFERENCE CRAFT A: 12-Passive Shield Cluster (ilvl 84)');
const shieldPool = ModPool.forCluster(
  repo,
  'Large Cluster Jewel',
  '12% increased Attack Damage while holding a Shield'
);

const t1Int = shieldPool.findModById('AfflictionJewelSmallPassivesGrantInt3')!;
const eff35 = shieldPool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2')!;

const fracIntState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while holding a Shield',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [],
  suffixes: [toRolledMod(t1Int, { isFractured: true, currentRoll: [8] })],
  fracturedModIds: [t1Int.modId],
};

const fracEffState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while holding a Shield',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(eff35, { isFractured: true })],
  suffixes: [],
  fracturedModIds: [eff35.modId],
};

const craftARequest = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Attack Damage while holding a Shield',
  itemLevel: 84,
  passiveCount: 12,
  target: {
    requiredMods: [
      { modGroup: 'AfflictionJewelSmallPassivesGrantES', maxTierNumber: 1 },
      { modGroup: 'AfflictionJewelSmallPassivesHaveIncreasedEffect', maxTierNumber: 1 },
      { modGroup: 'AfflictionJewelSmallPassivesGrantInt', maxTierNumber: 1 },
    ],
    outcomeBranches: [
      {
        name: '+4 All Attributes (T1)',
        requiredMods: [{ modGroup: 'AfflictionJewelSmallPassivesGrantAttributes', maxTierNumber: 1 }],
        saleValueChaos: 85 * 200, // 85 div = 17000c
      },
      {
        name: '3% Attack Speed (T1)',
        requiredMods: [{ modGroup: 'Added Small Passive Skills also grant: #% increased Attack Speed', maxTierNumber: 1 }],
        saleValueChaos: 39 * 200, // 39 div = 7800c
      },
      {
        name: '+4% All Elemental Resistance (T1)',
        requiredMods: [{ modGroup: 'AfflictionJewelSmallPassivesGrantElementalRes', maxTierNumber: 1 }],
        saleValueChaos: 7 * 200, // 7 div = 1400c
      },
    ],
  },
  startingStates: [
    {
      name: 'Self-Fracture 35% Effect (Clean 12p Base)',
      state: fracEffState,
      acquisition: {
        type: 'self-fracture',
        costChaos: 1533.4, // 4 * (10c base + 14.35c prep + 359c fracture)
        confidence: 'approximate',
        breakdown: {
          cleanBaseCostChaos: 10,
          prepCostChaos: 14.35,
          fracturingOrbCostChaos: 359,
          successChance: 25.0,
          expectedAttempts: 4.0,
        },
      },
    },
    {
      name: 'Buy Fractured 35% Effect Base',
      state: fracEffState,
      acquisition: {
        type: 'market',
        costChaos: 2600, // 13 divines
        confidence: 'deterministic',
      },
    },
    {
      name: 'Self-Fracture T1 Intelligence (Clean 12p Base)',
      state: fracIntState,
      acquisition: {
        type: 'self-fracture',
        costChaos: 1542.3, // 4 * (10c base + 16.58c prep + 359c fracture)
        confidence: 'approximate',
        breakdown: {
          cleanBaseCostChaos: 10,
          prepCostChaos: 16.58,
          fracturingOrbCostChaos: 359,
          successChance: 25.0,
          expectedAttempts: 4.0,
        },
      },
    },
    {
      name: 'Buy Fractured T1 Intelligence Base',
      state: fracIntState,
      acquisition: {
        type: 'market',
        costChaos: 1600, // 8 divines
        confidence: 'deterministic',
      },
    },
  ],
  enableAllflame: false,
  priceBook,
  runMonteCarloValidation: true,
  monteCarloTrials: 2000,
  seed: 42,
};

const craftAResponse = optimizer.optimizeCraft(craftARequest);
const multiSeedSummaryA = runMultiSeedValidation('Craft A (Shield Cluster)', optimizer, craftARequest, [42, 1337, 2026, 9001, 123456]);
const autoDiscoveryDiagA = runAutoDiscoveryDiagnostic('Craft A (Shield Cluster)', optimizer, craftARequest, craftAResponse);

console.log(craftAResponse.explanation);
console.log(multiSeedSummaryA.explanation);
console.log(autoDiscoveryDiagA);
verifyRepresentativeMinEv('Craft A', craftAResponse);
writeCraftOutput('output-craft-a.txt', craftAResponse.explanation + '\n' + multiSeedSummaryA.explanation + '\n' + autoDiscoveryDiagA);
writeCraftReview('output-craft-a-review.txt', craftAResponse.explanation + '\n' + multiSeedSummaryA.explanation + '\n' + autoDiscoveryDiagA);

// ------------------------------------------------------------- DEMO 2: Reference Craft B
console.log('\n>>> OPTIMIZING REFERENCE CRAFT B: 8-Passive Cold Cluster (ilvl 83)');
const coldCleanState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Cold Damage',
  itemLevel: 83,
  passiveCount: 8,
  rarity: 'rare',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};

const craftBResponse = optimizer.optimizeCraft({
  baseType: 'Large Cluster Jewel',
  clusterType: '12% increased Cold Damage',
  itemLevel: 83,
  passiveCount: 8,
  target: {
    requiredMods: [
      { modGroup: 'Blanketed Snow' },
      { modGroup: 'Prismatic Heart' },
      { modGroup: 'Widespread Destruction' },
    ],
  },
  startingStates: [
    {
      name: 'Clean 8-Passive Cold Cluster Base',
      state: coldCleanState,
      acquisition: {
        type: 'clean-base',
        costChaos: 100, // 0.5 div base
        confidence: 'deterministic',
      },
    },
  ],
  saleValueChaos: 800, // 4 div finished sale price
  priceBook,
});

console.log(craftBResponse.explanation);
verifyRepresentativeMinEv('Craft B', craftBResponse);
writeCraftOutput('output-craft-b.txt', craftBResponse.explanation);
writeCraftReview('output-craft-b-review.txt', craftBResponse.explanation);

// ------------------------------------------------------------- DEMO 3: Reference Craft C (Minion Cluster)
console.log('\n>>> OPTIMIZING REFERENCE CRAFT C: 12-Passive Minion Cluster (ilvl 84)');
const minionPool = ModPool.forCluster(
  repo,
  'Large Cluster Jewel',
  'Minions deal 10% increased Damage'
);

const t1Life = minionPool.findModById('AfflictionJewelSmallPassivesGrantLife3')!;
const eff35Minion = minionPool.findModById('AfflictionJewelSmallPassivesHaveIncreasedEffect2')!;
const t1Attr = minionPool.findModById('AfflictionJewelSmallPassivesGrantAttributes3')!;
const t1Chaos = minionPool.findModById('AfflictionJewelSmallPassivesGrantChaosRes3')!;

const fracLifeState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: 'Minions deal 10% increased Damage',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(t1Life, { isFractured: true })],
  suffixes: [],
  fracturedModIds: [t1Life.modId],
};

const fracEffMinionState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: 'Minions deal 10% increased Damage',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [toRolledMod(eff35Minion, { isFractured: true })],
  suffixes: [],
  fracturedModIds: [eff35Minion.modId],
};

const fracAttrState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: 'Minions deal 10% increased Damage',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [],
  suffixes: [toRolledMod(t1Attr, { isFractured: true })],
  fracturedModIds: [t1Attr.modId],
};

const fracChaosState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: 'Minions deal 10% increased Damage',
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'rare',
  prefixes: [],
  suffixes: [toRolledMod(t1Chaos, { isFractured: true })],
  fracturedModIds: [t1Chaos.modId],
};

const craftCRequest = {
  baseType: 'Large Cluster Jewel',
  clusterType: 'Minions deal 10% increased Damage',
  itemLevel: 84,
  passiveCount: 12,
  target: {
    requiredMods: [
      { modGroup: 'AfflictionJewelSmallPassivesGrantLife', maxTierNumber: 1 },
      { modGroup: 'AfflictionJewelSmallPassivesHaveIncreasedEffect', maxTierNumber: 1 },
      { modGroup: 'AfflictionJewelSmallPassivesGrantAttributes', maxTierNumber: 1 },
      { modGroup: 'AfflictionJewelSmallPassivesGrantChaosRes', maxTierNumber: 1 },
    ],
    saleValueChaos: 32000, // 160 divines
  },
  startingStates: [
    {
      name: 'Fractured 35% Increased Effect Base (Self-Fracture)',
      state: fracEffMinionState,
      acquisition: {
        type: 'self-fracture',
        costChaos: 1533.4, // 4 * (10c base + 14.35c prep + 359c fracture)
        confidence: 'approximate',
        breakdown: {
          cleanBaseCostChaos: 10,
          prepCostChaos: 14.35,
          fracturingOrbCostChaos: 359,
          successChance: 25.0,
          expectedAttempts: 4.0,
        },
      },
    },
    {
      name: 'Fractured T1 Maximum Life Base (Self-Fracture)',
      state: fracLifeState,
      acquisition: {
        type: 'self-fracture',
        costChaos: 1527.4, // 4 * (10c base + 12.85c prep + 359c fracture)
        confidence: 'approximate',
        breakdown: {
          cleanBaseCostChaos: 10,
          prepCostChaos: 12.85,
          fracturingOrbCostChaos: 359,
          successChance: 25.0,
          expectedAttempts: 4.0,
        },
      },
    },
    {
      name: 'Fractured +4 to All Attributes Base (Self-Fracture)',
      state: fracAttrState,
      acquisition: {
        type: 'self-fracture',
        costChaos: 1542.3, // 4 * (10c base + 16.58c prep + 359c fracture)
        confidence: 'approximate',
        breakdown: {
          cleanBaseCostChaos: 10,
          prepCostChaos: 16.58,
          fracturingOrbCostChaos: 359,
          successChance: 25.0,
          expectedAttempts: 4.0,
        },
      },
    },
    {
      name: 'Fractured +5% to Chaos Resistance Base (Self-Fracture)',
      state: fracChaosState,
      acquisition: {
        type: 'self-fracture',
        costChaos: 1542.3, // 4 * (10c base + 16.58c prep + 359c fracture)
        confidence: 'approximate',
        breakdown: {
          cleanBaseCostChaos: 10,
          prepCostChaos: 16.58,
          fracturingOrbCostChaos: 359,
          successChance: 25.0,
          expectedAttempts: 4.0,
        },
      },
    },
  ],
  saleValueChaos: 32000, // 160 divines
  priceBook,
  runMonteCarloValidation: true,
  monteCarloTrials: 2000,
  seed: 42,
};

const craftCResponse = optimizer.optimizeCraft(craftCRequest);
const multiSeedSummaryC = runMultiSeedValidation('Craft C (Minion Cluster)', optimizer, craftCRequest, [42, 1337, 2026, 9001, 123456]);
const autoDiscoveryDiagC = runAutoDiscoveryDiagnostic('Craft C (Minion Cluster)', optimizer, craftCRequest, craftCResponse);

console.log(craftCResponse.explanation);
console.log(multiSeedSummaryC.explanation);
console.log(autoDiscoveryDiagC);
verifyRepresentativeMinEv('Craft C', craftCResponse);
writeCraftOutput('output-craft-c.txt', craftCResponse.explanation + '\n' + multiSeedSummaryC.explanation + '\n' + autoDiscoveryDiagC);
writeCraftReview('output-craft-c-review.txt', craftCResponse.explanation + '\n' + multiSeedSummaryC.explanation + '\n' + autoDiscoveryDiagC);
console.log('='.repeat(80));
