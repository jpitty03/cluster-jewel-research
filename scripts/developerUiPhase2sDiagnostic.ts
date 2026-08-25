import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
} from '../crafting-engine/src/service/optimizerService.ts';
import { decodeCraftFromUrl, encodeCraftToUrl } from '../crafting-engine/src/service/shareBundle.ts';

const outputPath = fileURLToPath(new URL('../output-phase2s-release-candidate-diagnostic.txt', import.meta.url));
const optimizerUiPath = fileURLToPath(new URL('../src/CraftOptimizer.tsx', import.meta.url));
const repository = new ClusterModRepository();
const service = new OptimizerService(repository);
const lines: string[] = ['PHASE 2S — RETAINED RELEASE-CANDIDATE REGRESSION (BROWSER CERTIFICATION REOPENED BY PHASE 2T)'];

const input: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: '10% increased Attack Damage',
  itemLevel: 84,
  passiveCount: 8,
  target: {
    requiredMods: [{ modId: 'AfflictionJewelSmallPassivesGrantES3' }],
    requiredRarity: 'magic',
  },
  searchBudget: { maxStates: 1_200, maxWallTimeMs: 10_000, maxExpansionRounds: 2 },
  allowResearchFallbackPrices: true,
};

lines.push('\nS1 — Retained optimizer integration');
const result = service.optimize(input);
assert(result.recommended && result.craftPlan.steps.length > 0);
assert(result.risk.selectedPolicyProper && result.solver.costReconciled);
assert.equal(result.presentation.schemaVersion, '2T.1');
lines.push(`PASS: ${result.recommendationStatus}, ${result.expectedCostChaos?.toFixed(6)}c, ${result.craftPlan.steps.length} executable playbook steps.`);

lines.push('\nS2 — Share serialization regression');
const payload = {
  version: '2R.1' as const,
  baseType: input.baseType,
  clusterType: input.clusterType,
  itemLevel: input.itemLevel,
  passiveCount: input.passiveCount,
  targetMods: input.target.requiredMods
    .map((requirement) => requirement.modId)
    .filter((modId): modId is string => modId !== undefined),
  finalRarity: 'magic' as const,
};
assert.deepEqual(decodeCraftFromUrl(encodeCraftToUrl(payload)), payload);
lines.push('PASS: exact target IDs survive the supported share URL round trip.');

lines.push('\nS3 — Release-status truthfulness');
const uiSource = readFileSync(optimizerUiPath, 'utf8');
assert(uiSource.includes("export const APP_RELEASE_VERSION = '2T.1'"));
assert(uiSource.includes('Browser-Verified Release Candidate {APP_RELEASE_VERSION}'));
assert(!/Public Beta certified/i.test(uiSource));
assert(uiSource.includes('Research estimate using stale bundled pricing'));
lines.push('PASS: retained UI is labeled Release Candidate 2T.1 and prominently distinguishes stale-pricing research estimates.');

lines.push('\nS4 — Certification boundary');
lines.push('PASS: no browser claim is made here. Phase 2T Playwright owns rendered UI, Worker, responsive, keyboard, and canvas certification.');
lines.push('\n=== ALL RETAINED PHASE 2S NON-BROWSER REGRESSIONS PASS ===');
lines.push('Unit tests run: NO');

const output = `${lines.join('\n')}\n`;
writeFileSync(outputPath, output, 'utf8');
console.log(output);
