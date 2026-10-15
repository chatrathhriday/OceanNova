from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable
import numpy as np

LABEL_RULE_VERSION = "pace-noaa-weak-labels-v1"
CLASSES = ["normal_ocean", "thermal_anomaly", "phytoplankton_bloom", "turbidity_sediment", "optical_chemistry", "unknown_mixed"]

@dataclass
class WeakLabel:
    label: str
    confidence: float
    rule: str


def weak_label(sst_c: float | None, chlor_a: float | None, turbidity: float | None, n_flh: float | None) -> WeakLabel:
    if sst_c is not None and (sst_c >= 30 or sst_c <= 0):
        return WeakLabel("thermal_anomaly", 0.72, "NOAA/PACE SST threshold")
    if (chlor_a is not None and chlor_a >= 10) or (n_flh is not None and n_flh >= 0.03):
        return WeakLabel("phytoplankton_bloom", 0.68, "PACE chlorophyll/fluorescence threshold")
    if turbidity is not None and turbidity >= 5:
        return WeakLabel("turbidity_sediment", 0.7, "PACE turbidity threshold")
    if any(value is None for value in (sst_c, chlor_a, turbidity)):
        return WeakLabel("unknown_mixed", 0.35, "insufficient colocated NOAA/PACE context")
    return WeakLabel("normal_ocean", 0.58, "NOAA/PACE in-range observation")


def build_manifest(rows: Iterable[dict]) -> list[dict]:
    manifest = []
    for row in rows:
        label = weak_label(row.get("sst_c"), row.get("chlor_a"), row.get("turbidity"), row.get("n_flh"))
        manifest.append({**row, "label": label.label, "label_confidence": label.confidence, "label_rule": label.rule, "label_rule_version": LABEL_RULE_VERSION, "source": "NASA PACE + NOAA NDBC"})
    return manifest


def normalize_spectra(spectra: np.ndarray) -> np.ndarray:
    x = np.asarray(spectra, dtype=np.float32)
    if x.ndim != 2 or x.shape[1] < 16:
        raise ValueError("spectra must be [samples, bands] with at least 16 bands")
    x = np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0)
    return (x - np.median(x, axis=1, keepdims=True)) / (np.std(x, axis=1, keepdims=True) + 1e-6)
