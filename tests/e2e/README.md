# Demo walkthrough

Install once with `cd tests/e2e && bun install --frozen-lockfile && bunx playwright install chromium`.
From the repo root, `make up && make record` records the real Docker stack.
Override the URL with `TS_E2E_BASE_URL=http://localhost:5178 make record`.
Use `TS_E2E_PAUSE_MS=500` for a quick check; the default pauses total about 140 seconds.
`TS_E2E_CHANNEL=chrome` uses installed Chrome if the bundled browser is unavailable.
Selectors live in selectors.ts. No test ids or candidate names are required.
The test requires a rendered structure canvas and two committed history entries.
Videos and traces stay untracked. Only a passing run replaces data/demo/fallback_recording.webm.

On the real-data Mac, run `make release`, then `make up && make record`.
Release exports images, bundle manifest, commit and SHA256SUMS to
`$TS_DATA_DIR/expo` or `~/Data/tauchstone/expo`; override with TS_EXPO_DIR.
Transfer the entire data/demo bundle separately. Release does not rebuild scientific outputs.
