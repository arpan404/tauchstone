import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from './client';
import { isMockMode } from './mock';
import type { operations } from './schema';
import type { Schema } from './types';

export type CandidateFilters = NonNullable<operations['listProjectCandidates']['parameters']['query']>;
export type LookupInput = operations['lookupCompounds']['requestBody']['content']['application/json'];

// Display fixtures only. IDs are explicitly mock IDs, never presented as LINCS IDs.
const rows: [string, number, number, boolean, boolean, boolean][] = [
  ['Ticrynafen', -2.32, 4, true, false, true], ['Nepafenac', -2.03, 3, true, false, true],
  ['Cholic acid', -1.82, 13, true, true, false], ['Bavisant', -1.81, 5, false, false, true],
  ['Piperacillin', -1.79, 3, true, false, false], ['Busulfan', -1.79, 5, true, false, false],
  ['LY-2886721', -1.77, 5, false, false, true], ['Cefotetan', -1.76, 7, true, false, false],
  ['Enobosarm', -1.71, 8, false, false, false], ['CPI-1189', -1.68, 6, false, false, true],
  ['Granisetron', -1.68, 3, true, false, true], ['Brinzolamide', -1.67, 3, true, false, false],
];
export const mvpCandidates: Schema<'ProjectCandidate'>[] = rows.map(([name, consensus, contexts, approved, brain, penetrant], i) => ({
  id: `MOCK-${String(i + 1).padStart(4, '0')}`, name, rank: i + 1, consensus,
  consensus_iqr: [], scores: { wtcs: consensus, ks: consensus, cosine: consensus },
  n_ranking_contexts: contexts, by_cell_line: brain ? [{ cell_id: 'NEU', consensus: -0.66, n_contexts: 1 }] : [],
  approval_status: { status: approved ? 'approved' : 'investigational' }, brain_cells: brain,
  penetrant, exposure_label: penetrant ? 'predicted penetrant' : 'predicted low',
  attack_ready: true, preregistered: true,
}));
export function mockProjectCandidates(projectId: string, filters: CandidateFilters = {}): Schema<'ProjectCandidates'> {
  const eligible = mvpCandidates.filter(c =>
    (filters.approved === undefined || (c.approval_status?.status === 'approved') === filters.approved) &&
    (filters.brain_cells === undefined || c.brain_cells === filters.brain_cells) &&
    (filters.penetrant === undefined || c.penetrant === filters.penetrant) &&
    c.n_ranking_contexts >= (filters.min_contexts ?? 0));
  return { project_id: projectId, n_ranked: 1816, n_total_eligible: eligible.length, preregistered: true, candidates: eligible.slice(0, filters.limit ?? 50) };
}
export function mockDrug(id: string): Schema<'DrugDetail'> {
  const candidate = mvpCandidates.find(c => c.id === id || c.name.toLowerCase() === id.toLowerCase());
  if (!candidate) throw new Error('Drug not found');
  const piperacillin = candidate.name === 'Piperacillin';
  return {
    drug_id: candidate.id, name: candidate.name, pool_rank: candidate.rank, rank_total: 1816,
    consensus: candidate.consensus, n_contexts: candidate.n_ranking_contexts,
    approval_status: candidate.approval_status, targets: [], structure: null, molecule: null,
    gaps: { brain_cells: candidate.brain_cells ? [{ cell_id: 'NEU', consensus: -0.66, below_theta: false }] : [],
      cancer_lines_only: piperacillin, doses_um: piperacillin ? [10] : [], times_h: piperacillin ? [6] : [],
      exposure: { level: 'predicted', label: candidate.exposure_label ?? 'unspecified' }, has_targets: false },
    contexts: piperacillin ? ['HT29', 'MCF7', 'VCAP'].map(cell_id => ({ cell_id, dose: '10 uM', time: '6 h', consensus: -1.79 })) :
      candidate.by_cell_line.map(c => ({ cell_id: c.cell_id, dose: 'unspecified', time: 'unspecified', consensus: c.consensus, neural: true })),
    n_hidden_tests: piperacillin ? 3 : null, attack_ready: true, preregistered: true,
  };
}
export function mockDrugResources(id: string): Schema<'ResourceAgreement'>[] {
  const drug = mockDrug(id);
  return [{ resource: 'tauchstone_lincs_gold', status: 'available', rank: drug.pool_rank, n_ranked: 1816 },
    { resource: 'clue', status: 'needs_key' }, { resource: 'perturb_seqr', status: 'not_available' }];
}
export function mockLookup({ names }: LookupInput): Schema<'LookupResult'>[] {
  const known: Record<string, [number, number, number]> = { donepezil: [684, -0.24, 6], memantine: [502, -0.36, 4], galantamine: [1214, 0.21, 4] };
  return names.map(query => {
    const normalized = query.trim().toLowerCase();
    const candidate = mvpCandidates.find(c => c.name.toLowerCase() === normalized);
    const entry = known[normalized];
    if (candidate || entry) return { query, name: candidate?.name ?? query, status: 'ranked', drug_id: candidate?.id ?? `MOCK-LOOKUP-${normalized}`,
      pool_rank: candidate?.rank ?? entry![0], rank_total: 1816, consensus: candidate?.consensus ?? entry![1],
      n_contexts: candidate?.n_ranking_contexts ?? entry![2], attack_ready: candidate?.attack_ready ?? false, preregistered: false };
    return { query, status: normalized === 'rivastigmine' ? 'not_rankable' : 'not_in_lincs', attack_ready: false, preregistered: false };
  });
}
export function useProjectCandidates(projectId: string | null, filters: CandidateFilters = {}) {
  return useQuery({ queryKey: ['project-candidates', projectId, filters], enabled: !!projectId,
    queryFn: () => {
      if (!projectId) throw new Error('No project selected');
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(filters)) if (value !== undefined) params.set(key, String(value));
      return isMockMode() ? Promise.resolve(mockProjectCandidates(projectId, filters)) : api<Schema<'ProjectCandidates'>>(`/projects/${encodeURIComponent(projectId)}/candidates?${params}`);
    } });
}
export function useDrug(drugId: string | null, projectId?: string) {
  return useQuery({ queryKey: ['drug', drugId, projectId], enabled: !!drugId,
    queryFn: () => {
      if (!drugId) throw new Error('No drug selected');
      return isMockMode() ? Promise.resolve(mockDrug(drugId)) : api<Schema<'DrugDetail'>>(`/drugs/${encodeURIComponent(drugId)}${projectId ? `?project_id=${encodeURIComponent(projectId)}` : ''}`);
    } });
}
export function useDrugResources(drugId: string | null) {
  return useQuery({ queryKey: ['drug-resources', drugId], enabled: !!drugId,
    queryFn: () => {
      if (!drugId) throw new Error('No drug selected');
      return isMockMode() ? Promise.resolve(mockDrugResources(drugId)) : api<Schema<'ResourceAgreement'>[]>(`/drugs/${encodeURIComponent(drugId)}/resources`);
    } });
}
export function useLookup() {
  return useMutation({ mutationFn: (input: LookupInput) => isMockMode() ? Promise.resolve(mockLookup(input)) : api<Schema<'LookupResult'>[]>('/lookup', { method: 'POST', body: JSON.stringify(input) }) });
}
