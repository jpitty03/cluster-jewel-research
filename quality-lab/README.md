# Phase 2T External Real-Browser Quality Lab

This package is the release-gating black-box harness for the production Cluster Jewel Optimizer. It starts Vite's production preview from the already-built `dist/` directory and launches Playwright Chromium. If either startup fails, the run fails; there is no simulation mode or application-URL fallback.

The harness imports no files from `src/` or `crafting-engine/src/`. Inputs come from the serialized fixture corpus, and results are observed through the rendered DOM, downloads, clipboard, browser geometry, canvas frames, and the native module Worker boundary. An init script wraps `window.Worker` before application JavaScript executes so the lab can record real request, `PROGRESS`, `COMPLETE`, `RESULT`, `ERROR`, termination, and replacement events without a production test hook.

Install and run from the repository root:

```text
npm ci
npm ci --prefix quality-lab
npx --prefix quality-lab playwright install chromium
npm run build
npm run lab:release
```

Focused suites are available as `lab:smoke`, `lab:methods`, `lab:objectives`, `lab:responsive`, `lab:animation`, and `lab:additional`. `lab:nightly` uses the full fixture matrix and an extended constellation soak.

Transient traces, videos, downloads, and paired frames are written to `quality-lab/artifacts/` and ignored by Git. The structured gate result and stable review evidence are written to `quality-lab/reports/`.
