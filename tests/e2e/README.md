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

Video recording is enabled by default, preserving `make record` compatibility.
Set `TS_E2E_RECORD=0` to disable video for a quick check. Failure traces stay enabled.
Videos and failure traces stay untracked in `test-results/`.

## Live AI lab integration

The AI lab test is skipped by default so ordinary runs and recordings retain only
the research workflow. To include real local inference, prediction and one retraining job:

```sh
TS_E2E_BASE_URL=http://localhost:5273 TS_E2E_RECORD=0 bun run test
```

Requires a ready local copilot and an existing trained model on the real API.
This test replaces the exploratory model artifacts with a new training run. It waits
for server polling to report a different run ID, checks displayed metrics against that
report, and attaches the completed report to the test results. It does not assert a
fixed prediction, clinical outcome, or improvement over baseline. The AI test commits
no held-out experiments; the separate research workflow still commits exactly one.
