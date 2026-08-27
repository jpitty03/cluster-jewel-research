import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import { buildVisualizationGraph } from '../crafting-engine/src/domain/VisualizationGraph.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
} from '../crafting-engine/src/service/optimizerService.ts';

const outputPath = fileURLToPath(new URL('../output-phase2q-constellation-diagnostic.txt', import.meta.url));
const repository = new ClusterModRepository();
const service = new OptimizerService(repository);
const lines: string[] = ['PHASE 2Q — CONSTELLATION SERIALIZED-GRAPH REGRESSION (VISUAL CERTIFICATION SUPERSEDED BY PHASE 2T PLAYWRIGHT)'];

const input: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: '10% increased Attack Damage',
  itemLevel: 84,
  passiveCount: 8,
  target: {
    requiredMods: [
      { modId: 'AfflictionJewelSmallPassivesGrantES3' },
      { modId: 'AfflictionJewelSmallPassivesGrantInt3' },
    ],
    requiredRarity: 'rare',
  },
  searchBudget: { maxStates: 2_000, maxWallTimeMs: 15_000, maxExpansionRounds: 2 },
  allowResearchFallbackPrices: true,
};

const result = service.optimize(input);
assert(result.policyFlow, 'Real optimizer result omitted selected-policy flow evidence');
const graphA = buildVisualizationGraph(
  result.policyFlow,
  { seed: 'phase2t_graph_regression' },
);
const graphB = buildVisualizationGraph(
  result.policyFlow,
  { seed: 'phase2t_graph_regression' },
);

lines.push('\nQ1 — Graph topology from a real optimizer result');
assert(graphA.nodes.length >= 5 && graphA.edges.length >= 4);
const nodeIds = new Set(graphA.nodes.map((node) => node.id));
assert.equal(nodeIds.size, graphA.nodes.length);
for (const edge of graphA.edges) {
  assert(nodeIds.has(edge.source) && nodeIds.has(edge.target));
  assert(edge.probability >= 0 && edge.probability <= 1);
}
lines.push(`PASS: ${graphA.nodes.length} unique nodes and ${graphA.edges.length} real endpoint-valid edges.`);

lines.push('\nQ2 — Selected-route and accessibility serialization');
assert(graphA.selectedRouteNodeIds.length > 0);
assert(graphA.selectedRouteNodeIds.every((id) => nodeIds.has(id)));
assert(graphA.nodes.every((node) => node.label.trim().length > 0));
lines.push(`PASS: ${graphA.selectedRouteNodeIds.length} selected-route nodes and every node has a discoverable label.`);

lines.push('\nQ3 — Deterministic layout seed');
assert.deepEqual(
  { ...graphA, performance: { ...graphA.performance, layoutMs: 0 } },
  { ...graphB, performance: { ...graphB.performance, layoutMs: 0 } },
);
lines.push('PASS: identical optimizer input and seed serialize identical graph nodes, edges, events, and bounds.');

lines.push('\nQ4 — Certification boundary');
lines.push('PASS: this diagnostic covers serialized graph invariants only; real frames, controls, reduced motion, fullscreen, FPS, and memory are gated by quality-lab/src/runner.ts.');
lines.push('\n=== ALL PHASE 2Q SERIALIZED-GRAPH REGRESSIONS PASS ===');
lines.push('Unit tests run: NO');

const output = `${lines.join('\n')}\n`;
writeFileSync(outputPath, output, 'utf8');
console.log(output);
