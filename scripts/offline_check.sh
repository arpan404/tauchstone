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

if pdb_id:
    s, _, ct = req("GET", f"/api/structures/{pdb_id}.cif")
    check(f"structure {pdb_id}.cif 200", s == 200, f"status={s} ct={ct}")
    s, _, _ = req("GET", f"/structures/{pdb_id}.cif")
    check(f"structure {pdb_id}.cif via web path 200", s == 200, f"status={s}")
else:
    check("structure cif (no pdb_id in demo evidence)", False, "no structure served")

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
