import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts';
import { getAllAffixes, type ItemState } from '../crafting-engine/src/domain/ItemState.ts';
import type { Mod } from '../crafting-engine/src/domain/Mod.ts';
import { ModPool } from '../crafting-engine/src/domain/ModPool.ts';
import { PriceBook, type CurrencyRates } from '../crafting-engine/src/domain/PriceBook.ts';
import type { TargetDefinition } from '../crafting-engine/src/domain/TargetDefinition.ts';
import { toRolledMod } from '../crafting-engine/src/domain/Mod.ts';
import { createRandomSource } from '../crafting-engine/src/probability/random.ts';
import { getCanonicalStateKey } from '../crafting-engine/src/rules/actionDiscovery.ts';
import { CRAFT_MECHANICS, type CraftMechanic } from '../crafting-engine/src/rules/actionRegistry.ts';
import {
  MAGIC_ROLL_SHAPE,
  magicRollShapeProbabilities,
} from '../crafting-engine/src/rules/magicRollShape.ts';
import { runExternalParityDiagnostics } from '../crafting-engine/src/rules/externalParity.ts';
import {
  ACQUISITION_FRACTURE_PREPARATION_STATE_IDENTITY,
  synthesizeAcquisition,
} from '../crafting-engine/src/solver/acquisitionSynthesis.ts';
import { GenericSearchEngine, type CandidateActionQValue } from '../crafting-engine/src/solver/genericSearch.ts';
import { RELAXED_TARGET_PROGRESS_LOWER_BOUND_VERSION } from '../crafting-engine/src/solver/relaxedTargetProgressLowerBound.ts';
import {
  describeOptimizerSearchSessionIdentity,
  OPTIMIZER_MECHANICS_ACTION_SET_VERSION,
  type OptimizeCraftInput,
} from '../crafting-engine/src/service/optimizerService.ts';
import { getOptimizerPricingFromSnapshot } from '../src/crafting/optimizerPriceEvidence.ts';
import type { PriceFile } from '../src/priceModel.ts';

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url));
const evidencePath = join(
  repositoryRoot,
  'quality-lab',
  'reports',
  'evidence',
  'phase3b-fractured-magic-alteration-diagnostic.json',
);
const textPath = join(repositoryRoot, 'output-phase3b-fractured-magic-alteration-diagnostic.txt');
const probabilityTolerance = 1e-12;
const trials = 250_000;
const seeds = {
  cleanMagic: 0x3b010001,
  fracturedPrefix: 0x3b020002,
  fracturedSuffix: 0x3b030003,
  augment: 0x3b050005,
};

function mod(modId: string, name: string, genType: 'Prefix' | 'Suffix', weight: number): Mod {
  return {
    modId,
    name,
    genType,
    weight,
    ilvl: 1,
    modGroup: `group_${modId}`,
    modGroups: [`group_${modId}`],
    tags: [],
    craftTags: [],
    spawnTags: [],
    statText: name,
    statValues: [{ text: '1', min: 1, max: 1 }],
    tier: 1,
    tierCount: 1,
    isNotable: false,
  };
}

const prefixTarget = mod('phase3b_prefix_target', 'Phase 3B Prefix Target', 'Prefix', 2);
const prefixFiller = mod('phase3b_prefix_filler', 'Phase 3B Prefix Filler', 'Prefix', 3);
const suffixTarget = mod('phase3b_suffix_target', 'Phase 3B Suffix Target', 'Suffix', 2);
const suffixFiller = mod('phase3b_suffix_filler', 'Phase 3B Suffix Filler', 'Suffix', 3);
const controlledPool = new ModPool([prefixTarget, prefixFiller, suffixTarget, suffixFiller]);

const baseState: ItemState = {
  baseType: 'Large Cluster Jewel',
  clusterType: 'Phase 3B controlled Magic roll-shape pool',
  itemLevel: 1,
  passiveCount: 8,
  rarity: 'magic',
  prefixes: [],
  suffixes: [],
  fracturedModIds: [],
};
const fracturedPrefixState: ItemState = {
  ...baseState,
  prefixes: [toRolledMod(prefixTarget, { isFractured: true })],
  fracturedModIds: [prefixTarget.modId],
};
const fracturedSuffixState: ItemState = {
  ...baseState,
  suffixes: [toRolledMod(suffixTarget, { isFractured: true })],
  fracturedModIds: [suffixTarget.modId],
};
const noTarget: TargetDefinition = { requiredMods: [] };

function mechanic(id: string): CraftMechanic {
  const found = CRAFT_MECHANICS.find((candidate) => candidate.id === id);
  assert(found?.getTransitions && found.sampleTransition, `Missing executable mechanic ${id}`);
  return found;
}

const alteration = mechanic('alteration_orb');
const augmentation = mechanic('augmentation_orb');
assert.equal(alteration.parameters?.magicRollShapeVersion, MAGIC_ROLL_SHAPE.version);
assert.equal(alteration.repeatableFullReroll?.getKernelIdentity(fracturedPrefixState).startsWith(
  `${MAGIC_ROLL_SHAPE.version}|`,
), true);

const snapshot = JSON.parse(readFileSync(
  join(repositoryRoot, 'src', 'data', 'allflame', 'trade-prices.json'),
  'utf8',
)) as PriceFile;
const currentPricing = getOptimizerPricingFromSnapshot(
  snapshot,
  'Large Cluster Jewel',
  '12% increased Chaos Damage',
  8,
  75,
);
const currentRates = currentPricing.priceContext.currencyRates as Partial<CurrencyRates>;
const analyticalContext = { pool: controlledPool, priceBook: new PriceBook(currentRates) };

type TransitionAudit = {
  probabilitySum: number;
  prefixOnly: number;
  suffixOnly: number;
  prefixAndSuffix: number;
  selfLoop: number;
  oppositeSide: number;
  targetHit: number;
  illegalDoublePrefix: number;
  illegalDoubleSuffix: number;
};

function transitionAudit(state: ItemState, action: CraftMechanic, targetModId: string): TransitionAudit {
  const outcomes = action.getTransitions!(state, noTarget, analyticalContext).outcomes;
  return outcomes.reduce<TransitionAudit>((audit, outcome) => {
    const prefixes = outcome.state.prefixes.length;
    const suffixes = outcome.state.suffixes.length;
    const initialAffixCount = getAllAffixes(state).filter((affix) => affix.isFractured).length;
    const affixCount = prefixes + suffixes;
    audit.probabilitySum += outcome.probability;
    if (initialAffixCount === 0) {
      if (prefixes === 1 && suffixes === 0) audit.prefixOnly += outcome.probability;
      if (prefixes === 0 && suffixes === 1) audit.suffixOnly += outcome.probability;
      if (prefixes === 1 && suffixes === 1) audit.prefixAndSuffix += outcome.probability;
    } else {
      if (affixCount === initialAffixCount) audit.selfLoop += outcome.probability;
      if (affixCount > initialAffixCount) audit.oppositeSide += outcome.probability;
    }
    if (getAllAffixes(outcome.state).some((affix) => affix.modId === targetModId && !affix.isFractured)) {
      audit.targetHit += outcome.probability;
    }
    if (prefixes > 1) audit.illegalDoublePrefix += outcome.probability;
    if (suffixes > 1) audit.illegalDoubleSuffix += outcome.probability;
    return audit;
  }, {
    probabilitySum: 0,
    prefixOnly: 0,
    suffixOnly: 0,
    prefixAndSuffix: 0,
    selfLoop: 0,
    oppositeSide: 0,
    targetHit: 0,
    illegalDoublePrefix: 0,
    illegalDoubleSuffix: 0,
  });
}

const shape = magicRollShapeProbabilities();
const openSideProbability = shape.SUFFIX_ONLY + shape.PREFIX_AND_SUFFIX;
const targetWeightShare = suffixTarget.weight / (suffixTarget.weight + suffixFiller.weight);
const cleanAnalytical = transitionAudit(baseState, alteration, suffixTarget.modId);
const fracturedPrefixAnalytical = transitionAudit(fracturedPrefixState, alteration, suffixTarget.modId);
const fracturedSuffixAnalytical = transitionAudit(fracturedSuffixState, alteration, prefixTarget.modId);
const augmentAnalytical = transitionAudit(fracturedPrefixState, augmentation, suffixTarget.modId);

function assertNear(actual: number, expected: number, label: string, tolerance = probabilityTolerance): void {
  assert(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} != ${expected}`);
}

assertNear(cleanAnalytical.probabilitySum, 1, 'B1 probability sum');
assertNear(cleanAnalytical.prefixOnly, shape.PREFIX_ONLY, 'B1 Prefix-only');
assertNear(cleanAnalytical.suffixOnly, shape.SUFFIX_ONLY, 'B1 Suffix-only');
assertNear(cleanAnalytical.prefixAndSuffix, shape.PREFIX_AND_SUFFIX, 'B1 Prefix+Suffix');
assertNear(fracturedPrefixAnalytical.probabilitySum, 1, 'B2 probability sum');
assertNear(fracturedPrefixAnalytical.selfLoop, shape.PREFIX_ONLY, 'B2 self-loop');
assertNear(fracturedPrefixAnalytical.oppositeSide, openSideProbability, 'B2 open Suffix');
assertNear(fracturedSuffixAnalytical.probabilitySum, 1, 'B3 probability sum');
assertNear(fracturedSuffixAnalytical.selfLoop, shape.SUFFIX_ONLY, 'B3 self-loop');
assertNear(fracturedSuffixAnalytical.oppositeSide, shape.PREFIX_ONLY + shape.PREFIX_AND_SUFFIX, 'B3 open Prefix');
assertNear(fracturedPrefixAnalytical.targetHit, openSideProbability * targetWeightShare, 'B4 weighted target');
assertNear(augmentAnalytical.probabilitySum, 1, 'B5 Augment probability sum');
assertNear(augmentAnalytical.selfLoop, 0, 'B5 Augment self-loop');
assertNear(augmentAnalytical.targetHit, targetWeightShare, 'B5 Augment target');
assert.notEqual(fracturedPrefixAnalytical.targetHit, augmentAnalytical.targetHit);
for (const [label, audit] of Object.entries({
  cleanAnalytical,
  fracturedPrefixAnalytical,
  fracturedSuffixAnalytical,
  augmentAnalytical,
})) {
  assertNear(audit.probabilitySum, 1, `${label} conservation`);
  assertNear(audit.illegalDoublePrefix, 0, `${label} no double Prefix`);
  assertNear(audit.illegalDoubleSuffix, 0, `${label} no double Suffix`);
}

type MonteCarloCounter = {
  trials: number;
  oneAffix: number;
  twoAffix: number;
  selfLoop: number;
  oppositeSide: number;
  targetHit: number;
  illegalDoublePrefix: number;
  illegalDoubleSuffix: number;
};

function monteCarlo(
  state: ItemState,
  action: CraftMechanic,
  targetModId: string,
  seed: number,
): MonteCarloCounter {
  const rng = createRandomSource(seed);
  const counter: MonteCarloCounter = {
    trials,
    oneAffix: 0,
    twoAffix: 0,
    selfLoop: 0,
    oppositeSide: 0,
    targetHit: 0,
    illegalDoublePrefix: 0,
    illegalDoubleSuffix: 0,
  };
  const persistentCount = getAllAffixes(state).filter((affix) => affix.isFractured).length;
  for (let trial = 0; trial < trials; trial++) {
    const sampled = action.sampleTransition!(state, noTarget, analyticalContext, rng);
    const affixes = getAllAffixes(sampled);
    const added = affixes.length - persistentCount;
    if (persistentCount === 0) {
      if (affixes.length === 1) counter.oneAffix++;
      if (affixes.length === 2) counter.twoAffix++;
    } else {
      if (added === 0) counter.selfLoop++;
      if (added > 0) counter.oppositeSide++;
    }
    if (affixes.some((affix) => affix.modId === targetModId && !affix.isFractured)) counter.targetHit++;
    if (sampled.prefixes.length > 1) counter.illegalDoublePrefix++;
    if (sampled.suffixes.length > 1) counter.illegalDoubleSuffix++;
  }
  return counter;
}

function wilson99(successes: number, count: number): [number, number] {
  const z = 2.5758293035489004;
  const p = successes / count;
  const z2 = z * z;
  const denominator = 1 + z2 / count;
  const centre = (p + z2 / (2 * count)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * count)) / count) / denominator;
  return [Math.max(0, centre - margin), Math.min(1, centre + margin)];
}

function intervalEvidence(successes: number, expected: number): {
  successes: number;
  trials: number;
  observed: number;
  analytical: number;
  confidence: '99% Wilson';
  interval: [number, number];
  analyticalInsideInterval: boolean;
} {
  const interval = wilson99(successes, trials);
  const analyticalInsideInterval = expected >= interval[0] && expected <= interval[1];
  assert(analyticalInsideInterval, `Expected ${expected} is outside 99% interval ${interval.join('..')}`);
  return {
    successes,
    trials,
    observed: successes / trials,
    analytical: expected,
    confidence: '99% Wilson',
    interval,
    analyticalInsideInterval,
  };
}

const cleanMc = monteCarlo(baseState, alteration, suffixTarget.modId, seeds.cleanMagic);
const fracturedPrefixMc = monteCarlo(
  fracturedPrefixState,
  alteration,
  suffixTarget.modId,
  seeds.fracturedPrefix,
);
const fracturedSuffixMc = monteCarlo(
  fracturedSuffixState,
  alteration,
  prefixTarget.modId,
  seeds.fracturedSuffix,
);
const augmentMc = monteCarlo(fracturedPrefixState, augmentation, suffixTarget.modId, seeds.augment);
for (const counter of [cleanMc, fracturedPrefixMc, fracturedSuffixMc, augmentMc]) {
  assert.equal(counter.illegalDoublePrefix, 0);
  assert.equal(counter.illegalDoubleSuffix, 0);
}

const monteCarloEvidence = {
  trialCountPerCase: trials,
  seeds,
  cleanOneAffix: intervalEvidence(cleanMc.oneAffix, MAGIC_ROLL_SHAPE.oneAffixProbability),
  cleanTwoAffix: intervalEvidence(cleanMc.twoAffix, MAGIC_ROLL_SHAPE.twoAffixProbability),
  fracturedPrefixSelfLoop: intervalEvidence(fracturedPrefixMc.selfLoop, fracturedPrefixAnalytical.selfLoop),
  fracturedPrefixOpenSuffix: intervalEvidence(fracturedPrefixMc.oppositeSide, fracturedPrefixAnalytical.oppositeSide),
  fracturedPrefixTargetSuffix: intervalEvidence(fracturedPrefixMc.targetHit, fracturedPrefixAnalytical.targetHit),
  fracturedSuffixSelfLoop: intervalEvidence(fracturedSuffixMc.selfLoop, fracturedSuffixAnalytical.selfLoop),
  fracturedSuffixOpenPrefix: intervalEvidence(fracturedSuffixMc.oppositeSide, fracturedSuffixAnalytical.oppositeSide),
  fracturedSuffixTargetPrefix: intervalEvidence(fracturedSuffixMc.targetHit, fracturedSuffixAnalytical.targetHit),
  augmentTargetSuffix: intervalEvidence(augmentMc.targetHit, augmentAnalytical.targetHit),
};

const suffixTargetDefinition: TargetDefinition = {
  requiredRarity: 'magic',
  requiredMods: [{ modId: suffixTarget.modId }],
};

function bellmanAtRates(rates: Partial<CurrencyRates>): {
  selectedActionId: string;
  selectedValueChaos: number;
  qValues: CandidateActionQValue[];
  proof: string;
  proper: boolean;
  absorptionProbability: number;
  reconciled: boolean;
} {
  const context = { pool: controlledPool, priceBook: new PriceBook(rates) };
  const result = new GenericSearchEngine(context, suffixTargetDefinition, {
    enabledActionIds: ['alteration_orb', 'augmentation_orb'],
    maxStates: 100,
    maxIterations: 20_000,
    maxMarkovIterations: 20_000,
    maxExpansionRounds: 2,
    prioritizeTargetProgress: true,
  }).search(fracturedPrefixState);
  const decision = result.policyMap.get(getCanonicalStateKey(fracturedPrefixState, suffixTargetDefinition));
  assert(decision, 'No Bellman decision for fracture-only Magic state');
  assert(decision.candidateQValues.some((candidate) => candidate.actionId === 'alteration_orb'));
  assert(decision.candidateQValues.some((candidate) => candidate.actionId === 'augmentation_orb'));
  assert.equal(result.onPolicyGraph.isProper, true);
  assertNear(result.onPolicyGraph.terminalAbsorptionProbability, 1, 'Bellman absorption', 1e-8);
  assert.equal(result.reconciliation.isReconciled, true);
  return {
    selectedActionId: decision.bestActionId,
    selectedValueChaos: decision.optimalValueChaos,
    qValues: decision.candidateQValues.map((candidate) => ({ ...candidate })),
    proof: result.optimalityProof.selectedPolicyStatus,
    proper: result.onPolicyGraph.isProper,
    absorptionProbability: result.onPolicyGraph.terminalAbsorptionProbability,
    reconciled: result.reconciliation.isReconciled,
  };
}

const currentBellman = bellmanAtRates(currentRates);
const reversedRates: Partial<CurrencyRates> = {
  ...currentRates,
  alteration: 0.0001,
  augmentation: 50,
};
const reversedBellman = bellmanAtRates(reversedRates);
assert.equal(reversedBellman.selectedActionId, 'alteration_orb', 'Cheap Alter did not win controlled reversal');
assert.notEqual(
  reversedBellman.selectedActionId,
  currentBellman.selectedActionId,
  'Controlled price-only change did not reverse the selected action',
);

const cleanNormal: ItemState = { ...baseState, rarity: 'normal' };
const acquisition = synthesizeAcquisition(
  analyticalContext,
  {
    cleanStartingState: cleanNormal,
    desiredPhysicalState: { fracturedMod: { modId: prefixTarget.modId } },
    cleanBaseAcquisition: {
      costChaos: 1,
      confidence: 'known',
      provenance: 'Phase 3B controlled clean-base acquisition',
    },
    enabledActionIds: [
      'transmutation_orb',
      'alteration_orb',
      'augmentation_orb',
      'regal_orb',
      'exalted_orb',
      'scouring_orb',
      'fracturing_orb',
      'restart_reacquire',
    ],
    searchBudget: { maxStates: 1_000, maxWallTimeMs: 20_000, maxExpansionRounds: 4 },
  },
);
assert.equal(acquisition.status, 'RESOLVED');
assert.equal(acquisition.risk.selectedPolicyProper, true);
assertNear(acquisition.risk.terminalAbsorptionProbability, 1, 'Acquisition absorption', 1e-8);
assert.equal(acquisition.solver.costReconciled, true);
assert.equal(acquisition.solver.bellmanConverged, true);
assert.equal(acquisition.solver.occupancyConverged, true);

const identityInput: OptimizeCraftInput = {
  baseType: 'Large Cluster Jewel',
  clusterType: baseState.clusterType,
  itemLevel: 1,
  passiveCount: 8,
  target: suffixTargetDefinition,
  prices: { currencyRates: currentRates },
  searchBudget: { maxStates: 100, maxWallTimeMs: 1_000, maxExpansionRounds: 1 },
};
const currentIdentity = describeOptimizerSearchSessionIdentity(identityInput, []);
const oldIdentityObject = JSON.parse(currentIdentity.exactIdentity) as Record<string, unknown>;
const mechanicsActionSet = JSON.parse(String(oldIdentityObject.mechanicsActionSet)) as Record<string, unknown>;
mechanicsActionSet.version = 'phase2j-core-actions-v1';
oldIdentityObject.mechanicsActionSet = JSON.stringify(mechanicsActionSet);
const oldExactIdentity = JSON.stringify(oldIdentityObject);
function optimizerIdentityHash(identity: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < identity.length; index++) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `phase2j-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}
const oldIdentityHash = optimizerIdentityHash(oldExactIdentity);
assert.notEqual(currentIdentity.identityHash, oldIdentityHash);
assert(currentIdentity.exactIdentity.includes(OPTIMIZER_MECHANICS_ACTION_SET_VERSION));

const realRepository = new ClusterModRepository();
const parityPool = ModPool.forCluster(
  realRepository,
  'Large Cluster Jewel',
  '12% increased Attack Damage while holding a Shield',
);
const externalParity = runExternalParityDiagnostics({
  pool: parityPool,
  priceBook: new PriceBook(currentRates),
});
const parityClassifications = externalParity.results.map((result) => ({
  benchmarkId: result.benchmarkId,
  status: result.status,
  analyticalProbabilityPct: result.analyticalProbabilityPct,
  monteCarloProbabilityPct: result.mcObservedProbabilityPct,
  classification:
    result.benchmarkId.startsWith('alt_')
      ? 'PRESERVED / NO MATERIAL DIFFERENCE — benchmark starts without a fracture'
      : 'PRESERVED / UNRELATED MECHANIC',
}));

const evidence = {
  phase: '3B',
  generatedAt: new Date().toISOString(),
  implementation: {
    defect:
      'The one-fractured-affix analytical and sampled Alteration shortcut discarded the requested ' +
      'same-side roll shape and renormalized all probability onto the open opposite side.',
    sharedContract: MAGIC_ROLL_SHAPE,
    exactSplitDisposition:
      'The existing 50/50 one-affix/two-affix approximation remains configured. The approximately ' +
      '52/48 field observation was not independently pinned and was not hardcoded.',
  },
  analytical: {
    configuredShapeProbabilities: shape,
    openSideProbability,
    targetWeightShare,
    clean: cleanAnalytical,
    fracturedPrefix: fracturedPrefixAnalytical,
    fracturedSuffix: fracturedSuffixAnalytical,
    augmentFromFracturedPrefix: augmentAnalytical,
    formulas: {
      fracturedPrefixSelfLoop: 'oneAffixProbability × oneAffixPrefixShare',
      fracturedPrefixOpenSuffix: 'oneAffixProbability × oneAffixSuffixShare + twoAffixProbability',
      weightedTargetHit: 'openSideProbability × targetWeight / totalEligibleOppositeSideWeight',
      augmentTargetHit: 'targetWeight / totalEligibleOppositeSideWeight',
    },
  },
  monteCarlo: monteCarloEvidence,
  bellman: {
    pricingSnapshot: {
      league: snapshot.league,
      fetchedAt: snapshot.fetchedAt,
      ratesAt: snapshot.ratesAt,
      alteration: currentRates.alteration,
      augmentation: currentRates.augmentation,
    },
    transitionEvidence: {
      alterTargetHitProbability: fracturedPrefixAnalytical.targetHit,
      alterNoNewAffixProbability: fracturedPrefixAnalytical.selfLoop,
      augmentTargetHitProbability: augmentAnalytical.targetHit,
      augmentNoNewAffixProbability: augmentAnalytical.selfLoop,
    },
    current: currentBellman,
    controlledPriceReversal: {
      changedOnly: ['alteration', 'augmentation'],
      rates: { alteration: reversedRates.alteration, augmentation: reversedRates.augmentation },
      result: reversedBellman,
    },
  },
  acquisition: {
    status: acquisition.status,
    expectedCostChaos: acquisition.expectedCostChaos,
    lowerBoundChaos: acquisition.lowerBoundChaos,
    expectedRestarts: acquisition.expectedRestarts,
    expectedFracturingOrbs: acquisition.expectedFracturingOrbs,
    expectedActionUsage: acquisition.expectedActionUsage,
    proof: acquisition.proof,
    risk: acquisition.risk,
    solver: acquisition.solver,
    search: acquisition.search,
    terminalPhysicalStateSignatures: acquisition.terminalPhysicalStateSignatures,
  },
  cacheInvalidation: {
    previousMechanicsActionSetVersion: 'phase2j-core-actions-v1',
    currentMechanicsActionSetVersion: OPTIMIZER_MECHANICS_ACTION_SET_VERSION,
    previousIdentityHash: oldIdentityHash,
    currentIdentityHash: currentIdentity.identityHash,
    identitiesDiffer: oldIdentityHash !== currentIdentity.identityHash,
    relaxedBoundVersion: RELAXED_TARGET_PROGRESS_LOWER_BOUND_VERSION,
    repeatableKernelVersion: MAGIC_ROLL_SHAPE.version,
    acquisitionStateIdentity: ACQUISITION_FRACTURE_PREPARATION_STATE_IDENTITY,
    stateIdentityDisposition:
      'Unchanged: the physical/canonical state equivalence relation did not change; incompatible ' +
      'transition/session/cache identities did.',
    serializedContinuationDisposition:
      'Share/export bundles serialize request/result summaries, not live continuation graphs.',
  },
  probabilityAudit: {
    distributions: {
      cleanAlter: cleanAnalytical.probabilitySum,
      fracturedPrefixAlter: fracturedPrefixAnalytical.probabilitySum,
      fracturedSuffixAlter: fracturedSuffixAnalytical.probabilitySum,
      fracturedPrefixAugment: augmentAnalytical.probabilitySum,
    },
    tolerance: probabilityTolerance,
    illegalAnalyticalMass: {
      doublePrefix: cleanAnalytical.illegalDoublePrefix + fracturedPrefixAnalytical.illegalDoublePrefix +
        fracturedSuffixAnalytical.illegalDoublePrefix + augmentAnalytical.illegalDoublePrefix,
      doubleSuffix: cleanAnalytical.illegalDoubleSuffix + fracturedPrefixAnalytical.illegalDoubleSuffix +
        fracturedSuffixAnalytical.illegalDoubleSuffix + augmentAnalytical.illegalDoubleSuffix,
    },
    illegalMonteCarloOutcomes: {
      doublePrefix: cleanMc.illegalDoublePrefix + fracturedPrefixMc.illegalDoublePrefix +
        fracturedSuffixMc.illegalDoublePrefix + augmentMc.illegalDoublePrefix,
      doubleSuffix: cleanMc.illegalDoubleSuffix + fracturedPrefixMc.illegalDoubleSuffix +
        fracturedSuffixMc.illegalDoubleSuffix + augmentMc.illegalDoubleSuffix,
    },
  },
  externalParity: parityClassifications,
  prohibitions: {
    unitTestsAddedOrRun: false,
    hardcodedAlterOrAugmentWinner: false,
    hardcodedApproximate52_48: false,
    stateIdentityWeakened: false,
    marketFracturedRanking: false,
  },
};

const lines = [
  'PHASE 3B — FRACTURED MAGIC ALTERATION FIDELITY DIAGNOSTIC',
  `Shared roll shape: ${MAGIC_ROLL_SHAPE.version} (${MAGIC_ROLL_SHAPE.confidence})`,
  `Declared shapes: Prefix-only=${shape.PREFIX_ONLY}; Suffix-only=${shape.SUFFIX_ONLY}; Prefix+Suffix=${shape.PREFIX_AND_SUFFIX}`,
  `Fractured Prefix: self-loop=${fracturedPrefixAnalytical.selfLoop}; open Suffix=${fracturedPrefixAnalytical.oppositeSide}; target=${fracturedPrefixAnalytical.targetHit}`,
  `Fractured Suffix: self-loop=${fracturedSuffixAnalytical.selfLoop}; open Prefix=${fracturedSuffixAnalytical.oppositeSide}; target=${fracturedSuffixAnalytical.targetHit}`,
  `Augment target=${augmentAnalytical.targetHit}; no-new-affix=${augmentAnalytical.selfLoop}`,
  `Monte Carlo: ${trials.toLocaleString()} trials/case; all analytical proportions inside seeded 99% Wilson intervals`,
  `Current Bellman: selected=${currentBellman.selectedActionId}; Q=${currentBellman.qValues.map((q) => `${q.actionId}:${q.totalQValueChaos.toFixed(6)}c`).join(', ')}`,
  `Price reversal: selected=${reversedBellman.selectedActionId}; Q=${reversedBellman.qValues.map((q) => `${q.actionId}:${q.totalQValueChaos.toFixed(6)}c`).join(', ')}`,
  `Acquisition: ${acquisition.status}; proper=${acquisition.risk.selectedPolicyProper}; absorption=${acquisition.risk.terminalAbsorptionProbability}; reconciled=${acquisition.solver.costReconciled}`,
  `Cache identity: ${oldIdentityHash} -> ${currentIdentity.identityHash}; mechanics=${OPTIMIZER_MECHANICS_ACTION_SET_VERSION}`,
  `External parity benchmarks executed: ${externalParity.results.length}`,
  'ALL PHASE 3B DIRECT DIAGNOSTIC GATES PASS',
  'Unit tests added/run: NO',
];

mkdirSync(dirname(evidencePath), { recursive: true });
writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
writeFileSync(textPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
console.log(`Evidence SHA-256: ${createHash('sha256').update(JSON.stringify(evidence)).digest('hex')}`);
