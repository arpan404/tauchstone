# Expo day checklist

## Build (real-data Mac, before code freeze Sun Nov 8, 8 pm)

- `make release`. This builds the bundle (`data/demo`, about 1.1 GB with the LINCS gold arrays),
  runs `scripts/offline_check.sh` (no-network phase, then expo ports), and saves
  `expo-images.tar.gz`, `SHA256SUMS`, `COMMIT` and the bundle manifest in `~/Data/tauchstone/expo`.
- `make up`, then `make record`. Watch the video end to end. It must show real data, with no
  "Synthetic data" chip. Copy `data/demo/fallback_recording.{webm,mp4}` to both laptops and USB.
- Copy the repo, the release folder and the whole `data/demo` directory to the second laptop.
  Load the images per `docs/offline.md`, then `shasum -a 256 -c SHA256SUMS`.

## Before visitors

- Wi-Fi off on both laptops. `docker compose up -d`, open `localhost:8080`.
- The project store is a tmpfs, so each restart begins with only the two built-in projects.
  Restart between long sessions to clear visitor uploads.
- Keep `data/demo/example_signature.csv` (GSE173955 hippocampus, gene/log2fc/stat/fdr) on the
  desktop for the upload demo.

## Tour (about 3 minutes)

1. **Projects** → Alzheimer's · middle temporal gyrus.
2. **Screen** → GSE132903 → Run screen. It scores 113,310 gold signatures in about 10 s, and the top hits stream in.
   To show an upload, drop in `example_signature.csv`. It ranks as *not preregistered*.
3. **Candidates** → toggle Brain-cell data / Brain-penetrant, tick three rows → **Compare**.
4. **Drug** → open a candidate: gaps (cancer lines only, single concentration, acute time point,
   brain exposure measured/curated/predicted), 3D molecule, context map, resource agreement.
5. **My compounds** → `donepezil, memantine, galantamine, Aricept`.
6. **Attack** → Create experiment session → Commit & run test. Point at the belief change and
   the verdict pill.
7. **Report** → Download PDF. **Validation** → frozen benchmark.

## Wording

- Verdicts: SUPPORTED SO FAR, FRAGILE / CONTEXT-DEPENDENT, INSUFFICIENT EVIDENCE.
- Brain exposure is always labelled measured, curated or predicted. A structure is target
  context, never binding evidence.
- Ad-hoc tests, uploads and resource agreement (Perturb-Seqr, CLUE) are not preregistered.
- The boundary line stays visible in the footer of every page.

## If something breaks

- Check `docker compose logs api web`, the `data/demo` mount, and port conflicts. The recovery
  table is in `docs/offline.md`.
- If recovery would interrupt the pitch, play the recording and say it is a recorded walkthrough.
- Check power and brightness, set browser zoom to 100%, and turn sleep and notifications off.
- Arpan signs off on the real-data rehearsal and the scientific wording before code freeze.
