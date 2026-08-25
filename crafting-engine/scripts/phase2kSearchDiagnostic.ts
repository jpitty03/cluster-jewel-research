import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { OptimizerService, type OptimizerProgressSnapshot } from '../src/service/optimizerService.ts';
import type { OptimizeCraftInput } from '../src/service/optimizerService.ts';
import { createPhase2k1ExactFixture } from './phase2k1ExactFixture.ts';

async function main() {
  console.log('=== PHASE 2K FRACTURE PORTFOLIO & TELEMETRY SEARCH DIAGNOSTIC ===\n');

  const repo = new ClusterModRepository();
  const service = new OptimizerService(repo);

  // 1. Real Four-Mod Fixture (Self-Fracture vs Clean Incumbent)
  console.log('--- TEST 1: Real Four-Mod Fixture (Competitive Self-Fracture vs Clean Base) ---');
  const fourModInput: OptimizeCraftInput = createPhase2k1ExactFixture({
    searchBudget: {
      maxStates: 5000,
      maxWallTimeMs: 25000,
      maxExpansionRounds: 3,
    },
    searchIntent: 'RECOMMEND',
  });

  const progressEvents: OptimizerProgressSnapshot[] = [];
  const start1 = Date.now();
  const result1 = service.optimize(fourModInput, (snapshot) => {
    progressEvents.push({ ...snapshot, candidates: snapshot.candidates.map((c) => ({ ...c })) });
  });
  const elapsed1 = Date.now() - start1;

  console.log(`Initial Search Elapsed: ${(elapsed1 / 1000).toFixed(2)}s`);
  console.log(`Recommendation Status: ${result1.recommendationStatus}`);
  console.log(`Recommended Start: ${result1.recommended?.name ?? 'None'}`);
  console.log(`Recommended Cost: ${result1.expectedCostChaos?.toFixed(2) ?? 'null'}c`);
  console.log(`Telemetry Events Emitted: ${progressEvents.length}`);

  const cleanCandidate = result1.acquisition.candidates.find((c) => c.label === 'Clean Base');
  const fractureCandidates = result1.acquisition.candidates.filter((c) => c.label !== 'Clean Base');

  console.log(`\nAcquisition Candidates Evaluated: ${result1.acquisition.candidates.length}`);
  console.log(`Clean Base Method: ${cleanCandidate?.methods.map((m) => `${m.id}: ${m.costChaos.toFixed(2)}c`).join(', ')}`);
  for (const fc of fractureCandidates) {
    const method = fc.methods[0];
    console.log(`Fracture Candidate [${fc.label}]:`);
    console.log(`  Lower Bound: ${fc.synthesis?.lowerBoundChaos.toFixed(2)}c`);
    console.log(`  Status: ${fc.synthesis?.status ?? 'N/A'}`);
    if (method) {
      console.log(`  Executable Acq Cost: ${method.costChaos.toFixed(2)}c`);
    }
  }

  console.log('\nTop Ranked Acquisition Routes:');
  for (const alt of [result1.recommended, ...result1.alternatives].filter(Boolean)) {
    console.log(`  - ${alt?.name}: U=${alt?.expectedTotalCostChaos?.toFixed(2) ?? 'null'}c, L=${alt?.lowerBoundChaos.toFixed(2)}c [${alt?.status}]`);
  }

  // 2. Retry Deeper (Continuation Session Retention Test)
  console.log('\n--- TEST 2: Retry Deeper Session Graph Retention ---');
  const deeperInput: OptimizeCraftInput = {
    ...fourModInput,
    searchBudget: {
      maxStates: 10000,
      maxWallTimeMs: 25000,
      maxExpansionRounds: 4,
    },
    searchIntent: 'DEEPEN',
  };

  const start2 = Date.now();
  const result2 = service.optimize(deeperInput);
  const elapsed2 = Date.now() - start2;

  console.log(`Retry Deeper Elapsed: ${(elapsed2 / 1000).toFixed(2)}s`);
  console.log(`Session Reuse Status: ${result2.search.sessionReuse.status}`);
  console.log(`Retained States Reused: ${result2.search.sessionReuse.retainedStates}`);
  console.log(`Recommended Cost: ${result2.expectedCostChaos?.toFixed(2)}c`);

  // 3. Simple Clean-Dominance Control Fixture
  console.log('\n--- TEST 3: Simple Clean-Dominance Control Fixture ---');
  const simpleInput: OptimizeCraftInput = {
    baseType: 'Medium Cluster Jewel',
    clusterType: '10% increased Damage while affected by a Herald',
    itemLevel: 84,
    passiveCount: 4,
    target: {
      requiredMods: [
        { modId: 'Endbringer' },
      ],
      finalStateConstraints: { maxUnmatchedAffixes: 0 },
    },
    searchBudget: {
      maxStates: 3000,
      maxWallTimeMs: 10000,
      maxExpansionRounds: 2,
    },
    searchIntent: 'RECOMMEND',
  };

  const start3 = Date.now();
  const result3 = service.optimize(simpleInput);
  const elapsed3 = Date.now() - start3;

  console.log(`Clean Dominance Search Elapsed: ${(elapsed3 / 1000).toFixed(2)}s`);
  console.log(`Acquisition Stage Mode: ${result3.acquisition.stage.mode}`);
  console.log(`Recommended Start: ${result3.recommended?.name}`);
  console.log(`Recommended Cost: ${result3.expectedCostChaos?.toFixed(2)}c`);
  console.log(`Selected Policy Proper: ${result3.risk.selectedPolicyProper}`);
  console.log(`Absorption Probability: ${result3.risk.terminalAbsorptionProbability}`);

  console.log('\n=== DIAGNOSTIC COMPLETE ===');
}

void main();
