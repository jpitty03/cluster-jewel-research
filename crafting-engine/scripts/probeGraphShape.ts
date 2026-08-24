import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';
import type { ItemState } from '../src/domain/ItemState.ts';
import { getAllAffixes } from '../src/domain/ItemState.ts';
import { satisfiesTarget } from '../src/domain/TargetDefinition.ts';
import { GenericSearchEngine } from '../src/solver/genericSearch.ts';
import { buildAcquisitionTargetDefinition } from '../src/solver/acquisitionSynthesis.ts';

const repo = new ClusterModRepository();
const CLUSTER = '12% increased Attack Damage while holding a Shield';
const pool = ModPool.forCluster(repo, 'Large Cluster Jewel', CLUSTER);
const priceBook = new PriceBook();

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

const modId = process.argv[2] ?? 'AfflictionJewelSmallPassivesGrantInt3';
const maxStates = Number(process.argv[3] ?? 4000);
const intent = (process.env.INTENT as 'RECOMMEND' | 'DEEPEN' | 'PROVE') ?? 'RECOMMEND';
const actIds = (process.env.ACT_IDS ?? '').length > 0 ? process.env.ACT_IDS!.split(',') : undefined;
const target = buildAcquisitionTargetDefinition({ fracturedMod: { modId } });

const engine = new GenericSearchEngine({ pool, priceBook, target }, target, {
  enabledActionIds: actIds ?? [
    'transmutation_orb', 'alteration_orb', 'augmentation_orb', 'regal_orb',
    'exalted_orb', 'annulment_orb', 'scouring_orb', 'fracturing_orb', 'restart_reacquire',
  ],
  prioritizeTargetProgress: true,
  searchIntent: intent,
  restartReacquire: {
    destination: clean,
    acquisitionCostChaos: 10,
    confidence: 'research-fallback',
    provenance: 'probe',
  },
});

const started = Date.now();
const graph = engine.buildGraph(clean, maxStates, undefined, Date.now() + 120000, undefined, intent);
console.log('build ms', Date.now() - started, 'intent', intent);
console.log('nodes', graph.nodes.size, 'terminals', graph.terminalStatesFound);
console.log('byRarity', graph.stateCountsByRarity);
console.log('byAffixes', graph.stateCountsByAffixes);
console.log('hitStateLimit', graph.hitStateLimit, 'queuedUnexpanded', graph.queuedButUnexpandedStates);
for (const [id, attr] of Object.entries(graph.actionAttribution)) {
  console.log(' action', id, 'localSucc', attr.actionLocalUniqueSuccessorKeysProduced, 'newGlobal', attr.newGlobalStatesFirstDiscovered);
}

const describe = (state: ItemState): string =>
  `${state.rarity}[${getAllAffixes(state).map((m) => `${m.isFractured ? '*' : ''}${m.modId}`).join('+')}]`;

for (const node of graph.nodes.values()) {
  const edge = node.actions.get('fracturing_orb');
  if (!edge) continue;
  console.log('FRACTURE SOURCE', describe(node.state));
  for (const transition of edge.transitions) {
    const child = graph.nodes.get(transition.targetKey);
    console.log(
      `   p=${transition.probability.toFixed(4)} -> ${describe(transition.nextState)}` +
      ` expanded=${child ? 'YES' : 'no'} satisfies=${satisfiesTarget(transition.nextState, target)}`
    );
    if (!child) continue;
    const scour = child.actions.get('scouring_orb');
    if (!scour) {
      console.log('        (scour not generated)');
      continue;
    }
    for (const scourOut of scour.transitions) {
      console.log(
        `        scour -> ${describe(scourOut.nextState)} expanded=${graph.nodes.has(scourOut.targetKey) ? 'YES' : 'no'}` +
        ` satisfies=${satisfiesTarget(scourOut.nextState, target)}`
      );
    }
  }
  break;
}

// --- replicate expansionPriority to explain ordering ---
import { getAllTargetModRequirements, matchesModRequirement } from '../src/domain/TargetDefinition.ts';
import { deriveMinimumFeasibleRarity } from '../src/solver/targetFeasibility.ts';
const mfr = deriveMinimumFeasibleRarity(target, pool);
console.log('minimumFeasibleRarity', mfr.rarity, '|', mfr.reason);
function priority(state: ItemState): number {
  const affixes = [...state.prefixes, ...state.suffixes];
  const requirements = getAllTargetModRequirements(target);
  let score: number;
  if (intent === 'RECOMMEND' && mfr.rarity === 'magic') {
    score = state.rarity === 'magic' ? 20 : state.rarity === 'normal' ? 10 : 0;
  } else if (intent === 'RECOMMEND' && mfr.rarity === 'normal') {
    score = state.rarity === 'normal' ? 20 : 0;
  } else {
    score = state.rarity === 'rare' ? 20 : state.rarity === 'magic' ? 10 : 0;
  }
  score += affixes.length;
  for (const requirement of requirements) {
    if (affixes.some((mod) => matchesModRequirement(mod, requirement))) {
      score += requirement.mustBeFractured ? 1000 : 100;
      continue;
    }
    if (requirement.mustBeFractured) {
      const unfractured = { ...requirement, mustBeFractured: undefined };
      if (affixes.some((mod) => matchesModRequirement(mod, unfractured))) {
        score += 300 + affixes.length * 20;
      }
    }
  }
  return score;
}
const buckets = new Map<number, number>();
for (const node of graph.nodes.values()) {
  const p = priority(node.state);
  buckets.set(p, (buckets.get(p) ?? 0) + 1);
}
console.log('expanded priority histogram (top 12):');
for (const [p, n] of [...buckets.entries()].sort((a, b) => b[0] - a[0]).slice(0, 12)) {
  console.log(`   priority ${p}: ${n} expanded`);
}
