export type QualityTier = 'DEV' | 'RELEASE' | 'EXTENDED';
export type QualityCostClass = 'FAST' | 'MEDIUM' | 'SOLVER_HEAVY' | 'LONG_SOAK';
export type QualityIsolation = 'SELF_CONTAINED' | 'SHARED_FIXTURE';
export type QualityShard = 'A' | 'B' | 'C' | 'D' | 'E';
export type QualityGateStatus = 'PASS' | 'FAIL' | 'RESUMED' | 'SKIPPED';

export const QUALITY_HARNESS_VERSION = 'PHASE3A_QUALITY_LAB_V1';

export interface QualityGateDefinition {
  id: string;
  version: number;
  phase: string;
  title: string;
  tags: string[];
  fixtureIds: string[];
  costClass: QualityCostClass;
  isolation: QualityIsolation;
  dependencies: string[];
  sourceAreas: string[];
  defaultSuites: QualityTier[];
  shard: QualityShard;
  operation: string;
}

export interface GateExecutionIdentity {
  applicationSourceBuildHash: string;
  gateIdVersion: string;
  fixtureCorpusVersion: string;
  fixtureInputHash: string;
  priceSnapshotIdentity: string;
  browserVersion: string;
  harnessVersion: string;
  compatibilityHash: string;
}

export interface QualityGateResult {
  id: string;
  title: string;
  phase: string;
  shard: QualityShard;
  tags: string[];
  costClass: QualityCostClass;
  status: QualityGateStatus;
  passed: boolean;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  details: unknown;
  error?: string;
  rerunCommand?: string;
  resumedFrom?: string;
  executionIdentity: GateExecutionIdentity;
}

export interface QualitySuiteIdentity {
  applicationSourceBuildHash: string;
  fixtureCorpusVersion: string;
  fixtureCorpusHash: string;
  priceSnapshotIdentity: string;
  browserVersion: string;
  harnessVersion: string;
  compatibilityHash: string;
}

export interface QualityShardReport {
  shard: QualityShard;
  browserVersion: string;
  appStartupMs: number;
  browserStartupMs: number;
  wallMs: number;
  results: QualityGateResult[];
  consoleErrors: string[];
  pageErrors: string[];
  networkErrors: string[];
  artifacts: Record<string, string>;
}

export interface QualityRuntimeSummary {
  totalWallMs: number;
  summedGateMs: number;
  appStartupMs: number;
  browserStartupMs: number;
  solverHeavyMs: number;
  visualInteractionMs: number;
  harnessOverheadMs: number;
  categoryTotalsMs: Record<string, number>;
  slowestGates: Array<{ id: string; durationMs: number; status: QualityGateStatus }>;
}

export interface QualitySuiteReport {
  schemaVersion: 'PHASE3A_QUALITY_REPORT_V1';
  runId: string;
  suite: QualityTier | 'TARGETED';
  requestedGateIds: string[];
  selectedGateIds: string[];
  startedAt: string;
  finishedAt: string;
  status: 'PASSED' | 'FAILED';
  identity: QualitySuiteIdentity;
  scheduling: {
    processLevelShards: QualityShard[];
    browserLightParallelism: number;
    solverHeavyConcurrency: 1;
    longSoakAutomatic: false;
    shardPlan: Array<{
      shard: QualityShard;
      gateIds: string[];
      mode: 'PARALLEL_BROWSER_LIGHT' | 'SERIAL_SOLVER_HEAVY' | 'SERIAL_LONG_SOAK';
    }>;
  };
  counts: {
    passed: number;
    failed: number;
    resumed: number;
    skipped: number;
    total: number;
  };
  results: QualityGateResult[];
  runtime: QualityRuntimeSummary;
  runtimeErrors: {
    console: string[];
    page: string[];
    network: string[];
  };
  artifacts: Record<string, string>;
  resumedFrom?: string;
}

export interface FixtureRecord {
  id: string;
  name: string;
  baseType: string;
  clusterType: string;
  itemLevel: number;
  passiveCount: number;
  finalRarity: 'magic' | 'rare' | 'any';
  extraAffixes: 'allow-extra' | 'no-unwanted';
  targetMods: string[];
  acceptableAnyOf?: string[][];
  priceContext?: Record<string, unknown>;
  marketContext?: Record<string, unknown>;
  expectedSaleValueChaos?: number;
  searchBudget: {
    maxStates: number;
    maxWallTimeMs: number;
    maxExpansionRounds: number;
  };
}

export interface FixtureCorpusRecord {
  version: string;
  fixtures: FixtureRecord[];
}

export type LegacyGateDisposition = 'RETAINED_LEGACY' | 'REPLACED_BY_PHASE3A' | 'MOVED_TO_EXTENDED';

export interface LegacyGateCoverage {
  legacyId: string;
  tags: string[];
  tier: QualityTier;
  isolation: QualityIsolation;
  disposition: LegacyGateDisposition;
  replacementGateIds: string[];
  rationale: string;
}
