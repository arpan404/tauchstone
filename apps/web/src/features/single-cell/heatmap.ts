import type { Schema } from '@/api/types';

export type Data = Schema<'SingleCellExploratory'>;
export type Drug = Data['drugs'][number];
export type Signature = Data['signatures'][number];

export const notScored = 'not scored: fewer than 3 donors per group';
export const fmt = (n: number | null | undefined) => (n == null ? 'unspecified' : n.toFixed(3));
export const signed = (n: number, d = 2) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(d)}`;

/** Display order of cell types within a region (neurons first, then glia). */
const CELL_ORDER = ['excitatory_neurons', 'inhibitory_neurons', 'astrocytes', 'microglia', 'oligodendrocytes', 'opc'];
export const CELL_SHORT: Record<string, string> = {
  excitatory_neurons: 'Exc',
  inhibitory_neurons: 'Inh',
  astrocytes: 'Ast',
  microglia: 'Mic',
  oligodendrocytes: 'Oli',
  opc: 'OPC',
};
export const REGION_NAME: Record<string, string> = {
  PFC: 'prefrontal cortex',
  EC: 'entorhinal cortex',
  HIP: 'hippocampus',
};

export const cellName = (s: Pick<Signature, 'cell_type'>) => {
  const n = s.cell_type === 'opc' ? 'OPC' : s.cell_type.replaceAll('_', ' ');
  return n.charAt(0).toUpperCase() + n.slice(1);
};
export const cellShort = (s: Pick<Signature, 'cell_type'>) => CELL_SHORT[s.cell_type] ?? s.cell_type.slice(0, 3);
export const regionName = (s: Pick<Signature, 'region'>) =>
  s.region ? (REGION_NAME[s.region] ?? s.region) : 'region unspecified';
export const isScored = (s: Pick<Signature, 'status'>) => s.status === 'ok';

const cellRank = (c: string) => {
  const i = CELL_ORDER.indexOf(c);
  return i < 0 ? CELL_ORDER.length : i;
};

export function ordered(data: Data) {
  const scored = new Set(data.signatures.filter(isScored).map((s) => s.cohort));
  return {
    drugs: [...data.drugs].sort((a, b) => a.pool_rank - b.pool_rank),
    // Datasets with scored signatures first, so fully unscored datasets sit at the end.
    signatures: [...data.signatures].sort(
      (a, b) =>
        Number(!scored.has(a.cohort)) - Number(!scored.has(b.cohort)) ||
        a.cohort.localeCompare(b.cohort) ||
        (a.region ?? '').localeCompare(b.region ?? '') ||
        cellRank(a.cell_type) - cellRank(b.cell_type) ||
        a.cell_type.localeCompare(b.cell_type),
    ),
  };
}

export interface ColumnGroup {
  key: string;
  dataset: string;
  region: string | null;
  signatures: Signature[];
  scored: number;
}

/** Consecutive signatures from one dataset and region, for the grouped column header. */
export function columnGroups(signatures: Signature[]): ColumnGroup[] {
  const out: ColumnGroup[] = [];
  for (const s of signatures) {
    const key = `${s.cohort}|${s.region ?? ''}`;
    const last = out.at(-1);
    if (last?.key === key) last.signatures.push(s);
    else out.push({ key, dataset: s.cohort, region: s.region ?? null, signatures: [s], scored: 0 });
  }
  for (const g of out) g.scored = g.signatures.filter(isScored).length;
  return out;
}

export type Cell =
  | { kind: 'unscored'; reason: string }
  | { kind: 'score'; value: number; wtcs?: number | null; ks?: number | null; cosine?: number | null };

/** A drug's score in one signature. Unscored signatures never read as zero. */
export function cellOf(drug: Drug, signature: Signature): Cell {
  if (!isScored(signature)) return { kind: 'unscored', reason: notScored };
  const score = drug.scores.find((s) => s.signature_id === signature.signature_id);
  if (score?.consensus == null) return { kind: 'unscored', reason: 'not scored: score unavailable' };
  return { kind: 'score', value: score.consensus, ...score.scores };
}

export function scoreText(drug: Drug, signature: Signature) {
  const c = cellOf(drug, signature);
  if (c.kind === 'unscored') return c.reason;
  return `reversal ${fmt(c.value)}; WTCS ${fmt(c.wtcs)}; KS ${fmt(c.ks)}; cosine ${fmt(c.cosine)}`;
}

/** Symmetric colour limit over every scored cell. */
export function colourLimit(drugs: Drug[], signatures: Signature[]): number {
  let m = 0;
  for (const d of drugs)
    for (const s of signatures) {
      const c = cellOf(d, s);
      if (c.kind === 'score') m = Math.max(m, Math.abs(c.value));
    }
  return Math.max(m, 0.001);
}

/**
 * Cell fill: blue for negative (opposite to Alzheimer's), warm for positive (same direction).
 * Strength rises with |value| on a square-root curve so mid values stay visible from a distance.
 */
export function cellColour(value: number, limit: number): string {
  const t = Math.min(1, Math.abs(value) / limit);
  const pct = Math.round(8 + 87 * Math.sqrt(t));
  return `color-mix(in srgb, var(${value < 0 ? '--ac' : '--warm'}) ${pct}%, transparent)`;
}

export interface QueryInfo {
  fallback: boolean;
  nUp?: number;
  nDown?: number;
}

/** How each signature's LINCS query was built, from provenance (fallback = top-ranked genes). */
export function queryInfo(data: Data, signatureId: string): QueryInfo | null {
  const queries = (data.provenance.parameters as { queries?: Record<string, { fallback?: boolean; n_up?: number; n_down?: number }> } | undefined)
    ?.queries;
  const q = queries?.[signatureId];
  if (!q || typeof q.fallback !== 'boolean') return null;
  return { fallback: q.fallback, nUp: q.n_up, nDown: q.n_down };
}
