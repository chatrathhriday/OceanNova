"""Build a CNN training artifact from real PACE/NOAA records only.

Input is JSONL exported by the PACE/NOAA ingestion job. This command never
creates spectra or measurements: missing/invalid records are rejected.
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import numpy as np
from .cnn_dataset import CLASSES, LABEL_RULE_VERSION, build_manifest, normalize_spectra

REQUIRED = {"spectrum", "sst_c", "chlor_a", "turbidity", "n_flh", "latitude", "longitude", "timestamp"}


def load_records(path: Path) -> list[dict]:
    records = []
    for line_no, line in enumerate(path.read_text().splitlines(), 1):
        if not line.strip():
            continue
        row = json.loads(line)
        missing = sorted(REQUIRED - row.keys())
        if missing:
            raise ValueError(f"line {line_no}: missing required fields: {', '.join(missing)}")
        spectrum = np.asarray(row["spectrum"], dtype=np.float32)
        if spectrum.ndim != 1 or spectrum.size < 16 or not np.isfinite(spectrum).all():
            raise ValueError(f"line {line_no}: spectrum must contain >=16 finite PACE bands")
        if not (-90 <= float(row["latitude"]) <= 90 and -180 <= float(row["longitude"]) <= 180):
            raise ValueError(f"line {line_no}: invalid geographic coordinates")
        row["spectrum"] = spectrum.tolist()
        records.append(row)
    if not records:
        raise ValueError("no real PACE/NOAA records found")
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description="Create weak labels from real PACE + NOAA observations")
    parser.add_argument("--input", required=True, help="JSONL exported from the real PACE/NOAA ingestion pipeline")
    parser.add_argument("--output", default="data/processed/pace_noaa_cnn.npz")
    parser.add_argument("--manifest", default="data/processed/pace_noaa_cnn.manifest.jsonl")
    args = parser.parse_args()

    records = load_records(Path(args.input))
    manifest = build_manifest(records)
    labels = np.asarray([row["label"] for row in manifest])
    if len(set(labels)) < 2:
        raise ValueError("at least two evidence-derived classes are required before training")
    spectra = normalize_spectra(np.asarray([row["spectrum"] for row in manifest], dtype=np.float32))
    context = np.asarray([[row.get("latitude", 0), row.get("longitude", 0), row.get("chlor_a", 0) or 0, row.get("n_flh", 0) or 0, row.get("sst_c", 0) or 0, row.get("turbidity", 0) or 0] for row in manifest], dtype=np.float32)

    output = Path(args.output); output.parent.mkdir(parents=True, exist_ok=True)
    np.savez_compressed(output, spectra=spectra, labels=labels, context=context)
    manifest_path = Path(args.manifest); manifest_path.parent.mkdir(parents=True, exist_ok=True)
    with manifest_path.open("w") as handle:
        for row in manifest:
            handle.write(json.dumps(row) + "\n")
    print(json.dumps({"samples": len(manifest), "classes": sorted(set(labels)), "label_rule_version": LABEL_RULE_VERSION, "provenance": "NASA PACE spectra + NOAA NDBC colocated observations", "output": str(output), "manifest": str(manifest_path)}, indent=2))


if __name__ == "__main__":
    main()
