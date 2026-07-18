# Cluster Jewel Research — Plan & Progress

A tool that scrapes poe.ninja streamer builds, extracts cluster jewel usage, joins
poedb.tw craft data (weights / ilvl / prefix-suffix), and publishes a free read-only
static site on GitHub Pages. Live at: https://jpitty03.github.io/cluster-jewel-research/

## Architecture

- **Dev** (`npm run dev`): Vite dev server with a plugin API (`vite.config.ts`) that
  scrapes poe.ninja live. Full crawl controls in the UI.
- **Prod** (GitHub Pages): static build; the UI reads committed JSON snapshots from
  `src/data/` (bundled at build time). Scrape controls hidden.
- **Publish flow**: `npm run publish` → headless scrape → commit `src/data` → push →
  GitHub Actions builds and deploys automatically.

### Key files
- `server/poeninja.ts` — protobuf decoding of poe.ninja's search/dictionary API,
  streamer builds, cluster-holder prioritization, league listing.
- `server/clusterjewels.ts` — the rate-limited per-character crawl (steady 15s pace,
  429 backoff, resume store, zombie-generation guard), per-league data layout.
- `scripts/scrape.ts` — headless scrape pipeline (tsx). `scripts/publish.mjs` — git
  commit/push. `scripts/scrape-poedb.mjs` — one-time poedb mod-pool scrape.
- `src/ClusterJewels.tsx` / `src/App.tsx` — the two tabs. `src/data/` — snapshots.
- `.github/workflows/deploy.yml` — Pages deploy on push to main.

### Hard-won API knowledge
- poe.ninja search/dictionary endpoints: protobuf, NOT rate-limited, support
  `league=X`, `min-level=N`, `min-cjewels=1`, `columns=...`. 100-row cap per query —
  partition by class to get everything.
- Per-character endpoint (`/character?account=..&name=..`): JSON, HEAVILY rate-limited
  (~50 burst, then escalating Cloudflare bans 81s→3294s). Crawl at 15s/request steady.
- Snapshot `version` (in URL path) is embedded in the streamers page HTML and rotates
  frequently.
- Cluster jewels live in the build's `jewels` array; parse hierarchy: `typeLine`
  (base) → `enchantMods` (passive count, sockets, cluster type) → `explicitMods` +
  `fracturedMods` (notables, small-grants, 35% increased Small Passive Effect).
- poedb.tw is server-rendered; enchantment-modifier tables parsed by regex.

## Completed

1. ✅ Vite + React + TS scaffold; poe.ninja protobuf reverse-engineering.
2. ✅ Streamer character list scrape (Characters tab) + `characters.csv`.
3. ✅ Cluster jewel crawl: prioritized cluster-holders only (heaviest first),
   resumable persistent store, raw-mod retention (future parser tweaks need no
   re-crawl), zombie-guard against dev-server reload corruption.
4. ✅ Cluster Jewels tab: groups by base+type (Synthesised merged into normal),
   notable counts/combos, aggregated fractured mods, small-passive grants section,
   "35% increased Small Passive Effect" captured as a notable.
5. ✅ poedb.tw craft data joined: per-pool weight, roll-odds %, ilvl, Prefix/Suffix
   annotations on notables (91% exact match; misses are legacy mix-and-match jewels).
6. ✅ Dark gold UI theme; wider container.
7. ✅ Static-site deploy: dev/prod dual data source, GitHub Actions → Pages,
   `npm run publish` pipeline. Fixed: `.gitignore` excluding `src/data` (anchored to
   `/data/`), Pages Source must be "GitHub Actions" (was serving raw source → white
   page), page title.
8. ✅ Folder renamed `my-vite-app` → `cluster-jewel-research`.

## In progress — per-league data + league selection

Goal: data scoped per league (e.g. `src/data/mirage/…`), a league dropdown to view
(historical leagues supported), a dev-only picker choosing which league to scrape.
Level floor 80. Seed Mirage only for launch; default display = newest league.

Done so far:
- ✅ `src/index.css`: container `width: min(1760px, 96vw)` (fixes cut-off column).
- ✅ `server/poeninja.ts`: `league` + `min-level=80` on all searches;
  `searchClusterHolders(league)`, `scrapeStreamerBuilds(league)`,
  `getStreamerBuilds(league)` (per-league cache), `listPoeLeagues()`; `league` field
  in `StreamerData`.
- ✅ `server/clusterjewels.ts`: all paths league-scoped (`data/<slug>/…`), `slugify`,
  `runCrawl(league, force)`, `crawlToCompletion(league, force)`,
  `getClusterJewels(league, mode)`, `listScrapedLeagues()`, aggregate fallback reads
  committed `src/data/<slug>/` too; `league` in `Progress` + `ClusterData`.
- ✅ `vite.config.ts`: `?league=` on all routes, `/api/leagues` endpoint.
- ✅ `src/ClusterJewels.tsx`: per-league snapshots via `import.meta.glob`, league
  display dropdown, scrape-league picker (dev), league-aware polling/banner.
- ✅ `src/App.tsx`: per-league streamer snapshots via glob, league state + effects.

Remaining:
- [ ] `src/App.tsx`: add the league dropdown to the Characters tab UI; fix the
  Refresh button to call `load(league, true)`.
- [ ] `src/App.css`: styles for `.league-select` + `.ctrl-sep`.
- [ ] `scripts/scrape.ts`: `--league=<Name>` (default Mirage), write to
  `src/data/<slug>/`.
- [ ] Delete obsolete flat snapshots (`src/data/{cluster-jewels,streamers}.json`,
  old flat `data/*` files) and old mixed-league crawl data.
- [ ] Seed Mirage: crawl (~154 holders @15s ≈ 40 min), verify `npx tsc -b`,
  `npm run build` + preview, then commit/push to deploy.
