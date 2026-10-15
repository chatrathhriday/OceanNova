"""Score PACE granules that are already on disk into the live store.

Useful after a backtest, whose downloads are real recent passes the map can show straight
away. Stop the ML service first: it writes the same store files.

    python -m ml_service.ingest_passes data/raw/backtest
"""
from __future__ import annotations

import argparse
import logging
from pathlib import Path

try:
    from dotenv import load_dotenv
    load_dotenv(".env.local")
except ImportError:
    pass

from .real_engine import ENGINE


def main(folder):
    paths = sorted(Path(folder).glob("*.nc"))
    if not paths:
        raise SystemExit(f"No .nc granules in {folder}")
    snapshot = ENGINE.ingest_local(paths)
    if snapshot is None:
        print("Nothing new: every granule is already in the store.")
        return
    forecast = snapshot["forecast"]
    print(f"passes in store: {snapshot['pace_granules']}, valid pixels: {snapshot['candidate_pixels']}, flagged: {snapshot['anomaly_pixels']}")
    print(f"forecast zones: {len(forecast.get('zones', []))}, track record: {forecast.get('track_record')}")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    main(ap.parse_args().folder)
