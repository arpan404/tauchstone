import type { BenchmarkData } from '../types';
import { MOCK_SEED, roundTo, streamFor } from './prng';

type Benchmark = BenchmarkData;

let cache: Benchmark | null = null;

export function getMockBenchmark(): Benchmark {
  if (cache) return cache;
  const rng = streamFor('benchmark:replay');
  const defs = [
    { policy: 'random', label: 'Random', median: 4.6, recall3: 0.31, recall5: 0.52, acc: 0.68 },
    { policy: 'greedy_strongest', label: 'Greedy strongest', median: 4.1, recall3: 0.42, recall5: 0.6, acc: 0.74 },
    { policy: 'max_failure', label: 'Max failure prob.', median: 3.4, recall3: 0.55, recall5: 0.72, acc: 0.8 },
    { policy: 'max_uncertainty', label: 'Max uncertainty', median: 3.6, recall3: 0.5, recall5: 0.7, acc: 0.79 },
    {
      policy: 'expected_decision_change',
      label: 'Expected decision change',
      median: 3.1,
      recall3: 0.6,
      recall5: 0.78,
      acc: 0.83,
    },
    {
      policy: 'tauchstone_hybrid',
      label: 'Tauchstone hybrid',
      median: 2.4,
      recall3: 0.71,
      recall5: 0.88,
      acc: 0.89,
    },
  ] as const;

  const policies = defs.map((d) => {
    const j = () => (rng() - 0.5) * 0.02;
    return {
      policy: d.policy,
      label: d.label,
      experiments_to_correct_verdict: {
        median: roundTo(d.median, 2),
        iqr: [roundTo(d.median - 0.8, 2), roundTo(d.median + 0.8, 2)] as [number, number],
        ci95: [roundTo(d.median - 0.4, 2), roundTo(d.median + 0.4, 2)] as [number, number],
      },
      fragile_recall_at_3: { estimate: roundTo(d.recall3 + j(), 3), ci95: [0.2, 0.45] as [number, number] },
      fragile_recall_at_5: { estimate: roundTo(d.recall5 + j(), 3), ci95: [0.45, 0.75] as [number, number] },
      decision_accuracy: { estimate: roundTo(d.acc + j(), 3), ci95: [0.6, 0.9] as [number, number] },
      brier: roundTo(0.32 - d.acc * 0.15, 3),
    };
  });

  // Fix CIs for the hybrid row to look explicitly estimated (deterministic tweak).
  const hybrid = policies.find((p) => p.policy === 'tauchstone_hybrid');
  if (hybrid) {
    hybrid.fragile_recall_at_3.ci95 = [0.63, 0.79];
    hybrid.fragile_recall_at_5.ci95 = [0.82, 0.93];
    hybrid.decision_accuracy.ci95 = [0.84, 0.93];
  }

  const calibration = [0.1, 0.3, 0.5, 0.7, 0.9].map((p) => ({
    bin_lo: roundTo(p - 0.1, 2),
    bin_hi: roundTo(p + 0.1, 2),
    mean_predicted: p,
    observed_rate: roundTo(Math.min(0.98, Math.max(0.02, p + (rng() - 0.5) * 0.12)), 3),
    n: 40 + Math.floor(rng() * 120),
  }));

  cache = {
    n_candidates: 32,
    n_seeds: 8,
    budget: 5,
    contested_share: 0.64,
    all_candidates: {
      n_candidates: 50,
      n_seeds: 8,
      budget: 5,
      policies: policies.map((p) => ({
        ...p,
        experiments_to_correct_verdict: {
          ...p.experiments_to_correct_verdict,
          median: roundTo(p.experiments_to_correct_verdict.median + 0.6, 2),
        },
        fragile_recall_at_3: {
          ...p.fragile_recall_at_3,
          estimate: roundTo(Math.max(0, p.fragile_recall_at_3.estimate - 0.08), 3),
        },
        fragile_recall_at_5: {
          ...p.fragile_recall_at_5,
          estimate: roundTo(Math.max(0, p.fragile_recall_at_5.estimate - 0.06), 3),
        },
      })),
      calibration: calibration.map((b) => ({ ...b })),
      tests: [],
    },
    policies,
    calibration,
    tests: defs
      .filter((d) => d.policy !== 'tauchstone_hybrid')
      .map((d) => ({
        policy_a: d.policy,
        policy_b: 'tauchstone_hybrid',
        metric: 'experiments_to_correct_verdict',
        statistic: roundTo(120 + rng() * 200, 1),
        p_holm: roundTo(0.001 + rng() * 0.03, 4),
      })),
    preregistration_sha256: 'mock-prereg-hash-00000000000000000000000000000000',
    preregistration_commit: 'mock-commit',
    provenance: {
      dataset_accession: 'replay benchmark (mock)',
      processing_version: 'mock-0.1.0',
      git_commit: 'mock',
      timestamp: '2026-11-05T00:00:00Z',
      random_seed: MOCK_SEED,
    },
  };
  return cache;
}
