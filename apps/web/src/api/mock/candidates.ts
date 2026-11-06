import type { components } from '../schema';
import { MOCK_SEED, randn, roundTo, streamFor } from './prng';

type CandidateList = components['schemas']['CandidateList'];
type Candidate = components['schemas']['Candidate'];

export const MOCK_CELL_LINES = [
  'A375',
  'A549',
  'HA1E',
  'HCC515',
  'HEPG2',
  'HT29',
  'MCF7',
  'PC3',
  'VCAP',
] as const;

export const MOCK_THETA = -1.0;
export const MOCK_N_CANDIDATES = 50;

const APPROVAL_CYCLE = [
  { status: 'approved', max_phase: 4 },
  { status: 'investigational', max_phase: 2 },
  { status: 'preclinical', max_phase: 1 },
  { status: 'unknown', max_phase: null },
] as const;

let cache: CandidateList | null = null;

export function mockCandidateId(rank: number): string {
  return `MOCK-${String(rank).padStart(4, '0')}`;
}

export function mockCandidateName(rank: number): string {
  return `Mock compound ${String(rank).padStart(2, '0')}`;
}

export function getMockCandidates(): CandidateList {
  if (cache) return cache;
  const rng = streamFor('candidates:ranking');
  const candidates: Candidate[] = [];

  for (let rank = 1; rank <= MOCK_N_CANDIDATES; rank++) {
    // Decaying reversal strength: rank 1 ≈ -2.6, rank 50 ≈ -0.55.
    const consensus = roundTo(-(2.6 * Math.exp(-(rank - 1) / 22) + 0.45 + rng() * 0.08), 3);
    const halfWidth = 0.18 + rng() * 0.25;
    const jitter = () => roundTo(randn(rng) * 0.22, 3);
    const cellRng = streamFor(`candidate-cells:${rank}`);
    const by_cell_line = MOCK_CELL_LINES.map((cell_id) => ({
      cell_id,
      consensus: roundTo(consensus + randn(cellRng) * 0.35, 3),
      n_contexts: 3 + Math.floor(cellRng() * 8),
    }));
    const approval = APPROVAL_CYCLE[(rank - 1) % APPROVAL_CYCLE.length];
    const flags: Candidate['flags'] = [];
    if (rank % 9 === 4) flags.push('composition_sensitive');
    if (rank % 11 === 7) flags.push('few_contexts');

    candidates.push({
      id: mockCandidateId(rank),
      rank,
      name: mockCandidateName(rank),
      consensus,
      consensus_iqr: [roundTo(consensus - halfWidth, 3), roundTo(consensus + halfWidth, 3)],
      n_ranking_contexts: 4 + Math.floor(rng() * 30),
      n_held_out_contexts: 2 + Math.floor(rng() * 6),
      scores: {
        wtcs: roundTo(consensus + jitter(), 3),
        ks: roundTo(consensus + jitter(), 3),
        cosine: roundTo(consensus + jitter(), 3),
      },
      by_cell_line,
      approval_status: {
        status: approval.status,
        max_phase: approval.max_phase,
        source: { label: 'ChEMBL (mock)', url: 'https://www.ebi.ac.uk/chembl/' },
      },
      flags,
      is_demo_candidate: rank === 1 || rank === 5 || rank === 12,
    });
  }

  cache = {
    signature: 'GSE132903__main',
    n_ranked: 327,
    permutation_control: { n_permutations: 200, theta: MOCK_THETA, passed: true },
    candidates,
    provenance: {
      dataset_accession: 'GSE132903',
      processing_version: 'mock-0.1.0',
      git_commit: 'mock',
      timestamp: '2026-11-05T00:00:00Z',
      random_seed: MOCK_SEED,
      parameters: { theta: MOCK_THETA },
    },
  };
  return cache;
}

export function getMockCandidate(rankOrId: number | string): Candidate {
  const list = getMockCandidates();
  const found =
    typeof rankOrId === 'number'
      ? list.candidates.find((c) => c.rank === rankOrId)
      : list.candidates.find((c) => c.id === rankOrId);
  if (!found) throw new Error(`Mock candidate not found: ${rankOrId}`);
  return found;
}
