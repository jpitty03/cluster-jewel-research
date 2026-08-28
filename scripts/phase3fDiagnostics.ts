import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import type { CraftPlanDecisionGroup } from '../crafting-engine/src/service/craftPlan.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
  type OptimizeCraftResult,
  type PolicyExplanationRule,
} from '../crafting-engine/src/service/optimizerService.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const evidenceDirectory = join(repositoryRoot, 'quality-lab', 'reports', 'evidence');
const evidencePath = join(
  evidenceDirectory,
  'phase3f-craft-plan-decision-fidelity-diagnostic.json',
);
const outputPath = join(
  repositoryRoot,
  'output-phase3f-craft-plan-decision-fidelity-diagnostic.txt',
);

const currencyRates = {
  chaos: 1,
  divine: 213.5,
  fracturing: 298.6,
  annul: 11.66,
  exalt: 1.17,
  scour: 0.5391,
  alteration: 0.1336,
  transmutation: 0.005012,
  augmentation: 0.03941,
  regal: 0.03638,
  wildLifeforce: 0.02377,
  vividLifeforce: 0.08208,
  primalLifeforce: 0.04085,
};

const fieldInput: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: 'Minions deal 10% increased Damage',
  itemLevel: 84,
  passiveCount: 8,
  target: {
    requiredMods: [
      { modId: 'Primordial Bond' },
      { modId: 'Renewal' },
      { modId: 'Rotten Claws' },
    ],
    requiredRarity: 'rare',
  },
  prices: {
    currencyRates,
    cleanBaseCostChaos: 40,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance:
      'Phase 3F frozen Primordial Bond + Renewal + Rotten Claws field fixture',
  },
  expectedSaleValueChaos: 1708,
  objective: { kind: 'CHEAPEST_CHAOS' },
  searchBudget: {
    preset: 'NORMAL',
    maxStates: 5_000,
    maxWallTimeMs: 30_000,
    maxExpansionRounds: 3,
  },
  searchIntent: 'RECOMMEND',
  allowResearchFallbackPrices: true,
  compareMethodFamilies: false,
};

const cleanControlInput: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: '10% increased Attack Damage',
  itemLevel: 84,
  passiveCount: 8,
  target: {
    requiredMods: [{ modId: 'AfflictionJewelSmallPassivesGrantES3' }],
    requiredRarity: 'magic',
  },
  prices: {
    currencyRates,
    cleanBaseCostChaos: 1,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 3F non-fracture presentation control',
  },
  objective: { kind: 'CHEAPEST_CHAOS' },
  searchBudget: { preset: 'CUSTOM', maxStates: 1_200, maxWallTimeMs: 10_000, maxExpansionRounds: 2 },
  searchIntent: 'RECOMMEND',
  allowResearchFallbackPrices: true,
  compareMethodFamilies: false,
};

const harvestControlInput: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: '10% increased Attack Damage',
  itemLevel: 1,
  passiveCount: 8,
  target: {
    requiredMods: [{ modId: 'AfflictionJewelSmallPassivesGrantArmour' }],
    requiredRarity: 'rare',
  },
  prices: {
    currencyRates,
    cleanBaseCostChaos: 1,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 3F Harvest-capable presentation control',
  },
  harvestTags: ['defences'],
  objective: { kind: 'CHEAPEST_CHAOS' },
  searchBudget: { preset: 'CUSTOM', maxStates: 2_000, maxWallTimeMs: 15_000, maxExpansionRounds: 2 },
  searchIntent: 'RECOMMEND',
  allowResearchFallbackPrices: true,
  compareMethodFamilies: false,
};

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function sorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function approximate(actual: number, expected: number, label: string): void {
  assert(Math.abs(actual - expected) <= 1e-9, `${label}: ${actual} != ${expected}`);
}

function assertRuleContext(rule: PolicyExplanationRule, label: string): void {
  assert.equal(rule.context.prefixCount, rule.context.prefixes.length, `${label} prefix count`);
  assert.equal(rule.context.suffixCount, rule.context.suffixes.length, `${label} suffix count`);
  assert.equal(rule.sourceStateKeys.length, rule.representedStateCount, `${label} source identities`);
  const overlap = rule.context.matchedTargetModIds.filter((targetModId) =>
    rule.context.unmatchedTargetModIds.includes(targetModId)
  );
  assert.deepEqual(overlap, [], `${label} matched/missing overlap`);
  assert.deepEqual(
    sorted([...rule.context.matchedTargetModIds, ...rule.context.unmatchedTargetModIds]),
    sorted(rule.context.targetModIds),
    `${label} target progress reconciliation`,
  );
  assert(rule.context.prefixes.every((affix) => typeof affix.isFractured === 'boolean'));
  assert(rule.context.suffixes.every((affix) => typeof affix.isFractured === 'boolean'));
}

function assertDecisionEvidence(
  result: OptimizeCraftResult,
  group: CraftPlanDecisionGroup,
  label: string,
): void {
  assert.equal(group.evidenceStatus, 'RECONCILED');
  assert.deepEqual(
    sorted(group.cohort.policyRuleIndices.map(String)),
    sorted(group.options.flatMap((option) => option.policyRuleIndices).map(String)),
    `${label} group/option rule coverage`,
  );
  for (const option of group.options) {
    const rules = option.policyRuleIndices.map((index) => {
      const rule = result.policyExplanation[index];
      assert(rule, `${label} omitted policy rule ${index}`);
      return rule;
    });
    assert(rules.length > 0, `${label} ${option.actionId} omitted its example rule`);
    assert(rules.every((rule) => rule.actionId === option.actionId), `${label} action mismatch`);
    assert.equal(
      rules.reduce((sum, rule) => sum + rule.representedStateCount, 0),
      option.representedStateCount,
      `${label} ${option.actionId} represented states`,
    );
    approximate(
      rules.reduce((sum, rule) => sum + rule.expectedVisits, 0),
      option.expectedVisits,
      `${label} ${option.actionId} visits`,
    );
    for (const [index, rule] of rules.entries()) {
      assertRuleContext(rule, `${label}/${option.actionId}/${index}`);
      assert.equal(rule.context.policyScope, group.cohort.policyScope);
      assert.equal(rule.context.progressKind, group.cohort.progressKind);
      assert.equal(rule.context.rarity, group.cohort.rarity);
      assert.deepEqual(sorted(rule.context.targetModIds), sorted(group.cohort.targetModIds));
    }
  }
}

function optionEvidence(group: CraftPlanDecisionGroup, actionId: string) {
  const option = group.options.find((candidate) => candidate.actionId === actionId);
  assert(option, `Decision group omitted ${actionId}`);
  return option;
}

function run(): void {
  const repository = new ClusterModRepository();
  const field = new OptimizerService(repository).optimize(fieldInput);

  // F1: frozen route identity is diagnostic evidence, not production selection logic.
  assert(field.recommended, 'F1 field route did not resolve');
  assert.equal(field.recommended.name, 'Self-fracture Primordial Bond');
  assert(field.expectedCostChaos !== null);
  approximate(field.expectedCostChaos, 1459.7923662160777, 'F1 selected U');
  assert.equal(field.policyFlow?.status, 'CERTIFIED');
  assert.equal(field.craftPlan.status, 'CERTIFIED');
  assert.deepEqual(field.craftPlan.withheldDecisionDetails, []);

  // F2/F3: the Promote cohort is a state-derived Magic preparation cohort.
  const promoteStep = field.craftPlan.steps.find((step) => step.phase === 'PROMOTE');
  assert(promoteStep, 'F2 field plan omitted PROMOTE');
  const promote = promoteStep.decisionDetails.find((group) =>
    group.cohort.policyScope === 'ACQUISITION' &&
    group.cohort.progressKind === 'PREPARATION' &&
    group.cohort.rarity === 'magic'
  );
  assert(promote, 'F2 field plan omitted the Magic preparation cohort');
  assert.equal(promote.cohort.focalPhase, 'PROMOTE');
  assertDecisionEvidence(field, promote, 'F2 Promote');
  const promoteActions = sorted(promote.options.map((option) => option.actionId));
  assert.deepEqual(promoteActions, sorted(['alteration_orb', 'augmentation_orb', 'regal_orb']));
  for (const forbidden of [
    'transmutation_orb',
    'exalted_orb',
    'fracturing_orb',
    'scouring_orb',
    'restart_reacquire',
  ]) {
    assert(!promoteActions.includes(forbidden), `F2 Promote included ${forbidden}`);
  }
  const alter = optionEvidence(promote, 'alteration_orb');
  const augment = optionEvidence(promote, 'augmentation_orb');
  const regal = optionEvidence(promote, 'regal_orb');
  assert.equal(alter.representedStateCount, 208);
  approximate(alter.expectedVisits, 323.68085106349275, 'F3 Alter visits');
  assert.equal(augment.representedStateCount, 13);
  approximate(augment.expectedVisits, 82.92021276587121, 'F3 Augment visits');
  assert.equal(regal.representedStateCount, 1);
  approximate(regal.expectedVisits, 3.9999999999958216, 'F3 Regal visits');

  // F4: every rendered option is backed by exact, internally consistent rules.
  const allDecisionGroups = field.craftPlan.steps.flatMap((step) => step.decisionDetails);
  for (const group of allDecisionGroups) assertDecisionEvidence(field, group, `F4 ${group.id}`);
  assert(field.policyExplanation.every((rule) => {
    if (rule.context.acquisitionMenu) return true;
    assertRuleContext(rule, `F4 policy ${rule.actionId}`);
    return true;
  }));

  // F5: exact Rare finishing states still retain Exalt-vs-Scour contrasts.
  const finishStep = field.craftPlan.steps.find((step) => step.phase === 'FINISH');
  assert(finishStep, 'F5 field plan omitted FINISH');
  const finishContrasts = finishStep.decisionDetails.filter((group) => {
    const actions = new Set(group.options.map((option) => option.actionId));
    return actions.has('exalted_orb') && actions.has('scouring_orb');
  });
  assert(finishContrasts.length > 0, 'F5 omitted Exalt-vs-Scour');
  assert(finishContrasts.every((group) =>
    group.cohort.policyScope === 'DOWNSTREAM' &&
    group.cohort.progressKind === 'FINAL' &&
    group.cohort.rarity === 'rare'
  ));

  // F6: preparation and final-target semantics are explicit and never mixed.
  assert.equal(promote.cohort.targetModIds.length, 1);
  assert.deepEqual(promote.cohort.targetModIds, ['Primordial Bond']);
  assert(finishContrasts.every((group) => group.cohort.targetModIds.length === 3));
  assert(!promote.summary.toLowerCase().includes('final-craft'));
  assert(finishContrasts.every((group) => !group.summary.toLowerCase().includes('preparation')));

  // F7: a clean non-fracture policy uses the same evidence contract without
  // acquiring a fabricated preparation scope.
  const clean = new OptimizerService(repository).optimize(cleanControlInput);
  assert(clean.recommended, 'F7 clean control did not resolve');
  assert.equal(clean.craftPlan.status, 'CERTIFIED');
  assert.deepEqual(clean.craftPlan.withheldDecisionDetails, []);
  assert(!clean.policyExplanation.some((rule) =>
    !rule.context.acquisitionMenu && rule.context.progressKind === 'PREPARATION'
  ));
  for (const group of clean.craftPlan.steps.flatMap((step) => step.decisionDetails)) {
    assertDecisionEvidence(clean, group, `F7 ${group.id}`);
  }

  // F8: Harvest capability comes only from the enabled registry/policy rules;
  // the craft plan cannot invent a specialized action.
  const harvest = new OptimizerService(repository).optimize(harvestControlInput);
  assert(harvest.recommended, 'F8 Harvest control did not resolve');
  assert.equal(harvest.craftPlan.status, 'CERTIFIED');
  assert.deepEqual(harvest.craftPlan.withheldDecisionDetails, []);
  const enabledHarvestIds = harvest.search.harvestActionScope.enabledCrafts
    .map((craft) => craft.actionId);
  assert(enabledHarvestIds.length > 0, 'F8 Harvest control enabled no Harvest mechanics');
  const policyHarvestIds = sorted(harvest.policyExplanation
    .map((rule) => rule.actionId)
    .filter((actionId) => actionId.startsWith('harvest_reforge_')));
  const planHarvestIds = sorted(harvest.craftPlan.representedActionIds
    .filter((actionId) => actionId.startsWith('harvest_reforge_')));
  assert(planHarvestIds.every((actionId) => policyHarvestIds.includes(actionId)));
  assert(policyHarvestIds.every((actionId) => enabledHarvestIds.includes(actionId)));
  for (const group of harvest.craftPlan.steps.flatMap((step) => step.decisionDetails)) {
    assertDecisionEvidence(harvest, group, `F8 ${group.id}`);
  }

  const evidence = {
    phase: '3F',
    generatedAt: new Date().toISOString(),
    rootCause: {
      source: 'synthesisPolicyExplanation',
      before:
        'Exact acquisition policy states were flattened to fabricated rare 0P/0S empty-affix contexts.',
      after:
        'AcquisitionPolicyRule carries exact structured source-state context into PolicyExplanationRule.',
    },
    F1_frozenRoute: {
      name: field.recommended.name,
      expectedCostChaos: field.expectedCostChaos,
      recommendationStatus: field.recommendationStatus,
      policyFlowStatus: field.policyFlow?.status,
      policyFingerprint: field.policyFlow?.sourcePolicyFingerprint,
      topologyFingerprint: field.policyFlow?.topology.fingerprint,
      exactFlowFingerprint: field.policyFlow?.aggregation.exactFlowFingerprint,
    },
    F2_promoteCohort: promote,
    F3_aggregates: {
      alteration_orb: alter,
      augmentation_orb: augment,
      regal_orb: regal,
    },
    F4_ruleConsistency: {
      policyExplanationRules: field.policyExplanation.length,
      decisionGroups: allDecisionGroups.length,
      withheldGroups: field.craftPlan.withheldDecisionDetails.length,
      promoteExamples: Object.fromEntries(promote.options.map((option) => {
        const policyRuleIndex = option.policyRuleIndices[0];
        const rule = field.policyExplanation[policyRuleIndex];
        return [option.actionId, {
          policyRuleIndex,
          sourceStateKeys: rule.sourceStateKeys,
          actionId: rule.actionId,
          exampleState: rule.exampleState,
          context: rule.context,
        }];
      })),
    },
    F5_finishContrast: finishContrasts,
    F6_progressScopes: {
      preparationTargetModIds: promote.cohort.targetModIds,
      finalTargetModIds: finishContrasts[0].cohort.targetModIds,
    },
    F7_nonFractureControl: {
      selectedRoute: clean.recommended.name,
      policyRules: clean.policyExplanation.length,
      decisionGroups: clean.craftPlan.detailedDecisionCount,
    },
    F8_harvestControl: {
      selectedRoute: harvest.recommended.name,
      enabledHarvestIds,
      policyHarvestIds,
      planHarvestIds,
      decisionGroups: harvest.craftPlan.detailedDecisionCount,
    },
    prohibitions: {
      unitTestsAddedOrRun: false,
      mechanicsProbabilityChanged: false,
      hardcodedProductionWinner: false,
      craftSpecificProductionBranch: false,
      stateIdentityWeakened: false,
      marketFracturedRanking: false,
    },
  };
  mkdirSync(evidenceDirectory, { recursive: true });
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  const lines = [
    'PHASE 3F CRAFT-PLAN DECISION FIDELITY DIAGNOSTIC',
    `F1 route=${field.recommended.name}; U=${field.expectedCostChaos}; flow=${field.policyFlow?.status}=PASS`,
    `F2 Promote scope=${promote.cohort.policyScope}/${promote.cohort.progressKind}/${promote.cohort.rarity}; actions=${promoteActions.join(',')}=PASS`,
    `F3 Alter=${alter.representedStateCount}/${alter.expectedVisits}; Augment=${augment.representedStateCount}/${augment.expectedVisits}; Regal=${regal.representedStateCount}/${regal.expectedVisits}=PASS`,
    `F4 rules=${field.policyExplanation.length}; groups=${allDecisionGroups.length}; withheld=0=PASS`,
    `F5 Exalt-vs-Scour groups=${finishContrasts.length}=PASS`,
    `F6 preparation=${promote.cohort.targetModIds.length}; final=${finishContrasts[0].cohort.targetModIds.length}=PASS`,
    `F7 clean=${clean.recommended.name}; preparationRules=0=PASS`,
    `F8 harvest enabled=${enabledHarvestIds.length}; policy=${policyHarvestIds.length}; plan=${planHarvestIds.length}=PASS`,
    `Evidence SHA-256: ${sha256(JSON.stringify(evidence))}`,
    'Unit tests added/run: NO',
    'EXTENDED/nightly/legacy/long-soak run: NO',
  ];
  writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(lines.join('\n'));
}

run();
