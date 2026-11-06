// Required on every page by the build plan. Wording is signed off by the science lead; do not edit casually.
export const BOUNDARY_TEXT =
  'Research hypothesis only. Not a treatment recommendation. Gene expression reversal does not establish efficacy, safety, dosing, brain exposure or clinical benefit.'

export function BoundaryBanner() {
  return (
    <div role="note" className="shrink-0 border-b border-border bg-card px-5 py-2 text-[11px] leading-relaxed text-muted-foreground md:px-7">
      {BOUNDARY_TEXT}
    </div>
  )
}
