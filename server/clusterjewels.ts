// Cluster jewel scraper: walks the streamer character list (persisted to
// data/characters.csv), fetches each character's build JSON from poe.ninja,
// and extracts every equipped cluster jewel for popularity analysis.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { UA, fetchSnapshotVersion, getStreamerBuilds, searchClusterHolders } from './poeninja'

const DATA_DIR = join(process.cwd(), 'data')
const CSV_PATH = join(DATA_DIR, 'characters.csv')
const CLUSTER_CSV_PATH = join(DATA_DIR, 'cluster-characters.csv')
const JSON_PATH = join(DATA_DIR, 'cluster-jewels.json')
const STORE_PATH = join(DATA_DIR, 'character-jewels.json')

// poe.ninja rate-limits the character endpoint aggressively: 429s whose Retry-After
// escalates with repeat offenses (observed 81s -> 168s -> 865s -> 3294s). Rapid
// bursts are what trip it, so we crawl at a slow *steady* interval (one request every
// N seconds) rather than in bursts, and back the interval off further on any 429.
// Per-character results are persisted so an interrupted run resumes.
const START_INTERVAL_MS = 15_000 // steady gap between requests
const MAX_INTERVAL_MS = 60_000 // adaptive ceiling after repeated 429s

// ---------- character list (CSV) ----------

export interface CharacterRef {
  account: string
  name: string
  streamer: string | null
  class: string
}

export async function ensureCharactersCsv(force = false): Promise<CharacterRef[]> {
  if (!force && existsSync(CSV_PATH)) {
    const lines = readFileSync(CSV_PATH, 'utf8').trim().split('\n').slice(1)
    return lines.map((line) => {
      const [account, name, cls, ...rest] = line.split(',')
      return { account, name, class: cls, streamer: rest.join(',') || null }
    })
  }
  const { builds } = await getStreamerBuilds(force)
  const chars: CharacterRef[] = builds.map((b) => ({
    account: b.account,
    name: b.name,
    class: b.class,
    streamer: b.streamerName,
  }))
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(
    CSV_PATH,
    'account,name,class,streamer\n' +
      chars.map((c) => `${c.account},${c.name},${c.class},${c.streamer ?? ''}`).join('\n') +
      '\n',
  )
  return chars
}

// The crawl's actual target list: only characters that hold ≥1 cluster jewel, sorted
// by total cluster count descending (heaviest users first). Built from the
// non-rate-limited search endpoint and persisted so it can be reused without
// re-querying. This is what makes the rate-limited per-character crawl tractable.
export async function ensureClusterCharacters(force = false): Promise<CharacterRef[]> {
  if (!force && existsSync(CLUSTER_CSV_PATH)) {
    const lines = readFileSync(CLUSTER_CSV_PATH, 'utf8').trim().split('\n').slice(1)
    return lines.map((line) => {
      const [account, name, cls, streamer] = line.split(',')
      return { account, name, class: cls, streamer: streamer || null }
    })
  }
  const { holders } = await searchClusterHolders()
  mkdirSync(DATA_DIR, { recursive: true })
  writeFileSync(
    CLUSTER_CSV_PATH,
    'account,name,class,streamer,cjewels,lcjewels,mcjewels,scjewels\n' +
      holders
        .map(
          (h) =>
            `${h.account},${h.name},${h.class},${h.streamerName ?? ''},` +
            `${h.cjewels},${h.lcjewels},${h.mcjewels},${h.scjewels}`,
        )
        .join('\n') +
      '\n',
  )
  return holders.map((h) => ({
    account: h.account,
    name: h.name,
    class: h.class,
    streamer: h.streamerName,
  }))
}

// ---------- cluster jewel extraction ----------

export interface ClusterJewel {
  base: string // typeLine, e.g. "Large Cluster Jewel"
  itemName: string // rare name or unique name (e.g. "Voices")
  rarity: string
  ilvl: number | null
  passives: number | null // enchant "Adds N Passive Skills"
  jewelSockets: number // enchant "N Added Passive Skills are Jewel Sockets"
  clusterType: string // enchant "Added Small Passive Skills grant: X"
  notables: string[] // explicit + fractured "1 Added Passive Skill is X"
  smallGrants: string[] // explicit "Added Small Passive Skills (also) grant: X"
  fracturedMods: string[]
  fractured: boolean
  corrupted: boolean
  character: string
  account: string
  streamer: string | null
  class: string
  // Raw mod text, retained so future parser tweaks can re-derive without re-crawling.
  rawEnchant: string[]
  rawExplicit: string[]
}

interface ItemData {
  typeLine?: string
  name?: string
  rarity?: string
  ilvl?: number
  fractured?: boolean
  corrupted?: boolean
  enchantMods?: string[]
  explicitMods?: string[]
  fracturedMods?: string[]
}

function parseClusterJewel(it: ItemData, owner: CharacterRef): ClusterJewel {
  const enchants = it.enchantMods ?? []
  const explicit = it.explicitMods ?? []
  const fracturedMods = it.fracturedMods ?? []

  let passives: number | null = null
  let jewelSockets = 0
  const typeLines: string[] = []
  for (const e of enchants) {
    const p = e.match(/^Adds (\d+) Passive Skills?$/)
    if (p) passives = Number(p[1])
    const s = e.match(/^(\d+) Added Passive Skills? (?:are|is a) Jewel Sockets?$/)
    if (s) jewelSockets = Number(s[1])
    // Type line may pack two variants separated by \n (e.g. Staff + Mace)
    for (const part of e.split('\n')) {
      const t = part.match(/^Added Small Passive Skills grant: (.+)$/)
      if (t) typeLines.push(t[1])
    }
  }

  const notables: string[] = []
  const smallGrants: string[] = []
  for (const m of [...explicit, ...fracturedMods]) {
    const n = m.match(/^1 Added Passive Skill is (.+)$/)
    if (n) {
      notables.push(n[1])
      continue
    }
    // "Added Small Passive Skills have 35% increased Effect" — the stat-stacking
    // multiplier. It's not a named passive, but treat it as a notable so it shows
    // up in the notable counts/columns. Dedupe (it can be both explicit + fractured).
    const eff = m.match(/^Added Small Passive Skills have (\d+)% increased Effect$/)
    if (eff) {
      const label = `${eff[1]}% increased Small Passive Effect`
      if (!notables.includes(label)) notables.push(label)
      continue
    }
    const g = m.match(/^Added Small Passive Skills also grant: (.+)$/)
    if (g) smallGrants.push(g[1])
  }

  return {
    base: it.typeLine ?? 'Unknown',
    itemName: it.name ?? '',
    rarity: it.rarity ?? 'Unknown',
    ilvl: it.ilvl ?? null,
    passives,
    jewelSockets,
    clusterType: typeLines.join(' / ') || '(none)',
    notables,
    smallGrants,
    fracturedMods,
    fractured: it.fractured ?? fracturedMods.length > 0,
    corrupted: it.corrupted ?? false,
    character: owner.name,
    account: owner.account,
    streamer: owner.streamer,
    class: owner.class,
    rawEnchant: enchants,
    rawExplicit: explicit,
  }
}

// ---------- scraping ----------

export interface ClusterData {
  fetchedAt: string
  snapshotVersion: string
  charactersTotal: number
  charactersFetched: number
  errors: number
  jewels: ClusterJewel[]
}

export interface Progress {
  phase: 'idle' | 'characters' | 'builds' | 'done'
  done: number
  total: number
  pausedUntil: number | null // epoch ms; set while waiting out a 429 ban
  nextRequestAt: number | null // epoch ms; set during the steady inter-request gap
  intervalMs: number // current steady pace between requests
  running: boolean
}

const IDLE_PROGRESS: Progress = {
  phase: 'idle',
  done: 0,
  total: 0,
  pausedUntil: null,
  nextRequestAt: null,
  intervalMs: START_INTERVAL_MS,
  running: false,
}

let progress: Progress = { ...IDLE_PROGRESS }
export const getProgress = () => progress

// Guard against zombie crawls: Vite's dev-server reloads this module on edit, but an
// in-flight async crawl loop from the *previous* module instance keeps running in the
// same Node process — a zombie that can overwrite the store with stale data. Each
// module load claims a monotonically increasing generation on globalThis; a crawl
// only runs and only writes to disk while it owns the current generation.
declare global {
  // eslint-disable-next-line no-var
  var __clusterCrawlGen: number | undefined
}
const CRAWL_GEN = (globalThis.__clusterCrawlGen = (globalThis.__clusterCrawlGen ?? 0) + 1)
const isCurrentGen = () => globalThis.__clusterCrawlGen === CRAWL_GEN

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Sleep until `untilMs`, but wake early (within ~1s) if the crawl is stopped or this
// module instance has been superseded, so long ban/rest waits don't block or zombie.
async function sleepUntilOrStopped(untilMs: number): Promise<void> {
  while (Date.now() < untilMs && progress.running && isCurrentGen()) {
    await sleep(Math.min(1000, untilMs - Date.now()))
  }
}

interface CharStore {
  [accountSlashName: string]: { fetchedAt: string; jewels: ClusterJewel[] }
}

function loadStore(): CharStore {
  if (!existsSync(STORE_PATH)) return {}
  try {
    return JSON.parse(readFileSync(STORE_PATH, 'utf8')) as CharStore
  } catch {
    return {}
  }
}

async function fetchCharacter(version: string, c: CharacterRef): Promise<Response> {
  const qs = new URLSearchParams({
    account: c.account,
    name: c.name,
    overview: 'streamers',
    type: '2',
    timeMachine: '',
  })
  return fetch(`https://poe.ninja/poe1/api/builds/${version}/character?${qs}`, {
    headers: { 'user-agent': UA, accept: 'application/json' },
  })
}

async function runCrawl(force: boolean): Promise<void> {
  progress = { ...IDLE_PROGRESS, phase: 'characters', running: true }
  // Target only cluster-jewel holders, heaviest first. Always rebuild the list —
  // it comes from the non-rate-limited search endpoint, and a fresh list lets a
  // resume pick up characters that appeared since the last crawl.
  const chars = await ensureClusterCharacters(true)
  const version = await fetchSnapshotVersion()

  const store: CharStore = force ? {} : loadStore()
  const pending = chars.filter((c) => !store[`${c.account}/${c.name}`])
  let errors = 0

  // Adaptive pace: steady interval between requests, backed off further on 429.
  let intervalMs = START_INTERVAL_MS

  const save = () => {
    if (!isCurrentGen()) return // never let a superseded (zombie) crawl touch disk
    mkdirSync(DATA_DIR, { recursive: true })
    writeFileSync(STORE_PATH, JSON.stringify(store))
    writeFileSync(JSON_PATH, JSON.stringify(aggregate(chars, store, version, errors), null, 2))
  }

  progress = {
    ...progress,
    phase: 'builds',
    done: chars.length - pending.length,
    total: chars.length,
    intervalMs,
  }

  outer: for (const c of pending) {
    if (!progress.running || !isCurrentGen()) break // stopped, or superseded by a reload

    // Fetch one character, honoring 429 by waiting out Retry-After and retrying.
    for (;;) {
      let res: Response
      try {
        res = await fetchCharacter(version, c)
      } catch {
        errors++
        break
      }

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || 60
        // Back the steady pace off so we stop tripping the limit.
        intervalMs = Math.min(MAX_INTERVAL_MS, Math.round(intervalMs * 1.5))
        console.warn(
          `[poeninja] rate limited; waiting ${retryAfter}s, ` +
            `pace now ${Math.round(intervalMs / 1000)}s/request`,
        )
        progress = { ...progress, pausedUntil: Date.now() + retryAfter * 1000, intervalMs }
        save()
        await sleepUntilOrStopped(Date.now() + retryAfter * 1000 + 2000)
        progress = { ...progress, pausedUntil: null }
        if (!progress.running || !isCurrentGen()) break outer // stopped/superseded mid-wait
        continue // retry same character
      }

      if (!res.ok) {
        errors++
        break
      }

      const build = (await res.json()) as { jewels?: { itemData?: ItemData }[] }
      const jewels: ClusterJewel[] = []
      for (const j of build.jewels ?? []) {
        const it = j.itemData
        if (it?.typeLine?.includes('Cluster Jewel')) jewels.push(parseClusterJewel(it, c))
      }
      store[`${c.account}/${c.name}`] = { fetchedAt: new Date().toISOString(), jewels }
      break
    }

    progress = { ...progress, done: progress.done + 1 }
    save() // slow pace, so persist after every character for maximum resume safety

    // Steady wait before the next request (skip after the final character).
    if (progress.running && progress.done < chars.length) {
      progress = { ...progress, nextRequestAt: Date.now() + intervalMs }
      await sleepUntilOrStopped(Date.now() + intervalMs)
      progress = { ...progress, nextRequestAt: null }
    }
  }

  save()
  const completed = Object.keys(store).length + errors >= chars.length
  progress = {
    ...progress,
    phase: completed ? 'done' : 'idle', // 'idle' = stopped partway; resumable
    done: completed ? chars.length : progress.done,
    total: chars.length,
    pausedUntil: null,
    nextRequestAt: null,
    running: false,
  }
}

function aggregate(
  chars: CharacterRef[],
  store: CharStore,
  version: string,
  errors: number,
): ClusterData {
  const jewels: ClusterJewel[] = []
  for (const entry of Object.values(store)) jewels.push(...entry.jewels)
  return {
    fetchedAt: new Date().toISOString(),
    snapshotVersion: version,
    charactersTotal: chars.length,
    charactersFetched: Object.keys(store).length,
    errors,
    jewels,
  }
}

// ---------- background runner ----------

// The crawl runs detached from any HTTP request (it can take ~1 hour). Requests
// just read the current aggregate; the UI polls getProgress() until phase 'done'.
let crawlPromise: Promise<void> | null = null

function readStoredAggregate(): ClusterData | null {
  if (!existsSync(JSON_PATH)) return null
  try {
    return JSON.parse(readFileSync(JSON_PATH, 'utf8')) as ClusterData
  } catch {
    return null
  }
}

// Kick off a crawl if one isn't already running. No-op while running.
export function startCrawl(mode: 'resume' | 'full'): void {
  if (crawlPromise) return
  crawlPromise = runCrawl(mode === 'full')
    .catch((err) => {
      console.error('[poeninja] crawl failed:', err)
      progress = { ...progress, phase: 'idle', running: false }
    })
    .finally(() => {
      crawlPromise = null
    })
}

// Signal the running crawl to stop after the current character.
export function stopCrawl(): void {
  progress = { ...progress, running: false }
}

// Run the crawl to completion and return the aggregate. For headless use (the
// publish pipeline) — no dev server involved. Defaults to resume so routine updates
// only fetch new/missing cluster-holders.
export async function crawlToCompletion(force = false): Promise<ClusterData> {
  await runCrawl(force)
  return (
    readStoredAggregate() ?? {
      fetchedAt: new Date().toISOString(),
      snapshotVersion: '',
      charactersTotal: progress.total,
      charactersFetched: progress.done,
      errors: 0,
      jewels: [],
    }
  )
}

// 'cache': just read the stored aggregate. 'resume'/'full': start a crawl (if not
// already running) and return whatever aggregate exists right now; the UI polls
// progress for the rest.
export async function getClusterJewels(
  mode: 'cache' | 'resume' | 'full' = 'cache',
): Promise<ClusterData> {
  if (mode !== 'cache') startCrawl(mode)
  return (
    readStoredAggregate() ?? {
      fetchedAt: new Date().toISOString(),
      snapshotVersion: '',
      charactersTotal: progress.total,
      charactersFetched: progress.done,
      errors: 0,
      jewels: [],
    }
  )
}

export function charactersCsv(): string | null {
  return existsSync(CSV_PATH) ? readFileSync(CSV_PATH, 'utf8') : null
}
