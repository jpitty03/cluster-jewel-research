// Aggregation of a league's raw cluster jewel list into the base+type groups and
// notable combinations the UI renders. Shared with scripts/price.ts so the combos
// that get priced are exactly the ones displayed — if the two drifted, prices
// would be cached under keys the UI never looks up.

import type { ComboCount } from './tradeQuery'

export interface ClusterJewel {
  base: string
  itemName: string
  rarity: string
  ilvl: number | null
  passives: number | null
  jewelSockets: number
  clusterType: string
  notables: string[]
  smallGrants: string[]
  fracturedMods: string[]
  fractured: boolean
  corrupted: boolean
  character: string
  account: string
  streamer: string | null
  class: string
}

export interface ClusterData {
  fetchedAt: string
  snapshotVersion: string
  league: string
  charactersTotal: number
  charactersFetched: number
  errors: number
  jewels: ClusterJewel[]
}

export interface Group {
  key: string
  base: string
  clusterType: string
  jewels: ClusterJewel[]
  notableCounts: [string, number][]
  comboCounts: ComboCount[]
  fracturedCount: number
  fracturedCounts: [string, number][]
  smallGrantCounts: [string, number][]
}

// Synthesised clusters are treated as their plain base (we don't care about synthesis).
export const normalizeBase = (base: string) => base.replace(/^Synthesised /, '')

// Small-passive grants are templated so numeric variants merge into one entry,
// e.g. "+8 to Strength" and "+3 to Strength" both become "+# to Strength".
export const normalizeGrant = (g: string) => g.replace(/\d+(\.\d+)?/g, '#')

export interface GroupOptions {
  raresOnly?: boolean
  baseFilter?: string
  query?: string
}

export function groupJewels(
  all: ClusterJewel[],
  { raresOnly = true, baseFilter = 'All', query = '' }: GroupOptions = {},
): Group[] {
  let jewels = all
  if (raresOnly) jewels = jewels.filter((j) => j.rarity === 'Rare')
  if (baseFilter !== 'All') jewels = jewels.filter((j) => normalizeBase(j.base) === baseFilter)
  const q = query.trim().toLowerCase()
  if (q) {
    jewels = jewels.filter(
      (j) =>
        j.clusterType.toLowerCase().includes(q) ||
        j.base.toLowerCase().includes(q) ||
        j.itemName.toLowerCase().includes(q) ||
        j.notables.some((n) => n.toLowerCase().includes(q)) ||
        j.smallGrants.some((g) => g.toLowerCase().includes(q)),
    )
  }

  const map = new Map<string, ClusterJewel[]>()
  for (const j of jewels) {
    const key = `${normalizeBase(j.base)}||${j.clusterType}`
    const arr = map.get(key)
    if (arr) arr.push(j)
    else map.set(key, [j])
  }

  const out: Group[] = []
  for (const [key, js] of map) {
    const [base, clusterType] = key.split('||')
    const notables = new Map<string, number>()
    const combos = new Map<string, ComboCount>()
    const fractured = new Map<string, number>()
    const smallGrants = new Map<string, number>()
    let fracturedCount = 0
    for (const j of js) {
      for (const n of j.notables) notables.set(n, (notables.get(n) ?? 0) + 1)
      const comboNotables = [...j.notables].sort()
      const combo = comboNotables.join(' + ') || '(no notables)'
      let cc = combos.get(combo)
      if (!cc) {
        cc = { combo, notables: comboNotables, count: 0, passivesMin: null, passivesMax: null }
        combos.set(combo, cc)
      }
      cc.count++
      if (j.passives != null) {
        cc.passivesMin = cc.passivesMin == null ? j.passives : Math.min(cc.passivesMin, j.passives)
        cc.passivesMax = cc.passivesMax == null ? j.passives : Math.max(cc.passivesMax, j.passives)
      }
      if (j.fractured) fracturedCount++
      for (const f of j.fracturedMods) fractured.set(f, (fractured.get(f) ?? 0) + 1)
      for (const g of j.smallGrants) {
        const grantKey = normalizeGrant(g)
        smallGrants.set(grantKey, (smallGrants.get(grantKey) ?? 0) + 1)
      }
    }
    out.push({
      key,
      base,
      clusterType,
      jewels: js,
      notableCounts: [...notables].sort((a, b) => b[1] - a[1]),
      comboCounts: [...combos.values()].sort((a, b) => b.count - a.count),
      fracturedCount,
      fracturedCounts: [...fractured].sort((a, b) => b[1] - a[1]),
      smallGrantCounts: [...smallGrants].sort((a, b) => b[1] - a[1]),
    })
  }
  return out.sort((a, b) => b.jewels.length - a.jewels.length)
}
