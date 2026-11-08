import { useEffect, useState } from "react";
import { DownloadSimpleIcon, FileTextIcon, PrinterIcon } from "@phosphor-icons/react";
import { cn } from "cn";
import { useAttackSessionSnapshot } from "@/api/hooks";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useUi } from "@/store/ui";

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

/** The page floats on the atmosphere: white paper, no border, a soft long shadow. */
const SHEET =
  "rounded-[6px] bg-white shadow-[0_1px_2px_rgb(15_24_48/0.06),0_2px_8px_rgb(15_24_48/0.04),0_32px_64px_-24px_rgb(30_60_140/0.32)]";

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
  const sessionId = useUi((s) => s.sessionId);
  const session = useAttackSessionSnapshot(sessionId);
  // Only the Attack session on this drug goes into the report; the server re-checks.
  const reportSession = session?.candidate_id === drugId ? sessionId : null;
  const url = `/api/reports/${encodeURIComponent(drugId)}`;
  const params = new URLSearchParams();
  if (projectId) params.set("project_id", projectId);
  if (reportSession) params.set("session_id", reportSession);
  const query = params.size ? `?${params.toString().replace(/\+/g, "%20")}` : "";
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
      <div className="sticky top-0 z-10 shrink-0 px-3 pt-3 md:px-6 md:pt-4">
      <div className="glass mx-auto flex w-full max-w-[800px] flex-wrap items-center gap-x-3 gap-y-2 py-2.5 pr-2.5 pl-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-primary">
          <FileTextIcon className="size-4" />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-medium text-ink">Evidence report</div>
          <div className="truncate font-mono text-[11.5px] text-ink-3">{drugId}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <a
            className={cn(buttonVariants({ variant: "outline" }))}
            href={`${url}${query}`}
            target="_blank"
            rel="noreferrer"
          >
            <PrinterIcon />
            Print
          </a>
          <a
            className={cn(buttonVariants())}
            href={`${url}.pdf${query}`}
            target="_blank"
            rel="noreferrer"
          >
            <DownloadSimpleIcon />
            Download PDF
          </a>
        </div>
      </div>
      </div>
      <div className="flex-1 px-3 pt-4 pb-10 md:px-6 md:pt-5">
        <div className="mx-auto w-full max-w-[800px]">
          {loading && (
            <div
              role="status"
              aria-label="Loading report"
              className={cn("space-y-4 p-8 md:p-12", SHEET)}
            >
              <Skeleton className="h-3 w-2/3" />
              <Skeleton className="h-8 w-48" />
              <Skeleton className="h-6 w-80" />
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="space-y-2 border-t border-ink/[0.06] pt-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-full" />
                </div>
              ))}
            </div>
          )}
          {error && (
            <div className="glass flex items-center gap-3 p-4 text-[13.5px] text-ink-2">
              <p role="alert" className="m-0">
                Report unavailable
              </p>
              <button
                type="button"
                className={cn(buttonVariants({ variant: "outline" }))}
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
              className={cn("block h-[1075px] w-full", SHEET)}
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
