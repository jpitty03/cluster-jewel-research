# Phase 2Y.1 Focused Real-Browser Compaction Gate

- Run: 2026-08-27T03-54-06-906Z
- Started: 2026-08-27T03:54:06.907Z
- Finished: 2026-08-27T03:55:00.514Z
- Browser: Playwright Chromium 151.0.7922.34
- Fixture corpus: Phase2Y-Frozen-Browser-Corpus-1
- Status: PASSED

## Observed gates

| Scenario | Gate | Result | Duration | Observed evidence |
|---|---|---:|---:|---|
| phase2y1-evidence-compaction-closeout | Y1.1-Y1.2-real-route-surface-source-contract | PASS | 12989 ms | {"requestSequence":19,"routeSurfaces":["recommended","alternatives[0]","harvestComparison.conventionalRoute","harvestComparison.resolvedHarvestRoute","methodPortfolio[0].route","methodPortfolio[1].route","methodPortfolio[2].route","paretoAlternatives[0].route","paretoAlternatives[1].route"],"fullResultBytes":425479} |
| phase2y1-evidence-compaction-closeout | Y1.3-real-compaction-boundary-witness | PASS | 1780 ms | {"requestSequence":19,"routeCount":9,"retainedRoutes":[{"path":"recommended","lowerBoundChaos":11.159768008932955,"expectedTotalCostChaos":11.159845419999986},{"path":"alternatives[0]","lowerBoundChaos":17.647824610489998,"expectedTotalCostChaos":17.647831476992984},{"path":"harvestComparison.conventionalRoute","lowerBoundChaos":11.159775139635618,"expectedTotalCostChaos":11.159845419999986},{"path":"harvestComparison.resolvedHarvestRoute","lowerBoundChaos":17.647824610489998,"expectedTotalCostChaos":17.647831476992984},{"path":"methodPortfolio[0].route","lowerBoundChaos":11.159768008932955,"expectedTotalCostChaos":11.159845419999986},{"path":"methodPortfolio[1].route","lowerBoundChaos":11.159775139635618,"expectedTotalCostChaos":11.159845419999986},{"path":"methodPortfolio[2].route","lowerBoundChaos":17.647824610489998,"expectedTotalCostChaos":17.647831476992984},{"path":"paretoAlternatives[0].route","lowerBoundChaos":11.159768008932955,"expectedTotalCostChaos":11.159845419999986},{"path":"paretoAlternatives[1].route","lowerBoundChaos":17.647824610489998,"expectedTotalCostChaos":17.647831476992984}],"fullResultBytes":425479,"compactedResultBytes":38606,"reductionFraction":0.9092646170551308} |
| phase2y1-evidence-compaction-closeout | Y1.8-compaction-memory-and-history-safety | PASS | 7089 ms | {"sourceEventSequence":19,"sourceFullResultBytes":425479,"repairedCompactedResultBytes":38606,"repairedReductionFraction":0.9092646170551308,"retainedRouteProofContracts":[{"path":"recommended","lowerBoundChaos":11.159768008932955,"expectedTotalCostChaos":11.159845419999986},{"path":"alternatives[0]","lowerBoundChaos":17.647824610489998,"expectedTotalCostChaos":17.647831476992984},{"path":"harvestComparison.conventionalRoute","lowerBoundChaos":11.159775139635618,"expectedTotalCostChaos":11.159845419999986},{"path":"harvestComparison.resolvedHarvestRoute","lowerBoundChaos":17.647824610489998,"expectedTotalCostChaos":17.647831476992984},{"path":"methodPortfolio[0].route","lowerBoundChaos":11.159768008932955,"expectedTotalCostChaos":11.159845419999986},{"path":"methodPortfolio[1].route","lowerBoundChaos":11.159775139635618,"expectedTotalCostChaos":11.159845419999986},{"path":"methodPortfolio[2].route","lowerBoundChaos":17.647824610489998,"expectedTotalCostChaos":17.647831476992984},{"path":"paretoAlternatives[0].route","lowerBoundChaos":11.159768008932955,"expectedTotalCostChaos":11.159845419999986},{"path":"paretoAlternatives[1].route","lowerBoundChaos":17.647824610489998,"expectedTotalCostChaos":17.647831476992984}],"historicalResultsCompacted":7,"compactedHistoryBytes":201852,"largestCompactedResultBytes":38606,"committedFailedRunArtifactBytes":1299585,"committedFailedRunResultsWithPayload":12,"eventCount":77,"initialHeapBytes":16100000,"finalHeapBytes":16100000,"heapDeltaBytes":0,"giantHistoricalPolicyGraphsRetained":false,"proofValuesInferredOrFabricated":false,"artifact":"quality-lab\\reports\\evidence\\phase2y1-compaction-witness.json"} |
| phase2y-proof-efficiency-budget-equivalence | Y18-generated-proof-debt-browser-fuzz | PASS | 20842 ms | {"seed":"phase2y-real-worker-result-matrix-v1","generatedFixtures":["phase2v_one_mod_clean_graph","harvest_one_mod_math_witness","herald_envoy_endbringer","three_notable","phase2w_eldritch_low_tolerance"],"results":12,"candidatesChecked":28,"equivalentPairs":1,"artifact":"quality-lab\\reports\\evidence\\phase2y-proof-debt-browser-fuzz.json"} |
| phase2y1-evidence-compaction-closeout | Y1.5-Y1.7-route-identity-and-method-reservation | PASS | 7330 ms | {"identity":{"routeName":"Start clean base","acquisitionKind":"CLEAN","selectedAccounting":{"acquisition":{"lower":2,"upper":2},"downstream":{"lower":0.040521572522330906,"upper":4.368169700000105},"full route":{"lower":2.040521572522331,"upper":6.368169700000105}},"equivalentFamilies":["family_conventional"]},"requestCompareMethodFamilies":true,"methodFamilyAllocation":{"statesExpanded":1202,"retainedStates":1202,"wallTimeMs":2803,"transitionsGenerated":2498,"transitionsReused":250,"transitionGenerationMs":24,"bellmanMs":0,"occupancyMs":0}} |
| release-process | runtime-error-audit | PASS | 0 ms | {"consoleErrors":0,"pageErrors":0,"networkErrors":0} |

## Captured runtime issues

- Console errors: 0
- Page errors: 0
- Network errors: 0

## Artifacts

- phase2y1CompactionWitness: `quality-lab\reports\evidence\phase2y1-compaction-witness.json`
- phase2yProofDebtFuzz: `quality-lab\reports\evidence\phase2y-proof-debt-browser-fuzz.json`
- fullWorkerEvents: `quality-lab\artifacts\2026-08-27T03-54-06-906Z\worker-events-full.json`
- phase2y1FocusedWorkerEvents: `quality-lab\reports\evidence\phase2y1-focused-worker-events.json`
- videoDirectory: `quality-lab\artifacts\2026-08-27T03-54-06-906Z\video`
- trace: `quality-lab\artifacts\2026-08-27T03-54-06-906Z\phase2y-trace.zip`
- phase2y1FocusedGate: `quality-lab\reports\phase2y1-focused-gate.json`
