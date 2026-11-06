# Processed tables

Everything lives under `$TS_DATA_DIR/processed/` (default `~/Data/tauchstone/processed`), and each
file has a `<file>.provenance.json` sidecar. Gene IDs are strings. Scores: negative = reversal.
Algorithms: [../algorithms.md](../algorithms.md).

| File | Owner | Columns |
|---|---|---|
| `signatures/{cohort}__main.parquet` | WS2 | entrez_id, symbol, log2fc, stat, p_value, fdr, mean_expr, method |
| `signatures/GSE132903__composition_adjusted.parquet` | WS2 | same as main |
| `signatures/{cohort}__samples.parquet` | WS2 | sample_id, group, included, exclusion_reason, age, sex, pmi, rin, batch, … |
| `signatures/GSE132903__permutations.parquet` | WS2 | perm_id, entrez_id, stat |
| `lincs/sig_info.parquet` | WS3 | sig_id, pert_id, pert_iname, cell_id, pert_idose, pert_itime, pert_dose, pert_dose_unit, pert_time, pert_time_unit, distil_cc_q75, pct_self_rank_q25, distil_nsample, is_gold, source, context_id, row |
| `lincs/genes.parquet` | WS3 | entrez_id, symbol, is_landmark, is_bing |
| `lincs/landmark_order.parquet` | WS3 | col, entrez_id |
| `lincs/level5_landmark_f32.npy` | WS3 | float32 (n_trt_cp_sigs × 978), rows = sig_info.row |
| `lincs/compounds.parquet` | WS3 | pert_id, pert_iname, canonical_smiles, inchi_key, n_signatures, n_contexts |
| `lincs/context_split.parquet` | WS3 | pert_id, context_id, split (`ranking`/`held_out`) |
| `scores/{name}__signature_scores.parquet` | WS3 | sig_id, pert_id, context_id, split, wtcs, ks, cosine, z_wtcs, z_ks, z_cosine, consensus |
| `scores/{name}__context_scores.parquet` | WS3 | pert_id, context_id, split, cell_id, pert_idose, pert_itime, consensus, z_wtcs, z_ks, z_cosine — **server-only** (held-out rows) |
| `scores/{name}__compound_ranking.parquet` | WS3 | rank, pert_id, pert_iname, consensus_median, consensus_q25, consensus_q75, n_ranking_contexts, n_held_out_contexts, z_wtcs_median, z_ks_median, z_cosine_median |
| `scores/{name}__permutation_null.parquet` | WS3 | perm_id, pert_id, consensus_median |
| `scores/{name}__permutation_summary.parquet` | WS3 | pert_id, real_score, p_perm (θ in provenance) |
| `evidence/targets.parquet` | WS4 | pert_id, chembl_id, target_symbol, uniprot, entrez_id, ensembl_id, action_type, mechanism, source_url |
| `evidence/brain_expression.parquet` | WS4 | entrez_id, context, kind (`region`/`cell_type`), ntpm, source_url |
| `evidence/ad_association.parquet` | WS4 | ensembl_id, entrez_id, score, datatype_scores (json), source_url |
| `evidence/approval.parquet` | WS4 | pert_id, chembl_id, max_phase, status, source_url |
| `evidence/exposure.parquet` | WS4 | pert_id, level, measure (`kp`/`pampa_pe`/`csf`/`predicted_mpo`), value, unit, is_measured, summary, source_url — **measured rows are server-only until revealed** |
| `evidence/structures.parquet` | WS4 | uniprot, pdb_id, method, resolution_angstrom, local_path |
| `tauchstone/truth_table.parquet` | WS5 | candidate_id, context_id, context_type, label, value, threshold, outcome, rule, tissue, region, platform, cell_id, pert_idose, pert_itime — **server-only** |
| `tauchstone/benchmark_runs.parquet` | WS5 | policy, candidate_id, seed, step, context_id, p_survive_before, outcome, p_claim_before, p_claim_after, verdict |
| `tauchstone/benchmark_summary.json` | WS5 | the `Benchmark` schema in openapi.yaml |
