import type { ActionEffortProfile, SolverContext } from '../domain/CraftAction.ts';
import type { ItemState } from '../domain/ItemState.ts';
import { normalizeItemState } from '../domain/ItemState.ts';
import type { MethodFamilySpec } from '../domain/MethodFamily.ts';
import type { TargetDefinition } from '../domain/TargetDefinition.ts';
import {
  getAllTargetModRequirements,
  matchesModRequirement,
} from '../domain/TargetDefinition.ts';
import { getCanonicalStateKey } from '../rules/actionDiscovery.ts';
import {
  CRAFT_MECHANICS,
  createHarvestReforgeMechanics,
} from '../rules/actionRegistry.ts';
import {
  computeActionCostVector,
  evaluateFixedPolicyGraph,
  SolverCraftActionAdapter,
  type FixedPolicyGraphEvaluation,
  type GenericSearchResult,
  type OnPolicyRuleResult,
} from '../solver/genericSearch.ts';

export const POLICY_ADMISSIBILITY_VERSION = 'POLICY_ADMISSIBILITY_PHASE3C_V1';
export const POLICY_ADMISSIBILITY_TOLERANCE = 1e-8;

export type PolicyAcquisitionKind = 'CLEAN' | 'SELF_FRACTURE';

export type PolicyAdmissibilityFailureCode =
  | 'ACQUISITION_KIND_MISMATCH'
  | 'ACQUISITION_IDENTITY_MISMATCH'
  | 'ACQUISITION_COST_MISMATCH'
  | 'MECHANICS_SESSION_MISMATCH'
  | 'TARGET_IDENTITY_MISMATCH'
  | 'REQUIRED_ACTION_NOT_OBSERVED'
  | 'ACTION_NOT_ALLOWED'
  | 'ACTION_FORBIDDEN'
  | 'ACTION_NOT_IN_FAMILY_REGISTRY'
  | 'ACTION_ILLEGAL_IN_EXACT_STATE'
  | 'SOURCE_ACTION_GRAPH_MISSING'
  | 'TRANSITION_REGENERATION_MISSING'
  | 'TRANSITION_COST_MISMATCH'
  | 'TRANSITION_PHYSICAL_ACTION_MISMATCH'
  | 'TRANSITION_MANUAL_TIME_MISMATCH'
  | 'TRANSITION_DESTINATION_MISMATCH'
  | 'TRANSITION_PROBABILITY_MISMATCH'
  | 'FIXED_POLICY_NOT_PROPER'
  | 'FIXED_POLICY_COST_MISMATCH'
  | 'FIXED_POLICY_ACTION_MISMATCH'
  | 'FIXED_POLICY_TIME_MISMATCH';

export interface PolicyAdmissibilityFailure {
  code: PolicyAdmissibilityFailureCode;
  message: string;
  stateKey?: string;
  actionId?: string;
  expected?: string | number;
  actual?: string | number;
}

export interface PolicyAdmissibilityResult {
  version: typeof POLICY_ADMISSIBILITY_VERSION;
  admissible: boolean;
  familyId: string;
  sourcePolicyFingerprint?: string;
  sourceAcquisitionKind: PolicyAcquisitionKind;
  sourceAcquisitionCostChaos: number;
  familyAcquisitionCostChaos?: number;
  selectedPolicyDecisionCount: number;
  selectedPhysicalActionIds: string[];
  transitionsRegenerated: number;
  transitionOutcomesCompared: number;
  maximumTransitionProbabilityDifference: number;
  failures: PolicyAdmissibilityFailure[];
  evaluation?: FixedPolicyGraphEvaluation;
  sourceParity?: {
    expectedDownstreamCostChaos: number;
    revalidatedDownstreamCostChaos: number;
    costDifferenceChaos: number;
    expectedPhysicalActions: number;
    revalidatedPhysicalActions: number;
    actionDifference: number;
    expectedManualTimeMs: number;
    revalidatedManualTimeMs: number;
    timeDifferenceMs: number;
  };
}

export interface PolicyDivergenceState {
  stateKey: string;
  state: {
    rarity: ItemState['rarity'];
    affixCount: number;
    matchedTargetCount: number;
    targetCount: number;
  };
  occupancyUnderKnownPolicy: number;
  occupancyUnderIndependentPolicy: number;
  knownSelectedActionId: string;
  independentSelectedActionId?: string;
  knownActionQInKnownGraph?: number;
  independentActionQInKnownGraph?: number;
  knownActionQInIndependentGraph?: number;
  independentActionQInIndependentGraph?: number;
  reason: 'STATE_NOT_DISCOVERED' | 'ACTION_NOT_DISCOVERED' | 'DIFFERENT_Q_SELECTION';
}

export interface PolicySearchDivergenceReport {
  knownRetainedStates: number;
  independentRetainedStates: number;
  retainedStatesOnlyInKnown: number;
  retainedStatesOnlyInIndependent: number;
  commonRetainedStates: number;
  knownOnPolicyStatesMissingFromIndependentGraph: number;
  commonOnPolicyStatesWithDifferentActions: number;
  knownSelectedActionsMissingFromIndependentGraph: number;
  rankedDivergences: PolicyDivergenceState[];
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function aggregateRegeneratedTransitions(
  adapter: SolverCraftActionAdapter,
  state: ItemState,
  target: TargetDefinition,
): { probabilities: Map<string, number>; immediateCostChaos: number } | undefined {
  const distribution = adapter.getTransitions(state);
  if (!distribution) return undefined;
  const aggregated = new Map<string, number>();
  for (const outcome of distribution.outcomes) {
    if (!Number.isFinite(outcome.probability) || outcome.probability <= 0) continue;
    const key = getCanonicalStateKey(normalizeItemState(outcome.state), target);
    aggregated.set(key, (aggregated.get(key) ?? 0) + outcome.probability);
  }
  return {
    probabilities: aggregated,
    immediateCostChaos: distribution.immediateCostChaos,
  };
}

function qForAction(rule: OnPolicyRuleResult | undefined, actionId: string): number | undefined {
  const value = rule?.candidateQValues.find((candidate) => candidate.actionId === actionId)
    ?.totalQValueChaos;
  return value !== undefined && Number.isFinite(value) ? value : undefined;
}

function stateContext(state: ItemState, target: TargetDefinition): PolicyDivergenceState['state'] {
  const affixes = [...state.prefixes, ...state.suffixes];
  const requirements = getAllTargetModRequirements(target);
  return {
    rarity: state.rarity,
    affixCount: affixes.length,
    matchedTargetCount: requirements.filter((requirement) =>
      affixes.some((affix) => matchesModRequirement(affix, requirement))
    ).length,
    targetCount: requirements.length,
  };
}

export function comparePolicySearchDivergence(
  known: GenericSearchResult,
  independent: GenericSearchResult,
  limit = 20,
): PolicySearchDivergenceReport {
  const knownGraphKeys = new Set(known.graphBuild.nodes.keys());
  const independentGraphKeys = new Set(independent.graphBuild.nodes.keys());
  const knownRules = new Map(known.onPolicyRules.map((rule) => [rule.stateKey, rule]));
  const independentRules = new Map(
    independent.onPolicyRules.map((rule) => [rule.stateKey, rule]),
  );
  const ranked: PolicyDivergenceState[] = [];
  let missingStates = 0;
  let missingActions = 0;
  let differentActions = 0;
  for (const [stateKey, knownRule] of knownRules) {
    if (knownRule.state.flags?.acquisitionMenu === true) continue;
    const independentNode = independent.graphBuild.nodes.get(stateKey);
    const independentRule = independentRules.get(stateKey);
    let reason: PolicyDivergenceState['reason'] | undefined;
    if (!independentNode) {
      missingStates++;
      reason = 'STATE_NOT_DISCOVERED';
    } else if (!independentNode.actions.has(knownRule.selectedActionId)) {
      missingActions++;
      reason = 'ACTION_NOT_DISCOVERED';
    } else if (
      independentRule && independentRule.selectedActionId !== knownRule.selectedActionId
    ) {
      differentActions++;
      reason = 'DIFFERENT_Q_SELECTION';
    }
    if (!reason) continue;
    ranked.push({
      stateKey,
      state: stateContext(knownRule.state, known.target),
      occupancyUnderKnownPolicy: knownRule.expectedVisits,
      occupancyUnderIndependentPolicy: independentRule?.expectedVisits ?? 0,
      knownSelectedActionId: knownRule.selectedActionId,
      independentSelectedActionId: independentRule?.selectedActionId,
      knownActionQInKnownGraph: qForAction(knownRule, knownRule.selectedActionId),
      independentActionQInKnownGraph: independentRule
        ? qForAction(knownRule, independentRule.selectedActionId)
        : undefined,
      knownActionQInIndependentGraph: qForAction(
        independentRule,
        knownRule.selectedActionId,
      ),
      independentActionQInIndependentGraph: independentRule
        ? qForAction(independentRule, independentRule.selectedActionId)
        : undefined,
      reason,
    });
  }
  ranked.sort((left, right) =>
    right.occupancyUnderKnownPolicy - left.occupancyUnderKnownPolicy ||
    left.stateKey.localeCompare(right.stateKey)
  );
  let commonRetainedStates = 0;
  for (const key of knownGraphKeys) if (independentGraphKeys.has(key)) commonRetainedStates++;
  return {
    knownRetainedStates: knownGraphKeys.size,
    independentRetainedStates: independentGraphKeys.size,
    retainedStatesOnlyInKnown: knownGraphKeys.size - commonRetainedStates,
    retainedStatesOnlyInIndependent: independentGraphKeys.size - commonRetainedStates,
    commonRetainedStates,
    knownOnPolicyStatesMissingFromIndependentGraph: missingStates,
    commonOnPolicyStatesWithDifferentActions: differentActions,
    knownSelectedActionsMissingFromIndependentGraph: missingActions,
    rankedDivergences: ranked.slice(0, limit),
  };
}

export function auditPolicyAdmissibility(options: {
  family: MethodFamilySpec;
  context: SolverContext;
  target: TargetDefinition;
  sourceResult: GenericSearchResult;
  sourceDownstreamStartState: ItemState;
  sourceAcquisitionKind: PolicyAcquisitionKind;
  sourceAcquisitionIdentity: string;
  expectedAcquisitionIdentity: string;
  sourceAcquisitionCostChaos: number;
  familyAcquisitionCostChaos?: number;
  sourceMechanicsSessionIdentity: string;
  familyMechanicsSessionIdentity: string;
  includeHarvest: boolean;
  harvestTags: string[];
  expectedDownstreamCostChaos: number;
  expectedDownstreamPhysicalActions: number;
  expectedDownstreamManualTimeMs: number;
  sourcePolicyFingerprint?: string;
  effortProfile?: Partial<ActionEffortProfile>;
  deadlineMs?: number;
}): PolicyAdmissibilityResult {
  const failures: PolicyAdmissibilityFailure[] = [];
  const sourceActionIds = [...new Set(options.sourceResult.onPolicyRules
    .filter((rule) => rule.state.flags?.acquisitionMenu !== true)
    .filter((rule) => !rule.selectedActionId.startsWith('acquire_'))
    .map((rule) => rule.selectedActionId))].sort();
  const positiveSourceActionIds = new Set(options.sourceResult.onPolicyRules
    .filter((rule) => rule.expectedVisits > POLICY_ADMISSIBILITY_TOLERANCE)
    .filter((rule) => rule.state.flags?.acquisitionMenu !== true)
    .filter((rule) => !rule.selectedActionId.startsWith('acquire_'))
    .map((rule) => rule.selectedActionId));
  const fail = (failure: PolicyAdmissibilityFailure): void => {
    failures.push(failure);
  };
  if (
    options.family.forcedAcquisitionType &&
    options.family.forcedAcquisitionType !== 'OPEN' &&
    options.family.forcedAcquisitionType !== options.sourceAcquisitionKind
  ) {
    fail({
      code: 'ACQUISITION_KIND_MISMATCH',
      message: `Family requires ${options.family.forcedAcquisitionType}, source policy uses ${options.sourceAcquisitionKind}.`,
      expected: options.family.forcedAcquisitionType,
      actual: options.sourceAcquisitionKind,
    });
  }
  if (options.sourceAcquisitionIdentity !== options.expectedAcquisitionIdentity) {
    fail({
      code: 'ACQUISITION_IDENTITY_MISMATCH',
      message: 'The physical acquisition state does not match the family start state.',
      expected: options.expectedAcquisitionIdentity,
      actual: options.sourceAcquisitionIdentity,
    });
  }
  if (
    options.familyAcquisitionCostChaos !== undefined &&
    Math.abs(
      options.sourceAcquisitionCostChaos - options.familyAcquisitionCostChaos,
    ) > POLICY_ADMISSIBILITY_TOLERANCE
  ) {
    fail({
      code: 'ACQUISITION_COST_MISMATCH',
      message: 'The family-context acquisition cost differs from the source policy.',
      expected: options.familyAcquisitionCostChaos,
      actual: options.sourceAcquisitionCostChaos,
    });
  }
  if (options.sourceMechanicsSessionIdentity !== options.familyMechanicsSessionIdentity) {
    fail({
      code: 'MECHANICS_SESSION_MISMATCH',
      message: 'Source and family mechanics/session identities differ.',
      expected: options.familyMechanicsSessionIdentity,
      actual: options.sourceMechanicsSessionIdentity,
    });
  }
  if (canonicalJson(options.sourceResult.target) !== canonicalJson(options.target)) {
    fail({
      code: 'TARGET_IDENTITY_MISMATCH',
      message: 'Source and family target/terminal semantics differ.',
    });
  }
  const requiredActionIds = options.family.requiredActionIds ?? [];
  for (const requiredActionId of requiredActionIds) {
    if (!positiveSourceActionIds.has(requiredActionId)) {
      fail({
        code: 'REQUIRED_ACTION_NOT_OBSERVED',
        message: `Required family action ${requiredActionId} is absent from the selected policy.`,
        actionId: requiredActionId,
      });
    }
  }
  const allowed = options.family.allowedActionIds
    ? new Set(options.family.allowedActionIds)
    : undefined;
  const forbidden = new Set(options.family.forbiddenActionIds ?? []);
  for (const actionId of sourceActionIds) {
    if (allowed && !allowed.has(actionId)) {
      fail({
        code: 'ACTION_NOT_ALLOWED',
        message: `Selected action ${actionId} is outside the family allow-list.`,
        actionId,
      });
    }
    if (forbidden.has(actionId)) {
      fail({
        code: 'ACTION_FORBIDDEN',
        message: `Selected action ${actionId} is forbidden by the family.`,
        actionId,
      });
    }
  }

  const result: PolicyAdmissibilityResult = {
    version: POLICY_ADMISSIBILITY_VERSION,
    admissible: false,
    familyId: options.family.id,
    sourcePolicyFingerprint: options.sourcePolicyFingerprint,
    sourceAcquisitionKind: options.sourceAcquisitionKind,
    sourceAcquisitionCostChaos: options.sourceAcquisitionCostChaos,
    familyAcquisitionCostChaos: options.familyAcquisitionCostChaos,
    selectedPolicyDecisionCount: options.sourceResult.onPolicyRules.length,
    selectedPhysicalActionIds: sourceActionIds,
    transitionsRegenerated: 0,
    transitionOutcomesCompared: 0,
    maximumTransitionProbabilityDifference: 0,
    failures,
  };
  if (failures.length > 0) return result;

  const mechanics = [
    ...CRAFT_MECHANICS,
    ...(options.includeHarvest
      ? createHarvestReforgeMechanics(options.context, options.harvestTags)
      : []),
  ];
  const mechanicsById = new Map(mechanics.map((mechanic) => [mechanic.id, mechanic]));
  const adapters = new Map<string, SolverCraftActionAdapter>();
  for (const rule of options.sourceResult.onPolicyRules) {
    if (
      rule.state.flags?.acquisitionMenu === true ||
      rule.selectedActionId.startsWith('acquire_')
    ) continue;
    const mechanic = mechanicsById.get(rule.selectedActionId);
    if (!mechanic?.getTransitions) {
      fail({
        code: 'ACTION_NOT_IN_FAMILY_REGISTRY',
        message: `Selected action ${rule.selectedActionId} has no executable family mechanic.`,
        stateKey: rule.stateKey,
        actionId: rule.selectedActionId,
      });
      continue;
    }
    let adapter = adapters.get(rule.selectedActionId);
    if (!adapter) {
      adapter = new SolverCraftActionAdapter(mechanic, options.context, options.target);
      adapters.set(rule.selectedActionId, adapter);
    }
    if (!adapter.applicable(rule.state)) {
      fail({
        code: 'ACTION_ILLEGAL_IN_EXACT_STATE',
        message: `Selected action ${rule.selectedActionId} is illegal in its exact source state.`,
        stateKey: rule.stateKey,
        actionId: rule.selectedActionId,
      });
      continue;
    }
    const sourceAction = options.sourceResult.graphBuild.nodes.get(rule.stateKey)
      ?.actions.get(rule.selectedActionId);
    if (!sourceAction || sourceAction.deferred || !sourceAction.isDirectlyResolved) {
      fail({
        code: 'SOURCE_ACTION_GRAPH_MISSING',
        message: 'Source selected action is absent or unresolved in its retained graph.',
        stateKey: rule.stateKey,
        actionId: rule.selectedActionId,
      });
      continue;
    }
    const regenerated = aggregateRegeneratedTransitions(
      adapter,
      rule.state,
      options.target,
    );
    result.transitionsRegenerated++;
    if (!regenerated) {
      fail({
        code: 'TRANSITION_REGENERATION_MISSING',
        message: 'The family context did not regenerate an analytical transition distribution.',
        stateKey: rule.stateKey,
        actionId: rule.selectedActionId,
      });
      continue;
    }
    const regeneratedCost = regenerated.immediateCostChaos;
    if (Math.abs(sourceAction.immediateCostChaos - regeneratedCost) > POLICY_ADMISSIBILITY_TOLERANCE) {
      fail({
        code: 'TRANSITION_COST_MISMATCH',
        message: 'Family-context action cost differs from the source selected action.',
        stateKey: rule.stateKey,
        actionId: rule.selectedActionId,
        expected: sourceAction.immediateCostChaos,
        actual: regeneratedCost,
      });
    }
    const regeneratedCostVector = computeActionCostVector(
      adapter,
      regeneratedCost,
      options.effortProfile,
    );
    if (
      Math.abs(
        sourceAction.costVector.physicalActionCount -
          regeneratedCostVector.physicalActionCount,
      ) > POLICY_ADMISSIBILITY_TOLERANCE
    ) {
      fail({
        code: 'TRANSITION_PHYSICAL_ACTION_MISMATCH',
        message: 'Family-context physical-action effort differs from the source action.',
        stateKey: rule.stateKey,
        actionId: rule.selectedActionId,
        expected: sourceAction.costVector.physicalActionCount,
        actual: regeneratedCostVector.physicalActionCount,
      });
    }
    if (
      Math.abs(
        sourceAction.costVector.estimatedManualTimeMs -
          regeneratedCostVector.estimatedManualTimeMs,
      ) > POLICY_ADMISSIBILITY_TOLERANCE
    ) {
      fail({
        code: 'TRANSITION_MANUAL_TIME_MISMATCH',
        message: 'Family-context manual-time effort differs from the source action.',
        stateKey: rule.stateKey,
        actionId: rule.selectedActionId,
        expected: sourceAction.costVector.estimatedManualTimeMs,
        actual: regeneratedCostVector.estimatedManualTimeMs,
      });
    }
    const sourceTransitions = new Map(
      sourceAction.transitions.map((transition) => [
        transition.targetKey,
        transition.probability,
      ]),
    );
    result.transitionOutcomesCompared += Math.max(
      sourceTransitions.size,
      regenerated.probabilities.size,
    );
    const allTargets = new Set([
      ...sourceTransitions.keys(),
      ...regenerated.probabilities.keys(),
    ]);
    for (const targetKey of allTargets) {
      const sourceProbability = sourceTransitions.get(targetKey);
      const regeneratedProbability = regenerated.probabilities.get(targetKey);
      if (sourceProbability === undefined || regeneratedProbability === undefined) {
        fail({
          code: 'TRANSITION_DESTINATION_MISMATCH',
          message: 'Family-context regeneration produced a different canonical destination set.',
          stateKey: rule.stateKey,
          actionId: rule.selectedActionId,
          expected: sourceProbability ?? 'missing',
          actual: regeneratedProbability ?? 'missing',
        });
        continue;
      }
      const difference = Math.abs(sourceProbability - regeneratedProbability);
      result.maximumTransitionProbabilityDifference = Math.max(
        result.maximumTransitionProbabilityDifference,
        difference,
      );
      if (difference > POLICY_ADMISSIBILITY_TOLERANCE) {
        fail({
          code: 'TRANSITION_PROBABILITY_MISMATCH',
          message: 'Family-context regeneration changed selected-policy probability mass.',
          stateKey: rule.stateKey,
          actionId: rule.selectedActionId,
          expected: sourceProbability,
          actual: regeneratedProbability,
        });
      }
    }
  }
  if (failures.length > 0) return result;

  const evaluation = evaluateFixedPolicyGraph({
    startState: options.sourceDownstreamStartState,
    target: options.target,
    nodes: options.sourceResult.graphBuild.nodes,
    policyMap: options.sourceResult.policyMap,
    deadlineMs: options.deadlineMs,
  });
  result.evaluation = evaluation;
  if (!evaluation.proper || !evaluation.costReconciled) {
    fail({
      code: 'FIXED_POLICY_NOT_PROPER',
      message: 'Independent fixed-policy evaluation was not proper, absorbing, and reconciled.',
    });
  }
  const sourceParity = {
    expectedDownstreamCostChaos: options.expectedDownstreamCostChaos,
    revalidatedDownstreamCostChaos: evaluation.totalExpectedCostChaos,
    costDifferenceChaos: Math.abs(
      options.expectedDownstreamCostChaos - evaluation.totalExpectedCostChaos,
    ),
    expectedPhysicalActions: options.expectedDownstreamPhysicalActions,
    revalidatedPhysicalActions: evaluation.expectedPhysicalActions,
    actionDifference: Math.abs(
      options.expectedDownstreamPhysicalActions - evaluation.expectedPhysicalActions,
    ),
    expectedManualTimeMs: options.expectedDownstreamManualTimeMs,
    revalidatedManualTimeMs: evaluation.estimatedManualTimeMs,
    timeDifferenceMs: Math.abs(
      options.expectedDownstreamManualTimeMs - evaluation.estimatedManualTimeMs,
    ),
  };
  result.sourceParity = sourceParity;
  if (sourceParity.costDifferenceChaos > 0.05) {
    fail({
      code: 'FIXED_POLICY_COST_MISMATCH',
      message: 'Family-context fixed-policy cost does not match the source policy.',
      expected: sourceParity.expectedDownstreamCostChaos,
      actual: sourceParity.revalidatedDownstreamCostChaos,
    });
  }
  if (sourceParity.actionDifference > 1e-5) {
    fail({
      code: 'FIXED_POLICY_ACTION_MISMATCH',
      message: 'Family-context fixed-policy action count does not match the source policy.',
      expected: sourceParity.expectedPhysicalActions,
      actual: sourceParity.revalidatedPhysicalActions,
    });
  }
  if (sourceParity.timeDifferenceMs > 1e-3) {
    fail({
      code: 'FIXED_POLICY_TIME_MISMATCH',
      message: 'Family-context fixed-policy manual time does not match the source policy.',
      expected: sourceParity.expectedManualTimeMs,
      actual: sourceParity.revalidatedManualTimeMs,
    });
  }
  result.admissible = failures.length === 0;
  return result;
}
