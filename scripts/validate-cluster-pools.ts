// Cross-checks the crafting engine's cluster jewel mod pools (built from the poedb scrape
// in src/data/poedb-cluster-mods.json) against an independent source: the saved Craft of
// Exile model under docs/crafting-engine/references/raw/craftofexile/.
//
// Usage: npx tsx scripts/validate-cluster-pools.ts [path/to/beta-data.json]
//
// For every cluster type it compares the multiset of (notable?, weight, required level,
// prefix/suffix) over all prefixes and suffixes. Mod ids and display names differ between
// the two sources (renamed notables keep their old internal keys), so the comparison is
// name-independent; a cluster type passes when some Craft of Exile class carries exactly
// the same multiset. Exits non-zero on any mismatch.
//
// Re-run after re-scraping poedb for a new patch, against a Craft of Exile snapshot taken
// for the same patch. A mismatch against an older snapshot is expected, not a bug.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ClusterModRepository } from '../crafting-engine/src/data/loadClusterMods.ts'
import { ModPool } from '../crafting-engine/src/domain/ModPool.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const modelPath = process.argv[2] ?? join(
  ROOT, 'docs', 'crafting-engine', 'references', 'raw', 'craftofexile', 'model-2026-09-06', 'beta-data.json',
)

interface CoeData {
  classes: { entries: Array<{ id: number; subset: string | null }> }
  classmods: Record<string, Record<string, number>>
  mods: { entries: Array<{ id: number; key: string; group: number; minlvl: number }> }
  modgroups: { entries: Array<{ id: number; type: number }> }
  enums: { types: string | Record<string, string> }
}

const raw = readFileSync(modelPath, 'utf8')
const coe = JSON.parse(raw.slice(raw.indexOf('{')).trimEnd().replace(/;$/, '')) as CoeData
// The enum arrives as a Python-style dict literal; only PREFIX and SUFFIX ids are needed.
const typeEnum = typeof coe.enums.types === 'string'
  ? Object.fromEntries([...coe.enums.types.matchAll(/'(\d+)':\s*'([^']*)'/g)].map((m) => [m[1], m[2]]))
  : coe.enums.types
const modById = new Map(coe.mods.entries.map((mod) => [String(mod.id), mod]))
const groupType = new Map(coe.modgroups.entries.map((group) => [group.id, typeEnum[String(group.type)]]))

type Signature = Map<string, number>
const add = (signature: Signature, key: string) => signature.set(key, (signature.get(key) ?? 0) + 1)
const same = (left: Signature, right: Signature) =>
  left.size === right.size && [...left].every(([key, count]) => right.get(key) === count)
const distance = (left: Signature, right: Signature) =>
  [...new Set([...left.keys(), ...right.keys()])]
    .reduce((sum, key) => sum + Math.abs((left.get(key) ?? 0) - (right.get(key) ?? 0)), 0)

const repo = new ClusterModRepository()
let types = 0
let mods = 0
let failures = 0
for (const [subset, base] of [
  ['large', 'Large Cluster Jewel'],
  ['medium', 'Medium Cluster Jewel'],
  ['small', 'Small Cluster Jewel'],
] as const) {
  const classSignatures = coe.classes.entries
    .filter((entry) => entry.subset === subset)
    .map((entry) => {
      const signature: Signature = new Map()
      for (const [modId, weight] of Object.entries(coe.classmods[String(entry.id)] ?? {})) {
        const mod = modById.get(modId)
        const side = mod ? groupType.get(mod.group) : undefined
        if (!mod || (side !== 'PREFIX' && side !== 'SUFFIX')) continue
        add(signature, `${mod.key.startsWith('AfflictionNotable')}|${weight}|${mod.minlvl}|${side}`)
      }
      return signature
    })
  for (const clusterType of repo.getClusterTypes(base)) {
    const signature: Signature = new Map()
    const pool = ModPool.forCluster(repo, base, clusterType).getAllMods()
    for (const mod of pool) {
      add(signature, `${mod.isNotable === true}|${mod.weight}|${mod.ilvl}|${mod.genType.toUpperCase()}`)
    }
    types++
    if (classSignatures.some((candidate) => same(candidate, signature))) {
      mods += pool.length
      continue
    }
    failures++
    const nearest = Math.min(...classSignatures.map((candidate) => distance(candidate, signature)))
    console.error(`[pools] MISMATCH ${base} · ${clusterType}: nearest Craft of Exile class differs by ${nearest} mod entries`)
  }
}
console.log(`[pools] ${types - failures}/${types} cluster types match Craft of Exile exactly (${mods} mods compared)`)
process.exit(failures === 0 ? 0 : 1)
