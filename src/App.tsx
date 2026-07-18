import { useEffect, useMemo, useState } from 'react'
import ClusterJewels from './ClusterJewels'
import './App.css'

// Dev serves a live scraping API; a production build reads the committed snapshots.
const LIVE = import.meta.env.DEV

interface StreamerBuild {
  name: string
  account: string
  class: string
  level: number | null
  dps: string | null
  league: string | null
  seen: string | null
  streamerLogin: string | null
  streamerName: string | null
  live: boolean
}

interface StreamerData {
  fetchedAt: string
  snapshotVersion: string
  league: string
  total: number
  builds: StreamerBuild[]
}

type SortKey = 'name' | 'streamerName' | 'class' | 'level' | 'league' | 'seen'

// Prod: bundle every committed league's streamer snapshot, keyed by league name.
const streamerSnapshots = import.meta.glob('./data/*/streamers.json', {
  eager: true,
  import: 'default',
}) as Record<string, StreamerData>
const streamersByLeague: Record<string, StreamerData> = {}
for (const d of Object.values(streamerSnapshots)) streamersByLeague[d.league] = d
const snapshotLeagues = Object.values(streamersByLeague)
  .sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : -1))
  .map((d) => d.league)

function App() {
  const [tab, setTab] = useState<'jewels' | 'characters'>('jewels')
  const [data, setData] = useState<StreamerData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [leagues, setLeagues] = useState<string[]>(snapshotLeagues)
  const [league, setLeague] = useState<string>(snapshotLeagues[0] ?? 'Mirage')
  const [query, setQuery] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('level')
  const [sortDesc, setSortDesc] = useState(true)

  const load = (l: string, refresh = false) => {
    if (!LIVE) {
      setData(streamersByLeague[l] ?? null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    fetch(`/api/streamers?league=${encodeURIComponent(l)}${refresh ? '&refresh' : ''}`)
      .then(async (res) => {
        const body = await res.json()
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`)
        setData(body)
      })
      .catch((err) => setError(String(err)))
      .finally(() => setLoading(false))
  }

  // Load the selected league whenever it changes.
  useEffect(() => load(league), [league])

  // Dev: populate the league dropdown from already-scraped leagues.
  useEffect(() => {
    if (!LIVE) return
    fetch('/api/leagues')
      .then((r) => r.json())
      .then((d: { scraped: string[] }) => {
        const scraped = d.scraped ?? []
        setLeagues(scraped.length ? scraped : ['Mirage'])
        setLeague((cur) => (scraped.includes(cur) ? cur : (scraped[0] ?? 'Mirage')))
      })
      .catch(() => {})
  }, [])

  const rows = useMemo(() => {
    if (!data) return []
    const q = query.trim().toLowerCase()
    let out = data.builds
    if (q) {
      out = out.filter(
        (b) =>
          b.name.toLowerCase().includes(q) ||
          (b.streamerName ?? '').toLowerCase().includes(q) ||
          b.class.toLowerCase().includes(q) ||
          (b.league ?? '').toLowerCase().includes(q),
      )
    }
    const dir = sortDesc ? -1 : 1
    return [...out].sort((a, b) => {
      if (sortKey === 'level') return dir * ((a.level ?? 0) - (b.level ?? 0))
      const av = (a[sortKey] ?? '').toString().toLowerCase()
      const bv = (b[sortKey] ?? '').toString().toLowerCase()
      return dir * av.localeCompare(bv)
    })
  }, [data, query, sortKey, sortDesc])

  const setSort = (key: SortKey) => {
    if (key === sortKey) setSortDesc((d) => !d)
    else {
      setSortKey(key)
      setSortDesc(key === 'level')
    }
  }

  const arrow = (key: SortKey) => (sortKey === key ? (sortDesc ? ' ▾' : ' ▴') : '')

  return (
    <div className="app">
      <header>
        <h1>PoE Streamer Scraper</h1>
        <nav className="tabs">
          <button className={tab === 'jewels' ? 'active' : ''} onClick={() => setTab('jewels')}>
            Cluster Jewels
          </button>
          <button
            className={tab === 'characters' ? 'active' : ''}
            onClick={() => setTab('characters')}
          >
            Characters
          </button>
        </nav>
      </header>

      {tab === 'jewels' && <ClusterJewels />}

      {tab === 'characters' && (
        <>
          <p className="subtitle">
            <strong>{league}</strong> streamer builds (level 80+) scraped from poe.ninja
            {data && (
              <>
                {' · '}
                {data.builds.length} of {data.total} builds
                {' · '}
                updated {new Date(data.fetchedAt).toLocaleDateString()}
              </>
            )}
          </p>
          <div className="controls">
            <label className="league-select" title="League to display">
              <span>League</span>
              <select value={league} onChange={(e) => setLeague(e.target.value)}>
                {(leagues.length ? leagues : [league]).map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <input
              type="search"
              placeholder="Filter by character, streamer, class, league…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {LIVE && (
              <button onClick={() => load(league, true)} disabled={loading}>
                {loading ? 'Refreshing…' : 'Refresh'}
              </button>
            )}
          </div>

          {error && <div className="error">Failed to load: {error}</div>}

          {loading && !data && <div className="status">Scraping poe.ninja…</div>}

          {data && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th onClick={() => setSort('name')}>Character{arrow('name')}</th>
                <th onClick={() => setSort('streamerName')}>Streamer{arrow('streamerName')}</th>
                <th onClick={() => setSort('class')}>Class{arrow('class')}</th>
                <th onClick={() => setSort('level')} className="num">
                  Level{arrow('level')}
                </th>
                <th className="num">DPS</th>
                <th onClick={() => setSort('league')}>League{arrow('league')}</th>
                <th onClick={() => setSort('seen')}>Seen{arrow('seen')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={`${b.account}/${b.name}`}>
                  <td className="char">{b.name}</td>
                  <td>
                    {b.streamerLogin ? (
                      <a
                        href={`https://twitch.tv/${b.streamerLogin}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {b.live && <span className="live-dot" title="Live" />}
                        {b.streamerName}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{b.class}</td>
                  <td className="num">{b.level ?? '—'}</td>
                  <td className="num">{b.dps ?? '—'}</td>
                  <td>{b.league ?? '—'}</td>
                  <td>{b.seen ?? '—'}</td>
                </tr>
              ))}
            </tbody>
              </table>
              {rows.length === 0 && <div className="status">No builds match “{query}”.</div>}
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default App
