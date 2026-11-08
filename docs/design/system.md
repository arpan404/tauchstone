# Tauchstone UI system (Nov 8 redesign)

Binding for every view. The goal: the app reads as one precise lab instrument, not a website.
AGENTS.md rules still win (no clinical language, boundary line, measured/curated/predicted labels,
"not preregistered" labels, no hidden outcomes before a committed experiment).

## Design read

Product UI for a drug-repurposing research instrument. Audience: computational biologists, and
expo judges looking from one to three metres away. Language: plate reader / sequencer software.
Calm chrome, dense and exact data, one accent. Dials: variance 4, motion 4, density 6.

## Tokens (defined in `apps/web/src/index.css`; never hard-code hex in views)

| Token | Value | Use |
|---|---|---|
| `--canvas` | #F1F2F4 | app background (bench) |
| `--surface` | #FDFDFE | panels, tables |
| `--surface-2` | #F6F7F9 | inset areas, table header, hover |
| `--line` / `--line-strong` | #E2E4E9 / #CDD1D9 | hairlines / control borders |
| `--ink` / `--ink-2` / `--ink-3` | #14151A / #464A55 / #6B7080 | text levels (all AA on surface) |
| `--accent` (`primary`) | #5B3DF5 | reversal, selection, primary action. One accent only. |
| `--accent-soft` / `--accent-ink` | #EEEBFE / #4126D9 | selected rows, accent badges |
| `--ok` / `--ok-soft` | #0E8F6A / #E5F5EF | survived, measured, brain-cell data |
| `--bad` / `--bad-soft` | #D23B3B / #FCEBEB | failed, up in AD, low exposure |
| `--gap` / `--gap-soft` | #A15C07 / #FDF1DE | evidence gaps, not preregistered |

Tailwind names: `bg-canvas bg-surface bg-surface-2 border-line border-line-strong text-ink
text-ink-2 text-ink-3 text-primary bg-accent-soft text-accent-ink text-ok bg-ok-soft text-bad
bg-bad-soft text-gap bg-gap-soft`.

## Type

- UI and headings: **Instrument Sans** (variable). Headings use `font-heading` (semi-condensed,
  600, tight tracking). Body 13.5px.
- Data: **Geist Mono** via `font-mono`. Every number, rank, score, ID, dose, time, hash is mono
  with tabular figures. Use `<Readout>` for labelled values.
- Scale: page sections 15px/600, panel titles 13px/600, labels 12px `text-ink-3`, big readouts
  28-44px mono. No hero-size type anywhere except the single key number on a page.

## Shape and depth

- Radius: controls and badges 6px (`rounded-md`), panels 10px (`rounded-lg`). No pills except
  the selected-candidate chip in the top bar. No `rounded-full` buttons.
- Panels: `bg-surface border border-line rounded-lg`. No shadows on panels. Popovers and dialogs
  get the tinted `shadow-overlay`.
- Group with spacing and hairlines before reaching for another card. Never nest cards.

## Shell (owned by the lead, `src/app/`)

```
┌ rail 232 ──────────┬ top bar 52: Project / View            [candidate chip] [⌘K] ┐
│ mark  Tauchstone   │                                                            │
│ [project switcher] │  view content, padding 24, scrolls                          │
│ Discover           │                                                            │
│   Screen           │                                                            │
│   Candidates       │                                                            │
│   Compare      3   │                                                            │
│ Investigate        │                                                            │
│   Drug             │                                                            │
│   Attack           │                                                            │
│   Report           │                                                            │
│ Library            │                                                            │
│   My compounds     │                                                            │
│ Method             │                                                            │
│   Validation       │                                                            │
├────────────────────┴────────────────────────────────────────────────────────────┤
│ status bar 28: engine · data mode · LINCS gold 113,310 · prereg hash   boundary  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

The page title lives in the top bar. Views never render their own page title.

## Shared components (`src/components/system/`, import from `@/components/system`)

- `Panel` (title?, actions?, children, flush?) : the only container.
- `StatusBadge` tones: `neutral | accent | ok | bad | gap`. Short labels only (max 4 words). Legacy `Chip` from `@/components/mvp` now renders it.
- `Readout` (label, value, unit?, size `sm|md|lg|xl`, tone?) : mono value over a 12px label.
- `PlateMap` : 16×24 well plate; the signature element. On Screen it shows progress only (1 well ≈ 295 gold signatures in scoring order). Never place drugs or hits on wells: a well is not a drug.
- `EmptyState` (icon, title, action?) : one line plus one action. No paragraphs.
- `Toolbar` : row of filters/actions above a table.
- shadcn primitives in `src/components/ui/` (Button, Table, Tabs, Tooltip, Select, Dialog,
  Checkbox, Skeleton, ToggleGroup, Sonner). Customise through tokens, never inline colours.
- Icons: **Phosphor** (`@phosphor-icons/react`), weight `regular` at 16px, `fill` only for
  state. No lucide in app code, no hand-drawn SVG icons, no emoji.
- Motion: `motion/react`. Allowed: view enter (opacity + 4px y, 180ms), number changes
  (`NumberTicker` in system), list insertions, plate wells filling. Every animation honours
  `useReducedMotion`. No infinite decorative loops except the existing cell simulation.

## Copy rules

- Labels, not sentences. If a string explains how the system works, delete it. If a user needs
  it to act, make it a label, tooltip or empty state.
- Keep, verbatim where they exist: boundary text (status bar), `not preregistered`,
  `measured / curated / predicted` exposure labels, verdict names (SUPPORTED SO FAR,
  FRAGILE / CONTEXT-DEPENDENT, INSUFFICIENT EVIDENCE), `Report only` on resource agreement.
- No em dashes or en dashes in visible text. Use `·` at most once per line; prefer columns.
- Sentence case. Buttons say what happens: "Run screen", "Commit & run test", "Download PDF".
- Loading states are skeletons shaped like the content. Errors: what failed plus Retry.

## Quality floor

Keyboard focus visible (accent ring), AA contrast, works at 1280×800 and 1920×1080, collapses
to one column under 768px, `prefers-reduced-motion` respected, tests updated not weakened.
