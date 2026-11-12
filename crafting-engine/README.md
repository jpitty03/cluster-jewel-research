# Cluster Jewel Crafting Engine

The crafting engine is the deterministic, UI-independent core of the Cluster Jewel Optimizer. It models legal Path of Exile crafting transitions, searches executable policies, reconciles expected costs and occupancy evidence, and produces structured player and technical summaries.

## Boundaries

- `crafting-engine/src/` does not import React, browser APIs, `src/`, or `server/`.
- Node diagnostics load working data from `data/` and fall back to committed snapshots in `src/data/` where supported.
- Browser integration lives in `src/crafting/`, which injects bundled data and runs optimization in a module Worker.
- The UI renders engine-owned results; it does not reconstruct solver policy or evidence.

## Current structure

```text
crafting-engine/
  src/
    actions/       Legacy action implementations used by diagnostics and tests
    data/          Environment-neutral repositories and Node data loaders
    domain/        Item, modifier, target, price, method, and policy-flow types
    plugins/       Optional mechanic interfaces and the Allflame implementation
    probability/   Random sources and Monte Carlo validation
    reporting/     Diagnostic text and cost formatting
    rules/         Legal action discovery, eligibility, affix, tag, and roll rules
    service/       Optimizer API, validation, craft plan, guided model, and sharing
    solver/        Search, policy evaluation, acquisition, bounds, and state identity
    index.ts       Node-facing engine exports
  scripts/         Manual diagnostics and end-to-end demonstrations
  test/            Vitest unit and regression coverage
```

Canonical mechanics assumptions and known approximation boundaries are recorded in [`KNOWN_MECHANICS.md`](./KNOWN_MECHANICS.md).

## Data

- `src/data/poedb-cluster-mods.json` is the committed browser and fallback cluster-mod snapshot.
- `src/data/poedb-horticrafting.json` is the committed browser Horticrafting snapshot.
- `data/` is ignored working state produced by scraping commands.
- Price and market context is supplied through optimizer requests or `PriceBook`; engine policy code must not embed live prices.

## Validation

Run commands from the repository root:

```sh
npm test
npx tsc -b tsconfig.crafting.json
npm run build
npm run lab:dev
npm run lab:release
```

Useful manual diagnostics include:

```sh
npx tsx crafting-engine/scripts/debugAction.ts
npx tsx crafting-engine/scripts/diagnoseDiscrepancy.ts
npx tsx crafting-engine/scripts/optimizeCraftDemo.ts
npx tsx crafting-engine/scripts/probeAcquisitionSynthesis.ts
npx tsx crafting-engine/scripts/probeFinite.ts
npx tsx crafting-engine/scripts/probeGraphShape.ts
npx tsx crafting-engine/scripts/probeResolution.ts
npx tsx crafting-engine/scripts/validateNarrowStates.ts
```

The production recommendation must remain fail-closed: an unresolved or unreconciled policy may expose diagnostics, but it must not be presented as certified guidance.
