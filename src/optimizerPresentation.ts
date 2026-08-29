import type {
  OptimizeCraftResult,
  OptimizationRequestStopReason,
} from '../crafting-engine/src/service/optimizerService.ts';

export interface ProofPresentation {
  selectedPolicySolve: 'Resolved' | 'Not certified';
  portfolioOptimality: 'Proven' | 'Not proven';
  rawSelectedPolicyStatus: OptimizeCraftResult['proof']['selectedPolicyStatus'];
  rawGlobalOptimality: OptimizeCraftResult['proof']['globalOptimality'];
  rawObjectiveProofStatus?: OptimizeCraftResult['objectiveProofStatus'];
}

export function proofPresentation(result: OptimizeCraftResult): ProofPresentation {
  return {
    selectedPolicySolve: result.proof.selectedPolicyStatus ===
      'FULLY RESOLVED / PROPER / ABSORBING / COST-RECONCILED'
      ? 'Resolved'
      : 'Not certified',
    portfolioOptimality: result.recommendationStatus === 'PROVEN_OPTIMAL'
      ? 'Proven'
      : 'Not proven',
    rawSelectedPolicyStatus: result.proof.selectedPolicyStatus,
    rawGlobalOptimality: result.proof.globalOptimality,
    rawObjectiveProofStatus: result.objectiveProofStatus,
  };
}

export interface SearchEvidencePresentation {
  newStatesExpandedThisRun: number;
  totalPortfolioStatesExpanded: number;
  statesRetainedForContinuation: number;
  requestedExpansionCap: number;
  stoppingConditions: OptimizationRequestStopReason[];
}

export function searchEvidencePresentation(
  result: OptimizeCraftResult,
): SearchEvidencePresentation {
  return {
    newStatesExpandedThisRun: result.search.cumulativeExpansionWork,
    totalPortfolioStatesExpanded: result.search.workScopes.portfolioTotalStatesExpanded,
    statesRetainedForContinuation: result.search.workScopes.portfolioRetainedStates,
    requestedExpansionCap: result.search.requestBudget.requested.maxStates,
    stoppingConditions: [
      result.search.requestBudget.stop.primary,
      ...result.search.requestBudget.stop.secondary,
    ],
  };
}
