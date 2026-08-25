import type { BaseType } from '../domain/ItemState.ts';
import type { OptimizationObjectiveSpec, OptimizeCraftResult } from '../service/optimizerService.ts';

const VALID_BASE_TYPES = new Set<string>([
  'Small Cluster Jewel',
  'Medium Cluster Jewel',
  'Large Cluster Jewel',
]);

export interface CraftSharePayload {
  version: '2R.1';
  baseType: BaseType;
  clusterType: string;
  itemLevel: number;
  passiveCount?: number;
  targetMods: string[];
  finalRarity?: 'magic' | 'rare' | 'any';
  objectiveSpec?: OptimizationObjectiveSpec;
  cleanBaseCostChaos?: number;
  customPrices?: Record<string, number>;
  maxUnmatchedAffixes?: number;
  costConstraintType?: 'PREMIUM_PERCENT' | 'PREMIUM_CHAOS' | 'ABSOLUTE';
  costConstraintValue?: string;
  valueOfTimeChaosPerMin?: string;
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
    if (parsed.version !== '2R.1') return null;
    if (!parsed.baseType || !VALID_BASE_TYPES.has(parsed.baseType)) return null;
    if (typeof parsed.clusterType !== 'string' || parsed.clusterType.trim().length === 0) return null;
    if (typeof parsed.itemLevel !== 'number' || parsed.itemLevel < 1 || parsed.itemLevel > 100 || !Number.isFinite(parsed.itemLevel)) return null;
    if (!Array.isArray(parsed.targetMods) || !parsed.targetMods.every((m) => typeof m === 'string')) return null;

    if (parsed.passiveCount !== undefined && (!Number.isFinite(parsed.passiveCount) || parsed.passiveCount < 1)) {
      return null;
    }
    if (parsed.finalRarity !== undefined && !['magic', 'rare', 'any'].includes(parsed.finalRarity)) {
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
      warningCount: result.warnings?.length ?? 0,
      warnings: result.warnings,
    } : undefined,
    diagnostics: result ? {
      elapsedWallTimeMs: result.search?.elapsedMs,
      expandedStates: result.search?.statesExpanded,
    } : undefined,
  };
}
