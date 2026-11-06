# Expo scene

Export: `import { ExpoScene } from '@/features/expo-scene'`. Render inside the existing QueryClientProvider and a Suspense boundary with `onClose`. This entry uses React.lazy, keeping Three.js out of the initial bundle. App.tsx is untouched; the orchestrator adds the E/button entry.

## Preview

```sh
cd apps/web
bun install
VITE_USE_MOCK=1 bun run dev -- --port 5175
```

Open http://localhost:5175/src/features/expo-scene/dev.html, click `5. Mock compound 05`, then `Start attack session`, then `Run validation` five times. The development harness uses ranking data for selection. It never selects from hidden outcomes. To use the API instead, run mock FastAPI on 8002 and start Vite with `TS_API_URL=http://localhost:8002 VITE_USE_MOCK=0`.

The host's selected candidate and mode are used; a cached session is resumed if it belongs to that candidate. No automatic candidate selection. Signature geometry uses only GSE132903 genes. Positions encode gene index, not gene similarity. Contexts are orbital DOM labels with sealed/revealed text, receiving a Three.js beam on validation. A single Points geometry carries all genes, with stat magnitude in a shader size attribute. The ring interpolates toward API P(claim).

Reduced motion stops rotation and skips belief/beam interpolation. Escape closes; focus stays inside the dialog and returns to its prior element. Closing cancels RAF, disconnects ResizeObserver, disposes all geometries/materials/renderer and forces context loss. WebGL failure shows a close-to-continue message. No CDN assets or live evidence requests.

## Evidence and limits

- `evidence/expo.png`: synthetic 16k-point view at 1280×800.
- `evidence/complete.png`: completed five-reveal mock attack.
- `evidence/attack.webm`: short full mock attack recording.
- Synthetic 16k-point switch is development-only and labelled visual load only. Deterministic input, no randomness, no scientific output. The API signature remains the default.
- Measured 60 fps in headless Chrome during recording at 1280×800; watched ace browser reported 75 fps at 1280×720. These are two-second RAF sampling windows, not a sustained GPU benchmark.
- Web build, typecheck, lint, 28 unit tests and API schema check pass. Lint has warnings, including local animation-variable and WebGL-fallback effect warnings.
- `make test`: 138 passed, 35 skipped, one failure in `tests/lincs/test_ingest.py::test_ingest_outputs_exist_and_align` because local processed/lincs/sig_info.parquet is absent.
- Real Piperacillin, scientific direction checks on real data, full-size real signature, real-data API/offline bundle and sustained performance on the expo display remain for the orchestrator. The mock browser calls candidates Mock compound 01–50.
- Offline check skipped as instructed: this Mac lacks the real-data bundle. No scientific or frozen files changed.

## Expo polish follow-up

Orthographic framing fits the full sphere to 60% of the available stage height,
with a width cap of 42%. Context labels sit on an outer orbit with 41% vertical
radius. The validation beam uses the same orthographic bounds and label orbit.
Point brightness rises from 0.48 to 0.8 for non-query genes; query genes remain
at 1. Point diameter starts at 1.8px plus 0.32px per |stat|, with query genes
larger. Point size also accounts for device pixel ratio and the stage height.
This keeps low-stat genes visible on larger displays.

Verified from the normal app: select mock rank 5 in Candidates, then click Expo
mode. At 16k synthetic points, Chrome reported 61 fps at 1280×800 and 60 fps at
1920×1080. Screenshots are `evidence/polish-1280.jpg` and
`evidence/polish-1920.jpg`. The full sphere and its labels fit at both sizes.
Validation and Escape close also passed the browser smoke check.

The two GeneScene oxlint warnings are removed. Build, typecheck, lint, 37 web
tests and check:api pass. Other existing lint warnings remain. `make test`
reported 138 passed, 36 skipped and the same missing local LINCS
sig_info.parquet failure. Real-data visibility from 3m and offline bundle
verification remain with the orchestrator; there is no real-data bundle here.
