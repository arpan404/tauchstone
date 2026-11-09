# Exploratory cell-type panel

Import `SingleCellPanel` from this folder for navigation integration. This feature changes no App or shared API files.

For the development preview, run from `apps/web`:

```sh
VITE_USE_MOCK=1 bun run dev -- --port 5174
```

Open http://localhost:5174/src/features/single-cell/preview.html. The preview is a Vite development entry, not a production route. It uses the frozen synthetic contract fixture through a feature-local mock. Without mock mode, the query calls `/api/exploratory/single-cell` through the shared client. Set `TS_API_URL=http://localhost:8001` when starting Vite for an API on port 8001.

Columns sort by cohort, region and cell type; rows sort by pool rank. The first column is the primary bulk consensus reference. Null scores have grey hatching and a cross. The expanded score table gives keyboard and screen-reader users the same values and explanations. After an API error the panel never fills scores with synthetic values.

The generated contract represents arbitrary provenance parameters as `Record<string, never>`, although the frozen fixture supplies `synthetic: true`. The fixture import uses a local type assertion to cover that mismatch. At runtime the panel checks the synthetic flag as well as `useMockStatus`.

No real data, scientific outputs, live endpoint, or offline bundle were verified on this machine. Human scientific review remains required.
