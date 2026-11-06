// Required on every page by the build plan. Wording is signed off by the science lead; do not edit casually.
export const BOUNDARY_TEXT =
  'Research hypothesis only. Not a treatment recommendation. Gene expression reversal does not establish efficacy, safety, dosing, brain exposure or clinical benefit.'

export function BoundaryBanner() {
  return (
    <div role="note" className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-950">
      {BOUNDARY_TEXT}
    </div>
  )
}
