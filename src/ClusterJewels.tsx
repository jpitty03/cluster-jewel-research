import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import poedbData from './data/poedb-cluster-mods.json'
import { DEFAULT_LEAGUE } from '../league'
import {
  groupJewels,
  type ClusterData,
  type ClusterJewel,
  type Group,
} from './clusterAggregate'
import {
  BASE_ILVLS,
  PRICED_TOP,
  baseKey,
  baseTradeUrl,
  comboTradeUrl,
  pinnedPassives,
  priceKey,
  type ComboCount,
  type PassiveRange,
} from './tradeQuery'

// In dev the Vite plugin serves a live scraping API; a production build is a static
// site with no backend, so it reads the committed per-league snapshots bundled here.
const LIVE = import.meta.env.DEV

interface Progress {
  phase: 'idle' | 'characters' | 'builds' | 'done'
  league: string
  done: number
  total: number
  pausedUntil: number | null
  nextRequestAt: number | null
  intervalMs: number
  running: boolean
}

// Prod: every committed league snapshot is bundled here, keyed by league display name
// and sorted newest-first (by fetch time). This also yields the league dropdown list.
const clusterSnapshots = import.meta.glob('./data/*/cluster-jewels.json', {
  eager: true,
  import: 'default',
}) as Record<string, ClusterData>
const snapshotByLeague: Record<string, ClusterData> = {}
for (const data of Object.values(clusterSnapshots)) snapshotByLeague[data.league] = data
const snapshotLeagues = Object.values(snapshotByLeague)
  .sort((a, b) => (a.fetchedAt < b.fetchedAt ? 1 : -1))
  .map((d) => d.league)

const secsUntil = (epochMs: number) => Math.max(0, Math.round((epochMs - Date.now()) / 1000))

// --- trade prices -----------------------------------------------------------
// Cached by scripts/price.ts at publish time, one snapshot per league, bundled the
// same way as the cluster data above. Amounts stay in the currency each listing was
// posted in — the trade API sorts across currencies, so no conversion is needed.

interface Money {
  amount: number
  currency: string
}

interface PriceEntry {
  low: Money | null
  mid: Money | null
  listed: number
  sampled: number
  passivesMin: number | null
  passivesMax: number | null
  at: string
}

interface PriceFile {
  version: number
  league: string
  fetchedAt: string
  prices: Record<string, PriceEntry>
  bases: Record<string, PriceEntry>
}

const priceSnapshots = import.meta.glob('./data/*/trade-prices.json', {
  eager: true,
  import: 'default',
}) as Record<string, PriceFile>
const pricesByLeague: Record<string, PriceFile> = {}
for (const p of Object.values(priceSnapshots)) pricesByLeague[p.league] = p

// Only the currencies that actually carry cluster jewel prices get an abbreviation;
// anything else prints as the trade site names it rather than guessing.
const SHORT_CURRENCY: Record<string, string> = {
  chaos: 'c',
  divine: 'div',
  exalted: 'ex',
  mirror: 'mir',
}
const num = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/0+$/, ''))
const money = (p: Money | null | undefined) => (p ? `${num(p.amount)} ${p.currency}` : '—')
const shortMoney = (p: Money | null | undefined) =>
  p ? `${num(p.amount)}${SHORT_CURRENCY[p.currency] ?? ` ${p.currency}`}` : '—'

const daysAgo = (iso: string) => {
  const d = Math.round((Date.now() - Date.parse(iso)) / 86_400_000)
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`
}

// The passive roll a group's base price is quoted at. A group can mix rolls — an
// 8-passive large jewel and a 12-passive one are different purchases — so the header
// row quotes its most-used priced combo, and the card says which that is.
function groupBasePassives(file: PriceFile, g: Group) {
  for (const cc of g.comboCounts.slice(0, PRICED_TOP)) {
    if (cc.notables.length === 0) continue
    const passives = pinnedPassives(g.base, cc.notables, cc.passivesMin, cc.passivesMax)
    if (BASE_ILVLS.some((i) => file.bases[baseKey(g.base, g.clusterType, passives, i)]))
      return { passives, cc }
  }
  return null
}

// --- hover card -------------------------------------------------------------

// Anchored panel shown on hover or keyboard focus. It renders into document.body so
// the scrolling table can't clip it, and stays open while the pointer is inside it,
// so it can hold links and (later) interactive content.
function HoverCard({ card, children }: { card: React.ReactNode; children: React.ReactNode }) {
  const [rect, setRect] = useState<DOMRect | null>(null)
  const closeTimer = useRef<number | undefined>(undefined)

  const open = (el: HTMLElement) => {
    window.clearTimeout(closeTimer.current)
    setRect(el.getBoundingClientRect())
  }
  const close = () => {
    window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setRect(null), 120)
  }
  useEffect(() => () => window.clearTimeout(closeTimer.current), [])

  const WIDTH = 340
  // Flip above the trigger when there isn't room below, and keep the panel on screen
  // horizontally — a combo deep in the table can sit anywhere in the viewport.
  const below = rect ? window.innerHeight - rect.bottom > 260 : true
  const style: React.CSSProperties | undefined = rect
    ? {
        width: WIDTH,
        left: Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - WIDTH - 8)),
        ...(below
          ? { top: rect.bottom + 6 }
          : { top: rect.top - 6, transform: 'translateY(-100%)' }),
      }
    : undefined

  return (
    <>
      <span
        className="hover-trigger"
        tabIndex={0}
        onMouseEnter={(e) => open(e.currentTarget)}
        onMouseLeave={close}
        onFocus={(e) => open(e.currentTarget)}
        onBlur={close}
      >
        {children}
      </span>
      {rect &&
        createPortal(
          <div
            className="hover-card"
            style={style}
            onMouseEnter={() => window.clearTimeout(closeTimer.current)}
            onMouseLeave={close}
            // Portalled content still bubbles through the React tree, so without this
            // a click inside the card would also toggle the row it was opened from.
            onClick={(e) => e.stopPropagation()}
          >
            {card}
          </div>,
          document.body,
        )}
    </>
  )
}

// The card body behind both the combo chip and the header row's base price: what the
// white base costs at each craftable item level, what a finished one sells for, and
// (eventually) how to get from one to the other.
function PriceCard({
  league,
  base,
  clusterType,
  passives,
  comboLabel,
  entry,
}: {
  league: string
  base: string
  clusterType: string
  passives: PassiveRange
  comboLabel: string | null
  entry: PriceEntry | null
}) {
  const file = pricesByLeague[league]
  const passiveText =
    passives.min == null
      ? 'any passive count'
      : passives.min === passives.max
        ? `${passives.min} passives`
        : `${passives.min}–${passives.max} passives`

  return (
    <>
      <div className="hc-head">
        <strong>{base}</strong>
        <span>{clusterType}</span>
        {comboLabel && <span className="hc-combo">{comboLabel}</span>}
      </div>

      <div className="hc-section">
        <h4>Base price</h4>
        {BASE_ILVLS.map((ilvl) => {
          const b = file?.bases[baseKey(base, clusterType, passives, ilvl)]
          const url = baseTradeUrl(league, base, clusterType, passives, ilvl)
          return (
            <div className="hc-row" key={ilvl}>
              <span className="hc-label">ilvl {ilvl}</span>
              <span className="hc-value">
                {b && b.listed > 0 ? (
                  <>
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer">
                        {money(b.low)}
                      </a>
                    ) : (
                      money(b.low)
                    )}
                    {b.mid && money(b.mid) !== money(b.low) && (
                      <span className="hc-dim"> · median {money(b.mid)}</span>
                    )}
                  </>
                ) : (
                  <span className="hc-dim">{b ? 'none listed' : 'not priced'}</span>
                )}
              </span>
            </div>
          )
        })}
      </div>

      {entry && (
        <div className="hc-section">
          <h4>Completed cost</h4>
          <div className="hc-row">
            <span className="hc-label">cheapest</span>
            <span className="hc-value">{entry.listed > 0 ? money(entry.low) : '—'}</span>
          </div>
          <div className="hc-row">
            <span className="hc-label">median</span>
            <span className="hc-value">{entry.listed > 0 ? money(entry.mid) : '—'}</span>
          </div>
        </div>
      )}

      <div className="hc-section">
        <h4>Crafting steps</h4>
        <p className="hc-dim">TBD</p>
      </div>

      <div className="hc-foot">
        {passiveText}, uncorrupted
        {entry && entry.listed > 0 && (
          <>
            {' · '}
            {entry.listed} listed, {entry.sampled} sampled
          </>
        )}
        {entry && ` · priced ${daysAgo(entry.at)}`}
      </div>
    </>
  )
}

// Price chip on a notable combination: the cheapest listing, with everything else in
// the card behind it. Renders nothing when the combo wasn't priced (only the top few
// per group are), so unpriced rows stay clean.
function ComboPrice({
  league,
  base,
  clusterType,
  cc,
}: {
  league: string
  base: string
  clusterType: string
  cc: ComboCount
}) {
  const file = pricesByLeague[league]
  const entry = file?.prices[priceKey(base, clusterType, cc.combo)]
  if (!entry) return null
  const passives = pinnedPassives(base, cc.notables, cc.passivesMin, cc.passivesMax)

  return (
    <HoverCard
      card={
        <PriceCard
          league={league}
          base={base}
          clusterType={clusterType}
          passives={passives}
          comboLabel={cc.combo}
          entry={entry}
        />
      }
    >
      <span className={`combo-price${entry.listed === 0 ? ' none' : ''}`}>
        <span className="sep">·</span>
        {entry.listed === 0 ? 'none listed' : shortMoney(entry.low)}
      </span>
    </HoverCard>
  )
}

// Base price cell on the collapsed group row: what a white base costs at each
// craftable item level, quoted for the group's most-used combo's passive roll.
function GroupBasePrice({ league, g }: { league: string; g: Group }) {
  const file = pricesByLeague[league]
  const pick = file && groupBasePassives(file, g)
  if (!file || !pick) return <span className="dim">—</span>

  return (
    <HoverCard
      card={
        <PriceCard
          league={league}
          base={g.base}
          clusterType={g.clusterType}
          passives={pick.passives}
          comboLabel={null}
          entry={null}
        />
      }
    >
      <span className="base-price-cell">
        {BASE_ILVLS.map((ilvl) => {
          const b = file.bases[baseKey(g.base, g.clusterType, pick.passives, ilvl)]
          return (
            <span className="base-ilvl" key={ilvl}>
              <span className="hc-label">i{ilvl}</span>
              {b && b.listed > 0 ? shortMoney(b.low) : '—'}
            </span>
          )
        })}
      </span>
    </HoverCard>
  )
}

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

// "Used by" rows: collapse one row per jewel into one row per character with a
// count. Most jewels have no streamer attribution (public-ladder builds), in
// which case only the character name is shown — previously the character name
// was printed twice via the `streamer ?? character` fallback.
interface UsedByRow {
  key: string
  streamer: string | null
  character: string
  class: string
  passives: number | null
  count: number
}
function usedByRows(jewels: ClusterJewel[]): UsedByRow[] {
  const rows = new Map<string, UsedByRow>()
  for (const j of jewels) {
    const key = `${j.account}||${j.character}||${j.passives}`
    const row = rows.get(key)
    if (row) row.count++
    else
      rows.set(key, {
        key,
        streamer: j.streamer,
        character: j.character,
        class: j.class,
        passives: j.passives,
        count: 1,
      })
  }
  return [...rows.values()].sort((a, b) => b.count - a.count)
}

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
  const [leagues, setLeagues] = useState<string[]>(snapshotLeagues)
  const [league, setLeague] = useState<string>(snapshotLeagues[0] ?? DEFAULT_LEAGUE)
  const [scrapeLeagues, setScrapeLeagues] = useState<string[]>([])
  const [scrapeLeague, setScrapeLeague] = useState<string>(DEFAULT_LEAGUE)
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

  const loadLeagueData = (l: string) => {
    if (!LIVE) {
      setData(snapshotByLeague[l] ?? null)
      return Promise.resolve()
    }
    return fetch(`/api/cluster-jewels?league=${encodeURIComponent(l)}`)
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

  // Poll progress while a crawl runs; refresh the crawling league's aggregate as it
  // grows and once more when it finishes. The crawl lives server-side.
  const startPolling = () => {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      try {
        const p: Progress = await fetch('/api/cluster-jewels/progress').then((r) => r.json())
        setProgress(p)
        if (p.phase === 'builds') loadLeagueData(p.league)
        if (!p.running) {
          stopPolling()
          loadLeagueData(p.league)
        }
      } catch {
        /* transient dev-server hiccup; keep polling */
      }
    }, 2000)
  }

  const startScrape = (mode: 'resume' | 'full') => {
    setError(null)
    setLeague(scrapeLeague) // the display follows the league being crawled
    fetch(
      `/api/cluster-jewels?league=${encodeURIComponent(scrapeLeague)}&${
        mode === 'full' ? 'full' : 'refresh'
      }`,
    )
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

  // Load the selected league's data whenever the display league changes.
  useEffect(() => {
    if (league) loadLeagueData(league)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [league])

  // On mount (dev only): populate the league lists and resume polling if a crawl is
  // already running. Prod uses the bundled snapshot leagues set in initial state.
  useEffect(() => {
    if (!LIVE) return
    fetch('/api/leagues')
      .then((r) => r.json())
      .then((d: { scraped: string[]; poe: string[] }) => {
        const scraped = d.scraped ?? []
        setLeagues(scraped.length ? scraped : [DEFAULT_LEAGUE])
        setScrapeLeagues(d.poe ?? [])
        setLeague((cur) => (scraped.includes(cur) ? cur : (scraped[0] ?? DEFAULT_LEAGUE)))
      })
      .catch(() => {})
    fetch('/api/cluster-jewels/progress')
      .then((r) => r.json())
      .then((p: Progress) => {
        setProgress(p)
        if (p.running) {
          if (p.league) setLeague(p.league)
          startPolling()
        }
      })
      .catch(() => {})
    return stopPolling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Shared with scripts/price.ts so the combos priced are the ones rendered here.
  const groups = useMemo(
    () => (data ? groupJewels(data.jewels, { raresOnly, baseFilter, query }) : []),
    [data, query, baseFilter, raresOnly],
  )

  const totalShown = groups.reduce((s, g) => s + g.jewels.length, 0)

  return (
    <>
      <p className="subtitle">
        Cluster jewels used by <strong>{league}</strong> streamer characters (level 80+),
        grouped by base and cluster type · fetched heaviest-first, so early results are the
        most-used jewels
        {data && (
          <>
            {' · '}
            {data.jewels.length} jewels from {data.charactersFetched}/{data.charactersTotal}{' '}
            cluster-holders
            {data.errors > 0 && ` (${data.errors} fetch errors)`}
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
            <span className="ctrl-sep" />
            <label className="league-select" title="League to scrape">
              <span>Scrape</span>
              <select
                value={scrapeLeague}
                disabled={running}
                onChange={(e) => setScrapeLeague(e.target.value)}
              >
                {(scrapeLeagues.length ? scrapeLeagues : [scrapeLeague]).map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            {running ? (
              <button onClick={stopScrape}>Stop</button>
            ) : (
              <button onClick={() => startScrape('resume')}>
                {!data || data.league !== scrapeLeague || data.charactersFetched === 0
                  ? `Scrape ${scrapeLeague}`
                  : data.charactersFetched < data.charactersTotal
                    ? `Resume (${data.charactersFetched}/${data.charactersTotal})`
                    : 'Check for new'}
              </button>
            )}
            {!running && data && data.league === scrapeLeague && data.charactersFetched > 0 && (
              <button
                className="ghost"
                title="Clears stored data and refetches all cluster-holders for this league"
                onClick={() => startScrape('full')}
              >
                Full rescrape
              </button>
            )}
            <a
              className="download"
              href={`/api/characters.csv?league=${encodeURIComponent(league)}`}
              download
            >
              characters.csv
            </a>
            <a
              className="download"
              href={`/api/cluster-jewels?league=${encodeURIComponent(league)}`}
              target="_blank"
              rel="noreferrer"
            >
              raw JSON
            </a>
          </>
        )}
      </div>

      {error && <div className="error">Failed to load: {error}</div>}

      {running && progress && (
        <div className="status crawling">
          <strong>{progress.league}</strong>:{' '}
          {progress.phase === 'characters' && 'building character list…'}
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
                  <th>Base Price</th>
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
                      <td className="base-price-col">
                        <GroupBasePrice league={league} g={g} />
                      </td>
                    </tr>
                    {expanded === g.key && (
                      <tr className="detail-row">
                        <td colSpan={5}>
                          <div className="detail">
                            <div>
                              <h3>Notable combinations</h3>
                              <ul>
                                {g.comboCounts.map((cc) => {
                                  const url = comboTradeUrl(league, g.base, g.clusterType, cc)
                                  return (
                                    <li key={cc.combo}>
                                      <span className="count">{cc.count}×</span>{' '}
                                      {url ? (
                                        <a
                                          href={url}
                                          target="_blank"
                                          rel="noreferrer"
                                          title="Search this combo on pathofexile.com/trade"
                                        >
                                          {cc.combo}
                                        </a>
                                      ) : (
                                        cc.combo
                                      )}
                                      <ComboPrice
                                        league={league}
                                        base={g.base}
                                        clusterType={g.clusterType}
                                        cc={cc}
                                      />
                                    </li>
                                  )
                                })}
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
                                {usedByRows(g.jewels).map((r) => (
                                  <li key={r.key}>
                                    <span className="count">{r.count}×</span>{' '}
                                    {r.streamer ?? r.character}
                                    <span className="owner">
                                      {r.streamer != null && r.streamer !== r.character && (
                                        <> · {r.character}</>
                                      )}{' '}
                                      ({r.class}
                                      {r.passives != null && `, ${r.passives} passives`})
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
