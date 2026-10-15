from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path
from typing import Any

import numpy as np
import torch
from torch import nn

CNN_VERSION = "1.0.0-spectral-cnn-weak-labels"
CNN_ARTIFACT = Path(__file__).resolve().parent / "artifacts" / "oceannova_spectral_cnn.pt"
DEVICE = torch.device("cpu")


class SpectralCNN(nn.Module):
    """Compact 1D CNN for fixed-grid PACE Rrs spectra plus six context channels."""

    def __init__(self, spectral_channels: int = 1, context_features: int = 6, classes: int = 6):
        super().__init__()
        self.features = nn.Sequential(
            nn.Conv1d(spectral_channels, 32, 7, padding=3), nn.BatchNorm1d(32), nn.GELU(),
            nn.Conv1d(32, 64, 5, padding=2), nn.BatchNorm1d(64), nn.GELU(), nn.MaxPool1d(2),
            nn.Conv1d(64, 96, 5, padding=2), nn.BatchNorm1d(96), nn.GELU(), nn.AdaptiveAvgPool1d(8),
        )
        self.head = nn.Sequential(nn.Linear(96 * 8 + context_features, 128), nn.GELU(), nn.Dropout(0.15), nn.Linear(128, classes))

    def forward(self, spectrum: torch.Tensor, context: torch.Tensor) -> torch.Tensor:
        encoded = self.features(spectrum).flatten(1)
        return self.head(torch.cat([encoded, context], dim=1))


def _context(values: list[float | None] | None) -> np.ndarray:
    row = np.asarray([np.nan if value is None else value for value in (values or [None] * 6)], dtype=np.float32)
    row = np.pad(row[:6], (0, max(0, 6 - len(row))), constant_values=np.nan)
    finite = np.isfinite(row)
    row[~finite] = 0.0
    row[2:4] = np.log1p(np.clip(row[2:4], 0, None))
    return row


class CNNPredictor:
    def __init__(self, path: str | Path = CNN_ARTIFACT):
        self.path = Path(path)
        self.model: SpectralCNN | None = None
        self.classes: list[str] = []
        self.metadata: dict[str, Any] = {}
        self.loaded = False
        if self.path.exists():
            payload = torch.load(self.path, map_location=DEVICE, weights_only=False)
            self.model = SpectralCNN(classes=len(payload["classes"]))
            self.model.load_state_dict(payload["state_dict"])
            self.model.eval().to(DEVICE)
            self.classes = list(payload["classes"])
            self.metadata = payload.get("metadata", {})
            self.loaded = True

    def predict(self, spectrum: np.ndarray, context: list[float | None] | None = None) -> dict[str, Any]:
        if not self.loaded or self.model is None:
            raise RuntimeError("CNN artifact is not trained")
        started = time.perf_counter()
        values = np.asarray(spectrum, dtype=np.float32)
        if values.ndim != 1 or values.size < 16:
            raise ValueError("CNN requires at least 16 spectral bands")
        values = np.nan_to_num(values, nan=0.0, posinf=0.0, neginf=0.0)
        values = (values - np.median(values)) / (np.std(values) + 1e-6)
        with torch.inference_mode():
            logits = self.model(torch.from_numpy(values[None, None, :]).to(DEVICE), torch.from_numpy(_context(context)[None, :]).to(DEVICE))
            probabilities = torch.softmax(logits, dim=1)[0].cpu().numpy()
        index = int(np.argmax(probabilities))
        confidence = float(probabilities[index])
        return {
            "cause": self.classes[index], "class_probabilities": {name: round(float(prob), 4) for name, prob in zip(self.classes, probabilities)},
            "confidence": round(confidence, 4), "cnn_version": CNN_VERSION,
            "label_provenance": self.metadata.get("label_provenance", "PACE/NOAA weak labels; not field ground truth"),
            "inference_ms": round((time.perf_counter() - started) * 1000, 2),
        }


def save_checkpoint(model: SpectralCNN, classes: list[str], metadata: dict[str, Any], path: str | Path = CNN_ARTIFACT) -> None:
    destination = Path(path); destination.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"state_dict": model.state_dict(), "classes": classes, "metadata": metadata}, destination)
    checksum = hashlib.sha256(destination.read_bytes()).hexdigest()
    destination.with_suffix(destination.suffix + ".json").write_text(json.dumps({"cnn_version": CNN_VERSION, "sha256": checksum, "metadata": metadata}, indent=2))


def load_cnn(path: str | Path = CNN_ARTIFACT) -> CNNPredictor:
    return CNNPredictor(path)


def build_model(classes: int = 6) -> SpectralCNN:
    return SpectralCNN(classes=classes).to(DEVICE)
