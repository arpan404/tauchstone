/** Shared class strings for Candidates and Compare (docs/design/system.md, Nov 8 direction). */

/** Filter pill: frosted at rest, blue tint on hover, solid blue when pressed. */
export const FILTER_PILL =
  "h-8 gap-1.5 rounded-full bg-frost/75 px-3.5 text-[12.5px] font-medium text-ink-2 ring-1 ring-rim/90 backdrop-blur transition-colors hover:bg-primary/8 hover:text-ink [&_svg]:size-4 [&_svg]:text-ink-3 hover:[&_svg]:text-primary " +
  "aria-pressed:bg-gradient-to-b aria-pressed:from-[#2b6fd3] aria-pressed:to-[#1453ad] aria-pressed:text-white aria-pressed:ring-transparent aria-pressed:shadow-[inset_0_1px_0_rgb(255_255_255/0.28),inset_0_-1px_0_rgb(0_0_0/0.12)] aria-pressed:[&_svg]:text-white aria-pressed:hover:from-[#3a7ddd] aria-pressed:hover:to-[#185cbc] aria-pressed:hover:text-white aria-pressed:hover:[&_svg]:text-white";

/** Compare checkbox: frosted square, solid blue gradient when checked. */
export const CHECKBOX =
  "size-[18px] rounded-[6px] border-ink/20 bg-frost/80 hover:border-primary/60 data-checked:border-transparent data-checked:bg-gradient-to-b data-checked:from-[#2b6fd3] data-checked:to-[#1453ad] data-checked:shadow-[inset_0_1px_0_rgb(255_255_255/0.28)] [&_svg]:size-3";

/** Selected row: tint plus a 1px primary/25 ring drawn on the cells so it follows the 12px radius. */
export const SEL_CELL = "bg-primary/10 shadow-[inset_0_1px_0_rgb(21_88_184/0.25),inset_0_-1px_0_rgb(21_88_184/0.25)]";
export const SEL_FIRST = "shadow-[inset_1px_0_0_rgb(21_88_184/0.25),inset_0_1px_0_rgb(21_88_184/0.25),inset_0_-1px_0_rgb(21_88_184/0.25)]";
export const SEL_LAST = "shadow-[inset_-1px_0_0_rgb(21_88_184/0.25),inset_0_1px_0_rgb(21_88_184/0.25),inset_0_-1px_0_rgb(21_88_184/0.25)]";
