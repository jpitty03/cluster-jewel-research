// One-time scrape of poedb.tw cluster jewel enchantment pools:
// per cluster type, each notable's mod weight, required ilvl, and Prefix/Suffix.
// poedb is fully server-rendered, so this parses the HTML directly.
//
// Usage: node scripts/scrape-poedb.mjs
// Writes: data/poedb-cluster-mods.json (archive) and src/poedb-cluster-mods.json (UI import)

import { mkdirSync, writeFileSync } from 'node:fs'
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const stripTags = (s) => s.replace(/<[^>]+>/g, '')

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
    const nameMatch = cells[0].match(/<a[^>]*>([^<]+)<\/a>/)
    const name = nameMatch ? nameMatch[1].trim() : stripTags(cells[0]).trim()
    const weight = Number(stripTags(cells[1]))
    const ilvl = Number(stripTags(cells[2]))
    const genType = stripTags(cells[3]).trim()
    if (!name || !Number.isFinite(weight)) continue
    notables.push({ name, weight, ilvl, genType })
  }
  return notables
}

async function scrapePage(pageName) {
  const res = await fetch(`https://poedb.tw/us/${pageName}`, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`${pageName} -> ${res.status}`)
  const html = await res.text()

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

const out = { fetchedAt: new Date().toISOString(), source: 'poedb.tw', bases: {} }
for (const [base, page] of Object.entries(PAGES)) {
  process.stdout.write(`Scraping ${page}… `)
  const pools = await scrapePage(page)
  out.bases[base] = pools
  console.log(`${pools.length} pools, ${pools.reduce((s, p) => s + p.notables.length, 0)} notable entries`)
  await sleep(1000)
}

mkdirSync(join(ROOT, 'data'), { recursive: true })
mkdirSync(join(ROOT, 'src', 'data'), { recursive: true })
writeFileSync(join(ROOT, 'data', 'poedb-cluster-mods.json'), JSON.stringify(out, null, 2))
writeFileSync(join(ROOT, 'src', 'data', 'poedb-cluster-mods.json'), JSON.stringify(out))
console.log('Wrote data/poedb-cluster-mods.json and src/data/poedb-cluster-mods.json')

// Spot checks from the plan
const large = out.bases['Large Cluster Jewel']
const axeSword = large.find((p) => p.clusterType.startsWith('Axe Attacks'))
const vs = axeSword?.notables.find((n) => n.name === 'Vicious Skewering')
const bs = axeSword?.notables.find((n) => n.name === 'Bloodscent')
console.log('Spot check Vicious Skewering:', JSON.stringify(vs), '| Bloodscent:', JSON.stringify(bs))
