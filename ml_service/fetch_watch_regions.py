"""Fetch and score the newest PACE pass over every watch region in one go.

The running service visits one watch region per refresh; this fills them all at once.
Stop the ML service first: it writes the same store files.

    python -m ml_service.fetch_watch_regions
"""
from __future__ import annotations

import logging

try:
    from dotenv import load_dotenv
    load_dotenv(".env.local")
except ImportError:
    pass

from .real_engine import ENGINE

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    logging.getLogger("earthaccess").setLevel(logging.WARNING)
    snapshot = ENGINE.refresh_watch_regions()
    forecast = snapshot["forecast"]
    print(f"passes in store: {snapshot['pace_granules']}, valid pixels: {snapshot['candidate_pixels']}, flagged: {snapshot['anomaly_pixels']}")
    print(f"forecast zones: {len(forecast.get('zones', []))}, track record: {forecast.get('track_record')}")
