import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ItemState } from '../src/domain/ItemState.ts';
import type { Mod } from '../src/domain/Mod.ts';
import { toRolledMod } from '../src/domain/Mod.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';
import type { TargetDefinition } from '../src/domain/TargetDefinition.ts';
import { GenericSearchEngine } from '../src/solver/genericSearch.ts';
import { buildCraftPlan, type CraftPlanSource } from '../src/service/craftPlan.ts';
import type { PolicyExplanationRule } from '../src/service/optimizerService.ts';

const outputPath = fileURLToPath(
  new URL('../../output-phase2i-harvest-plan-diagnostic.txt', import.meta.url)
);
const targetModId = 'Phase2I_Harvest_Defences_Target';
const acquisitionActionId = 'acquire_phase2i_controlled_rare_base';

function mod(modId: string, genType: Mod['genType'], weight: number, craftTags: string[] = []): Mod {
  return {
    modId,
    name: modId,
    genType,
    weight,
    ilvl: 1,
    modGroup: `${modId}_group`,
    modGroups: [`${modId}_group`],
    tags: [...craftTags],
    craftTags: [...craftTags],
    spawnTags: [],
    statText: modId.replaceAll('_', ' '),
    statValues: [],
    tier: 1,
    tierCount: 1,
    isNotable: false,
  };
}

const pool = new ModPool([
  mod(targetModId, 'Prefix', 1, ['defences']),
  mod('Phase2I_Harvest_Filler_Prefix_1', 'Prefix', 1_000),
  mod('Phase2I_Harvest_Filler_Prefix_2', 'Prefix', 1_200),
  mod('Phase2I_Harvest_Filler_Suffix_1', 'Suffix', 900),
  mod('Phase2I_Harvest_Filler_Suffix_2', 'Suffix', 1_100),
  mod('Phase2I_Harvest_Filler_Suffix_3', 'Suffix', 1_300),
]);
const target: TargetDefinition = {
  requiredMods: [{ modId: targetModId }],
  requiredRarity: 'rare',
};
const initialPrefix = pool.findModById('Phase2I_Harvest_Filler_Prefix_1');
const initialSuffix = pool.findModById('Phase2I_Harvest_Filler_Suffix_1');
if (!initialPrefix || !initialSuffix) throw new Error('Controlled Harvest fixture mods missing');
const startingState: ItemState = {
  baseType: 'Medium Cluster Jewel',
  clusterType: 'Phase 2I selected-Harvest stage fixture',
  itemLevel: 84,
  passiveCount: 6,
  rarity: 'rare',
  prefixes: [toRolledMod(initialPrefix)],
  suffixes: [toRolledMod(initialSuffix)],
  fracturedModIds: [],
};

console.error('[phase2i-harvest-plan] shared GenericSearch selected-Harvest fixture');
const started = Date.now();
const search = new GenericSearchEngine(
  { pool, priceBook: new PriceBook({ primalLifeforce: 0.000001 }, {}) },
  target,
  {
    includeHarvest: true,
    harvestTags: ['defences'],
    enabledActionIds: ['harvest_reforge_defences'],
    allowResearchFallbackPrices: true,
    maxStates: 500,
    maxWallTimeMs: 10_000,
    maxExpansionRounds: 2,
    searchIntent: 'PROVE',
  },
).search(startingState);
const elapsedMs = Date.now() - started;

const policyExplanation: PolicyExplanationRule[] = search.onPolicyRules.map((rule) => {
  const present = [...rule.state.prefixes, ...rule.state.suffixes]
    .some((affix) => affix.modId === targetModId);
  return {
    condition: `${rule.state.rarity} ${rule.state.prefixes.length}P/${rule.state.suffixes.length}S`,
    actionId: rule.selectedActionId,
    action: rule.selectedActionName,
    representedStateCount: 1,
    expectedVisits: rule.expectedVisits,
    exampleState: rule.stateKey,
    context: {
      rarity: rule.state.rarity,
      prefixCount: rule.state.prefixes.length,
      suffixCount: rule.state.suffixes.length,
      matchedTargetModIds: present ? [targetModId] : [],
      unmatchedTargetModIds: present ? [] : [targetModId],
      prefixes: rule.state.prefixes.map((affix) => ({
        modId: affix.modId,
        tier: affix.tier,
        isFractured: false,
        currentRoll: affix.currentRoll,
      })),
      suffixes: rule.state.suffixes.map((affix) => ({
        modId: affix.modId,
        tier: affix.tier,
        isFractured: false,
        currentRoll: affix.currentRoll,
      })),
      influenced: false,
      synthesised: false,
      acquisitionMenu: false,
      disambiguateAffixes: true,
    },
  };
});
const source: CraftPlanSource = {
  target,
  recommendationStatus: 'PROVEN_OPTIMAL',
  recommended: {
    actionId: acquisitionActionId,
    name: 'Controlled Rare base',
    acquisitionCandidateId: 'candidate_0',
    acquisitionMethodId: 'controlled_base',
    expectedTotalCostChaos: search.totalExpectedCostChaos,
    lowerBoundChaos: search.totalExpectedCostChaos,
    incumbentUpperBoundChaos: search.totalExpectedCostChaos,
    optimalityGapChaos: 0,
    status: 'RESOLVED',
    couldBeatResolvedIncumbent: false,
  },
  expectedActionUsage: search.expectedActionUsage.map((usage) => ({ ...usage })),
  policyExplanation,
  acquisition: {
    selectedCandidateId: 'candidate_0',
    selectedMethodId: 'controlled_base',
    candidates: [{
      id: 'candidate_0',
      label: 'Controlled Rare base',
      physicalStateSignature: 'phase2i-harvest-fixture',
      methods: [{
        id: 'controlled_base',
        label: 'Controlled Rare base',
        costChaos: 0,
        confidence: 'known',
        provenance: 'Diagnostic-only starting state for the shared Harvest mechanic.',
        approximate: false,
        executable: false,
      }],
    }],
    methodCount: 1,
    distinctPhysicalStateCount: 1,
    selectionSafe: true,
    stage: {
      mode: 'NO_FRACTURE_CANDIDATES',
      candidateCount: 0,
      attemptedCandidates: 0,
      certifiedCandidates: 0,
      cacheHits: 0,
      totalStateBudget: 0,
      totalWallTimeBudgetMs: 0,
      maxExpansionRoundsPerCandidate: 0,
      elapsedMs: 0,
      allocation: 'No fracture candidates in controlled Harvest stage fixture.',
      cacheIdentity: 'not applicable',
    },
  },
  proof: { globalOptimality: 'PROVEN OVER MODELED ACTIONS' },
};
const craftPlan = buildCraftPlan(source);
const selectedHarvestActionIds = search.expectedActionUsage
  .filter((usage) => usage.expectedCount > 0 && usage.actionId.startsWith('harvest_reforge_'))
  .map((usage) => usage.actionId);
const representedHarvestActionIds = craftPlan.steps
  .filter((step) => step.phase === 'SPECIALIZED')
  .flatMap((step) => step.actionIds)
  .filter((actionId) => actionId.startsWith('harvest_reforge_'));

if (
  !search.onPolicyGraph.isProper ||
  !search.convergence.converged ||
  !search.reconciliation.isReconciled ||
  selectedHarvestActionIds.length === 0 ||
  !selectedHarvestActionIds.every((actionId) => representedHarvestActionIds.includes(actionId)) ||
  craftPlan.uncoveredActionIds.length > 0 ||
  craftPlan.inventedActionIds.length > 0
) {
  throw new Error(`Selected Harvest action was not preserved: ${JSON.stringify({
    selectedHarvestActionIds,
    representedHarvestActionIds,
    craftPlan,
  })}`);
}

const lines = [
  'PHASE 2I — SELECTED HARVEST / SPECIALIZED PLAN DIAGNOSTIC',
  `shared solver status=${search.optimalityProof.selectedPolicyStatus}; U=${search.totalExpectedCostChaos.toFixed(9)}c; elapsed=${elapsedMs}ms`,
  `proper=${search.onPolicyGraph.isProper}; absorption=${search.onPolicyGraph.terminalAbsorptionProbability.toFixed(12)}; Bellman=${search.convergence.converged}; occupancy=${search.reconciliation.visitConverged}; reconciled=${search.reconciliation.isReconciled}`,
  `fixture=symmetric diagnostic pool; real shared harvest_reforge_defences mechanic and PriceBook; exact selected on-policy rules=${search.onPolicyRules.length}`,
  `selected Harvest actions=${selectedHarvestActionIds.join(',')}`,
  `specialized plan actions=${representedHarvestActionIds.join(',')}`,
  `compact steps=${craftPlan.steps.map((step, index) => `${index + 1}:${step.phase}[${step.actionIds.join(',') || 'terminal'}]`).join(' | ')}`,
  `coverage=uncovered:${craftPlan.uncoveredActionIds.join(',') || 'NONE'}; invented:${craftPlan.inventedActionIds.join(',') || 'NONE'}`,
  `Harvest stage preservation=${selectedHarvestActionIds.every((actionId) => representedHarvestActionIds.includes(actionId)) ? 'PASS' : 'FAIL'}`,
  'This diagnostic selects the same shared harvest_reforge_defences mechanic used by the existing external-parity fixture; the stage classification contains no target/Craft-specific branch.',
];

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
