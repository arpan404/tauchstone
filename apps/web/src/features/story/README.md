# Story preview

Exports `Landing onStart` and `StoryMode onExit`. Render StoryMode above the existing
store-selected view. It is a controller, not a replacement for the view. App.tsx is
unchanged for the orchestrator to integrate.

The default candidate is the lowest discovery rank, with ID as a tie breaker.
Selection never reads validation outcomes, composition flags or exposure evidence.
The landing hidden-test count is explicitly the candidate API's held-out LINCS count,
not a total across test families. Benchmark headlines use all_candidates when supplied,
otherwise the primary analysis, and display accuracy only when its budget is five.

From the repository root, run in separate terminals:

```sh
TS_API_MOCK=1 uv run uvicorn app.main:app --app-dir services/api --port 8003
cd apps/web
TS_API_URL=http://127.0.0.1:8003 VITE_USE_MOCK=0 bun run dev --port 5176 --strictPort
```

Open http://localhost:5176/src/features/story/dev.html . Start the tour, advance to
Attack, start a session, run validation, toggle Learn, run again, then advance to
Benchmark and Boundary. Back and step buttons allow rehearsal at any pace. The
clock records elapsed time; scheduled step times are cues, not automatic reveals.

The evidence step embeds the existing EvidenceView including ProteinPanel and Mol*.
Mock fixtures may supply no structure, in which case the existing missing-structure
message is preserved. Real structure loading requires the real-data integration check.
