# Phase 2U External Real-Browser Quality Lab

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

Focused suites are available as `lab:smoke`, `lab:methods`, `lab:objectives`, `lab:responsive`, `lab:animation`, `lab:additional`, and `lab:phase2u`. `lab:phase2u:quick` uses a five-second development soak; the blocking `lab:phase2u`, `lab:release`, and `lab:nightly` paths use the required five-minute Phase 2U soak.

The Phase 2U matrix drives real mouse, touch, wheel, button, and keyboard input; measures rendered DOM label geometry; verifies player-facing modifier vocabulary and Technical exact-ID disclosure; captures stable camera/readability screenshots; and proves camera-only interaction does not change the Worker result. The full release matrix retains every Phase 2T solver, accounting, method-family, responsive, and animation gate.

Transient traces, videos, downloads, and paired frames are written to `quality-lab/artifacts/` and ignored by Git. The structured gate result and stable review evidence are written to `quality-lab/reports/`.
