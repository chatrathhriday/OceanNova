from __future__ import annotations

import hashlib
import time
from collections import OrderedDict
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException

try:
    from .cnn_model import CNN_ARTIFACT, CNN_VERSION, load_cnn
except ImportError:
    # PyTorch is optional (requirements-cnn.txt). Without it the CNN endpoints answer 503
    # and the ensemble model and live PACE/NOAA engine run as normal.
    CNN_ARTIFACT = CNN_VERSION = load_cnn = None
from .model import ARTIFACT, MODEL_VERSION, OceanNovaModel
from .real_api import router as real_router
from .real_engine import ENGINE
from .schemas import AnalyzeRequest, AnalysisResponse, CNNPredictRequest

CACHE_MAX = 256
CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()

model: OceanNovaModel | None = None
cnn: Any = None


@asynccontextmanager
async def lifespan(_: FastAPI):
    global model, cnn

    try:
        model = OceanNovaModel.load()
    except FileNotFoundError:
        model = None
    # One copy in memory: the live PACE engine scores with the same ensemble.
    ENGINE.trained_model = model

    try:
        cnn = load_cnn()
    except Exception:
        cnn = None

    yield

    model = None
    cnn = None
    CACHE.clear()


app = FastAPI(
    title="OCEANNOVA Spectral Intelligence API",
    version=MODEL_VERSION,
    lifespan=lifespan,
)
app.include_router(real_router)


def _cache_key(request: AnalyzeRequest) -> str:
    payload = request.model_dump_json(exclude_none=True)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _cache_get(request: AnalyzeRequest) -> dict[str, Any] | None:
    key = _cache_key(request)
    value = CACHE.pop(key, None)
    if value is not None:
        CACHE[key] = value
    return value


def _cache_put(request: AnalyzeRequest, value: dict[str, Any]) -> None:
    CACHE[_cache_key(request)] = value
    CACHE.move_to_end(_cache_key(request))
    while len(CACHE) > CACHE_MAX:
        CACHE.popitem(last=False)


def _model_required() -> OceanNovaModel:
    if model is None:
        raise HTTPException(503, "Model artifact missing. Run: python -m ml_service.train")
    return model


def _cnn_required() -> Any:
    if cnn is None or not cnn.loaded:
        raise HTTPException(
            503,
            "CNN artifact missing. Build a PACE/NOAA manifest and run: python -m ml_service.train_cnn",
        )
    return cnn


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "ready": model is not None,
        "model_loaded": model is not None,
        "cnn_loaded": bool(cnn and cnn.loaded),
        "cnn_version": CNN_VERSION,
        "cnn_artifact": str(CNN_ARTIFACT),
        "model_version": MODEL_VERSION,
        "artifact": str(ARTIFACT),
        "cache_entries": len(CACHE),
        "metrics": getattr(model, "metrics", {}),
    }


@app.get("/cnn/health")
def cnn_health() -> dict[str, Any]:
    return {
        "loaded": bool(cnn and cnn.loaded),
        "cnn_version": CNN_VERSION,
        "artifact": str(CNN_ARTIFACT),
        "metadata": getattr(cnn, "metadata", {}),
        "device": "cpu",
        "label_provenance": "NASA PACE + NOAA NDBC derived weak labels; not field ground truth",
    }


@app.post("/cnn/predict")
def cnn_predict(request: CNNPredictRequest) -> dict[str, Any]:
    predictor = _cnn_required()
    try:
        context = [
            request.latitude,
            request.longitude,
            request.chlor_a,
            request.n_flh,
            request.sst_c,
            request.turbidity,
        ]
        return predictor.predict(request.rrs, context)
    except Exception as exc:
        raise HTTPException(422, str(exc)) from exc


@app.get("/ready")
def ready() -> dict[str, Any]:
    _model_required()
    return {"ready": True, "model_version": MODEL_VERSION}


@app.get("/version")
def version() -> dict[str, Any]:
    return {
        "model_version": MODEL_VERSION,
        "artifact": str(ARTIFACT),
        "metrics": getattr(model, "metrics", {}),
    }


@app.get("/diagnostics")
def diagnostics() -> dict[str, Any]:
    current_model = _model_required()
    return {
        "model_version": MODEL_VERSION,
        "architecture": current_model.metrics.get("architecture"),
        "detectors": current_model.metrics.get("detectors", []),
        "classifiers": current_model.metrics.get("classifiers", []),
        "anomaly_threshold": getattr(current_model, "anomaly_threshold", 55),
        "metrics": current_model.metrics,
        "cache": {"entries": len(CACHE), "max_entries": CACHE_MAX},
    }


@app.get("/model-card")
def model_card() -> dict[str, Any]:
    current_model = _model_required()
    return {
        "model_version": MODEL_VERSION,
        "architecture": current_model.metrics.get("architecture"),
        "metrics": current_model.metrics,
        "scientific_guardrails": [
            "Synthetic scores are not real-world validation",
            "Unknown/OOD rejection is enabled",
            "PACE quality control is required before training",
            "Gemini is an explanation layer, not the anomaly scorer",
            "Spectral evidence is measured against the learned normal-reference spectrum",
        ],
    }


@app.post("/analyze", response_model=AnalysisResponse)
def analyze(request: AnalyzeRequest) -> dict[str, Any]:
    current_model = _model_required()
    cached = _cache_get(request)
    if cached is not None:
        return {**cached, "cache_hit": True}

    started = time.perf_counter()
    try:
        result = current_model.predict(
            request.wavelengths_nm,
            request.rrs,
            request.latitude,
            request.longitude,
            request.sst_c,
            request.chlor_a,
            request.n_flh,
            request.turbidity,
            request.l2_flags,
        )
    except Exception as exc:
        raise HTTPException(422, str(exc)) from exc

    result["latency_ms"] = round((time.perf_counter() - started) * 1000, 2)
    result["cache_hit"] = False
    _cache_put(request, result)
    return result


@app.post("/analyze/batch")
def analyze_batch(requests: list[AnalyzeRequest]) -> dict[str, Any]:
    current_model = _model_required()
    if len(requests) > 512:
        raise HTTPException(413, "Maximum batch size is 512 spectra")

    started = time.perf_counter()
    results: list[tuple[int, dict[str, Any]]] = []
    misses: list[tuple[int, AnalyzeRequest]] = []

    for index, request in enumerate(requests):
        cached = _cache_get(request)
        if cached is None:
            misses.append((index, request))
        else:
            results.append((index, {**cached, "cache_hit": True}))

    errors: list[dict[str, Any]] = []
    if misses:
        try:
            predictions = current_model.predict_batch([request for _, request in misses])
            for (index, request), result in zip(misses, predictions):
                result["cache_hit"] = False
                _cache_put(request, result)
                results.append((index, result))
        except Exception as exc:
            errors = [{"index": index, "error": str(exc)} for index, _ in misses]

    results.sort(key=lambda item: item[0])
    return {
        "model_version": MODEL_VERSION,
        "count": len(results),
        "errors": errors,
        "results": [result for _, result in results],
        "batch_ms": round((time.perf_counter() - started) * 1000, 2),
        "cache_entries": len(CACHE),
    }


__all__ = ["app"]
