/**
 * Semantic Oracle for Quality Lab.
 * Inspects solver outputs, recommendation honesty, step completeness, and explainability cards.
 */

export interface SemanticCheckResult {
  passed: boolean;
  oracle: 'SEMANTIC';
  gate: string;
  details: string;
}

export class SemanticOracle {
  static verifyResultStructure(resultData: any): SemanticCheckResult[] {
    const checks: SemanticCheckResult[] = [];

    // 1. Recommendation Status
    const validStatuses = ['PROVEN_OPTIMAL', 'BEST_RESOLVED_ACQUISITION_SAFE', 'PROVISIONAL_RESOLVED', 'NO_RESOLVED_ROUTE'];
    const hasValidStatus = validStatuses.includes(resultData?.recommendationStatus);
    checks.push({
      passed: hasValidStatus,
      oracle: 'SEMANTIC',
      gate: 'RECOMMENDATION_STATUS_VALIDITY',
      details: hasValidStatus
        ? `Valid status: ${resultData.recommendationStatus}`
        : `Invalid status received: ${resultData?.recommendationStatus}`,
    });

    // 2. Cost and Bounds Honesty
    const hasValidCost = typeof resultData?.expectedCostChaos === 'number' && Number.isFinite(resultData.expectedCostChaos) && resultData.expectedCostChaos > 0;
    checks.push({
      passed: hasValidCost,
      oracle: 'SEMANTIC',
      gate: 'EXPECTED_COST_VALIDITY',
      details: hasValidCost
        ? `Expected cost valid: ${resultData.expectedCostChaos.toFixed(2)}c`
        : `Missing or invalid expected cost: ${resultData?.expectedCostChaos}`,
    });

    // 3. Craft Plan Step Coherence
    const steps = resultData?.craftPlan?.steps;
    const hasSteps = Array.isArray(steps) && steps.length > 0;
    checks.push({
      passed: hasSteps,
      oracle: 'SEMANTIC',
      gate: 'CRAFT_PLAN_STEP_COHERENCE',
      details: hasSteps
        ? `Craft plan contains ${steps.length} ordered steps`
        : 'Missing craft plan steps',
    });

    // 4. Method Portfolio Presence
    const portfolio = resultData?.methodPortfolio;
    const hasPortfolio = Array.isArray(portfolio) && portfolio.length > 0;
    checks.push({
      passed: hasPortfolio,
      oracle: 'SEMANTIC',
      gate: 'METHOD_PORTFOLIO_PRESENCE',
      details: hasPortfolio
        ? `Method portfolio evaluated ${portfolio.length} crafting disciplines`
        : 'Missing method portfolio',
    });

    // 5. Why Not Selected Explanation Presence
    if (hasPortfolio) {
      const nonWinners = portfolio.filter((m: any) => m.status !== 'SELECTED_WINNER');
      const allHaveExplanation = nonWinners.every((m: any) => typeof m.whyNotSelectedExplanation === 'string' && m.whyNotSelectedExplanation.length > 0);
      checks.push({
        passed: allHaveExplanation,
        oracle: 'SEMANTIC',
        gate: 'EXPLAINABILITY_COMPLETENESS',
        details: allHaveExplanation
          ? `All ${nonWinners.length} non-winning methods have explicit explanations`
          : 'One or more non-winning methods lack why-not-selected explanations',
      });
    }

    return checks;
  }
}
