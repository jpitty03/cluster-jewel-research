# Phase 2Z Selected-Policy Branching Constellation Gate

- Run: 2026-08-27T05-52-00-914Z
- Started: 2026-08-27T05:52:00.916Z
- Finished: 2026-08-27T05:52:55.954Z
- Browser: Playwright Chromium 151.0.7922.34
- Fixture corpus: Phase2Y-Frozen-Browser-Corpus-1
- Status: PASSED

## Observed gates

| Scenario | Gate | Result | Duration | Observed evidence |
|---|---|---:|---:|---|
| phase2z-selected-policy-branching-constellation | Z1-real-worker-policy-flow-boundary | PASS | 751 ms | {"sourceBundleId":"core:clean-open-policy","sourcePolicyFingerprint":"policy-b29143bf","workerToDomIdentity":true} |
| phase2z-selected-policy-branching-constellation | Z2-flow-conservation-and-exact-state-differential | PASS | 0 ms | {"nodes":5,"edges":14,"differentialSamples":24} |
| phase2z-selected-policy-branching-constellation | Z3-selected-branch-click-and-explanation | PASS | 381 ms | {"edgeId":"flow_downstream_7a37989d","probability":0.4840493407060825,"expectedFlow":0.48404934070608246,"outcomeKind":"PROGRESS"} |
| phase2z-selected-policy-branching-constellation | Z4-pan-zoom-keyboard-and-route-focus | PASS | 484 ms | {"panZoom":true,"keyboard":true,"routeFocus":true,"fitAll":true} |
| phase2z-selected-policy-branching-constellation | Z5-reduced-motion-deterministic-render | PASS | 731 ms | {"bytes":204916,"equal":true} |
| phase2z-selected-policy-branching-constellation | Z6-replay-scroll-ownership-and-particle-budget | PASS | 2473 ms | {"documentScrollBefore":6890,"documentScrollAfter":6890,"particleCount":52} |
| phase2z-selected-policy-branching-constellation | Z7-regal-recovery-and-reacquire-destinations | PASS | 26627 ms | {"regalBranches":4,"scourBranches":4,"reacquireBranches":1,"fracturedScourDestination":{"rarity":"magic","selectedActionId":"augmentation_orb"}} |
| phase2z-selected-policy-branching-constellation | Z8-selected-harvest-repeat-and-success-flow | PASS | 20575 ms | {"harvestNodes":2,"repeatEdges":2,"successEdges":2} |
| phase2z-selected-policy-branching-constellation | Z9-topology-diversity-worker-dom-and-performance | PASS | 101 ms | {"fingerprints":["topology-4481a40d","topology-e5f288b9","topology-6e87b089"],"layoutMs":0.4,"workerToDom":true} |
| release-process | runtime-error-audit | PASS | 1 ms | {"consoleErrors":0,"pageErrors":0,"networkErrors":0} |

## Captured runtime issues

- Console errors: 0
- Page errors: 0
- Network errors: 0

## Artifacts

- phase2zSelectedBranchDetail: `quality-lab\reports\evidence\phase2z-selected-branch-detail.png`
- phase2zFracturedScourDestination: `quality-lab\reports\evidence\phase2z-fractured-scour-destination.png`
- phase2zHarvestLoop: `quality-lab\reports\evidence\phase2z-harvest-loop.png`
- phase2zBrowserFlow: `quality-lab\reports\evidence\phase2z-browser-flow.json`
- fullWorkerEvents: `quality-lab\artifacts\2026-08-27T05-52-00-914Z\worker-events-full.json`
- phase2zWorkerEvents: `quality-lab\reports\evidence\phase2z-worker-events.json`
- videoDirectory: `quality-lab\artifacts\2026-08-27T05-52-00-914Z\video`
- trace: `quality-lab\artifacts\2026-08-27T05-52-00-914Z\phase2y-trace.zip`
