# apps/web (WS7)

Vite, React 19, TypeScript, Tailwind v4, shadcn/ui, ECharts, Mol*, Zustand and TanStack Query.

- `bun run dev` serves http://localhost:5173 and proxies `/api/*` to FastAPI on :8000.
- Feature folders: `src/features/disease-signature` has the volcano plot, `repurposing` the
  heatmap and leaderboard, `evidence` the evidence card, `protein-viewer` the Mol* panel and
  `tauchstone` the Attack/Learn panel.
- `src/components/BoundaryBanner.tsx` must render on every page.
- Build against `contracts/openapi.yaml` and `contracts/fixtures`, not against guesses.
