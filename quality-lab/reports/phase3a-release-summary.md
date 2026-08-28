# Phase 3A RELEASE Quality Lab Report

- Run: 2026-08-28T03-55-22-372Z
- Status: FAILED
- Started: 2026-08-28T03:55:22.373Z
- Finished: 2026-08-28T04:00:05.778Z
- Build compatibility: `compatible-d48b4ea0477254dce8327a54`
- Browser: Chromium 151.0.7922.34
- Passed / failed / resumed / skipped: 16 / 1 / 0 / 0

## Runtime

- Total wall time: 283.407 s
- Summed gate time: 286.707 s
- App startup time: 1.390 s
- Browser startup time: 0.290 s
- Solver-heavy time: 232.551 s
- Visual/interaction time: 101.118 s
- Summed harness overhead: 2.070 s
- Browser-light shard parallelism: 2
- Solver-heavy concurrency: 1
- Automatic long soak: NO

## Gates

| Gate | Shard | Cost | Status | Duration | Rerun |
|---|---:|---|---:|---:|---|
| A-clean-worker-canonical | A | FAST | PASS | 2.176 s |  |
| A-proof-accounting-no-fallback | A | FAST | PASS | 1.921 s |  |
| A-cancel-replace-recover | A | MEDIUM | PASS | 2.270 s |  |
| B-self-fracture-policy | B | SOLVER_HEAVY | PASS | 26.958 s |  |
| B-fractured-magic-alter-price-reversal | B | SOLVER_HEAVY | PASS | 28.491 s |  |
| B-harvest-objective-policy | B | SOLVER_HEAVY | PASS | 22.141 s |  |
| C-full-route-policy-evidence | C | SOLVER_HEAVY | PASS | 57.666 s |  |
| C-core-budget-isolation | C | SOLVER_HEAVY | FAIL | 97.295 s | npm run -- lab:gate -- --gate C-core-budget-isolation |
| C-cluster-handoff | C | FAST | PASS | 1.015 s |  |
| C-share-export-roundtrip | C | FAST | PASS | 2.120 s |  |
| C-responsive-accessibility | C | FAST | PASS | 2.141 s |  |
| D-constellation-large-scc-layout | D | FAST | PASS | 5.743 s |  |
| D-constellation-scope-fit | D | FAST | PASS | 7.998 s |  |
| D-manual-constellation-layout | D | MEDIUM | PASS | 12.895 s |  |
| D-real-policy-flow-differential | D | FAST | PASS | 1.707 s |  |
| D-frozen-policy-flow-renderer | D | FAST | PASS | 1.813 s |  |
| D-constellation-interaction-short-replay | D | MEDIUM | PASS | 12.357 s |  |

## Ten slowest gates

| Gate | Status | Duration |
|---|---:|---:|
| C-core-budget-isolation | FAIL | 97.295 s |
| C-full-route-policy-evidence | PASS | 57.666 s |
| B-fractured-magic-alter-price-reversal | PASS | 28.491 s |
| B-self-fracture-policy | PASS | 26.958 s |
| B-harvest-objective-policy | PASS | 22.141 s |
| D-manual-constellation-layout | PASS | 12.895 s |
| D-constellation-interaction-short-replay | PASS | 12.357 s |
| D-constellation-scope-fit | PASS | 7.998 s |
| D-constellation-large-scc-layout | PASS | 5.743 s |
| A-cancel-replace-recover | PASS | 2.270 s |

## Runtime errors

- Console: 0
- Page: 0
- Network: 0
