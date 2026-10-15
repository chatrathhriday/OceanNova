from __future__ import annotations

import argparse
import json
import time
import numpy as np
from .cnn_dataset import normalize_spectra
from .cnn_model import load_cnn


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate the OCEANNOVA CNN on a held-out NPZ")
    parser.add_argument("--input", default="data/processed/pace_validation.npz")
    parser.add_argument("--artifact", default="ml_service/artifacts/oceannova_spectral_cnn.pt")
    args = parser.parse_args()
    data = np.load(args.input, allow_pickle=True); predictor = load_cnn(args.artifact)
    spectra = normalize_spectra(data["spectra"] if "spectra" in data else data["X"])
    contexts = data["context"] if "context" in data else np.zeros((len(spectra), 6))
    started = time.perf_counter(); outputs = [predictor.predict(row, context.tolist()) for row, context in zip(spectra, contexts)]
    elapsed = (time.perf_counter() - started) * 1000
    print(json.dumps({"samples": len(outputs), "mean_latency_ms": elapsed / max(1, len(outputs)), "cnn_version": predictor.metadata.get("architecture"), "label_provenance": predictor.metadata.get("label_provenance")}, indent=2))

if __name__ == "__main__":
    main()
