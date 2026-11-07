import { Suspense, lazy } from "react";

const MolstarViewerInner = lazy(() =>
  import("./MolstarViewer").then((m) => ({ default: m.MolstarViewer })),
);

export function ProteinPanel({
  url,
  note,
}: {
  url: string | null;
  note: string | null;
}) {
  if (!url) {
    return <p className="text-sm text-neutral-500">No structure available</p>;
  }
  return (
    <div>
      <Suspense
        fallback={
          <div className="flex h-[320px] items-center justify-center rounded border border-neutral-200 bg-neutral-50 text-sm text-neutral-500">
            Loading structure…
          </div>
        }
      >
        <MolstarViewerInner url={url} />
      </Suspense>
      {note && <p className="mt-1 text-xs text-neutral-500 italic">{note}</p>}
    </div>
  );
}
