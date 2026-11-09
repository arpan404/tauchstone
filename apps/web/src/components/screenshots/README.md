# S1 lab instrument screenshots

These were captured in the ace browser on this Mac at 1280×800 and 1920×1080, using the in-browser mock. These are synthetic UI examples, not scientific results.

Each of the five views has a screenshot at both sizes. The Evidence view shows Mock compound 05. One extra image shows the Attack view after five committed mock validations for Mock compound 05, with failed and surviving wells, the live trace and the budget used up.

To run the views yourself:

```sh
cd /Users/lucifer/Programming/tauchstone-s1
uv sync
cd apps/web
bun install
VITE_USE_MOCK=1 bun run dev -- --port 5174
```

Open http://localhost:5174. Keys 1–5 change views. In Candidates, click a row before opening Evidence or Attack. In Attack, start the session and press Run validation. The Attack/Learn switches and manual well selection still work.

Checks run for this change:

- Web build, typecheck, lint, 27 tests and check:api pass. The existing lint and bundle-size warnings remain.
- make test: 138 passed, 35 skipped, 1 failed because processed/lincs/sig_info.parquet is absent on this Mac.
- uv run pytest -q -m 'not data': 138 passed, 4 skipped, 32 deselected.
- The offline check was skipped as instructed. No real-data bundle is available here.
- Real-data rendering and scientific sign-off stay with the orchestrator. This change touched no frozen files, API bindings or App.tsx.
