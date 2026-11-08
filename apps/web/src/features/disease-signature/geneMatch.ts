import type { Schema } from '@/api/types';

type Gene = Schema<'GeneStat'>;

/** Genes matching a symbol or Entrez query: exact match first, then prefix, then substring. */
export function matchGenes(genes: Gene[], query: string): Gene[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const rank = (g: Gene) => {
    const s = g.symbol.toLowerCase();
    if (s === q || g.entrez_id === q) return 0;
    if (s.startsWith(q)) return 1;
    return 2;
  };
  return genes
    .filter((g) => g.symbol.toLowerCase().includes(q) || g.entrez_id.includes(q))
    .sort((a, b) => rank(a) - rank(b) || a.symbol.localeCompare(b.symbol));
}

/** The gene a query points at: an exact symbol or Entrez match, else the only match. */
export function focusGene(matches: Gene[], query: string): Gene | null {
  const q = query.trim().toLowerCase();
  const exact = matches.find((g) => g.symbol.toLowerCase() === q || g.entrez_id === q);
  return exact ?? (matches.length === 1 ? matches[0]! : null);
}
