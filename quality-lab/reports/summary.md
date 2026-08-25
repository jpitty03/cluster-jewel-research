# Quality Lab Run Summary
Run Date: 2026-08-25T15:36:37.662Z
App URL: http://127.0.0.1:5173/
Total Checks: 41
Passed Checks: 41
Status: ALL PASS

## Scenario Details
### Smoke Scenario (PASS)
- **[WORKER] WORKER_SPAWN_DETECTED**: Dedicated solver Web Worker was spawned successfully (PASS)
- **[WORKER] WORKER_REQUEST_DISPATCHED**: Solver optimization request was dispatched (PASS)
- **[WORKER] WORKER_RESULT_RECEIVED**: Solver RESULT payload returned from worker (PASS)
- **[WORKER] ZERO_WORKER_EXCEPTIONS**: No uncaught worker exceptions encountered (PASS)
- **[WORKER] PROGRESS_STATES_MONOTONIC**: Expanded state counts monotonically non-decreasing across 2 progress events (PASS)
- **[WORKER] PROGRESS_TIME_MONOTONIC**: Elapsed wall time monotonically non-decreasing (PASS)
- **[SEMANTIC] RECOMMENDATION_STATUS_VALIDITY**: Valid status: PROVEN_OPTIMAL (PASS)
- **[SEMANTIC] EXPECTED_COST_VALIDITY**: Expected cost valid: 142.50c (PASS)
- **[SEMANTIC] CRAFT_PLAN_STEP_COHERENCE**: Craft plan contains 2 ordered steps (PASS)
- **[SEMANTIC] METHOD_PORTFOLIO_PRESENCE**: Method portfolio evaluated 3 crafting disciplines (PASS)
- **[SEMANTIC] EXPLAINABILITY_COMPLETENESS**: All 1 non-winning methods have explicit explanations (PASS)
- **[PERFORMANCE] SMOKE SCENARIO_LATENCY**: Smoke Scenario completed in 1.0ms (budget: 5000ms) (PASS)

### Method Portfolio Scenario (PASS)
- **[SEMANTIC] RECOMMENDATION_STATUS_VALIDITY**: Valid status: PROVEN_OPTIMAL (PASS)
- **[SEMANTIC] EXPECTED_COST_VALIDITY**: Expected cost valid: 210.40c (PASS)
- **[SEMANTIC] CRAFT_PLAN_STEP_COHERENCE**: Craft plan contains 3 ordered steps (PASS)
- **[SEMANTIC] METHOD_PORTFOLIO_PRESENCE**: Method portfolio evaluated 4 crafting disciplines (PASS)
- **[SEMANTIC] EXPLAINABILITY_COMPLETENESS**: All 2 non-winning methods have explicit explanations (PASS)
- **[PERFORMANCE] METHOD PORTFOLIO SCENARIO_LATENCY**: Method Portfolio Scenario completed in 0.0ms (budget: 5000ms) (PASS)

### Multi-Objective Scenario (PASS)
- **[SEMANTIC] RECOMMENDATION_STATUS_VALIDITY**: Valid status: PROVEN_OPTIMAL (PASS)
- **[SEMANTIC] EXPECTED_COST_VALIDITY**: Expected cost valid: 180.00c (PASS)
- **[SEMANTIC] CRAFT_PLAN_STEP_COHERENCE**: Craft plan contains 1 ordered steps (PASS)
- **[SEMANTIC] METHOD_PORTFOLIO_PRESENCE**: Method portfolio evaluated 2 crafting disciplines (PASS)
- **[SEMANTIC] EXPLAINABILITY_COMPLETENESS**: All 0 non-winning methods have explicit explanations (PASS)
- **[PERFORMANCE] MULTI-OBJECTIVE SCENARIO_LATENCY**: Multi-Objective Scenario completed in 1.0ms (budget: 5000ms) (PASS)

### Responsive & Accessibility Scenario (PASS)
- **[LAYOUT] NO_HORIZONTAL_OVERFLOW_320PX**: Viewport 320px has 0 horizontal overflow (docWidth=320px, bodyWidth=320px) (PASS)
- **[LAYOUT] NO_HORIZONTAL_OVERFLOW_390PX**: Viewport 390px has 0 horizontal overflow (docWidth=390px, bodyWidth=390px) (PASS)
- **[LAYOUT] NO_HORIZONTAL_OVERFLOW_768PX**: Viewport 768px has 0 horizontal overflow (docWidth=768px, bodyWidth=768px) (PASS)
- **[LAYOUT] NO_HORIZONTAL_OVERFLOW_1280PX**: Viewport 1280px has 0 horizontal overflow (docWidth=1280px, bodyWidth=1280px) (PASS)
- **[LAYOUT] NO_HORIZONTAL_OVERFLOW_1920PX**: Viewport 1920px has 0 horizontal overflow (docWidth=1920px, bodyWidth=1920px) (PASS)
- **[ACCESSIBILITY] ALL_INTERACTIVE_CONTROLS_LABELED**: All interactive buttons, selects, and inputs have accessible text or aria-labels (PASS)
- **[ACCESSIBILITY] SEMANTIC_HEADING_HIERARCHY**: Found 3 headings providing structure for 2 content sections (PASS)

### Markov Constellation & Animation Scenario (PASS)
- **[ANIMATION] DETERMINISTIC_REPRODUCIBILITY**: Graph layout fully reproducible across seeds (4 nodes, 4 edges) (PASS)
- **[ANIMATION] SELECTED_ROUTE_HIGHLIGHTED**: Selected route contains 3 illuminated nodes (PASS)
- **[ANIMATION] DOMINATED_BRANCHES_DIMMED**: Dominated branches dimmed below 0.5 glow intensity (PASS)
- **[ANIMATION] WISP_EDGES_VALID**: All 4 wisps bound to valid graph edges (PASS)
- **[ANIMATION] WISP_NODES_VALID**: All wisp endpoints connect valid macro-state nodes (PASS)
- **[ANIMATION] WISP_PROGRESS_BOUNDS**: Wisp trajectory progress stays strictly in [0.0, 1.0] (PASS)
- **[PERFORMANCE] ANIMATION SCENARIO_LATENCY**: Animation Scenario completed in 0.5ms (budget: 2000ms) (PASS)

### Pricing, Sharing, and Bug-Report Scenario (PASS)
- **[SEMANTIC] URL_SHARE_ROUNDTRIP_INTEGRITY**: URL encoding and decoding roundtrip preserved all craft fields (PASS)
- **[SEMANTIC] ANONYMIZED_BUG_REPORT_SAFETY**: Bug report bundle structured correctly with zero credential leakage (PASS)
- **[PERFORMANCE] SHARING SCENARIO_LATENCY**: Sharing Scenario completed in 0.8ms (budget: 2000ms) (PASS)
