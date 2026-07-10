# AIDOS ML inference service (Phase 4)

Stateless FastAPI sidecar for embeddings and code-quality scoring.

## Endpoints

| Method | Path | Body | Response |
|--------|------|------|----------|
| `GET` | `/healthz` | — | `{ ok, model, ready }` |
| `POST` | `/embed` | `{ texts: string[] }` | `{ vectors, model, dim }` |
| `POST` | `/score` | `{ diff: string }` | `{ score, rationale }` |

Default model: `sentence-transformers/all-MiniLM-L6-v2` (384-dim). Swap via
`AIDOS_EMBEDDING_MODEL` without changing the Node orchestrator.

## Local run

```bash
cd services/ml-inference
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Or via Docker (from repo root):

```bash
docker build -t aidos-ml-inference:local ./services/ml-inference
docker run --rm -p 8080:8080 aidos-ml-inference:local
```

Node workers call this at `ML_INFERENCE_URL` (default `http://localhost:8080`).
