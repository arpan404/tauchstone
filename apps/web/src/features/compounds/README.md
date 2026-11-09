# Track B2 integration

Exports:

- `RepurposingView` from `features/repurposing/RepurposingView` accepts optional `projectId`.
- `EvidenceView` from `features/evidence/EvidenceView` accepts optional `projectId`, `onCompare(drugId)`, and `onReport(drugId)`.
- `CompoundsView` / `MyCompoundsView` from `features/compounds` accepts optional `projectId` and `onBuildTests(result)`.
- `api/mvpHooks.ts` exports `useProjectCandidates`, `useDrug`, `useDrugResources`, and `useLookup`. Query keys include project scope and filters. Errors stay errors; server requests never fall back to fixtures.

B1 owns `App.tsx` and the Zustand store. Route My compounds to `CompoundsView`, pass the selected project's ID to all three views, and wire Compare/Report callbacks to the shell. Compare checkboxes currently use local component state because the store at `2f509d3` has no comparison set. Compare/Report are disabled until their routes appear in `STEPS` or callbacks are supplied. Candidate selection uses the existing `selectedCandidateId` and `evidence` step.

C owns the molecule viewer. `EvidenceView` discovers `features/molecule/MoleculeViewer.tsx` with Vite's typed module glob and renders its named `MoleculeViewer` export when present. Otherwise it renders a plain inline placeholder. The B2 fixture has no invented molecular coordinates. Mol* remains lazy loaded for API-provided target structures.

`Build tests` passes a ranked drug to the Attack flow, or invokes `onBuildTests` when supplied. Unresolved compounds have a disabled Build tests button until that callback can resolve them. The existing legacy browser-mock Attack implementation does not cover the lookup-only fixture IDs. Track B3/D owns test construction. CLUE's Add API key opens a connection-status dialog; key provisioning remains server-side, outside the frozen API contract. No credential is sent to browser storage.

## Preview and checks

From `apps/web`:

```sh
bun install
VITE_USE_MOCK=1 bun run dev --port 5175
```

Open `http://localhost:5175/src/features/compounds/preview.html`. This development-only entry previews all three actual components without changing B1's routes. Its navigation is a preview harness, not the production shell. The standard production build does not include this entry.

For server mode, run the API with `TS_API_MOCK=1` and point Vite's `TS_API_URL` at it, then run `VITE_USE_MOCK=0 bun run dev`. At base commit `2f509d3`, `/projects/{id}/candidates` and `/drugs/{id}` return 404: backend tracks must land before an end-to-end server-mode check. No real data or scientific claims were verified on this machine.

Verified: `bun run build`, `bun run typecheck`, `bun run lint`, `bun run test`, `bun run check:api`. The suite has 67 passing tests, including filter request parameters, empty filter intersections, row/checkbox navigation, ranking-context combinations and time points, preregistration labels, action callbacks, lookup parsing/project scope, fixture ranks, and attack readiness. Existing lint warnings and bundle-size warnings remain.

1280×800 screenshots were captured in the task thread:

- Candidates: all 12 rows, four filters, Cholic acid NEU chip, exposure labels and status.
- Piperacillin: inline molecule placeholder and formula, gap chips, three ranking cell lines, resource states, hidden-test count, preserved target structure panel.
- My compounds: 684 / 1,816; 502 / 1,816; 1,214 / 1,816; not rankable; 2 / 1,816; positive galantamine score; Attack / Build tests.

The supplied fixture values are display fixtures. They do not modify signatures, ranking, thresholds, preregistration, or benchmark inputs. No hidden test outcomes are fetched or rendered.
