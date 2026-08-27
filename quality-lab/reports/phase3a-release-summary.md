# Phase 3A RELEASE Quality Lab Report

- Run: 2026-08-27T06-31-52-056Z
- Status: PASSED
- Started: 2026-08-27T06:31:52.056Z
- Finished: 2026-08-27T06:33:04.060Z
- Build compatibility: `compatible-93284ec92f863ae208ecd116`
- Browser: Chromium 151.0.7922.34
- Passed / failed / resumed / skipped: 11 / 0 / 0 / 0

## Runtime

- Total wall time: 72.004 s
- Summed gate time: 74.704 s
- App startup time: 1.372 s
- Browser startup time: 0.271 s
- Solver-heavy time: 48.353 s
- Visual/interaction time: 18.868 s
- Summed harness overhead: 1.856 s
- Browser-light shard parallelism: 2
- Solver-heavy concurrency: 1
- Automatic long soak: NO

## Gates

| Gate | Shard | Cost | Status | Duration | Rerun |
|---|---:|---|---:|---:|---|
| A-clean-worker-canonical | A | FAST | PASS | 1.904 s |  |
| A-proof-accounting-no-fallback | A | FAST | PASS | 1.670 s |  |
| A-cancel-replace-recover | A | MEDIUM | PASS | 1.948 s |  |
| B-self-fracture-policy | B | SOLVER_HEAVY | PASS | 26.782 s |  |
| B-harvest-objective-policy | B | SOLVER_HEAVY | PASS | 21.571 s |  |
| C-cluster-handoff | C | FAST | PASS | 1.058 s |  |
| C-share-export-roundtrip | C | FAST | PASS | 1.961 s |  |
| C-responsive-accessibility | C | FAST | PASS | 2.294 s |  |
| D-real-policy-flow-differential | D | FAST | PASS | 1.696 s |  |
| D-frozen-policy-flow-renderer | D | FAST | PASS | 1.669 s |  |
| D-constellation-interaction-short-replay | D | MEDIUM | PASS | 12.151 s |  |

## Ten slowest gates

| Gate | Status | Duration |
|---|---:|---:|
| B-self-fracture-policy | PASS | 26.782 s |
| B-harvest-objective-policy | PASS | 21.571 s |
| D-constellation-interaction-short-replay | PASS | 12.151 s |
| C-responsive-accessibility | PASS | 2.294 s |
| C-share-export-roundtrip | PASS | 1.961 s |
| A-cancel-replace-recover | PASS | 1.948 s |
| A-clean-worker-canonical | PASS | 1.904 s |
| D-real-policy-flow-differential | PASS | 1.696 s |
| A-proof-accounting-no-fallback | PASS | 1.670 s |
| D-frozen-policy-flow-renderer | PASS | 1.669 s |

## Runtime errors

- Console: 0
- Page: 0
- Network: 0
