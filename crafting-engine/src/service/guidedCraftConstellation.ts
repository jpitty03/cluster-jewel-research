import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import type {
  PolicyFlowEdge,
  PolicyFlowNode,
  PolicyFlowSummary,
} from '../domain/PolicyFlow.ts';
import {
  classifyCraftPlanAction,
  type CraftPlanModifierMetadata,
  type CraftPlanSummary,
  type PlayerCraftFinishRule,
  type PlayerCraftRule,
  type PlayerCraftRuleCondition,
  type PlayerCraftRuleOutcome,
  type PlayerCraftRuleStage,
} from './craftPlan.ts';

export const GUIDED_CRAFT_CONSTELLATION_VERSION =
  'GUIDED_CRAFT_CONSTELLATION_V1' as const;

export type GuidedConstellationNodeKind =
  | 'ROUTE_START'
  | 'ACTION_STAGE'
  | 'DECISION_STAGE'
  | 'RECOVERY'
  | 'COMPLETE';

export type GuidedConstellationEdgeKind =
  | 'PRIMARY'
  | 'RESULT'
  | 'LOOP'
  | 'RECOVERY'
  | 'REACQUIRE'
  | 'SUCCESS';

export interface GuidedConstellationEvidence {
  playerRuleIds: string[];
  policyRuleIndices: number[];
  sourceStateKeys: string[];
  sourcePolicyNodeIds: string[];
  sourcePolicyEdgeIds: string[];
  evidenceStatus: 'CERTIFIED';
}

export interface GuidedConstellationConditionRow
  extends GuidedConstellationEvidence {
  id: string;
  label: string;
  whenLines: string[];
  actionId: string;
  actionName: string;
  thenSummary: string;
  thenBranches: string[];
  recoveryKind: PlayerCraftRuleOutcome['recoveryKind'];
  nextNodeIds: string[];
  representedStateCount: number;
  expectedVisits: number;
  minimalExceptionModIds: string[];
}

export interface GuidedConstellationActionChoice
  extends GuidedConstellationEvidence {
  id: string;
  label: string;
  actionId: string;
  actionName: string;
  recoveryKind: PlayerCraftRuleOutcome['recoveryKind'];
  conditionRowIds: string[];
  /** A representative shortcut; every exact condition remains in the single detail picker. */
  preview: boolean;
}

export interface GuidedConstellationNode
  extends GuidedConstellationEvidence {
  id: string;
  kind: GuidedConstellationNodeKind;
  stage: PlayerCraftRuleStage | 'ROUTE_START';
  lane: 'MAIN' | 'RECOVERY';
  displayOrder: number;
  title: string;
  summary: string;
  actionIds: string[];
  conditionRows: GuidedConstellationConditionRow[];
  actionChoices: GuidedConstellationActionChoice[];
}

export interface GuidedConstellationEdge
  extends GuidedConstellationEvidence {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  kind: GuidedConstellationEdgeKind;
  label: string;
  actionId: string;
  actionName: string;
  conditionRowIds: string[];
}

export interface GuidedConstellationFinishCondition {
  requiredTargetIds: string[];
  requiredTargetNames: string[];
  acceptableTargetBranches: string[][];
  acceptableTargetBranchNames: string[][];
  requiredRarity?: PlayerCraftFinishRule['requiredRarity'];
  extraAffixesAllowed: boolean;
}

export interface GuidedConstellationEvidenceMap {
  nodes: Record<string, GuidedConstellationEvidence>;
  conditionRows: Record<string, GuidedConstellationEvidence>;
  actionChoices: Record<string, GuidedConstellationEvidence>;
  edges: Record<string, GuidedConstellationEvidence>;
}

export interface GuidedCraftConstellationSummary {
  version: typeof GUIDED_CRAFT_CONSTELLATION_VERSION;
  status: 'CERTIFIED' | 'WITHHELD';
  reasons: string[];
  selectedRouteName: string;
  physicalStart: string;
  requiredTargetNames: string[];
  acceptableTargetBranchNames: string[][];
  nodes: GuidedConstellationNode[];
  edges: GuidedConstellationEdge[];
  startNodeId?: string;
  terminalNodeId?: string;
  finishCondition?: GuidedConstellationFinishCondition;
  evidenceMap: GuidedConstellationEvidenceMap;
  representedPlayerRuleIds: string[];
  representedPolicyRuleIndices: number[];
  representedSourceStateKeys: string[];
  representedPolicyNodeIds: string[];
  representedPolicyEdgeIds: string[];
  representedStateCount: number;
  expectedVisits: number;
  fingerprint: string;
}

export interface CompileGuidedCraftConstellationOptions {
  craftPlan: CraftPlanSummary;
  policyFlow?: PolicyFlowSummary;
  target: TargetDefinition;
  modifierMetadata: readonly CraftPlanModifierMetadata[];
  selectedRouteName: string;
  physicalStart: string;
}

interface RuleDraft {
  rule: PlayerCraftRule;
  groupKey: string;
  matchedPolicyNodeIds: string[];
  sourcePolicyEdgeIds: string[];
}

interface GroupDraft {
  key: string;
  rules: RuleDraft[];
  nodeId: string;
}

function hashText(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function uniqueNumbers(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(unique(left)) === JSON.stringify(unique(right));
}

function capitalized(value: string): string {
  return value.length > 0 ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function requirementIdentity(
  requirement: TargetDefinition['requiredMods'][number],
  index: number,
): string {
  return requirement.modId ?? requirement.name ?? requirement.modGroup ??
    `target requirement ${index + 1}`;
}

function modifierNames(
  options: CompileGuidedCraftConstellationOptions,
): Map<string, string> {
  const names = new Map(options.modifierMetadata.map((metadata) => [metadata.modId, metadata.name]));
  const requirements = [
    ...options.target.requiredMods,
    ...(options.target.acceptableAnyOf?.flat() ?? []),
  ];
  for (const [index, requirement] of requirements.entries()) {
    const id = requirementIdentity(requirement, index);
    if (!names.has(id)) names.set(id, requirement.name ?? requirement.modId ?? id);
  }
  return names;
}

function withheld(
  options: CompileGuidedCraftConstellationOptions,
  reasons: readonly string[],
): GuidedCraftConstellationSummary {
  const canonicalReasons = unique(reasons.length > 0
    ? reasons
    : ['Guided Constellation certification failed without a diagnostic reason.']);
  return {
    version: GUIDED_CRAFT_CONSTELLATION_VERSION,
    status: 'WITHHELD',
    reasons: canonicalReasons,
    selectedRouteName: options.selectedRouteName,
    physicalStart: options.physicalStart,
    requiredTargetNames: [],
    acceptableTargetBranchNames: [],
    nodes: [],
    edges: [],
    evidenceMap: { nodes: {}, conditionRows: {}, actionChoices: {}, edges: {} },
    representedPlayerRuleIds: [],
    representedPolicyRuleIndices: [],
    representedSourceStateKeys: [],
    representedPolicyNodeIds: [],
    representedPolicyEdgeIds: [],
    representedStateCount: 0,
    expectedVisits: 0,
    fingerprint: `guided-withheld-${hashText(JSON.stringify(canonicalReasons))}`,
  };
}

function semanticGroupKey(rule: PlayerCraftRule): string {
  const scope = `${rule.when.policyScope}|${rule.when.progressKind}`;
  if (rule.stage === 'MAKE_MAGIC') return `${scope}|MAKE_MAGIC`;
  if (rule.when.rarity === 'magic' &&
      (rule.stage === 'MAGIC_ROLL' || rule.stage === 'PROMOTE')) {
    return `${scope}|MAGIC_EVALUATION`;
  }
  if (rule.when.rarity === 'rare' &&
      (rule.stage === 'RARE_FINISH' || rule.stage === 'ACQUIRE')) {
    return `${scope}|RARE_EVALUATION`;
  }
  if (rule.stage === 'RECOVER') {
    return `${scope}|RECOVER|${rule.actionId}|${rule.then.recoveryKind}`;
  }
  return `${scope}|${rule.stage}|${rule.actionId}|${rule.then.recoveryKind}`;
}

function nodeMatchesRule(node: PolicyFlowNode, rule: PlayerCraftRule): boolean {
  const condition = rule.when;
  const matchedTargets = unique([
    ...condition.requiredPresentModIds,
    ...condition.acceptablePresentModIds,
  ]);
  const fracturedTargets = unique([
    ...condition.fracturedRequiredTargetModIds,
    ...condition.fracturedAcceptableTargetModIds,
  ]);
  return node.terminal === false &&
    node.selectedActionId === rule.actionId &&
    node.scope === condition.policyScope &&
    node.rarity === condition.rarity &&
    node.prefixCount === condition.prefixCount &&
    node.suffixCount === condition.suffixCount &&
    sameStrings(node.matchedTargetModIds, matchedTargets) &&
    sameStrings(node.fracturedTargetModIds, fracturedTargets) &&
    (node.acceptableAlternativeSatisfied === undefined ||
      node.acceptableAlternativeSatisfied === condition.acceptableAlternativeSatisfied);
}

function conditionLines(
  condition: PlayerCraftRuleCondition,
  names: ReadonlyMap<string, string>,
): string[] {
  const name = (id: string) => names.get(id) ?? id;
  const lines = [
    `${condition.progressKind === 'PREPARATION' ? 'Fracture preparation' : 'Final craft'} · ` +
      `${capitalized(condition.rarity)} · ${condition.prefixCount}P/${condition.suffixCount}S`,
  ];
  if (condition.requiredPresentModIds.length > 0) {
    lines.push(`Has ${condition.requiredPresentModIds.map(name).join(', ')}`);
  }
  if (condition.requiredMissingModIds.length > 0) {
    lines.push(`Missing ${condition.requiredMissingModIds.map(name).join(', ')}`);
  }
  if (condition.acceptableAlternativeRequired) {
    lines.push(condition.acceptableAlternativeSatisfied
      ? `Acceptable target present: ${condition.acceptablePresentModIds.map(name).join(', ')}`
      : 'Acceptable target still missing');
  }
  if (condition.fracturedRequiredTargetModIds.length > 0 ||
      condition.fracturedAcceptableTargetModIds.length > 0) {
    lines.push(`Wanted fracture: ${[
      ...condition.fracturedRequiredTargetModIds,
      ...condition.fracturedAcceptableTargetModIds,
    ].map(name).join(', ')}`);
  }
  for (const junk of condition.junk) {
    const kind = junk.kind === 'SAFE_FOR_THIS_RULE'
      ? 'safe junk'
      : junk.kind === 'BLOCKS_MISSING_TARGET'
        ? 'blocking junk'
        : junk.kind === 'OCCUPIES_LAST_COMPATIBLE_SLOT'
          ? 'last-slot junk'
          : 'fractured junk';
    lines.push(`${junk.count} ${junk.side.toLowerCase()} ${kind}`);
  }
  if (condition.openCompatibleTargetSlots.length > 0) {
    lines.push(`Open target-compatible ${condition.openCompatibleTargetSlots
      .map((side) => side.toLowerCase()).join(' or ')} slot`);
  }
  if (condition.minimalException) {
    lines.push(`${condition.minimalException.relation === 'HAS_JUNK' ? 'Has' : 'Does not have'} ` +
      `exception junk: ${condition.minimalException.modIds.map(name).join(', ')}`);
  }
  return lines;
}

function conditionChoiceLabel(
  rule: PlayerCraftRule,
  names: ReadonlyMap<string, string>,
): string {
  const condition = rule.when;
  const action = classifyCraftPlanAction(rule.actionId);
  const actionType = action.kind === 'CRAFT_MECHANIC' ? action.actionType : undefined;
  const name = (id: string) => names.get(id) ?? id;
  if (condition.minimalException?.relation === 'HAS_JUNK') {
    return `Blocked prefix or exception junk (${condition.minimalException.modIds.map(name).join(', ')})`;
  }
  if (condition.minimalException?.relation === 'DOES_NOT_HAVE_JUNK') {
    const openSlot = condition.openCompatibleTargetSlots.length > 0
      ? `Safe open ${condition.openCompatibleTargetSlots.map((side) => side.toLowerCase()).join(' or ')} slot · `
      : '';
    return `${openSlot}no exception junk (${condition.minimalException.modIds.map(name).join(', ')})`;
  }
  if (actionType === 'TRANSFORMATION_ORB') return 'Clean Normal base';
  if (actionType === 'AUGMENTATION_ORB' && condition.openCompatibleTargetSlots.length > 0) {
    return `Open ${condition.openCompatibleTargetSlots.map((side) => side.toLowerCase()).join(' or ')} target slot`;
  }
  if (actionType === 'ALTERATION_ORB') {
    if (condition.requiredPresentModIds.length === 0 &&
        condition.acceptablePresentModIds.length === 0) return 'No target modifier';
    if (condition.junk.some((junk) => junk.kind !== 'SAFE_FOR_THIS_RULE')) {
      return 'Target access blocked by junk';
    }
    return 'Magic roll is not keepable';
  }
  if (actionType === 'REGAL_ORB') return 'Keepable Magic target roll';
  if (actionType === 'EXALTED_ORB' && condition.openCompatibleTargetSlots.length > 0) {
    return `Safe open ${condition.openCompatibleTargetSlots.map((side) => side.toLowerCase()).join(' or ')} slot`;
  }
  if (actionType === 'FRACTURING_ORB') return 'Four-mod fracture preparation ready';
  if (actionType === 'RESTART_REACQUIRE') return 'Junk fracture';
  if (actionType === 'SCOURING_ORB') {
    if (condition.fracturedRequiredTargetModIds.length > 0 ||
        condition.fracturedAcceptableTargetModIds.length > 0) return 'Wanted fracture needs cleanup';
    if (condition.junk.some((junk) => junk.kind !== 'SAFE_FOR_THIS_RULE')) {
      return 'Blocked or exception junk';
    }
    return 'Certified restart state';
  }
  const present = [
    ...condition.requiredPresentModIds,
    ...condition.acceptablePresentModIds,
  ].map(name);
  return present.length > 0 ? `With ${present.join(', ')}` : `${capitalized(condition.rarity)} result`;
}

function stageForGroup(group: GroupDraft): PlayerCraftRuleStage {
  const stages = unique(group.rules.map((draft) => draft.rule.stage));
  if (stages.includes('ACQUIRE')) return 'ACQUIRE';
  if (stages.includes('PROMOTE')) return 'PROMOTE';
  return group.rules[0].rule.stage;
}

function actionChoiceSemanticKey(
  row: GuidedConstellationConditionRow,
  rule: PlayerCraftRule,
): string {
  return JSON.stringify({
    actionId: row.actionId,
    recoveryKind: row.recoveryKind,
    nextNodeIds: unique(row.nextNodeIds),
    policyScope: rule.when.policyScope,
    progressKind: rule.when.progressKind,
    requiredPresentModIds: unique(rule.when.requiredPresentModIds),
    requiredMissingModIds: unique(rule.when.requiredMissingModIds),
    acceptablePresentModIds: unique(rule.when.acceptablePresentModIds),
    acceptableAlternativeSatisfied: rule.when.acceptableAlternativeSatisfied,
    fracturedRequiredTargetModIds: unique(rule.when.fracturedRequiredTargetModIds),
    fracturedAcceptableTargetModIds: unique(rule.when.fracturedAcceptableTargetModIds),
    fracturedJunk: rule.when.junk.some((junk) => junk.kind === 'FRACTURED'),
    openCompatibleTargetSlots: unique(rule.when.openCompatibleTargetSlots),
    minimalException: rule.when.minimalException
      ? {
          relation: rule.when.minimalException.relation,
          modIds: unique(rule.when.minimalException.modIds),
        }
      : undefined,
    terminalEligible: row.nextNodeIds.includes('guided_complete'),
  });
}

function nodeKind(group: GroupDraft, isStart: boolean): GuidedConstellationNodeKind {
  if (isStart) return 'ROUTE_START';
  if (group.rules.every((draft) => draft.rule.stage === 'RECOVER')) return 'RECOVERY';
  if (group.rules.length > 1 || unique(group.rules.map((draft) => draft.rule.actionId)).length > 1) {
    return 'DECISION_STAGE';
  }
  return 'ACTION_STAGE';
}

function groupTitle(
  group: GroupDraft,
  isStart: boolean,
  physicalStart: string,
): string {
  if (isStart) return `Start with ${physicalStart}`;
  const first = group.rules[0].rule;
  if (group.key.endsWith('|MAGIC_EVALUATION')) {
    return first.when.progressKind === 'PREPARATION'
      ? 'Evaluate the preparation Magic item'
      : 'Evaluate the final Magic item';
  }
  if (group.key.endsWith('|RARE_EVALUATION')) {
    return first.when.progressKind === 'PREPARATION'
      ? 'Complete fracture preparation'
      : 'Evaluate the final Rare item';
  }
  if (first.then.recoveryKind === 'REACQUIRE') return 'Reacquire the selected start';
  if (first.then.recoveryKind === 'SCOUR_TO_FRACTURED_MAGIC') return 'Clean up the wanted fracture';
  if (first.stage === 'RECOVER') return `Recover with ${first.action}`;
  return `Use ${first.action}`;
}

function groupSummary(group: GroupDraft): string {
  const actionNames = unique(group.rules.map((draft) => draft.rule.action));
  const first = group.rules[0].rule;
  if (actionNames.length > 1) {
    return `Choose ${actionNames.join(', ')} from the certified visible result conditions.`;
  }
  if (first.stage === 'RECOVER') return 'Follow this recovery only when its certified condition matches.';
  return `Use ${actionNames[0]} for the certified conditions in this stage.`;
}

function guidedEdgeKind(
  raw: PolicyFlowEdge,
  sourceGuidedId: string,
  targetGuidedId: string,
  targetGroup: GroupDraft | undefined,
): GuidedConstellationEdgeKind {
  if (raw.outcomeKind === 'SUCCESS') return 'SUCCESS';
  if (raw.outcomeKind === 'REACQUIRE' ||
      targetGroup?.rules.some((draft) => draft.rule.then.recoveryKind === 'REACQUIRE')) {
    return 'REACQUIRE';
  }
  if (raw.outcomeKind === 'RECOVERY' ||
      targetGroup?.rules.every((draft) => draft.rule.stage === 'RECOVER')) {
    return 'RECOVERY';
  }
  if (sourceGuidedId === targetGuidedId || raw.outcomeKind === 'REPEAT') return 'LOOP';
  return 'RESULT';
}

function guidedEdgeLabel(options: {
  raw: PolicyFlowEdge;
  sourceRaw: PolicyFlowNode;
  targetRaw: PolicyFlowNode;
  sourceGuidedId: string;
  targetGuidedId: string;
  targetTitle: string;
}): string {
  const classification = classifyCraftPlanAction(options.raw.actionId);
  const actionType = classification.kind === 'CRAFT_MECHANIC'
    ? classification.actionType
    : undefined;
  if (options.raw.outcomeKind === 'SUCCESS' || options.targetRaw.terminal) return 'Target complete';
  if (options.raw.evidenceKind === 'CERTIFIED_SCOPE_HANDOFF') {
    return 'Wanted fracture cleaned · begin final craft';
  }
  if (actionType === 'FRACTURING_ORB') {
    return options.targetRaw.fracturedTargetModIds.length > 0
      ? 'Preparation target fractured'
      : 'Junk fractured';
  }
  if (options.raw.outcomeKind === 'REACQUIRE') return 'Junk fracture · reacquire';
  if (options.sourceGuidedId === options.targetGuidedId ||
      options.raw.outcomeKind === 'REPEAT') return 'Re-check this stage';
  return `Continue to ${options.targetTitle}`;
}

function finishCondition(
  finish: PlayerCraftFinishRule,
  names: ReadonlyMap<string, string>,
): GuidedConstellationFinishCondition {
  return {
    requiredTargetIds: [...finish.requiredTargetModIds],
    requiredTargetNames: finish.requiredTargetModIds.map((id) => names.get(id) ?? id),
    acceptableTargetBranches: finish.acceptableTargetBranches.map((branch) => [...branch]),
    acceptableTargetBranchNames: finish.acceptableTargetBranches.map((branch) =>
      branch.map((id) => names.get(id) ?? id)
    ),
    requiredRarity: finish.requiredRarity,
    extraAffixesAllowed: finish.extraAffixesAllowed,
  };
}

/**
 * Deterministic presentation compression over certified Phase 3J player rules and exact
 * PolicyFlow transitions. It never chooses an action or parses rendered prose.
 */
export function compileGuidedCraftConstellation(
  options: CompileGuidedCraftConstellationOptions,
): GuidedCraftConstellationSummary {
  const reasons: string[] = [];
  const flow = options.policyFlow;
  const finish = options.craftPlan.playerFinishRule;
  if (options.selectedRouteName.trim().length === 0) reasons.push('Selected route identity is absent.');
  if (options.physicalStart.trim().length === 0) reasons.push('Selected physical start evidence is absent.');
  if (options.craftPlan.status !== 'CERTIFIED') reasons.push('Craft plan is not certified.');
  if (options.craftPlan.playerRuleCertification.status !== 'CERTIFIED') {
    reasons.push('Phase 3J player rules are withheld.');
  }
  if (!flow) reasons.push('Selected PolicyFlow evidence is absent.');
  else {
    if (flow.status !== 'CERTIFIED') reasons.push('Selected PolicyFlow is not certified.');
    if (!flow.reconciliation.certified) reasons.push('Selected PolicyFlow reconciliation is not certified.');
    if (!flow.sourcePolicyFingerprint || !flow.aggregation.exactFlowFingerprint ||
        !flow.topology.fingerprint) {
      reasons.push('Selected PolicyFlow source, exact-flow, or topology fingerprint is absent.');
    }
  }
  if (!finish || finish.evidenceStatus !== 'CERTIFIED') {
    reasons.push('The authoritative Finish rule is absent or uncertified.');
  }
  if (options.craftPlan.playerRules.length === 0) reasons.push('No certified player rules are available.');
  if (reasons.length > 0 || !flow || !finish) return withheld(options, reasons);

  const names = modifierNames(options);
  const rawNodeById = new Map(flow.nodes.map((node) => [node.id, node]));
  const outgoingByNode = new Map<string, PolicyFlowEdge[]>();
  for (const edge of flow.edges) {
    const outgoing = outgoingByNode.get(edge.sourceNodeId) ?? [];
    outgoing.push(edge);
    outgoingByNode.set(edge.sourceNodeId, outgoing);
    if (!rawNodeById.has(edge.sourceNodeId) || !rawNodeById.has(edge.targetNodeId)) {
      reasons.push(`PolicyFlow edge ${edge.id} has an unknown endpoint.`);
    }
    if (edge.evidenceKind !== 'EXACT_SELECTED_POLICY_TRANSITION' &&
        edge.evidenceKind !== 'CERTIFIED_SCOPE_HANDOFF') {
      reasons.push(`PolicyFlow edge ${edge.id} lacks exact or certified-handoff evidence.`);
    }
  }

  const ruleIds = new Set<string>();
  const stateKeys = new Set<string>();
  for (const rule of options.craftPlan.playerRules) {
    if (ruleIds.has(rule.id)) reasons.push(`Player rule ${rule.id} is duplicated.`);
    ruleIds.add(rule.id);
    if (rule.evidenceStatus !== 'CERTIFIED') reasons.push(`Player rule ${rule.id} is not certified.`);
    for (const stateKey of rule.sourceStateKeys) {
      if (stateKeys.has(stateKey)) reasons.push(`Source state ${stateKey} belongs to multiple player rules.`);
      stateKeys.add(stateKey);
    }
  }
  if (!sameStrings(
    options.craftPlan.playerRuleCertification.coveredPolicyRuleIndices.map(String),
    options.craftPlan.playerRuleCertification.sourcePolicyRuleIndices.map(String),
  )) reasons.push('Phase 3J player-rule coverage is not exact.');

  const drafts: RuleDraft[] = options.craftPlan.playerRules.map((rule) => ({
    rule,
    groupKey: semanticGroupKey(rule),
    matchedPolicyNodeIds: [],
    sourcePolicyEdgeIds: [],
  }));
  const draftByRuleId = new Map(drafts.map((draft) => [draft.rule.id, draft]));
  const groupDrafts = new Map<string, GroupDraft>();
  for (const draft of drafts) {
    const group = groupDrafts.get(draft.groupKey) ?? {
      key: draft.groupKey,
      rules: [],
      nodeId: `guided_${hashText(draft.groupKey)}`,
    };
    group.rules.push(draft);
    groupDrafts.set(draft.groupKey, group);
  }
  const completeNodeId = 'guided_complete';
  const rawNodeToGuided = new Map<string, string>();

  for (const node of flow.nodes) {
    if (node.terminal) {
      rawNodeToGuided.set(node.id, completeNodeId);
      continue;
    }
    const exactDrafts = node.representativeStateKey
      ? drafts.filter((draft) => draft.rule.sourceStateKeys.includes(node.representativeStateKey!))
      : [];
    const structuralDrafts = drafts.filter((draft) => nodeMatchesRule(node, draft.rule));
    const candidates = exactDrafts.length > 0 ? exactDrafts : structuralDrafts;
    const candidateGroups = unique(candidates.map((draft) => draft.groupKey));
    if (candidateGroups.length !== 1) {
      reasons.push(
        `PolicyFlow node ${node.id} maps to ${candidateGroups.length} guided stages ` +
        `(${candidateGroups.join(', ') || 'none'}).`,
      );
      continue;
    }
    const guidedId = groupDrafts.get(candidateGroups[0])?.nodeId;
    if (!guidedId) {
      reasons.push(`PolicyFlow node ${node.id} maps to an unknown guided stage.`);
      continue;
    }
    rawNodeToGuided.set(node.id, guidedId);
  }

  for (const draft of drafts) {
    const matched = flow.nodes.filter((node) =>
      !node.terminal &&
      rawNodeToGuided.get(node.id) === groupDrafts.get(draft.groupKey)?.nodeId &&
      (nodeMatchesRule(node, draft.rule) ||
        (node.representativeStateKey !== undefined &&
          draft.rule.sourceStateKeys.includes(node.representativeStateKey)))
    );
    draft.matchedPolicyNodeIds = unique(matched.map((node) => node.id));
    draft.sourcePolicyEdgeIds = unique(matched.flatMap((node) =>
      (outgoingByNode.get(node.id) ?? [])
        .filter((edge) => edge.actionId === draft.rule.actionId)
        .map((edge) => edge.id)
    ));
    if (draft.matchedPolicyNodeIds.length === 0) {
      reasons.push(`Player rule ${draft.rule.id} has no unambiguous PolicyFlow node evidence.`);
    }
    if (draft.sourcePolicyEdgeIds.length === 0) {
      reasons.push(`Player rule ${draft.rule.id} has no exact outgoing PolicyFlow edge evidence.`);
    }
  }

  const startGuidedIds = unique(flow.startNodeIds.flatMap((nodeId) =>
    rawNodeToGuided.get(nodeId) ?? []
  ));
  if (startGuidedIds.length !== 1) {
    reasons.push(`PolicyFlow start ownership maps to ${startGuidedIds.length} guided stages.`);
  }
  const terminalRawIds = unique(flow.terminalNodeIds);
  if (terminalRawIds.length === 0 ||
      terminalRawIds.some((nodeId) => rawNodeToGuided.get(nodeId) !== completeNodeId)) {
    reasons.push('PolicyFlow terminal ownership is absent or ambiguous.');
  }
  if (rawNodeToGuided.size !== flow.nodes.length) {
    reasons.push(`${flow.nodes.length - rawNodeToGuided.size} PolicyFlow nodes are not represented.`);
  }
  if (reasons.length > 0) return withheld(options, reasons);

  const groupsByNodeId = new Map([...groupDrafts.values()].map((group) => [group.nodeId, group]));
  const rawEdgeDrafts = flow.edges.map((raw) => {
    const sourceGuidedId = rawNodeToGuided.get(raw.sourceNodeId)!;
    const targetGuidedId = rawNodeToGuided.get(raw.targetNodeId)!;
    const sourceRaw = rawNodeById.get(raw.sourceNodeId)!;
    const targetRaw = rawNodeById.get(raw.targetNodeId)!;
    const targetGroup = groupsByNodeId.get(targetGuidedId);
    const targetTitle = targetGuidedId === completeNodeId
      ? 'Finish'
      : groupTitle(targetGroup!, false, options.physicalStart);
    const kind = guidedEdgeKind(raw, sourceGuidedId, targetGuidedId, targetGroup);
    const label = guidedEdgeLabel({
      raw,
      sourceRaw,
      targetRaw,
      sourceGuidedId,
      targetGuidedId,
      targetTitle,
    });
    return { raw, sourceGuidedId, targetGuidedId, kind, label };
  });

  const groupedEdges = new Map<string, typeof rawEdgeDrafts>();
  for (const edge of rawEdgeDrafts) {
    const key = [
      edge.sourceGuidedId,
      edge.targetGuidedId,
      edge.kind,
      edge.raw.actionId,
      edge.label,
    ].join('|');
    const entries = groupedEdges.get(key) ?? [];
    entries.push(edge);
    groupedEdges.set(key, entries);
  }

  const edges: GuidedConstellationEdge[] = [...groupedEdges.entries()]
    .map(([key, entries]) => {
      const first = entries[0];
      const sourceGroup = groupsByNodeId.get(first.sourceGuidedId);
      const sourceRules = sourceGroup?.rules.filter((draft) =>
        draft.rule.actionId === first.raw.actionId &&
        entries.some((entry) => draft.matchedPolicyNodeIds.includes(entry.raw.sourceNodeId))
      ) ?? [];
      if (sourceRules.length === 0) {
        reasons.push(`Guided edge ${key} has no owning player rule.`);
      }
      return {
        id: `guided_edge_${hashText(key)}`,
        sourceNodeId: first.sourceGuidedId,
        targetNodeId: first.targetGuidedId,
        kind: first.kind,
        label: first.label,
        actionId: first.raw.actionId,
        actionName: first.raw.actionName,
        conditionRowIds: unique(sourceRules.map((draft) => `guided_condition_${draft.rule.id}`)),
        playerRuleIds: unique(sourceRules.map((draft) => draft.rule.id)),
        policyRuleIndices: uniqueNumbers(sourceRules.flatMap((draft) => draft.rule.policyRuleIndices)),
        sourceStateKeys: unique(sourceRules.flatMap((draft) => draft.rule.sourceStateKeys)),
        sourcePolicyNodeIds: unique(entries.map((entry) => entry.raw.sourceNodeId)),
        sourcePolicyEdgeIds: unique(entries.map((entry) => entry.raw.id)),
        evidenceStatus: 'CERTIFIED' as const,
      };
    })
    .sort((left, right) => left.sourceNodeId.localeCompare(right.sourceNodeId) ||
      left.targetNodeId.localeCompare(right.targetNodeId) || left.id.localeCompare(right.id));
  if (reasons.length > 0) return withheld(options, reasons);

  const startNodeId = startGuidedIds[0];
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) {
    if (edge.targetNodeId === edge.sourceNodeId) continue;
    const targets = adjacency.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    adjacency.set(edge.sourceNodeId, unique(targets));
  }
  const distances = new Map<string, number>([[startNodeId, 0]]);
  const queue = [startNodeId];
  while (queue.length > 0) {
    const source = queue.shift()!;
    const distance = distances.get(source)!;
    for (const target of adjacency.get(source) ?? []) {
      if (distances.has(target)) continue;
      distances.set(target, distance + 1);
      queue.push(target);
    }
  }
  if (!distances.has(completeNodeId)) reasons.push('Complete is not reachable from the guided start.');

  const nodes: GuidedConstellationNode[] = [...groupDrafts.values()].map((group) => {
    const isStart = group.nodeId === startNodeId;
    const title = groupTitle(group, isStart, options.physicalStart);
    const rows: GuidedConstellationConditionRow[] = group.rules
      .map((draft) => {
        const rowId = `guided_condition_${draft.rule.id}`;
        const rowEdges = edges.filter((edge) => edge.conditionRowIds.includes(rowId));
        return {
          id: rowId,
          label: conditionChoiceLabel(draft.rule, names),
          whenLines: conditionLines(draft.rule.when, names),
          actionId: draft.rule.actionId,
          actionName: draft.rule.action,
          thenSummary: draft.rule.then.summary,
          thenBranches: [...draft.rule.then.branches],
          recoveryKind: draft.rule.then.recoveryKind,
          nextNodeIds: unique(rowEdges.map((edge) => edge.targetNodeId)),
          representedStateCount: draft.rule.representedStateCount,
          expectedVisits: draft.rule.expectedVisits,
          minimalExceptionModIds: [...(draft.rule.when.minimalException?.modIds ?? [])],
          playerRuleIds: [draft.rule.id],
          policyRuleIndices: [...draft.rule.policyRuleIndices],
          sourceStateKeys: [...draft.rule.sourceStateKeys],
          sourcePolicyNodeIds: [...draft.matchedPolicyNodeIds],
          sourcePolicyEdgeIds: [...draft.sourcePolicyEdgeIds],
          evidenceStatus: 'CERTIFIED' as const,
        };
      })
      .sort((left, right) => {
        const leftRule = draftByRuleId.get(left.playerRuleIds[0])!.rule;
        const rightRule = draftByRuleId.get(right.playerRuleIds[0])!.rule;
        return leftRule.priority - rightRule.priority;
      });
    const choicesBySignature = new Map<string, GuidedConstellationConditionRow[]>();
    for (const row of rows) {
      const rowRule = draftByRuleId.get(row.playerRuleIds[0])?.rule;
      if (!rowRule) {
        reasons.push(`Guided condition ${row.id} has no source player rule.`);
        continue;
      }
      const signature = actionChoiceSemanticKey(row, rowRule);
      const choiceRows = choicesBySignature.get(signature) ?? [];
      choiceRows.push(row);
      choicesBySignature.set(signature, choiceRows);
    }
    const choiceCandidates: GuidedConstellationActionChoice[] = [...choicesBySignature.entries()]
      .map(([signature, choiceRows]) => ({
        id: `guided_choice_${hashText(`${group.key}|${signature}`)}`,
        label: choiceRows[0].label,
        actionId: choiceRows[0].actionId,
        actionName: choiceRows[0].actionName,
        recoveryKind: choiceRows[0].recoveryKind,
        conditionRowIds: choiceRows.map((row) => row.id),
        preview: false,
        playerRuleIds: unique(choiceRows.flatMap((row) => row.playerRuleIds)),
        policyRuleIndices: uniqueNumbers(choiceRows.flatMap((row) => row.policyRuleIndices)),
        sourceStateKeys: unique(choiceRows.flatMap((row) => row.sourceStateKeys)),
        sourcePolicyNodeIds: unique(choiceRows.flatMap((row) => row.sourcePolicyNodeIds)),
        sourcePolicyEdgeIds: unique(choiceRows.flatMap((row) => row.sourcePolicyEdgeIds)),
        evidenceStatus: 'CERTIFIED' as const,
      }))
      .sort((left, right) => left.actionName.localeCompare(right.actionName) ||
        left.label.localeCompare(right.label));
    const previewByActionRecovery = new Map<string, GuidedConstellationActionChoice>();
    for (const choice of choiceCandidates) {
      const key = `${choice.actionId}|${choice.recoveryKind}`;
      const current = previewByActionRecovery.get(key);
      const score = (candidate: GuidedConstellationActionChoice) => {
        const candidateRows = rows.filter((row) => candidate.conditionRowIds.includes(row.id));
        return candidateRows.some((row) => row.minimalExceptionModIds.length > 0) ? 1 : 0;
      };
      if (!current || score(choice) > score(current)) previewByActionRecovery.set(key, choice);
    }
    const previewIds = new Set([...previewByActionRecovery.values()].map((choice) => choice.id));
    const choices = choiceCandidates.map((choice) => ({
      ...choice,
      preview: previewIds.has(choice.id),
    }));
    const recoveryLane = group.rules.every((draft) => draft.rule.stage === 'RECOVER') &&
      !group.rules.some((draft) =>
        draft.rule.when.policyScope === 'ACQUISITION' &&
        draft.rule.then.recoveryKind === 'SCOUR_TO_FRACTURED_MAGIC'
      );
    return {
      id: group.nodeId,
      kind: nodeKind(group, isStart),
      stage: isStart ? 'ROUTE_START' : stageForGroup(group),
      lane: recoveryLane ? 'RECOVERY' : 'MAIN',
      displayOrder: distances.get(group.nodeId) ?? Number.MAX_SAFE_INTEGER,
      title,
      summary: groupSummary(group),
      actionIds: unique(rows.map((row) => row.actionId)),
      conditionRows: rows,
      actionChoices: choices,
      playerRuleIds: unique(rows.flatMap((row) => row.playerRuleIds)),
      policyRuleIndices: uniqueNumbers(rows.flatMap((row) => row.policyRuleIndices)),
      sourceStateKeys: unique(rows.flatMap((row) => row.sourceStateKeys)),
      sourcePolicyNodeIds: unique(rows.flatMap((row) => row.sourcePolicyNodeIds)),
      sourcePolicyEdgeIds: unique(rows.flatMap((row) => row.sourcePolicyEdgeIds)),
      evidenceStatus: 'CERTIFIED' as const,
    };
  });

  const terminalIncoming = edges.filter((edge) => edge.targetNodeId === completeNodeId);
  if (terminalIncoming.length === 0 || terminalIncoming.some((edge) => edge.kind !== 'SUCCESS')) {
    reasons.push('Complete lacks exclusive exact terminal transition evidence.');
  }
  nodes.push({
    id: completeNodeId,
    kind: 'COMPLETE',
    stage: 'TERMINAL',
    lane: 'MAIN',
    displayOrder: Number.MAX_SAFE_INTEGER,
    title: 'Finish',
    summary: 'Stop only when every authoritative final condition is satisfied.',
    actionIds: [],
    conditionRows: [],
    actionChoices: [],
    playerRuleIds: unique([finish.id, ...terminalIncoming.flatMap((edge) => edge.playerRuleIds)]),
    policyRuleIndices: uniqueNumbers(terminalIncoming.flatMap((edge) => edge.policyRuleIndices)),
    sourceStateKeys: unique(terminalIncoming.flatMap((edge) => edge.sourceStateKeys)),
    sourcePolicyNodeIds: unique(terminalRawIds),
    sourcePolicyEdgeIds: unique(terminalIncoming.flatMap((edge) => edge.sourcePolicyEdgeIds)),
    evidenceStatus: 'CERTIFIED',
  });
  nodes.sort((left, right) => left.displayOrder - right.displayOrder ||
    (left.lane === right.lane ? 0 : left.lane === 'MAIN' ? -1 : 1) ||
    left.id.localeCompare(right.id));

  const representedRuleIds = unique(nodes.flatMap((node) => node.conditionRows
    .flatMap((row) => row.playerRuleIds)));
  if (!sameStrings(representedRuleIds, options.craftPlan.playerRules.map((rule) => rule.id))) {
    reasons.push('Certified player rules are not represented exactly once in guided conditions.');
  }
  const rowRuleIds = nodes.flatMap((node) => node.conditionRows.flatMap((row) => row.playerRuleIds));
  if (rowRuleIds.length !== new Set(rowRuleIds).size) {
    reasons.push('A certified player rule appears in more than one guided condition.');
  }
  const representedPolicyEdgeIds = unique(edges.flatMap((edge) => edge.sourcePolicyEdgeIds));
  if (!sameStrings(representedPolicyEdgeIds, flow.edges.map((edge) => edge.id))) {
    reasons.push('Guided edges do not reconcile with every exact PolicyFlow edge.');
  }
  if (edges.some((edge) => edge.sourcePolicyEdgeIds.length === 0)) {
    reasons.push('At least one displayed edge lacks exact PolicyFlow evidence.');
  }
  if (nodes.some((node) => node.sourcePolicyEdgeIds.length === 0)) {
    reasons.push('At least one displayed node lacks exact PolicyFlow edge evidence.');
  }
  if (nodes.some((node) => node.conditionRows.some((row) =>
    row.sourcePolicyEdgeIds.length === 0 || row.policyRuleIndices.length === 0 ||
    row.sourceStateKeys.length === 0
  ))) reasons.push('At least one displayed condition lacks complete exact evidence.');
  if (reasons.length > 0) return withheld(options, reasons);

  const requiredTargetNames = options.target.requiredMods.map((requirement, index) => {
    const id = requirementIdentity(requirement, index);
    return names.get(id) ?? id;
  });
  const acceptableTargetBranchNames = (options.target.acceptableAnyOf ?? []).map((branch) =>
    branch.map((requirement, index) => {
      const id = requirementIdentity(requirement, index);
      return names.get(id) ?? id;
    })
  );
  const summaryWithoutFingerprint = {
    version: GUIDED_CRAFT_CONSTELLATION_VERSION,
    status: 'CERTIFIED' as const,
    reasons: [] as string[],
    selectedRouteName: options.selectedRouteName,
    physicalStart: options.physicalStart,
    requiredTargetNames,
    acceptableTargetBranchNames,
    nodes,
    edges,
    startNodeId,
    terminalNodeId: completeNodeId,
    finishCondition: finishCondition(finish, names),
    evidenceMap: {
      nodes: Object.fromEntries(nodes.map((node) => [node.id, evidenceOnly(node)])),
      conditionRows: Object.fromEntries(nodes.flatMap((node) =>
        node.conditionRows.map((row) => [row.id, evidenceOnly(row)] as const)
      )),
      actionChoices: Object.fromEntries(nodes.flatMap((node) =>
        node.actionChoices.map((choice) => [choice.id, evidenceOnly(choice)] as const)
      )),
      edges: Object.fromEntries(edges.map((edge) => [edge.id, evidenceOnly(edge)])),
    },
    representedPlayerRuleIds: representedRuleIds,
    representedPolicyRuleIndices: uniqueNumbers(
      options.craftPlan.playerRules.flatMap((rule) => rule.policyRuleIndices),
    ),
    representedSourceStateKeys: unique(
      options.craftPlan.playerRules.flatMap((rule) => rule.sourceStateKeys),
    ),
    representedPolicyNodeIds: unique(flow.nodes.map((node) => node.id)),
    representedPolicyEdgeIds,
    representedStateCount: options.craftPlan.playerRuleCertification.representedStateCount,
    expectedVisits: options.craftPlan.playerRuleCertification.expectedVisits,
  };
  return {
    ...summaryWithoutFingerprint,
    fingerprint: `guided-${hashText(JSON.stringify(summaryWithoutFingerprint))}`,
  };
}

function evidenceOnly(source: GuidedConstellationEvidence): GuidedConstellationEvidence {
  return {
    playerRuleIds: [...source.playerRuleIds],
    policyRuleIndices: [...source.policyRuleIndices],
    sourceStateKeys: [...source.sourceStateKeys],
    sourcePolicyNodeIds: [...source.sourcePolicyNodeIds],
    sourcePolicyEdgeIds: [...source.sourcePolicyEdgeIds],
    evidenceStatus: source.evidenceStatus,
  };
}
