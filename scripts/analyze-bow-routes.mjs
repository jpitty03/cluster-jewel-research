import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './lib/poedb-wand-references.mjs';
import { allSuffixProbability, cleanupBeforeProtectedMod, previewTargetProbability,
  restartWithSalvage } from './lib/equipment-route-analysis.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/crafting-engine/references');
const files = {
  request: 'requests/miracle-stinger.json',
  tradeEvidence: 'requests/miracle-stinger-trade-evidence.json',
  repoe: 'snapshots/repoe-bows-2026-09-06/thicket-bow.json',
  guide: 'requests/recombination-guide-baseline.json',
  brinehook: 'requests/brinehook-recombination-evidence.json',
  recombinationCosts: 'requests/recombination-cost-policy.json',
  fractureRecombination: 'requests/miracle-stinger-recombination-evidence.json',
  magicCounts: 'snapshots/craftofexile-model-2026-09-06/magic-affix-counts.json',
  allflameData: 'raw/craftofexile/model-2026-09-06/beta-data.json',
};
const inputs = [];
async function load(key, transform = JSON.parse) {
  const bytes = await readFile(resolve(root, files[key]));
  inputs.push({ role: key, path: files[key], sha256: digest(bytes) });
  return transform(bytes.toString('utf8'));
}
const request = await load('request');
files.prices = `economies/${request.costObjective.priceSnapshot}/prices.json`;
const tradeEvidence = await load('tradeEvidence');
const repoe = await load('repoe');
const prices = await load('prices');
const guide = await load('guide');
const brinehook = await load('brinehook');
const recombinationCosts = await load('recombinationCosts');
const fractureRecombination = await load('fractureRecombination');
const magicCounts = await load('magicCounts');
const allflame = await load('allflameData', text => JSON.parse(text.replace(/^coedata=/, '').replace(/;\s*$/, '')));
if (request.league !== prices.league || repoe.gameVersion !== '3.29.3.3'
  || recombinationCosts.league !== request.league
  || recombinationCosts.priceSnapshot !== request.costObjective.priceSnapshot) throw new Error('Snapshot context mismatch');
const recombinationAttemptCost = {
  chaos: recombinationCosts.planningDefault.tradeCostChaos,
  divine: recombinationCosts.planningDefault.tradeCostChaos / prices.chaosPerDivine,
  gold: recombinationCosts.planningDefault.goldPerAttempt,
  thaumaturgicDust: recombinationCosts.sourceObservation.thaumaturgicDust,
  policyId: recombinationCosts.policyId,
};

const price = id => {
  const row = prices.prices.find(candidate => candidate.id === id);
  if (!row) throw new Error(`Missing price: ${id}`);
  return row;
};
const target = id => {
  const row = repoe.ordinary.find(candidate => candidate.modId === id)
    ?? repoe.targetRecords.find(candidate => candidate.modId === id);
  if (!row) throw new Error(`Missing target: ${id}`);
  return row;
};
const ids = {
  fracture: 'WeaponElementalDamageOnTwohandWeapon5',
  allGems: 'LocalIncreaseSocketedGemLevel1',
  bowGems: 'LocalIncreaseSocketedBowGemLevel2',
  attackSpeed: 'LocalIncreasedAttackSpeed5',
  criticalMultiplier: 'LocalCriticalMultiplier3',
};
const prefixPool = repoe.ordinary.filter(row => row.generation_type === 'prefix');
const suffixPool = repoe.ordinary.filter(row => row.generation_type === 'suffix');
const prefixWeight = prefixPool.reduce((sum, row) => sum + row.adjustedWeight, 0);
const suffixWeight = suffixPool.reduce((sum, row) => sum + row.adjustedWeight, 0);
const shares = Object.fromEntries(Object.entries(ids).map(([key, id]) => {
  const row = target(id);
  return [key, row.adjustedWeight / (row.generation_type === 'prefix' ? prefixWeight : suffixWeight)];
}));

const thicket = allflame.items.entries.find(row => row.key === repoe.baseId);
const thicketClass = allflame.classes.entries.find(row => row.id === thicket?.class);
const classRule = allflame.methods.allflame.classes[String(thicketClass?.class)];
const levelFactor = allflame.methods.allflame.levels[String(request.referenceItemLevel)];
if (!thicket || !thicketClass || !classRule || levelFactor == null) throw new Error('Allflame bow scaling missing');
const sulphurCost = base => Math.round(base * classRule.factor * (classRule.scaling === false ? 1 : 1 + levelFactor));
const brineAction = allflame.methods.crafting['10'].elements.find(row => row.handler === 'ducat_brinehook');
const brineBracket = allflame.methods.allflame.currencies[String(brineAction?.item)]?.at(-1);
const resonatorBracket = allflame.methods.allflame.currencies['306']?.at(-1);
if (!brineBracket || !resonatorBracket) throw new Error('Allflame action brackets missing');
const brineSulphur = sulphurCost(brineBracket.cost);
const fracturedFossilSulphur = sulphurCost(resonatorBracket.cost);
const brineCost = price('brinehooks-ducat').divine + brineSulphur * price('dead-mans-sulphur').divine;
const fractureActionCost = price('fractured-fossil').divine + price('primitive-chaotic-resonator').divine
  + fracturedFossilSulphur * price('dead-mans-sulphur').divine;

const oneAffixProbability = magicCounts.magicAffixCountProbability['1'];
const sideMarginal = 1 - oneAffixProbability / 2;
const fractureTargetPerAlteration = sideMarginal * shares.fracture;
const candidateCost = price('alt').divine / fractureTargetPerAlteration + price('regal').divine
  + price('exalted').divine + oneAffixProbability * price('aug').divine;
const fracturePreview = previewTargetProbability(4, resonatorBracket.outcomes);
const fractureScenarios = Object.entries(fracturePreview).map(([previewModel, successProbability]) => ({
  previewModel, successProbability, expectedPreparedBases: 1 / successProbability,
  expectedCostDivine: (candidateCost + fractureActionCost) / successProbability,
}));

const fixedGroups = [...target(ids.fracture).groups, ...target(ids.bowGems).groups];
const rareCounts = magicCounts.rawTable['3'];
const totalFourProbability = rareCounts['4'].e - rareCounts['4'].s;
const totalFiveProbability = rareCounts['5'].e - rareCounts['5'].s;
const twoSuffixProbability = allSuffixProbability(repoe.ordinary, 2, fixedGroups);
const threeSuffixProbability = allSuffixProbability(repoe.ordinary, 3, fixedGroups);
const cleanTwo = cleanupBeforeProtectedMod({ unwantedCount: 2, removalCost: price('annul').divine });
const cleanThree = cleanupBeforeProtectedMod({ unwantedCount: 3, removalCost: price('annul').divine });
const generatedTwo = totalFourProbability * twoSuffixProbability;
const generatedThree = totalFiveProbability * threeSuffixProbability;
const cleanSuccessPerDread = generatedTwo * cleanTwo.successProbability + generatedThree * cleanThree.successProbability;
const expectedDreads = 1 / cleanSuccessPerDread;
const expectedAnnuls = (generatedTwo * cleanTwo.expectedRemovalsPerGeneratedItem
  + generatedThree * cleanThree.expectedRemovalsPerGeneratedItem) / cleanSuccessPerDread;
const prefixPiecePreparation = {
  policy: 'On a target-fractured bow, use Deafening Essence of Dread until no third prefix; annul suffixes. Restart the essence step whenever +2 Bow Gems is annulled.',
  exactEssenceModifierId: ids.bowGems,
  generatedTwoSuffixProbability: generatedTwo,
  generatedThreeSuffixProbability: generatedThree,
  cleanSuccessPerEssence: cleanSuccessPerDread,
  expectedEssences: expectedDreads,
  expectedAnnuls,
  expectedCostDivine: expectedDreads * price('deafening-essence-of-dread').divine
    + expectedAnnuls * price('annul').divine,
};
if (!Number.isFinite(prefixPiecePreparation.expectedCostDivine)) {
  throw new Error(`Invalid prefix-piece model: ${JSON.stringify({ totalFourProbability, totalFiveProbability,
    twoSuffixProbability, threeSuffixProbability, generatedTwo, generatedThree, cleanSuccessPerDread,
    expectedDreads, expectedAnnuls })}`);
}

const count = total => guide.affixCountKernel.byTotalInputAffixes[String(total)];
const suffixPairSuccess = (count(4)['2'] ?? 0) + (count(4)['3'] ?? 0);
const prefixFinalSuccess = (count(3)['2'] ?? 0) + (count(3)['3'] ?? 0);
const finalSuccess = prefixFinalSuccess * suffixPairSuccess;
const suffixAltCosts = {
  attackSpeed: price('alt').divine / shares.attackSpeed,
  criticalMultiplier: price('alt').divine / shares.criticalMultiplier,
};
const cleanRareSuffixDonorCost = alterationCost => 2 * alterationCost
  + 2 * (price('regal').divine + price('annul').divine) + price('scour').divine;
const suffixDonorPreparation = {
  attackSpeed: cleanRareSuffixDonorCost(suffixAltCosts.attackSpeed),
  criticalMultiplier: cleanRareSuffixDonorCost(suffixAltCosts.criticalMultiplier),
};
const averageReplacementSuffixCost = (suffixDonorPreparation.attackSpeed
  + suffixDonorPreparation.criticalMultiplier) / 2;
const expectedSuffixPairAttempts = 1 / suffixPairSuccess;
const suffixPairForFracturedBases = fractureCost => ({
  successProbabilityPerBrinePaddedRecombination: suffixPairSuccess,
  expectedRecombinationAttempts: expectedSuffixPairAttempts,
  expectedFracturedBases: 2 + expectedSuffixPairAttempts - 1,
  expectedBrineApplications: 2 * expectedSuffixPairAttempts,
  expectedCostDivine: (2 + expectedSuffixPairAttempts - 1) * fractureCost
    + 2 * brineCost * expectedSuffixPairAttempts
    + recombinationAttemptCost.divine * expectedSuffixPairAttempts
    + suffixDonorPreparation.attackSpeed + suffixDonorPreparation.criticalMultiplier
    + (expectedSuffixPairAttempts - 1) * averageReplacementSuffixCost,
  donorPreparation: suffixDonorPreparation,
  donorPreparationPolicy: 'Alteration-roll the suffix on a fractured magic bow, Regal, then Annul the added modifier. On a 50% miss, scour back to the fracture and repeat; a successful Annul leaves a sparse rare with room for Brinehook.',
});

const scenarios = fractureScenarios.map(fracture => {
  const prefixPieceCost = fracture.expectedCostDivine + prefixPiecePreparation.expectedCostDivine;
  const suffixPiece = suffixPairForFracturedBases(fracture.expectedCostDivine);
  const prefixSuccessSuffixFailure = prefixFinalSuccess * (1 - suffixPairSuccess);
  const prefixFailureSuffixSuccess = (1 - prefixFinalSuccess) * suffixPairSuccess;
  const bothFailure = (1 - prefixFinalSuccess) * (1 - suffixPairSuccess);
  const cleanedPrefixSalvage = 0.5 * prefixPieceCost + 0.5 * fracture.expectedCostDivine
    - price('annul').divine - 0.5 * price('scour').divine;
  const salvage = prefixSuccessSuffixFailure * Math.max(fracture.expectedCostDivine, cleanedPrefixSalvage)
    + prefixFailureSuffixSuccess * suffixPiece.expectedCostDivine
    + bothFailure * fracture.expectedCostDivine;
  const assembly = restartWithSalvage({
    attemptInputCost: prefixPieceCost + suffixPiece.expectedCostDivine,
    attemptActionCost: 2 * brineCost + recombinationAttemptCost.divine,
    successProbability: finalSuccess,
    unconditionalSalvageValue: salvage,
  });
  const finishing = 1 + price('exalted').divine + 4 / prices.chaosPerDivine + price('scour').divine;
  return {
    fracturePreviewModel: fracture.previewModel,
    targetFracture: fracture,
    prefixPieceCostDivine: prefixPieceCost,
    suffixPiece,
    finalAssembly: {
      prefixSuccess: prefixFinalSuccess,
      suffixSuccess: suffixPairSuccess,
      combinedSuccess: finalSuccess,
      expectedRecombinationAttempts: 1 / finalSuccess,
      brineApplicationsPerAttempt: 2,
      recombinationAttemptCost,
      unconditionalSalvageValueDivine: salvage,
      expectedCostThroughTwoPrefixTwoSuffixDivine: assembly,
    },
    finishingCostDivine: finishing,
    conditionalExpectedTotalDivine: assembly + finishing,
    belowFiveDivine: assembly + finishing < request.costObjective.comparisonPriceDivine,
  };
});

const output = {
  schemaVersion: 1,
  target: 'miracle-stinger',
  inputs,
  gameVersion: repoe.gameVersion,
  acquisitionMode: request.acquisition.mode,
  targetResolution: {
    officialTradeFracture: tradeEvidence.match.fracturedMod,
    requestedModIds: Object.values(ids),
    emptyPoolWeights: { prefix: prefixWeight, suffix: suffixWeight },
    shares,
    exactDreadOutput: target(ids.bowGems),
    nonAttackPrefixesAfterTargetGroups: prefixPool.filter(row => !(row.implicit_tags ?? []).includes('attack'))
      .map(row => ({ modId: row.modId, weight: row.adjustedWeight })),
  },
  allflameCosts: {
    item: repoe.base.name,
    itemLevel: request.referenceItemLevel,
    classFactor: classRule,
    levelFactor,
    fracturedFossil: { outcomes: resonatorBracket.outcomes, sulphur: fracturedFossilSulphur,
      currencyCostDivine: fractureActionCost },
    brinehook: { outcomes: brineBracket.outcomes, sulphur: brineSulphur, currencyCostDivine: brineCost },
  },
  recombinationAttemptCost,
  fracturePreparation: {
    probabilityPerAlteration: fractureTargetPerAlteration,
    expectedAlterations: 1 / fractureTargetPerAlteration,
    candidateCostDivine: candidateCost,
    fourEligibleExplicitModifiers: true,
    previewSensitivity: fractureScenarios,
  },
  prefixPiecePreparation,
  route: {
    name: 'double-fracture Brinehook suffix pair, then force +1 Gems',
    steps: [
      'Self-create target-fractured T2 elemental-damage Thicket Bows with four-mod Fractured Fossil candidates.',
      'On one fractured bow, use Deafening Essence of Dread and ordinary annuls to isolate fractured elemental damage plus +2 Bow Gems.',
      'On two more fractured bows, Alteration-roll T1 attack speed and T4 critical multiplier separately.',
      'Add Brinehook Aspect to both suffix donors and use Unpredictable Recombination; recycle the retained one-suffix fracture on a miss.',
      'Add Brinehook Aspect to the clean +2 prefix piece and the fractured two-suffix piece, then Unpredictable Recombine.',
      'At fractured elemental damage, +2 Bow Gems, attack speed and critical multiplier with one prefix and suffix open, craft Cannot roll Attack Modifiers, Exalt to force +1 Socketed Gems, then replace the metamod with the requested minion speed craft.',
    ],
    conditionalScenarios: scenarios,
    fractureInheritanceEvidence: fractureRecombination,
  },
  rejectedRoutes: [
    'Direct Essence of Dread rolling must hit both requested suffixes together and is many times over the listing price.',
    'Allflame Fracturing Orb costs more than five Divines per attempt before preparing the item.',
    'Harvest add Critical requires a high-value lifeforce craft and does not cheaply preserve both requested suffixes.',
    'Adding +1 Socketed Gems before the final recombination lowers the modeled final prefix-retention rate.',
  ],
  conclusion: 'The recombination policy is the best supported self-crafting route screened here, but its conditional expected currency cost exceeds the five-Divine listing after including the user-valued dust cost. The budget requirement is not met.',
  limitations: [
    'The recombination count kernel is a rounded 3.25 community table carried forward by the supplied 3.26 guide and is not independently validated for 3.29.',
    'Brinehook non-transfer and 90% suffix retention are current practitioner reports, not official probability data.',
    'The essence side-count calculation models sequential selection from patch-matched RePoE weights after group blocking; the generator order is a community-model inference.',
    'The Fractured Fossil sensitivity keeps both distinct-without-replacement and independent-with-replacement preview interpretations because duplicate-preview behavior was not established.',
    'Every modeled recombination includes the user-supplied 30-Chaos valuation for 180,000 Thaumaturgic Dust. Each also records 10,000 Gold as a non-trade resource excluded from Divine totals.',
    'Self-obtained Thicket Bow time, bench recipe unlocks, quality, and optional Intangibility cleanup remain non-priced requirements.',
    'The restart calculation credits only explicitly described salvage states; useful intermediate outcomes can lower actual spend, while adverse identity selection or version changes can raise it.',
    'poe.ninja values are exchange estimates rather than guaranteed bulk fills.',
  ],
};
await writeFile(resolve(root, 'requests/miracle-stinger-analysis.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({
  target: output.target,
  fractureCostRange: scenarios.map(row => row.targetFracture.expectedCostDivine),
  conditionalExpectedTotalRange: scenarios.map(row => row.conditionalExpectedTotalDivine),
  finalRecombinationSuccess: finalSuccess,
  underFiveDivine: scenarios.some(row => row.belowFiveDivine),
}, null, 2));
