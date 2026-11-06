import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import { isMockMode, mockApi } from './mock';
import type { BenchmarkData, Schema } from './types';
import { isMockProvenance } from './types';

type Mode = Schema<'Mode'>;

async function realStartAttack(
  candidateId: string,
  mode: Mode,
  budget: number,
): Promise<Schema<'AttackSession'>> {
  return api<Schema<'AttackSession'>>('/attack', {
    method: 'POST',
    body: JSON.stringify({ candidate_id: candidateId, mode, budget }),
  });
}

async function realRunExperiment(
  sessionId: string,
  contextId: string,
  mode: Mode,
): Promise<Schema<'RunResult'>> {
  return api<Schema<'RunResult'>>(`/attack/${sessionId}/run`, {
    method: 'POST',
    body: JSON.stringify({ context_id: contextId, mode }),
  });
}

export function useMockFlag(): boolean {
  return isMockMode();
}

/** Server liveness + whether the server says it is serving mock data. */
export function useHealth() {
  return useQuery({
    queryKey: ['health'],
    queryFn: (): Promise<{ status: string; mock: boolean }> =>
      isMockMode()
        ? Promise.resolve({ status: 'ok', mock: true })
        : api<{ status: string; mock: boolean }>('/health'),
  });
}

type ProvenanceLike = { dataset_accession?: string | string[] } | null | undefined;

/**
 * Integrity signal: true when the numbers on screen may be mock/synthetic.
 * Covers the in-browser mock (VITE_USE_MOCK=1), a live server in mock mode
 * (/health.mock), and any view whose provenance says MOCK/synthetic.
 */
export function useMockStatus(provenance?: ProvenanceLike): boolean {
  const health = useHealth();
  if (isMockMode()) return true;
  if (health.data?.mock) return true;
  return isMockProvenance(provenance ?? null);
}

export function useSignature(cohort = 'GSE132903') {
  return useQuery({
    queryKey: ['signature', cohort],
    queryFn: () =>
      isMockMode()
        ? mockApi.getSignature(cohort)
        : api<Schema<'Signature'>>(`/signatures/${cohort}`),
  });
}

export function useCandidates(limit = 50) {
  return useQuery({
    queryKey: ['candidates', limit],
    queryFn: () =>
      isMockMode() ? mockApi.listCandidates(limit) : api<Schema<'CandidateList'>>('/candidates'),
  });
}

export function useEvidence(candidateId: string | null) {
  return useQuery({
    queryKey: ['evidence', candidateId],
    enabled: candidateId !== null,
    queryFn: () => {
      if (!candidateId) throw new Error('No candidate selected');
      return isMockMode()
        ? mockApi.getEvidence(candidateId)
        : api<Schema<'EvidenceCard'>>(`/candidates/${candidateId}/evidence`);
    },
  });
}

export function useBenchmark() {
  return useQuery({
    queryKey: ['benchmark'],
    queryFn: () =>
      isMockMode() ? mockApi.getBenchmark() : api<BenchmarkData>('/benchmark'),
    retry: false,
  });
}

export function attackSessionKey(sessionId: string): string[] {
  return ['attack', sessionId];
}

export function useStartAttack() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ candidateId, mode, budget }: { candidateId: string; mode: Mode; budget: number }) =>
      isMockMode()
        ? mockApi.startAttack(candidateId, mode, budget)
        : realStartAttack(candidateId, mode, budget),
    onSuccess: (session) => {
      qc.setQueryData(attackSessionKey(session.session_id), session);
    },
  });
}

export function useRunExperiment(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ contextId, mode }: { contextId: string; mode: Mode }) => {
      if (!sessionId) throw new Error('No attack session');
      return isMockMode()
        ? mockApi.runExperiment(sessionId, contextId, mode)
        : realRunExperiment(sessionId, contextId, mode);
    },
    onSuccess: (result) => {
      if (sessionId) qc.setQueryData(attackSessionKey(sessionId), result);
    },
  });
}

export function useAttackSessionSnapshot(sessionId: string | null) {
  const qc = useQueryClient();
  if (!sessionId) return null;
  return qc.getQueryData<Schema<'AttackSession'>>(attackSessionKey(sessionId)) ?? null;
}
