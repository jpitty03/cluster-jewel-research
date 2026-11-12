import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from './lib/poedb-wand-references.mjs';

const references = resolve(dirname(fileURLToPath(import.meta.url)), '../docs/crafting-engine/references');
const snapshot = 'craftofexile-model-2026-09-06';
const raw = resolve(references, 'raw/craftofexile', snapshot.replace(/^craftofexile-/, ''));
const output = resolve(references, 'snapshots', snapshot);
await mkdir(raw, { recursive: true });
await mkdir(output, { recursive: true });
const snapshotManifestPath = resolve(output, 'manifest.json');
let cachedSources = [];
try {
  cachedSources = JSON.parse(await readFile(snapshotManifestPath, 'utf8')).sources ?? [];
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const sourceCache = new Map(cachedSources.map(source => [source.filename, source]));
const usedSources = new Map();
async function get(url, filename) {
  const path = resolve(raw, filename);
  try {
    const bytes = await readFile(path);
    const source = sourceCache.get(filename);
    if (!source) throw Object.assign(new Error(`Missing cache provenance: ${filename}`), { code: 'ENOENT' });
    if (source.url !== url || source.sha256 !== digest(bytes)) throw new Error(`Cache mismatch: ${filename}`);
    usedSources.set(filename, source);
    return bytes;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (process.argv.includes('--offline')) throw new Error(`Offline cache miss: ${filename}`);
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'WandCraftingResearch/1.0' } });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
  usedSources.set(filename, { filename, url, fetchedAt: new Date().toISOString(), sha256: digest(bytes),
    contentType: response.headers.get('content-type') });
  return bytes;
}
const homeBytes = await get('https://www.craftofexile.com/', 'index.html');
const home = homeBytes.toString('utf8');
const packagePath = home.match(/<script[^>]+src=["'](packages\/package\.js\?v=\d+)/)?.[1];
if (!packagePath) throw new Error('Craft of Exile package URL missing');
const packageBytes = await get(`https://www.craftofexile.com/${packagePath}`, 'package.js');
const code = packageBytes.toString('utf8');
const match = code.match(/var numOfAffixes=(\{.*?\});function poec_formatFixedSimNum/);
if (!match) throw new Error('numOfAffixes table missing');
const table = Function(`"use strict"; return (${match[1]});`)();
if (table['1']?.['1']?.e !== 0.5 || table['1']?.['2']?.s !== 0.5) throw new Error('Unexpected magic affix distribution');
const model = { schemaVersion: 1, snapshotId: snapshot, evidenceStatus: 'community-simulator-implementation',
  sourceUrl: `https://www.craftofexile.com/${packagePath}`,
  interpretation: 'For ordinary equipment with one prefix and one suffix capacity, maxnumaf=1. The saved simulator table chooses one affix on [0,0.5] and two on [0.5,1].',
  magicAffixCountProbability: { '1': 0.5, '2': 0.5 }, rawTable: table,
  limitations: ['This records Craft of Exile simulator behavior, not an official GGG probability statement.',
    'Special magic bases with nonstandard capacities are handled separately by that simulator and are outside this wand request.'] };
await writeFile(resolve(output, 'magic-affix-counts.json'), JSON.stringify(model, null, 2) + '\n');

const betaHomeBytes = await get('https://beta.craftofexile.com/', 'beta-index.html');
const betaHome = betaHomeBytes.toString('utf8');
const betaPackagePath = betaHome.match(/<script[^>]+src=["'](packages\/files\/package_poe1\.js\?v=\d+)/)?.[1];
const betaDataPath = betaHome.match(/<script[^>]+src=["'](json\/poe1\/[^"']+\/data\.json\?v=\d+)/)?.[1];
if (!betaPackagePath || !betaDataPath) throw new Error('Craft of Exile beta source URLs missing');
const betaPackageBytes = await get(`https://beta.craftofexile.com/${betaPackagePath}`, 'beta-package-poe1.js');
const betaDataBytes = await get(`https://beta.craftofexile.com/${betaDataPath}`, 'beta-data.json');
const betaCode = betaPackageBytes.toString('utf8');
if (!betaCode.includes('getSulphurCost') || !betaCode.includes('ducatBrinehook')) throw new Error('Allflame implementation missing');
const betaData = JSON.parse(betaDataBytes.toString('utf8').replace(/^coedata=/, '').replace(/;\s*$/, ''));
const kinetic = betaData.items.entries.find(item => item.key === 'Metadata/Items/Weapons/OneHandWeapons/Wands/WandK3');
const kineticClass = betaData.classes.entries.find(itemClass => itemClass.id === kinetic?.class);
const brinehookAction = betaData.methods.crafting['10'].elements.find(action => action.handler === 'ducat_brinehook');
const brinehookBracket = betaData.methods.allflame.currencies[String(brinehookAction?.item)]?.at(-1);
const temperingAction = betaData.methods.crafting['0'].elements.find(action => action.handler === 'tempering');
const temperingBracket = betaData.methods.allflame.currencies[String(temperingAction?.item)]?.at(-1);
const classRule = betaData.methods.allflame.classes[String(kineticClass?.class)];
const levelFactor = betaData.methods.allflame.levels['85'];
if (!kinetic || !kineticClass || !brinehookAction || !brinehookBracket || !temperingAction || !temperingBracket
  || !classRule || levelFactor == null) {
  throw new Error('Incomplete Kinetic Wand Brinehook cost inputs');
}
const baseCost = brinehookBracket.cost * classRule.factor;
const sulphurCost = Math.round(classRule.scaling === false ? baseCost : baseCost + baseCost * levelFactor);
if (sulphurCost !== 9760) throw new Error(`Unexpected ilvl 85 Kinetic Brinehook cost: ${sulphurCost}`);
const temperingBaseCost = temperingBracket.cost * classRule.factor;
const temperingSulphurCost = Math.round(classRule.scaling === false ? temperingBaseCost
  : temperingBaseCost + temperingBaseCost * levelFactor);
const heistEnchantments = betaData.mods.entries.filter(mod => mod.key.startsWith('WeaponEnchantmentHeist')
  && betaData.classmods[String(kinetic.class)]?.[mod.id] > 0);
const acceptedEnchantIds = [
  'WeaponEnchantmentHeistFireEffect1',
  'WeaponEnchantmentHeistFireEffectNoRedSockets1',
  'WeaponEnchantmentHeistFireEffectNoBlueSockets1',
  'WeaponEnchantmentHeistFireEffectNoGreenSockets1_',
  'WeaponEnchantmentHeistFireEffectWhiteSockets1',
];
const enchantWeights = heistEnchantments.map(mod => betaData.classmods[String(kinetic.class)][mod.id]);
if (temperingSulphurCost !== 12200 || heistEnchantments.length !== 181 || enchantWeights.some(weight => weight !== 1)
  || acceptedEnchantIds.some(key => !heistEnchantments.some(mod => mod.key === key))) {
  throw new Error('Unexpected Kinetic Wand Tempering model');
}
const betaPatch = betaHome.match(/"patch":"([^"]+)"/)?.[1] ?? null;
const allflameModel = {
  schemaVersion: 1,
  snapshotId: snapshot,
  evidenceStatus: 'community-simulator-implementation-and-data',
  sourcePatch: betaPatch,
  item: { name: kinetic.wiki, metadataId: kinetic.key, itemLevel: 85, classId: kinetic.class, allflameClassId: kineticClass.class },
  brinehook: {
    itemId: brinehookAction.item,
    handler: brinehookAction.handler,
    constraints: brinehookAction.constraints,
    bracket: brinehookBracket,
    classRule,
    itemLevelFactor: levelFactor,
    sulphurCost,
    formula: 'round(bracket.cost * class.factor * (1 + itemLevelFactor)) when class scaling is enabled',
  },
  tempering: {
    itemId: temperingAction.item,
    handler: temperingAction.handler,
    bracket: temperingBracket,
    classRule,
    itemLevelFactor: levelFactor,
    sulphurCost: temperingSulphurCost,
    eligibleEnchantments: heistEnchantments.length,
    weightPerEnchantment: 1,
    acceptedEnchantIds,
    acceptedBecause: 'Each grants exactly 8% increased Explicit Fire Modifier magnitudes; socket and socket-colour effects are ignored by saved user preference.',
    ordinarySuccessProbability: acceptedEnchantIds.length / heistEnchantments.length,
    formula: 'round(bracket.cost * class.factor * (1 + itemLevelFactor)) when class scaling is enabled',
  },
  limitations: [
    'This records the current Craft of Exile beta implementation and data, not an official GGG cost table.',
    'The cost is specific to an ilvl 85 Kinetic Wand and should be recalculated for a different class or item level.',
  ],
};
await writeFile(resolve(output, 'allflame-kinetic-wand.json'), JSON.stringify(allflameModel, null, 2) + '\n');

const rawFiles = ['index.html', 'package.js', 'beta-index.html', 'beta-package-poe1.js', 'beta-data.json'];
const sources = rawFiles.map(filename => ({ filename, ...usedSources.get(filename) }));
await writeFile(snapshotManifestPath, JSON.stringify({ schemaVersion: 1, snapshotId: snapshot, sources,
  outputs: [
    { path: `snapshots/${snapshot}/magic-affix-counts.json`, sha256: digest(await readFile(resolve(output, 'magic-affix-counts.json'))) },
    { path: `snapshots/${snapshot}/allflame-kinetic-wand.json`, sha256: digest(await readFile(resolve(output, 'allflame-kinetic-wand.json'))) },
  ] }, null, 2) + '\n');
console.log(JSON.stringify({ snapshot, packagePath, magicAffixCountProbability: model.magicAffixCountProbability,
  betaPatch, kineticBrinehookSulphurCost: sulphurCost, kineticTemperingSulphurCost: temperingSulphurCost,
  acceptedTemperingOutcomes: acceptedEnchantIds.length, eligibleTemperingOutcomes: heistEnchantments.length }));
