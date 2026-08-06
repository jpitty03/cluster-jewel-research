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
| `npm run scrape` | Headless scrape (`npx tsx scripts/scrape.ts [--league=<Name>] [--full]`) — writes snapshots to `src/data/<league-slug>/` for the static build. `--full` clears the league store and refetches everything. |
| `npm run scrape:poedb` | One-time scrape of poedb.tw cluster enchantment pools (mod weights, ilvl, prefix/suffix) → `src/data/poedb-cluster-mods.json` |
| `npm run price` | Prices the most-used notable combos on pathofexile.com/trade (`npx tsx scripts/price.ts [--league=<Name>] [--top=N] [--ttl=<hours>] [--max=N] [--full]`) → `src/data/<league-slug>/trade-prices.json` |
| `npm run publish` | `scrape` + `price` + commit/push `src/data`, which triggers the GitHub Actions rebuild/redeploy of the static site |
| `npm run build` | Type-check + production build (bundles the committed data snapshots; no server needed) |

### Trade prices

`npm run price` runs the same `pathofexile.com/trade` search the UI links to for each of the
top **5** combos per base + cluster-type group, plus the uncrafted white base behind each of them at
**ilvl 83 and ilvl 84** (84 is where the last notable tier unlocks, so it's priced separately from
the cheaper 83), and caches the cheapest and median of the ten cheapest listings.

In the UI the group row carries three price columns:

| Column | What it is |
| --- | --- |
| **Base Price** | the white base at `i83` / `i84`, for the passive roll the group's most-used combo targets |
| **Cheapest** | the cheapest listing across the group's priced combos |
| **Median** | the median completed price across them, **weighted by usage** — a combo 142 characters run counts more than one nine of them run |

Every column is click-to-sort (click again to reverse); unpriced groups always sink to the bottom.
Hovering any price opens a card with both base prices (linked to the trade search), the completed
cost, and a crafting steps section. Each priced combo also shows its cheapest listing inside the
expanded row.

Because the median covers only the top 5 combos in a group, it's the median of what's *popular*
there, not of every combo in it.

The query and the grouping are shared between the UI and the script (`src/tradeQuery.ts`,
`src/clusterAggregate.ts`) so a displayed price always belongs to the search its link opens. Every
search is uncorrupted, and `Adds # Passive Skills` is pinned by base size rather than taken from the
snapshot: Large → 12 with an increased-effect mod else 8 for 3 notables; Medium → 4–5; Small → 3
with a 25–35% effect mod.

Amounts are cached in the currency each listing was posted in (the trade API sorts across
currencies, so the cheapest and median listings are right without converting). Alongside them the
file carries a `rates` block — chaos value per currency, refreshed every run from poe.ninja's
economy API (`/poe1/api/economy/exchange/current/overview`) — which is what lets the sortable
columns and the median compare a divine listing with a chaos one. Sorted values are quoted in a
single unit (divine once they're worth one, chaos below); the native amount stays in the tooltip
and the hover card. A poe.ninja failure keeps the previous run's rates rather than aborting.

GGG rate-limits these endpoints **per IP** (`X-Rate-Limit-Rules: Ip` — there is no account rule, so
extra logins cannot raise the ceiling). Searches are capped at 30 per 5 minutes with a 1800s
penalty, so a cold run — 318 queries for Allflame — takes **~55 minutes**. The client paces itself
from the `X-Rate-Limit-*-State` headers, which count your own trade-site browsing too, and rewrites
the cache after every query — Ctrl-C loses nothing. Results are reused for 24h (`--ttl`), so a
repeat publish issues no requests.

The endpoints work anonymously. If that ever changes, an optional gitignored `.env` is read at
startup:

```
POESESSID=...
CF_CLEARANCE=...
```

### New league

Set the league name once in `league.ts` (`DEFAULT_LEAGUE`) — poe.ninja's exact
spelling, e.g. `Allflame`. It's the default for the dev server, the headless
scrape, and the UI's league pickers. Override per run with `--league=<Name>` on
`npm run scrape`, or with the `POE_LEAGUE` env var. Previously scraped leagues
stay available in the league dropdown; their data lives in `data/<slug>/` and
`src/data/<slug>/`.

## Main components

```
league.ts                 DEFAULT_LEAGUE — the league to scrape/display (update each league)
vite.config.ts            Dev-server API plugin — /api/leagues, /api/streamers,
                          /api/cluster-jewels (crawl control + progress), /api/characters.csv
server/poeninja.ts        poe.ninja client: snapshot-version discovery (fetchSnapshotVersion),
                          streamer overview scraping (scrapeStreamerBuilds / getStreamerBuilds),
                          public ladder cluster-holder search (searchClusterHolders), league list,
                          currency chaos rates from the economy API (fetchCurrencyRates)
server/clusterjewels.ts   Crawl engine: rate-limited character fetching (ensureClusterCharacters),
                          cluster jewel extraction/parsing, persistent per-league store,
                          resumable start/stop crawl (startCrawl / stopCrawl / crawlToCompletion),
                          progress reporting (getProgress)
server/tradeprices.ts     pathofexile.com/trade client: search/fetch with per-policy rate limiting
                          paced off the response headers (used only by scripts/price.ts)
src/App.tsx               App shell: league picker, tabs, streamer build table
src/ClusterJewels.tsx     Cluster jewel aggregation UI (usage counts, notables, enchant metadata)
src/clusterAggregate.ts   Grouping of raw jewels into base+type groups and notable combos —
                          shared by the UI and the pricing script
src/tradeQuery.ts         Trade search query building (stat ids, passive-count pinning,
                          uncorrupted filter) and the price cache keys — shared likewise
src/priceModel.ts         Shape of trade-prices.json plus the arithmetic for reading it:
                          chaos conversion, money formatting, usage-weighted median
scripts/scrape.ts         Headless scrape pipeline for the publish flow
scripts/scrape-poedb.mjs  poedb.tw enchantment pool scraper
scripts/price.ts          Publish-time trade pricing → src/data/<slug>/trade-prices.json
scripts/publish.mjs       Commits scraped data + pushes to trigger deploy
data/<league-slug>/       Working store: characters.csv, cluster-characters.csv,
                          cluster-jewels.json, character-jewels.json
src/data/<league-slug>/   Committed snapshots bundled into the production build:
                          cluster-jewels.json, trade-prices.json
```

## How it works

- All poe.ninja requests go through the dev server (or the headless script) — never the browser — to avoid CORS and keep parsing server-side. A real browser User-Agent is used and requests are throttled/rate-limit-aware (backs off on 429s).
- poe.ninja's API requires a **snapshot version** per league/endpoint; it's discovered by probing the site's build pages and cached (~5 min), refreshing automatically when a new snapshot invalidates it.
- Character fetches are the expensive part (~1s each), so results are stored permanently with raw mod text retained — changing the parsing logic doesn't require re-crawling.
- The production site is fully static: GitHub Actions builds from the committed `src/data` snapshots, so nothing scrapes at runtime.
