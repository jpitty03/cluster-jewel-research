# Phase 3A Real-Browser Quality Lab

The Quality Lab is a black-box release harness for the built Cluster Jewel Optimizer. It launches Vite's production preview from `dist/`, drives Playwright Chromium, and observes the rendered DOM, downloads, clipboard, browser geometry, and native module Worker protocol. Missing production assets or browser executables fail closed; there is no simulated application fallback.

Phase 3A replaces the historical all-in-one release loop with an explicit gate registry, self-contained fixtures, compatible-build checkpoint/resume, cost-aware process shards, live progress, and persisted runtime ledgers.

## Tiers

From the repository root:

```text
npm ci
npm ci --prefix quality-lab
npx --prefix quality-lab playwright install chromium
npm run build
npm run lab:typecheck
npm run lab:dev
npm run lab:release
```

- `lab:dev` is the ordinary 1–3 minute feedback tier. It includes a real clean Worker result, self-fracture, selected Harvest, Worker-to-DOM flow identity, and the frozen renderer differential.
- `lab:release` is the normal final 5–10 minute acceptance tier. It adds proof/accounting, cancellation/replacement, handoff, share/export, responsive/accessibility, branch interaction, and a bounded 10-second replay.
- `lab:extended` is explicit/manual only. It contains five-minute replay/memory soak, exhaustive viewport, Research-depth field proof, and generated fuzz work.
- `lab:legacy-release` preserves the old serialized 115+ gate matrix as a manual audit tool. It is not the default release command.

GitHub Pages remains lean: install, build, lint, diff hygiene, committed-evidence audit, deploy. It does not execute browser solvers or long soaks. The extended workflow is `workflow_dispatch` only.

## Targeted execution

The registry supports exact gates, tags, failed-gate reruns, and compatible resume:

```text
npm run -- lab:gate -- --gate D-real-policy-flow-differential
npm run -- lab:tag -- --tag constellation
npm run -- lab:failed -- quality-lab/reports/latest.json
npm run -- lab:resume -- quality-lab/reports/latest.json
npm run -- lab:release -- --dry-run
npm run lab:list
```

The leading `--` before the script name in argument-bearing examples is required by npm 12 so unknown gate flags are forwarded instead of parsed as npm configuration. On npm versions with conventional forwarding, direct `npx tsx quality-lab/src/orchestrator.ts ...` is equivalent.

A failed gate prints an immediately copyable command. Resume reuses a passing result only when application hash, full harness hash, fixture corpus/hash, price snapshot, Playwright Chromium version, harness version, and gate version all match. Changed source causes a complete compatibility rejection.

Use the advisory impact mapper after a change:

```text
npm run -- lab:recommend -- --base HEAD~1 --head HEAD
```

It recommends exact tags and commands; it does not waive the final RELEASE tier.

## Shards and progress

- A: Worker, canonical result, proof, cancellation
- B: objectives, Harvest, fracture; solver-heavy concurrency is one
- C: handoff, share/export, responsive/accessibility
- D: real/frozen Constellation flow and interactions
- E: extended/manual solver and soak work

Browser-light A/C/D shards may run two processes at a time. Any shard containing solver-heavy work runs alone. Long-soak work runs only when explicitly selected or through EXTENDED.

Every gate prints `RUN`, five-second heartbeats when needed, and `PASS`/`FAIL` with elapsed time. Consolidated JSON and Markdown reports include wall time, summed gate time, browser/app startup, solver-heavy and visual totals, harness overhead, tag totals, and the ten slowest gates.

## Frozen PolicyFlowSummary

`fixtures/policy-flow-clean-v1.json` records the source commit, normalized request, selected bundle/policy fingerprint, policy-flow version, topology, artifact hash, and normalized summary hash. The serialized summary remains in the reviewed Phase 2Z browser-flow artifact.

The frozen renderer gate uses a harness-only Worker wrapper to deliver that summary to the production renderer. It is valid only for renderer/interaction testing. RELEASE separately regenerates the same clean flow through the real Worker and differentially compares the summary and DOM topology, so the fixture cannot certify or replace current solver mechanics.

Updating this fixture requires an explicit regeneration command and reviewed metadata/hash diff.

Transient traces, screenshots, shard reports, and downloads are written under `quality-lab/artifacts/` and ignored. Stable reviewed evidence and consolidated reports are written under `quality-lab/reports/`.
