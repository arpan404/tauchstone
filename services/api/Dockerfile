FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim
WORKDIR /srv
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --frozen --no-dev --no-install-project
COPY contracts ./contracts
COPY pipelines ./pipelines
COPY services/api ./services/api
# repository.py reads data/manifests/preregistration.yaml at REPO_ROOT/data/manifests
# (REPO_ROOT is /srv in the image); the demo bundle never contains it.
COPY data/manifests ./data/manifests
ENV PYTHONPATH=/srv:/srv/services/api TS_DATA_DIR=/data
EXPOSE 8000
CMD ["uv", "run", "--no-sync", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
