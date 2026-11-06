# Exploratory lab API

This additive router preserves frozen routes. The engineering lead owns the extension specification.

- `GET /lab/status`: probes Ollama tags and returns model training state.
- `POST /lab/chat`: accepts question, candidate_id, optional session_id. Searches explicitly whitelisted public evidence with TF-IDF, bounded to 4,000 serialized source characters. Discovery scores come from a whitelist lookup in list_candidates(200). Evidence coverage records available targets, mechanism and source counts; missing evidence is unknown, not negative. Optional session history requires a matching candidate, and reads only committed history from the public engine snapshot. No snapshot contexts, hidden rows, benchmark, exposure, or truth-table data enters sources. Exposure experiments are excluded even after commitment.
- `POST /lab/model/train`: accepts random_forest and seed 20261105; starts one background worker per API process. Duplicate requests while running return the current state.
- `GET /lab/model`: returns current training state; restores the completed report from processed/models/exploratory/report.json on restart.
- `POST /lab/model/predict`: calls the separately integrated exploratory model module and returns only the four public prediction fields.

Ollama uses TS_OLLAMA_URL, default http://127.0.0.1:11434, and TS_LAB_MODEL, default qwen3:4b. No keys are needed. Native chat requests use think=false, stream=false, temperature=0.1, num_ctx=4096, num_predict=450, and a 90-second timeout.

Generated mode means Ollama selected relevant evidence IDs through constrained JSON generation. The server renders exact cited excerpts as readable field/value text, rather than unrestricted prose. The answer explicitly identifies the copilot as extractive with no generated paraphrase. This deliberately prevents generated numerical or clinical assertions. Unknown IDs, extra output keys, oversized output, and provider failures return clearly labelled evidence_search mode. It does not verify the underlying scientific sources. Public source text containing clinical assertion vocabulary is excluded.

Training imports pipelines.lincs.exploratory_model only inside the worker or prediction call. Integration requires train_model(data_dir, algorithm, seed) returning ModelReport and predict_candidate(data_dir, candidate_id) returning the four prediction fields. Training failure details remain in server logs. Run a single API worker to avoid concurrent jobs across processes. Thread jobs do not survive a server restart; only completed reports are restored.

Validation: API tests include malicious repository fields, forbidden attack-world access, rejected mismatched session IDs, committed-history whitelisting, discovery score whitelisting, unavailable Ollama, citation hallucinations, fabricated claims, training duplication/failure, report restoration, and prediction whitelisting. Live local qwen3:4b generation was verified through POST /lab/chat with ParquetRepository and real Ticrynafen discovery evidence. Both discovery-signal and missing-evidence questions returned generated mode with validated citations. The completed model report restored successfully. This is API verification, not scientific validation or a training rerun.
