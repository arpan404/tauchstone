import { useEffect, useState } from "react";
import { DownloadSimpleIcon, FileTextIcon, PrinterIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export interface ReportViewProps {
  drugId: string;
  projectId?: string;
}

/**
 * Frames the API's report HTML as a sheet on the canvas. The template already draws its own
 * paper card; this style makes the iframe itself the sheet. The PDF is rendered server side
 * from the same template, so the preview matches the download.
 */
const SHEET_STYLE =
  "<style>html,body{background:transparent!important}.paper{margin:0 auto!important;border:0!important;border-radius:0!important;max-width:none!important;padding:44px 52px!important}</style>";

function asSheet(html: string) {
  return html.includes("</head>")
    ? html.replace("</head>", `${SHEET_STYLE}</head>`)
    : SHEET_STYLE + html;
}

export function ReportView({ drugId, projectId }: ReportViewProps) {
  const [result, setResult] = useState<{ key: string; html: string; error: boolean } | null>(
    null,
  );
  const [attempt, setAttempt] = useState(0);
  const url = `/api/reports/${encodeURIComponent(drugId)}`;
  const query = projectId ? `?project_id=${encodeURIComponent(projectId)}` : "";
  const key = url + query;
  const html = result?.key === key ? result.html : "";
  const error = result?.key === key && result.error;
  const loading = result?.key !== key;
  useEffect(() => {
    const controller = new AbortController();
    fetch(key, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Report unavailable");
        return response.text();
      })
      .then((value) => {
        if (!controller.signal.aborted) setResult({ key, html: value, error: false });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ key, html: "", error: true });
      });
    return () => controller.abort();
  }, [key, attempt]);

  return (
    <section aria-label="Drug report" className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur md:px-6">
        <FileTextIcon className="size-4 text-ink-3" />
        <span className="text-[13px] font-medium text-ink">Evidence report</span>
        <span className="truncate font-mono text-[12px] text-ink-3">{drugId}</span>
        <div className="ml-auto flex items-center gap-2">
          <a
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
            href={`${url}${query}`}
            target="_blank"
            rel="noreferrer"
          >
            <PrinterIcon />
            Print HTML
          </a>
          <a
            className={cn(buttonVariants({ size: "sm" }))}
            href={`${url}.pdf${query}`}
            target="_blank"
            rel="noreferrer"
          >
            <DownloadSimpleIcon />
            Download PDF
          </a>
        </div>
      </div>
      <div className="flex-1 px-4 py-8 md:px-6">
        <div className="mx-auto w-full max-w-[760px]">
          {loading && (
            <div
              role="status"
              aria-label="Loading report"
              className="space-y-4 rounded-sm border border-line bg-surface p-12 shadow-overlay"
            >
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-6 w-80" />
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-2 border-t border-line pt-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          )}
          {error && (
            <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4 text-[13.5px] text-ink-2">
              <p role="alert" className="m-0">
                Report unavailable
              </p>
              <button
                type="button"
                className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                onClick={() => {
                  setResult(null);
                  setAttempt((n) => n + 1);
                }}
              >
                Retry
              </button>
            </div>
          )}
          {html && (
            <iframe
              className="block h-[1075px] w-full rounded-sm border border-line bg-surface shadow-overlay"
              title="Drug evidence report"
              srcDoc={asSheet(html)}
              sandbox="allow-modals"
            />
          )}
        </div>
      </div>
    </section>
  );
}
export default ReportView;
