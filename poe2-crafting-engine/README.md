# PoE2 crafting research engine

The assistant workflow starts at [WORKFLOW.md](../docs/poe2-crafting-engine/WORKFLOW.md); mechanics and coverage live in [CRAFTING_MECHANICS.md](../docs/poe2-crafting-engine/CRAFTING_MECHANICS.md). This standalone Node module has no dependencies and does not change the PoE1 UI or engine.

Implemented: English clipboard intake without guessed affixes, independent-repeat cost/risk arithmetic, and finite-budget dynamic programming over a supplied graph. Not implemented: automatic class-pool collection, modifier resolution, game transition generation, live prices, or a general unbounded expected-cost solver. The assistant researches those item-specific inputs before using these calculators.

Run from the repository root with Node 24+:

```powershell
node poe2-crafting-engine/cli.mjs intake path/to/item.txt
node poe2-crafting-engine/cli.mjs repeat path/to/route.json
node poe2-crafting-engine/cli.mjs optimize poe2-crafting-engine/examples/synthetic-model.json
node --test poe2-crafting-engine/test/engine.test.mjs
```

All commands emit JSON to stdout. Failures exit nonzero. Use the exports in `engine.mjs` for programmatic access.

## Repeat-route contract

```json
{
  "priceUnit": "synthetic-unit",
  "identicalRestart": true,
  "successProbability": 0.25,
  "attemptCost": 2,
  "recoveryCost": 3,
  "setupCost": 5,
  "finishCost": 1,
  "budget": 18
}
```

These are synthetic numbers. An attempt is independent and identically distributed; every failure returns to exactly the same starting state at `recoveryCost`. Setup is paid once; finishing is paid on success. Costs must be known, finite and nonnegative; attempt cost must be positive. Output distinguishes expected eventual completion cost from probability of completing within budget. Salvage, changing prices, persistent damage and escalating risks require another model.

## Transition-graph contract

See [the synthetic fixture](examples/synthetic-model.json). Every state explicitly declares `success` and an `actions` array; success states are terminal. Each action has a unique ID within its state, a positive integer cost in `priceUnit`, nonempty evidence IDs and a complete list of positive-probability outcomes summing to one. Model includes `game: poe2`, `ruleset`, `start` and a nonnegative integer `budget`.

State IDs must encode all information that changes future legality/probability: affixes, fracture/desecration/preview state, inventory and remaining special resources. Declare starting acquisition/setup as actions if part of budget. A success state means the **entire** target, including finishing, has been met. Encode illegal/disallowed actions by omitting them; list those exclusions in the research report.

The solver maximizes success probability under budget and breaks exact probability ties by minimum expected expenditure. It may stop for free when spending cannot increase success. Every outcome then follows the optimal action for its state and remaining budget. Positive costs make the calculation finite even for retry loops. Zero-cost reveal/selection transitions must first be collapsed into a priced action kernel with the optimal choice accounted for; do not assign fake positive costs. Outcome-specific costs need intermediate states or a separately derived kernel.

Costs are integer units: choose a sufficiently fine monetary unit and disclose rounding. There is a 2,000,000 budget-state-cell resource limit. Arithmetic uses JavaScript floating point. Returned `expectedSpend` includes unsuccessful/stopped runs; it is **not** expected cost to eventual success. Evidence IDs are required provenance pointers, not automatic certification. Missing actions or incorrect game kernels invalidate any game-level optimality claim even when graph arithmetic is correct.

For a real item, save the model, target, action exclusions, pool and price snapshots together under `docs/poe2-crafting-engine/references/requests/<slug>/`.
