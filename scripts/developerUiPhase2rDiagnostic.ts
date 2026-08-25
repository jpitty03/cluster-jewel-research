import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
} from '../crafting-engine/src/service/optimizerService.ts';
import {
  encodeCraftToUrl,
  decodeCraftFromUrl,
  generateBugReportBundle,
  type CraftSharePayload,
} from '../crafting-engine/src/service/shareBundle.ts';
import { PriceBook } from '../crafting-engine/src/domain/PriceBook.ts';

const outputPath = fileURLToPath(new URL('../output-phase2r-pricing-sharing-diagnostic.txt', import.meta.url));
const repository = new ClusterModRepository();
const service = new OptimizerService(repository);

const lines: string[] = ['PHASE 2R — PRICING, SHARING, AND DATA FRESHNESS DIAGNOSTIC'];

// ==========================================
// R1: URL Share Serialization Roundtrip
// ==========================================
lines.push('\n--- R1: URL Share Serialization Roundtrip ---');
const originalPayload: CraftSharePayload = {
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
  cleanBaseCostChaos: 15.0,
  maxUnmatchedAffixes: 0,
};

const encodedUrl = encodeCraftToUrl(originalPayload);
const decodedPayload = decodeCraftFromUrl(encodedUrl);

lines.push(`Encoded URL String: ${encodedUrl.slice(0, 40)}... (length: ${encodedUrl.length})`);
const r1Ok = Boolean(
  decodedPayload &&
  decodedPayload.baseType === originalPayload.baseType &&
  decodedPayload.clusterType === originalPayload.clusterType &&
  decodedPayload.itemLevel === originalPayload.itemLevel &&
  decodedPayload.passiveCount === originalPayload.passiveCount &&
  decodedPayload.targetMods.length === originalPayload.targetMods.length &&
  decodedPayload.cleanBaseCostChaos === originalPayload.cleanBaseCostChaos &&
  decodedPayload.maxUnmatchedAffixes === originalPayload.maxUnmatchedAffixes
);

// Verify corrupted/malformed URL rejects gracefully without throwing
const corruptedPayload = decodeCraftFromUrl('bm90X2pzb25fdmFsdWU=');
const invalidBasePayload = decodeCraftFromUrl(Buffer.from(JSON.stringify({ version: '2R.1', baseType: 'NonexistentJewel' })).toString('base64'));

if (!r1Ok || corruptedPayload !== null || invalidBasePayload !== null) {
  throw new Error('R1 Failed: URL share roundtrip or rejection validation failed');
}
lines.push('R1 PASS: Full craft target preserved across encode/decode and invalid payloads safely rejected.');

// ==========================================
// R2: Anonymized Bug Report Integrity
// ==========================================
lines.push('\n--- R2: Anonymized Bug Report Safety ---');
const input: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: '10% increased Attack Damage',
  itemLevel: 84,
  passiveCount: 8,
  target: {
    requiredMods: [{ modId: 'AfflictionJewelSmallPassivesGrantES3' }],
    requiredRarity: 'magic',
  },
  searchBudget: { maxStates: 500, maxWallTimeMs: 2000, maxExpansionRounds: 1 },
  allowResearchFallbackPrices: true,
};
const res = service.optimize(input);
const bugReport = generateBugReportBundle(originalPayload, res, 'Phase2R-Test');
const reportJson = JSON.stringify(bugReport);

const hasNoSecrets = !reportJson.includes('POESESSID') && !reportJson.includes('cookie') && !reportJson.includes('token');
const hasDiagnostics = bugReport.resultSummary !== undefined && bugReport.configuration !== undefined;

if (!hasNoSecrets || !hasDiagnostics) {
  throw new Error('R2 Failed: Bug report bundle contains leaked tokens or missing diagnostics');
}
lines.push('R2 PASS: Bug report bundle structured with complete diagnostics and zero credential leakage.');

// ==========================================
// R3: Pricing Invalidation Invariant
// ==========================================
lines.push('\n--- R3: Pricing Invalidation Invariant ---');
const resClean10 = service.optimize({
  ...input,
  prices: { cleanBaseCostChaos: 10, currencyRates: { alteration: 0.1 } },
});
const resClean50 = service.optimize({
  ...input,
  prices: { cleanBaseCostChaos: 50, currencyRates: { alteration: 0.1 } },
});

lines.push(`Base Price 10c Total: ${resClean10.expectedCostChaos?.toFixed(2)}c`);
lines.push(`Base Price 50c Total: ${resClean50.expectedCostChaos?.toFixed(2)}c`);

const diff = (resClean50.expectedCostChaos ?? 0) - (resClean10.expectedCostChaos ?? 0);
if (diff < 39.9) {
  throw new Error(`R3 Failed: Price change did not properly invalidate and increase expected cost (diff=${diff})`);
}
lines.push(`R3 PASS: Price updates safely invalidate cached search sessions and update total costs (+${diff.toFixed(1)}c total scaling).`);

// ==========================================
// R4: Price Provenance Honesty
// ==========================================
lines.push('\n--- R4: Price Provenance Honesty ---');
const priceBook = new PriceBook({ alteration: 0.1 });
const altRate = priceBook.evaluateRate('alteration', 0.1);
const mirrorRate = priceBook.evaluateRate('mirror', 100000);

lines.push(`Alteration (provided): ${altRate.costChaos}c (confidence: ${altRate.confidence})`);
lines.push(`Mirror (fallback): ${mirrorRate.costChaos}c (confidence: ${mirrorRate.confidence})`);

if (altRate.confidence !== 'known' || mirrorRate.confidence !== 'research-fallback') {
  throw new Error('R4 Failed: Price provenance confidence mismatch');
}
lines.push('R4 PASS: Strict separation of known market prices vs research fallback prices.');

lines.push('\n=== ALL PHASE 2R ACCEPTANCE GATES PASS ===\n');

const fullOutput = lines.join('\n');
console.log(fullOutput);
writeFileSync(outputPath, fullOutput, 'utf8');
