/**
 * Typed mirror of contracts/openapi.yaml (frozen Nov 5 2026).
 *
 * NOTE: normally generated via `bun run gen:api` (openapi-typescript).
 * openapi-typescript@7.13 crashes under this repo's TypeScript 7 native port
 * (its `ts.factory.createKeywordTypeNode` usage no longer exists), so this file
 * is maintained by hand and kept in sync with the contract. If `gen:api` works
 * in your environment it will overwrite this file with the generated output.
 */
export interface components {
  schemas: {
    Error: { detail: string };
    Mode: 'attack' | 'learn';
    Verdict: 'SUPPORTED_SO_FAR' | 'FRAGILE_CONTEXT_DEPENDENT' | 'INSUFFICIENT_EVIDENCE';
    Provenance: {
      step?: string;
      dataset_accession: string | string[];
      inputs?: Record<string, string | null>;
      sample_filter?: string;
      gene_mapping_version?: string;
      model?: string;
      parameters?: Record<string, unknown>;
      random_seed?: number | null;
      validation_context?: string | null;
      processing_version: string;
      git_commit: string;
      timestamp: string;
      output?: string;
      output_sha256?: string;
    };
    SourceLink: { label: string; url: string };
    GeneStat: {
      entrez_id: string;
      symbol: string;
      log2fc: number;
      stat: number;
      p_value: number;
      fdr: number;
      query_set?: 'up' | 'down' | null;
    };
    Signature: {
      cohort: string;
      variant: 'main' | 'composition_adjusted';
      method: 'limma' | 'limma-trend' | 'deseq2';
      tissue: string;
      platform?: string;
      n_ad: number;
      n_control: number;
      n_fdr05?: number;
      genes: components['schemas']['GeneStat'][];
      sign_check?: {
        symbol: string;
        expected: 'up' | 'down';
        stat: number;
        matches: boolean;
      }[];
      provenance: components['schemas']['Provenance'];
    };
    MethodScores: { wtcs: number; ks: number; cosine: number };
    Candidate: {
      id: string;
      rank: number;
      name: string;
      consensus: number;
      consensus_iqr: [number, number];
      n_ranking_contexts: number;
      n_held_out_contexts?: number;
      scores: components['schemas']['MethodScores'];
      by_cell_line: { cell_id: string; consensus: number; n_contexts: number }[];
      approval_status?: components['schemas']['ApprovalStatus'];
      flags?: ('composition_sensitive' | 'few_contexts' | 'known_positive')[];
      is_demo_candidate?: boolean;
    };
    CandidateList: {
      signature: string;
      n_ranked: number;
      permutation_control?: { n_permutations?: number; theta?: number; passed?: boolean };
      candidates: components['schemas']['Candidate'][];
      provenance: components['schemas']['Provenance'];
    };
    ApprovalStatus: {
      status: 'approved' | 'investigational' | 'preclinical' | 'unknown';
      max_phase?: number | null;
      source?: components['schemas']['SourceLink'];
    };
    ExposureLevel:
      | 'measured_human_cns'
      | 'measured_preclinical'
      | 'curated'
      | 'predicted'
      | 'none';
    Target: {
      symbol: string;
      uniprot: string;
      entrez_id: string;
      ensembl_id?: string;
      action_type?: string | null;
      brain_expression?: {
        context: string;
        kind?: 'region' | 'cell_type';
        ntpm: number;
      }[];
      ad_association_score?: number | null;
      sources?: components['schemas']['SourceLink'][];
    };
    Structure: {
      pdb_id: string;
      uniprot: string;
      method?: string;
      resolution_angstrom?: number | null;
      url: string;
      note: 'Target context only. Not evidence that the drug binds this structure.';
    };
    EvidenceCard: {
      candidate_id: string;
      name: string;
      chembl_id?: string | null;
      mechanism?: string | null;
      targets: components['schemas']['Target'][];
      approval_status: components['schemas']['ApprovalStatus'];
      brain_exposure: {
        level: components['schemas']['ExposureLevel'];
        summary: string;
        sources?: components['schemas']['SourceLink'][];
      };
      structure?: components['schemas']['Structure'] | null;
      boundary: 'Research hypothesis only. Not a treatment recommendation. Gene expression reversal does not establish efficacy, safety, dosing, brain exposure or clinical benefit.';
      provenance: components['schemas']['Provenance'];
    };
    ContextType:
      | 'held_out_cohort'
      | 'composition_adjusted'
      | 'lincs_context'
      | 'brain_exposure'
      | 'cell_type';
    ContextState: {
      context_id: string;
      type: components['schemas']['ContextType'];
      label: string;
      status: 'hidden' | 'revealed';
      p_survive: number;
      acquisition?: number | null;
      outcome?: 'survive' | 'fail' | null;
    };
    Claim: { text: string; q: 0.7; theta: number; n_contexts: number };
    Belief: { p_claim_holds: number; interval?: [number, number] };
    AttackSession: {
      session_id: string;
      candidate_id: string;
      candidate_name?: string;
      mode: components['schemas']['Mode'];
      budget: number;
      budget_remaining: number;
      claim: components['schemas']['Claim'];
      belief: components['schemas']['Belief'];
      verdict: components['schemas']['Verdict'];
      contexts: components['schemas']['ContextState'][];
      recommended_context_id?: string | null;
      rationale?: string;
      history?: components['schemas']['RevealedOutcome'][];
    };
    RevealedOutcome: {
      context_id: string;
      type: components['schemas']['ContextType'];
      label: string;
      outcome: 'survive' | 'fail';
      value?: number | null;
      threshold?: number | null;
      rule: string;
      detail?: string;
      belief_before: number;
      belief_after: number;
      mode_used?: components['schemas']['Mode'];
      provenance?: components['schemas']['Provenance'];
    };
    RunResult: components['schemas']['AttackSession'] & {
      revealed: components['schemas']['RevealedOutcome'];
      done: boolean;
    };
    Interval: { estimate: number; ci95: [number, number] };
    PolicyResult: {
      policy:
        | 'random'
        | 'greedy_strongest'
        | 'max_failure'
        | 'max_uncertainty'
        | 'expected_decision_change'
        | 'tauchstone_hybrid';
      label: string;
      experiments_to_correct_verdict: {
        median: number;
        iqr: [number, number];
        ci95: [number, number];
      };
      fragile_recall_at_3: components['schemas']['Interval'];
      fragile_recall_at_5: components['schemas']['Interval'];
      decision_accuracy: components['schemas']['Interval'];
      brier?: number | null;
    };
    Benchmark: {
      n_candidates: number;
      n_seeds: number;
      budget: number;
      policies: components['schemas']['PolicyResult'][];
      calibration: {
        bin_lo: number;
        bin_hi: number;
        mean_predicted: number;
        observed_rate: number;
        n: number;
      }[];
      tests: {
        policy_a: string;
        policy_b: string;
        metric: string;
        statistic?: number;
        p_holm: number;
      }[];
      preregistration_sha256: string;
      preregistration_commit?: string;
      provenance: components['schemas']['Provenance'];
    };
  };
}

export type Schema<T extends keyof components['schemas']> = components['schemas'][T];
