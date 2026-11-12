import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modifierRanges, parseDetail, normalizeModifiers, buildGroupIndex, groupsConflict, parseWeaponEnchants, parseKineticBase } from '../lib/poedb-wand-references.mjs';

test('nested dash markup retains both endpoints, negative values and fixed rolls', () => {
  const parsed = modifierRanges("Adds <span class='mod-value'>(89<span class=\"ndash\">—</span>121)</span> to <span class='mod-value'>(180—210)</span><br><span class='mod-value'>(-5–-2)</span> and <span class='mod-value'>+4.5</span>");
  assert.deepEqual(parsed.map(({ min, max }) => [min, max]), [[89, 121], [180, 210], [-5, -2], [4.5, 4.5]]);
});

test('detail weights preserve first-match order and explicit zero; absent weights remain unknown', () => {
  const parsed = parseDetail("<table><tr><th>Spawn Tags<td><span>two_hand_weapon: 0</span><span>wand: 45</span><span>default: 0</span><tr><th>Stats<td><li>local maximum added fire damage <span>180 — 210</span> Local</li></table>");
  assert.deepEqual(parsed.spawnWeights, [{ tag: 'two_hand_weapon', weight: 0 }, { tag: 'wand', weight: 45 }, { tag: 'default', weight: 0 }]);
  assert.equal(parsed.generationWeights, null);
  assert.deepEqual(parsed.stats, [{ statId: null, sourceLabel: 'local maximum added fire damage', min: 180, max: 210, annotation: 'Local' }]);
});

test('ties share tiers, pools rank separately, and all groups participate in conflict lookup', () => {
  const row = (level, groups) => ({ Name: 'Example', Level: String(level), ModGenerationTypeID: '2', ModFamilyList: groups,
    str: "<span class='mod-value'>(1—2)</span>%", fossil_no: [], mod_no: [], adds_no: [], spawn_no: [] });
  const view = { config: { normal: {}, essence: {} }, normal: [row(80, ['Speed', 'Dexterity']), row(80, ['Speed']), row(40, ['Speed']), row(1, ['Dexterity'])], essence: [{ ...row(5, ['Speed']), Tier: '7' }] };
  const mods = normalizeModifiers(view, new Map());
  assert.deepEqual(mods.map(m => m.tier), [1, 1, 2, 1, 1]);
  assert.equal(mods[4].sourceTier, 7);
  assert.equal(mods[0].pageWeight, null);
  assert.equal(mods[0].modId, null);
  assert.equal(groupsConflict(mods[0], mods[3]), true);
  assert.deepEqual(buildGroupIndex(mods).Dexterity, ['poedb:Wands:normal:0', 'poedb:Wands:normal:3']);
});

const rawRoot = new URL('../../docs/crafting-engine/references/raw/poedb/wands-2026-09-06/', import.meta.url);
const view = JSON.parse(readFileSync(new URL('ModsView.json', rawRoot), 'utf8'));
const mods = normalizeModifiers(view, new Map());

test('live table fixture resolves all six target modifiers to distinct T1 families and exact ranges', () => {
  const expected = {
    Carbonising: ['FireDamage', [[89, 121], [180, 210]]],
    Crystalising: ['ColdDamage', [[81, 111], [163, 189]]],
    Vapourising: ['LightningDamage', [[15, 21], [296, 344]]],
    'of Acclaim': ['IncreasedAttackSpeed', [[17, 19]]],
    'of Incision': ['CriticalStrikeChanceIncrease', [[35, 38]]],
    'of Destruction': ['CriticalStrikeMultiplier', [[35, 38]]],
  };
  for (const [name, [group, ranges]] of Object.entries(expected)) {
    const matches = mods.filter(m => m.sourcePool === 'normal' && m.name === name);
    assert.equal(matches.length, 1, name);
    assert.equal(matches[0].tier, 1, name);
    assert.deepEqual(matches[0].groups, [group], name);
    assert.deepEqual(matches[0].displayRanges.map(({ min, max }) => [min, max]), ranges, name);
  }
  assert.equal(mods.filter(m => m.sourcePool === 'normal').length, 263);
  assert.equal(mods.length, 1598);
});

test('actual hybrid veiled modifier blocks all three relevant groups', () => {
  const hybrid = mods.find(m => m.sourcePool === 'veiled' && m.groups.includes('IncreasedAttackSpeed') && m.groups.includes('Intelligence'));
  assert.deepEqual(hybrid.groups, ['IncreasedAttackSpeed', 'Dexterity', 'Intelligence']);
  for (const group of hybrid.groups) assert.equal(groupsConflict(hybrid, { groups: [group] }), true);
});

test('base implicit and weapon enchant remain independent of ordinary affix groups', () => {
  const base = parseKineticBase(readFileSync(new URL('Kinetic_Wand.html', rawRoot), 'utf8'));
  assert.equal(base.baseId, 'Metadata/Items/Weapons/OneHandWeapons/Wands/WandK3');
  assert.ok(base.reportedTags.includes('ranged'));
  assert.deepEqual(base.displayProperties.physicalDamage, { min: 29, max: 54 });
  assert.equal(base.displayProperties.criticalStrikeChancePercent, 8.5);
  assert.equal(base.displayProperties.attacksPerSecond, 1.6);
  assert.deepEqual(base.displayProperties.requirements, { level: 59, intelligence: 188 });
  const enchants = parseWeaponEnchants(readFileSync(new URL('Enchant_Weapons.html', rawRoot), 'utf8'));
  assert.equal(enchants.length, 181);
  const fire = enchants.find(e => e.sourceName === 'Enchantment Fire Modifier Effect');
  assert.equal(fire.description, '8% increased Explicit Fire Modifier magnitudes');
  assert.equal(fire.groups, null);
  assert.equal(fire.weight, null);
});
