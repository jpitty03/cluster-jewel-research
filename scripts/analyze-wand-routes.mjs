import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './lib/poedb-wand-references.mjs';
import { elementalTierShare, repeatedAttemptBound } from './lib/wand-route-analysis.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/crafting-engine/references');
const request = JSON.parse(await readFile(resolve(root, 'requests/torment-spire.json'), 'utf8'));
const modifierSnapshot = request.resolution.modifierSnapshot;
const economySnapshot = request.costObjective.priceSnapshot;
if (!/^[a-z0-9-]+$/.test(modifierSnapshot) || typeof economySnapshot !== 'string' || !/^[a-z0-9-]+$/.test(economySnapshot)) throw new Error('Missing/invalid snapshot IDs');
const inputs = [{ path: 'requests/torment-spire.json', sha256: digest(await readFile(resolve(root, 'requests/torment-spire.json'))) }];
async function json(path) {
  const bytes = await readFile(resolve(root, path));
  inputs.push({ path, sha256: digest(bytes) });
  return JSON.parse(bytes);
}
const dataset = await json(`snapshots/${modifierSnapshot}/modifiers.json`);
const base = (await json(`snapshots/${modifierSnapshot}/base-types.json`)).bases.find(base => base.name === request.baseName);
const prices = await json(`economies/${economySnapshot}/prices.json`);
if (prices.league !== request.league) throw new Error('Economy league mismatch');
const groups = ['FireDamage', 'ColdDamage', 'LightningDamage'];
const families = groups.map(group => elementalTierShare(dataset.modifiers, group, base.datatableTags, request.referenceItemLevel));
const cost = (type, id) => {
  const price = prices.prices.find(price => price.type === type && price.id === id);
  if (!price) throw new Error(`Missing price ${type}/${id}`);
  return price.divine;
};
const policies = [
  { fracture: 'FireDamage', fossils: ['frigid-fossil', 'metallic-fossil'] },
  { fracture: 'ColdDamage', fossils: ['scorched-fossil', 'metallic-fossil'] },
].map(policy => {
  const probabilityUpperBound = families.filter(family => family.group !== policy.fracture)
    .reduce((probability, family) => probability * family.conditionalT1Probability, 1);
  const attemptCostDivine = policy.fossils.reduce((sum, fossil) => sum + cost('Fossil', fossil), cost('Resonator', 'potent-chaotic-resonator'));
  return { ...policy, attemptCostDivine, ...repeatedAttemptBound(probabilityUpperBound, attemptCostDivine, request.costObjective.comparisonPriceDivine) };
});
const report = {
  schemaVersion: 1, target: 'torment-spire', modifierSnapshot, economySnapshot, sourcePatch: dataset.sourcePatch,
  inputs, economySources: prices.sources, chaosPerDivine: prices.chaosPerDivine,
  status: 'two narrowly defined fossil policies screened; no complete cheapest policy validated',
  assumptions: [
    'Ordinary weighted generation on the saved Kinetic Wand base at the reference item level.',
    'One fixed T1 elemental fracture; only two prefix slots remain. Each attempt rerolls until both missing natural T1 prefixes appear together.',
    'Only the named two fossils and a two-socket resonator are used. Tag multipliers do not change relative tier weights inside either family.',
    'Optimistically assume the two desired families are always selected. Actual family/affix-count selection can only reduce success.',
    'No tier upgrades, Sanctified/Foulborn/Allflame offers, retained partial progress, or sales of failed items.',
    'Quote prices are held constant with unlimited supply; base, suffixes, enchant and time costs are excluded, making this a prefix-stage lower bound.',
    'Budget success bound spends the whole 300 Divine allowance on prefix attempts; this is not the full-item completion probability.',
  ],
  families, policies,
  missingForCompleteRanking: ['Self-crafted donor generation, isolation, base consumption and fracture costs', 'Version-validated recombination outcomes and recovery costs',
    'Allflame offer/cost distributions', 'Target enchant outcome weights or already-enchanted input price', 'Validated suffix finishing policies'],
};
await writeFile(resolve(root, 'requests/torment-spire-analysis.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ chaosPerDivine: report.chaosPerDivine, policies }, null, 2));
