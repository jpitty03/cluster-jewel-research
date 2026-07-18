import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import poedbData from './data/poedb-cluster-mods.json'
import clusterSnapshot from './data/cluster-jewels.json'

// In dev the Vite plugin serves a live scraping API; a production build is a static
// site with no backend, so it reads the committed snapshot bundled at build time.
const LIVE = import.meta.env.DEV

interface ClusterJewel {
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

interface ClusterData {
  fetchedAt: string
  snapshotVersion: string
  charactersTotal: number
  charactersFetched: number
  errors: number
  jewels: ClusterJewel[]
}

interface Progress {
  phase: 'idle' | 'characters' | 'builds' | 'done'
  done: number
  total: number
  pausedUntil: number | null
  nextRequestAt: number | null
  intervalMs: number
  running: boolean
}

interface Group {
  key: string
  base: string
  clusterType: string
  jewels: ClusterJewel[]
  notableCounts: [string, number][]
  comboCounts: [string, number][]
  fracturedCount: number
  fracturedCounts: [string, number][]
  smallGrantCounts: [string, number][]
}

const secsUntil = (epochMs: number) => Math.max(0, Math.round((epochMs - Date.now()) / 1000))

// Synthesised clusters are treated as their plain base (we don't care about synthesis).
const normalizeBase = (base: string) => base.replace(/^Synthesised /, '')

// poedb.tw craft data: per (base, cluster type), each notable's weight / ilvl /
// prefix-suffix. Built once at module load into a lookup keyed by `${base}||${type}`,
// then by notable name. `pct` = share of the pool's total weight (roll odds).
interface ModMeta {
  weight: number
  ilvl: number
  genType: string
  pct: number
}
const modLookup = new Map<string, Map<string, ModMeta>>()
for (const [base, pools] of Object.entries(poedbData.bases)) {
  for (const pool of pools) {
    const byName = new Map<string, ModMeta>()
    for (const n of pool.notables) {
      byName.set(n.name, {
        weight: n.weight,
        ilvl: n.ilvl,
        genType: n.genType,
        pct: pool.totalWeight ? (n.weight / pool.totalWeight) * 100 : 0,
      })
    }
    modLookup.set(`${base}||${pool.clusterType}`, byName)
  }
}
const lookupMod = (base: string, clusterType: string, notable: string): ModMeta | undefined =>
  modLookup.get(`${base}||${clusterType}`)?.get(notable)

// Fractured mods read "1 Added Passive Skill is <Notable>"; pull the notable name out.
const notableFromFractured = (mod: string): string | null =>
  mod.match(/^1 Added Passive Skill is (.+)$/)?.[1] ?? null

// Inline weight / roll-odds / ilvl / prefix-suffix tag from poedb, if we have a match.
function ModMetaTag({
  base,
  clusterType,
  notable,
}: {
  base: string
  clusterType: string
  notable: string
}) {
  const m = lookupMod(base, clusterType, notable)
  if (!m) return null
  return (
    <span className="mod-meta">
      {' '}
      — w{m.weight} ({m.pct.toFixed(1)}%) · ilvl {m.ilvl} · {m.genType}
    </span>
  )
}

function ClusterJewels() {
  const [data, setData] = useState<ClusterData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<Progress | null>(null)
  const [query, setQuery] = useState('')
  const [baseFilter, setBaseFilter] = useState('All')
  const [raresOnly, setRaresOnly] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [, setTick] = useState(0)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const running = progress?.running ?? false

  // Tick every second so countdowns update between the 2s progress polls.
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  const fetchData = () => {
    if (!LIVE) {
      setData(clusterSnapshot as unknown as ClusterData)
      return Promise.resolve()
    }
    return fetch('/api/cluster-jewels')
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        setData(body)
      })
      .catch((err) => setError(String(err)))
  }

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = null
  }

  // Poll progress while a crawl runs; refresh the aggregate as it grows and once more
  // when it finishes. The crawl lives server-side, so this survives across renders.
  const startPolling = () => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const p: Progress = await fetch('/api/cluster-jewels/progress').then((r) => r.json())
        setProgress(p)
        if (p.phase === 'builds') fetchData()
        if (!p.running) {
          stopPolling()
          fetchData()
        }
      } catch {
        /* transient dev-server hiccup; keep polling */
      }
    }, 2000)
  }

  const startScrape = (mode: 'resume' | 'full') => {
    setError(null)
    fetch(`/api/cluster-jewels?${mode === 'full' ? 'full' : 'refresh'}`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        setData(body)
        startPolling()
      })
      .catch((err) => setError(String(err)))
  }

  const stopScrape = () => {
    fetch('/api/cluster-jewels/stop')
      .then((r) => r.json())
      .then(setProgress)
      .catch(() => {})
  }

  // On mount: load whatever is stored, and (dev only) resume polling if a crawl is
  // already running. In prod there's no backend, so just load the snapshot.
  useEffect(() => {
    fetchData()
    if (!LIVE) return
    fetch('/api/cluster-jewels/progress')
      .then((r) => r.json())
      .then((p: Progress) => {
        setProgress(p)
        if (p.running) startPolling()
      })
      .catch(() => {})
    return stopPolling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const groups = useMemo(() => {
    if (!data) return []
    let jewels = data.jewels
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
      const combos = new Map<string, number>()
      const fractured = new Map<string, number>()
      const smallGrants = new Map<string, number>()
      let fracturedCount = 0
      for (const j of js) {
        for (const n of j.notables) notables.set(n, (notables.get(n) ?? 0) + 1)
        const combo = [...j.notables].sort().join(' + ') || '(no notables)'
        combos.set(combo, (combos.get(combo) ?? 0) + 1)
        if (j.fractured) fracturedCount++
        for (const f of j.fracturedMods) fractured.set(f, (fractured.get(f) ?? 0) + 1)
        for (const g of j.smallGrants) smallGrants.set(g, (smallGrants.get(g) ?? 0) + 1)
      }
      out.push({
        key,
        base,
        clusterType,
        jewels: js,
        notableCounts: [...notables].sort((a, b) => b[1] - a[1]),
        comboCounts: [...combos].sort((a, b) => b[1] - a[1]),
        fracturedCount,
        fracturedCounts: [...fractured].sort((a, b) => b[1] - a[1]),
        smallGrantCounts: [...smallGrants].sort((a, b) => b[1] - a[1]),
      })
    }
    return out.sort((a, b) => b.jewels.length - a.jewels.length)
  }, [data, query, baseFilter, raresOnly])

  const totalShown = groups.reduce((s, g) => s + g.jewels.length, 0)

  return (
    <>
      <p className="subtitle">
        Cluster jewels used by streamer characters, grouped by base and cluster type ·
        cluster-holders fetched heaviest-first, so early results are the most-used jewels
        {data && (
          <>
            {' · '}
            {data.jewels.length} jewels from {data.charactersFetched}/{data.charactersTotal}{' '}
            cluster-holders
            {data.errors > 0 && ` (${data.errors} fetch errors)`}
            {' · '}
            updated {new Date(data.fetchedAt).toLocaleTimeString()}
          </>
        )}
      </p>
      <div className="controls">
        <input
          type="search"
          placeholder="Filter by cluster type, notable, base…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select value={baseFilter} onChange={(e) => setBaseFilter(e.target.value)}>
          <option>All</option>
          <option>Large Cluster Jewel</option>
          <option>Medium Cluster Jewel</option>
          <option>Small Cluster Jewel</option>
        </select>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={raresOnly}
            onChange={(e) => setRaresOnly(e.target.checked)}
          />
          Rares only
        </label>
        {LIVE && (
          <>
            {running ? (
              <button onClick={stopScrape}>Stop</button>
            ) : (
              <button onClick={() => startScrape('resume')}>
                {!data || data.charactersFetched === 0
                  ? 'Start scrape'
                  : data.charactersFetched < data.charactersTotal
                    ? `Resume scrape (${data.charactersFetched}/${data.charactersTotal})`
                    : 'Check for new characters'}
              </button>
            )}
            {!running && data && data.charactersFetched > 0 && (
              <button
                className="ghost"
                title="Clears stored data and refetches all cluster-holders (~77 min at the steady pace)"
                onClick={() => startScrape('full')}
              >
                Full rescrape
              </button>
            )}
            <a className="download" href="/api/characters.csv" download>
              characters.csv
            </a>
            <a className="download" href="/api/cluster-jewels" target="_blank" rel="noreferrer">
              raw JSON
            </a>
          </>
        )}
      </div>

      {error && <div className="error">Failed to load: {error}</div>}

      {running && progress && (
        <div className="status crawling">
          {progress.phase === 'characters' && 'Building character list…'}
          {progress.pausedUntil ? (
            <>
              Rate-limited by poe.ninja — resuming in{' '}
              <strong>{secsUntil(progress.pausedUntil)}s</strong>. Pace backed off to{' '}
              {Math.round(progress.intervalMs / 1000)}s/request.
            </>
          ) : progress.phase === 'builds' && progress.nextRequestAt ? (
            <>
              <strong>{progress.done}</strong> / {progress.total} cluster-holders fetched · next
              request in <strong>{secsUntil(progress.nextRequestAt)}s</strong> (steady{' '}
              {Math.round(progress.intervalMs / 1000)}s/request pace). Progress is saved and resumes
              if interrupted.
            </>
          ) : progress.phase === 'builds' ? (
            <>
              Fetching builds: <strong>{progress.done}</strong> / {progress.total} cluster-holders
              at {Math.round(progress.intervalMs / 1000)}s/request.
            </>
          ) : null}
        </div>
      )}

      {data && (
        <>
          <p className="summary">
            {groups.length} distinct base + type combinations · {totalShown} jewels shown
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Base</th>
                  <th>Cluster Type</th>
                  <th className="num">Count</th>
                  <th className="num">Fractured</th>
                  <th>Top Notables</th>
                </tr>
              </thead>
              <tbody>
                {groups.map((g) => (
                  <Fragment key={g.key}>
                    <tr
                      className="clickable"
                      onClick={() => setExpanded(expanded === g.key ? null : g.key)}
                    >
                      <td>{g.base.replace(' Cluster Jewel', '')}</td>
                      <td className="char">{g.clusterType}</td>
                      <td className="num">{g.jewels.length}</td>
                      <td className="num">{g.fracturedCount || '—'}</td>
                      <td className="notables-cell">
                        {g.notableCounts
                          .slice(0, 3)
                          .map(([n, c]) => `${n} (${c})`)
                          .join(', ')}
                      </td>
                    </tr>
                    {expanded === g.key && (
                      <tr className="detail-row">
                        <td colSpan={5}>
                          <div className="detail">
                            <div>
                              <h3>Notable combinations</h3>
                              <ul>
                                {g.comboCounts.map(([combo, c]) => (
                                  <li key={combo}>
                                    <span className="count">{c}×</span> {combo}
                                  </li>
                                ))}
                              </ul>
                            </div>
                            <div>
                              <h3>Individual notables</h3>
                              <ul>
                                {g.notableCounts.map(([n, c]) => (
                                  <li key={n}>
                                    <span className="count">{c}×</span> {n}
                                    <ModMetaTag base={g.base} clusterType={g.clusterType} notable={n} />
                                  </li>
                                ))}
                              </ul>
                              {g.fracturedCounts.length > 0 && (
                                <>
                                  <h3>Fractured mods</h3>
                                  <ul>
                                    {g.fracturedCounts.map(([mod, c]) => {
                                      const notable = notableFromFractured(mod)
                                      return (
                                        <li key={mod}>
                                          <span className="count">{c}×</span> {mod}
                                          {notable && (
                                            <ModMetaTag
                                              base={g.base}
                                              clusterType={g.clusterType}
                                              notable={notable}
                                            />
                                          )}
                                        </li>
                                      )
                                    })}
                                  </ul>
                                </>
                              )}
                            </div>
                            <div>
                              <h3>
                                Small-passive grants
                                <span className="h3-note"> · explicit "also grant"</span>
                              </h3>
                              {g.smallGrantCounts.length > 0 ? (
                                <ul>
                                  {g.smallGrantCounts.map(([grant, c]) => (
                                    <li key={grant}>
                                      <span className="count">{c}×</span> {grant}
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="empty-note">None on these jewels</p>
                              )}
                            </div>
                            <div>
                              <h3>Used by</h3>
                              <ul>
                                {g.jewels.map((j, i) => (
                                  <li key={i}>
                                    {j.streamer ?? j.character}
                                    <span className="owner">
                                      {' '}
                                      · {j.character} ({j.class}
                                      {j.passives != null && `, ${j.passives} passives`})
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
            {groups.length === 0 && <div className="status">No jewels match the filters.</div>}
          </div>
        </>
      )}
    </>
  )
}

export default ClusterJewels
