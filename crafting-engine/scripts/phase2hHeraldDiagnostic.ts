import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../src/data/loadClusterMods.ts';
import { ModPool } from '../src/domain/ModPool.ts';
import { PriceBook } from '../src/domain/PriceBook.ts';
import { getPhysicalStateSignature, type ItemState } from '../src/domain/ItemState.ts';
import { getCanonicalStateKey } from '../src/rules/actionDiscovery.ts';
import { getTaggedModsForCluster } from '../src/rules/clusterPoolHelpers.ts';
import { HARVEST_CRAFT_DEFINITIONS } from '../src/rules/harvestCrafts.ts';
import { GenericSearchEngine, type CanonicalGraphNode } from '../src/solver/genericSearch.ts';
import {
  OptimizerService,
  type OptimizeCraftInput,
  type OptimizeCraftResult,
  type PolicyExplanationRule,
} from '../src/service/optimizerService.ts';
import { formatModifierPrimaryLabel } from '../src/service/craftingCatalog.ts';

const outputPath = fileURLToPath(
  new URL('../../output-phase2h-herald-diagnostic.txt', import.meta.url)
);
const clusterType = '10% increased Damage while affected by a Herald';
const repo = new ClusterModRepository();
const pool = ModPool.forCluster(repo, 'Medium Cluster Jewel', clusterType);

function resolveNotableId(statText: string): string {
  const matches = pool.getAllMods().filter(
    (mod) => mod.isNotable && mod.statText === statText
  );
  if (matches.length !== 1) {
    throw new Error(`Expected one committed-catalog notable for ${statText}; found ${matches.length}`);
  }
  return matches[0].modId;
}

const empoweredEnvoyId = resolveNotableId('Empowered Envoy');
const endbringerId = resolveNotableId('Endbringer');
const baseInput: Omit<OptimizeCraftInput, 'searchBudget' | 'searchIntent'> = {
  baseType: 'Medium Cluster Jewel',
  clusterType,
  itemLevel: 84,
  passiveCount: 6,
  target: {
    requiredMods: [{ modId: empoweredEnvoyId }, { modId: endbringerId }],
  },
  prices: {
    cleanBaseCostChaos: 10,
    cleanBasePriceSource: 'manual',
    cleanBasePriceProvenance: 'Phase 2H controlled Herald fixture',
  },
  allowResearchFallbackPrices: true,
};
const cleanState: ItemState = {
  baseType: 'Medium Cluster Jewel',
  clusterType,
  itemLevel: 84,
  passiveCount: 6,
  rarity: 'normal',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};
const groupSignaturesByName = new Map<string, Set<string>>();
for (const mod of pool.getAllMods()) {
  const groups = (mod.modGroups.length > 0 ? mod.modGroups : [mod.modGroup])
    .slice()
    .sort()
    .join('+');
  const signatures = groupSignaturesByName.get(mod.name) ?? new Set<string>();
  signatures.add(groups);
  groupSignaturesByName.set(mod.name, signatures);
}
const eligibilitySensitiveNames = [...groupSignaturesByName]
  .filter(([, groups]) => groups.size > 1)
  .map(([name]) => name)
  .sort();
const missingEligibilitySensitivity = pool.getAllMods().filter(
  (mod) => eligibilitySensitiveNames.includes(mod.name) && !mod.eligibilityNameSensitive
);
if (missingEligibilitySensitivity.length > 0) {
  throw new Error('Pool failed to mark duplicate-name eligibility sensitivity');
}

function quotientActionSignature(node: CanonicalGraphNode): string {
  return JSON.stringify([...node.actions.entries()].map(([actionId, action]) => {
    const outcomes = new Map<string, number>();
    for (const transition of action.transitions) {
      const key = getCanonicalStateKey(transition.nextState, baseInput.target);
      outcomes.set(key, (outcomes.get(key) ?? 0) + transition.probability);
    }
    return {
      actionId,
      immediateCostChaos: action.immediateCostChaos,
      outcomes: [...outcomes]
        .map(([key, probability]) => [key, Number(probability.toFixed(12))] as const)
        .sort(([left], [right]) => left.localeCompare(right)),
    };
  }).sort((left, right) => left.actionId.localeCompare(right.actionId)));
}

console.error('[phase2h] shared filler-equivalence audit');
const quotientAuditStarted = Date.now();
const auditHarvestTags = Object.keys(HARVEST_CRAFT_DEFINITIONS)
  .map((tag) => ({ tag, mods: getTaggedModsForCluster(pool, tag, cleanState.itemLevel).length }))
  .filter(({ mods }) => mods > 0)
  .sort((left, right) => left.mods - right.mods || left.tag.localeCompare(right.tag))
  .slice(0, 1)
  .map(({ tag }) => tag);
const concreteAuditGraph = new GenericSearchEngine(
  { pool, priceBook: new PriceBook() },
  baseInput.target,
  {
    includeHarvest: auditHarvestTags.length > 0,
    harvestTags: auditHarvestTags,
    prioritizeTargetProgress: true,
    canonicalStateKey: getPhysicalStateSignature,
    maxStates: 1_000,
    maxWallTimeMs: 20_000,
    maxExpansionRounds: 1,
    searchIntent: 'RECOMMEND',
    persistentExpansion: false,
  }
).buildGraph(cleanState, 1_000, undefined, Date.now() + 20_000, undefined, 'RECOMMEND');
const quotientClasses = new Map<string, { signature: string; states: number }>();
const quotientViolations: string[] = [];
for (const node of concreteAuditGraph.nodes.values()) {
  const quotientKey = getCanonicalStateKey(node.state, baseInput.target);
  const signature = quotientActionSignature(node);
  const existing = quotientClasses.get(quotientKey);
  if (existing && existing.signature !== signature) {
    quotientViolations.push(quotientKey);
  } else if (existing) {
    existing.states++;
  } else {
    quotientClasses.set(quotientKey, { signature, states: 1 });
  }
}
if (quotientViolations.length > 0) {
  throw new Error(
    `Shared filler-equivalence quotient audit failed for ${quotientViolations.length} classes`
  );
}
const collapsedAuditStates = [...quotientClasses.values()]
  .filter((entry) => entry.states > 1)
  .reduce((sum, entry) => sum + entry.states - 1, 0);

const matrix = [
  { id: 'A', maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3, searchIntent: 'RECOMMEND' as const },
  { id: 'B', maxStates: 10_000, maxWallTimeMs: 30_000, maxExpansionRounds: 3, searchIntent: 'RECOMMEND' as const },
  { id: 'C', maxStates: 5_000, maxWallTimeMs: 60_000, maxExpansionRounds: 3, searchIntent: 'RECOMMEND' as const },
  { id: 'D', maxStates: 5_000, maxWallTimeMs: 30_000, maxExpansionRounds: 4, searchIntent: 'RECOMMEND' as const },
  { id: 'E', maxStates: 10_000, maxWallTimeMs: 30_000, maxExpansionRounds: 4, searchIntent: 'RECOMMEND' as const },
  { id: 'F', maxStates: 10_000, maxWallTimeMs: 60_000, maxExpansionRounds: 4, searchIntent: 'DEEPEN' as const },
];
const selectedRows = new Set((process.env.PHASE2H_ROWS ?? matrix.map((row) => row.id).join(','))
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean));

function finite(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? 'NONE'
    : value.toFixed(6);
}

function modLabel(modId: string): string {
  const mod = pool.getAllMods().find((candidate) => candidate.modId === modId);
  if (!mod) return modId;
  const label = formatModifierPrimaryLabel({
    modId: mod.modId,
    statText: mod.statText,
    technicalName: mod.name,
    tier: mod.tier,
    tierCount: mod.tierCount,
    isNotable: mod.isNotable,
  });
  const duplicateDisplay = pool.getAllMods().some((candidate) =>
    candidate.modId !== modId &&
    formatModifierPrimaryLabel({
      modId: candidate.modId,
      statText: candidate.statText,
      technicalName: candidate.name,
      tier: candidate.tier,
      tierCount: candidate.tierCount,
      isNotable: candidate.isNotable,
    }) === label
  );
  return duplicateDisplay ? `${label} [${modId}]` : label;
}

function renderedCondition(rule: PolicyExplanationRule): string {
  const context = rule.context;
  if (context.acquisitionMenu) return 'Start: choose an acquisition route';
  const formatAffix = (affix: (typeof context.prefixes)[number]): string => {
    const label = modLabel(affix.modId);
    const tier = label.includes(`(T${affix.tier})`) ? '' : ` (T${affix.tier})`;
    return `${affix.isFractured ? 'fractured ' : ''}${label}${tier}` +
      `${affix.currentRoll?.length ? ` (roll ${affix.currentRoll.join('/')})` : ''}`;
  };
  const exactAffixState = [
    ...context.prefixes.map((affix) => `prefix ${formatAffix(affix)}`),
    ...context.suffixes.map((affix) => `suffix ${formatAffix(affix)}`),
  ];
  return [
    `${context.rarity} ${context.prefixCount}P/${context.suffixCount}S`,
    context.matchedTargetModIds.length > 0
      ? `target present: ${context.matchedTargetModIds.map(modLabel).join(', ')}`
      : 'no target modifier present',
    context.unmatchedTargetModIds.length > 0
      ? `target missing: ${context.unmatchedTargetModIds.map(modLabel).join(', ')}`
      : 'all target modifiers present',
    context.disambiguateAffixes && exactAffixState.length > 0
      ? `exact affix state: ${exactAffixState.join(', ')}`
      : undefined,
    context.influenced ? 'influenced' : undefined,
    context.synthesised ? 'synthesised' : undefined,
  ].filter((part): part is string => part !== undefined).join('; ');
}

function collisionAudit(result: OptimizeCraftResult): {
  collisions: string[];
  branchExamples: string[];
} {
  const actionsByCondition = new Map<string, Set<string>>();
  for (const rule of result.policyExplanation) {
    const condition = renderedCondition(rule);
    const actions = actionsByCondition.get(condition) ?? new Set<string>();
    actions.add(rule.actionId);
    actionsByCondition.set(condition, actions);
  }
  return {
    collisions: [...actionsByCondition]
      .filter(([, actions]) => actions.size > 1)
      .map(([condition, actions]) => `${condition} => ${[...actions].join(',')}`),
    branchExamples: result.policyExplanation
      .filter((rule) =>
        rule.context.rarity === 'magic' &&
        rule.context.prefixCount === 1 &&
        rule.context.suffixCount === 1 &&
        rule.context.matchedTargetModIds.length === 1
      )
      .slice(0, 6)
      .map((rule) => `${renderedCondition(rule)} => ${rule.actionId}`),
  };
}

function summarize(id: string, result: OptimizeCraftResult, workerElapsedMs: number): string[] {
  const collision = collisionAudit(result);
  if (collision.collisions.length > 0) {
    throw new Error(`${id} rendered policy collisions: ${collision.collisions.join(' | ')}`);
  }
  for (const candidate of result.acquisition.candidates) {
    const synthesis = candidate.synthesis;
    if (!synthesis?.expectedCostChaos) continue;
    if (synthesis.lowerBoundEvidence.combinedLowerBoundChaos > synthesis.expectedCostChaos + 1e-6) {
      throw new Error(`${id} inadmissible bound for ${candidate.label}`);
    }
  }
  return [
    `${id}: status=${result.recommendationStatus}; selected=${result.recommended?.name ?? 'NONE'}; U=${finite(result.expectedCostChaos)}; bestL=${finite(result.acquisition.bestUnresolvedLowerBoundChaos)}; gap=${finite(result.acquisition.potentialGapChaos)}`,
    `  proper=${result.risk.selectedPolicyProper}; absorption=${result.risk.terminalAbsorptionProbability.toFixed(12)}; reconciled=${result.solver.costReconciled}; Bellman=${result.solver.bellmanConverged}; occupancy=${result.solver.occupancyConverged}`,
    `  states=${result.search.statesExpanded}; cumulative=${result.search.cumulativeExpansionWork}; seed=${result.search.seedStatesExpanded}; new=${JSON.stringify(result.search.newStatesByRound)}; retained=${JSON.stringify(result.search.retainedStatesReusedByRound)}`,
    `  transitionDistributions=${result.search.transitionDistributionsGenerated}; byRound=${JSON.stringify(result.search.transitionDistributionsGeneratedByRound)}; priorNodesRevisited=${result.search.previouslyExpandedNodesRevisited}; byRound=${JSON.stringify(result.search.previouslyExpandedNodesRevisitedByRound)}; feasibilityStates=${result.search.acquisitionFeasibilityStatesExpanded}; interruptedStates=${result.search.interruptedStatesExpanded}`,
    `  repeated=${result.search.repeatedStatesExpanded}; rounds=${result.search.expansionRounds}/${result.search.maxExpansionRounds}; firstCertified=${result.search.timeToFirstCertifiedPolicyMs ?? 'NONE'}; firstUseful=${result.search.timeToFirstUsefulRecommendationMs ?? 'NONE'}`,
    `  engineElapsed=${result.search.elapsedMs}; totalStaged=${result.search.totalElapsedMs}; workerElapsed=${workerElapsedMs}`,
    `  cleanCertification=${JSON.stringify(result.acquisition.stage.cleanCertification ?? null)}`,
    `  policyCards=${result.policyExplanation.length}; renderedCollisions=${collision.collisions.length}; branchExamples=${collision.branchExamples.join(' | ') || 'NONE'}`,
    `  expectedUsage=${result.expectedActionUsage.map((usage) => `${usage.actionId}:${usage.expectedCount.toFixed(6)}:${usage.expectedCostChaos.toFixed(6)}c`).join(', ') || 'NONE'}`,
    ...result.acquisition.candidates.filter((candidate) => candidate.synthesis).map((candidate) => {
      const synthesis = candidate.synthesis!;
      const evidence = synthesis.lowerBoundEvidence;
      return `  fracture=${candidate.label}; status=${synthesis.status}; U=${finite(synthesis.expectedCostChaos)}; partialL=${finite(evidence.partialGraphLowerBoundChaos)}; mechanicsL=${finite(evidence.mandatoryMechanicsLowerBoundChaos)}; combinedL=${finite(evidence.combinedLowerBoundChaos)}; rule=${evidence.combinationRule}; component=${evidence.mechanics.components.map((component) => `${component.selectedMinimumActionId}:${component.lowerBoundChaos.toFixed(6)}c:x${component.minimumApplications}`).join(',') || 'NONE'}; states=${synthesis.search?.statesExpanded ?? 0}; elapsed=${synthesis.search?.elapsedMs ?? 0}`;
    }),
    `  prefracturedMarketMethods=${result.acquisition.candidates.some((candidate) => candidate.methods.some((method) => method.id.startsWith('market'))) ? 'PRESENT' : 'ABSENT'}`,
  ];
}

const lines = [
  'PHASE 2H HERALD DIAGNOSTIC',
  `catalog target ids: Empowered Envoy=${empoweredEnvoyId}; Endbringer=${endbringerId}`,
  `duplicate-name eligibility sensitivity: names=${JSON.stringify(eligibilitySensitiveNames)}; missing markers=${missingEligibilitySensitivity.length}`,
  `filler-equivalence Harvest scope: ${auditHarvestTags.join(', ') || 'none available'}`,
  `shared filler-equivalence audit: concrete states=${concreteAuditGraph.nodes.size}; quotient classes=${quotientClasses.size}; collapsed states=${collapsedAuditStates}; action/transition violations=${quotientViolations.length}; runtime=${Date.now() - quotientAuditStarted}ms`,
  '',
  'PRE-CHANGE CONTROLLED A-F REFERENCE (captured before implementation)',
  'A 5k/30s/3 RECOMMEND: NO_RESOLVED_ROUTE; states=5000; cumulative=8334; repeated(legacy)=3334; rounds=2; staged=29005ms; Empowered U=1485.306281 L=10.299994; Endbringer unresolved L=10.096212',
  'B 10k/30s/3 RECOMMEND: NO_RESOLVED_ROUTE; states=6668; cumulative=13333; repeated(legacy)=6665; rounds=1; staged=29002ms',
  'C 5k/60s/3 RECOMMEND: NO_RESOLVED_ROUTE; states=5000; cumulative=9998; repeated(legacy)=4998; rounds=3; staged=29138ms',
  'D 5k/30s/4 RECOMMEND: NO_RESOLVED_ROUTE; states=5000; cumulative=8748; repeated(legacy)=3748; rounds=3; staged=29007ms',
  'E 10k/30s/4 RECOMMEND: NO_RESOLVED_ROUTE; states=7500; cumulative=14999; repeated(legacy)=7499; rounds=2; staged=29034ms',
  'F 10k/60s/4 DEEPEN: NO_RESOLVED_ROUTE in isolated cold service; states=10000; cumulative=20000; repeated(legacy)=10000; rounds=4; staged=11730ms',
  'Historical browser Retry Deeper reference from addendum: PROVISIONAL_RESOLVED clean base ~78.781c; proper/absorbing/reconciled; fracture best L ~10.149c.',
  'Finding: the validated Rare target bypassed the existing clean-first pass; portfolio/acquisition competition plus filler-identity state multiplication consumed capacity. Wall time alone did not fix A-E.',
  '',
  'POST-CHANGE A-F BUDGET MATRIX',
];

if (process.env.PHASE2H_INCLUDE_DIRECT === 'true') {
  console.error('[phase2h] direct clean-state control');
  const direct = new GenericSearchEngine(
    { pool, priceBook: new PriceBook() },
    baseInput.target,
    {
      includeHarvest: false,
      prioritizeTargetProgress: true,
      maxStates: Number(process.env.PHASE2H_DIRECT_STATES ?? 5_000),
      maxWallTimeMs: Number(process.env.PHASE2H_DIRECT_WALL ?? 22_000),
      maxExpansionRounds: Number(process.env.PHASE2H_DIRECT_ROUNDS ?? 3),
      searchIntent: 'RECOMMEND',
      persistentExpansion: true,
    }
  ).search(cleanState);
  lines.push(
    `direct clean control: certified=${direct.optimalityProof.selectedPolicyStatus}; U=${finite(10 + direct.totalExpectedCostChaos)}; proper=${direct.onPolicyGraph.isProper}; absorption=${direct.onPolicyGraph.terminalAbsorptionProbability.toFixed(12)}; states=${direct.searchSummary.statesExpanded}; rounds=${direct.searchSummary.expansionRounds}; elapsed=${direct.searchSummary.elapsedMs}`
  );
}

for (const row of matrix) {
  if (process.env.PHASE2H_DIRECT_ONLY === 'true') break;
  if (!selectedRows.has(row.id)) continue;
  console.error(`[phase2h] baseline matrix ${row.id}`);
  const started = Date.now();
  const result = new OptimizerService(repo).optimize({
    ...baseInput,
    searchBudget: {
      maxStates: row.maxStates,
      maxWallTimeMs: row.maxWallTimeMs,
      maxExpansionRounds: row.maxExpansionRounds,
    },
    searchIntent: row.searchIntent,
  });
  if (
    result.recommended === null ||
    !result.risk.selectedPolicyProper ||
    result.risk.terminalAbsorptionProbability < 1 - 1e-8 ||
    !result.solver.costReconciled
  ) {
    throw new Error(`${row.id} did not produce a certified proper Herald incumbent`);
  }
  lines.push(...summarize(row.id, result, Date.now() - started));
}

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
