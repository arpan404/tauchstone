import { useQuery } from "@tanstack/react-query";
import type { Schema } from "@/api/types";

export type CellLineCard = Schema<"CellLineCard">;

/**
 * Cited facts for every LINCS cell line (cached Cellosaurus + LINCS metadata, served offline by
 * GET /cell-lines). Loaded once; tiles stay plain when the API has none (e.g. web-only mock).
 */
export function useCellLineCards() {
  return useQuery({
    queryKey: ["cell-lines"],
    queryFn: async (): Promise<Map<string, CellLineCard>> => {
      const res = await fetch("/api/cell-lines");
      if (!res.ok) return new Map();
      const body = (await res.json()) as Schema<"CellLineList">;
      return new Map(body.cell_lines.map((c) => [c.cell_id, c]));
    },
    staleTime: Infinity,
    retry: false,
  });
}

/**
 * One sentence on where the shown measurements come from, using the real per-line counts.
 * Null until facts are loaded for at least one shown line.
 */
export function compositionSentence(
  lines: { cell_id: string; n_scored: number; neural?: boolean | null }[],
  cards: Map<string, CellLineCard> | undefined,
): string | null {
  if (!cards?.size || !lines.length) return null;
  const known = lines.filter((l) => cards.has(l.cell_id));
  const total = known.reduce((s, l) => s + l.n_scored, 0);
  if (!known.length || total <= 0) return null;
  const cancer = known
    .filter((l) => cards.get(l.cell_id)?.category === "cancer")
    .reduce((s, l) => s + l.n_scored, 0);
  const pct = Math.round((cancer / total) * 100);
  const neural = lines.filter((l) => l.neural).length;
  const lead =
    pct >= 50
      ? `Most of these measurements come from cancer cell lines (${pct}% of signatures)`
      : `${pct}% of these signatures come from cancer cell lines`;
  return `${lead}; ${neural} of ${lines.length} lines ${neural === 1 ? "is" : "are"} neural.`;
}
