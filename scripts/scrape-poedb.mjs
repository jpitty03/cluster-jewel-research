// One-time scrape of poedb.tw cluster jewel mod pools. Two independent pools per base:
//
//   bases[base]     — the ENCHANTMENT pool (notables). Server-rendered weight tables: per
//                     cluster type, each notable's weight, required ilvl, Prefix/Suffix, tags.
//   baseMods[base]  — the EXPLICIT pool (regular prefixes/suffixes). The Modifiers Calc tab
//                     is hydrated client-side from a `new ModsView({...})` JSON blob, so we
//                     lift that blob out of the HTML and read its `normal` array. Only
//                     `normal` is used, which excludes delve / corrupted / synthesis /
//                     essence / veiled / influence pools.
//
// It also scrapes the Horticrafting (harvest) bench into its own file: every craft the
// Horticrafting Station offers and what it costs in Lifeforce.
//
// Usage: node scripts/scrape-poedb.mjs
// Writes: data/poedb-cluster-mods.json + src/data/poedb-cluster-mods.json
//         data/poedb-horticrafting.json + src/data/poedb-horticrafting.json

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'

const PAGES = {
  'Large Cluster Jewel': 'Large_Cluster_Jewel',
  'Medium Cluster Jewel': 'Medium_Cluster_Jewel',
  'Small Cluster Jewel': 'Small_Cluster_Jewel',
}
const HORTICRAFTING_PAGE = 'Horticrafting'

// Hand-written, not scraped: what each craft `action` actually does to an item. poedb only
// prints the bench's one-line blurb, which leaves out the mechanics that matter for odds.
// Keyed by the craft's `action` field; only the actions with non-obvious behaviour are described.
const ACTION_TYPES = {
  Reforge:
    'Rerolls a rare item that guarantees a modifier with the respective modTag. 50% chance to roll 3-6 modifiers.',
  Add: 'Adds a new modifier with the respective modTag and removes a random modifier. Cannot remove the modifier that was just added.',
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const stripTags = (s) => s.replace(/<[^>]+>/g, '')
const decodeEntities = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&amp;/g, '&')

// ------------------------------------------------------------- enchantment pool

// Extract the enchant title from the anchor block preceding a weight table.
// Format matches poe.ninja's clusterType: variant lines joined with " / ",
// helper text (spans with class item_description) dropped.
function parseEnchantTitle(chunk) {
  // last title anchor in the chunk (directly precedes the table's collapse div)
  const anchors = [...chunk.matchAll(/<a href='\/us\/[^']*'>((?:<span class="explicitMod">.*?<\/span>)+)<\/a>/gs)]
  if (anchors.length === 0) return null
  const spans = [...anchors[anchors.length - 1][1].matchAll(/<span class="explicitMod">(.*?)<\/span>(?=<span class="explicitMod">|$)/gs)]
  const lines = []
  for (const [, inner] of spans) {
    if (inner.includes('item_description')) continue // "(Ailments that…)" helper text
    const text = stripTags(inner).trim()
    if (text) lines.push(text)
  }
  return lines.join(' / ') || null
}

function parseWeightTable(tableHtml) {
  const notables = []
  for (const row of tableHtml.matchAll(/<tr>(.*?)<\/tr>/gs)) {
    const cells = [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((m) => m[1])
    if (cells.length < 4) continue
    // The Passive cell carries the notable's tag badges in a right-floated block ahead of
    // the name link: <span class="badge … " data-tag="physical">Physical</span> …
    const tags = [...cells[0].matchAll(/data-tag="([^"]+)"/g)].map((m) => m[1])
    const nameMatch = cells[0].match(/<a[^>]*>([^<]+)<\/a>/)
    const name = nameMatch
      ? nameMatch[1].trim()
      : stripTags(cells[0].replace(/<span class='float-end'>.*?<\/span>\s*<\/span>/s, '')).trim()
    const weight = Number(stripTags(cells[1]))
    const ilvl = Number(stripTags(cells[2]))
    const genType = stripTags(cells[3]).trim()
    if (!name || !Number.isFinite(weight)) continue
    notables.push({ name, weight, ilvl, genType, tags })
  }
  return notables
}

function parseEnchantPools(html) {
  const tableRe = /<table[^>]*><thead><tr><th>Passive<\/th><th>Weight<\/th>.*?<\/table>/gs
  const pools = []
  let prevEnd = 0
  for (const m of html.matchAll(tableRe)) {
    const chunk = html.slice(prevEnd, m.index) // text between previous table and this one
    prevEnd = m.index + m[0].length
    const clusterType = parseEnchantTitle(chunk)
    const notables = parseWeightTable(m[0])
    if (!clusterType) {
      console.warn(`  ! could not find enchant title for a pool with ${notables.length} notables — skipped`)
      continue
    }
    pools.push({
      clusterType,
      totalWeight: notables.reduce((s, n) => s + n.weight, 0),
      notables,
    })
  }
  return pools
}

// ---------------------------------------------------------------- explicit pool

// Pull the `new ModsView({...})` argument out of the page by brace-matching. String-aware,
// so the braces that appear inside the HTML fragments in that JSON don't throw it off.
function extractModsView(html) {
  const call = html.indexOf('new ModsView(')
  if (call === -1) return null
  const start = html.indexOf('{', call)
  if (start === -1) return null
  const BACKSLASH = String.fromCharCode(92)
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < html.length; i++) {
    const c = html[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === BACKSLASH) esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) return JSON.parse(html.slice(start, i + 1))
  }
  return null
}

// "?s=Data%5CMods%2FAfflictionJewelSmallPassivesGrantLife_" -> "AfflictionJewelSmallPassivesGrantLife_"
function modIdFromHover(hover) {
  if (!hover) return null
  let path = hover
  try {
    path = decodeURIComponent(hover)
  } catch {
    /* leave percent-encoded rather than lose the id */
  }
  const parts = path.split(/[/\\]/)
  return parts[parts.length - 1] || null
}

// Roll values are wrapped in <span class='mod-value'>…</span>; ranges read "(2—3)".
function parseStatValues(str) {
  const values = []
  for (const m of str.matchAll(/<span class='mod-value'>(.*?)<\/span>(?![^<]*<\/span>)/gs)) {
    const text = decodeEntities(stripTags(m[1])).trim()
    const range = text.match(/\(\s*(-?[\d.]+)\s*[—–-]\s*(-?[\d.]+)\s*\)/)
    if (range) {
      values.push({ text, min: Number(range[1]), max: Number(range[2]) })
      continue
    }
    const single = text.match(/-?[\d.]+/)
    if (single) values.push({ text, min: Number(single[0]), max: Number(single[0]) })
  }
  return values
}

function parseBaseMods(modsView) {
  if (!modsView || !Array.isArray(modsView.normal)) return null
  const gen = modsView.gen ?? { 1: 'Prefix', 2: 'Suffix' }

  const mods = modsView.normal.map((m) => {
    const groups = Array.isArray(m.ModFamilyList) ? m.ModFamilyList : []
    return {
      name: m.Name,
      modId: modIdFromHover(m.hover),
      genType: gen[m.ModGenerationTypeID] ?? String(m.ModGenerationTypeID),
      weight: Number(m.DropChance) || 0,
      ilvl: Number(m.Level) || 0,
      modGroup: groups[0] ?? null,
      modGroups: groups,
      // Mods.dat tags — what fossils / harvest crafts match on.
      tags: Array.isArray(m.fossil_no) ? m.fossil_no : [],
      // The coloured badges poedb prints next to the mod (a subset of `tags`).
      craftTags: (Array.isArray(m.mod_no) ? m.mod_no : [])
        .map((badge) => badge.match(/data-tag="([^"]+)"/)?.[1])
        .filter(Boolean),
      // Tag keys in the mod's SpawnWeight table (which bases it can roll on).
      spawnTags: Array.isArray(m.spawn_no) ? m.spawn_no : [],
      statText: decodeEntities(stripTags(m.str)).replace(/\s+/g, ' ').trim(),
      statValues: parseStatValues(m.str),
    }
  })

  // Tier within a mod group, poedb's convention: highest required ilvl is T1.
  const byGroup = new Map()
  for (const mod of mods) {
    const key = `${mod.genType}||${mod.modGroup ?? mod.modId}`
    if (!byGroup.has(key)) byGroup.set(key, [])
    byGroup.get(key).push(mod)
  }
  for (const group of byGroup.values()) {
    const ranked = [...group].sort((a, b) => b.ilvl - a.ilvl)
    ranked.forEach((mod, i) => {
      mod.tier = i + 1
      mod.tierCount = ranked.length
    })
  }

  // Prefixes and suffixes roll from separate pools, so odds are per generation type.
  const totalWeight = { Prefix: 0, Suffix: 0 }
  for (const mod of mods) totalWeight[mod.genType] = (totalWeight[mod.genType] ?? 0) + mod.weight
  for (const mod of mods) {
    const total = totalWeight[mod.genType] || 0
    mod.pct = total ? (mod.weight / total) * 100 : 0
  }

  return { totalWeight, mods }
}

// --------------------------------------------------------------- horticrafting

// The Horticrafting Station bench is a plain server-rendered Description/Cost table.
// A cost cell holds one or two currency links, each followed by a bare "xN" text node —
// e.g. `<a …>Primal Crystallised Lifeforce</a> x200<a …>Crystallised Rancour</a> x3`.
function parseCraftCost(cellHtml) {
  const cost = []
  for (const m of cellHtml.matchAll(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>\s*x\s*([\d,]+)/gs)) {
    cost.push({
      item: decodeEntities(stripTags(m[2])).trim(),
      itemId: m[1],
      amount: Number(m[3].replace(/,/g, '')),
    })
  }
  return cost
}

function parseHorticrafting(html) {
  const table = html.match(/<thead><tr><th>Description<\/th><th>Cost<\/th><\/tr><\/thead>(.*?)<\/table>/s)
  if (!table) return null
  // poedb prints the row count in the card header ("Horticrafting Station /74"); use it as a checksum.
  const claimed = Number(html.match(/Horticrafting Station\s*\/(\d+)/)?.[1]) || null

  const crafts = []
  for (const row of table[1].matchAll(/<tr>(.*?)<\/tr>/gs)) {
    const cells = [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/gs)].map((m) => m[1])
    if (cells.length < 2) continue
    const descriptionHtml = cells[0].trim()
    const description = decodeEntities(stripTags(descriptionHtml)).replace(/\s+/g, ' ').trim()
    if (!description) continue

    // The leading verb is wrapped in <span class="white">, e.g. "Reforge", "Add", "Enchant".
    const firstWhite = descriptionHtml.match(/<span class="white">(.*?)<\/span>/s)?.[1]
    const action = firstWhite && description.startsWith(stripTags(firstWhite)) ? stripTags(firstWhite).trim() : null

    // Which mod tag the craft targets. poedb's `crafting*` span classes are unreliable here
    // (Minion and Mana both render with `craftingcaster`), so read it out of the sentence.
    const modTag =
      description.match(/(?:including|Add) an? (?:new )?([A-Za-z]+) modifier/)?.[1] ??
      description.match(/including an? ([A-Za-z]+) modifier/)?.[1] ??
      null

    const cost = parseCraftCost(cells[1])
    // Every craft is priced in one of Wild/Vivid/Primal lifeforce; Sacred lifeforce and
    // Crystallised Rancour are extra surcharges and stay in `cost` only.
    const lf = cost.find((c) => /^(Wild|Vivid|Primal) Crystallised Lifeforce$/.test(c.item))

    crafts.push({
      description,
      action,
      modTag,
      tagClasses: [...new Set([...descriptionHtml.matchAll(/class="(crafting[a-z]+)"/g)].map((m) => m[1]))],
      // "Cost is proportional to stack size" — the listed price is per unit, not per use.
      proportionalToStackSize: /proportional to stack size/i.test(description),
      cost,
      lifeforce: lf ? { type: lf.item.split(' ')[0], amount: lf.amount } : null,
    })
  }

  if (claimed && crafts.length !== claimed) {
    console.warn(`  ! Horticrafting: parsed ${crafts.length} crafts but the page header claims ${claimed}`)
  }
  return { count: crafts.length, actionTypes: ACTION_TYPES, crafts }
}

async function scrapeHorticrafting() {
  const res = await fetch(`https://poedb.tw/us/${HORTICRAFTING_PAGE}`, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`${HORTICRAFTING_PAGE} -> ${res.status}`)
  return parseHorticrafting(await res.text())
}

// ----------------------------------------------------------------------- driver

async function scrapePage(pageName) {
  const res = await fetch(`https://poedb.tw/us/${pageName}`, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`${pageName} -> ${res.status}`)
  const html = await res.text()
  return { pools: parseEnchantPools(html), baseMods: parseBaseMods(extractModsView(html)) }
}

// The previous snapshot anchors mod ids and gates the write. poedb's hover links used to
// end in the game's mod key ("AfflictionJewelSmallPassivesGrantLife_"); since late 2026 they
// are opaque hashes. Mod ids are what targets, saved setups and share links refer to, so an
// unreadable id takes the previous snapshot's id for the same mod, and a mod that is new to
// this scrape gets a readable one built from its group and tier.
const PREVIOUS_PATH = join(ROOT, 'src', 'data', 'poedb-cluster-mods.json')
const previous = existsSync(PREVIOUS_PATH) ? JSON.parse(readFileSync(PREVIOUS_PATH, 'utf8')) : null
const isOpaqueId = (id) => !id || /^[0-9a-f]{32,}$/i.test(id)
const modIdentity = (mod) => [mod.genType, mod.modGroup, mod.ilvl, mod.name, mod.statText].join('|')

function stabiliseModIds(base, baseMods) {
  const known = new Map((previous?.baseMods?.[base]?.mods ?? []).map((mod) => [modIdentity(mod), mod.modId]))
  const taken = new Set(baseMods.mods.map((mod) => mod.modId).filter((id) => !isOpaqueId(id)))
  let carried = 0
  let minted = 0
  for (const mod of baseMods.mods) {
    if (!isOpaqueId(mod.modId)) continue
    const carriedId = known.get(modIdentity(mod))
    if (carriedId && !isOpaqueId(carriedId)) {
      mod.modId = carriedId
      carried++
    } else {
      let id = `${mod.modGroup ?? mod.name}_T${mod.tier}`
      while (taken.has(id)) id += '_'
      mod.modId = id
      minted++
    }
    taken.add(mod.modId)
  }
  return { carried, minted }
}

const out = { fetchedAt: new Date().toISOString(), source: 'poedb.tw', bases: {}, baseMods: {} }
for (const [base, page] of Object.entries(PAGES)) {
  process.stdout.write(`Scraping ${page}… `)
  const { pools, baseMods } = await scrapePage(page)
  out.bases[base] = pools
  if (baseMods) out.baseMods[base] = baseMods
  else console.warn(`  ! no ModsView payload on ${page} — explicit pool missing`)
  const notables = pools.reduce((s, p) => s + p.notables.length, 0)
  if (baseMods) {
    const ids = stabiliseModIds(base, baseMods)
    if (ids.minted) console.log(`  ${ids.minted} new mod(s) given ids from group and tier`)
  }
  const pre = baseMods?.mods.filter((m) => m.genType === 'Prefix').length ?? 0
  const suf = baseMods?.mods.filter((m) => m.genType === 'Suffix').length ?? 0
  console.log(`${pools.length} pools / ${notables} notables, explicits: ${pre} prefixes + ${suf} suffixes`)
  await sleep(1000)
}

process.stdout.write(`Scraping ${HORTICRAFTING_PAGE}… `)
const horti = await scrapeHorticrafting()
if (horti) console.log(`${horti.count} crafts`)
else console.warn('  ! could not find the Horticrafting Station table')

// Gate the write: a page that lost its tables (layout change, block page) must not replace
// a working snapshot, because the optimizer has nothing else to build its pools from.
const problems = []
const changes = []
for (const base of Object.keys(PAGES)) {
  const pools = out.bases[base] ?? []
  const mods = out.baseMods[base]?.mods ?? []
  const notables = pools.reduce((sum, pool) => sum + pool.notables.length, 0)
  const before = {
    pools: previous?.bases?.[base]?.length ?? 0,
    mods: previous?.baseMods?.[base]?.mods?.length ?? 0,
    notables: (previous?.bases?.[base] ?? []).reduce((sum, pool) => sum + pool.notables.length, 0),
  }
  for (const [label, now, was] of [['cluster types', pools.length, before.pools], ['mods', mods.length, before.mods], ['notables', notables, before.notables]]) {
    if (now === 0 || now < was * 0.8) problems.push(`${base}: ${now} ${label} (previous snapshot had ${was})`)
    else if (now !== was) changes.push(`${base}: ${label} ${was} -> ${now}`)
  }
  const previousById = new Map((previous?.baseMods?.[base]?.mods ?? []).map((mod) => [mod.modId, mod]))
  for (const mod of mods) {
    const was = previousById.get(mod.modId)
    if (!was) changes.push(`${base}: new mod ${mod.modId} (${mod.name}, weight ${mod.weight})`)
    else if (was.weight !== mod.weight || was.ilvl !== mod.ilvl) {
      changes.push(`${base}: ${mod.modId} weight ${was.weight} -> ${mod.weight}, ilvl ${was.ilvl} -> ${mod.ilvl}`)
    }
  }
  // Notables are where a new league usually differs: added, removed or reweighted per type.
  const previousPools = new Map((previous?.bases?.[base] ?? []).map((pool) => [pool.clusterType, pool]))
  for (const pool of pools) {
    const wasPool = previousPools.get(pool.clusterType)
    if (!wasPool) {
      changes.push(`${base}: new cluster type "${pool.clusterType}" (${pool.notables.length} notables)`)
      continue
    }
    const where = `${base} · ${pool.clusterType}`
    const wasNotables = new Map(wasPool.notables.map((notable) => [notable.name, notable]))
    for (const notable of pool.notables) {
      const was = wasNotables.get(notable.name)
      if (!was) changes.push(`${where}: new notable ${notable.name} (weight ${notable.weight})`)
      else if (was.weight !== notable.weight || was.ilvl !== notable.ilvl) {
        changes.push(`${where}: ${notable.name} weight ${was.weight} -> ${notable.weight}, ilvl ${was.ilvl} -> ${notable.ilvl}`)
      }
      wasNotables.delete(notable.name)
    }
    for (const name of wasNotables.keys()) changes.push(`${where}: notable ${name} removed`)
  }
  for (const pool of previous?.bases?.[base] ?? []) {
    if (!pools.some((now) => now.clusterType === pool.clusterType)) {
      changes.push(`${base}: cluster type "${pool.clusterType}" removed`)
    }
  }
}
if (problems.length) {
  console.error('Scrape looks broken, nothing written:' + problems.map((line) => '\n  ' + line).join(''))
  process.exit(1)
}
console.log(
  changes.length
    ? 'Changes since the previous snapshot:' + changes.map((line) => '\n  ' + line).join('')
    : 'No pool changes since the previous snapshot.',
)

mkdirSync(join(ROOT, 'data'), { recursive: true })
mkdirSync(join(ROOT, 'src', 'data'), { recursive: true })
writeFileSync(join(ROOT, 'data', 'poedb-cluster-mods.json'), JSON.stringify(out, null, 2))
writeFileSync(join(ROOT, 'src', 'data', 'poedb-cluster-mods.json'), JSON.stringify(out))
console.log('Wrote data/poedb-cluster-mods.json and src/data/poedb-cluster-mods.json')

if (horti) {
  const hortiOut = { fetchedAt: out.fetchedAt, source: 'poedb.tw/us/Horticrafting', ...horti }
  writeFileSync(join(ROOT, 'data', 'poedb-horticrafting.json'), JSON.stringify(hortiOut, null, 2))
  writeFileSync(join(ROOT, 'src', 'data', 'poedb-horticrafting.json'), JSON.stringify(hortiOut))
  console.log('Wrote data/poedb-horticrafting.json and src/data/poedb-horticrafting.json')
}

// Spot checks from the plan
const large = out.bases['Large Cluster Jewel']
const axeSword = large.find((p) => p.clusterType.startsWith('Axe Attacks'))
const vs = axeSword?.notables.find((n) => n.name === 'Vicious Skewering')
const bs = axeSword?.notables.find((n) => n.name === 'Bloodscent')
console.log('Spot check Vicious Skewering:', JSON.stringify(vs), '| Bloodscent:', JSON.stringify(bs))
const hale = out.baseMods['Large Cluster Jewel']?.mods.find((m) => m.name === 'Hale')
console.log('Spot check Hale:', JSON.stringify(hale, null, 2))
const fireReforge = horti?.crafts.find((c) => c.description === 'Reforge a Rare item with random modifiers, including a Fire modifier')
console.log('Spot check Fire reforge:', JSON.stringify(fireReforge, null, 2))
