// One-time conversion of the trade-site stat CSVs into the JSON the UI imports.
// Rerun whenever src/assets/enchants.csv or explicits.csv change (new league mods).
//
// Usage: node scripts/build-trade-stats.mjs
// Reads:  src/assets/enchants.csv, src/assets/explicits.csv
// Writes: src/data/trade-stats.json
//
// Output shape:
//   clusterTypeOptions: cluster type text -> option id for enchant.stat_3948993189
//                       ("Added Small Passive Skills grant: #")
//   notableExplicits:   notable name -> explicit stat id, from the
//                       "1 Added Passive Skill is X" explicit rows

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const CLUSTER_TYPE_STAT = 'enchant.stat_3948993189'
const NOTABLE_PREFIX = '1 Added Passive Skill is '

// Minimal CSV parser (quoted fields, "" escapes, no embedded newlines).
function parseCsv(text) {
  const rows = []
  for (const line of text.replace(/^﻿/, '').split(/\r?\n/)) {
    if (!line) continue
    const row = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (inQ) {
        if (c === '"') {
          if (line[i + 1] === '"') {
            cur += '"'
            i++
          } else inQ = false
        } else cur += c
      } else if (c === '"') inQ = true
      else if (c === ',') {
        row.push(cur)
        cur = ''
      } else cur += c
    }
    row.push(cur)
    rows.push(row)
  }
  return rows
}

const readCsv = (name) => parseCsv(readFileSync(join(ROOT, 'src', 'assets', name), 'utf8')).slice(1)

const clusterTypeOptions = {}
for (const [statId, , optionId, optionText] of readCsv('enchants.csv')) {
  if (statId === CLUSTER_TYPE_STAT) clusterTypeOptions[optionText] = optionId
}

const notableExplicits = {}
for (const [category, id, text] of readCsv('explicits.csv')) {
  if (category === 'Explicit' && text.startsWith(NOTABLE_PREFIX))
    notableExplicits[text.slice(NOTABLE_PREFIX.length)] = id
}

const out = { clusterTypeOptions, notableExplicits }
writeFileSync(join(ROOT, 'src', 'data', 'trade-stats.json'), JSON.stringify(out, null, 1) + '\n')
console.log(
  `trade-stats.json: ${Object.keys(clusterTypeOptions).length} cluster types, ` +
    `${Object.keys(notableExplicits).length} notables`,
)
