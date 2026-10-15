"""Backtest the patch forecast on consecutive days of real PACE passes over one area.

Each day's pass is scored with the trained ensemble, its patches are forecast with the
ocean currents for those dates, and every later day's pass verifies the earlier forecasts.

    python -m ml_service.backtest_forecast --bbox 120 -20 137 -4 --start 2026-10-08 --days 5 --max-mb 260

Granules are cached under data/raw/backtest so a rerun downloads nothing.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path

import numpy as np

try:
    from dotenv import load_dotenv
    load_dotenv(".env.local")
except ImportError:
    pass

import earthaccess

from . import forecast
from .real_engine import ENGINE, MAX_GRANULE_MB, MIN_CAUSE_PROBABILITY, _granule_epoch, _granule_id

CACHE = Path("data/raw/backtest")
REPORT = Path("data/processed/forecast_backtest.json")


def pick_granule(bbox, day, max_mb):
    """The largest daytime pass over the box on one UTC day that is small enough to fetch."""
    window = (day.isoformat(), (day + timedelta(days=1)).isoformat())
    for short_name in ("PACE_OCI_L2_AOP_NRT", "PACE_OCI_L2_AOP"):
        found = earthaccess.search_data(short_name=short_name, temporal=window, bounding_box=tuple(bbox), day_night_flag="day", count=20)
        fits = sorted((g for g in found if g.size() <= max_mb), key=lambda g: g.size(), reverse=True)
        if fits:
            return fits[0]
    return None


def score_granule(granule, bbox):
    """Valid pixels of one pass inside the box, scored the way the live engine scores them."""
    CACHE.mkdir(parents=True, exist_ok=True)
    path = CACHE / _granule_id(granule)
    if not path.exists():
        path = Path(earthaccess.download([granule], local_path=str(CACHE))[0])
    sample = ENGINE._read_granule(path)
    if sample is None or len(sample["rrs"]) == 0:
        return None
    feats, _, valid, _ = ENGINE._feature_matrix(sample["rrs"], sample["wavelengths"])
    lat = sample["lat"][valid]; lon = sample["lon"][valid]; nflh = sample["nflh"][valid]
    fit = ENGINE._score_with_trained_model(ENGINE._trained_model(), feats, lat, lon, nflh)
    anomaly = fit["score"] >= fit["threshold"]
    probs = fit["cause_probabilities"]
    names = np.array(fit["cause_classes"], dtype=object)
    cause = np.where(probs.max(axis=1) >= MIN_CAUSE_PROBABILITY, names[probs.argmax(axis=1)], "unknown / mixed")
    west, south, east, north = bbox
    inside = (lon >= west) & (lon <= east) & (lat >= south) & (lat <= north)
    return {
        "lat": lat[inside], "lon": lon[inside], "score": fit["score"][inside], "anomaly": anomaly[inside],
        "cause": np.where(anomaly, cause, "")[inside], "obs_epoch": np.full(int(inside.sum()), _granule_epoch(granule)),
    }


def base_rate(scene):
    """Share of well-observed cells that would count as "anomaly present" with no forecast at all."""
    keys = forecast.cell_keys(scene["lat"], scene["lon"])
    cells, inverse = np.unique(keys, return_inverse=True)
    valid = np.bincount(inverse, minlength=len(cells))
    hits = np.bincount(inverse, weights=scene["anomaly"].astype(float), minlength=len(cells))
    seen = valid >= forecast.VERIFY_MIN_VALID
    present = seen & (hits / np.maximum(valid, 1) >= forecast.PRESENT_FRACTION) & (hits >= forecast.PRESENT_MIN_FLAGGED)
    return int(present.sum()), int(seen.sum())


def main(bbox, start, days, max_mb=MAX_GRANULE_MB):
    if ENGINE._trained_model() is None:
        raise SystemExit("No trained ensemble found. Run: python -m ml_service.train_real")
    ENGINE._authenticate()
    log = {"zones": []}
    passes = []
    base_present = base_cells = 0
    for offset in range(days):
        day = start + timedelta(days=offset)
        granule = pick_granule(bbox, day, max_mb)
        if granule is None:
            passes.append({"day": day.date().isoformat(), "granule": None})
            print(f"{day.date()}: no usable pass", flush=True)
            continue
        scene = score_granule(granule, bbox)
        if scene is None or len(scene["lat"]) == 0:
            passes.append({"day": day.date().isoformat(), "granule": _granule_id(granule), "valid_pixels": 0})
            print(f"{day.date()}: {_granule_id(granule)} has no valid pixels in the box", flush=True)
            continue
        newly = forecast.verify(log, scene["lat"], scene["lon"], scene["anomaly"], scene["obs_epoch"])
        if offset:
            present, cells = base_rate(scene)
            base_present += present; base_cells += cells
        patches = forecast.find_patches(scene["lat"], scene["lon"], scene["anomaly"], scene["score"], scene["cause"], scene["obs_epoch"])
        _, tracks = forecast.build_forecast(patches, float(scene["obs_epoch"].max()), log)
        forecast.record_forecasts(log, patches, tracks)
        passes.append({
            "day": day.date().isoformat(), "granule": _granule_id(granule), "valid_pixels": int(len(scene["lat"])),
            "flagged_pixels": int(scene["anomaly"].sum()), "patches": len(patches), "forecasts_verified": newly,
        })
        print(f"{day.date()}: {_granule_id(granule)} valid={len(scene['lat'])} flagged={int(scene['anomaly'].sum())} patches={len(patches)} verified={newly}", flush=True)

    summary = forecast.summarize(log)
    outcomes = [lead["outcome"] for zone in log["zones"] for lead in zone["leads"].values() if lead["outcome"] is not None]
    compared = [o for o in outcomes if o["present_without_drift"] is not None]
    report = {
        "bbox": list(bbox),
        "start": start.date().isoformat(),
        "days": days,
        "passes": passes,
        "zones_forecast": len(log["zones"]),
        **summary,
        "present_without_drift": {"verified": len(compared), "present": sum(o["present_without_drift"] for o in compared)},
        "base_rate": {"cells": base_cells, "present": base_present},
        "zones": [
            {"id": zone["id"], "cause": zone["cause"], "signal": zone["signal"], "flagged": zone["flagged"],
             "outcomes": {hours: lead["outcome"] for hours, lead in zone["leads"].items()}}
            for zone in log["zones"]
        ],
        "note": "One area and a few days: a first check of the method, not a skill score.",
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2))
    print(json.dumps({k: report[k] for k in ("zones_forecast", "verified", "present", "by_lead_day", "by_cause", "present_without_drift", "base_rate")}, indent=2))


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--bbox", type=float, nargs=4, metavar=("WEST", "SOUTH", "EAST", "NORTH"), required=True)
    ap.add_argument("--start", required=True, help="first UTC day, YYYY-MM-DD")
    ap.add_argument("--days", type=int, default=4)
    ap.add_argument("--max-mb", type=float, default=MAX_GRANULE_MB, help="skip passes larger than this")
    a = ap.parse_args()
    main(a.bbox, datetime.fromisoformat(a.start).replace(tzinfo=timezone.utc), a.days, a.max_mb)
