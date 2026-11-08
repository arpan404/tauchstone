import type { Schema } from "@/api/types";
import { Panel, StatusBadge } from "@/components/system";
import { cn } from "cn";
import { doseLabel, heat, NEURAL_LINE, signed } from "./format";

type Context = Schema<"ContextCell">;

const isNeural = (c: Context) => c.neural || NEURAL_LINE.test(c.cell_id);
const hours = (t: string) => parseFloat(t) || 0;

/** Cell line × concentration matrix of ranking contexts. Each measured time is one heat block. */
export function ContextMap({
  contexts,
  className,
}: {
  contexts: Context[];
  className?: string;
}) {
  const neuralLines = new Set(contexts.filter(isNeural).map((c) => c.cell_id));
  const lines = [...new Set(contexts.map((c) => c.cell_id))].sort(
    (a, b) =>
      Number(neuralLines.has(b)) - Number(neuralLines.has(a)) ||
      a.localeCompare(b),
  );
  const doses = [...new Set(contexts.map((c) => c.dose))].sort(
    (a, b) => parseFloat(a) - parseFloat(b),
  );
  return (
    <Panel
      title="Ranking contexts"
      aria-label="Ranking context map"
      className={className}
      actions={
        neuralLines.size ? (
          <StatusBadge tone="ok">Neural-line ranking data</StatusBadge>
        ) : (
          <StatusBadge tone="gap">No neural-line ranking data</StatusBadge>
        )
      }
    >
      {contexts.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-1 text-[12px]">
              <caption className="sr-only">
                Ranking contexts by cell line and concentration
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="w-24 pb-1 text-left text-[12px] font-normal text-ink-3"
                  >
                    Cell line
                  </th>
                  {doses.map((dose) => (
                    <th
                      key={dose}
                      scope="col"
                      className="w-[104px] min-w-[92px] pb-1 text-left font-mono text-[12px] font-normal text-ink-3"
                    >
                      {doseLabel(dose)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line}>
                    <th
                      scope="row"
                      className="pr-2 text-left align-middle font-mono text-[12.5px] font-medium text-ink"
                    >
                      <span className="flex items-center gap-1.5">
                        {line}
                        {neuralLines.has(line) && (
                          <span
                            className="size-1.5 rounded-full bg-ok"
                            aria-label="neural line"
                          />
                        )}
                      </span>
                    </th>
                    {doses.map((dose) => {
                      const cells = contexts
                        .filter((c) => c.cell_id === line && c.dose === dose)
                        .sort((a, b) => hours(a.time) - hours(b.time));
                      return (
                        <td
                          key={dose}
                          data-filled={cells.length > 0}
                          className="p-0 align-top"
                        >
                          {cells.length ? (
                            <div className="flex flex-col gap-px overflow-hidden rounded-md">
                              {cells.map((c, i) => {
                                const h = heat(c.consensus);
                                return (
                                  <div
                                    key={`${c.time}-${i}`}
                                    title={`${line} · ${doseLabel(dose)} · ${c.time}: ${signed(c.consensus)}`}
                                    style={{ background: h.background }}
                                    className={cn(
                                      "flex h-7 items-center justify-between gap-1 px-1.5 font-mono text-[11.5px] whitespace-nowrap tabular-nums",
                                      h.strong ? "text-primary-foreground" : "text-ink",
                                    )}
                                  >
                                    <span
                                      className={
                                        h.strong ? "opacity-80" : "text-ink-2"
                                      }
                                    >
                                      {c.time}
                                    </span>
                                    <span className="font-medium">
                                      {signed(c.consensus)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="h-7 rounded-md border border-dashed border-line">
                              <span className="sr-only">Not measured</span>
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <HeatLegend />
        </>
      ) : (
        <p className="m-0 text-[13px] text-ink-3">No ranking contexts</p>
      )}
    </Panel>
  );
}

function HeatLegend() {
  const stops = [-3, -2, -1, 0, 1, 2];
  return (
    <div
      className="mt-3 flex items-center gap-2 font-mono text-[11px] text-ink-3"
      aria-hidden
    >
      <span className="font-sans">Reversal</span>
      <span>−3</span>
      <span className="flex overflow-hidden rounded-[3px]">
        {stops.map((v) => (
          <span
            key={v}
            className="h-2 w-6"
            style={{ background: heat(v === 0 ? -0.01 : v).background }}
          />
        ))}
      </span>
      <span>+2</span>
      <span className="font-sans">Mimic</span>
    </div>
  );
}
