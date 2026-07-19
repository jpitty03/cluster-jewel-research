# Cluster Jewel Research

A Path of Exile research tool that scrapes [poe.ninja](https://poe.ninja) builds data and answers the question: **which cluster jewels (and notables) are the most-used builds actually running?**

It combines two populations for a league:

- **Streamers** — every streamer build from the poe.ninja streamers overview.
- **Public ladder** — the top slice (level-sorted, level ≥ 80, top 300) of public non-streamer characters that hold at least one cluster jewel.

For each character it fetches the full build snapshot, extracts equipped cluster jewels (base, size, passives, notables, added skills, prefix/suffix mods), and aggregates everything into a browsable UI with usage counts, per-class breakdowns, and enchantment metadata cross-referenced from [poedb.tw](https://poedb.tw).

## How to use

```sh
npm install
npm run dev        # start the Vite dev server + scraping API
```

Open the app, pick a league, and:

1. **Streamers tab** — sortable table of streamer builds (character, level, life/ES, EHP, cluster jewel count, DPS, …).
2. **Cluster Jewels tab** — aggregated cluster jewel usage: which bases/notables appear, how often, and on which builds. Kick off a crawl from the UI; progress streams live. Crawls **resume** by default (only new/missing characters are fetched — results persist in `data/<league-slug>/`), so re-running after a stop or a new snapshot is cheap.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with live scraping API |
| `npm run scrape` | Headless scrape (`npx tsx scripts/scrape.ts [--league=Mirage] [--full]`) — writes snapshots to `src/data/<league-slug>/` for the static build. `--full` clears the league store and refetches everything. |
| `npm run scrape:poedb` | One-time scrape of poedb.tw cluster enchantment pools (mod weights, ilvl, prefix/suffix) → `src/data/poedb-cluster-mods.json` |
| `npm run publish` | `scrape` + commit/push `src/data`, which triggers the GitHub Actions rebuild/redeploy of the static site |
| `npm run build` | Type-check + production build (bundles the committed data snapshots; no server needed) |

## Main components

```
vite.config.ts            Dev-server API plugin — /api/leagues, /api/streamers,
                          /api/cluster-jewels (crawl control + progress), /api/characters.csv
server/poeninja.ts        poe.ninja client: snapshot-version discovery (fetchSnapshotVersion),
                          streamer overview scraping (scrapeStreamerBuilds / getStreamerBuilds),
                          public ladder cluster-holder search (searchClusterHolders), league list
server/clusterjewels.ts   Crawl engine: rate-limited character fetching (ensureClusterCharacters),
                          cluster jewel extraction/parsing, persistent per-league store,
                          resumable start/stop crawl (startCrawl / stopCrawl / crawlToCompletion),
                          progress reporting (getProgress)
src/App.tsx               App shell: league picker, tabs, streamer build table
src/ClusterJewels.tsx     Cluster jewel aggregation UI (usage counts, notables, enchant metadata)
scripts/scrape.ts         Headless scrape pipeline for the publish flow
scripts/scrape-poedb.mjs  poedb.tw enchantment pool scraper
scripts/publish.mjs       Commits scraped data + pushes to trigger deploy
data/<league-slug>/       Working store: characters.csv, cluster-characters.csv,
                          cluster-jewels.json, character-jewels.json
src/data/<league-slug>/   Committed snapshots bundled into the production build
```

## How it works

- All poe.ninja requests go through the dev server (or the headless script) — never the browser — to avoid CORS and keep parsing server-side. A real browser User-Agent is used and requests are throttled/rate-limit-aware (backs off on 429s).
- poe.ninja's API requires a **snapshot version** per league/endpoint; it's discovered by probing the site's build pages and cached (~5 min), refreshing automatically when a new snapshot invalidates it.
- Character fetches are the expensive part (~1s each), so results are stored permanently with raw mod text retained — changing the parsing logic doesn't require re-crawling.
- The production site is fully static: GitHub Actions builds from the committed `src/data` snapshots, so nothing scrapes at runtime.
