import { createHash } from 'node:crypto';

export const digest = value => createHash('sha256').update(value).digest('hex');

export function textFromHtml(value = '') {
  return value.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&#x([\da-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&(nbsp|amp|quot|apos|lt|gt|ndash|mdash);/g, (_, key) => ({
      nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', ndash: '–', mdash: '—',
    })[key]).replace(/[ \t\r]+/g, ' ').trim();
}

export function modifierRanges(html) {
  // Remove only the nested dash span before reading complete mod-value spans.
  const flattened = html.replace(/<span\b[^>]*class=["']ndash["'][^>]*>(.*?)<\/span>/gs, '$1');
  return [...flattened.matchAll(/<span\b[^>]*class=["']mod-value["'][^>]*>(.*?)<\/span>/gs)].map((match, index) => {
    const text = textFromHtml(match[1]);
    const range = text.match(/^[+]?\(\s*(-?\d+(?:\.\d+)?)\s*[—–-]\s*(-?\d+(?:\.\d+)?)\s*\)$/);
    const fixed = text.match(/^[+]?(-?\d+(?:\.\d+)?)$/);
    if (!range && !fixed) throw new Error(`Unrecognized modifier value: ${text}`);
    const min = Number((range ?? fixed)[1]);
    const max = range ? Number(range[2]) : min;
    if (min > max) throw new Error(`Reversed modifier range: ${text}`);
    return { displayIndex: index, text, min, max };
  });
}

export function detailRows(html) {
  return Object.fromEntries([...html.matchAll(/<tr>\s*<th>(.*?)<td>(.*?)(?=<tr>|<\/table>)/gs)]
    .map(([, label, body]) => [textFromHtml(label), body.trim()]));
}

function weightRows(html) {
  if (html === undefined) return null;
  const badges = [...html.matchAll(/<span\b[^>]*>(.*?)<\/span>/gs)].map(m => textFromHtml(m[1]));
  return badges.map(text => {
    const match = text.match(/^(.+):\s*(\d+)$/);
    if (!match) throw new Error(`Unrecognized weight: ${text}`);
    return { tag: match[1], weight: Number(match[2]) };
  });
}

export function parseDetail(html) {
  const rows = detailRows(html);
  const stats = rows.Stats === undefined ? null : [...rows.Stats.matchAll(/<li>(.*?)(?:<\/li>|(?=<li>)|$)/gs)].map(([, value]) => {
    const text = textFromHtml(value);
    const match = text.match(/^(.*?)\s+(-?\d+(?:\.\d+)?)\s*[—–]\s*(-?\d+(?:\.\d+)?)(?:\s+(.*))?$/);
    if (!match) throw new Error(`Unrecognized stat detail: ${text}`);
    return { statId: null, sourceLabel: match[1], min: Number(match[2]), max: Number(match[3]), annotation: match[4] ?? null };
  });
  return {
    domain: rows.Domains ? textFromHtml(rows.Domains) : null,
    generationType: rows.GenerationType ? textFromHtml(rows.GenerationType) : null,
    effectiveRequiredLevel: rows['Req. level'] ? Number(textFromHtml(rows['Req. level']).match(/Effective: (\d+)/)?.[1]) || null : null,
    spawnWeights: weightRows(rows['Spawn Tags']),
    generationWeights: weightRows(rows['Generation Tags']),
    stats,
    sourceFields: Object.fromEntries(Object.entries(rows).map(([key, value]) => [key, textFromHtml(value)])),
  };
}

export function tableRecords(view) {
  return Object.keys(view.config).flatMap(pool => Object.entries(view[pool] ?? {}).map(([key, raw]) => {
    if (!raw || typeof raw.str !== 'string' || !Array.isArray(raw.ModFamilyList)) {
      throw new Error(`Invalid modifier record: ${pool}/${key}`);
    }
    return { pool, key, raw };
  }));
}

export function normalizeModifiers(view, details, options = {}) {
  const itemClass = options.itemClass ?? 'Wands';
  const sourceUrl = options.sourceUrl ?? 'https://poedb.tw/us/Wands';
  const numericIdFields = options.numericIdFields ?? ['WandModsID'];
  const records = tableRecords(view);
  const rankLevels = new Map();
  const rankKey = ({ pool, raw }) => JSON.stringify([pool, raw.ModGenerationTypeID, raw.ModFamilyList[0] ?? null]);
  for (const record of records) {
    const level = Number(record.raw.Level);
    if (!Number.isInteger(level) || level < 0) throw new Error(`Invalid level: ${record.pool}/${record.key}`);
    const key = rankKey(record);
    rankLevels.set(key, [...new Set([...(rankLevels.get(key) ?? []), level])].sort((a, b) => b - a));
  }
  return records.map(record => {
    const { pool, key, raw } = record;
    const detail = details.get(raw.hover) ?? null;
    const tier = rankLevels.get(rankKey(record)).indexOf(Number(raw.Level)) + 1;
    const id = `poedb:${itemClass}:${pool}:${key}`;
    const modId = raw.hover?.startsWith('?s=')
      ? decodeURIComponent(raw.hover.slice(3)).match(/^Data[\\/]Mods[\\/](.+)$/)?.[1] ?? null
      : null;
    const missing = [];
    for (const key of ['fossil_no', 'mod_no', 'adds_no', 'spawn_no']) {
      if (!Array.isArray(raw[key])) missing.push(key);
    }
    const weight = raw.DropChance === undefined ? null : Number(raw.DropChance);
    if (weight !== null && (!Number.isFinite(weight) || weight < 0)) throw new Error(`Invalid weight: ${id}`);
    return {
      recordId: id,
      modId,
      sourcePool: pool,
      sourcePoolTitle: textFromHtml(view.config[pool].title ?? pool),
      name: textFromHtml(raw.Name ?? ''),
      generationType: ({ 1: 'prefix', 2: 'suffix' })[Number(raw.ModGenerationTypeID)] ??
        (detail?.generationType ? detail.generationType.replace(/\s*\(\d+\)$/, '').toLowerCase() : null),
      sourceGenerationTypeId: Number(raw.ModGenerationTypeID),
      requiredItemLevel: Number(raw.Level),
      effectiveRequiredLevel: detail?.effectiveRequiredLevel ?? null,
      tier,
      tierCount: rankLevels.get(rankKey(record)).length,
      tierBasis: 'poedb-ui: descending distinct required levels within source pool, generation type, first group',
      sourceTier: raw.Tier === undefined ? null : Number(raw.Tier),
      sourceTierName: raw.TierName ?? null,
      groups: [...raw.ModFamilyList],
      tags: Array.isArray(raw.fossil_no) ? [...raw.fossil_no] : null,
      craftingTags: Array.isArray(raw.mod_no) ? raw.mod_no.map(badge => {
        const tag = badge.match(/data-tag=["']([^"']+)["']/)?.[1];
        if (!tag) throw new Error(`Missing badge tag: ${id}`);
        return tag;
      }) : null,
      addsTags: Array.isArray(raw.adds_no) ? [...raw.adds_no] : null,
      sourceSpawnTags: Array.isArray(raw.spawn_no) ? [...raw.spawn_no] : null,
      description: textFromHtml(raw.str),
      displayRanges: modifierRanges(raw.str),
      stats: detail?.stats ?? null,
      pageWeight: weight,
      spawnWeights: detail?.spawnWeights ?? null,
      generationWeights: detail?.generationWeights ?? null,
      domain: detail?.domain ?? null,
      availability: 'unverified',
      source: {
        url: sourceUrl,
        jsonPointer: `/${pool}/${key}`,
        hoverUrl: raw.hover ?? null,
        detailAvailable: detail !== null,
        sourceRecordSha256: digest(JSON.stringify(raw)),
        numericClassModsId: numericIdFields.map(field => raw[field]).find(value => value !== undefined) ?? null,
        detailFields: detail?.sourceFields ?? null,
      },
      unresolved: [...(modId ? [] : ['canonical-mod-id']), 'canonical-stat-ids', 'source-patch', 'action-availability',
        ...missing, ...(detail ? [] : ['modifier-detail']),
        ...(detail?.spawnWeights === null ? ['spawn-weights-not-exposed'] : []),
        ...(detail?.generationWeights === null ? ['generation-weights-not-exposed'] : [])],
    };
  });
}

export function buildGroupIndex(mods) {
  const groups = {};
  for (const mod of mods) {
    for (const group of mod.groups) (groups[group] ??= []).push(mod.recordId);
  }
  return Object.fromEntries(Object.entries(groups).sort(([a], [b]) => a.localeCompare(b)));
}

export function groupsConflict(left, right) {
  return left.groups.some(group => right.groups.includes(group));
}

export function parseWeaponEnchants(html) {
  const table = [...html.matchAll(/<table\b.*?<\/table>/gs)].map(m => m[0])
    .find(table => table.includes('<th>Name</th><th>Level</th><th>Description</th>'));
  if (!table) throw new Error('Missing weapon enchant table');
  return [...table.matchAll(/<tr>(.*?)<\/tr>/gs)].flatMap(([, row]) => {
    const cells = [...row.matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map(m => m[1]);
    if (!cells.length) return [];
    if (cells.length !== 3) throw new Error('Weapon enchant table changed');
    return [{
      sourceName: textFromHtml(cells[0]), requiredItemLevel: Number(textFromHtml(cells[1])),
      description: textFromHtml(cells[2]), displayRanges: modifierRanges(cells[2]),
      modId: null, tier: null, tags: null, groups: null, weight: null,
      sourceUrl: 'https://poedb.tw/us/Enchant_Weapons',
      unresolved: ['canonical-mod-id', 'tier', 'tags', 'groups', 'weight', 'source-patch'],
    }];
  });
}

export function parseKineticBase(html) {
  const fields = Object.fromEntries([...html.matchAll(/<tr><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/gs)]
    .map(([, key, value]) => [textFromHtml(key), textFromHtml(value)]));
  if (!fields.Type?.startsWith('Metadata/Items/Weapons/')) throw new Error('Kinetic base ID missing');
  if (!fields.Tags || !fields['Base.tag']) throw new Error('Kinetic base tags missing');
  const display = html.match(/Physical Damage:\s*<span[^>]*>(\d+)-(\d+)<\/span>.*?Critical Strike Chance:\s*<span[^>]*>([\d.]+)%<\/span>.*?Attacks per Second:\s*<span[^>]*>([\d.]+)<\/span>.*?Requires Level\s*<span[^>]*>(\d+)<\/span>,\s*<span[^>]*>(\d+)<\/span> Int/s);
  if (!display) throw new Error('Kinetic display properties missing');
  return {
    baseId: fields.Type, name: 'Kinetic Wand', itemClass: 'Wands',
    sourceUrl: 'https://poedb.tw/us/Kinetic_Wand', sourcePatch: null,
    reportedTags: fields.Tags.split(', '), datatableTags: fields['Base.tag'].split(', '),
    displayProperties: { physicalDamage: { min: Number(display[1]), max: Number(display[2]) },
      criticalStrikeChancePercent: Number(display[3]), attacksPerSecond: Number(display[4]),
      requirements: { level: Number(display[5]), intelligence: Number(display[6]) } },
    sourceFields: fields,
    sourceFieldsWarning: 'The generic datatable Weapon/AttributeRequirements rows do not describe this base display; use displayProperties.',
    implicit: { description: 'Cannot roll Caster Modifiers', group: 'KineticWandImplicit',
      modId: null, interpretation: 'base implicit, not a crafted suffix',
      ruleEvidence: 'game text on PoEDB; individual crafting-action exceptions require separate validation' },
  };
}

export function parseEquipmentBase(html, { name, itemClass, sourceUrl, implicit = null }) {
  const fields = Object.fromEntries([...html.matchAll(/<tr><td>(.*?)<\/td><td>(.*?)<\/td><\/tr>/gs)]
    .map(([, key, value]) => [textFromHtml(key), textFromHtml(value)]));
  if (!fields.Type?.startsWith('Metadata/Items/')) throw new Error(`${name} base ID missing`);
  if (!fields.Tags || !fields['Base.tag']) throw new Error(`${name} base tags missing`);
  const plain = textFromHtml(html);
  const physical = plain.match(/Physical Damage:\s*(\d+)\s*[-â€“â€”]\s*(\d+)/);
  const critical = plain.match(/Critical Strike Chance:\s*([\d.]+)%/);
  const aps = plain.match(/Attacks per Second:\s*([\d.]+)/);
  const requirementText = plain.match(/Requires Level\s*(\d+)((?:,\s*\d+\s*(?:Str|Dex|Int))*)/) ?? [];
  const requirements = { level: requirementText[1] ? Number(requirementText[1]) : null };
  for (const match of (requirementText[2] ?? '').matchAll(/(\d+)\s*(Str|Dex|Int)/g)) {
    requirements[({ Str: 'strength', Dex: 'dexterity', Int: 'intelligence' })[match[2]]] = Number(match[1]);
  }
  if (!physical || !critical || !aps || requirements.level === null) throw new Error(`${name} display properties missing`);
  return {
    baseId: fields.Type, name, itemClass, sourceUrl, sourcePatch: null,
    reportedTags: fields.Tags.split(', '), datatableTags: fields['Base.tag'].split(', '),
    displayProperties: {
      physicalDamage: { min: Number(physical[1]), max: Number(physical[2]) },
      criticalStrikeChancePercent: Number(critical[1]), attacksPerSecond: Number(aps[1]), requirements,
    },
    sourceFields: fields,
    sourceFieldsWarning: 'The generic datatable Weapon/AttributeRequirements rows may not describe the rendered base display; use displayProperties.',
    implicit,
  };
}
