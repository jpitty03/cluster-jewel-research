# New league checklist

## The two steps

1. Open `league.ts` and set `DEFAULT_LEAGUE` to the league's name, spelled exactly as
   poe.ninja and the trade site spell it (it is case-sensitive, e.g. `'Mirage'`).
2. Run:

   ```
   npm run publish
   ```

That is the whole job. The same command is what you run for every later update.

## What the command does

| Step | What it does | If it goes wrong |
|---|---|---|
| Preflight | Checks you are on `main` and up to date, and that the league name exists on poe.ninja and on the trade site. Takes a few seconds. | Stops and says which check failed and what to do. Nothing else has run. |
| Game data | Refreshes trade-site ids (so new notables can be priced) and the mod pools from poedb (so the optimizer knows new mods). | Keeps the existing files and carries on. A new mod pool that breaks the engine's tests is rolled back with a warning. |
| Scrape | Fetches streamer and top-ladder characters from poe.ninja and their cluster jewels. | Stops without touching the published data if fewer than 90% of characters were fetched. Re-run to resume. |
| Price | Searches the trade site for each popular combo and base. | Stops if more than a quarter of searches fail. Prices already fetched are kept. |
| Publish | Commits `src/data` and `league.ts`, pushes, and GitHub Pages rebuilds the site. | If the push fails the commit stays local; re-run `node scripts/publish.mjs`. |

## How long it takes

- **First run of a league:** the crawl fetches one character every 15 seconds, so about
  3 hours for 700 characters, plus about an hour of trade searches. Early in a league
  there are far fewer characters and it is much quicker.
- **Later runs:** only new characters, characters older than 72 hours, and prices older
  than 24 hours are fetched again.
- Both the crawl and the pricing save as they go. If the run is interrupted, run
  `npm run publish` again and it picks up where it stopped.

## When to run it

- **Launch day:** preflight will say poe.ninja has no builds for the league yet. That is
  expected; poe.ninja needs roughly a day to index characters. Try again the next day.
- **First few days:** the scrape may stop with "no level 80+ characters with cluster
  jewels yet". Also expected. Try again a day later.
- **After that:** every few days. The optimizer flags prices older than 3 days as stale.

## Things you might see

- **`poe.ninja has no builds for "X" yet`** followed by a list of leagues: either it is
  too early, or the name in `league.ts` does not match the list.
- **`The trade site has no league called "X"`**: the spelling differs from the trade
  site's. Use the name from the list it prints.
- **`new notables: …` / `new cluster types: …`**: information only. The new content was
  picked up and can be priced.
- **`Changes since the previous snapshot: …`** from the poedb step: the patch changed mod
  weights or added mods. Information only, unless it is followed by the rollback warning.
- **`The crafting engine tests fail with the new mod pools`**: the cluster jewel table
  still updates. The optimizer keeps using last patch's mod pools until the tests are
  looked at.
- **HTTP 429 / "rate limited"**: the scripts wait and retry on their own.

## Optional

- `npm run preflight` runs just the checks.
- `npm run validate:pools` compares the mod pools with the saved Craft of Exile model.
  After a patch that changes cluster jewels it will report mismatches until a newer
  Craft of Exile snapshot is saved; that is expected.
- A `.env` file with `POESESSID` makes trade requests authenticated. Anonymous works.
- The previous leagues' data stays in `src/data/<league>/` and remains selectable on the
  site. Delete a folder to drop that league.
