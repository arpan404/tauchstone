"""Human-readable coverage + demo-pick evidence report."""

from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from pipelines.common.paths import PROCESSED, processed
from pipelines.common.provenance import Provenance

LEVEL_ORDER = ["measured_human_cns", "measured_preclinical", "curated", "predicted"]


def pct(n: int, d: int) -> str:
    return f"{n}/{d} ({100 * n / d:.1f}%)" if d else "n/a"


def best_level_rows(ex: pd.DataFrame) -> pd.DataFrame:
    ex = ex.copy()
    ex["level"] = pd.Categorical(ex["level"], categories=LEVEL_ORDER, ordered=True)
    return ex.sort_values("level").drop_duplicates("pert_id")


def main(ranking: str = "GSE132903__main") -> Path | None:
    pool = pd.read_parquet(PROCESSED / "scores" / f"{ranking}__candidate_pool.parquet")
    targets = pd.read_parquet(PROCESSED / "evidence" / "targets.parquet")
    assoc = pd.read_parquet(PROCESSED / "evidence" / "ad_association.parquet")
    brain = pd.read_parquet(PROCESSED / "evidence" / "brain_expression.parquet")
    approval = pd.read_parquet(PROCESSED / "evidence" / "approval.parquet")
    exposure = pd.read_parquet(PROCESSED / "evidence" / "exposure.parquet")
    structs = pd.read_parquet(PROCESSED / "evidence" / "structures.parquet")
    exp_prov = json.loads((PROCESSED / "evidence" / "exposure.parquet.provenance.json").read_text())
    examples = exp_prov.get("parameters", {}).get("example_assays", {})

    lines: list[str] = [f"# Evidence report ({ranking})", ""]
    for label, sub in [("pool ranks 1-20", pool[pool["pool_rank"] <= 20]),
                       ("pool ranks 1-100",
                        pool[pool["pool"].isin(["benchmark", "development"])])]:
        perts = set(sub["pert_id"])
        tg = targets[targets["pert_id"].isin(perts)]
        n_t = tg["pert_id"].nunique()
        ens = set(tg["ensembl_id"].dropna())
        ad = assoc[assoc["ensembl_id"].isin(ens)]
        n_ad = int(ad["score"].notna().sum())
        ent = set(tg["entrez_id"].dropna())
        br = brain[brain["entrez_id"].isin(ent)]
        n_br = br["entrez_id"].nunique()
        ex = exposure[exposure["pert_id"].isin(perts)]
        best = best_level_rows(ex) if len(ex) else ex
        lvl = best["level"].value_counts().to_dict() if len(best) else {}
        n_none = len(perts) - len(best)
        n_meas = int(best["level"].isin(["measured_human_cns", "measured_preclinical"]).sum()) \
            if len(best) else 0
        st = structs[structs["uniprot"].isin(set(tg["uniprot"].dropna()))]
        n_dl = int(st["local_path"].notna().sum())
        ap = approval[approval["pert_id"].isin(perts)]
        lines += [f"## Coverage: {label} (n={len(sub)})",
                  f"- drugs with >= 1 target: {pct(n_t, len(sub))}",
                  f"- targets with an AD association score: {pct(n_ad, len(ens))} (of {len(ens)} targets)",
                  f"- targets with brain expression: {pct(n_br, len(ent))} (of {len(ent)} targets w/ Entrez)",
                  f"- exposure best-level distribution: {lvl} + none: {n_none}",
                  f"- drugs with any measured exposure row: {n_meas}",
                  f"- approval status: {ap['status'].value_counts().to_dict()}",
                  f"- targets with a selected structure: {st['uniprot'].nunique()}"
                  f"/{tg['uniprot'].nunique()} unique UniProts ({n_dl} files cached)",
                  ""]
    lines.append("## Evidence card fields for the demo picks (pool ranks 1, 5, 12)")
    for _, d in pool[pool["is_demo"].fillna(False)].sort_values("pool_rank").iterrows():
        tg = targets[targets["pert_id"] == d["pert_id"]]
        ex = exposure[exposure["pert_id"] == d["pert_id"]]
        ap = approval[approval["pert_id"] == d["pert_id"]]
        ad_rows = assoc[assoc["ensembl_id"].isin(set(tg["ensembl_id"].dropna()))]
        lines += [f"### pool rank {int(d['pool_rank'])}: {d['pert_iname']} ({d['pert_id']}, {d['chembl_id']})",
                  f"- stage: {d['max_clinical_stage']}; consensus {d['consensus_median']:.3f}",
                  f"- approval: {(ap[['status', 'max_phase']].to_dict('records') or [None])[0]}",
                  f"- targets ({len(tg)}): " + (", ".join(
                      f"{r.target_symbol} [{r.uniprot}/{r.entrez_id}] ({r.action_type}; {r.mechanism})"
                      for r in tg.itertuples()) or "none"),
                  "- AD association: " + (", ".join(
                      f"{r.ensembl_id}={r.score:.3f}" for r in ad_rows.itertuples()
                      if pd.notna(r.score)) or "none"),
                  f"- exposure rows ({len(ex)}): " + (", ".join(
                      f"{r.level}/{r.measure}={r.value} {r.unit}" for r in ex.itertuples()) or "none"),
                  ""]
    lines += ["## Example matched ChEMBL assay descriptions (precision check)",
              "Five examples per measure kept in the build (full lists in the exposure provenance):"]
    for measure, descs in examples.items():
        lines.append(f"### {measure}")
        for desc in descs:
            lines.append(f"- {desc}")
        lines.append("")
    lines += ["## Uncertainties and deviations",
              "- Contract measure labels used: kp / pampa_pe / csf / predicted_mpo. Human "
              "brain-tissue ratios are stored as kp with level measured_human_cns (the task "
              "text's 'brain_ratio' label is not in the contract enum).",
              "- Units: 10^-6 cm/s spellings (10^-6, 10'-6, 10'6cm/s assumed typo) x1e-6; "
              "nm/s x1e-7; ucm/s (micrometre/s) x1e-4. Log-scale Pe/Papp assumed log10(Pe in "
              "cm/s) and flagged in row summaries; validate before demo.",
              "- Ratio direction: descriptions matching 'blood/plasma/serum to brain' are "
              "inverted to brain:blood; inverted '>' bounds are dropped.",
              "- CSF matching excludes growth-factor assays (CSF1R/CSF-1R/G-CSF/GM-CSF/M-CSF) "
              "and assay descriptions containing predict/calculated/in-silico are never "
              "counted as measured.",
              "- BPR/BBR/'Ratio' rows require a brain/CSF mention (caught and dropped e.g. "
              "'Blood to plasma ratio in human'); MIC/therapeutic-index/albumin-binding "
              "ratios are dropped the same way. Ex-vivo binding readouts (plaque "
              "signal-to-noise, autoradiography, staining) are excluded from kp even when "
              "they mention brain.",
              "- CSF rows keep their original units; '%' CSF levels (percent of an "
              "unstated denominator) and bare concentrations are recorded but not "
              "evaluable against a threshold (survive_rule=n/a).",
              "- Demo gaps: pool ranks 1 (tienilic-acid) and 5 (piperacillin) have no Open "
              "Targets mechanism-of-action rows, so no targets/AD/brain-expression/structures; "
              "their cards show approval + predicted exposure only.",
              "- Region aggregation is max nTPM per (Gene, Brain region); the HPA region file "
              "is already unique on that key so it is a no-op guard.",
              "- Structures are target context only, never binding evidence.",
              "",
              "Research hypothesis only. Not a treatment recommendation. Gene expression "
              "reversal does not establish efficacy, safety, dosing, brain exposure or "
              "clinical benefit.", ""]
    out_path = processed("evidence", "evidence_report.md")
    out_path.write_text("\n".join(lines))
    Provenance(step="evidence_report", dataset_accession=["derived"],
               inputs={}, parameters={"ranking": ranking}).write(out_path)
    print(out_path)
    return out_path


if __name__ == "__main__":
    main()
