import type { CraftPlanSummary } from '../service/craftPlan.ts';
import type { ExpectedActionUsage, RouteSummary } from '../service/optimizerService.ts';
import type { RepeatableRerollCertificationEvidence } from '../solver/repeatableRerollCertification.ts';

export type MethodFamilyKind =
  | 'OPEN'
  | 'CONVENTIONAL'
  | 'HARVEST'
  | 'SELF_FRACTURE'
  | 'SELF_FRACTURE_HARVEST'
  | 'CHAOS_REFORGE';

export type MethodFamilyStatus =
  | 'SELECTED_WINNER'
  | 'SAME_AS_SELECTED'
  | 'MORE_EXPENSIVE'
  | 'DOMINATED'
  | 'NOT_ELIGIBLE'
  | 'UNRESOLVED_AT_BUDGET'
  | 'DISABLED'
  | 'NOT_MODELED'
  | 'NOT_SEARCHED';

export type MethodFamilyEvaluationSource =
  | 'INDEPENDENT_SOLVE'
  | 'OPEN_SEARCH_SUMMARY'
  | 'NOT_SEARCHED';

export type MethodFamilyStageStatus =
  | 'NOT_APPLICABLE'
  | 'NOT_SEARCHED'
  | 'SEARCHING'
  | 'UNRESOLVED'
  | 'RESOLVED'
  | 'DOMINATED';

export type MethodFamilyObjectiveEligibility =
  | 'RESOLVED_ELIGIBLE'
  | 'OVER_COST_CEILING'
  | 'OBJECTIVE_DOMINATED'
  | 'UNRESOLVED_COULD_QUALIFY'
  | 'UNRESOLVED_COST_INELIGIBLE_BY_BOUND';

export interface MethodFamilySpec {
  id: string;
  kind: MethodFamilyKind;
  name: string;
  description: string;
  badge: string;
  allowedActionIds?: string[] | null;
  requiredActionIds?: string[] | null;
  forbiddenActionIds?: string[] | null;
  forcedAcquisitionType?: 'CLEAN' | 'SELF_FRACTURE' | 'OPEN';
  targetFractureModId?: string;
  targetFractureModName?: string;
}

export interface MethodFamilyResult {
  spec: MethodFamilySpec;
  status: MethodFamilyStatus;
  evaluationSource: MethodFamilyEvaluationSource;
  objectiveEligibility?: MethodFamilyObjectiveEligibility;
  /** Canonical player-facing route-family label, available even before U resolves. */
  playerRouteName?: string;
  route?: RouteSummary;
  craftPlan?: CraftPlanSummary;
  costDifferenceChaos?: number;
  costDifferencePercent?: number;
  actionsSaved?: number;
  timeSavedMs?: number;
  whyNotSelectedExplanation?: string;
  acquisitionStatus: MethodFamilyStageStatus;
  acquisitionL?: number;
  acquisitionU?: number;
  downstreamStatus: MethodFamilyStageStatus;
  downstreamL?: number;
  downstreamU?: number;
  fullRouteStatus: MethodFamilyStageStatus;
  fullRouteL?: number;
  fullRouteU?: number;
  requiredActionObservedOnPolicy: boolean;
  onPolicyActionIds: string[];
  expectedActionUsage?: ExpectedActionUsage[];
  policyHealth?: {
    selectedPolicyStatus: string;
    proofLevel: string;
    onPolicyReachableStates: number;
    onPolicyTerminalStates: number;
    onPolicyUnresolvedTransitions: number;
    terminalAbsorptionProbability: number;
    proper: boolean;
    fullyResolved: boolean;
    bellmanConverged: boolean;
    occupancyConverged: boolean;
    costReconciled: boolean;
    reconciliationDifferenceChaos?: number;
  };
  repeatableRerollCertification?: RepeatableRerollCertificationEvidence;
  sessionIdentity?: string;
  retainedStates: number;
  transitionDistributionsGenerated: number;
  budget?: {
    maxStates: number;
    maxWallTimeMs: number;
    maxExpansionRounds: number;
    elapsedMs: number;
  };
  duplicateOfMethodFamilyId?: string;
  policyEquivalenceFingerprint?: string;
  equivalentToSelectedPolicy?: boolean;
  policyEquivalenceEvidence?: {
    version: 'CANONICAL_POLICY_EQUIVALENCE_V1';
    physicalAcquisitionIdentity: string;
    normalizedPolicyDecisionCount: number;
    requiredActionEvidence: string[];
    recoveryDecisionCount: number;
    terminalStateCount: number;
    usageTolerance: number;
  };
}
