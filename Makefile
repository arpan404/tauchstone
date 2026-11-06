# Tauchstone: Second Life
# Raw + processed data live in $(TS_DATA_DIR), outside git, shared by all worktrees.

TS_DATA_DIR ?= $(HOME)/Data/tauchstone
export TS_DATA_DIR

LINCS_RAW := $(TS_DATA_DIR)/raw/lincs

.PHONY: help setup setup-py setup-r setup-web data unpack-lincs checksums \
        signatures rank permutation-control evidence truth-table benchmark demo \
        api web dev test test-r lint up

help:
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

## ---- Setup ------------------------------------------------------------
setup: setup-py setup-r setup-web ## Install everything (Python, R, web)

setup-py: ## Python env via uv (pinned in uv.lock)
	uv sync

setup-r: ## R packages via renv (pinned in renv.lock)
	Rscript scripts/setup_r.R

setup-web: ## Frontend deps via bun
	cd apps/web && bun install

## ---- Data (workstream 1) -----------------------------------------------
data: ## Download every source (core + stretch) and freeze SHA-256 into data/manifests/checksums.json
	python3 -I scripts/fetch_data.py --tier all --jobs 6

unpack-lincs: ## Decompress LINCS Level 5 GCTX (keeps the .gz)
	@for f in $(LINCS_RAW)/*/*.gctx.gz; do \
	  [ -f "$${f%.gz}" ] || (echo "unpacking $$f" && gunzip -k "$$f"); \
	done

## ---- Pipeline (workstreams 2-5) ------------------------------------------
signatures: ## Disease signatures for all cohorts (R: limma / DESeq2)
	Rscript pipelines/geo/R/run_all.R

rank: ## LINCS reversal scores + consensus ranking (gold signatures) for the primary, held-out and adjusted signatures
	uv run python -m pipelines.lincs.rank --gold-only --signature $(TS_DATA_DIR)/processed/signatures/GSE132903__main.parquet --out-name GSE132903__main
	uv run python -m pipelines.lincs.rank --gold-only --signature $(TS_DATA_DIR)/processed/signatures/GSE173955__main.parquet --out-name GSE173955__main
	uv run python -m pipelines.lincs.rank --gold-only --signature $(TS_DATA_DIR)/processed/signatures/GSE132903__composition_adjusted.parquet --out-name GSE132903__composition_adjusted
	uv run python -m pipelines.evidence.candidate_pool --ranking GSE132903__main

permutation-control: ## 200 label permutations of GSE132903, gold signatures (about 15 min)
	uv run python -m pipelines.lincs.rank --gold-only --signature $(TS_DATA_DIR)/processed/signatures/GSE132903__main.parquet --out-name GSE132903__gold_permctl --permutations $(TS_DATA_DIR)/processed/signatures/GSE132903__permutations.parquet --workers 12

evidence: ## Evidence cards for the top 50
	@echo "TODO workstream 4: pipelines/evidence" && exit 1

truth-table: ## Precompute hidden validation outcomes (server-side only)
	uv run python -m pipelines.tauchstone.truth_table

benchmark: ## Replay benchmark (refuses to run without a committed preregistration hash)
	uv run python -m pipelines.tauchstone.replay $(BENCHMARK_FLAGS)
# Synthetic dry run (no guard, synthetic outputs only):
# 	make benchmark BENCHMARK_FLAGS=--dry-run-synthetic

calibrate: ## Development-only calibration (type priors, lam/lam_L -> proposed values yaml)
	uv run python -m pipelines.tauchstone.calibrate

demo: ## Freeze data/demo bundle and build Docker images
	@echo "TODO workstream 6/8: copy processed outputs into data/demo" && exit 1
	docker compose build

## ---- Run --------------------------------------------------------------
api: ## FastAPI dev server on :8000
	cd services/api && uv run uvicorn app.main:app --reload --port 8000

web: ## Vite dev server on :5173 (proxies /api to :8000)
	cd apps/web && bun run dev

dev: ## API + web together
	$(MAKE) -j2 api web

up: ## Offline expo stack on :8080
	docker compose up

## ---- Quality -----------------------------------------------------------
test: ## Python tests (+ web typecheck)
	uv run pytest -q
	cd apps/web && bun run typecheck

test-r: ## R tests
	Rscript -e 'testthat::test_dir("pipelines/geo/tests")'

lint: ## ruff + oxlint
	uv run ruff check .
	cd apps/web && bun run lint
