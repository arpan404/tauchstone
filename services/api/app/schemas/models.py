"""Pydantic v2 models mirroring contracts/openapi.yaml component schemas one-to-one.

Field names, enums, nullability and const strings match the contract exactly.
"""

from typing import Literal

from pydantic import BaseModel, Field

Mode = Literal["attack", "learn"]
Verdict = Literal["SUPPORTED_SO_FAR", "FRAGILE_CONTEXT_DEPENDENT", "INSUFFICIENT_EVIDENCE"]
ContextType = Literal[
    "held_out_cohort", "composition_adjusted", "lincs_context", "brain_exposure", "cell_type"
]
ExposureLevel = Literal[
    "measured_human_cns", "measured_preclinical", "curated", "predicted", "none"
]

BOUNDARY_TEXT = (
    "Research hypothesis only. Not a treatment recommendation. Gene expression reversal "
    "does not establish efficacy, safety, dosing, brain exposure or clinical benefit."
)
STRUCTURE_NOTE = "Target context only. Not evidence that the drug binds this structure."


class Error(BaseModel):
    detail: str


class Health(BaseModel):
    status: Literal["ok"]
    mock: bool


class Provenance(BaseModel):
    step: str | None = None
    dataset_accession: str | list[str]
    inputs: dict[str, str | None] | None = None
    sample_filter: str | None = None
    gene_mapping_version: str | None = None
    model: str | None = None
    parameters: dict | None = None
    random_seed: int | None = None
    validation_context: str | None = None
    processing_version: str
    git_commit: str
    timestamp: str
    output: str | None = None
    output_sha256: str | None = None


class SourceLink(BaseModel):
    label: str
    url: str


class GeneStat(BaseModel):
    entrez_id: str
    symbol: str
    log2fc: float
    stat: float
    p_value: float
    fdr: float
    query_set: Literal["up", "down"] | None = None


class SignCheck(BaseModel):
    symbol: str
    expected: Literal["up", "down"]
    stat: float
    matches: bool


class Signature(BaseModel):
    cohort: str
    variant: Literal["main", "composition_adjusted"]
    method: Literal["limma", "limma-trend", "deseq2"]
    tissue: str
    platform: str | None = None
    n_ad: int
    n_control: int
    n_fdr05: int | None = None
    genes: list[GeneStat]
    sign_check: list[SignCheck] | None = None
    provenance: Provenance


class MethodScores(BaseModel):
    wtcs: float
    ks: float
    cosine: float


class ApprovalStatus(BaseModel):
    status: Literal["approved", "investigational", "preclinical", "unknown"]
    max_phase: float | None = None
    source: SourceLink | None = None
    withdrawn: bool | None = None
    withdrawn_year: int | None = None
    withdrawn_class: str | None = None
    withdrawn_country: str | None = None
    withdrawn_source: str | None = None


class HeatmapCell(BaseModel):
    cell_id: str
    consensus: float
    n_contexts: int


class Candidate(BaseModel):
    id: str
    rank: int
    name: str
    consensus: float
    consensus_iqr: list[float] = Field(min_length=2, max_length=2)
    n_ranking_contexts: int
    n_held_out_contexts: int | None = None
    scores: MethodScores
    by_cell_line: list[HeatmapCell]
    approval_status: ApprovalStatus | None = None
    flags: list[Literal["composition_sensitive", "few_contexts", "known_positive"]] | None = None
    is_demo_candidate: bool | None = None


class PermutationControl(BaseModel):
    n_permutations: int | None = None
    theta: float | None = None
    passed: bool | None = None


class CandidateList(BaseModel):
    signature: str
    n_ranked: int
    permutation_control: PermutationControl | None = None
    candidates: list[Candidate]
    provenance: Provenance


class BrainExpression(BaseModel):
    context: str
    kind: Literal["region", "cell_type"] | None = None
    ntpm: float


class Target(BaseModel):
    symbol: str
    uniprot: str
    entrez_id: str
    ensembl_id: str | None = None
    action_type: str | None = None
    brain_expression: list[BrainExpression] | None = None
    ad_association_score: float | None = None
    sources: list[SourceLink] | None = None


class Structure(BaseModel):
    pdb_id: str
    uniprot: str
    url: str
    method: str | None = None
    resolution_angstrom: float | None = None
    note: Literal["Target context only. Not evidence that the drug binds this structure."]


class BrainExposure(BaseModel):
    level: ExposureLevel
    summary: str
    sources: list[SourceLink] | None = None


class EvidenceCard(BaseModel):
    candidate_id: str
    name: str
    chembl_id: str | None = None
    mechanism: str | None = None
    targets: list[Target]
    approval_status: ApprovalStatus
    brain_exposure: BrainExposure
    structure: Structure | None = None
    boundary: Literal[
        "Research hypothesis only. Not a treatment recommendation. Gene expression reversal "
        "does not establish efficacy, safety, dosing, brain exposure or clinical benefit."
    ]
    provenance: Provenance


class ContextState(BaseModel):
    context_id: str
    type: ContextType
    label: str
    status: Literal["hidden", "revealed"]
    p_survive: float = Field(ge=0, le=1)
    acquisition: float | None = None
    outcome: Literal["survive", "fail"] | None = None


class Claim(BaseModel):
    text: str
    q: Literal[0.7]
    theta: float
    n_contexts: int


class Belief(BaseModel):
    p_claim_holds: float = Field(ge=0, le=1)
    interval: list[float] | None = Field(default=None, min_length=2, max_length=2)


class RevealedOutcome(BaseModel):
    context_id: str
    type: ContextType
    label: str
    outcome: Literal["survive", "fail"]
    value: float | None = None
    threshold: float | None = None
    rule: str
    detail: str | None = None
    belief_before: float
    belief_after: float
    mode_used: Mode | None = None
    provenance: Provenance | None = None


class AttackSessionState(BaseModel):
    session_id: str
    candidate_id: str
    candidate_name: str | None = None
    mode: Mode
    budget: int
    budget_remaining: int
    claim: Claim
    belief: Belief
    verdict: Verdict
    contexts: list[ContextState]
    recommended_context_id: str | None = None
    rationale: str
    preregistered: bool | None = None
    history: list[RevealedOutcome] | None = None


class RunResult(AttackSessionState):
    revealed: RevealedOutcome
    done: bool


class StartAttackRequest(BaseModel):
    candidate_id: str
    mode: Mode = "attack"
    budget: int = Field(default=5, ge=1, le=10)


class RunExperimentRequest(BaseModel):
    context_id: str
    mode: Mode | None = None


class Interval(BaseModel):
    estimate: float
    ci95: list[float] = Field(min_length=2, max_length=2)


class ExperimentsToCorrect(BaseModel):
    median: float
    iqr: list[float] = Field(min_length=2, max_length=2)
    ci95: list[float] = Field(min_length=2, max_length=2)


class PolicyResult(BaseModel):
    policy: Literal[
        "random",
        "greedy_strongest",
        "max_failure",
        "max_uncertainty",
        "expected_decision_change",
        "tauchstone_hybrid",
        "decision_lookahead_hybrid",
    ]
    label: str
    experiments_to_correct_verdict: ExperimentsToCorrect
    fragile_recall_at_3: Interval
    fragile_recall_at_5: Interval
    decision_accuracy: Interval
    brier: float | None = None


class CalibrationBin(BaseModel):
    bin_lo: float
    bin_hi: float
    mean_predicted: float
    observed_rate: float
    n: int


class BenchmarkTest(BaseModel):
    policy_a: str
    policy_b: str
    metric: str
    statistic: float | None = None
    p_holm: float


class Benchmark(BaseModel):
    n_candidates: int
    n_seeds: int
    budget: int
    policies: list[PolicyResult]
    calibration: list[CalibrationBin] | None = None
    tests: list[BenchmarkTest] | None = None
    preregistration_sha256: str
    preregistration_commit: str | None = None
    all_candidates: dict | None = None
    provenance: Provenance


class SingleCellSignature(BaseModel):
    signature_id: str
    cohort: str
    region: str | None = None
    cell_type: str
    n_donors_ad: int
    n_donors_control: int
    n_nuclei: int
    n_genes_tested: int | None = None
    n_fdr05: int | None = None
    status: Literal['ok', 'insufficient_donors']


class SingleCellScore(BaseModel):
    signature_id: str
    consensus: float | None
    scores: MethodScores | None = None


class SingleCellDrug(BaseModel):
    candidate_id: str
    name: str
    pool_rank: int = Field(ge=1)
    bulk_consensus: float
    scores: list[SingleCellScore]


class SingleCellExploratory(BaseModel):
    label: Literal['Exploratory, not part of the preregistered benchmark']
    note: str | None = None
    cell_typing: str | None = None
    signatures: list[SingleCellSignature]
    drugs: list[SingleCellDrug]
    provenance: Provenance


class GapBrainCell(BaseModel):
    cell_id: str
    consensus: float
    below_theta: bool


class GapsExposure(BaseModel):
    level: ExposureLevel
    label: str
    measured_available: bool | None = None


class EvidenceGaps(BaseModel):
    brain_cells: list[GapBrainCell]
    cancer_lines_only: bool
    doses_um: list[float]
    times_h: list[float]
    exposure: GapsExposure
    has_targets: bool


class ContextCell(BaseModel):
    cell_id: str
    dose: str
    time: str
    consensus: float
    neural: bool | None = None


class MoleculeAtom(BaseModel):
    el: str
    x: float
    y: float
    z: float


class Molecule3D(BaseModel):
    formula: str
    atoms: list[MoleculeAtom]
    bonds: list[list[int]]
    smiles: str | None = None
    method: str | None = None


class DrugDetail(BaseModel):
    drug_id: str
    name: str
    pool_rank: int | None = None
    rank_total: int | None = None
    consensus: float
    n_contexts: int
    scores: MethodScores | None = None
    approval_status: ApprovalStatus | None = None
    mechanism: str | None = None
    targets: list[Target] | None = None
    structure: Structure | None = None
    gaps: EvidenceGaps
    contexts: list[ContextCell]
    molecule: Molecule3D | None = None
    n_hidden_tests: int | None = None
    attack_ready: bool
    preregistered: bool
    provenance: Provenance | None = None


class LookupResult(BaseModel):
    query: str
    status: Literal["ranked", "not_rankable", "not_in_lincs"]
    drug_id: str | None = None
    name: str | None = None
    pool_rank: int | None = None
    rank_total: int | None = None
    consensus: float | None = None
    n_contexts: int | None = None
    attack_ready: bool | None = None
    preregistered: bool | None = None


class LookupRequest(BaseModel):
    names: list[str] = Field(max_length=200)
    project_id: str | None = None
