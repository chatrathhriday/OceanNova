"""Short-range forecast of where today's detected anomaly patches will be.

The method is deliberately simple and inspectable:

  1. Flagged PACE pixels are gridded into half-degree cells. A cell is anomalous when it has
     enough valid pixels and at least half of them are flagged; touching cells form a patch.
  2. Each patch is carried forward with forecast surface currents (Open-Meteo Marine API),
     integrated hour by hour from the satellite pass time.
  3. The footprint is widened by an assumed position error that grows with time.

It does not predict anomalies appearing from nowhere, and it does not predict how long a
patch lasts. Persistence is measured afterwards: every forecast is logged and `verify`
scores it against later satellite passes, which is where the track record comes from.
"""
from __future__ import annotations

import json
import logging
import math
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np

logger = logging.getLogger("oceannova.forecast")

CELL_DEG = 0.5
MIN_VALID_PER_CELL = 4
MIN_FLAGGED_FRACTION = 0.5
MIN_PATCH_FLAGGED = 6
# Currents are sampled once per block of cells rather than once per cell.
BLOCK_CELLS = 3
# Horizons shown on the map, in hours after the forecast is issued.
DISPLAY_HORIZONS_H = (0, 24, 48, 72)
# Lead times that get verified, in hours after the satellite pass.
VERIFY_LEADS_H = (24, 48, 72)
# Assumed growth of position error. Surface-current forecasts are typically off by
# around 0.1 m/s, which is roughly 9 km per day.
SPREAD_KM_PER_DAY = 10.0
# A later pass verifies a lead time when it falls within this many hours of it.
VERIFY_WINDOW_H = 12
VERIFY_MIN_VALID = 4
# "Still there" means at least this share of the valid pixels in the footprint are flagged.
PRESENT_FRACTION = 0.3
PRESENT_MIN_FLAGGED = 3
KM_PER_DEG = 111.19
LOG_KEEP_DAYS = 14
MARINE_URL = "https://marine-api.open-meteo.com/v1/marine"

_NX = int(round(360 / CELL_DEG))


def _iso(epoch):
    return datetime.fromtimestamp(float(epoch), timezone.utc).isoformat().replace("+00:00", "Z")


def _wrap_lon(lon):
    return (np.asarray(lon, dtype=float) + 180.0) % 360.0 - 180.0


def cell_keys(lat, lon):
    ix = np.floor((np.asarray(lon, dtype=float) + 180.0) / CELL_DEG).astype(int) % _NX
    iy = np.floor((np.asarray(lat, dtype=float) + 90.0) / CELL_DEG).astype(int)
    return iy * _NX + ix


def _cell_centers(keys):
    keys = np.asarray(keys, dtype=int)
    lon = (keys % _NX + 0.5) * CELL_DEG - 180.0
    lat = (keys // _NX + 0.5) * CELL_DEG - 90.0
    return np.column_stack([lon, lat])


def _signal(n_flagged, flagged_fraction, mean_score):
    """How strong the detection is today. This describes the evidence, not the future."""
    if n_flagged >= 25 and flagged_fraction >= 0.7 and mean_score >= 0.9:
        return "strong"
    if n_flagged >= 10 and flagged_fraction >= 0.6:
        return "moderate"
    return "weak"


def find_patches(lat, lon, flagged, score, cause, obs_epoch):
    """Group flagged pixels into patches of touching anomalous cells.

    `cause` holds a cause name per pixel (ignored where not flagged) and `obs_epoch` the
    satellite acquisition time of each pixel in epoch seconds.
    """
    lat = np.asarray(lat, dtype=float)
    lon = np.asarray(lon, dtype=float)
    flagged = np.asarray(flagged, dtype=bool)
    score = np.asarray(score, dtype=float)
    cause = np.asarray(cause, dtype=object)
    obs_epoch = np.asarray(obs_epoch, dtype=float)
    if len(lat) == 0 or not flagged.any():
        return []

    key = cell_keys(lat, lon)
    cells, inverse = np.unique(key, return_inverse=True)
    n_valid = np.bincount(inverse, minlength=len(cells))
    n_flag = np.bincount(inverse, weights=flagged.astype(float), minlength=len(cells))
    hot = (n_valid >= MIN_VALID_PER_CELL) & (n_flag / np.maximum(n_valid, 1) >= MIN_FLAGGED_FRACTION)
    hot_keys = {int(k) for k in cells[hot]}

    patches = []
    seen: set[int] = set()
    for start in sorted(hot_keys):
        if start in seen:
            continue
        seen.add(start)
        stack, members = [start], []
        while stack:
            current = stack.pop()
            members.append(current)
            cy, cx = divmod(current, _NX)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    neighbour = (cy + dy) * _NX + (cx + dx) % _NX
                    if neighbour in hot_keys and neighbour not in seen:
                        seen.add(neighbour)
                        stack.append(neighbour)

        in_patch = np.isin(key, members)
        hits = in_patch & flagged
        n_flagged = int(hits.sum())
        if n_flagged < MIN_PATCH_FLAGGED:
            continue
        n_pixels = int(in_patch.sum())
        # Circular mean so a patch straddling the date line does not average to 0 degrees.
        angle = np.radians(lon[hits])
        centroid_lon = float(np.degrees(np.arctan2(np.sin(angle).mean(), np.cos(angle).mean())))
        centroid_lat = float(lat[hits].mean())
        centers = _cell_centers(sorted(members))
        area = float(np.sum((CELL_DEG * KM_PER_DEG) ** 2 * np.cos(np.radians(centers[:, 1]))))
        names, counts = np.unique(cause[hits].astype(str), return_counts=True)
        mix = {str(name): round(float(count) / n_flagged, 3) for name, count in zip(names, counts)}
        mean_score = float(score[hits].mean())
        fraction = n_flagged / max(n_pixels, 1)
        basis = float(obs_epoch[in_patch].max())
        patches.append({
            "id": f"z{datetime.fromtimestamp(basis, timezone.utc):%Y%m%dT%H%M}-{min(members)}",
            "basis_epoch": basis,
            "cells": [int(k) for k in sorted(members)],
            "centroid": [round(centroid_lon, 3), round(centroid_lat, 3)],
            "area_km2": round(area),
            "pixels": {"valid": n_pixels, "flagged": n_flagged},
            "flagged_fraction": round(fraction, 3),
            "mean_score": round(mean_score, 3),
            "cause": max(mix, key=mix.get),
            "cause_mix": mix,
            "signal": _signal(n_flagged, fraction, mean_score),
        })
    patches.sort(key=lambda p: p["pixels"]["flagged"] * p["mean_score"], reverse=True)
    return patches


def fetch_currents(points, start_epoch, end_epoch, timeout=25):
    """Hourly surface currents for each (lon, lat) point between two epochs.

    Returns one entry per point: None where the ocean model has no value, otherwise
    (hour start epochs, eastward km/h, northward km/h).
    """
    tracks = []
    start_date = datetime.fromtimestamp(start_epoch, timezone.utc).date().isoformat()
    end_date = datetime.fromtimestamp(end_epoch, timezone.utc).date().isoformat()
    for offset in range(0, len(points), 40):
        batch = points[offset:offset + 40]
        query = urlencode({
            "latitude": ",".join(f"{lat:.3f}" for _, lat in batch),
            "longitude": ",".join(f"{lon:.3f}" for lon, _ in batch),
            "hourly": "ocean_current_velocity,ocean_current_direction",
            "start_date": start_date,
            "end_date": end_date,
            "timezone": "GMT",
            "cell_selection": "sea",
        })
        request = Request(f"{MARINE_URL}?{query}", headers={"User-Agent": "OCEANNOVA/7.0 scientific-demo"})
        with urlopen(request, timeout=timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
        for location in payload if isinstance(payload, list) else [payload]:
            hourly = location.get("hourly") or {}
            speed = np.array([np.nan if v is None else v for v in hourly.get("ocean_current_velocity") or []], dtype=float)
            heading = np.array([np.nan if v is None else v for v in hourly.get("ocean_current_direction") or []], dtype=float)
            if len(speed) == 0 or not np.isfinite(speed).any():
                tracks.append(None)
                continue
            times = np.array([datetime.fromisoformat(t).replace(tzinfo=timezone.utc).timestamp() for t in hourly["time"]])
            # The direction is where the water is heading: 0 degrees is north, 90 is east.
            tracks.append((times, speed * np.sin(np.radians(heading)), speed * np.cos(np.radians(heading))))
    return tracks


def drift_km(track, start_epoch, end_epoch):
    """Net (east, north) displacement in km between two epochs, or None without usable currents."""
    if end_epoch <= start_epoch:
        return (0.0, 0.0)
    if track is None:
        return None
    times, east, north = track
    overlap = np.clip(np.minimum(end_epoch, times + 3600.0) - np.maximum(start_epoch, times), 0.0, None)
    used = overlap > 0
    if overlap.sum() < 0.9 * (end_epoch - start_epoch) or not np.isfinite(east[used]).all():
        return None
    return (float(np.sum(east[used] * overlap[used]) / 3600.0), float(np.sum(north[used] * overlap[used]) / 3600.0))


def _blocks(cell_keys):
    """Split a patch's cells into current-sampling blocks: {block: [cell index, ...]}."""
    blocks: dict[tuple[int, int], list[int]] = {}
    for index, key in enumerate(cell_keys):
        cy, cx = divmod(int(key), _NX)
        blocks.setdefault((cy // BLOCK_CELLS, cx // BLOCK_CELLS), []).append(index)
    return blocks


def _project(patch, tracks, end_epoch):
    """Where a patch's cells sit at `end_epoch`, drifting from its satellite pass time."""
    centers = _cell_centers(patch["cells"])
    blocks = _blocks(patch["cells"])
    moves = {block: drift_km(tracks.get((patch["id"], block)), patch["basis_epoch"], end_epoch) for block in blocks}
    known = [(move, len(blocks[block])) for block, move in moves.items() if move is not None]
    if known:
        weight = sum(count for _, count in known)
        mean = (sum(m[0] * c for m, c in known) / weight, sum(m[1] * c for m, c in known) / weight)
    else:
        mean = (0.0, 0.0)
    shifted = centers.copy()
    for block, members in blocks.items():
        east, north = moves[block] if moves[block] is not None else mean
        latitude = centers[members, 1]
        shifted[members, 1] = np.clip(latitude + north / KM_PER_DEG, -89.5, 89.5)
        shifted[members, 0] = centers[members, 0] + east / (KM_PER_DEG * np.maximum(np.cos(np.radians(latitude)), 0.05))
    shifted[:, 0] = _wrap_lon(shifted[:, 0])
    lon0, lat0 = patch["centroid"]
    center = [
        round(float(_wrap_lon(lon0 + mean[0] / (KM_PER_DEG * max(math.cos(math.radians(lat0)), 0.05)))), 3),
        round(float(np.clip(lat0 + mean[1] / KM_PER_DEG, -89.5, 89.5)), 3),
    ]
    elapsed_days = max(0.0, end_epoch - patch["basis_epoch"]) / 86400.0
    return {
        "valid_time": _iso(end_epoch),
        "center": center,
        "cells": np.round(shifted, 3).tolist(),
        "drift_km": round(math.hypot(*mean), 1),
        "drift_bearing_deg": round(math.degrees(math.atan2(mean[0], mean[1])) % 360.0) if any(mean) else None,
        "spread_km": round(SPREAD_KM_PER_DAY * elapsed_days, 1),
        "currents": "forecast" if known else "unavailable",
    }


def _tracks_for(patches, end_epoch, currents):
    """Fetch one current track per sampling block across all patches."""
    if not patches:
        return {}
    wanted = []
    for patch in patches:
        centers = _cell_centers(patch["cells"])
        for block, members in _blocks(patch["cells"]).items():
            wanted.append(((patch["id"], block), (float(centers[members, 0].mean()), float(centers[members, 1].mean()))))
    start = min(patch["basis_epoch"] for patch in patches)
    try:
        fetched = currents([point for _, point in wanted], start, end_epoch)
    except Exception as exc:
        logger.warning("Ocean current forecast unavailable, zones will be shown without drift: %s", exc)
        return {}
    return {key: track for (key, _), track in zip(wanted, fetched)}


def build_forecast(patches, issued_epoch, log=None, currents=fetch_currents):
    """Forecast zones for the map: each patch projected to every display horizon."""
    horizon_end = issued_epoch + max(DISPLAY_HORIZONS_H) * 3600.0
    lead_end = max((p["basis_epoch"] for p in patches), default=issued_epoch) + max(VERIFY_LEADS_H) * 3600.0
    tracks = _tracks_for(patches, max(horizon_end, lead_end), currents)
    record = summarize(log) if log is not None else {"verified": 0, "present": 0, "by_lead_day": {}, "by_cause": {}}
    zones = []
    for patch in patches:
        horizons = [{"hours": hours, **_project(patch, tracks, issued_epoch + hours * 3600.0)} for hours in DISPLAY_HORIZONS_H]
        zones.append({
            **{k: patch[k] for k in ("id", "centroid", "area_km2", "pixels", "flagged_fraction", "mean_score", "cause", "cause_mix", "signal")},
            "observed_at": _iso(patch["basis_epoch"]),
            "cells": _cell_centers(patch["cells"]).tolist(),
            "horizons": horizons,
            "track_record": record["by_cause"].get(patch["cause"]),
        })
    return {
        "available": True,
        "issued_at": _iso(issued_epoch),
        "horizons_hours": list(DISPLAY_HORIZONS_H),
        "cell_deg": CELL_DEG,
        "zones": zones,
        "track_record": record,
        "method": "Detected anomaly patches carried forward with forecast surface currents; footprint widened by an assumed position error.",
        "assumptions": [
            f"A patch is a group of touching {CELL_DEG}-degree cells where at least {int(MIN_FLAGGED_FRACTION * 100)}% of valid PACE pixels are flagged.",
            "Patches move with the surface current only; wind drag, sinking, growth and decay are not modelled.",
            f"Position error is assumed to grow by {SPREAD_KM_PER_DAY:.0f} km per day.",
            "New anomalies that have not been observed yet cannot be forecast.",
            "Footprints are not clipped to the coastline; the map hides the part over land, exported files do not.",
            "Signal strength describes today's detection. It is not a probability.",
        ],
        "sources": {"detections": "NASA PACE OCI L2 AOP", "currents": "Open-Meteo Marine API (ocean_current_velocity, ocean_current_direction)"},
    }, tracks


# --- verification -------------------------------------------------------------------------


def load_log(path):
    try:
        payload = json.loads(Path(path).read_text())
        if isinstance(payload, dict) and isinstance(payload.get("zones"), list):
            return payload
    except Exception:
        pass
    return {"zones": []}


def save_log(log, path, now_epoch):
    cutoff = now_epoch - LOG_KEEP_DAYS * 86400.0
    log["zones"] = [zone for zone in log["zones"] if zone["basis_epoch"] >= cutoff]
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(log, separators=(",", ":")))
    tmp.replace(path)


def record_forecasts(log, patches, tracks):
    """Add each new patch to the log with its footprint at every verifiable lead time."""
    known = {zone["id"] for zone in log["zones"]}
    for patch in patches:
        if patch["id"] in known:
            continue
        leads = {}
        for hours in VERIFY_LEADS_H:
            projected = _project(patch, tracks, patch["basis_epoch"] + hours * 3600.0)
            leads[str(hours)] = {
                "valid_epoch": patch["basis_epoch"] + hours * 3600.0,
                "cells": projected["cells"],
                "spread_km": projected["spread_km"],
                "currents": projected["currents"],
                "outcome": None,
            }
        log["zones"].append({
            "id": patch["id"],
            "basis_epoch": patch["basis_epoch"],
            "cause": patch["cause"],
            "signal": patch["signal"],
            "flagged": patch["pixels"]["flagged"],
            "cells_now": _cell_centers(patch["cells"]).tolist(),
            "leads": leads,
        })


def _inside(lat, lon, cells, reach_km):
    """Pixels within `reach_km` of any cell centre."""
    cells = np.asarray(cells, dtype=float)
    pad = reach_km / KM_PER_DEG + 0.1
    near = (lat >= cells[:, 1].min() - pad) & (lat <= cells[:, 1].max() + pad)
    inside = np.zeros(len(lat), dtype=bool)
    index = np.flatnonzero(near)
    if len(index) == 0:
        return inside
    p1 = np.radians(lat[index])[:, None]
    p2 = np.radians(cells[:, 1])[None, :]
    dlon = np.radians(lon[index])[:, None] - np.radians(cells[:, 0])[None, :]
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dlon / 2) ** 2
    distance = 2 * 6371.0 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
    inside[index] = distance.min(axis=1) <= reach_km
    return inside


def _outcome(lat, lon, flagged, cells, reach_km, observed_epoch):
    inside = _inside(lat, lon, cells, reach_km)
    valid = int(inside.sum())
    if valid < VERIFY_MIN_VALID:
        return None
    hits = int((inside & flagged).sum())
    fraction = hits / valid
    return {
        "observed_at": _iso(observed_epoch),
        "valid": valid,
        "flagged": hits,
        "fraction": round(fraction, 3),
        "present": bool(fraction >= PRESENT_FRACTION and hits >= PRESENT_MIN_FLAGGED),
    }


def verify(log, lat, lon, flagged, obs_epoch):
    """Score logged forecasts against newly observed pixels. Returns how many were verified.

    Each lead time is checked twice: against the drifted footprint, and against the
    footprint left where it was, so the log shows whether the drift step adds anything.
    """
    lat = np.asarray(lat, dtype=float)
    lon = np.asarray(lon, dtype=float)
    flagged = np.asarray(flagged, dtype=bool)
    obs_epoch = np.asarray(obs_epoch, dtype=float)
    half_cell_km = CELL_DEG * KM_PER_DEG * math.sqrt(0.5)
    verified = 0
    for observed in np.unique(obs_epoch):
        this_pass = obs_epoch == observed
        for zone in log["zones"]:
            # A forecast cannot be verified by the pass it was built from.
            if observed < zone["basis_epoch"] + 6 * 3600.0:
                continue
            for lead in zone["leads"].values():
                if lead["outcome"] is not None or abs(observed - lead["valid_epoch"]) > VERIFY_WINDOW_H * 3600.0:
                    continue
                reach = half_cell_km + lead["spread_km"]
                outcome = _outcome(lat[this_pass], lon[this_pass], flagged[this_pass], lead["cells"], reach, observed)
                if outcome is None:
                    continue
                stayed = _outcome(lat[this_pass], lon[this_pass], flagged[this_pass], zone["cells_now"], reach, observed)
                outcome["present_without_drift"] = None if stayed is None else stayed["present"]
                lead["outcome"] = outcome
                verified += 1
    return verified


def summarize(log):
    """Track record so far: how often a forecast patch was still there when next observed."""
    def tally():
        return {"verified": 0, "present": 0}

    total = tally()
    by_lead: dict[str, dict] = {}
    by_cause: dict[str, dict] = {}
    for zone in log["zones"]:
        for hours, lead in zone["leads"].items():
            outcome = lead["outcome"]
            if outcome is None:
                continue
            day = str(int(hours) // 24)
            for bucket in (total, by_lead.setdefault(day, tally()), by_cause.setdefault(zone["cause"], tally())):
                bucket["verified"] += 1
                bucket["present"] += int(outcome["present"])
    return {**total, "by_lead_day": by_lead, "by_cause": by_cause}


def pending_followup(log, now_epoch):
    """The logged zone most worth re-observing now, with the search window that would verify it.

    Returns None when nothing is waiting. NRT granules appear a few hours after the pass,
    so only lead times whose window has at least partly elapsed are considered.
    """
    best = None
    for zone in log["zones"]:
        for lead in zone["leads"].values():
            opens = lead["valid_epoch"] - VERIFY_WINDOW_H * 3600.0
            closes = lead["valid_epoch"] + VERIFY_WINDOW_H * 3600.0
            if lead["outcome"] is not None or now_epoch < opens + 3 * 3600.0 or now_epoch > closes + 36 * 3600.0:
                continue
            if best is None or zone["flagged"] > best[0]["flagged"]:
                best = (zone, lead, opens, min(closes, now_epoch))
    if best is None:
        return None
    zone, lead, opens, closes = best
    cells = np.asarray(lead["cells"], dtype=float)
    pad = CELL_DEG
    return {
        "zone_id": zone["id"],
        "bounding_box": (
            float(max(-180.0, cells[:, 0].min() - pad)), float(max(-90.0, cells[:, 1].min() - pad)),
            float(min(180.0, cells[:, 0].max() + pad)), float(min(90.0, cells[:, 1].max() + pad)),
        ),
        "temporal": (datetime.fromtimestamp(opens, timezone.utc), datetime.fromtimestamp(closes, timezone.utc) + timedelta(minutes=1)),
    }
