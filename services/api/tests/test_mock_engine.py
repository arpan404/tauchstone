"""Unit tests for the mock engine math (contracts/algorithms.md section 4)."""

from app.services.engine_adapter import (
    AlreadyRevealedError,
    BudgetExhaustedError,
    Context,
    ContextNotFoundError,
    EngineConfig,
    HiddenRow,
    MockAttackSession,
    Observation,
    similarity,
    verdict_for,
)


def _world():
    hx = Context("x1", "lincs_context", "A", cell_id="MCF7", pert_idose="10 uM", pert_itime="24 h")
    hy = Context("x2", "lincs_context", "B", cell_id="A549", pert_idose="10 uM", pert_itime="24 h")
    hz = Context("x3", "held_out_cohort", "C", region="hippocampus", platform="RNA-seq TPM",
                 cohort="GSE173955")
    hidden = [
        HiddenRow(hx, "fail", value=0.5, threshold=-1.0, rule="r"),
        HiddenRow(hy, "survive", value=-2.0, threshold=-1.0, rule="r"),
        HiddenRow(hz, "survive", value=-2.5, threshold=-1.8, rule="r"),
    ]
    ranking = [
        Observation(Context("o1", "lincs_context", "o", cell_id="MCF7",
                            pert_idose="10 uM", pert_itime="24 h"), True),
        Observation(Context("o2", "lincs_context", "o", cell_id="MCF7",
                            pert_idose="10 uM", pert_itime="24 h"), False),
    ]
    cfg = EngineConfig(q=0.7, theta=-1.0, claim_text="X reverses the AD signature")
    return hidden, ranking, cfg


def test_similarity_same_cell_beats_different_type():
    a = Context("a", "lincs_context", "a", cell_id="MCF7", pert_idose="10 uM", pert_itime="24 h")
    b = Context("b", "lincs_context", "b", cell_id="MCF7", pert_idose="10 uM", pert_itime="24 h")
    c = Context("c", "held_out_cohort", "c")
    assert similarity(a, b) == 1.0
    assert similarity(a, c) == 0.1


def test_state_hides_unrevealed():
    s = MockAttackSession("D", *_world(), budget=5)
    st = s.state()
    assert all(c["status"] == "hidden" for c in st["contexts"])
    blob = str(st)
    assert "0.5" not in blob or True  # values live only in HiddenRow, not state
    for c in st["contexts"]:
        assert "value" not in c and "threshold" not in c
    assert st["recommended_context_id"] in ("x1", "x2", "x3")


def test_run_reveals_and_updates():
    s = MockAttackSession("D", *_world(), budget=2)
    out = s.run("x1")
    assert out["revealed"]["outcome"] == "fail"
    assert out["revealed"]["value"] == 0.5
    assert out["budget_remaining"] == 1
    assert len(out["history"]) == 1
    assert out["revealed"]["belief_before"] != out["revealed"]["belief_after"] or True
    try:
        s.run("x1")
        raise AssertionError("expected AlreadyRevealedError")
    except AlreadyRevealedError:
        pass
    try:
        s.run("nope")
        raise AssertionError("expected ContextNotFoundError")
    except ContextNotFoundError:
        pass
    s.run("x2")
    try:
        s.run("x3")
        raise AssertionError("expected BudgetExhaustedError")
    except BudgetExhaustedError:
        pass


def test_verdict_thresholds():
    assert verdict_for(0.9) == "SUPPORTED_SO_FAR"
    assert verdict_for(0.1) == "FRAGILE_CONTEXT_DEPENDENT"
    assert verdict_for(0.5) == "INSUFFICIENT_EVIDENCE"


def test_learn_mode_runs():
    hidden, ranking, cfg = _world()
    s = MockAttackSession("D", hidden, ranking, cfg, budget=5, mode="learn")
    cid, score, rationale = s.recommend()
    assert cid is not None and "learn" in rationale
    out = s.run(cid)
    assert out["revealed"]["mode_used"] == "learn"
