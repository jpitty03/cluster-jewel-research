import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './lib/poedb-wand-references.mjs';
import { targetSideShares, expectedMagicRollsToCollect, noSalvageTwoByTwoRoute,
  independentAffixCountSuccess, optimalAllflameEnchantCost } from './lib/wand-route-analysis.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/crafting-engine/references');
const files = {
  request: 'requests/torment-spire.json',
  repoe: 'snapshots/repoe-wands-2026-09-06/kinetic-wand.json',
  guide: 'requests/recombination-guide-baseline.json',
  brinehook: 'requests/brinehook-recombination-evidence.json',
  recombinationCosts: 'requests/recombination-cost-policy.json',
  magicCounts: 'snapshots/craftofexile-model-2026-09-06/magic-affix-counts.json',
  allflameModel: 'snapshots/craftofexile-model-2026-09-06/allflame-kinetic-wand.json',
};
const inputs = [];
async function load(key) {
  const bytes = await readFile(resolve(root, files[key]));
  inputs.push({ role: key, path: files[key], sha256: digest(bytes) });
  return JSON.parse(bytes);
}
const request = await load('request');
files.prices = `economies/${request.costObjective.priceSnapshot}/prices.json`;
const repoe = await load('repoe');
const prices = await load('prices');
const guide = await load('guide');
const brinehook = await load('brinehook');
const recombinationCosts = await load('recombinationCosts');
const magicCounts = await load('magicCounts');
const allflameModel = await load('allflameModel');
if (repoe.gameVersion !== '3.29.3.3' || prices.league !== request.league
  || recombinationCosts.league !== request.league
  || recombinationCosts.priceSnapshot !== request.costObjective.priceSnapshot) throw new Error('Snapshot context mismatch');
const recombinationAttemptCost = {
  chaos: recombinationCosts.planningDefault.tradeCostChaos,
  divine: recombinationCosts.planningDefault.tradeCostChaos / prices.chaosPerDivine,
  gold: recombinationCosts.planningDefault.goldPerAttempt,
  thaumaturgicDust: recombinationCosts.sourceObservation.thaumaturgicDust,
  policyId: recombinationCosts.policyId,
};
const targetIds = Object.values(request.resolution.canonicalModIds);
const shares = targetSideShares(repoe.ordinary, targetIds);
const alteration = prices.prices.find(price => price.type === 'Currency' && price.id === 'alt');
if (!alteration) throw new Error('Alteration price missing');
const sulphur = prices.prices.find(price => price.type === 'Currency' && price.id === 'dead-mans-sulphur');
const brinehookDucat = prices.prices.find(price => price.type === 'Ducat' && price.id === 'brinehooks-ducat');
const temperingOrb = prices.prices.find(price => price.type === 'Currency' && price.id === 'tempering-orb');
if (!sulphur || !brinehookDucat || !temperingOrb) throw new Error('Allflame finishing inputs missing');
const guideRate = (left, right, output) => guide.targetOutcomes.find(row => row.inputs.includes(left)
  && row.inputs.includes(right) && row.output === output)?.approximateProbability;
const rates = { pair: guideRate('1P', '1S', '1P/1S'), intermediate: guideRate('1P/1S', '1P/1S', '2P/2S'),
  final: guideRate('2P/2S', '2P/2S', '3P/3S') };
if (Object.values(rates).some(rate => !(rate > 0))) throw new Error('Guide rates missing');
const leadingRates = {
  fromThreePrefixTwoSuffixAndOnePrefixThreeSuffix: {
    final: guideRate('3P/2S', '1P/3S', '3P/3S'),
    recyclableTwoPrefixThreeSuffix: guideRate('3P/2S', '1P/3S', '2P/3S'),
  },
  fromThreePrefixTwoSuffixAndTwoPrefixThreeSuffix: {
    final: guideRate('3P/2S', '2P/3S', '3P/3S'),
  },
};
if (Object.values(leadingRates).flatMap(Object.values).some(rate => !(rate > 0))) throw new Error('Leading guide rates missing');
const brinehookApplication = {
  deadMansSulphur: allflameModel.brinehook.sulphurCost,
  ducats: 1,
  chaos: allflameModel.brinehook.sulphurCost * sulphur.chaos + brinehookDucat.chaos,
  divine: allflameModel.brinehook.sulphurCost * sulphur.divine + brinehookDucat.divine,
};
const countKernel = guide.affixCountKernel;
const modeledBrinehookTopologies = {
  makeThreePrefixTwoSuffixFromTwoTwoPrefixOneSuffix: {
    inputsBeforePadding: ['2P/1S', '2P/1S'], brinehookApplications: 2,
    ...independentAffixCountSuccess(countKernel, {
      totalInputPrefixes: 4, requiredPrefixes: 3, totalInputSuffixes: 4, requiredSuffixes: 2,
    }),
  },
  makeTwoPrefixThreeSuffixFromTwoTwoPrefixTwoSuffix: {
    inputsBeforePadding: ['2P/2S', '2P/2S'], brinehookApplications: 2,
    ...independentAffixCountSuccess(countKernel, {
      totalInputPrefixes: 4, requiredPrefixes: 2, totalInputSuffixes: 6, requiredSuffixes: 3,
    }),
  },
  directSixModFromTwoTwoPrefixTwoSuffix: {
    inputsBeforePadding: ['2P/2S', '2P/2S'], brinehookApplications: 2,
    ...independentAffixCountSuccess(countKernel, {
      totalInputPrefixes: 4, requiredPrefixes: 3, totalInputSuffixes: 6, requiredSuffixes: 3,
    }),
  },
  finalFromThreePrefixTwoSuffixAndOnePrefixThreeSuffix: {
    inputsBeforePadding: ['3P/2S', '1P/3S'], brinehookApplications: 1,
    ...independentAffixCountSuccess(countKernel, {
      totalInputPrefixes: 4, requiredPrefixes: 3, totalInputSuffixes: 6, requiredSuffixes: 3,
    }),
  },
  finalFromThreePrefixTwoSuffixAndTwoPrefixThreeSuffix: {
    inputsBeforePadding: ['3P/2S', '2P/3S'], brinehookApplications: 1,
    ...independentAffixCountSuccess(countKernel, {
      totalInputPrefixes: 5, requiredPrefixes: 3, totalInputSuffixes: 6, requiredSuffixes: 3,
    }),
  },
};
const tempering = allflameModel.tempering;
const enchantFinishing = {
  eligibleOutcomes: tempering.eligibleEnchantments,
  acceptedOutcomes: tempering.acceptedEnchantIds.length,
  acceptedEnchantIds: tempering.acceptedEnchantIds,
  ordinaryAttempt: {
    temperingOrbCostDivine: temperingOrb.divine,
    successProbability: tempering.ordinarySuccessProbability,
    expectedCostDivine: temperingOrb.divine / tempering.ordinarySuccessProbability,
  },
  allflameAttempt: {
    previewCount: tempering.bracket.outcomes,
    sulphur: tempering.sulphurCost,
    sulphurCostDivine: tempering.sulphurCost * sulphur.divine,
    addedIntangibility: tempering.bracket.intangibility,
  },
  optimalPolicyByStartingIntangibility: [0, 8, 16].map(startIntangibility => optimalAllflameEnchantCost({
    totalOutcomes: tempering.eligibleEnchantments,
    acceptedOutcomes: tempering.acceptedEnchantIds.length,
    previewCount: tempering.bracket.outcomes,
    addedIntangibility: tempering.bracket.intangibility,
    normalAttemptCost: temperingOrb.divine,
    sulphurCost: tempering.sulphurCost * sulphur.divine,
    startIntangibility,
  })),
  assumptions: [
    'All 181 saved Kinetic Wand enchantments have equal Craft of Exile weight 1.',
    'The five 8% fire outcomes are accepted because socket effects are ignored by user preference.',
    'At Intangibility I, Allflame produces one preview with probability I/100 and three otherwise.',
    'Added Intangibility is modeled as a discrete uniform integer from 5 through 8.',
    'The policy switches to ordinary Tempering when another Allflame attempt has higher expected currency cost.',
  ],
};

const selectedSingleAffixProbability = magicCounts.magicAffixCountProbability['1'];
const singleAffixOnlyIsolation = {
  policy: 'Keep a target only when the Alteration produced exactly one affix; ignore all two-affix outcomes.',
  oneAffixRollProbability: selectedSingleAffixProbability,
  expectedAlterationsForOneOfEachTarget: expectedMagicRollsToCollect(shares.prefix.map(row => row.sideShare),
    shares.suffix.map(row => row.sideShare), 1) / selectedSingleAffixProbability,
};
singleAffixOnlyIsolation.expectedCurrencyDivineForOneOfEachTarget = singleAffixOnlyIsolation.expectedAlterationsForOneOfEachTarget
  * alteration.divine;
const scenarios = [1, selectedSingleAffixProbability, 0].map(singleAffixProbability => {
  const sideMarginal = 1 - singleAffixProbability / 2;
  const targetHits = [...shares.prefix, ...shares.suffix].map(target => ({ ...target,
    probabilityPerAlteration: sideMarginal * target.sideShare,
    expectedAlterations: 1 / (sideMarginal * target.sideShare),
    expectedCurrencyCostDivine: alteration.divine / (sideMarginal * target.sideShare),
  }));
  const prefixCosts = targetHits.filter(target => shares.prefix.some(row => row.modId === target.modId))
    .sort((a, b) => a.expectedCurrencyCostDivine - b.expectedCurrencyCostDivine);
  const suffixCosts = targetHits.filter(target => shares.suffix.some(row => row.modId === target.modId))
    .sort((a, b) => a.expectedCurrencyCostDivine - b.expectedCurrencyCostDivine);
  const pairCosts = prefixCosts.map((prefix, index) => prefix.expectedCurrencyCostDivine + suffixCosts[index].expectedCurrencyCostDivine);
  const idealizedNoSalvageCurrency = noSalvageTwoByTwoRoute(pairCosts, rates.pair, rates.intermediate, rates.final,
    recombinationAttemptCost.divine);
  const directBrinehookRate = modeledBrinehookTopologies.directSixModFromTwoTwoPrefixTwoSuffix.combined;
  return { singleAffixProbability, sideMarginal,
    interpretation: singleAffixProbability === selectedSingleAffixProbability ? 'selected Craft of Exile community-simulator model' : 'sensitivity endpoint',
    targetHits,
    expectedAlterationsForOneOfEachTarget: expectedMagicRollsToCollect(shares.prefix.map(row => row.sideShare),
      shares.suffix.map(row => row.sideShare), singleAffixProbability),
    idealizedNoSalvageCurrency,
    idealizedNoSalvageBrinehookDirectDivine: (idealizedNoSalvageCurrency.twoPrefixTwoSuffix.reduce((sum, cost) => sum + cost, 0)
      + 2 * brinehookApplication.divine + recombinationAttemptCost.divine) / directBrinehookRate,
  };
});
for (const scenario of scenarios) scenario.expectedCurrencyDivineForOneOfEachTarget = scenario.expectedAlterationsForOneOfEachTarget * alteration.divine;
const baseConsumption = noSalvageTwoByTwoRoute([2, 2, 2], rates.pair, rates.intermediate, rates.final);
const middle = scenarios.find(scenario => scenario.singleAffixProbability === selectedSingleAffixProbability);
const output = {
  schemaVersion: 1, target: 'torment-spire', inputs, gameVersion: repoe.gameVersion,
  acquisitionMode: request.acquisition.mode, alterationPrice: alteration,
  emptyKineticPools: {
    prefixTotalWeight: repoe.ordinary.filter(mod => mod.generation_type === 'prefix').reduce((sum, mod) => sum + mod.adjustedWeight, 0),
    suffixTotalWeight: repoe.ordinary.filter(mod => mod.generation_type === 'suffix').reduce((sum, mod) => sum + mod.adjustedWeight, 0),
  },
  shares, magicRollModel: {
    definition: 'An Alteration produces either one affix (prefix/suffix equiprobable) or one prefix plus one suffix; selected affixes use empty-item side weights.',
    selectedSingleAffixProbability, evidenceStatus: magicCounts.evidenceStatus, scenarios,
    singleAffixOnlyIsolation,
  },
  guideRates: rates,
  leadingGuideTopologies: leadingRates,
  recombinationAttemptCost,
  brinehookEvidence: {
    leagueContext: brinehook.leagueContext,
    evidenceStatus: brinehook.evidenceStatus,
    reportedRates: brinehook.reportedRates,
    limitations: brinehook.limitations,
    applicationCost: brinehookApplication,
    modeledTopologies: modeledBrinehookTopologies,
    modelAssumptions: [
      'Each Brinehook Aspect adds one suffix to the input count and is ineligible for transfer, as reported by current practitioners.',
      'Prefix and suffix affix-count rolls use the saved published kernel independently.',
      'The desired-mod union contains the required three distinct prefixes and suffixes and no unwanted transferable modifier competes for selection.',
    ],
  },
  enchantFinishing,
  idealizedNoSalvageBaseConsumption: baseConsumption,
  conclusions: [
    'Raw Alteration cost for target hits is small relative to 300 divines; recombination attrition and isolation dominate this topology.',
    `A cleanup-free singleton policy that ignores every two-affix result needs about ${Math.round(singleAffixOnlyIsolation.expectedAlterationsForOneOfEachTarget).toLocaleString('en-US')} Alterations, or ${singleAffixOnlyIsolation.expectedCurrencyDivineForOneOfEachTarget.toFixed(2)} divines, for one of each target in expectation under the selected affix-count model.`,
    'The unpadded guide topology that discards every non-target recombination outcome exceeds 300 divines at every affix-count sensitivity point.',
    `The selected no-salvage topology costs ${middle.idealizedNoSalvageCurrency.finalExpectedCost.toFixed(2)} divines after charging every modeled recombination ${recombinationAttemptCost.chaos} Chaos; recycling remains necessary.`,
    'This does not reject recombination: the guide is explicitly designed around recycling useful partial outcomes, which requires a complete transition policy.',
    'The strongest recorded ordinary-mod final topology is 3P/2S plus 2P/3S at a rounded 32.5%; the guide gives 3P/2S plus 1P/3S a 17.7% final and a 33.6% recyclable 2P/3S outcome.',
    'Under the recorded Brinehook NNN claim and count kernel, padding both 2P/2S inputs raises their direct six-mod count chance from 9.6% to 22.32%; padding the open suffix on a 3P/2S input paired with 2P/3S raises the modeled final chance from 32.5% to 41.04%.',
    `The accepted enchant pool is 5 of 181 equal-weight outcomes. Ordinary Tempering costs ${enchantFinishing.ordinaryAttempt.expectedCostDivine.toFixed(2)} divines in expectation; the modeled switch policy costs ${enchantFinishing.optimalPolicyByStartingIntangibility[0].optimalExpectedCost.toFixed(2)} divines from 0% Intangibility or ${enchantFinishing.optimalPolicyByStartingIntangibility[2].optimalExpectedCost.toFixed(2)} from 16%.`,
  ],
  limitations: [
    'Target-hit costs accept a desired affix even when the Alteration also rolls an unwanted opposite-side affix; cleanup/isolation is not priced.',
    'The selected one-versus-two-affix probability records current Craft of Exile simulator behavior, not an official GGG statement; sensitivity endpoints are retained.',
    'The no-salvage estimate uses target-hit cost as if each hit were an isolated donor, then discards all non-target recombination outcomes. These opposing simplifications make it a diagnostic, not a total-cost bound.',
    'The guide rates are rounded community estimates based on its stated older probability-table assumption.',
    'Each modeled recombination includes the user-supplied 30-Chaos dust valuation. Its 10,000 Gold requirement is counted as a non-trade resource and excluded from Divine totals.',
    'Augmentation, cleanup, Kishara, base farming time, fractures and recycling are excluded from the no-salvage donor diagnostic.',
    'Brinehook modeled rates are conditional calculations from community evidence, not independently reproduced game measurements for this wand.',
    'The Craft of Exile beta cost is 9,760 Sulphur for an ilvl 85 Kinetic Wand; it is community simulator data rather than an official GGG table.',
    'The enchant policy inherits the saved Craft of Exile outcome weights and Intangibility behavior; it has not been reproduced in game.',
  ],
};
await writeFile(resolve(root, 'requests/torment-spire-recombination.json'), JSON.stringify(output, null, 2) + '\n');
console.log(JSON.stringify({ gameVersion: repoe.gameVersion, pools: output.emptyKineticPools,
  workingScenario: { alterationsForOneEach: middle.expectedAlterationsForOneOfEachTarget,
    currencyDivineForOneEach: middle.expectedCurrencyDivineForOneOfEachTarget,
    noSalvageFinalCurrencyDivine: middle.idealizedNoSalvageCurrency.finalExpectedCost,
    expectedRecombinationAttempts: middle.idealizedNoSalvageCurrency.finalExpectedRecombinationAttempts },
  noSalvageBaseCount: baseConsumption.finalExpectedInputCost }, null, 2));
