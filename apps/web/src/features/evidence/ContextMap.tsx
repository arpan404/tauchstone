import { BrainIcon, GridFourIcon } from "@phosphor-icons/react";
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
  const below = contexts.filter((c) => c.consensus < 0).length;
  return (
    <Panel
      title="Where it reverses"
      icon={<GridFourIcon />}
      caption={
        contexts.length
          ? `${below} of ${contexts.length} ranking context${contexts.length === 1 ? "" : "s"} below zero`
          : "Ranking contexts"
      }
      aria-label="Ranking context map"
      className={className}
      actions={
        neuralLines.size ? (
          <StatusBadge tone="ok">
            <BrainIcon />
            Neural-line ranking data
          </StatusBadge>
        ) : (
          <StatusBadge tone="gap">
            <BrainIcon />
            No neural-line ranking data
          </StatusBadge>
        )
      }
    >
      {contexts.length ? (
        <>
          <div className="overflow-x-auto">
            <table className="-mx-1 border-separate border-spacing-1 text-[12px]">
              <caption className="sr-only">
                Ranking contexts by cell line and concentration
              </caption>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="w-20 pb-1 text-left text-[11.5px] font-normal text-ink-3"
                  >
                    Cell line
                  </th>
                  {doses.map((dose) => (
                    <th
                      key={dose}
                      scope="col"
                      className="w-[104px] min-w-[86px] pb-1 pl-1 text-left font-mono text-[11.5px] font-normal text-ink-3"
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
                            <div className="flex flex-col gap-1">
                              {cells.map((c, i) => {
                                const h = heat(c.consensus);
                                return (
                                  <div
                                    key={`${c.time}-${i}`}
                                    title={`${line} · ${doseLabel(dose)} · ${c.time}: ${signed(c.consensus)}`}
                                    style={{ background: h.background }}
                                    className={cn(
                                      "flex h-8 items-center justify-between gap-1 rounded-lg px-2 font-mono text-[11.5px] whitespace-nowrap tabular-nums",
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
                            <div className="h-8 rounded-lg bg-ink/[0.035]">
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
      className="mt-4 flex items-center gap-2 font-mono text-[11px] text-ink-3"
      aria-hidden
    >
      <span className="font-sans">Reversal</span>
      <span>−3</span>
      <span className="flex overflow-hidden rounded-full">
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
