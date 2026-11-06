# apps/web (WS7)

Vite + React 19 + TypeScript + Tailwind v4 + shadcn/ui + ECharts + Mol* + Zustand + TanStack Query.

- `bun run dev` → http://localhost:5173, `/api/*` proxied to FastAPI on :8000
- `src/features/disease-signature` volcano plot · `repurposing` heatmap + leaderboard ·
  `evidence` evidence card · `protein-viewer` Mol* panel · `tauchstone` Attack/Learn panel
- `src/components/BoundaryBanner.tsx` must render on every page
- Build against `contracts/openapi.yaml` and `contracts/fixtures`, not against guesses
