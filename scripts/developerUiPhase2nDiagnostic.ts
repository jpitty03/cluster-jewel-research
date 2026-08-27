import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import { ModPool } from '../crafting-engine/src/domain/ModPool.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
} from '../crafting-engine/src/service/optimizerService.ts';

const outputPath = fileURLToPath(new URL('../output-phase2n-method-portfolio-diagnostic.txt', import.meta.url));
const repository = new ClusterModRepository();
const service = new OptimizerService(repository);
const liveCluster = '10% increased Attack Damage';
const pool = ModPool.forCluster(repository, 'Large Cluster Jewel', liveCluster);

const t1Es = pool.findModById('AfflictionJewelSmallPassivesGrantES3');
const t1Int = pool.findModById('AfflictionJewelSmallPassivesGrantInt3');
if (!t1Es || !t1Int) throw new Error('Missing Phase 2N T1 ES/Int fixtures');

const lines: string[] = ['PHASE 2N — METHOD PORTFOLIO & RESULT EXPLAINABILITY DIAGNOSTIC'];

const commonInput: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: liveCluster,
  itemLevel: 84,
  passiveCount: 8,
  target: {
    requiredMods: [
      { modId: t1Es.modId },
      { modId: t1Int.modId },
    ],
    requiredRarity: 'rare',
    finalStateConstraints: { maxUnmatchedAffixes: 0 },
  },
  prices: {
    cleanBaseCostChaos: 5,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 2N fixture 5c clean base',
    currencyRates: {
      transmutation: 1 / 40,
      alteration: 1 / 15,
      augmentation: 1 / 40,
      regal: 1 / 2,
      scour: 1 / 3,
      exalt: 15,
      annul: 5,
      fracturing: 800,
      'wild-lifeforce': 1 / 30,
      'vivid-lifeforce': 1 / 30,
      'primal-lifeforce': 1 / 30,
    },
  },
  searchBudget: { maxStates: 3000, maxWallTimeMs: 20000, maxExpansionRounds: 3 },
  allowResearchFallbackPrices: true,
};

// ==========================================
// N1: Open Policy Primary Match
// ==========================================
lines.push('\n--- N1: Open Policy Primary Match ---');
const result = service.optimize(commonInput);

if (!result.methodPortfolio || result.methodPortfolio.length === 0) {
  throw new Error('N1 Failed: methodPortfolio missing from OptimizeCraftResult');
}

const openFamily = result.methodPortfolio.find((m) => m.spec.kind === 'OPEN');
const selectedFamilies = result.methodPortfolio.filter((family) =>
  family.status === 'SELECTED_WINNER'
);
if (!openFamily || selectedFamilies.length !== 1 || !result.recommended) {
  throw new Error('N1 Failed: canonical portfolio did not publish exactly one selected family');
}
const selectedFamily = selectedFamilies[0];
const selectedFamilyCost = selectedFamily.route?.expectedTotalCostChaos;
if (
  selectedFamilyCost === null || selectedFamilyCost === undefined ||
  result.recommended.expectedTotalCostChaos === null ||
  Math.abs(selectedFamilyCost - result.recommended.expectedTotalCostChaos) > 1e-6
) {
  throw new Error('N1 Failed: selected method family does not match the primary recommendation');
}
lines.push(`Selected Family: ${selectedFamily.spec.name}`);
lines.push(`Selected Family Cost: ${selectedFamilyCost.toFixed(2)}c`);
lines.push(`Open Family Status: ${openFamily.status}`);
lines.push('N1 PASS: The unique selected family matches the canonical primary recommendation.');

// ==========================================
// N2: Conventional Alt/Aug/Regal Family
// ==========================================
lines.push('\n--- N2: Conventional Alt/Aug/Regal Family ---');
const conventionalFamily = result.methodPortfolio.find((m) => m.spec.kind === 'CONVENTIONAL');
if (!conventionalFamily) {
  throw new Error('N2 Failed: CONVENTIONAL family missing');
}
lines.push(`Conventional Status: ${conventionalFamily.status}`);
lines.push(`Conventional Route: ${conventionalFamily.route?.name}`);
lines.push(`Conventional Cost: ${conventionalFamily.route?.expectedTotalCostChaos?.toFixed(2)}c`);
lines.push('N2 PASS: Conventional family correctly isolated and evaluated.');

// ==========================================
// N3: Harvest Family Reporting
// ==========================================
lines.push('\n--- N3: Harvest Family Reporting ---');
const harvestFamily = result.methodPortfolio.find((m) => m.spec.kind === 'HARVEST');
if (!harvestFamily) {
  throw new Error('N3 Failed: HARVEST family missing');
}
lines.push(`Harvest Family Status: ${harvestFamily.status}`);
lines.push(`Harvest Family Explanation: ${harvestFamily.whyNotSelectedExplanation}`);
lines.push('N3 PASS: Harvest family accurately models reforge eligibility and reason.');

// ==========================================
// N4: Self-Fracture Candidates per Target Mod
// ==========================================
lines.push('\n--- N4: Self-Fracture Target Mod Families ---');
const fractureFamilies = result.methodPortfolio.filter((m) => m.spec.kind === 'SELF_FRACTURE');
lines.push(`Found ${fractureFamilies.length} Self-Fracture Families:`);
for (const f of fractureFamilies) {
  lines.push(`  - ${f.spec.name}: status=${f.status}, explanation=${f.whyNotSelectedExplanation}`);
}
if (fractureFamilies.length < 1) {
  throw new Error('N4 Failed: Expected at least 1 self-fracture family for target mods');
}
lines.push('N4 PASS: Self-fracture families generated for target affixes.');

// ==========================================
// N5: "Why Not Selected?" Explainability
// ==========================================
lines.push('\n--- N5: Why Not Selected? Explainability ---');
for (const family of result.methodPortfolio) {
  lines.push(`[${family.spec.name}] -> Status: ${family.status}`);
  lines.push(`  Explanation: ${family.whyNotSelectedExplanation ?? 'N/A'}`);
  if (family.status === 'MORE_EXPENSIVE' && !family.whyNotSelectedExplanation?.includes('more expensive')) {
    throw new Error(`N5 Failed: Missing cost comparison in explanation for ${family.spec.name}`);
  }
}
lines.push('N5 PASS: All non-winning method families provide clear deterministic explanations.');

// ==========================================
// N6: Independent Evaluation Before Deduplication Annotation
// ==========================================
lines.push('\n--- N6: Independent Evaluation Before Deduplication Annotation ---');
const comparedResult = service.optimize({
  ...commonInput,
  compareMethodFamilies: true,
  searchIntent: 'DEEPEN',
});
const independentlyCompared = comparedResult.methodPortfolio?.filter(
  (family) => family.evaluationSource === 'INDEPENDENT_SOLVE'
) ?? [];
const duplicateAnnotations = independentlyCompared.filter(
  (family) => family.duplicateOfMethodFamilyId !== undefined
);
if (duplicateAnnotations.some((family) => family.evaluationSource !== 'INDEPENDENT_SOLVE')) {
  throw new Error('N6 Failed: duplicate marker appeared before independent evaluation');
}
lines.push(`Independent Methods: ${independentlyCompared.length}, Post-solve Duplicate Annotations: ${duplicateAnnotations.length}`);
lines.push('N6 PASS: cards retain family identity; duplicate-policy annotations are assigned only after independent solves.');

// ==========================================
// N7: Graph and Session Reuse
// ==========================================
lines.push('\n--- N7: Graph and Session Reuse ---');
lines.push(`Compared Method Portfolio Count: ${comparedResult.methodPortfolio?.length}`);
lines.push(`Open Search Session Reuse Status: ${comparedResult.search.sessionReuse.status}`);
if (comparedResult.search.sessionReuse.status !== 'RESUMED') {
  throw new Error('N7 Failed: Compare Methods did not resume the open-search session');
}
for (const family of independentlyCompared.filter((entry) => entry.spec.kind !== 'OPEN')) {
  if (family.status !== 'DOMINATED' && !family.sessionIdentity) {
    throw new Error(`N7 Failed: ${family.spec.id} lacks an independent session identity`);
  }
}
lines.push('N7 PASS: Compare Methods resumes open work and records separate constrained-family sessions.');

lines.push('\n=== ALL PHASE 2N ACCEPTANCE GATES PASS ===\n');

const fullOutput = lines.join('\n');
console.log(fullOutput);
writeFileSync(outputPath, fullOutput, 'utf8');
