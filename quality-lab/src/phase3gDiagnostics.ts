import assert from 'node:assert/strict';
import { ClusterModRepository } from '../../crafting-engine/src/data/loadClusterMods.ts';
import { ModPool } from '../../crafting-engine/src/domain/ModPool.ts';
import { PriceBook } from '../../crafting-engine/src/domain/PriceBook.ts';
import type { ItemState } from '../../crafting-engine/src/domain/ItemState.ts';
import { toRolledMod } from '../../crafting-engine/src/domain/Mod.ts';
import {
  canonicalTargetFingerprintMaterial,
  canonicalizeTargetDefinition,
  evaluateTargetProgress,
  getTargetRequirementScenarios,
  satisfiesTarget,
  type TargetDefinition,
} from '../../crafting-engine/src/domain/TargetDefinition.ts';
import { CRAFT_MECHANICS } from '../../crafting-engine/src/rules/actionRegistry.ts';
import { generateStartingStateCandidates } from '../../crafting-engine/src/solver/strategyDiscovery.ts';
import { deriveMinimumFeasibleRarity } from '../../crafting-engine/src/solver/targetFeasibility.ts';
import { evaluateRelaxedTargetProgressLowerBound } from '../../crafting-engine/src/solver/relaxedTargetProgressLowerBound.ts';
import { validateOptimizeCraftInput } from '../../crafting-engine/src/service/optimizerValidation.ts';
import type { OptimizeCraftInput } from '../../crafting-engine/src/service/optimizerService.ts';
import {
  decodeCraftFromUrl,
  encodeCraftToUrl,
  generateBugReportBundle,
  type CraftSharePayload,
} from '../../crafting-engine/src/service/shareBundle.ts';

export interface Phase3GDiagnosticFixture {
  baseType: 'Large Cluster Jewel';
  clusterType: string;
  itemLevel: number;
  passiveCount: number;
  requiredIds: string[];
  acceptableIds: string[];
}

function makeState(
  repository: ClusterModRepository,
  fixture: Phase3GDiagnosticFixture,
  modIds: readonly string[],
): ItemState {
  const byId = new Map(repository
    .getCombinedModPool(fixture.baseType, fixture.clusterType)
    .filter((mod) => mod.ilvl <= fixture.itemLevel)
    .map((mod) => [mod.modId, mod]));
  const mods = modIds.map((modId) => {
    const mod = byId.get(modId);
    assert(mod, `Phase 3G exact modifier ${modId} is absent from the eligible pool`);
    return toRolledMod(mod);
  });
  return {
    baseType: fixture.baseType,
    clusterType: fixture.clusterType,
    itemLevel: fixture.itemLevel,
    passiveCount: fixture.passiveCount,
    rarity: 'rare',
    prefixes: mods.filter((mod) => mod.genType === 'Prefix'),
    suffixes: mods.filter((mod) => mod.genType === 'Suffix'),
    fracturedModIds: [],
  };
}

/** Focused G1-G8 source diagnostic; the paired gate adds a real built Worker result. */
export function runPhase3GDomainSolverDiagnostics(
  fixture: Phase3GDiagnosticFixture,
): Record<string, unknown> {
  assert.equal(fixture.requiredIds.length, 3);
  assert.equal(fixture.acceptableIds.length, 3);
  const repository = new ClusterModRepository();
  const pool = ModPool.forCluster(repository, fixture.baseType, fixture.clusterType);
  const target: TargetDefinition = {
    requiredRarity: 'rare',
    requiredMods: fixture.requiredIds.map((modId) => ({ modId })),
    acceptableAnyOf: fixture.acceptableIds.map((modId) => [{ modId }]),
  };
  const input: OptimizeCraftInput = {
    baseType: fixture.baseType,
    clusterType: fixture.clusterType,
    itemLevel: fixture.itemLevel,
    passiveCount: fixture.passiveCount,
    target,
    searchBudget: { maxStates: 5000, maxWallTimeMs: 30000, maxExpansionRounds: 3 },
  };
  const validation = validateOptimizeCraftInput(repository, input);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
  const normalized = validation.normalizedInput.target;
  assert.equal(normalized.requiredMods.length, 3);
  assert.deepEqual(normalized.acceptableAnyOf?.map((branch) => branch.length), [1, 1, 1]);
  assert.equal(normalized.requiredRarity, 'rare');
  assert.equal(normalized.finalStateConstraints, undefined);

  const feasibility = deriveMinimumFeasibleRarity(normalized, pool);
  assert.equal(feasibility.complete, true);
  assert.equal(feasibility.rarity, 'rare');
  assert.equal(feasibility.requiredPrefixes, 2);
  assert.equal(feasibility.requiredSuffixes, 2);
  const scenarios = getTargetRequirementScenarios(normalized);
  assert.equal(scenarios.length, 3);
  assert.deepEqual(scenarios.map((scenario) => scenario.length), [4, 4, 4]);

  const reversed = canonicalizeTargetDefinition({
    ...target,
    requiredMods: [...target.requiredMods].reverse(),
    acceptableAnyOf: [...target.acceptableAnyOf!].reverse(),
  });
  assert.deepEqual(
    canonicalTargetFingerprintMaterial(reversed),
    canonicalTargetFingerprintMaterial(normalized),
  );

  const requiredOnly = makeState(repository, fixture, fixture.requiredIds);
  assert.equal(satisfiesTarget(requiredOnly, normalized), false);
  const requiredOnlyProgress = evaluateTargetProgress(requiredOnly, normalized);
  assert.equal(requiredOnlyProgress.required.complete, true);
  assert.equal(requiredOnlyProgress.acceptable.satisfied, false);
  assert.equal(requiredOnlyProgress.terminal, false);

  const alternativeTruth = fixture.acceptableIds.map((alternativeId) => {
    const state = makeState(repository, fixture, [...fixture.requiredIds, alternativeId]);
    const progress = evaluateTargetProgress(state, normalized);
    assert.equal(satisfiesTarget(state, normalized), true, `${alternativeId} did not complete target`);
    assert.equal(progress.required.complete, true);
    assert.equal(progress.acceptable.satisfied, true);
    assert.equal(progress.acceptable.satisfiedBranchIndices.length, 1);
    return { alternativeId, terminal: true, matchedOnce: progress.acceptable.satisfied };
  });

  const multipleAlternatives = makeState(repository, fixture, [
    ...fixture.requiredIds,
    fixture.acceptableIds[0],
    fixture.acceptableIds[1],
  ]);
  const multipleProgress = evaluateTargetProgress(multipleAlternatives, normalized);
  assert.equal(multipleProgress.terminal, true);
  assert.equal(multipleProgress.acceptable.satisfied, true);
  assert.equal(multipleProgress.acceptable.satisfiedBranchIndices.length, 2);

  const missingRequired = fixture.requiredIds.map((missingId) => {
    const state = makeState(repository, fixture, [
      ...fixture.requiredIds.filter((modId) => modId !== missingId),
      fixture.acceptableIds[0],
    ]);
    assert.equal(satisfiesTarget(state, normalized), false, `${missingId} was not mandatory`);
    return { missingId, terminal: false };
  });

  const eligible = repository
    .getCombinedModPool(fixture.baseType, fixture.clusterType)
    .filter((mod) => mod.ilvl <= fixture.itemLevel);
  const requiredConflictAnchor = eligible.find((mod) => mod.modId === fixture.requiredIds[2]);
  assert(requiredConflictAnchor);
  const conflictingAlternative = eligible.find((mod) =>
    mod.modId !== requiredConflictAnchor.modId &&
    mod.modGroup === requiredConflictAnchor.modGroup
  );
  assert(conflictingAlternative, 'Phase 3G could not construct an exclusion-group negative control');
  const negativeValidation = validateOptimizeCraftInput(repository, {
    ...input,
    target: { ...target, acceptableAnyOf: [[{ modId: conflictingAlternative.modId }]] },
  });
  assert.equal(negativeValidation.valid, false);
  assert(negativeValidation.errors.some((error) =>
    error.field === 'target.acceptableAnyOf' && error.code === 'ALTERNATIVE_MOD_GROUP_CONFLICT'
  ));

  const priceBook = new PriceBook();
  const context = { pool, priceBook };
  const exalt = CRAFT_MECHANICS.find((mechanic) => mechanic.id === 'exalted_orb');
  assert(exalt?.getTransitions);
  const exaltDistribution = exalt.getTransitions(requiredOnly, normalized, context);
  const probabilityMass = exaltDistribution.outcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  assert(Math.abs(probabilityMass - 1) <= 1e-10);
  const terminalOutcomes = exaltDistribution.outcomes.filter((outcome) => satisfiesTarget(outcome.state, normalized));
  const terminalIds = terminalOutcomes.flatMap((outcome) =>
    outcome.state.suffixes
      .filter((mod) => fixture.acceptableIds.includes(mod.modId))
      .map((mod) => mod.modId)
  );
  assert.deepEqual([...new Set(terminalIds)].sort(), [...fixture.acceptableIds].sort());
  const terminalProbability = terminalOutcomes.reduce((sum, outcome) => sum + outcome.probability, 0);
  const alternativeProbability = exaltDistribution.outcomes.reduce((sum, outcome) => {
    const addedAlternative = outcome.state.suffixes.some((mod) => fixture.acceptableIds.includes(mod.modId));
    return sum + (addedAlternative ? outcome.probability : 0);
  }, 0);
  assert(Math.abs(terminalProbability - alternativeProbability) <= 1e-12);

  const enabledActionIds = CRAFT_MECHANICS.map((mechanic) => mechanic.id);
  const lowerBound = evaluateRelaxedTargetProgressLowerBound(
    context,
    requiredOnly,
    normalized,
    CRAFT_MECHANICS,
    enabledActionIds,
    true,
  );
  assert.equal(lowerBound.scenarioCount, 3);
  assert.equal(lowerBound.requirements.length, 4);
  const starts = generateStartingStateCandidates(
    normalized,
    fixture.baseType,
    fixture.clusterType,
    fixture.itemLevel,
    { pool, priceBook },
    fixture.passiveCount,
  );
  const fractureCandidates = starts.filter((candidate) => candidate.fracturedRequirement);
  assert(fractureCandidates.length >= 6);
  assert(fractureCandidates.every((candidate) => candidate.fracturedRequirement !== undefined));

  const shareBase = {
    baseType: fixture.baseType,
    clusterType: fixture.clusterType,
    itemLevel: fixture.itemLevel,
    passiveCount: fixture.passiveCount,
    targetMods: fixture.requiredIds,
    finalRarity: 'rare' as const,
  };
  for (const version of ['2R.1', '2W.1', '2X.1', '2Y.1'] as const) {
    const legacy = decodeCraftFromUrl(encodeCraftToUrl({ ...shareBase, version }));
    assert(legacy);
    assert.equal(legacy.acceptableAnyOf, undefined);
  }
  const sharePayload: CraftSharePayload = {
    ...shareBase,
    version: '3G.1',
    acceptableAnyOf: [...target.acceptableAnyOf!].reverse(),
  };
  const decodedShare = decodeCraftFromUrl(encodeCraftToUrl(sharePayload));
  assert(decodedShare);
  assert.deepEqual(decodedShare.acceptableAnyOf, normalized.acceptableAnyOf);
  const bugReport = generateBugReportBundle(decodedShare, undefined, '3H.1');
  assert.equal(bugReport.reportVersion, '3H.1');
  assert.deepEqual(bugReport.configuration.acceptableAnyOf, normalized.acceptableAnyOf);

  return {
    G1: {
      required: normalized.requiredMods.length,
      acceptableBranches: normalized.acceptableAnyOf?.length,
      rarity: feasibility.rarity,
      shape: `${feasibility.requiredPrefixes}P/${feasibility.requiredSuffixes}S`,
      scenarioSizes: scenarios.map((scenario) => scenario.length),
    },
    G2: { requiredOnlyTerminal: false, progress: requiredOnlyProgress },
    G3: alternativeTruth,
    G4: {
      multipleAlternativesTerminalCount: multipleProgress.terminal ? 1 : 0,
      matchedBranches: multipleProgress.acceptable.satisfiedBranchIndices.length,
      exaltProbabilityMass: probabilityMass,
      terminalUnionProbability: terminalProbability,
    },
    G5: missingRequired,
    G6: {
      scenarioCount: scenarios.length,
      negativeConflictId: conflictingAlternative.modId,
      negativeErrors: negativeValidation.errors,
    },
    G8: {
      lowerBoundScenarioCount: lowerBound.scenarioCount,
      selectedScenarioRequirementCount: lowerBound.requirements.length,
      fractureCandidateCount: fractureCandidates.length,
    },
    G12: {
      legacyShareVersions: ['2R.1', '2W.1', '2X.1', '2Y.1'],
      phase3gShareVersion: decodedShare.version,
      bugReportVersion: bugReport.reportVersion,
    },
  };
}
