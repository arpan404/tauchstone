# Expo day checklist

- On the real-data build Mac, run `make release`. Keep the exported archive, SHA256SUMS, COMMIT and bundle manifest together.
- Run `make up`, then `make record`. Confirm the final video uses real data and plays from start to finish. Copy the webm and optional mp4 to both laptops and USB.
- Transfer the repo, release archive and entire data/demo directory to the second laptop. Follow docs/offline.md to load images. Verify `shasum -a 256 -c SHA256SUMS` in the export directory.
- Turn Wi-Fi off on both laptops. Open localhost:8080. Check there is no mock ribbon.
- Rehearse Landing → Start the 3-minute tour → Signature → Ranking → Evidence and structure → Attack. Start the session, run validation, toggle Learn, run validation again. Continue to Benchmark → Boundary → Finish.
- Let the tour choose the candidate. The structure is target context, never binding evidence. Keep the boundary banner visible.
- Check power, screen brightness, browser zoom, audio if used, and disable sleep and notifications. Keep the fallback video open locally.
- If Docker fails, inspect `docker compose logs` and the data/demo mount; check port conflicts. Use the recovery table in docs/offline.md.
- If recovery would interrupt the pitch, play the verified recording. Label it as a recorded walkthrough.
- Arpan signs off on the real-data rehearsal and scientific wording before code freeze, Sunday Nov 8 at 8 pm.
