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
| `--accent` (`primary`) | #1558B8 | deep dodger blue: reversal, selection, primary action. One accent only. |
| `--accent-soft` / `--accent-ink` | #E6EEFA / #0F4593 | selected rows, accent badges |
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

## Nov 8 direction: atmosphere and glass (supersedes the boxed look above)

Approved by Arpan from a mockup inspired by Chai Discovery, Benchling and Recursion. Where this
section conflicts with the sections above, this section wins.

- **Atmosphere.** The app background is the soft blue wash (`atmosphere` utility on the shell).
  Never paint page backgrounds grey or white.
- **Glass, not boxes.** Every container is a frosted floating panel: the `glass` utility or the
  `Panel` component (`icon`, `title`, `caption`, `actions`). No bordered white cards, no grey
  dashed boxes, no hairline-boxed tables. Empty cells and wells are soft tinted fills
  (`bg-ink/[0.035]`, rounded 8px). Radius: 18px panels, 12px inner tiles and rows, pills for
  tags and buttons.
- **A hero per page.** Each page opens with one hero `glass` panel: mono id or eyebrow line,
  a large light title (40-48px, weight 400, tracking -0.035em, `font-heading`), pill tags, the
  page's key number as a large light accent readout (`text-primary`, 48-58px mono), and the
  page's actions as pill buttons on the right (primary = dark ink `Button` default, others
  `outline`). Where the page has a natural visual (molecule, plate, belief gauge, policy plot),
  it sits in the hero with a soft blurred copy behind it as glow (opacity ~0.5, blur 14px).
- **Icons.** Phosphor everywhere it helps scanning: a soft icon chip before every panel title
  (`Panel icon`), a leading icon on every button, small icons on stat labels and on meaningful
  tags (exposure, brain cells, withdrawn, not preregistered), icons in empty states. Weight
  `regular` (16-18px); `fill` only for the active state; `duotone` allowed in hero chips.
- **Tables.** Inside `glass`, flush. Header row is quiet 11.5px ink-3. Rows have no hard lines:
  rounded 12px rows; hover = `bg-primary/6`; selected = `bg-primary/10 ring-1 ring-primary/25`
  with ink text. Numbers mono.
- **Contrast and depth (Arpan, Nov 8).** States must be unmistakable at a glance, and the UI keeps
  a 3D feel without drop shadows on states:
  - Active/selected controls (nav item, segmented control, active filter pill, selected tab):
    solid blue pill `bg-gradient-to-b from-[#2b6fd3] to-[#1453ad] text-white` with inner
    highlight `shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_0_-1px_0_rgb(0_0_0/0.12)]`;
    icons white. Hover = `bg-primary/8`.
  - Floating panels keep the soft glass drop shadow (depth). Inner tiles inside a panel are
    frosted (`bg-white/55 ring-1 ring-white/80`), never plain white cards.
  - Inputs and textareas: `bg-white/70 ring-1 ring-ink/12 backdrop-blur`, blue focus ring.
  - Popovers, menus, dialogs and the command palette are frosted (handled globally in index.css).
  - Text on glass: titles ink, labels ink-3 (AA), never lighter.
- **Type.** Titles weight 400-500, never bold black. Buttons and numbers mono. Labels 11.5-12px
  ink-3. Body 13-13.5px.
- **Colour.** Blue (`primary`) for data and selection; dark ink for the primary action; red,
  green, amber only for fail, survive/ok, gap. No other hues.
