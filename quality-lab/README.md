# Quality Lab: External Adaptive Browser Quality Harness

The Quality Lab is a standalone, external test harness for validating the Cluster Jewel Crafting Optimizer web application.

## Key Principles
1. **Isolated & Standalone**: Located strictly outside `src/` and `crafting-engine/`.
2. **Black-Box Testing**: Inspects the running application solely through standard browser APIs, accessibility trees, DOM geometry, and structured Worker telemetry.
3. **No Production Test Hooks**: Zero invasive debug variables or synthetic test bridges in production code. Worker events are captured via transparent browser init-scripts.
4. **Multi-Dimensional Oracles**:
   - **Semantic Oracle**: Verifies route correctness, bound sanity, and explainability cards.
   - **Worker Oracle**: Asserts event monotonicities, progress milestones, and clean terminations.
   - **Layout Oracle**: Asserts strict responsive viewport geometry and 0 horizontal overflow.
   - **Accessibility Oracle**: Validates ARIA attributes, semantic roles, and focusable elements.
   - **Performance Oracle**: Tracks solve duration and UI latency.

## Running Scenarios
```bash
# Run all scenarios
npm run lab

# Run individual suites
npm run lab:smoke
npm run lab:methods
npm run lab:objectives
npm run lab:responsive
```
