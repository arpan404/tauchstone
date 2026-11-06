# About panel

Export `About` from this folder and render it under the application's existing QueryClientProvider. S5 leaves App.tsx unchanged for the orchestrator to add the navigation item.

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

Open http://localhost:5177/src/features/about/dev.html directly. There is no navigation click before integration. For an in-browser mock without the API, use `VITE_USE_MOCK=1 bun run dev -- --port 5177` instead.

Benchmark values and the serving preregistration hash come from useBenchmark. MockRibbon uses both server health and result provenance. No frozen headline values replace missing API responses. The historical integrity log is copied verbatim into integrity.ts and rendered as a timeline, with the original result summary and permutation definitions below it. A test checks that copy against docs/integrity_log.md. The frozen-record hash is separate from the API hash; a non-mock mismatch produces an alert.

The standalone dev.html is a Vite development entry, not a production route. The orchestrator must import About into the navigation before it appears in the production app.

## Review evidence

Screenshots use the in-browser mock and are labelled synthetic on screen:

- [1280 × 800 pipeline and benchmark](screenshots/about-1280.jpg)
- [1920 × 1080 limitations, hash and timeline](screenshots/about-integrity-1920.jpg)
- [390 × 844 mobile pipeline](screenshots/about-mobile.jpg)

The README's real-data screenshot paths remain placeholders for Arpan's Mac. No real-data scientific result or offline bundle was verified here.
