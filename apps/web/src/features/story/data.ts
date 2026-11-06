import type { BenchmarkData, Schema } from '@/api/types';

type Candidate = Schema<'Candidate'>;

// Only discovery rank and ID enter this choice. Never inspect validation or exposure.
export function discoveryCandidate(candidates: Candidate[] = []) {
  return [...candidates].sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))[0];
}

/** The preregistered demo candidates (pool ranks 1, 5, 12), in rank order. */
export function demoCandidates(candidates: Candidate[] = []) {
  return candidates.filter((c) => c.is_demo_candidate).sort((a, b) => a.rank - b.rank);
}

/**
 * The tour features the first preregistered demo candidate whose evidence card has a target
 * structure, so the Mol* step has something to show. Uses evidence cards only (no hidden
 * outcomes). Falls back to the first demo candidate, then the discovery leader.
 */
export function featuredCandidate(
  candidates: Candidate[] = [],
  evidence: (Schema<'EvidenceCard'> | undefined)[] = [],
) {
  const demos = demoCandidates(candidates);
  const withStructure = demos.find((c) =>
    evidence.some((e) => e?.candidate_id === c.id && e.structure),
  );
  return withStructure ?? demos[0] ?? discoveryCandidate(candidates);
}

/**
 * Headline from the preregistered primary analysis (top level of /benchmark: contested
 * candidates). The all-candidates count is reported alongside as the sealed set size.
 */
export function benchmarkHeadline(data?: BenchmarkData) {
  const policies = data?.policies;
  return {
    n: data?.n_candidates,
    nSealed: data?.all_candidates?.n_candidates ?? data?.n_candidates,
    budget: data?.budget,
    tauchstone: policies?.find((p) => p.policy === 'tauchstone_hybrid')?.decision_accuracy.estimate,
    random: policies?.find((p) => p.policy === 'random')?.decision_accuracy.estimate,
  };
}

export function percent(value?: number) {
  return value === undefined ? 'Unavailable' : `${(value * 100).toFixed(1)}%`;
}
