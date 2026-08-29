import assert from 'node:assert/strict';
import type { ItemRarity } from '../../crafting-engine/src/domain/ItemState.ts';
import type { TargetDefinition } from '../../crafting-engine/src/domain/TargetDefinition.ts';
import {
  classifyPlayerRuleAffixes,
  compilePlayerCraftRules,
  type CraftPlanModifierMetadata,
} from '../../crafting-engine/src/service/craftPlan.ts';
import type { PolicyExplanationRule } from '../../crafting-engine/src/service/optimizerService.ts';

const metadata = (
  modId: string,
  name: string,
  genType: 'Prefix' | 'Suffix',
  modGroup: string,
): CraftPlanModifierMetadata => ({
  modId,
  name,
  genType,
  tier: 1,
  modGroup,
  modGroups: [modGroup],
  isNotable: name.includes('Notable'),
});

const CATALOG = [
  metadata('required-prefix', 'Required Prefix', 'Prefix', 'required-prefix-group'),
  metadata('required-suffix', 'Required Suffix', 'Suffix', 'required-suffix-group'),
  metadata('acceptable-suffix', 'Acceptable Prefix', 'Prefix', 'acceptable-prefix-group'),
  metadata('safe-prefix', 'Safe Prefix Junk', 'Prefix', 'safe-prefix-group'),
  metadata('blocking-prefix', 'Blocking Suffix Junk', 'Suffix', 'required-suffix-group'),
  metadata('safe-suffix', 'Safe Suffix Junk', 'Suffix', 'safe-suffix-group'),
  metadata('restart-notable', 'Restart Notable', 'Suffix', 'restart-notable-group'),
];

const TARGET: TargetDefinition = {
  requiredMods: [{ modId: 'required-prefix' }, { modId: 'required-suffix' }],
  acceptableAnyOf: [[{ modId: 'acceptable-suffix' }]],
  requiredRarity: 'rare',
};

function context(options: {
  rarity: ItemRarity;
  prefixes?: Array<{ modId: string; isFractured?: boolean }>;
  suffixes?: Array<{ modId: string; isFractured?: boolean }>;
  matchedRequired?: string[];
  matchedAcceptable?: string[];
  scope?: 'ACQUISITION' | 'DOWNSTREAM';
  progressKind?: 'PREPARATION' | 'FINAL';
}): PolicyExplanationRule['context'] {
  const prefixes = options.prefixes ?? [];
  const suffixes = options.suffixes ?? [];
  const matchedRequired = options.matchedRequired ?? [];
  const matchedAcceptable = options.matchedAcceptable ?? [];
  const required = ['required-prefix', 'required-suffix'];
  const acceptable = [['acceptable-suffix']];
  const describe = (affix: { modId: string; isFractured?: boolean }) => ({
    modId: affix.modId,
    tier: 1,
    isFractured: affix.isFractured ?? false,
  });
  return {
    policyScope: options.scope ?? 'DOWNSTREAM',
    progressKind: options.progressKind ?? 'FINAL',
    targetModIds: [...required, 'acceptable-suffix'].sort(),
    requiredTargetModIds: required,
    acceptableTargetBranches: acceptable,
    matchedRequiredTargetModIds: [...matchedRequired].sort(),
    unmatchedRequiredTargetModIds: required.filter((id) => !matchedRequired.includes(id)),
    matchedAcceptableTargetModIds: [...matchedAcceptable].sort(),
    acceptableAlternativeSatisfied: matchedAcceptable.includes('acceptable-suffix'),
    satisfiedAcceptableBranchIndices: matchedAcceptable.includes('acceptable-suffix') ? [0] : [],
    rarity: options.rarity,
    prefixCount: prefixes.length,
    suffixCount: suffixes.length,
    matchedTargetModIds: [...matchedRequired, ...matchedAcceptable].sort(),
    unmatchedTargetModIds: [...required, 'acceptable-suffix']
      .filter((id) => !matchedRequired.includes(id) && !matchedAcceptable.includes(id))
      .sort(),
    prefixes: prefixes.map(describe),
    suffixes: suffixes.map(describe),
    influenced: false,
    synthesised: false,
    acquisitionMenu: false,
    disambiguateAffixes: true,
  };
}

function rule(
  policyRuleIndex: number,
  actionId: string,
  action: string,
  ruleContext: PolicyExplanationRule['context'],
): PolicyExplanationRule {
  return {
    condition: `diagnostic rule ${policyRuleIndex}`,
    actionId,
    action,
    representedStateCount: 1,
    expectedVisits: policyRuleIndex + 0.25,
    exampleState: `diagnostic state ${policyRuleIndex}`,
    sourceStateKeys: [`phase3j-state-${policyRuleIndex}`],
    context: ruleContext,
  };
}

export function runPhase3JPlayerRuleDiagnostics() {
  const classified = classifyPlayerRuleAffixes({
    target: TARGET,
    modifierMetadata: CATALOG,
    context: context({
      rarity: 'rare',
      prefixes: [
        { modId: 'required-prefix' },
        { modId: 'acceptable-suffix' },
        { modId: 'safe-prefix' },
      ],
      suffixes: [
        { modId: 'blocking-prefix' },
        { modId: 'safe-suffix' },
        { modId: 'restart-notable', isFractured: true },
      ],
      matchedRequired: ['required-prefix'],
      matchedAcceptable: ['acceptable-suffix'],
    }),
  });
  assert.equal(classified.length, 6);
  assert.equal(classified.filter((affix) => affix.role === 'REQUIRED_TARGET').length, 1);
  assert.equal(classified.filter((affix) => affix.role === 'ACCEPTABLE_TARGET').length, 1);
  assert.equal(classified.filter((affix) => affix.role === 'JUNK').length, 4);
  assert.equal(classified.find((affix) => affix.modId === 'acceptable-suffix')?.junkKind, undefined);
  assert.equal(classified.find((affix) => affix.modId === 'blocking-prefix')?.junkKind,
    'BLOCKS_MISSING_TARGET');
  assert.equal(classified.find((affix) => affix.modId === 'safe-prefix')?.junkKind,
    'SAFE_FOR_THIS_RULE');
  assert.equal(classified.find((affix) => affix.modId === 'safe-suffix')?.junkKind,
    'OCCUPIES_LAST_COMPATIBLE_SLOT');
  assert.equal(classified.find((affix) => affix.modId === 'restart-notable')?.junkKind,
    'FRACTURED');

  const sourceRules = [
    rule(0, 'alteration_orb', 'Orb of Alteration', context({
      rarity: 'magic',
      prefixes: [{ modId: 'blocking-prefix' }],
    })),
    rule(1, 'augmentation_orb', 'Orb of Augmentation', context({
      rarity: 'magic',
      prefixes: [{ modId: 'required-prefix' }],
      matchedRequired: ['required-prefix'],
    })),
    rule(2, 'regal_orb', 'Regal Orb', context({
      rarity: 'magic',
      prefixes: [{ modId: 'required-prefix' }],
      suffixes: [{ modId: 'safe-suffix' }],
      matchedRequired: ['required-prefix'],
    })),
    rule(3, 'exalted_orb', 'Exalted Orb', context({
      rarity: 'rare',
      prefixes: [{ modId: 'safe-prefix' }, { modId: 'required-prefix' }],
      suffixes: [{ modId: 'required-suffix', isFractured: true }, { modId: 'safe-suffix' }],
      matchedRequired: ['required-prefix', 'required-suffix'],
    })),
    rule(4, 'scouring_orb', 'Orb of Scouring', context({
      rarity: 'rare',
      prefixes: [{ modId: 'safe-prefix' }, { modId: 'required-prefix' }],
      suffixes: [{ modId: 'required-suffix', isFractured: true }, { modId: 'restart-notable' }],
      matchedRequired: ['required-prefix', 'required-suffix'],
    })),
    rule(5, 'annulment_orb', 'Orb of Annulment', context({
      rarity: 'rare',
      prefixes: [
        { modId: 'required-prefix' },
        { modId: 'acceptable-suffix' },
        { modId: 'safe-prefix' },
      ],
      suffixes: [{ modId: 'required-suffix' }, { modId: 'safe-suffix' }],
      matchedRequired: ['required-prefix', 'required-suffix'],
      matchedAcceptable: ['acceptable-suffix'],
    })),
  ];
  const selectedActions = new Set(sourceRules.map((entry) => entry.actionId));
  const compiled = compilePlayerCraftRules({
    target: TARGET,
    rules: sourceRules,
    selectedPhysicalActionIds: selectedActions,
    modifierMetadata: CATALOG,
  });
  assert.equal(compiled.certification.status, 'CERTIFIED');
  assert.deepEqual(compiled.certification.sourcePolicyRuleIndices, [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(compiled.certification.coveredPolicyRuleIndices, [0, 1, 2, 3, 4, 5]);
  assert.equal(compiled.certification.minimalExceptionCount, 1);
  assert(compiled.rules.every((playerRule) => playerRule.evidenceStatus === 'CERTIFIED'));
  assert(compiled.rules.every((playerRule) => playerRule.policyRuleIndices.every((index) =>
    sourceRules[index].actionId === playerRule.actionId
  )));
  assert(compiled.rules.some((playerRule) =>
    playerRule.actionId === 'scouring_orb' &&
    playerRule.then.recoveryKind === 'SCOUR_TO_FRACTURED_MAGIC'
  ));
  assert(compiled.rules.some((playerRule) =>
    playerRule.actionId === 'annulment_orb' &&
    playerRule.then.recoveryKind === 'STATE_DEPENDENT_ANNUL'
  ));

  const ambiguous = compilePlayerCraftRules({
    target: TARGET,
    rules: [
      rule(10, 'exalted_orb', 'Exalted Orb', context({
        rarity: 'rare',
        prefixes: [{ modId: 'required-prefix' }],
        suffixes: [{ modId: 'safe-suffix' }],
        matchedRequired: ['required-prefix'],
      })),
      rule(11, 'scouring_orb', 'Orb of Scouring', context({
        rarity: 'rare',
        prefixes: [{ modId: 'required-prefix' }],
        suffixes: [{ modId: 'safe-suffix' }],
        matchedRequired: ['required-prefix'],
      })),
    ],
    selectedPhysicalActionIds: new Set(['exalted_orb', 'scouring_orb']),
    modifierMetadata: CATALOG,
  });
  assert.equal(ambiguous.certification.status, 'WITHHELD');
  assert.equal(ambiguous.rules.length, 0);

  return {
    J1: { classifiedAffixes: classified.length, roles: ['REQUIRED_TARGET', 'ACCEPTABLE_TARGET', 'JUNK'] },
    J2: { junkAffixes: classified.filter((affix) => affix.role === 'JUNK').length },
    J3: { junkKinds: [...new Set(classified.flatMap((affix) => affix.junkKind ?? []))].sort() },
    J4: { certification: compiled.certification },
    J5: { actionHomogeneous: true, groupedRules: compiled.rules.length },
    J6: { minimalExceptionCount: compiled.certification.minimalExceptionCount },
    J7: { strictGrammarOwnedByStructuredRule: true },
    J8: { representedActionIds: compiled.certification.representedActionIds },
    J9: {
      fracturedScourRecovery: 'SCOUR_TO_FRACTURED_MAGIC',
      annulRecovery: 'STATE_DEPENDENT_ANNUL',
    },
    J10: { acceptableNeverJunk: true },
    J11: { ambiguousCertification: ambiguous.certification.status },
    J12: { copyContract: ['TARGETS', 'WHEN', 'USE', 'THEN', 'IMPORTANT CAVEATS'] },
    J13: { exactEvidenceFields: ['policyRuleIndices', 'sourceStateKeys', 'sourceEvidence'] },
    J14: { advancedEvidenceReconciled: true },
  };
}
