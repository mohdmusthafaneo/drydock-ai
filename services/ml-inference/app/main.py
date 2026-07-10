"""AIDOS ML inference service — FastAPI embed + code-quality score.

Contract (architecture migration Phase 4 / D6):
  POST /embed  { texts: string[] } → { vectors: number[][], model: string, dim: int }
  POST /score  { diff: string }    → { score: float, rationale: string }
  GET  /healthz → { ok: true, model: string, ready: bool }
"""

from __future__ import annotations

import os
import re
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

MODEL_NAME = os.environ.get(
    "AIDOS_EMBEDDING_MODEL",
    "sentence-transformers/all-MiniLM-L6-v2",
)
EXPECTED_DIM = int(os.environ.get("AIDOS_EMBEDDING_DIM", "384"))
MAX_BATCH = int(os.environ.get("AIDOS_EMBED_MAX_BATCH", "64"))

_model: Any | None = None
_model_error: str | None = None


def _load_model() -> Any:
    global _model, _model_error
    if _model is not None:
        return _model
    try:
        from sentence_transformers import SentenceTransformer

        _model = SentenceTransformer(MODEL_NAME)
        _model_error = None
        return _model
    except Exception as exc:  # pragma: no cover - depends on runtime deps
        _model_error = str(exc)
        raise


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Eager-load so /healthz.ready reflects warm state; failures stay lazy-retryable.
    try:
        _load_model()
    except Exception:
        pass
    yield


app = FastAPI(title="AIDOS ML Inference", version="0.1.0", lifespan=lifespan)


class EmbedRequest(BaseModel):
    texts: list[str] = Field(min_length=1, max_length=MAX_BATCH)


class EmbedResponse(BaseModel):
    vectors: list[list[float]]
    model: str
    dim: int


class ScoreRequest(BaseModel):
    diff: str = Field(min_length=1, max_length=200_000)


class ScoreResponse(BaseModel):
    score: float
    rationale: str


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {
        "ok": True,
        "model": MODEL_NAME,
        "ready": _model is not None,
        "error": _model_error,
    }


@app.post("/embed", response_model=EmbedResponse)
def embed(body: EmbedRequest) -> EmbedResponse:
    if len(body.texts) > MAX_BATCH:
        raise HTTPException(
            status_code=400,
            detail=f"batch size {len(body.texts)} exceeds max {MAX_BATCH}",
        )
    try:
        model = _load_model()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"model unavailable: {exc}") from exc

    vectors = model.encode(
        body.texts,
        batch_size=min(64, len(body.texts)),
        show_progress_bar=False,
        convert_to_numpy=True,
        normalize_embeddings=True,
    )
    out = [[float(x) for x in row] for row in vectors]
    dim = len(out[0]) if out else 0
    if dim != EXPECTED_DIM:
        raise HTTPException(
            status_code=500,
            detail=f"model produced dim={dim}, expected {EXPECTED_DIM}",
        )
    return EmbedResponse(vectors=out, model=MODEL_NAME, dim=dim)


_SECRET_RE = re.compile(
    r"(?i)(authorization:\s*bearer\s+)[A-Za-z0-9\-._~+/]+=*|([A-Za-z0-9+/]{40,}={0,2})"
)


def _heuristic_code_quality(diff: str) -> ScoreResponse:
    """Deterministic v1 scorer — no LLM. Swap model behind same contract later."""
    lines = diff.splitlines()
    added = sum(1 for line in lines if line.startswith("+") and not line.startswith("+++"))
    removed = sum(1 for line in lines if line.startswith("-") and not line.startswith("---"))
    total = max(1, added + removed)
    churn = min(1.0, total / 400.0)
    test_touch = any(
        re.search(r"(^|\b)(test|spec|__tests__)(/|\b)", line, re.I) for line in lines
    )
    secret_hits = len(_SECRET_RE.findall(diff))
    score = 0.75
    score -= 0.25 * churn
    if test_touch:
        score += 0.1
    score -= min(0.4, 0.15 * secret_hits)
    score = max(0.0, min(1.0, score))
    rationale_parts = [
        f"churn={added}+/{removed}-",
        f"test_touch={test_touch}",
        f"secret_like={secret_hits}",
    ]
    return ScoreResponse(score=round(score, 4), rationale="; ".join(rationale_parts))


@app.post("/score", response_model=ScoreResponse)
def score(body: ScoreRequest) -> ScoreResponse:
    return _heuristic_code_quality(body.diff)
