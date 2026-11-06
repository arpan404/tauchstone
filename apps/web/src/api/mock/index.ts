import type { components, Schema } from '../schema';
import { resetMockAttack, runMockExperiment, startMockAttack } from './attack';
import { getMockBenchmark } from './benchmark';
import { getMockCandidate, getMockCandidates } from './candidates';
import { getMockEvidence } from './evidence';
import { resetMockSignature, getMockSignature } from './signature';

export type { Schema };

/** Tiny async wrapper so mock calls share the Promise-based interface. */
function asyncWrap<T>(fn: () => T): Promise<T> {
  return new Promise((resolve, reject) => {
    try {
      resolve(fn());
    } catch (e) {
      reject(e);
    }
  });
}

export const mockApi = {
  getSignature: (_cohort = 'GSE132903'): Promise<Schema<'Signature'>> =>
    asyncWrap(() => getMockSignature()),
  listCandidates: (_limit = 50): Promise<Schema<'CandidateList'>> =>
    asyncWrap(() => getMockCandidates()),
  getEvidence: (candidateId: string): Promise<Schema<'EvidenceCard'>> =>
    asyncWrap(() => getMockEvidence(candidateId)),
  startAttack: (
    candidateId: string,
    mode: components['schemas']['Mode'] = 'attack',
    budget = 5,
  ): Promise<Schema<'AttackSession'>> => asyncWrap(() => startMockAttack(candidateId, mode, budget)),
  runExperiment: (
    sessionId: string,
    contextId: string,
    mode?: components['schemas']['Mode'],
  ): Promise<Schema<'RunResult'>> => asyncWrap(() => runMockExperiment(sessionId, contextId, mode)),
  getBenchmark: (): Promise<Schema<'Benchmark'>> => asyncWrap(() => getMockBenchmark()),
  getCandidate: (rankOrId: number | string) => getMockCandidate(rankOrId),
};

/** Reset all mock state (tests + "restart demo" affordances). */
export function resetMock(): void {
  resetMockAttack();
  resetMockSignature();
}

export function isMockMode(): boolean {
  const raw = import.meta.env.VITE_USE_MOCK;
  if (raw === '1') return true;
  if (raw === '0') return false;
  return import.meta.env.DEV;
}
