# Phase 3A DEV Quality Lab Report

- Run: 2026-08-27T06-30-49-192Z
- Status: PASSED
- Started: 2026-08-27T06:30:49.193Z
- Finished: 2026-08-27T06:31:42.606Z
- Build compatibility: `compatible-93284ec92f863ae208ecd116`
- Browser: Chromium 151.0.7922.34
- Passed / failed / resumed / skipped: 5 / 0 / 0 / 0

## Runtime

- Total wall time: 53.413 s
- Summed gate time: 53.569 s
- App startup time: 1.029 s
- Browser startup time: 0.198 s
- Solver-heavy time: 48.033 s
- Visual/interaction time: 3.564 s
- Summed harness overhead: 1.376 s
- Browser-light shard parallelism: 2
- Solver-heavy concurrency: 1
- Automatic long soak: NO

## Gates

| Gate | Shard | Cost | Status | Duration | Rerun |
|---|---:|---|---:|---:|---|
| A-clean-worker-canonical | A | FAST | PASS | 1.972 s |  |
| B-self-fracture-policy | B | SOLVER_HEAVY | PASS | 26.747 s |  |
| B-harvest-objective-policy | B | SOLVER_HEAVY | PASS | 21.286 s |  |
| D-real-policy-flow-differential | D | FAST | PASS | 1.869 s |  |
| D-frozen-policy-flow-renderer | D | FAST | PASS | 1.695 s |  |

## Ten slowest gates

| Gate | Status | Duration |
|---|---:|---:|
| B-self-fracture-policy | PASS | 26.747 s |
| B-harvest-objective-policy | PASS | 21.286 s |
| A-clean-worker-canonical | PASS | 1.972 s |
| D-real-policy-flow-differential | PASS | 1.869 s |
| D-frozen-policy-flow-renderer | PASS | 1.695 s |

## Runtime errors

- Console: 0
- Page: 0
- Network: 0
