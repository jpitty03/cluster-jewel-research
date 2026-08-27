import type { BaseType } from '../domain/ItemState.ts';
import type {
  OptimizationObjectiveSpec,
  OptimizeCraftPriceContext,
  OptimizeCraftResult,
  OptimizerMarketContext,
} from '../service/optimizerService.ts';

const VALID_BASE_TYPES = new Set<string>([
  'Small Cluster Jewel',
  'Medium Cluster Jewel',
  'Large Cluster Jewel',
]);

export interface CraftSharePayload {
  version: '2R.1' | '2W.1' | '2X.1' | '2Y.1';
  baseType: BaseType;
  clusterType: string;
  itemLevel: number;
  passiveCount?: number;
  targetMods: string[];
  /** Presentation-only evidence; never used to reconstruct or rank a policy. */
  selectedRouteName?: string;
  finalRarity?: 'magic' | 'rare' | 'any';
  objectiveSpec?: OptimizationObjectiveSpec;
  cleanBaseCostChaos?: number;
  customPrices?: Record<string, number>;
  maxUnmatchedAffixes?: number;
  costConstraintType?: 'PREMIUM_PERCENT' | 'PREMIUM_CHAOS' | 'ABSOLUTE';
  costConstraintValue?: string;
  valueOfTimeChaosPerMin?: string;
  expectedSaleValueChaos?: number;
  prices?: OptimizeCraftPriceContext;
  marketContext?: OptimizerMarketContext;
  sourceContext?: {
    source: 'CLUSTER_JEWELS';
    league: string;
    passiveRange?: { min: number; max: number };
    itemLevelDefaulted: boolean;
    sourceComboLabel?: string;
    sourceMarketValue?: {
      chaos: number;
      kind: 'LOW' | 'MEDIAN';
      quotedAt: string;
      passiveRange: { min: number; max: number };
      provenance: string;
    };
  };
}

export interface BugReportBundle {
  reportVersion: '2R.1';
  createdAt: string;
  appVersion: string;
  userAgent: string;
  configuration: CraftSharePayload;
  resultSummary?: {
    expectedCostChaos?: number;
    recommendationStatus?: string;
    recommendedRouteName?: string;
    presentation?: OptimizeCraftResult['presentation'];
    policyFlow?: OptimizeCraftResult['policyFlow'];
    fullRouteUsage?: OptimizeCraftResult['fullRouteUsage'];
    harvestComparison?: OptimizeCraftResult['harvestComparison'];
    methodFamilies?: Array<{
      id: string;
      status: string;
      evaluationSource: string;
      acquisitionStatus: string;
      downstreamStatus: string;
      fullRouteStatus: string;
      requiredActionObservedOnPolicy: boolean;
      onPolicyActionIds: string[];
      policyHealth?: NonNullable<OptimizeCraftResult['methodPortfolio']>[number]['policyHealth'];
    }>;
    shoppingListCurrencies?: Record<string, number | null>;
    warningCount?: number;
    warnings?: string[];
  };
  diagnostics?: {
    elapsedWallTimeMs?: number;
    expandedStates?: number;
  };
}

/**
 * Universal UTF-8 safe base64 encoder.
 */
export function encodeCraftToUrl(payload: CraftSharePayload): string {
  const json = JSON.stringify(payload);
  const encodedStr = encodeURIComponent(json);
  if (typeof btoa !== 'undefined') {
    return btoa(encodedStr);
  }
  return typeof globalThis !== 'undefined' && 'Buffer' in globalThis
    ? (globalThis as unknown as { Buffer: { from: (s: string) => { toString: (enc: string) => string } } }).Buffer.from(encodedStr).toString('base64')
    : btoa(encodedStr);
}

/**
 * Universal UTF-8 safe base64 decoder with strict schema validation.
 */
export function decodeCraftFromUrl(encoded: string): CraftSharePayload | null {
  try {
    const raw = typeof atob !== 'undefined'
      ? atob(encoded)
      : typeof globalThis !== 'undefined' && 'Buffer' in globalThis
        ? (globalThis as unknown as { Buffer: { from: (s: string, enc: string) => { toString: (enc: string) => string } } }).Buffer.from(encoded, 'base64').toString('utf8')
        : atob(encoded);
    const json = decodeURIComponent(raw);
    const parsed = JSON.parse(json) as Partial<CraftSharePayload>;

    // Strict schema & enum validation
    if (parsed.version !== '2R.1' && parsed.version !== '2W.1' && parsed.version !== '2X.1' && parsed.version !== '2Y.1') return null;
    if (!parsed.baseType || !VALID_BASE_TYPES.has(parsed.baseType)) return null;
    if (typeof parsed.clusterType !== 'string' || parsed.clusterType.trim().length === 0) return null;
    if (typeof parsed.itemLevel !== 'number' || parsed.itemLevel < 1 || parsed.itemLevel > 100 || !Number.isFinite(parsed.itemLevel)) return null;
    if (!Array.isArray(parsed.targetMods) || !parsed.targetMods.every((m) => typeof m === 'string')) return null;
    if (parsed.selectedRouteName !== undefined &&
      (typeof parsed.selectedRouteName !== 'string' || parsed.selectedRouteName.trim().length === 0)) {
      return null;
    }

    if (parsed.passiveCount !== undefined && (!Number.isFinite(parsed.passiveCount) || parsed.passiveCount < 1)) {
      return null;
    }
    if (parsed.finalRarity !== undefined && !['magic', 'rare', 'any'].includes(parsed.finalRarity)) {
      return null;
    }
    if (parsed.expectedSaleValueChaos !== undefined &&
      (!Number.isFinite(parsed.expectedSaleValueChaos) || parsed.expectedSaleValueChaos < 0)) {
      return null;
    }

    return parsed as CraftSharePayload;
  } catch {
    return null;
  }
}

/**
 * Generates an anonymized bug report bundle with zero secrets or private tokens.
 */
export function generateBugReportBundle(
  input: CraftSharePayload,
  result?: OptimizeCraftResult,
  appVersion = 'Phase2R'
): BugReportBundle {
  return {
    reportVersion: '2R.1',
    createdAt: new Date().toISOString(),
    appVersion,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Node-Diagnostic-Environment',
    configuration: input,
    resultSummary: result ? {
      expectedCostChaos: result.expectedCostChaos ?? undefined,
      recommendationStatus: result.recommendationStatus,
      recommendedRouteName: result.recommended?.name,
      presentation: result.presentation,
      policyFlow: result.policyFlow,
      fullRouteUsage: result.fullRouteUsage,
      harvestComparison: result.harvestComparison,
      methodFamilies: result.methodPortfolio?.map((family) => ({
        id: family.spec.id,
        status: family.status,
        evaluationSource: family.evaluationSource,
        acquisitionStatus: family.acquisitionStatus,
        downstreamStatus: family.downstreamStatus,
        fullRouteStatus: family.fullRouteStatus,
        requiredActionObservedOnPolicy: family.requiredActionObservedOnPolicy,
        onPolicyActionIds: family.onPolicyActionIds,
        policyHealth: family.policyHealth,
      })),
      shoppingListCurrencies: result.expectedCurrencies,
      warningCount: result.warnings?.length ?? 0,
      warnings: result.warnings,
    } : undefined,
    diagnostics: result ? {
      elapsedWallTimeMs: result.search?.elapsedMs,
      expandedStates: result.search?.statesExpanded,
    } : undefined,
  };
}
