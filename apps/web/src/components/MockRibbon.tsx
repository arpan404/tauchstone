/**
 * Unmissable integrity banner. Shown whenever the current numbers may be
 * mock/synthetic: in-browser mock mode, a live server reporting mock:true,
 * or a view whose provenance accession is MOCK/synthetic.
 */
export function MockRibbon({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div
      role="status"
      aria-label="Mock data warning"
      className="sticky top-0 z-20 border-b-2 border-gap bg-gap-soft px-4 py-1.5 text-center text-[13px] font-semibold text-gap"
    >
      Mock data: not real results
    </div>
  );
}
