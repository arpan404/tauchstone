#!/bin/sh
# Expo rehearsal: build images (network allowed here), then
#   Phase 1 (isolation): run the stack on an INTERNAL Docker network (no egress;
#     published host ports are inert there) and run every endpoint check from
#     INSIDE the api container through the web proxy (http://web/api/...).
#   Phase 2 (expo shape): plain `docker compose up` (default bridge, host ports)
#     and run the same checks from the host via http://localhost:$WEB_PORT.
# Exit non-zero on any failure. Host ports default to 8080/8000; override with
# OFFLINE_WEB_PORT / OFFLINE_API_PORT (also honoured as TS_WEB_PORT/TS_API_PORT).
set -eu
ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

export TS_WEB_PORT=${OFFLINE_WEB_PORT:-${TS_WEB_PORT:-8080}}
export TS_API_PORT=${OFFLINE_API_PORT:-${TS_API_PORT:-8000}}

OVERRIDE=$(mktemp /tmp/tauchstone-offline-XXXX.yaml)
CHECKS=$(mktemp /tmp/tauchstone-checks-XXXX.py)
cleanup() {
  docker compose -f compose.yaml -f "$OVERRIDE" down >/dev/null 2>&1 || true
  docker compose down >/dev/null 2>&1 || true
  rm -f "$OVERRIDE" "$CHECKS"
}
trap cleanup EXIT INT TERM

cat > "$CHECKS" <<'PYEOF'
import json
import os
import sys
import urllib.request
import urllib.error

BASE = os.environ.get("CHECK_BASE", "http://localhost:8080")
fails = []


def check(name, cond, detail=""):
    print(("PASS " if cond else "FAIL ") + name + (f" ({detail})" if detail else ""),
          flush=True)
    if not cond:
        fails.append(name)


def req(method, path, body=None):
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(BASE + path, data=data, method=method,
                               headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            ct = resp.headers.get("Content-Type", "")
            raw = resp.read()
            try:
                payload = json.loads(raw) if raw else None
            except ValueError:
                payload = raw
            return resp.status, payload, ct
    except urllib.error.HTTPError as e:
        return e.code, None, ""


s, health, _ = req("GET", "/api/health")
check("health 200 + real mode", s == 200 and (health or {}).get("mock") is False, f"status={s}")

s, sig, _ = req("GET", "/api/signatures/GSE132903")
check("primary signature 200", s == 200 and (sig or {}).get("cohort") == "GSE132903", f"status={s}")

s, cl, _ = req("GET", "/api/candidates?limit=50")
cands = (cl or {}).get("candidates", [])
by_rank = {c["rank"]: c for c in cands}
ids = {r: (by_rank.get(r) or {}).get("id") for r in (1, 5, 12)}
check("candidate pool ranks 1/5/12", s == 200 and all(ids.values()), f"status={s} ids={ids}")

pdb_id = None
for r in (1, 5, 12):
    s, ev, _ = req("GET", f"/api/candidates/{ids[r]}/evidence")
    check(f"evidence rank {r} 200", s == 200 and (ev or {}).get("candidate_id") == ids[r], f"status={s}")
    struct = (ev or {}).get("structure") or {}
    if struct.get("pdb_id") and pdb_id is None:
        pdb_id = struct["pdb_id"]

s, _, _ = req("GET", "/api/signatures/GSE173955")
check("held-out signature 403 before reveal", s == 403, f"status={s}")

s, sess, _ = req("POST", "/api/attack",
                {"candidate_id": ids[1], "mode": "attack", "budget": 5})
sid = (sess or {}).get("session_id")
rec = (sess or {}).get("recommended_context_id")
check("start attack 200", s == 200 and sid and rec, f"status={s} rec={rec}")

# One attack on a non-cohort context, then reveal the held-out cohort GSE173955.
attack_ctx = rec if rec != "GSE173955" else next(
    (c["context_id"] for c in (sess or {}).get("contexts", [])
     if c["context_id"] != "GSE173955" and c["status"] == "hidden"), rec)
s, run1, _ = req("POST", f"/api/attack/{sid}/run", {"context_id": attack_ctx})
check("attack run 200 + revealed value", s == 200 and (run1 or {}).get("revealed"), f"status={s}")

s, run2, _ = req("POST", f"/api/attack/{sid}/run", {"context_id": "GSE173955"})
check("reveal held-out cohort 200", s == 200, f"status={s}")

s, sig2, _ = req("GET", f"/api/signatures/GSE173955?session_id={sid}")
check("held-out signature 200 after reveal", s == 200, f"status={s}")

s, bench, _ = req("GET", "/api/benchmark")
check("benchmark 200", s == 200 and bench, f"status={s}")

s, cells, _ = req("GET", "/api/exploratory/single-cell")
check(
    "exploratory single-cell 200 + labelled, real",
    s == 200
    and (cells or {}).get("label") == "Exploratory, not part of the preregistered benchmark"
    and not ((cells or {}).get("provenance") or {}).get("parameters", {}).get("synthetic"),
    f"status={s}",
)

if pdb_id:
    s, _, ct = req("GET", f"/api/structures/{pdb_id}.cif")
    check(f"structure {pdb_id}.cif 200", s == 200, f"status={s} ct={ct}")
    s, _, _ = req("GET", f"/structures/{pdb_id}.cif")
    check(f"structure {pdb_id}.cif via web path 200", s == 200, f"status={s}")
else:
    check("structure cif (no pdb_id in demo evidence)", False, "no structure served")

s, cl, _ = req("GET", "/api/cell-lines")
mcf7 = next((c for c in (cl or {}).get("cell_lines", []) if c.get("cell_id") == "MCF7"), {})
check("cell-line card for MCF7 (Cellosaurus, offline)",
      s == 200 and mcf7.get("cellosaurus_id") == "CVCL_0031" and "breast" in mcf7.get("summary", "").lower(),
      f"status={s} card={mcf7.get('summary')}")
s, _, ct = req("GET", "/api/cell-lines/MCF7/image")
check("cell-line photo for MCF7 served from the bundle", s == 200 and "image/jpeg" in (ct or ""),
      f"status={s} ct={ct}")

# ---- MVP flow: projects, live screen, drug page, lookup, resources, report ----
import time

s, projs, _ = req("GET", "/api/projects")
pids = [p.get("id") for p in (projs or [])]
check("projects list has both built-ins", s == 200 and {"GSE132903", "GSE173955"} <= set(pids),
      f"status={s} ids={pids}")

s, pc, _ = req("GET", "/api/projects/GSE132903/candidates?limit=10")
check("project candidates 200", s == 200 and len((pc or {}).get("candidates", [])) == 10, f"status={s}")

s, csv_body, ct = req("GET", "/api/projects/GSE132903/candidates.csv")
check("candidates CSV export", s == 200 and "csv" in ct, f"status={s} ct={ct}")

# Before the live screen below screens it: an unscreened project must not show another ranking.
s, _, _ = req("GET", "/api/projects/GSE173955/candidates")
check("unscreened project does not borrow another ranking", s == 409, f"status={s}")

s, job, _ = req("POST", "/api/screens", {"project_id": "GSE173955", "signature_id": "GSE173955"})
screen_id = (job or {}).get("id")
check("live screen submitted", s == 200 and screen_id, f"status={s}")
# Server-sent events reach the client unbuffered through the web proxy.
try:
    with urllib.request.urlopen(BASE + f"/api/screens/{screen_id}/events", timeout=20) as resp:
        first = resp.readline().decode()
    check("screen events stream", first.startswith("data:"), first[:60])
except Exception as exc:  # noqa: BLE001
    check("screen events stream", False, repr(exc))
snap, t0 = {}, time.time()
while time.time() - t0 < 180:
    s, snap, _ = req("GET", f"/api/screens/{screen_id}")
    if (snap or {}).get("status") in ("done", "failed"):
        break
    time.sleep(2)
check("live screen done over 113,310 gold signatures",
      (snap or {}).get("status") == "done" and (snap or {}).get("n_scored") == 113310,
      f"status={(snap or {}).get('status')} n={(snap or {}).get('n_scored')} t={time.time() - t0:.0f}s")

s, drug, _ = req("GET", f"/api/drugs/{ids[5]}")
check("drug page with gaps + 3D molecule",
      s == 200 and (drug or {}).get("gaps") and ((drug or {}).get("molecule") or {}).get("atoms"),
      f"status={s}")

s, res, _ = req("GET", f"/api/drugs/{ids[5]}/resources")
check("resource agreement rows", s == 200 and len(res or []) == 3, f"status={s}")

s, lk, _ = req("POST", "/api/lookup", {"names": ["donepezil", "Aricept", "Razadyne"]})
st = {r.get("query"): (r.get("status"), r.get("name")) for r in (lk or [])}
check("lookup: donepezil ranked, brand names resolve offline",
      s == 200 and st.get("donepezil", ("",))[0] == "ranked"
      and "galantamine" in (st.get("Razadyne", ("", ""))[1] or "").lower()
      and "donepezil" in (st.get("Aricept", ("", ""))[1] or "").lower(),
      f"status={s} {st}")

s, srch, _ = req("GET", "/api/compounds/search?q=aric&limit=5")
hit = next((r for r in (srch or []) if (r.get("name") or "").lower() == "donepezil"), None)
check("compound search resolves a brand name offline",
      s == 200 and hit is not None and hit.get("matched_alias", "").lower() == "aricept",
      f"status={s} n={len(srch or [])}")

s, est, _ = req("POST", "/api/compounds/estimate", {"ids": ["BRD-A49160188"]})
row = (est or [{}])[0] if isinstance(est, list) else {}
check("AI estimate served from the bundled model",
      s == 200 and isinstance(row.get("estimate"), float) and row.get("basis") in
      ("held_out", "in_training", "new_structure"),
      f"status={s} basis={row.get('basis')}")

s, pc1, _ = req("GET", "/api/projects/GSE132903/candidates?limit=1")
top = ((pc1 or {}).get("candidates") or [{}])[0]
check("withdrawn flag served (ChEMBL 37)", s == 200 and "withdrawn" in (top.get("approval_status") or {}),
      f"status={s} {top.get('name')} {top.get('approval_status')}")


s, pdf, ct = req("GET", f"/api/reports/{ids[5]}.pdf?project_id=GSE132903")
try:
    with urllib.request.urlopen(BASE + f"/api/reports/{ids[5]}.pdf?project_id=GSE132903", timeout=30) as resp:
        disp = resp.headers.get("Content-Disposition", "")
    check("report PDF named after the drug", "tauchstone-" in disp and ".pdf" in disp, disp)
except Exception as exc:  # noqa: BLE001
    check("report PDF named after the drug", False, repr(exc))
check("report PDF", s == 200 and "pdf" in ct and bytes(pdf or b"")[:4] == b"%PDF", f"status={s} ct={ct}")

s, _, ct = req("GET", "/")
check("web index 200", s == 200, f"status={s}")

if fails:
    print(f"{len(fails)} FAILURES", file=sys.stderr)
    sys.exit(1)
print("all offline checks passed")
PYEOF

echo "== build images (network allowed here) =="
docker compose build

cat > "$OVERRIDE" <<'YAML'
services:
  api:
    networks: [offline]
  web:
    networks: [offline]
networks:
  offline:
    internal: true
YAML

echo "== phase 1: stack on internal network (no egress) =="
docker compose -f compose.yaml -f "$OVERRIDE" up -d
echo "-- waiting for health from inside the network --"
for i in $(seq 1 36); do
  if docker compose -f compose.yaml -f "$OVERRIDE" exec -T api \
      python3 -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=5)" >/dev/null 2>&1 \
  && docker compose -f compose.yaml -f "$OVERRIDE" exec -T api \
      python3 -c "import urllib.request; urllib.request.urlopen('http://web/api/health', timeout=5)" >/dev/null 2>&1; then
    echo "stack healthy (internal)"
    break
  fi
  if [ "$i" = "36" ]; then
    echo "stack did not become healthy (internal)" >&2
    docker compose -f compose.yaml -f "$OVERRIDE" logs --tail=30 api web
    exit 1
  fi
  sleep 5
done
echo "-- endpoint checks via http://web (no egress possible) --"
CHECK_BASE="http://web" docker compose -f compose.yaml -f "$OVERRIDE" exec -T \
  -e CHECK_BASE api python3 - < "$CHECKS"
docker compose -f compose.yaml -f "$OVERRIDE" down

echo "== phase 2: expo shape on default bridge, web :${TS_WEB_PORT} api :${TS_API_PORT} =="
docker compose up -d
sh scripts/wait_for_health.sh "$TS_API_PORT" "$TS_WEB_PORT"
echo "-- endpoint checks via http://localhost:${TS_WEB_PORT} --"
CHECK_BASE="http://localhost:${TS_WEB_PORT}" python3 "$CHECKS"

echo "== done (stack stopped by trap) =="
