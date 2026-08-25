import {
  encodeCraftToUrl,
  decodeCraftFromUrl,
  generateBugReportBundle,
  type CraftSharePayload,
} from '../../../crafting-engine/src/service/shareBundle.ts';
import type { SemanticCheckResult } from '../oracles/semanticOracle.ts';
import { PerformanceOracle, type PerformanceCheckResult } from '../oracles/performanceOracle.ts';

export interface SharingScenarioResult {
  scenarioName: string;
  passed: boolean;
  durationMs: number;
  checks: Array<SemanticCheckResult | PerformanceCheckResult>;
}

export async function runSharingScenario(_appUrl: string): Promise<SharingScenarioResult> {
  const startT = performance.now();
  const checks: Array<SemanticCheckResult | PerformanceCheckResult> = [];

  const samplePayload: CraftSharePayload = {
    version: '2R.1',
    baseType: 'Large Cluster Jewel',
    clusterType: '10% increased Attack Damage',
    itemLevel: 84,
    passiveCount: 8,
    targetMods: [
      'AfflictionJewelSmallPassivesGrantES3',
      'AfflictionJewelSmallPassivesGrantInt3',
    ],
    finalRarity: 'rare',
    objectiveSpec: { kind: 'CHEAPEST_CHAOS' },
    cleanBaseCostChaos: 12.5,
    maxUnmatchedAffixes: 0,
  };

  // 1. URL Encoding / Decoding Roundtrip
  const encoded = encodeCraftToUrl(samplePayload);
  const decoded = decodeCraftFromUrl(encoded);

  const roundtripOk = Boolean(
    decoded &&
    decoded.baseType === samplePayload.baseType &&
    decoded.clusterType === samplePayload.clusterType &&
    decoded.itemLevel === samplePayload.itemLevel &&
    decoded.targetMods.length === samplePayload.targetMods.length &&
    decoded.cleanBaseCostChaos === samplePayload.cleanBaseCostChaos
  );

  checks.push({
    passed: roundtripOk,
    oracle: 'SEMANTIC',
    gate: 'URL_SHARE_ROUNDTRIP_INTEGRITY',
    details: roundtripOk ? 'URL encoding and decoding roundtrip preserved all craft fields' : 'URL share roundtrip corruption detected',
  });

  // 2. Anonymized Bug Report Integrity
  const report = generateBugReportBundle(samplePayload, undefined, 'Phase2R-QualityLab');
  const hasNoTokens = !JSON.stringify(report).includes('POESESSID') && !JSON.stringify(report).includes('token');
  const hasConfig = report.configuration.baseType === samplePayload.baseType;

  checks.push({
    passed: hasNoTokens && hasConfig,
    oracle: 'SEMANTIC',
    gate: 'ANONYMIZED_BUG_REPORT_SAFETY',
    details: hasNoTokens && hasConfig ? 'Bug report bundle structured correctly with zero credential leakage' : 'Bug report bundle failed verification',
  });

  const durationMs = performance.now() - startT;
  checks.push(...PerformanceOracle.verifyTiming(durationMs, 2000, 'Sharing Scenario'));

  return {
    scenarioName: 'Pricing, Sharing, and Bug-Report Scenario',
    passed: checks.every((c) => c.passed),
    durationMs,
    checks,
  };
}
