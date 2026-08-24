import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import { synthesizeAcquisition } from '../src/solver/acquisitionSynthesis.ts';

const repo = new ClusterModRepository();
const CLUSTER = '12% increased Attack Damage while holding a Shield';
const pool = ModPool.forCluster(repo, 'Large Cluster Jewel', CLUSTER);
const priceBook = new PriceBook();

console.log('pool mods:', pool.getAllMods().length);
const byGen: Record<string, number> = {};
for (const mod of pool.getAllMods()) byGen[mod.genType] = (byGen[mod.genType] ?? 0) + 1;
console.log('by genType:', byGen);

const clean: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: CLUSTER,
  itemLevel: 84,
  passiveCount: 12,
  rarity: 'normal',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};

const targetModId = process.argv[2] ?? 'AfflictionJewelSmallPassivesGrantInt3';
const maxStates = Number(process.argv[3] ?? 4000);
const maxWallTimeMs = Number(process.argv[4] ?? 30000);

const started = Date.now();
const result = synthesizeAcquisition(
  { pool, priceBook },
  {
    cleanStartingState: clean,
    desiredPhysicalState: { fracturedMod: { modId: targetModId } },
    cleanBaseAcquisition: {
      costChaos: 10,
      confidence: 'research-fallback',
      provenance: 'probe',
    },
    searchBudget: { maxStates, maxWallTimeMs, maxExpansionRounds: Number(process.argv[5] ?? 8) },
    enabledActionIds: (process.env.ACT_IDS ?? '').length > 0 ? process.env.ACT_IDS!.split(',') : undefined,
    searchIntent: (process.env.INTENT as 'RECOMMEND' | 'DEEPEN' | 'PROVE') ?? undefined,
  }
);

console.log('elapsed wall', Date.now() - started, 'ms');
console.log('status', result.status);
console.log('EV', result.expectedCostChaos, 'prep', result.expectedPreparationCostChaos);
console.log('lower bound', result.lowerBoundChaos);
console.log('restarts', result.expectedRestarts, 'fracturing orbs', result.expectedFracturingOrbs);
console.log('search', result.search);
console.log('risk', result.risk);
console.log('proof', result.proof);
console.log('solver', result.solver);
console.log('usage', result.expectedActionUsage.map((u) => `${u.actionId}=${u.expectedCount.toFixed(3)}`).join(' '));
console.log('fracture outcomes', result.fractureOutcomes.slice(0, 3));
console.log('wrong fracture', {
  states: result.wrongFractureRecovery.states,
  visits: result.wrongFractureRecovery.expectedVisits,
  actions: result.wrongFractureRecovery.recoveryActions,
});
console.log('graph terminals', result.search.statesExpanded, 'terminalSignatures', result.terminalPhysicalStateSignatures.slice(0, 5));
console.log('policy head');
for (const rule of result.policy.slice(0, 12)) {
  console.log(`  ${rule.expectedVisits.toFixed(4)} x ${rule.selectedAction} @ ${rule.state}`);
}
