import { getAllTargetModRequirements, type TargetDefinition } from '../domain/TargetDefinition.ts';
import {
  CRAFT_MECHANICS,
  type DiscoveredActionType,
} from '../rules/actionRegistry.ts';
import { HARVEST_CRAFT_DEFINITIONS } from '../rules/harvestCrafts.ts';
import type {
  AcquisitionSummary,
  ExpectedActionUsage,
  PolicyExplanationRule,
  RecommendationStatus,
  RouteSummary,
} from './optimizerService.ts';

export type CraftPlanPhase =
  | 'ACQUIRE'
  | 'INITIALIZE'
  | 'ROLL'
  | 'FILL'
  | 'PROMOTE'
  | 'FINISH'
  | 'SPECIALIZED'
  | 'RECOVER'
  | 'SUCCESS';

export interface TargetOrderBehaviorEvidence {
  targetModId: string;
  representedMagicStates: number;
  expectedVisits: number;
  preserveStates: number;
  preserveVisits: number;
  rerollStates: number;
  rerollVisits: number;
  selectedActions: Array<{
    actionId: string;
    representedStates: number;
    expectedVisits: number;
  }>;
}

export type TargetOrderPreference =
  | {
      kind: 'NONE';
      targetModIds: [];
      strength: 'NONE';
      evidence: string;
      behaviors: TargetOrderBehaviorEvidence[];
    }
  | {
      kind: 'PREFER_TARGET_FIRST';
      targetModIds: string[];
      strength: 'CLEAR' | 'SOFT';
      evidence: string;
      behaviors: TargetOrderBehaviorEvidence[];
    };

export interface CraftPlanDecisionOption {
  actionId: string;
  action: string;
  representedStateCount: number;
  expectedVisits: number;
  /** Exact service policy rules supporting this compressed option. */
  policyRuleIndices: number[];
}

export interface CraftPlanDecisionGroup {
  id: string;
  summary: string;
  representedStateCount: number;
  expectedVisits: number;
  options: CraftPlanDecisionOption[];
}

export interface CraftPlanStep {
  id: string;
  phase: CraftPlanPhase;
  title: string;
  instruction: string;
  actionIds: string[];
  actionNames: string[];
  targetProgressBefore?: number;
  targetProgressAfter?: number;
  preferredTargetModIds?: string[];
  decisionDetails: CraftPlanDecisionGroup[];
  recoveryTargetStepId?: string;
}

export interface CraftPlanRecovery {
  actionIds: string[];
  returnToStepId?: string;
  provenance: string;
}

export interface CraftPlanSummary {
  status: 'CERTIFIED' | 'UNCERTIFIED';
  startingPoint: string;
  steps: CraftPlanStep[];
  recovery?: CraftPlanRecovery;
  targetOrderPreference: TargetOrderPreference;
  detailedDecisionCount: number;
  exactPolicyBranchCount: number;
  exactPolicyBranchesHiddenByDefault: number;
  selectedActionIds: string[];
  representedActionIds: string[];
  uncoveredActionIds: string[];
  inventedActionIds: string[];
  optimalityNote?: string;
  provenance: string;
}

export interface CraftPlanSource {
  target: TargetDefinition;
  recommendationStatus: RecommendationStatus;
  recommended: RouteSummary | null;
  expectedActionUsage: ExpectedActionUsage[];
  policyExplanation: PolicyExplanationRule[];
  acquisition: AcquisitionSummary;
  proof: {
    globalOptimality: 'PROVEN OVER MODELED ACTIONS' | 'NOT YET PROVEN';
  };
}

const PHASE_ORDER: CraftPlanPhase[] = [
  'ACQUIRE',
  'INITIALIZE',
  'ROLL',
  'FILL',
  'PROMOTE',
  'FINISH',
  'SPECIALIZED',
  'RECOVER',
  'SUCCESS',
];

const HARVEST_ACTION_TYPES = new Map(
  Object.values(HARVEST_CRAFT_DEFINITIONS).map((definition) => [
    definition.craftId,
    'HARVEST_REFORGE' as const,
  ])
);

function actionType(actionId: string): DiscoveredActionType | undefined {
  if (actionId === 'restart_reacquire') return 'RESTART_REACQUIRE';
  return CRAFT_MECHANICS.find((mechanic) => mechanic.id === actionId)?.actionType ??
    HARVEST_ACTION_TYPES.get(actionId);
}

export function craftPlanPhaseForAction(actionId: string): CraftPlanPhase | undefined {
  const type = actionType(actionId);
  switch (type) {
    case 'TRANSFORMATION_ORB': return 'INITIALIZE';
    case 'ALTERATION_ORB':
    case 'CHAOS_ORB': return 'ROLL';
    case 'AUGMENTATION_ORB': return 'FILL';
    case 'REGAL_ORB': return 'PROMOTE';
    case 'EXALTED_ORB':
    case 'ANNULMENT_ORB':
    case 'DIVINE_ORB': return 'FINISH';
    case 'HARVEST_REFORGE': return 'SPECIALIZED';
    case 'SCOURING_ORB':
    case 'RESTART_REACQUIRE': return 'RECOVER';
    case 'FRACTURING_ORB': return 'ACQUIRE';
    case 'TERMINAL': return 'SUCCESS';
    default: return undefined;
  }
}

function targetRequirementIds(target: TargetDefinition): string[] {
  return getAllTargetModRequirements(target).map((requirement, index) =>
    requirement.modId ?? requirement.modGroup ?? requirement.name ?? `target_${index + 1}`
  );
}

function deriveTargetOrderPreference(
  target: TargetDefinition,
  rules: PolicyExplanationRule[],
  reacquireActionId?: string,
): TargetOrderPreference {
  const targetIds = targetRequirementIds(target);
  const behaviors: TargetOrderBehaviorEvidence[] = targetIds.map((targetModId) => {
    const applicable = rules.filter((rule) =>
      rule.context.rarity === 'magic' &&
      rule.context.matchedTargetModIds.length === 1 &&
      rule.context.matchedTargetModIds[0] === targetModId &&
      rule.expectedVisits > 0
    );
    const byAction = new Map<string, { representedStates: number; expectedVisits: number }>();
    let preserveStates = 0;
    let preserveVisits = 0;
    let rerollStates = 0;
    let rerollVisits = 0;
    for (const rule of applicable) {
      const action = byAction.get(rule.actionId) ?? { representedStates: 0, expectedVisits: 0 };
      action.representedStates += rule.representedStateCount;
      action.expectedVisits += rule.expectedVisits;
      byAction.set(rule.actionId, action);
      const phase = rule.actionId === reacquireActionId
        ? 'RECOVER'
        : craftPlanPhaseForAction(rule.actionId);
      if (phase === 'FILL' || phase === 'PROMOTE' || phase === 'FINISH' || phase === 'SPECIALIZED') {
        preserveStates += rule.representedStateCount;
        preserveVisits += rule.expectedVisits;
      } else if (phase === 'ROLL' || phase === 'RECOVER') {
        rerollStates += rule.representedStateCount;
        rerollVisits += rule.expectedVisits;
      }
    }
    return {
      targetModId,
      representedMagicStates: applicable.reduce((sum, rule) => sum + rule.representedStateCount, 0),
      expectedVisits: applicable.reduce((sum, rule) => sum + rule.expectedVisits, 0),
      preserveStates,
      preserveVisits,
      rerollStates,
      rerollVisits,
      selectedActions: [...byAction].map(([actionId, evidence]) => ({ actionId, ...evidence }))
        .sort((left, right) => right.expectedVisits - left.expectedVisits || left.actionId.localeCompare(right.actionId)),
    };
  });
  if (behaviors.length < 2) {
    return {
      kind: 'NONE',
      targetModIds: [],
      strength: 'NONE',
      evidence: 'Target order is not applicable to a single-target selected policy.',
      behaviors,
    };
  }
  const behaviorByTarget = new Map(behaviors.map((behavior) => [behavior.targetModId, behavior]));
  const analogous = new Map<string, Map<string, 'PRESERVE' | 'REROLL' | 'MIXED'>>();
  for (const rule of rules) {
    if (
      rule.context.rarity !== 'magic' ||
      rule.context.matchedTargetModIds.length !== 1 ||
      !targetIds.includes(rule.context.matchedTargetModIds[0]) ||
      rule.expectedVisits <= 0
    ) continue;
    const targetModId = rule.context.matchedTargetModIds[0];
    const normalizedAffixes = [
      ...rule.context.prefixes.map((affix) => ({ side: 'P', ...affix })),
      ...rule.context.suffixes.map((affix) => ({ side: 'S', ...affix })),
    ].filter((affix) => !targetIds.includes(affix.modId))
      .map((affix) => ({
        side: affix.side,
        modId: affix.modId,
        tier: affix.tier,
        isFractured: affix.isFractured,
        currentRoll: affix.currentRoll,
      }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    const key = JSON.stringify({
      prefixCount: rule.context.prefixCount,
      suffixCount: rule.context.suffixCount,
      affixes: normalizedAffixes,
      influenced: rule.context.influenced,
      synthesised: rule.context.synthesised,
    });
    const phase = rule.actionId === reacquireActionId
      ? 'RECOVER'
      : craftPlanPhaseForAction(rule.actionId);
    const classification = phase === 'FILL' || phase === 'PROMOTE' ||
      phase === 'FINISH' || phase === 'SPECIALIZED'
      ? 'PRESERVE'
      : phase === 'ROLL' || phase === 'RECOVER'
        ? 'REROLL'
        : undefined;
    if (classification === undefined) continue;
    const byTarget = analogous.get(key) ?? new Map<string, 'PRESERVE' | 'REROLL' | 'MIXED'>();
    const previous = byTarget.get(targetModId);
    byTarget.set(targetModId, previous === undefined || previous === classification
      ? classification
      : 'MIXED');
    analogous.set(key, byTarget);
  }
  const directionalDifferences = new Map(targetIds.map((targetModId) => [targetModId, 0]));
  let comparableContexts = 0;
  let equivalentContexts = 0;
  for (const byTarget of analogous.values()) {
    if (!targetIds.every((targetModId) => byTarget.has(targetModId))) continue;
    comparableContexts++;
    const preserved = targetIds.filter((targetModId) => byTarget.get(targetModId) === 'PRESERVE');
    const rerolled = targetIds.filter((targetModId) => byTarget.get(targetModId) === 'REROLL');
    if (preserved.length === 1 && rerolled.length === targetIds.length - 1) {
      directionalDifferences.set(preserved[0], (directionalDifferences.get(preserved[0]) ?? 0) + 1);
    } else {
      equivalentContexts++;
    }
  }
  const favoredTargets = [...directionalDifferences]
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  if (
    comparableContexts === 0 ||
    favoredTargets.length !== 1 ||
    [...directionalDifferences].some(([targetModId, count]) =>
      targetModId !== favoredTargets[0]?.[0] && count > 0
    )
  ) {
    return {
      kind: 'NONE',
      targetModIds: [],
      strength: 'NONE',
      evidence:
        `No consistent identity-specific preservation split across ${comparableContexts} analogous ` +
        `selected-policy Magic contexts: ` +
        behaviors.map((behavior) =>
          `${behavior.targetModId}=${behavior.preserveStates}/${behavior.representedMagicStates}`
        ).join(', ') + '.',
      behaviors,
    };
  }
  const preferred = behaviorByTarget.get(favoredTargets[0][0])!;
  const runnerUp = behaviors.find((behavior) => behavior.targetModId !== preferred.targetModId)!;
  return {
    kind: 'PREFER_TARGET_FIRST',
    targetModIds: [preferred.targetModId],
    strength: equivalentContexts === 0 ? 'CLEAR' : 'SOFT',
    evidence:
      `Across ${comparableContexts} analogous selected-policy Magic contexts, all ` +
      `${favoredTargets[0][1]} identity-specific preserve/reroll differences favor ${preferred.targetModId}; ` +
      `${equivalentContexts} contexts do not distinguish target identity. Aggregate preservation is ` +
      `${preferred.targetModId} ${preferred.preserveStates}/${preferred.representedMagicStates} versus ` +
      `${runnerUp.targetModId} ${runnerUp.preserveStates}/${runnerUp.representedMagicStates}.`,
    behaviors,
  };
}

function coarseContextKey(context: PolicyExplanationRule['context']): string {
  return JSON.stringify({
    rarity: context.rarity,
    prefixCount: context.prefixCount,
    suffixCount: context.suffixCount,
    matchedTargetModIds: context.matchedTargetModIds,
    unmatchedTargetModIds: context.unmatchedTargetModIds,
    influenced: context.influenced,
    synthesised: context.synthesised,
    acquisitionMenu: context.acquisitionMenu,
  });
}

function decisionGroups(rules: PolicyExplanationRule[]): Array<{
  group: CraftPlanDecisionGroup;
  phase: CraftPlanPhase;
}> {
  const contexts = new Map<string, number[]>();
  for (const [index, rule] of rules.entries()) {
    if (rule.context.acquisitionMenu) continue;
    const key = coarseContextKey(rule.context);
    const indices = contexts.get(key) ?? [];
    indices.push(index);
    contexts.set(key, indices);
  }
  const phasePriority: CraftPlanPhase[] = [
    'PROMOTE',
    'FINISH',
    'FILL',
    'SPECIALIZED',
    'ROLL',
    'RECOVER',
    'INITIALIZE',
    'ACQUIRE',
    'SUCCESS',
  ];
  const groups: Array<{ group: CraftPlanDecisionGroup; phase: CraftPlanPhase }> = [];
  for (const indices of contexts.values()) {
    const distinctActions = new Set(indices.map((index) => rules[index].actionId));
    if (distinctActions.size < 2) continue;
    const byAction = new Map<string, CraftPlanDecisionOption>();
    for (const index of indices) {
      const rule = rules[index];
      const option = byAction.get(rule.actionId) ?? {
        actionId: rule.actionId,
        action: rule.action,
        representedStateCount: 0,
        expectedVisits: 0,
        policyRuleIndices: [],
      };
      option.representedStateCount += rule.representedStateCount;
      option.expectedVisits += rule.expectedVisits;
      option.policyRuleIndices.push(index);
      byAction.set(rule.actionId, option);
    }
    const phases = [...byAction.keys()]
      .map(craftPlanPhaseForAction)
      .filter((phase): phase is CraftPlanPhase => phase !== undefined);
    const phase = phasePriority.find((candidate) => phases.includes(candidate)) ?? 'SPECIALIZED';
    const first = rules[indices[0]];
    groups.push({
      phase,
      group: {
        id: `decision_${groups.length + 1}`,
        summary:
          `${first.context.rarity} ${first.context.prefixCount}P/${first.context.suffixCount}S states ` +
          'with the same target progress choose different actions based on exact current affixes.',
        representedStateCount: indices.reduce((sum, index) => sum + rules[index].representedStateCount, 0),
        expectedVisits: indices.reduce((sum, index) => sum + rules[index].expectedVisits, 0),
        options: [...byAction.values()].sort((left, right) =>
          right.expectedVisits - left.expectedVisits || left.actionId.localeCompare(right.actionId)
        ),
      },
    });
  }
  return groups;
}

function selectedPolicyPhase(
  actionId: string,
  source: CraftPlanSource,
): CraftPlanPhase | undefined {
  if (
    actionId === source.recommended?.actionId &&
    source.policyExplanation.some((rule) =>
      !rule.context.acquisitionMenu && rule.actionId === actionId && rule.expectedVisits > 0
    )
  ) {
    return 'RECOVER';
  }
  return craftPlanPhaseForAction(actionId);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function actionNamesFor(
  actionIds: string[],
  actionNames: ReadonlyMap<string, string>
): string[] {
  return actionIds.map((actionId) => actionNames.get(actionId) ?? actionId);
}

function joinedActions(actionNames: string[]): string {
  if (actionNames.length <= 1) return actionNames[0] ?? 'the selected action';
  return `${actionNames.slice(0, -1).join(', ')} and ${actionNames.at(-1)}`;
}

function stepCopy(
  phase: CraftPlanPhase,
  actionNames: string[],
  preference: TargetOrderPreference,
  hasDecisionDetails: boolean
): { title: string; instruction: string } {
  const actions = joinedActions(actionNames);
  switch (phase) {
    case 'INITIALIZE':
      return { title: 'Make it Magic', instruction: `Use ${actions} to begin the rolling loop.` };
    case 'ROLL':
      return preference.kind === 'PREFER_TARGET_FIRST'
        ? {
            title: 'Roll for the preferred first target',
            instruction:
              `Use ${actions} until the policy's preferred first target appears in a state worth keeping. ` +
              'Some other-target states may still be kept when Decision details say so.',
          }
        : {
            title: 'Roll for a target modifier',
            instruction: `Use ${actions} until one desired modifier appears in a state the selected policy keeps.`,
          };
    case 'FILL':
      return {
        title: 'Fill the Magic item when needed',
        instruction: `Use ${actions} when the selected policy wants another Magic affix before promotion.`,
      };
    case 'PROMOTE':
      return {
        title: 'Promote the keepable Magic states',
        instruction:
          `Use ${actions} only for the one-target Magic states the selected policy promotes; otherwise continue rolling.` +
          (hasDecisionDetails ? ' Expand Decision details when exact current affixes matter.' : ''),
      };
    case 'FINISH':
      return {
        title: 'Try to finish the missing target',
        instruction: `Use ${actions} only in the selected finishing states where the missing target can still be reached.`,
      };
    case 'SPECIALIZED':
      return {
        title: 'Use the selected specialized craft',
        instruction: `Use ${actions} in the exact states assigned to it by the selected policy.`,
      };
    case 'RECOVER':
      return {
        title: 'Recover from misses',
        instruction: `Use ${actions} when the current item cannot progress, then repeat the rolling loop.`,
      };
    case 'SUCCESS':
      return { title: 'Finish', instruction: 'Stop when every requested target condition is satisfied.' };
    default:
      return { title: 'Acquire the base', instruction: `Begin with ${actions}.` };
  }
}

export function buildCraftPlan(source: CraftPlanSource): CraftPlanSummary {
  const targetOrderPreference = deriveTargetOrderPreference(
    source.target,
    source.policyExplanation,
    source.recommended?.actionId,
  );
  const exactPolicyBranchCount = source.policyExplanation.length;
  if (source.recommended === null || source.recommendationStatus === 'NO_RESOLVED_ROUTE') {
    return {
      status: 'UNCERTIFIED',
      startingPoint: 'No certified starting point',
      steps: [],
      targetOrderPreference,
      detailedDecisionCount: 0,
      exactPolicyBranchCount,
      exactPolicyBranchesHiddenByDefault: exactPolicyBranchCount,
      selectedActionIds: [],
      representedActionIds: [],
      uncoveredActionIds: [],
      inventedActionIds: [],
      provenance:
        'No chronological plan is produced without a certified selected acquisition and policy.',
    };
  }

  const selectedCandidate = source.acquisition.candidates.find(
    (candidate) => candidate.id === source.acquisition.selectedCandidateId
  );
  const selectedMethod = selectedCandidate?.methods.find(
    (method) => method.id === source.acquisition.selectedMethodId
  );
  const selectedSynthesis = selectedMethod?.executable ? selectedCandidate?.synthesis : undefined;
  const actionNames = new Map<string, string>();
  actionNames.set(source.recommended.actionId, source.recommended.name);
  for (const usage of source.expectedActionUsage) actionNames.set(usage.actionId, usage.actionName);
  for (const rule of source.policyExplanation) actionNames.set(rule.actionId, rule.action);
  for (const usage of selectedSynthesis?.expectedActionUsage ?? []) {
    actionNames.set(usage.actionId, usage.actionName);
  }
  for (const recovery of selectedSynthesis?.wrongFractureRecovery?.recoveryActions ?? []) {
    actionNames.set(recovery.actionId, recovery.actionName);
  }

  const selectedPolicyActionIds = unique([
    source.recommended.actionId,
    ...source.expectedActionUsage.filter((usage) => usage.expectedCount > 0).map((usage) => usage.actionId),
    ...source.policyExplanation.filter((rule) => rule.expectedVisits > 0).map((rule) => rule.actionId),
    ...(selectedSynthesis?.expectedActionUsage ?? [])
      .filter((usage) => usage.expectedCount > 0)
      .map((usage) => usage.actionId),
    ...(selectedSynthesis?.wrongFractureRecovery?.recoveryActions ?? [])
      .filter((recovery) => recovery.expectedVisits > 0)
      .map((recovery) => recovery.actionId),
  ]);
  const allowedActionIds = new Set(selectedPolicyActionIds);
  const policyActionIds = unique([
    ...source.policyExplanation
      .filter((rule) => !rule.context.acquisitionMenu && rule.expectedVisits > 0)
      .map((rule) => rule.actionId),
    ...source.expectedActionUsage
      .filter((usage) => usage.expectedCount > 0 && usage.actionId !== source.recommended?.actionId)
      .map((usage) => usage.actionId),
  ]);
  const byPhase = new Map<CraftPlanPhase, string[]>();
  for (const actionId of policyActionIds) {
    const phase = selectedPolicyPhase(actionId, source) ?? 'SPECIALIZED';
    const entries = byPhase.get(phase) ?? [];
    entries.push(actionId);
    byPhase.set(phase, unique(entries));
  }
  const conflicts = decisionGroups(source.policyExplanation);
  const detailsByPhase = new Map<CraftPlanPhase, CraftPlanDecisionGroup[]>();
  for (const { group, phase } of conflicts) {
    const entries = detailsByPhase.get(phase) ?? [];
    entries.push(group);
    detailsByPhase.set(phase, entries);
  }

  const acquisitionActionIds = unique([
    source.recommended.actionId,
    ...(byPhase.get('ACQUIRE') ?? []),
    ...(selectedSynthesis?.expectedActionUsage ?? [])
      .filter((usage) => usage.expectedCount > 0)
      .map((usage) => usage.actionId),
  ]);
  const acquisitionInstruction = selectedSynthesis
    ? `Follow the selected executable self-fracture synthesis for ${selectedCandidate?.label ?? 'the starting base'}. ` +
      `${selectedSynthesis.expectedFracturingOrbs === undefined ? '' : 'Use the returned Fracturing Orb policy; '}` +
      'a wrong permanent fracture follows the returned reacquire/reprepare recovery.'
    : (byPhase.get('ACQUIRE') ?? []).length > 0
      ? `Start with ${selectedCandidate?.label ?? selectedMethod?.label ?? source.recommended.name}, then use the selected fracture action only in the on-policy preparation states.`
    : `Start with ${selectedCandidate?.label ?? selectedMethod?.label ?? source.recommended.name}.`;
  const steps: CraftPlanStep[] = [{
    id: 'acquire',
    phase: 'ACQUIRE',
    title: selectedSynthesis ? 'Create the fractured starting base' : 'Acquire the base',
    instruction: acquisitionInstruction,
    actionIds: acquisitionActionIds,
    actionNames: actionNamesFor(acquisitionActionIds, actionNames),
    targetProgressBefore: 0,
    targetProgressAfter: 0,
    decisionDetails: [],
  }];

  for (const phase of PHASE_ORDER) {
    if (phase === 'ACQUIRE' || phase === 'RECOVER' || phase === 'SUCCESS') continue;
    const actionIds = byPhase.get(phase) ?? [];
    if (actionIds.length === 0) continue;
    const decisionDetails = detailsByPhase.get(phase) ?? [];
    const names = actionNamesFor(actionIds, actionNames);
    const copy = stepCopy(phase, names, targetOrderPreference, decisionDetails.length > 0);
    steps.push({
      id: phase.toLowerCase(),
      phase,
      title: copy.title,
      instruction: copy.instruction,
      actionIds,
      actionNames: names,
      targetProgressBefore: phase === 'ROLL' ? 0 : undefined,
      targetProgressAfter: phase === 'ROLL' ? 1 : undefined,
      preferredTargetModIds:
        phase === 'ROLL' && targetOrderPreference.kind === 'PREFER_TARGET_FIRST'
          ? [...targetOrderPreference.targetModIds]
          : undefined,
      decisionDetails,
    });
  }

  const synthesisRecoveryIds = (selectedSynthesis?.wrongFractureRecovery?.recoveryActions ?? [])
    .filter((recovery) => recovery.expectedVisits > 0)
    .map((recovery) => recovery.actionId);
  const recoveryIds = unique([...(byPhase.get('RECOVER') ?? []), ...synthesisRecoveryIds]);
  let recovery: CraftPlanRecovery | undefined;
  if (recoveryIds.length > 0) {
    const returnToStep = steps.find((step) => step.phase === 'INITIALIZE') ??
      steps.find((step) => step.phase === 'ROLL');
    const names = actionNamesFor(recoveryIds, actionNames);
    const copy = stepCopy('RECOVER', names, targetOrderPreference, false);
    steps.push({
      id: 'recover',
      phase: 'RECOVER',
      title: copy.title,
      instruction: copy.instruction,
      actionIds: recoveryIds,
      actionNames: names,
      decisionDetails: detailsByPhase.get('RECOVER') ?? [],
      recoveryTargetStepId: returnToStep?.id,
    });
    recovery = {
      actionIds: recoveryIds,
      returnToStepId: returnToStep?.id,
      provenance:
        selectedSynthesis?.wrongFractureRecovery?.note ??
        'Recovery actions and loop destination are derived from selected on-policy actions and rarity progression.',
    };
  }

  steps.push({
    id: 'success',
    phase: 'SUCCESS',
    ...stepCopy('SUCCESS', [], targetOrderPreference, false),
    actionIds: [],
    actionNames: [],
    targetProgressBefore: Math.max(0, targetRequirementIds(source.target).length - 1),
    targetProgressAfter: targetRequirementIds(source.target).length,
    decisionDetails: [],
  });

  const representedActionIds = unique(steps.flatMap((step) => [
    ...step.actionIds,
    ...step.decisionDetails.flatMap((group) => group.options.map((option) => option.actionId)),
  ]));
  const uncoveredActionIds = selectedPolicyActionIds.filter(
    (actionId) => !representedActionIds.includes(actionId)
  );
  const inventedActionIds = representedActionIds.filter((actionId) => !allowedActionIds.has(actionId));

  return {
    status: 'CERTIFIED',
    startingPoint: selectedCandidate?.label ?? selectedMethod?.label ?? source.recommended.name,
    steps,
    recovery,
    targetOrderPreference,
    detailedDecisionCount: conflicts.length,
    exactPolicyBranchCount,
    exactPolicyBranchesHiddenByDefault: exactPolicyBranchCount,
    selectedActionIds: selectedPolicyActionIds,
    representedActionIds,
    uncoveredActionIds,
    inventedActionIds,
    optimalityNote: source.proof.globalOptimality === 'NOT YET PROVEN'
      ? 'This plan is the best certified policy found at the current search depth; Retry deeper may improve the expected cost or decisions.'
      : undefined,
    provenance:
      'Presentation-only deterministic compression of the certified selected acquisition and on-policy rules. ' +
      'Phase order comes from shared action mechanics; conflicts retain exact policy-rule indices.',
  };
}
