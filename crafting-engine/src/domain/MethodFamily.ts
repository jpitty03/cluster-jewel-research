import type { CraftPlanSummary } from '../service/craftPlan.ts';
import type { ExpectedActionUsage, RouteSummary } from '../service/optimizerService.ts';
import type { RepeatableRerollCertificationEvidence } from '../solver/repeatableRerollCertification.ts';
import type {
  PolicyAdmissibilityResult,
  PolicySearchDivergenceReport,
} from '../service/policyAdmissibility.ts';

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

export type MethodFamilyIncumbentSource =
  | 'INDEPENDENT_DISCOVERY'
  | 'ADMISSIBLE_KNOWN_POLICY'
  | 'IMPROVED_FROM_KNOWN_POLICY';

export type MethodFamilySearchStatus =
  | 'OPTIMAL_PROVEN'
  | 'BEST_FOUND_UNPROVEN'
  | 'UNRESOLVED';

export type MethodFamilyStageStatus =
  | 'NOT_APPLICABLE'
  | 'NOT_SEARCHED'
  | 'SEARCHING'
  | 'UNRESOLVED'
  | 'RESOLVED'
  | 'DOMINATED';

export type PolicyActionEvidenceScope = 'ACQUISITION' | 'DOWNSTREAM' | 'FULL_ROUTE';

export interface RequiredActionEvidenceSpec {
  actionId: string;
  scope: PolicyActionEvidenceScope;
}

export type FullRouteActionEvidenceSource =
  | 'CLEAN_ACQUISITION'
  | 'ACQUISITION_SYNTHESIS_POLICY'
  | 'DOWNSTREAM_SELECTED_POLICY';

export interface FullRouteActionEvidenceEntry {
  actionId: string;
  actionName: string;
  scope: Exclude<PolicyActionEvidenceScope, 'FULL_ROUTE'>;
  expectedCount: number;
  expectedCostChaos: number;
  evidenceSource: FullRouteActionEvidenceSource;
  physicalAcquisitionIdentity: string;
  policySessionIdentity: string;
  sourcePolicyFingerprint: string;
}

export interface FullRouteActionEvidence {
  version: 'FULL_ROUTE_ACTION_EVIDENCE_V1';
  physicalAcquisitionIdentity: string;
  policySessionIdentity: string;
  sourcePolicyFingerprint: string;
  entries: FullRouteActionEvidenceEntry[];
}

export interface RequiredActionEvidenceCheck {
  actionId: string;
  requiredScope: PolicyActionEvidenceScope;
  observed: boolean;
  observedExpectedCount: number;
  observedScopes: Array<Exclude<PolicyActionEvidenceScope, 'FULL_ROUTE'>>;
  evidenceSources: FullRouteActionEvidenceSource[];
}

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
  /** @deprecated Use requiredActionEvidence for stage-aware route evidence. */
  requiredActionIds?: string[] | null;
  requiredActionEvidence?: RequiredActionEvidenceSpec[] | null;
  forbiddenActionIds?: string[] | null;
  forcedAcquisitionType?: 'CLEAN' | 'SELF_FRACTURE' | 'OPEN';
  targetFractureModId?: string;
  targetFractureModName?: string;
}

export interface MethodFamilyResult {
  spec: MethodFamilySpec;
  status: MethodFamilyStatus;
  evaluationSource: MethodFamilyEvaluationSource;
  /** How the executable family upper bound was established; never implies family optimality. */
  incumbentSource?: MethodFamilyIncumbentSource;
  /** Explicitly separates executable-policy certification from family optimum proof. */
  familySearchStatus?: MethodFamilySearchStatus;
  independentFullRouteU?: number;
  knownPolicyCostChaos?: number;
  revalidatedKnownPolicyCostChaos?: number;
  selectedOpenPolicyCostChaos?: number;
  /** Audit of the canonical selected Open policy, even when a different known policy seeds U. */
  selectedOpenPolicyAdmissibility?: PolicyAdmissibilityResult;
  knownPolicyAdmissibility?: PolicyAdmissibilityResult;
  searchDivergence?: PolicySearchDivergenceReport;
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
  fullRouteActionEvidence?: FullRouteActionEvidence;
  requiredActionEvidenceChecks?: RequiredActionEvidenceCheck[];
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
