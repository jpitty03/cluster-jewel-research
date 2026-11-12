# Pasted-item workflow

Use [CRAFTING_MECHANICS.md](CRAFTING_MECHANICS.md) as the PoE2 rules reference. This workflow is for the assistant performing research, not a claim that the CLI automates every step.

1. Save the exact clipboard text under `references/requests/<slug>/item.txt`. Determine whether it is a desired result or the owned starting item. If intent is unstated, propose reproducing the same base and tiers with any rolls and label that assumption.
2. Run the intake tool below. It retains all clipboard sections and reports unresolved identity fields; it deliberately does not guess modifier IDs, sides or tiers.
3. Create `request.json` from [the template](references/request-template.json). Use session instructions for league, budget and acquisition rules. Ask only for missing information that changes the route; independently research the item while waiting. Do not silently treat unset restrictions as authorization for a target-changing operation.
4. Verify the current official patch and applicable league availability. Add sources with retrieval date, claimed patch and evidence kind. Treat the manifest's review date as a snapshot, not permanent freshness.
5. Resolve the base and every requested modifier. Save candidate IDs for ambiguous lines; seek advanced modifier descriptions only when needed. Separate natural, essence, desecrated, implicit, augment and scaled values. Do not lower tiers or substitute sources to make a route cheaper.
6. Extend `references/classes/<class>/<ruleset>/` with `bases.json`, `modifiers.json`, `actions.json` and a manifest. Collect unwanted outcomes as well as target modifiers. Preserve raw relevant inputs or hashes/locators and a replay command. Never copy PoE1 modifier rows. Keep unknown weights null.
7. Enumerate applicable routes: new-base currency progression; magic anchor plus guaranteed essence; rare essence replacement; side-restricted add/remove/Chaos; Whittling; desecration/reveal/retry; fracture setup; special mechanics; and purchase/finish alternatives if allowed. Include every prerequisite and failure branch. Mark each candidate evaluated, dominated, illegal, disallowed or unresolved with a reason.
8. Collect current PoE2 prices for the actual league/platform. Save `prices.json` with units, timestamp and sources. Price full-route resources at the required quantities. Do not use an unlabelled site's economy table as a league-matched quote.
9. Calculate identical restart routes with `evaluateRepeatRoute`. For adaptive budget policies, encode legal researched transitions and run `optimizeBudget` (see [runtime contract](../../poe2-crafting-engine/README.md)). These tools validate arithmetic/input shape; they do not certify the supplied game evidence. More general expected-cost policies need a separate calculation.
10. Save `routes.md` using [the report template](references/route-report-template.md), plus the request, pools, prices and calculations that reproduce it. Give concrete steps and recovery branches, and report the strongest defensible optimality claim.

From the repository root:

```powershell
node poe2-crafting-engine/cli.mjs intake path/to/item.txt
node poe2-crafting-engine/cli.mjs repeat path/to/repeat-route.json
node poe2-crafting-engine/cli.mjs optimize path/to/model.json
node --test poe2-crafting-engine/test/engine.test.mjs
```

Commands emit JSON to stdout without overwriting research files. Save output to a new destination when needed. The synthetic example under `poe2-crafting-engine/examples/` demonstrates graph format, not real game odds or prices.
