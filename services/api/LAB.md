# Exploratory lab API

This router adds routes and leaves the frozen ones unchanged. The engineering lead owns the extension specification.

On Nov 8, 2026 the AI lab page was removed from the web app, so the structure model appears in
one place only. `GET /lab/model` and the stored predictions still back the AI estimate on My
compounds (see `/compounds/estimate`). `POST /lab/model/train` still trains the model.
`POST /lab/chat` and `GET /lab/status` have no caller in the app today.

- `GET /lab/status`: probes Ollama tags and returns the model training state.
- `POST /lab/chat`: accepts question, candidate_id and an optional session_id. It searches whitelisted public evidence with TF-IDF, capped at 4,000 serialized source characters. Discovery scores come from a whitelist lookup in list_candidates(200). Evidence coverage records available targets, mechanism and source counts. Missing evidence counts as unknown, not negative. Optional session history requires a matching candidate and reads only committed history from the public engine snapshot. Sources never include snapshot contexts, hidden rows, benchmark, exposure or truth-table data. Exposure experiments stay excluded even after commitment.
- `POST /lab/model/train`: accepts random_forest and seed 20261105, and starts one background worker per API process. A duplicate request while training runs returns the current state.
- `GET /lab/model`: returns the current training state. On restart it restores the completed report from processed/models/exploratory/report.json.
- `POST /lab/model/predict`: calls the separately integrated exploratory model module and returns only the four public prediction fields.

Ollama uses TS_OLLAMA_URL, default http://127.0.0.1:11434, and TS_LAB_MODEL, default qwen3:4b. No keys are needed. Native chat requests use think=false, stream=false, temperature=0.1, num_ctx=4096, num_predict=450 and a 90-second timeout.

In generated mode, Ollama picks relevant evidence IDs through constrained JSON generation. The server then renders the exact cited excerpts as field/value text, not free prose. The answer states that the copilot is extractive and does not paraphrase. This is deliberate. It keeps generated numbers and clinical assertions out of the answer. Unknown IDs, extra output keys, oversized output and provider failures fall back to evidence_search mode, and the answer labels it as such. Neither mode verifies the underlying scientific sources. Public source text that contains clinical assertion vocabulary is excluded.

Training imports pipelines.lincs.exploratory_model only inside the worker or prediction call. The module must provide train_model(data_dir, algorithm, seed), returning a ModelReport, and predict_candidate(data_dir, candidate_id), returning the four prediction fields. Details of training failures stay in the server logs. Run a single API worker so jobs never run concurrently across processes. Thread jobs do not survive a server restart. Only completed reports are restored.

The API tests cover malicious repository fields, forbidden attack-world access, rejected mismatched session IDs, committed-history whitelisting, discovery score whitelisting, unavailable Ollama, citation hallucinations, fabricated claims, training duplication and failure, report restoration and prediction whitelisting. Live local qwen3:4b generation was verified through POST /lab/chat with ParquetRepository and real Ticrynafen discovery evidence. Both discovery-signal and missing-evidence questions returned generated mode with validated citations. The completed model report restored without errors. This is API verification, not scientific validation or a training rerun.

## Run locally

Start the local language-model server with `ollama serve`, then install the configured model once with `ollama pull qwen3:4b`. Model weights stay outside the repository. Start the application with `make dev`, select a candidate and open **AI lab**. When local inference is unavailable, the copilot says it fell back to evidence search. The **Model studio** tab can train or retrain from the existing discovery inputs and download the resulting report.

The trained model artifacts live in `$TS_DATA_DIR/processed/models/exploratory/`, outside git. Training needs the primary gold discovery ranking and the LINCS compound structures to be on the data machine already. If an artifact is missing, training shows an error instead of producing synthetic results. The first completed run on this machine used 4,510 training compounds and 1,123 internal test compounds, and excluded 57 invalid or missing structures. This is an exploratory evaluation with limited predictive signal and no external validation.

For a containerized API that talks to Ollama on the host Mac, set `TS_OLLAMA_URL=http://host.docker.internal:11434` and make sure the host service accepts that connection. The default localhost setting is for the native development stack. Existing offline release images and fallback recordings will not include this extension until a new release build.
