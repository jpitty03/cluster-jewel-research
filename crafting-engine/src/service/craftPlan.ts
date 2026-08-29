import type { GenType } from '../domain/Mod.ts';
import type { ModRequirement, TargetDefinition } from '../domain/TargetDefinition.ts';
import { getMaxPrefixes, getMaxSuffixes } from '../rules/affixRules.ts';
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
  evidenceStatus: 'RECONCILED';
  cohort: {
    policyScope: PolicyExplanationRule['context']['policyScope'];
    progressKind: PolicyExplanationRule['context']['progressKind'];
    rarity: PolicyExplanationRule['context']['rarity'];
    targetModIds: string[];
    requiredTargetModIds: string[];
    acceptableTargetBranches: string[][];
    matchedProgressCounts: number[];
    matchedRequiredProgressCounts: number[];
    acceptableProgressCounts: number[];
    prefixCounts: number[];
    suffixCounts: number[];
    policyRuleIndices: number[];
    focalPhase: CraftPlanPhase;
  };
}

export interface WithheldCraftPlanDecisionGroup {
  cohortKey: string;
  policyRuleIndices: number[];
  reasons: string[];
}

export type PlayerModifierRole = 'REQUIRED_TARGET' | 'ACCEPTABLE_TARGET' | 'JUNK';

export type PlayerJunkKind =
  | 'SAFE_FOR_THIS_RULE'
  | 'BLOCKS_MISSING_TARGET'
  | 'OCCUPIES_LAST_COMPATIBLE_SLOT'
  | 'FRACTURED';

export type PlayerCraftRuleStage =
  | 'ACQUIRE'
  | 'MAKE_MAGIC'
  | 'MAGIC_ROLL'
  | 'PROMOTE'
  | 'RARE_FINISH'
  | 'SPECIALIZED'
  | 'RECOVER'
  | 'TERMINAL';

export interface CraftPlanModifierMetadata {
  modId: string;
  name: string;
  genType: GenType;
  tier: number;
  modGroup: string;
  modGroups: string[];
  isNotable: boolean;
}

export interface PlayerCraftRuleAffixEvidence {
  side: 'PREFIX' | 'SUFFIX';
  modId: string;
  tier: number;
  isFractured: boolean;
  role: PlayerModifierRole;
  junkKind?: PlayerJunkKind;
}

export interface PlayerCraftRuleCondition {
  policyScope: PolicyExplanationRule['context']['policyScope'];
  progressKind: PolicyExplanationRule['context']['progressKind'];
  rarity: PolicyExplanationRule['context']['rarity'];
  prefixCount: number;
  suffixCount: number;
  requiredPresentModIds: string[];
  requiredMissingModIds: string[];
  acceptablePresentModIds: string[];
  fracturedRequiredTargetModIds: string[];
  fracturedAcceptableTargetModIds: string[];
  acceptableAlternativeRequired: boolean;
  acceptableAlternativeSatisfied: boolean;
  openCompatibleTargetSlots: Array<'PREFIX' | 'SUFFIX'>;
  junk: Array<{
    side: 'PREFIX' | 'SUFFIX';
    kind: PlayerJunkKind;
    count: number;
  }>;
  minimalException?: {
    relation: 'HAS_JUNK' | 'DOES_NOT_HAVE_JUNK';
    modIds: string[];
    reason: string;
  };
}

export interface PlayerCraftRuleOutcome {
  summary: string;
  branches: string[];
  recoveryKind:
    | 'RECHECK_MAGIC'
    | 'CHECK_RARE'
    | 'RECHECK_RARE_OR_FINISH'
    | 'STATE_DEPENDENT_ANNUL'
    | 'SCOUR_TO_NORMAL'
    | 'SCOUR_TO_FRACTURED_MAGIC'
    | 'REACQUIRE'
    | 'FRACTURE_HANDOFF_OR_REACQUIRE'
    | 'RECHECK_CURRENT_STAGE';
}

export interface PlayerCraftRuleSourceEvidence {
  policyRuleIndex: number;
  sourceStateKeys: string[];
  representedStateCount: number;
  expectedVisits: number;
  exactAffixes: PlayerCraftRuleAffixEvidence[];
}

export interface PlayerCraftRule {
  id: string;
  stage: PlayerCraftRuleStage;
  priority: number;
  when: PlayerCraftRuleCondition;
  actionId: string;
  action: string;
  then: PlayerCraftRuleOutcome;
  representedStateCount: number;
  expectedVisits: number;
  evidenceStatus: 'CERTIFIED';
  policyRuleIndices: number[];
  sourceStateKeys: string[];
  sourceEvidence: PlayerCraftRuleSourceEvidence[];
  recoverySignature: string;
}

export interface PlayerCraftRuleCertification {
  status: 'CERTIFIED' | 'WITHHELD';
  reasons: string[];
  sourcePolicyRuleIndices: number[];
  coveredPolicyRuleIndices: number[];
  selectedActionIds: string[];
  representedActionIds: string[];
  representedStateCount: number;
  expectedVisits: number;
  minimalExceptionCount: number;
}

export interface PlayerCraftFinishRule {
  id: 'player-rule-finish';
  stage: 'TERMINAL';
  requiredTargetModIds: string[];
  acceptableTargetBranches: string[][];
  requiredRarity?: TargetDefinition['requiredRarity'];
  extraAffixesAllowed: boolean;
  evidenceStatus: 'CERTIFIED';
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
  expectedPhysicalActions?: number;
  estimatedManualTimeMs?: number;
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
  withheldDecisionDetails: WithheldCraftPlanDecisionGroup[];
  playerRules: PlayerCraftRule[];
  playerFinishRule?: PlayerCraftFinishRule;
  playerRuleCertification: PlayerCraftRuleCertification;
  exactPolicyBranchCount: number;
  exactPolicyBranchesHiddenByDefault: number;
  selectedActionIds: string[];
  representedActionIds: string[];
  uncoveredActionIds: string[];
  inventedActionIds: string[];
  excludedAccountingActionIds: string[];
  excludedVirtualActionIds: string[];
  unknownActionIds: string[];
  withheldReason?: string;
  expectedPhysicalActions?: number;
  estimatedManualTimeMs?: number;
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
  /** Eligible catalog metadata used only to compile inspectable player conditions. */
  modifierMetadata: readonly CraftPlanModifierMetadata[];
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

export type CraftPlanActionClassification =
  | {
      kind: 'CRAFT_MECHANIC';
      phase: CraftPlanPhase;
      mechanicId: string;
      actionType: DiscoveredActionType;
      mechanicName: string;
      compactLabel: string;
    }
  | { kind: 'ACQUISITION_RESOURCE' }
  | { kind: 'VIRTUAL_SERVICE' }
  | { kind: 'UNKNOWN' };

const MECHANIC_BY_ID = new Map(CRAFT_MECHANICS.map((mechanic) => [mechanic.id, mechanic]));
const HARVEST_BY_ID = new Map(
  Object.values(HARVEST_CRAFT_DEFINITIONS).map((definition) => [definition.craftId, definition])
);
const ACQUISITION_RESOURCE_ACTION_IDS = new Set(['clean_base_initial']);

function phaseForActionType(type: DiscoveredActionType): CraftPlanPhase | undefined {
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

function compactLabelForActionType(type: DiscoveredActionType, mechanicName: string): string {
  switch (type) {
    case 'TRANSFORMATION_ORB': return 'Transmute';
    case 'ALTERATION_ORB': return 'Alter';
    case 'AUGMENTATION_ORB': return 'Augment';
    case 'REGAL_ORB': return 'Regal';
    case 'SCOURING_ORB':
    case 'RESTART_REACQUIRE': return 'Recover';
    case 'CHAOS_ORB': return 'Chaos';
    case 'EXALTED_ORB': return 'Exalt';
    case 'ANNULMENT_ORB': return 'Annul';
    case 'DIVINE_ORB': return 'Divine';
    case 'FRACTURING_ORB': return 'Fracture';
    case 'HARVEST_REFORGE': return 'Harvest';
    case 'TERMINAL': return 'Complete';
    default: return mechanicName;
  }
}

/**
 * Authoritative presentation taxonomy for positive selected-policy entries.
 * IDs are classified from mechanics metadata or explicit service/accounting ID
 * contracts; player-facing names are never used to guess semantics.
 */
export function classifyCraftPlanAction(actionId: string): CraftPlanActionClassification {
  if (ACQUISITION_RESOURCE_ACTION_IDS.has(actionId)) {
    return { kind: 'ACQUISITION_RESOURCE' };
  }

  const mechanic = MECHANIC_BY_ID.get(actionId);
  if (mechanic) {
    const phase = phaseForActionType(mechanic.actionType);
    if (phase === undefined || mechanic.actionType === 'TERMINAL') {
      return { kind: 'VIRTUAL_SERVICE' };
    }
    return {
      kind: 'CRAFT_MECHANIC',
      phase,
      mechanicId: mechanic.id,
      actionType: mechanic.actionType,
      mechanicName: mechanic.name,
      compactLabel: compactLabelForActionType(mechanic.actionType, mechanic.name),
    };
  }

  const harvest = HARVEST_BY_ID.get(actionId);
  if (harvest) {
    return {
      kind: 'CRAFT_MECHANIC',
      phase: 'SPECIALIZED',
      mechanicId: harvest.craftId,
      actionType: 'HARVEST_REFORGE',
      mechanicName: harvest.name,
      compactLabel: 'Harvest',
    };
  }

  if (actionId === 'restart_reacquire') {
    return {
      kind: 'CRAFT_MECHANIC',
      phase: 'RECOVER',
      mechanicId: actionId,
      actionType: 'RESTART_REACQUIRE',
      mechanicName: 'Abandon + Reacquire',
      compactLabel: 'Recover',
    };
  }

  if (
    actionId.startsWith('acquire_') ||
    actionId.startsWith('method:') ||
    actionId.startsWith('bundle:') ||
    actionId.startsWith('candidate:')
  ) {
    return { kind: 'VIRTUAL_SERVICE' };
  }

  return { kind: 'UNKNOWN' };
}

export function craftPlanPhaseForAction(actionId: string): CraftPlanPhase | undefined {
  const classification = classifyCraftPlanAction(actionId);
  return classification.kind === 'CRAFT_MECHANIC' ? classification.phase : undefined;
}

function requirementIdentityForPlayer(
  requirement: ModRequirement,
  index: number,
): string {
  return requirement.modId ?? requirement.name ?? requirement.modGroup ?? `target requirement ${index + 1}`;
}

function metadataMatchesRequirement(
  metadata: CraftPlanModifierMetadata,
  requirement: ModRequirement,
): boolean {
  if (requirement.modId && metadata.modId !== requirement.modId) return false;
  if (requirement.name && metadata.name !== requirement.name) return false;
  if (requirement.modGroup &&
      metadata.modGroup !== requirement.modGroup &&
      !metadata.modGroups.includes(requirement.modGroup)) return false;
  if (requirement.minTierNumber !== undefined && metadata.tier < requirement.minTierNumber) return false;
  if (requirement.maxTierNumber !== undefined && metadata.tier > requirement.maxTierNumber) return false;
  return true;
}

function requirementMetadata(
  target: TargetDefinition,
  requirementId: string,
  metadata: readonly CraftPlanModifierMetadata[],
): CraftPlanModifierMetadata[] {
  const requirements = [
    ...target.requiredMods,
    ...(target.acceptableAnyOf?.flat() ?? []),
  ];
  const matchingRequirements = requirements.filter((requirement, index) =>
    requirementIdentityForPlayer(requirement, index) === requirementId ||
    requirement.modId === requirementId ||
    requirement.name === requirementId ||
    requirement.modGroup === requirementId
  );
  const exactMetadata = metadata.filter((entry) => entry.modId === requirementId);
  if (exactMetadata.length > 0) return exactMetadata;
  return metadata.filter((entry) =>
    matchingRequirements.some((requirement) => metadataMatchesRequirement(entry, requirement))
  );
}

function affixRole(
  modId: string,
  context: PolicyExplanationRule['context'],
  target: TargetDefinition,
  metadata: CraftPlanModifierMetadata | undefined,
): PlayerModifierRole {
  if (context.requiredTargetModIds.includes(modId)) return 'REQUIRED_TARGET';
  if (context.acceptableTargetBranches.flat().includes(modId)) return 'ACCEPTABLE_TARGET';
  if (metadata) {
    if (target.requiredMods.some((requirement) => metadataMatchesRequirement(metadata, requirement))) {
      return 'REQUIRED_TARGET';
    }
    if ((target.acceptableAnyOf?.flat() ?? []).some(
      (requirement) => metadataMatchesRequirement(metadata, requirement)
    )) return 'ACCEPTABLE_TARGET';
  }
  return 'JUNK';
}

function overlappingModGroup(
  left: CraftPlanModifierMetadata,
  right: CraftPlanModifierMetadata,
): boolean {
  const leftGroups = new Set([left.modGroup, ...left.modGroups].filter(Boolean));
  return [right.modGroup, ...right.modGroups].some((group) => leftGroups.has(group));
}

function missingTargetMetadata(
  context: PolicyExplanationRule['context'],
  target: TargetDefinition,
  catalog: readonly CraftPlanModifierMetadata[],
): CraftPlanModifierMetadata[] {
  const missingRequirementIds = [
    ...context.unmatchedRequiredTargetModIds,
    ...(context.acceptableTargetBranches.length > 0 && !context.acceptableAlternativeSatisfied
      ? context.acceptableTargetBranches.flat()
      : []),
  ];
  return [...new Map(missingRequirementIds
    .flatMap((requirementId) => requirementMetadata(target, requirementId, catalog))
    .map((metadata) => [metadata.modId, metadata])).values()];
}

function junkKindForAffix(options: {
  metadata: CraftPlanModifierMetadata;
  isFractured: boolean;
  side: 'PREFIX' | 'SUFFIX';
  context: PolicyExplanationRule['context'];
  target: TargetDefinition;
  catalog: readonly CraftPlanModifierMetadata[];
}): PlayerJunkKind {
  if (options.isFractured) return 'FRACTURED';
  const missingMetadata = missingTargetMetadata(
    options.context,
    options.target,
    options.catalog,
  );
  if (missingMetadata.some((targetMetadata) =>
    targetMetadata.genType.toUpperCase() === options.side &&
    overlappingModGroup(options.metadata, targetMetadata)
  )) return 'BLOCKS_MISSING_TARGET';
  const maximum = options.side === 'PREFIX'
    ? getMaxPrefixes(options.context.rarity)
    : getMaxSuffixes(options.context.rarity);
  const occupied = options.side === 'PREFIX'
    ? options.context.prefixCount
    : options.context.suffixCount;
  if (occupied >= maximum && missingMetadata.some((targetMetadata) =>
    targetMetadata.genType.toUpperCase() === options.side
  )) return 'OCCUPIES_LAST_COMPATIBLE_SLOT';
  return 'SAFE_FOR_THIS_RULE';
}

/** Canonical role assignment used by the player-rule compiler and direct diagnostics. */
export function classifyPlayerRuleAffixes(options: {
  context: PolicyExplanationRule['context'];
  target: TargetDefinition;
  modifierMetadata: readonly CraftPlanModifierMetadata[];
}): PlayerCraftRuleAffixEvidence[] {
  const metadataById = new Map(options.modifierMetadata.map((metadata) => [metadata.modId, metadata]));
  return ([
    ...options.context.prefixes.map((affix) => ({ side: 'PREFIX' as const, affix })),
    ...options.context.suffixes.map((affix) => ({ side: 'SUFFIX' as const, affix })),
  ]).map(({ side, affix }) => {
    const metadata = metadataById.get(affix.modId);
    const role = affixRole(affix.modId, options.context, options.target, metadata);
    return {
      side,
      modId: affix.modId,
      tier: affix.tier,
      isFractured: affix.isFractured,
      role,
      ...(role === 'JUNK' && metadata
        ? {
            junkKind: junkKindForAffix({
              metadata,
              isFractured: affix.isFractured,
              side,
              context: options.context,
              target: options.target,
              catalog: options.modifierMetadata,
            }),
          }
        : {}),
    };
  });
}

function playerRuleStage(actionId: string): PlayerCraftRuleStage | undefined {
  const classification = classifyCraftPlanAction(actionId);
  if (classification.kind !== 'CRAFT_MECHANIC') return undefined;
  switch (classification.phase) {
    case 'ACQUIRE': return 'ACQUIRE';
    case 'INITIALIZE': return 'MAKE_MAGIC';
    case 'ROLL':
    case 'FILL': return 'MAGIC_ROLL';
    case 'PROMOTE': return 'PROMOTE';
    case 'FINISH': return 'RARE_FINISH';
    case 'SPECIALIZED': return 'SPECIALIZED';
    case 'RECOVER': return 'RECOVER';
    default: return undefined;
  }
}

function playerRuleOutcome(
  actionId: string,
  affixes: readonly PlayerCraftRuleAffixEvidence[],
): PlayerCraftRuleOutcome {
  const classification = classifyCraftPlanAction(actionId);
  if (classification.kind !== 'CRAFT_MECHANIC') {
    return {
      summary: 'Check the resulting item against the first matching rule.',
      branches: [],
      recoveryKind: 'RECHECK_CURRENT_STAGE',
    };
  }
  switch (classification.actionType) {
    case 'TRANSFORMATION_ORB':
      return {
        summary: 'Check the resulting Magic item against the Magic rolling rules.',
        branches: [],
        recoveryKind: 'RECHECK_MAGIC',
      };
    case 'ALTERATION_ORB':
      return {
        summary: 'Check the new Magic affixes against the Magic rolling rules.',
        branches: [],
        recoveryKind: 'RECHECK_MAGIC',
      };
    case 'AUGMENTATION_ORB':
      return {
        summary: 'Re-check the resulting Magic item; use Regal only if a promotion rule matches.',
        branches: [],
        recoveryKind: 'RECHECK_MAGIC',
      };
    case 'REGAL_ORB':
      return {
        summary: 'Check the resulting Rare item against the Rare finishing rules.',
        branches: [],
        recoveryKind: 'CHECK_RARE',
      };
    case 'EXALTED_ORB':
      return {
        summary: 'If the target is complete, stop; otherwise re-check the Rare finishing rules.',
        branches: ['A new modifier is not guaranteed to be a target modifier.'],
        recoveryKind: 'RECHECK_RARE_OR_FINISH',
      };
    case 'ANNULMENT_ORB':
      return {
        summary: 'Check which removable modifier was removed, then follow the matching branch.',
        branches: [
          'If junk was removed, re-check for an Exalted Orb or finish rule.',
          'If a target was removed, re-check the complete rulebook for the certified recovery action.',
          'If another affix was removed, re-check the Rare finishing rules.',
        ],
        recoveryKind: 'STATE_DEPENDENT_ANNUL',
      };
    case 'SCOURING_ORB': {
      const keepsFracture = affixes.some((affix) => affix.isFractured);
      return keepsFracture
        ? {
            summary: 'Continue from the resulting fractured Magic item and re-check the Magic rules.',
            branches: [],
            recoveryKind: 'SCOUR_TO_FRACTURED_MAGIC',
          }
        : {
            summary: 'Continue from the resulting clean Normal item and re-check the start rules.',
            branches: [],
            recoveryKind: 'SCOUR_TO_NORMAL',
          };
    }
    case 'RESTART_REACQUIRE':
      return {
        summary: 'Acquire the selected clean base again, then restart at the acquisition rules.',
        branches: [],
        recoveryKind: 'REACQUIRE',
      };
    case 'FRACTURING_ORB':
      return {
        summary: 'Check the fractured modifier, then follow the matching acquisition outcome.',
        branches: [
          'If the preparation target fractured, follow the certified cleanup and downstream handoff rules.',
          'If junk fractured, follow the certified reacquisition rule.',
        ],
        recoveryKind: 'FRACTURE_HANDOFF_OR_REACQUIRE',
      };
    case 'HARVEST_REFORGE':
    case 'CHAOS_ORB':
    case 'DIVINE_ORB':
      return {
        summary: 'Check the resulting item against the first matching rule for its current stage.',
        branches: [],
        recoveryKind: 'RECHECK_CURRENT_STAGE',
      };
    default:
      return {
        summary: 'Check the resulting item against the first matching rule.',
        branches: [],
        recoveryKind: 'RECHECK_CURRENT_STAGE',
      };
  }
}

function playerRuleCondition(options: {
  context: PolicyExplanationRule['context'];
  target: TargetDefinition;
  modifierMetadata: readonly CraftPlanModifierMetadata[];
  affixes: readonly PlayerCraftRuleAffixEvidence[];
}): PlayerCraftRuleCondition {
  const junkByKey = new Map<string, { side: 'PREFIX' | 'SUFFIX'; kind: PlayerJunkKind; count: number }>();
  for (const affix of options.affixes.filter((candidate) => candidate.role === 'JUNK')) {
    const kind = affix.junkKind ?? 'SAFE_FOR_THIS_RULE';
    const key = `${affix.side}|${kind}`;
    const row = junkByKey.get(key) ?? { side: affix.side, kind, count: 0 };
    row.count++;
    junkByKey.set(key, row);
  }
  const missingMetadata = missingTargetMetadata(
    options.context,
    options.target,
    options.modifierMetadata,
  );
  const openCompatibleTargetSlots: Array<'PREFIX' | 'SUFFIX'> = [];
  if (
    options.context.prefixCount < getMaxPrefixes(options.context.rarity) &&
    missingMetadata.some((metadata) => metadata.genType === 'Prefix')
  ) openCompatibleTargetSlots.push('PREFIX');
  if (
    options.context.suffixCount < getMaxSuffixes(options.context.rarity) &&
    missingMetadata.some((metadata) => metadata.genType === 'Suffix')
  ) openCompatibleTargetSlots.push('SUFFIX');
  return {
    policyScope: options.context.policyScope,
    progressKind: options.context.progressKind,
    rarity: options.context.rarity,
    prefixCount: options.context.prefixCount,
    suffixCount: options.context.suffixCount,
    requiredPresentModIds: [...options.context.matchedRequiredTargetModIds].sort(),
    requiredMissingModIds: [...options.context.unmatchedRequiredTargetModIds].sort(),
    acceptablePresentModIds: [...options.context.matchedAcceptableTargetModIds].sort(),
    fracturedRequiredTargetModIds: options.affixes
      .filter((affix) => affix.role === 'REQUIRED_TARGET' && affix.isFractured)
      .map((affix) => affix.modId)
      .sort(),
    fracturedAcceptableTargetModIds: options.affixes
      .filter((affix) => affix.role === 'ACCEPTABLE_TARGET' && affix.isFractured)
      .map((affix) => affix.modId)
      .sort(),
    acceptableAlternativeRequired: options.context.acceptableTargetBranches.length > 0,
    acceptableAlternativeSatisfied: options.context.acceptableAlternativeSatisfied,
    openCompatibleTargetSlots,
    junk: [...junkByKey.values()].sort((left, right) =>
      left.side.localeCompare(right.side) || left.kind.localeCompare(right.kind)
    ),
  };
}

function stableConditionKey(condition: PlayerCraftRuleCondition): string {
  return JSON.stringify(condition);
}

export function compilePlayerCraftRules(options: {
  target: TargetDefinition;
  rules: PolicyExplanationRule[];
  selectedPhysicalActionIds: ReadonlySet<string>;
  modifierMetadata: readonly CraftPlanModifierMetadata[];
}): { rules: PlayerCraftRule[]; certification: PlayerCraftRuleCertification } {
  interface Draft {
    policyRuleIndex: number;
    source: PolicyExplanationRule;
    stage: PlayerCraftRuleStage;
    condition: PlayerCraftRuleCondition;
    affixes: PlayerCraftRuleAffixEvidence[];
    outcome: PlayerCraftRuleOutcome;
    recoverySignature: string;
  }
  const reasons: string[] = [];
  const drafts: Draft[] = [];
  const sourceKeys = new Set<string>();
  for (const [policyRuleIndex, rule] of options.rules.entries()) {
    if (rule.context.acquisitionMenu || !options.selectedPhysicalActionIds.has(rule.actionId)) continue;
    const stage = playerRuleStage(rule.actionId);
    if (!stage) {
      reasons.push(`policy rule ${policyRuleIndex} uses unknown player action ${rule.actionId}`);
      continue;
    }
    const evidenceErrors = policyRuleEvidenceErrors(rule);
    if (evidenceErrors.length > 0) {
      reasons.push(...evidenceErrors.map((error) => `policy rule ${policyRuleIndex}: ${error}`));
      continue;
    }
    const affixes = classifyPlayerRuleAffixes({
      context: rule.context,
      target: options.target,
      modifierMetadata: options.modifierMetadata,
    });
    for (const affix of affixes.filter((candidate) => candidate.role === 'JUNK')) {
      if (!options.modifierMetadata.some((metadata) => metadata.modId === affix.modId)) {
        reasons.push(`policy rule ${policyRuleIndex}: junk ${affix.modId} lacks modifier metadata`);
      }
      if (!affix.junkKind) reasons.push(`policy rule ${policyRuleIndex}: junk ${affix.modId} lacks a junk category`);
    }
    for (const sourceStateKey of rule.sourceStateKeys) {
      if (sourceKeys.has(sourceStateKey)) reasons.push(`source state ${sourceStateKey} is represented more than once`);
      sourceKeys.add(sourceStateKey);
    }
    const condition = playerRuleCondition({
      context: rule.context,
      target: options.target,
      modifierMetadata: options.modifierMetadata,
      affixes,
    });
    const outcome = playerRuleOutcome(rule.actionId, affixes);
    drafts.push({
      policyRuleIndex,
      source: rule,
      stage,
      condition,
      affixes,
      outcome,
      recoverySignature: JSON.stringify(outcome),
    });
  }

  const coarseConditions = new Map<string, Draft[]>();
  for (const draft of drafts) {
    const entries = coarseConditions.get(stableConditionKey(draft.condition)) ?? [];
    entries.push(draft);
    coarseConditions.set(stableConditionKey(draft.condition), entries);
  }
  let minimalExceptionCount = 0;
  for (const [key, entries] of coarseConditions) {
    const actionRecovery = new Set(entries.map((entry) =>
      `${entry.source.actionId}\u0000${entry.recoverySignature}`
    ));
    if (actionRecovery.size > 1) {
      const byActionRecovery = new Map<string, Draft[]>();
      for (const entry of entries) {
        const actionKey = `${entry.source.actionId}\u0000${entry.recoverySignature}`;
        const actionEntries = byActionRecovery.get(actionKey) ?? [];
        actionEntries.push(entry);
        byActionRecovery.set(actionKey, actionEntries);
      }
      let separated = false;
      if (byActionRecovery.size === 2) {
        const actionGroups = [...byActionRecovery.entries()].sort((left, right) => {
          const junkIdentityCount = (entries: Draft[]) => new Set(entries.flatMap((entry) =>
            entry.affixes.filter((affix) => affix.role === 'JUNK').map((affix) => affix.modId)
          )).size;
          return junkIdentityCount(left[1]) - junkIdentityCount(right[1]);
        });
        for (const [selectedKey, selectedEntries] of actionGroups) {
          const otherEntries = actionGroups
            .filter(([actionKey]) => actionKey !== selectedKey)
            .flatMap(([, actionEntries]) => actionEntries);
          const allDistinguishing = [...new Set(selectedEntries.flatMap((entry) => entry.affixes
            .filter((affix) => affix.role === 'JUNK')
            .map((affix) => affix.modId)))]
            .filter((modId) => otherEntries.every((entry) =>
              !entry.affixes.some((affix) => affix.role === 'JUNK' && affix.modId === modId)
            ))
            .sort();
          const candidateSets = selectedEntries.map((entry) => allDistinguishing.filter((modId) =>
            entry.affixes.some((affix) => affix.role === 'JUNK' && affix.modId === modId)
          ));
          const shared = allDistinguishing.filter((modId) =>
            candidateSets.every((candidates) => candidates.includes(modId))
          );
          const distinguishing = shared.length > 0
            ? [shared[0]]
            : candidateSets.every((candidates) => candidates.length === 1)
              ? [...new Set(candidateSets.flat())].sort()
              : [];
          if (
            distinguishing.length === 0 ||
            !selectedEntries.every((entry) => entry.affixes.some((affix) =>
              affix.role === 'JUNK' && distinguishing.includes(affix.modId)
            ))
          ) continue;
          for (const entry of selectedEntries) {
            entry.condition = {
              ...entry.condition,
              minimalException: {
                relation: 'HAS_JUNK',
                modIds: distinguishing,
                reason: 'No compact slot, fracture, target-access, or junk-category predicate separated the selected actions.',
              },
            };
          }
          for (const entry of otherEntries) {
            entry.condition = {
              ...entry.condition,
              minimalException: {
                relation: 'DOES_NOT_HAVE_JUNK',
                modIds: distinguishing,
                reason: 'Complement of the smallest exact junk exception needed to preserve the selected action split.',
              },
            };
          }
          minimalExceptionCount++;
          separated = true;
          break;
        }
      }
      if (!separated) {
        reasons.push(
          `player condition ${key} selects multiple actions or recovery paths and has no compact truthful separator: ` +
          [...actionRecovery].map((entry) => entry.split('\u0000')[0]).join(', ') + '; exact evidence ' +
          entries.map((entry) =>
            `${entry.policyRuleIndex}:${entry.source.actionId}:[${entry.affixes
              .filter((affix) => affix.role === 'JUNK')
              .map((affix) => affix.modId)
              .join(',')}]`
          ).join(' | '),
        );
      }
    }
  }

  const byCondition = new Map<string, Draft[]>();
  for (const draft of drafts) {
    const key = stableConditionKey(draft.condition);
    const entries = byCondition.get(key) ?? [];
    entries.push(draft);
    byCondition.set(key, entries);
  }
  for (const [key, entries] of byCondition) {
    const actionRecovery = new Set(entries.map((entry) =>
      `${entry.source.actionId}\u0000${entry.recoverySignature}`
    ));
    if (actionRecovery.size > 1) reasons.push(`player condition ${key} remained ambiguous after exception derivation`);
  }

  const sourcePolicyRuleIndices = drafts.map((draft) => draft.policyRuleIndex).sort((a, b) => a - b);
  const selectedActionIds = [...options.selectedPhysicalActionIds].sort();
  const representedActionIds = [...new Set(drafts.map((draft) => draft.source.actionId))].sort();
  for (const actionId of selectedActionIds) {
    if (!representedActionIds.includes(actionId)) reasons.push(`selected action ${actionId} lacks positive policy-rule evidence`);
  }
  if (drafts.length === 0) reasons.push('no positive physical policy rules were available');

  const certificationBase: Omit<PlayerCraftRuleCertification, 'status' | 'reasons'> = {
    sourcePolicyRuleIndices,
    coveredPolicyRuleIndices: reasons.length === 0 ? [...sourcePolicyRuleIndices] : [],
    selectedActionIds,
    representedActionIds,
    representedStateCount: drafts.reduce((sum, draft) => sum + draft.source.representedStateCount, 0),
    expectedVisits: drafts.reduce((sum, draft) => sum + draft.source.expectedVisits, 0),
    minimalExceptionCount,
  };
  if (reasons.length > 0) {
    return {
      rules: [],
      certification: { status: 'WITHHELD', reasons: [...new Set(reasons)], ...certificationBase },
    };
  }

  const stageOrder: PlayerCraftRuleStage[] = [
    'ACQUIRE',
    'MAKE_MAGIC',
    'MAGIC_ROLL',
    'PROMOTE',
    'RARE_FINISH',
    'SPECIALIZED',
    'RECOVER',
    'TERMINAL',
  ];
  const grouped = [...byCondition.values()].map((entries) => {
    const first = entries[0];
    return {
      entries,
      first,
      sortKey: `${String(stageOrder.indexOf(first.stage)).padStart(2, '0')}|` +
        `${stableConditionKey(first.condition)}|${first.source.actionId}`,
    };
  }).sort((left, right) => left.sortKey.localeCompare(right.sortKey));
  const playerRules: PlayerCraftRule[] = grouped.map(({ entries, first }, index) => ({
    id: `player-rule-${index + 1}`,
    stage: first.stage,
    priority: index + 1,
    when: first.condition,
    actionId: first.source.actionId,
    action: first.source.action,
    then: first.outcome,
    representedStateCount: entries.reduce((sum, entry) => sum + entry.source.representedStateCount, 0),
    expectedVisits: entries.reduce((sum, entry) => sum + entry.source.expectedVisits, 0),
    evidenceStatus: 'CERTIFIED',
    policyRuleIndices: entries.map((entry) => entry.policyRuleIndex).sort((a, b) => a - b),
    sourceStateKeys: entries.flatMap((entry) => entry.source.sourceStateKeys).sort(),
    sourceEvidence: entries.map((entry) => ({
      policyRuleIndex: entry.policyRuleIndex,
      sourceStateKeys: [...entry.source.sourceStateKeys],
      representedStateCount: entry.source.representedStateCount,
      expectedVisits: entry.source.expectedVisits,
      exactAffixes: entry.affixes,
    })),
    recoverySignature: first.recoverySignature,
  }));
  return {
    rules: playerRules,
    certification: { status: 'CERTIFIED', reasons: [], ...certificationBase },
  };
}

function targetRequirementIds(target: TargetDefinition): string[] {
  return target.requiredMods.map((requirement, index) =>
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
      rule.context.policyScope === 'DOWNSTREAM' &&
      rule.context.progressKind === 'FINAL' &&
      rule.context.rarity === 'magic' &&
      rule.context.matchedRequiredTargetModIds.length === 1 &&
      rule.context.matchedRequiredTargetModIds[0] === targetModId &&
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
      rule.context.policyScope !== 'DOWNSTREAM' ||
      rule.context.progressKind !== 'FINAL' ||
      rule.context.rarity !== 'magic' ||
      rule.context.matchedRequiredTargetModIds.length !== 1 ||
      !targetIds.includes(rule.context.matchedRequiredTargetModIds[0]) ||
      rule.expectedVisits <= 0
    ) continue;
    const targetModId = rule.context.matchedRequiredTargetModIds[0];
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
    policyScope: context.policyScope,
    progressKind: context.progressKind,
    targetModIds: context.targetModIds,
    requiredTargetModIds: context.requiredTargetModIds,
    acceptableTargetBranches: context.acceptableTargetBranches,
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

function comparableDecisionContextKey(context: PolicyExplanationRule['context']): string {
  if (
    context.policyScope === 'ACQUISITION' &&
    context.progressKind === 'PREPARATION' &&
    context.rarity === 'magic'
  ) {
    // Alter, Augment, and Regal are comparable decisions in the broad Magic
    // preparation stage even though exact affix counts/progress differ. Later
    // Normal/Rare acquisition states retain their narrower physical context.
    return JSON.stringify({
      policyScope: context.policyScope,
      progressKind: context.progressKind,
      targetModIds: context.targetModIds,
      requiredTargetModIds: context.requiredTargetModIds,
      acceptableTargetBranches: context.acceptableTargetBranches,
      rarity: context.rarity,
      influenced: context.influenced,
      synthesised: context.synthesised,
      acquisitionMenu: context.acquisitionMenu,
    });
  }
  return coarseContextKey(context);
}

function exactStringSet(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

function exactNumberSet(values: readonly number[]): number[] {
  return [...new Set(values)].sort((left, right) => left - right);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return JSON.stringify(exactStringSet(left)) === JSON.stringify(exactStringSet(right));
}

function policyRuleEvidenceErrors(rule: PolicyExplanationRule): string[] {
  const errors: string[] = [];
  const context = rule.context;
  if (context.prefixCount !== context.prefixes.length) {
    errors.push(`prefix count ${context.prefixCount} != ${context.prefixes.length} exact prefixes`);
  }
  if (context.suffixCount !== context.suffixes.length) {
    errors.push(`suffix count ${context.suffixCount} != ${context.suffixes.length} exact suffixes`);
  }
  const matched = exactStringSet(context.matchedTargetModIds);
  const unmatched = exactStringSet(context.unmatchedTargetModIds);
  const overlap = matched.filter((targetModId) => unmatched.includes(targetModId));
  if (overlap.length > 0) errors.push(`matched/missing target overlap: ${overlap.join(', ')}`);
  if (!sameStrings([...matched, ...unmatched], context.targetModIds)) {
    errors.push('matched + missing targets do not reconcile with the context target definition');
  }
  const matchedRequired = exactStringSet(context.matchedRequiredTargetModIds);
  const unmatchedRequired = exactStringSet(context.unmatchedRequiredTargetModIds);
  if (!sameStrings([...matchedRequired, ...unmatchedRequired], context.requiredTargetModIds)) {
    errors.push('matched + missing required modifiers do not reconcile with required target definition');
  }
  const acceptableIds = exactStringSet(context.acceptableTargetBranches.flat());
  if (context.matchedAcceptableTargetModIds.some((modId) => !acceptableIds.includes(modId))) {
    errors.push('matched acceptable modifier is absent from acceptable branch definition');
  }
  const computedSatisfiedBranches = context.acceptableTargetBranches.flatMap((branch, index) =>
    branch.every((modId) => context.matchedAcceptableTargetModIds.includes(modId)) ? [index] : []
  );
  if (!sameStrings(
    computedSatisfiedBranches.map(String),
    context.satisfiedAcceptableBranchIndices.map(String),
  )) {
    errors.push('satisfied acceptable branch indices do not reconcile with matched alternatives');
  }
  const acceptableSatisfied = context.acceptableTargetBranches.length === 0 ||
    computedSatisfiedBranches.length > 0;
  if (acceptableSatisfied !== context.acceptableAlternativeSatisfied) {
    errors.push('acceptable-alternative completion flag does not reconcile with branch evidence');
  }
  if (!Number.isInteger(rule.representedStateCount) || rule.representedStateCount <= 0) {
    errors.push(`invalid represented-state count ${rule.representedStateCount}`);
  }
  if (rule.sourceStateKeys.length !== rule.representedStateCount) {
    errors.push(
      `${rule.sourceStateKeys.length} source-state identities != ` +
      `${rule.representedStateCount} represented states`,
    );
  }
  if (!Number.isFinite(rule.expectedVisits) || rule.expectedVisits < 0) {
    errors.push(`invalid expected visits ${rule.expectedVisits}`);
  }
  for (const affix of [...context.prefixes, ...context.suffixes]) {
    if (typeof affix.isFractured !== 'boolean') {
      errors.push(`affix ${affix.modId} omitted authoritative fracture status`);
    }
  }
  return errors;
}

function decisionGroupSummary(
  rules: PolicyExplanationRule[],
  indices: number[],
): string {
  const contexts = indices.map((index) => rules[index].context);
  const first = contexts[0];
  const prefixCounts = exactNumberSet(contexts.map((context) => context.prefixCount));
  const suffixCounts = exactNumberSet(contexts.map((context) => context.suffixCount));
  const requiredProgressCounts = exactNumberSet(
    contexts.map((context) => context.matchedRequiredTargetModIds.length),
  );
  const requiredTotal = first.requiredTargetModIds.length;
  const acceptableProgressCounts = exactNumberSet(
    contexts.map((context) => context.acceptableAlternativeSatisfied ? 1 : 0),
  );
  const rarity = `${first.rarity[0].toUpperCase()}${first.rarity.slice(1)}`;
  const affixShape = prefixCounts.length === 1 && suffixCounts.length === 1
    ? `${prefixCounts[0]}P/${suffixCounts[0]}S`
    : `variable affix counts (prefixes ${prefixCounts.join('/')}; suffixes ${suffixCounts.join('/')})`;
  const requiredProgressLabel = requiredProgressCounts.length === 1
    ? `${first.progressKind === 'PREPARATION'
        ? 'prep'
        : first.acceptableTargetBranches.length > 0 ? 'required' : 'final'} progress ` +
      `${requiredProgressCounts[0]}/${requiredTotal}`
    : `varying ${first.progressKind === 'PREPARATION'
        ? 'preparation'
        : first.acceptableTargetBranches.length > 0 ? 'required-target' : 'final-target'} progress ` +
      `(${requiredProgressCounts.map((count) => `${count}/${requiredTotal}`).join(', ')})`;
  const acceptableProgressLabel = first.acceptableTargetBranches.length === 0
    ? ''
    : `; acceptable alternative ${acceptableProgressCounts.map((count) => `${count}/1`).join(' or ')}`;
  const scope = first.policyScope === 'ACQUISITION'
    ? 'Acquisition-preparation'
    : 'Final-craft';
  return `${scope} ${rarity} states with ${affixShape} at ${requiredProgressLabel}${acceptableProgressLabel} choose different ` +
    'actions based on exact current affixes.';
}

function decisionGroups(
  rules: PolicyExplanationRule[],
  selectedPhysicalActionIds: ReadonlySet<string>,
): {
  groups: Array<{ group: CraftPlanDecisionGroup; phase: CraftPlanPhase }>;
  withheld: WithheldCraftPlanDecisionGroup[];
} {
  const contexts = new Map<string, number[]>();
  for (const [index, rule] of rules.entries()) {
    if (rule.context.acquisitionMenu || !selectedPhysicalActionIds.has(rule.actionId)) continue;
    const key = comparableDecisionContextKey(rule.context);
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
  const withheld: WithheldCraftPlanDecisionGroup[] = [];
  for (const [cohortKey, indices] of contexts) {
    const distinctActions = new Set(indices.map((index) => rules[index].actionId));
    if (distinctActions.size < 2) continue;
    const evidenceErrors = indices.flatMap((index) =>
      policyRuleEvidenceErrors(rules[index]).map((error) => `rule ${index}: ${error}`)
    );
    if (evidenceErrors.length > 0) {
      withheld.push({
        cohortKey,
        policyRuleIndices: [...indices],
        reasons: evidenceErrors,
      });
      continue;
    }
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
    const phase = phasePriority.find((candidate) => phases.includes(candidate));
    if (phase === undefined) continue;
    const first = rules[indices[0]];
    const cohortContexts = indices.map((index) => rules[index].context);
    const targetDefinitions = new Set(cohortContexts.map((context) => JSON.stringify({
      all: exactStringSet(context.targetModIds),
      required: exactStringSet(context.requiredTargetModIds),
      acceptable: context.acceptableTargetBranches,
    })));
    const scopeKinds = new Set(
      cohortContexts.map((context) => `${context.policyScope}|${context.progressKind}|${context.rarity}`),
    );
    if (targetDefinitions.size !== 1 || scopeKinds.size !== 1) {
      withheld.push({
        cohortKey,
        policyRuleIndices: [...indices],
        reasons: ['cohort mixed policy scope, progress semantics, rarity, or target definition'],
      });
      continue;
    }
    const options = [...byAction.values()].sort((left, right) =>
      right.expectedVisits - left.expectedVisits || left.actionId.localeCompare(right.actionId)
    );
    for (const option of options) {
      const representedStateCount = option.policyRuleIndices.reduce(
        (sum, index) => sum + rules[index].representedStateCount,
        0,
      );
      const expectedVisits = option.policyRuleIndices.reduce(
        (sum, index) => sum + rules[index].expectedVisits,
        0,
      );
      if (representedStateCount !== option.representedStateCount ||
          Math.abs(expectedVisits - option.expectedVisits) > 1e-9) {
        withheld.push({
          cohortKey,
          policyRuleIndices: [...indices],
          reasons: [`option ${option.actionId} aggregate evidence did not reconcile`],
        });
        continue;
      }
      if (option.policyRuleIndices.some((index) => rules[index].actionId !== option.actionId)) {
        withheld.push({
          cohortKey,
          policyRuleIndices: [...indices],
          reasons: [`option ${option.actionId} contains a different selected action`],
        });
        continue;
      }
    }
    if (withheld.some((entry) => entry.cohortKey === cohortKey)) continue;
    groups.push({
      phase,
      group: {
        id: `decision_${groups.length + 1}`,
        summary: decisionGroupSummary(rules, indices),
        representedStateCount: indices.reduce((sum, index) => sum + rules[index].representedStateCount, 0),
        expectedVisits: indices.reduce((sum, index) => sum + rules[index].expectedVisits, 0),
        options,
        evidenceStatus: 'RECONCILED',
        cohort: {
          policyScope: first.context.policyScope,
          progressKind: first.context.progressKind,
          rarity: first.context.rarity,
          targetModIds: [...first.context.targetModIds],
          requiredTargetModIds: [...first.context.requiredTargetModIds],
          acceptableTargetBranches: first.context.acceptableTargetBranches.map((branch) => [...branch]),
          matchedProgressCounts: exactNumberSet(
            cohortContexts.map((context) => context.matchedTargetModIds.length),
          ),
          matchedRequiredProgressCounts: exactNumberSet(
            cohortContexts.map((context) => context.matchedRequiredTargetModIds.length),
          ),
          acceptableProgressCounts: exactNumberSet(
            cohortContexts.map((context) => context.acceptableAlternativeSatisfied ? 1 : 0),
          ),
          prefixCounts: exactNumberSet(cohortContexts.map((context) => context.prefixCount)),
          suffixCounts: exactNumberSet(cohortContexts.map((context) => context.suffixCount)),
          policyRuleIndices: [...indices],
          focalPhase: phase,
        },
      },
    });
  }
  return { groups, withheld };
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
        title: `Use ${actions}`,
        instruction: `Use ${actions} in the exact states assigned to it by the selected policy.`,
      };
    case 'RECOVER':
      return {
        title: 'Recover from misses',
        instruction:
          `Use ${actions} when the selected policy calls for recovery. If it Scours, continue from ` +
          `the resulting item's actual rarity/state; with one fractured affix, Scour leaves a Magic item. ` +
          'If it Reacquires, return to the selected acquisition state. Expand Decision details for the exact next action.',
      };
    case 'SUCCESS':
      return { title: 'Finish', instruction: 'Stop when every requested target condition is satisfied.' };
    default:
      return { title: 'Acquire the base', instruction: `Begin with ${actions}.` };
  }
}

function withheldPlayerRuleCertification(reason: string): PlayerCraftRuleCertification {
  return {
    status: 'WITHHELD',
    reasons: [reason],
    sourcePolicyRuleIndices: [],
    coveredPolicyRuleIndices: [],
    selectedActionIds: [],
    representedActionIds: [],
    representedStateCount: 0,
    expectedVisits: 0,
    minimalExceptionCount: 0,
  };
}

function playerFinishRule(target: TargetDefinition): PlayerCraftFinishRule {
  return {
    id: 'player-rule-finish',
    stage: 'TERMINAL',
    requiredTargetModIds: target.requiredMods.map(requirementIdentityForPlayer).sort(),
    acceptableTargetBranches: (target.acceptableAnyOf ?? []).map((branch) =>
      branch.map(requirementIdentityForPlayer).sort()
    ),
    requiredRarity: target.requiredRarity,
    extraAffixesAllowed: target.finalStateConstraints?.maxUnmatchedAffixes === undefined,
    evidenceStatus: 'CERTIFIED',
  };
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
      withheldDecisionDetails: [],
      playerRules: [],
      playerRuleCertification: withheldPlayerRuleCertification(
        'No selected executable policy was available for player-rule compilation.',
      ),
      exactPolicyBranchCount,
      exactPolicyBranchesHiddenByDefault: exactPolicyBranchCount,
      selectedActionIds: [],
      representedActionIds: [],
      uncoveredActionIds: [],
      inventedActionIds: [],
      excludedAccountingActionIds: [],
      excludedVirtualActionIds: [],
      unknownActionIds: [],
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

  const selectedSourceActionIds = unique([
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
  const classifications = new Map(
    selectedSourceActionIds.map((actionId) => [actionId, classifyCraftPlanAction(actionId)])
  );
  const selectedPhysicalActionIds = selectedSourceActionIds.filter(
    (actionId) => classifications.get(actionId)?.kind === 'CRAFT_MECHANIC'
  );
  const selectedPhysicalActionIdSet = new Set(selectedPhysicalActionIds);
  const excludedAccountingActionIds = selectedSourceActionIds.filter(
    (actionId) => classifications.get(actionId)?.kind === 'ACQUISITION_RESOURCE'
  );
  const excludedVirtualActionIds = selectedSourceActionIds.filter(
    (actionId) => classifications.get(actionId)?.kind === 'VIRTUAL_SERVICE'
  );
  const unknownActionIds = selectedSourceActionIds.filter(
    (actionId) => classifications.get(actionId)?.kind === 'UNKNOWN'
  );
  const playerRuleCompilation = compilePlayerCraftRules({
    target: source.target,
    rules: source.policyExplanation,
    selectedPhysicalActionIds: selectedPhysicalActionIdSet,
    modifierMetadata: source.modifierMetadata,
  });
  const downstreamPolicyActionIds = unique([
    ...source.policyExplanation
      .filter((rule) => !rule.context.acquisitionMenu && rule.expectedVisits > 0)
      .map((rule) => rule.actionId),
    ...source.expectedActionUsage
      .filter((usage) => usage.expectedCount > 0 && usage.actionId !== source.recommended?.actionId)
      .map((usage) => usage.actionId),
  ]).filter((actionId) => selectedPhysicalActionIdSet.has(actionId));
  const synthesisPhysicalActionIds = unique([
    ...(selectedSynthesis?.expectedActionUsage ?? [])
      .filter((usage) => usage.expectedCount > 0)
      .map((usage) => usage.actionId),
    ...(selectedSynthesis?.wrongFractureRecovery?.recoveryActions ?? [])
      .filter((recovery) => recovery.expectedVisits > 0)
      .map((recovery) => recovery.actionId),
  ]).filter((actionId) => selectedPhysicalActionIdSet.has(actionId));
  const byPhase = new Map<CraftPlanPhase, string[]>();
  for (const actionId of downstreamPolicyActionIds) {
    const phase = craftPlanPhaseForAction(actionId);
    if (phase === undefined) continue;
    const entries = byPhase.get(phase) ?? [];
    entries.push(actionId);
    byPhase.set(phase, unique(entries));
  }
  const conflicts = decisionGroups(source.policyExplanation, selectedPhysicalActionIdSet);
  const detailsByPhase = new Map<CraftPlanPhase, CraftPlanDecisionGroup[]>();
  for (const { group, phase } of conflicts.groups) {
    const entries = detailsByPhase.get(phase) ?? [];
    entries.push(group);
    detailsByPhase.set(phase, entries);
  }

  const acquisitionActionIds = unique([
    ...(byPhase.get('ACQUIRE') ?? []),
    ...synthesisPhysicalActionIds.filter((actionId) =>
      craftPlanPhaseForAction(actionId) !== 'RECOVER'
    ),
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

  if (unknownActionIds.length > 0) {
    return {
      status: 'UNCERTIFIED',
      startingPoint: selectedCandidate?.label ?? selectedMethod?.label ?? source.recommended.name,
      steps: [],
      targetOrderPreference,
      detailedDecisionCount: 0,
      withheldDecisionDetails: conflicts.withheld,
      playerRules: [],
      playerRuleCertification: {
        ...playerRuleCompilation.certification,
        status: 'WITHHELD',
        reasons: [
          ...playerRuleCompilation.certification.reasons,
          'One or more selected actions lack presentation metadata.',
        ],
      },
      exactPolicyBranchCount,
      exactPolicyBranchesHiddenByDefault: exactPolicyBranchCount,
      selectedActionIds: selectedPhysicalActionIds,
      representedActionIds: [],
      uncoveredActionIds: selectedPhysicalActionIds,
      inventedActionIds: [],
      excludedAccountingActionIds,
      excludedVirtualActionIds,
      unknownActionIds,
      withheldReason:
        'The optimizer found an executable policy, but the player instruction plan was withheld because one or more selected actions lack presentation metadata.',
      expectedPhysicalActions: source.recommended?.metrics?.expectedPhysicalActions,
      estimatedManualTimeMs: source.recommended?.metrics?.estimatedManualTimeMs,
      provenance:
        'Fail-closed presentation audit retained exact unknown action IDs; no unknown action was assigned a craft phase.',
    };
  }

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

  const synthesisRecoveryIds = synthesisPhysicalActionIds.filter(
    (actionId) => craftPlanPhaseForAction(actionId) === 'RECOVER'
  );
  const recoveryIds = unique([...(byPhase.get('RECOVER') ?? []), ...synthesisRecoveryIds]);
  let recovery: CraftPlanRecovery | undefined;
  if (recoveryIds.length > 0) {
    // A single synthetic return arrow is false when this compressed step
    // contains state-dependent Scour and/or Reacquire branches. Decision
    // details retain the exact on-policy destination for each physical state.
    const hasStateDependentDestination = recoveryIds.some((actionId) =>
      actionId === 'scouring_orb' || actionId === 'restart_reacquire'
    );
    const returnToStep = hasStateDependentDestination
      ? undefined
      : steps.find((step) => step.phase === 'INITIALIZE') ??
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
        'Recovery actions and any displayed destination are derived from selected on-policy actions and actual rarity progression.',
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
  const uncoveredActionIds = selectedPhysicalActionIds.filter(
    (actionId) => !representedActionIds.includes(actionId)
  );
  const inventedActionIds = representedActionIds.filter(
    (actionId) => !selectedPhysicalActionIdSet.has(actionId)
  );
  const status = uncoveredActionIds.length === 0 && inventedActionIds.length === 0 &&
      playerRuleCompilation.certification.status === 'CERTIFIED'
    ? 'CERTIFIED' as const
    : 'UNCERTIFIED' as const;

  return {
    status,
    startingPoint: selectedCandidate?.label ?? selectedMethod?.label ?? source.recommended.name,
    steps: status === 'CERTIFIED' ? steps : [],
    recovery,
    targetOrderPreference,
    detailedDecisionCount: conflicts.groups.length,
    withheldDecisionDetails: conflicts.withheld,
    playerRules: status === 'CERTIFIED' ? playerRuleCompilation.rules : [],
    playerFinishRule: status === 'CERTIFIED' ? playerFinishRule(source.target) : undefined,
    playerRuleCertification: playerRuleCompilation.certification,
    exactPolicyBranchCount,
    exactPolicyBranchesHiddenByDefault: exactPolicyBranchCount,
    selectedActionIds: selectedPhysicalActionIds,
    representedActionIds,
    uncoveredActionIds,
    inventedActionIds,
    excludedAccountingActionIds,
    excludedVirtualActionIds,
    unknownActionIds,
    withheldReason: status === 'UNCERTIFIED'
      ? playerRuleCompilation.certification.status === 'WITHHELD'
        ? 'Simple instructions withheld. The selected policy could not be grouped into unambiguous player rules. Technical evidence remains available for diagnosis.'
        : 'The optimizer found an executable policy, but the player instruction plan was withheld because selected mechanic coverage did not reconcile.'
      : undefined,
    expectedPhysicalActions: source.recommended?.metrics?.expectedPhysicalActions,
    estimatedManualTimeMs: source.recommended?.metrics?.estimatedManualTimeMs,
    optimalityNote: source.proof.globalOptimality === 'NOT YET PROVEN'
      ? 'This plan is the best certified policy found at the current search depth; Retry deeper may improve the expected cost or decisions.'
      : undefined,
    provenance:
      'Presentation-only deterministic compression of the certified selected acquisition and on-policy rules. ' +
      'Phase order comes from shared action mechanics; conflicts retain exact policy-rule indices.',
  };
}
