# S1 lab instrument screenshots

Captured in the ace browser on this Mac at 1280×800 and 1920×1080, using the in-browser mock. These are synthetic UI examples, not scientific results.

Each of the five views has a screenshot at both sizes. Evidence shows Mock compound 05. The extra attack-revealed image shows five committed mock validations for Mock compound 05, including failed and surviving wells, the live trace and exhausted budget.

To view:

```sh
cd /Users/lucifer/Programming/tauchstone-s1
uv sync
cd apps/web
bun install
VITE_USE_MOCK=1 bun run dev -- --port 5174
```

Open http://localhost:5174. Keys 1–5 change views. In Candidates, click a row before opening Evidence or Attack. In Attack, start the session and press Run validation. The Attack/Learn switches and manual well selection remain available.

Validation:
- Web build, typecheck, lint, 27 tests and check:api pass. Existing lint and bundle-size warnings remain.
- make test: 138 passed, 35 skipped, 1 failed because processed/lincs/sig_info.parquet is absent on this Mac.
- uv run pytest -q -m 'not data': 138 passed, 4 skipped, 32 deselected.
- Offline check skipped as instructed. No real-data bundle is available here.
- Real-data rendering and scientific sign-off remain with the orchestrator. No frozen files, API bindings or App.tsx changed.
