# About panel

Export `About` from this folder and render it under the application's existing QueryClientProvider. S5 leaves App.tsx unchanged; the orchestrator adds the navigation item.

Standalone preview, using a mock API on the allocated ports:

```sh
# Worktree root
uv sync
cd services/api
TS_API_MOCK=1 uv run uvicorn app.main:app --port 8004
```

In another terminal:

```sh
cd apps/web
bun install
TS_API_URL=http://localhost:8004 VITE_USE_MOCK=0 bun run dev -- --port 5177
```

Open http://localhost:5177/src/features/about/dev.html directly. Until integration there is no navigation item to click. For an in-browser mock without the API, use `VITE_USE_MOCK=1 bun run dev -- --port 5177` instead.

Benchmark values and the serving preregistration hash come from useBenchmark. MockRibbon reads both server health and result provenance. If an API response is missing, the panel does not fill it with frozen headline values. integrity.ts holds a verbatim copy of the historical integrity log, which the panel renders as a timeline with the original result summary and permutation definitions below it. A test checks that copy against docs/integrity_log.md. The frozen-record hash is separate from the API hash. If they differ outside mock mode, the panel shows an alert.

The standalone dev.html is a Vite development entry, not a production route. About appears in the production app only after the orchestrator imports it into the navigation.
