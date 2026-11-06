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

## Run locally

Start the local language-model server with `ollama serve`, then install the configured model once with `ollama pull qwen3:4b`. Model weights stay outside the repository. Start the application with `make dev` and select a candidate, then open **AI lab**. The copilot labels evidence-search fallback when local inference is unavailable. The **Model studio** tab can train or retrain from the existing discovery inputs and download the resulting report.

The trained model artifacts live in `$TS_DATA_DIR/processed/models/exploratory/`, outside git. Training needs the primary gold discovery ranking and LINCS compound structures already present on the data machine; missing artifacts produce a visible error rather than synthetic results. The first completed run on this machine used 4,510 training compounds and 1,123 internal test compounds, with 57 invalid or missing structures excluded. This is exploratory evaluation, with limited predictive signal and no external validation.

For a containerized API talking to Ollama on the host Mac, configure `TS_OLLAMA_URL=http://host.docker.internal:11434` and ensure the host service accepts that connection. The default localhost setting is for the native development stack. Existing offline release images and fallback recordings require a new release build before they include this extension.
