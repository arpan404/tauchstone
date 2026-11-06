# Research workflow E2E

Install with `cd tests/e2e && bun install --frozen-lockfile`.
Run against the real API and frontend with:

```sh
TS_E2E_BASE_URL=http://localhost:5273 bun run test
```

Installed Google Chrome is the default. Set `TS_E2E_CHANNEL=chromium` to use an installed Playwright Chromium instead.

The test chooses two candidates from discovery ranking, searches and compares them,
opens evidence, creates a budget-two session and commits exactly one hidden experiment.
It checks the server response, history, budget and session continuity through evidence
navigation. Boundary notes and absence of the removed tour are checked throughout.
No candidate is chosen using held-out outcomes. No structure canvas or fixed scientific
outcome is required. There are no timed tour pauses or screenshot assertions.

Set `TS_E2E_RECORD=1` to record video. Failure traces stay enabled.
Videos and failure traces stay untracked in `test-results/`.
