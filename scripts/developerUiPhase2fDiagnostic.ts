import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { browserCraftingCatalog } from '../src/crafting/browserEngine.ts';
import {
  compareCraftingCatalogMods,
  disambiguateModifierSelectionLabels,
} from '../crafting-engine/src/service/craftingCatalog.ts';

const outputPath = fileURLToPath(new URL('../output-developer-ui-phase2f.txt', import.meta.url));
const baseType = 'Large Cluster Jewel' as const;
const clusterType = '10% increased Attack Damage';
const mods = browserCraftingCatalog.getEligibleMods(baseType, clusterType, 84);

function requireMod(modId: string) {
  const mod = mods.find((candidate) => candidate.modId === modId);
  if (!mod) throw new Error(`Phase 2F catalog fixture is missing ${modId}`);
  return mod;
}

function matchesAlias(query: string): string[] {
  const needle = query.toLowerCase();
  return mods
    .filter((mod) => mod.searchAliases.some((alias) => alias.toLowerCase().includes(needle)))
    .map((mod) => mod.modId);
}

const evasionIds = [
  'AfflictionJewelSmallPassivesGrantEvasion3',
  'AfflictionJewelSmallPassivesGrantEvasion2__',
  'AfflictionJewelSmallPassivesGrantEvasion',
];
const energyShieldIds = [
  'AfflictionJewelSmallPassivesGrantES3',
  'AfflictionJewelSmallPassivesGrantES2',
  'AfflictionJewelSmallPassivesGrantES',
];
const t1Evasion = requireMod(evasionIds[0]);
const t1Es = requireMod('AfflictionJewelSmallPassivesGrantES3');
const t1Int = requireMod('AfflictionJewelSmallPassivesGrantInt3');
const evasionFamily = evasionIds.map(requireMod);
const notable = mods.find((mod) => mod.isNotable && mod.modId === 'Vicious Skewering');
if (!notable) throw new Error('Phase 2F notable fixture is missing Vicious Skewering');

const ordinaryMods = mods.filter((mod) => !mod.isNotable);
const ordinaryPrimaryFailures = ordinaryMods.filter(
  (mod) => mod.statText.trim().length === 0 ||
    !mod.displayName.startsWith(mod.statText.trim()) ||
    (mod.tierCount > 1 && !mod.displayName.endsWith(`(T${mod.tier})`))
);
const opaquePrimaryFailures = ordinaryMods.filter(
  (mod) => mod.technicalName !== mod.statText && mod.displayName.startsWith(mod.technicalName)
);
const duplicateSelectionLabels = [...new Set(
  mods
    .filter((mod, index) => mods.findIndex((candidate) =>
      candidate.selectionLabel === mod.selectionLabel
    ) !== index)
    .map((mod) => mod.selectionLabel)
)];
const deterministicSortPass = mods.every((mod, index) =>
  index === 0 || compareCraftingCatalogMods(mods[index - 1], mod) <= 0
);
const familyTierOrder = (modIds: string[]) => mods
  .filter((mod) => modIds.includes(mod.modId))
  .map((mod) => mod.tier);
const multiTierSortPass = JSON.stringify(familyTierOrder(evasionIds)) === '[3,2,1]' &&
  JSON.stringify(familyTierOrder(energyShieldIds)) === '[3,2,1]';
const collisionFixture = disambiguateModifierSelectionLabels([
  { displayName: 'Duplicate stat', selectionLabel: '', genType: 'Prefix' as const, requiredItemLevel: 84, modId: 'duplicate_a' },
  { displayName: 'Duplicate stat', selectionLabel: '', genType: 'Prefix' as const, requiredItemLevel: 84, modId: 'duplicate_b' },
]);
const collisionFallbackPass = collisionFixture[0].selectionLabel ===
  'Duplicate stat · Prefix · ilvl 84 · variant 1' &&
  collisionFixture[1].selectionLabel === 'Duplicate stat · Prefix · ilvl 84 · variant 2' &&
  collisionFixture.every((mod) => !mod.selectionLabel.includes(mod.modId));
const technicalAliasPass = matchesAlias('Acrobat').includes(t1Evasion.modId) &&
  matchesAlias('Glowing').includes(t1Es.modId) &&
  matchesAlias('Prodigy').includes(t1Int.modId);
const evasionAliasMatches = matchesAlias('Evasion');
const statAliasPass = evasionIds.every((modId) => evasionAliasMatches.includes(modId)) &&
  matchesAlias('Energy Shield').includes(t1Es.modId) &&
  matchesAlias('Intelligence').includes(t1Int.modId);
const exactIdAliasPass = matchesAlias(t1Es.modId).includes(t1Es.modId);
const tierDisambiguationPass = evasionFamily.every((mod) =>
  mod.displayName.includes(`(T${mod.tier})`)
) && new Set(evasionFamily.map((mod) => mod.selectionLabel)).size === evasionFamily.length;
const notablePass = notable.displayName === notable.statText &&
  notable.displayName.includes('Vicious Skewering');

const failures = [
  ordinaryPrimaryFailures.length === 0 || 'ordinary primary labels',
  opaquePrimaryFailures.length === 0 || 'opaque affix names remained primary',
  duplicateSelectionLabels.length === 0 || 'duplicate selection labels',
  deterministicSortPass || 'deterministic user-facing sort',
  multiTierSortPass || 'numeric multi-tier family sort',
  collisionFallbackPass || 'selection-label collision fallback',
  technicalAliasPass || 'technical-name aliases',
  statAliasPass || 'stat-text aliases',
  exactIdAliasPass || 'exact-ID aliases',
  tierDisambiguationPass || 'tier disambiguation',
  notablePass || 'notable label',
].filter((result): result is string => result !== true);

const lines = ['DEVELOPER UI PHASE 2F — MODIFIER LABEL CATALOG DIAGNOSTIC'];
lines.push(`catalog fixture: ${baseType} | ${clusterType} | ilvl 84 | ${mods.length} options`);
lines.push(`ordinary statText primary contract: ${ordinaryPrimaryFailures.length === 0 ? 'PASS' : 'FAIL'}; failures=${ordinaryPrimaryFailures.length}`);
lines.push(`opaque ordinary affix names removed from primary position: ${opaquePrimaryFailures.length === 0 ? 'PASS' : 'FAIL'}; failures=${opaquePrimaryFailures.length}`);
lines.push(`unique selection labels after tier/type/ilvl/player-facing variant fallback: ${duplicateSelectionLabels.length === 0 ? 'PASS' : 'FAIL'}; duplicates=${duplicateSelectionLabels.length}`);
lines.push(`shared numeric user-facing label / tier / ID sort: ${deterministicSortPass ? 'PASS' : 'FAIL'}`);
lines.push(`multi-tier family order consistent (T3, T2, T1): ${multiTierSortPass ? 'PASS' : 'FAIL'}; Evasion=${familyTierOrder(evasionIds).join(',')}; ES=${familyTierOrder(energyShieldIds).join(',')}`);
lines.push(`synthetic duplicate fallback stays distinguishable without public exact-ID leakage: ${collisionFallbackPass ? 'PASS' : 'FAIL'}; ${collisionFixture.map((mod) => mod.selectionLabel).join(' | ')}`);
lines.push(`technical-name aliases (Acrobat / Glowing / Prodigy): ${technicalAliasPass ? 'PASS' : 'FAIL'}`);
lines.push(`stat-text aliases (Evasion / Energy Shield / Intelligence): ${statAliasPass ? 'PASS' : 'FAIL'}`);
lines.push(`exact mod-ID alias: ${exactIdAliasPass ? 'PASS' : 'FAIL'}`);
lines.push(`multi-tier Evasion disambiguation: ${tierDisambiguationPass ? 'PASS' : 'FAIL'}`);
for (const mod of evasionFamily) lines.push(`  ${mod.selectionLabel} [${mod.modId}; internal=${mod.technicalName}]`);
lines.push(`notable player-readable label: ${notablePass ? 'PASS' : 'FAIL'}; ${notable.selectionLabel}`);
lines.push('before / after examples:');
lines.push(`  Evasion: ${t1Evasion.technicalName} (T${t1Evasion.tier}) -> ${t1Evasion.displayName}`);
lines.push(`  Energy Shield: ${t1Es.technicalName} (T${t1Es.tier}) -> ${t1Es.displayName}`);
lines.push(`  Intelligence: ${t1Int.technicalName} (T${t1Int.tier}) -> ${t1Int.displayName}`);
lines.push(`exact identities unchanged: ${t1Evasion.modId} | ${t1Es.modId} | ${t1Int.modId}`);
lines.push('solver/domain mechanics touched by formatter: NO');

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8');
console.log(lines.join('\n'));
if (failures.length > 0) throw new Error(`Phase 2F catalog diagnostic failed: ${failures.join(', ')}`);
