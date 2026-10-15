from __future__ import annotations

"""Background refresher for the real PACE + NOAA snapshot.

Run this as the single Replit background task. It keeps the expensive PACE
processing off the user's request path while the Next.js app reads the cached
snapshot through /real/anomalies.
"""
import os
import time
import logging

from .real_engine import ENGINE

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("oceannova-real-worker")

INTERVAL = int(os.getenv("REAL_DATA_WORKER_INTERVAL_SECONDS", "1800"))
STARTUP_REFRESH = os.getenv("REAL_DATA_WORKER_STARTUP_REFRESH", "1") != "0"


def main() -> None:
    if STARTUP_REFRESH:
        try:
            snap = ENGINE.get_snapshot(force=True)
            log.info("Initial real-data refresh complete: %s anomalous pixels, %s map points", snap.get("anomaly_pixels"), snap.get("map_points"))
        except Exception as exc:
            log.exception("Initial PACE refresh failed: %s", exc)

    while True:
        time.sleep(max(300, INTERVAL))
        try:
            snap = ENGINE.get_snapshot(force=True)
            log.info("Scheduled refresh complete: %s anomalous pixels, %s map points", snap.get("anomaly_pixels"), snap.get("map_points"))
        except Exception as exc:
            log.exception("Scheduled PACE refresh failed: %s", exc)


if __name__ == "__main__":
    main()
