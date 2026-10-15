from __future__ import annotations

"""Live PACE + NOAA anomaly engine for OCEANNOVA v7.

This module is intentionally separate from the synthetic-trained OCEANNOVA
classifier.  v7 uses real PACE OCI L2 AOP pixels to build a scene-adaptive
normal manifold, then scores the actual pixels with an unsupervised novelty
ensemble.  NOAA NDBC observations are attached as independent environmental
context for the strongest PACE anomalies.

NASA Earthdata Login credentials are required to access PACE pixel data.
Discovery metadata can be searched without login, but data access requires EDL.
"""
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
import json
import logging
from threading import Lock, Thread
from typing import Any
import os
import re
import time
import tempfile
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeoutError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

import numpy as np
from sklearn.covariance import LedoitWolf
from sklearn.decomposition import PCA
from sklearn.ensemble import IsolationForest, ExtraTreesClassifier
from sklearn.preprocessing import StandardScaler
from sklearn.neighbors import LocalOutlierFactor
from sklearn.metrics import pairwise_distances

from . import forecast
from .features import ANCHORS, preprocess_spectrum
from .model import OceanNovaModel

try:
    import earthaccess
    import xarray as xr
except Exception:  # pragma: no cover - optional until real feed is enabled
    earthaccess = None
    xr = None


logger = logging.getLogger("oceannova.real_engine")

MODEL_VERSION = "7.0.0-real-pace-noaa"
DEFAULT_TTL_SECONDS = int(os.getenv("REAL_DATA_TTL_SECONDS", "1800"))
# Keep the first live refresh bounded: Earthdata granules are large and the
# map must fail honestly before the Next.js request deadline. Operators can
# increase these values after measuring their Earthdata/network capacity.
MAX_GRANULES = int(os.getenv("PACE_REAL_MAX_GRANULES", "1"))
PIXEL_STRIDE = int(os.getenv("PACE_REAL_PIXEL_STRIDE", "8"))
MAX_PIXELS_PER_GRANULE = int(os.getenv("PACE_REAL_MAX_PIXELS_PER_GRANULE", "5000"))
MAX_MAP_POINTS = int(os.getenv("PACE_REAL_MAX_MAP_POINTS", "4000"))
MODEL_TREES = int(os.getenv("PACE_REAL_MODEL_TREES", "220"))
EARTHDATA_SEARCH_TIMEOUT = int(os.getenv("EARTHDATA_SEARCH_TIMEOUT_SECONDS", "20"))
EARTHDATA_DOWNLOAD_TIMEOUT = int(os.getenv("EARTHDATA_DOWNLOAD_TIMEOUT_SECONDS", "90"))
# Granules run from ~10 MB to ~450 MB. Larger ones are skipped so one refresh stays
# within the download timeout on an ordinary connection.
MAX_GRANULE_MB = float(os.getenv("PACE_REAL_MAX_GRANULE_MB", "150"))
# The map legend's names for the trained classifier's classes.
TRAINED_CAUSE_NAMES = {"sediment plume": "sediment / resuspension"}
# Below this top probability the trained classifier's answer is reported as unknown,
# the same cut-off OceanNovaModel uses for a single spectrum.
MIN_CAUSE_PROBABILITY = 0.55
NOAA_TIMEOUT = int(os.getenv("NOAA_TIMEOUT_SECONDS", "20"))
FALLBACK_MODE = os.getenv("REAL_FEED_FALLBACK", "cached_then_simulated").lower()
FETCH_NOAA_HISTORY = os.getenv("NOAA_FETCH_HISTORY", "false").lower() == "true"
SNAPSHOT_PATH = Path(os.getenv("REAL_DATA_SNAPSHOT_PATH", "data/processed/real_pace_snapshot.json"))
STORE_PATH = Path(os.getenv("REAL_DATA_STORE_PATH", "data/processed/real_pace_passes.npz"))
# How long a pass stays on the map. Long enough for a three-day forecast to be checked
# against the pass that verifies it.
WINDOW_HOURS = float(os.getenv("PACE_REAL_WINDOW_HOURS", "120"))
FORECAST_LOG_PATH = Path(os.getenv("FORECAST_LOG_PATH", "data/processed/forecast_log.json"))
BACKTEST_PATH = Path("data/processed/forecast_backtest.json")
# Extra passes fetched per refresh to check an earlier forecast against a new observation.
FOLLOWUP_GRANULES = int(os.getenv("PACE_FORECAST_FOLLOWUP_GRANULES", "1"))
# A pass back over one particular area is usually bigger than the general size cap allows.
FOLLOWUP_MAX_MB = float(os.getenv("PACE_FORECAST_FOLLOWUP_MAX_MB", "260"))
# Shelf seas and river mouths where ocean-colour anomalies are common. The newest pass
# over each is fetched in rotation, because the largest recent granules are mostly clear
# open ocean with nothing to forecast. Boxes are (west, south, east, north).
WATCH_REGIONS = {
    "Timor and Arafura Seas": (120.0, -20.0, 137.0, -4.0),
    "Gulf of Mexico": (-98.0, 24.0, -82.0, 31.0),
    "Amazon plume": (-55.0, -2.0, -42.0, 8.0),
    "Bay of Bengal": (80.0, 10.0, 95.0, 22.0),
    "Yellow and East China Seas": (118.0, 26.0, 128.0, 40.0),
    "Arabian Sea and Persian Gulf": (48.0, 18.0, 68.0, 28.0),
    "Rio de la Plata": (-60.0, -40.0, -50.0, -32.0),
    "Gulf of Guinea": (-5.0, -2.0, 10.0, 7.0),
}
WATCH_PER_REFRESH = int(os.getenv("PACE_WATCH_REGIONS_PER_REFRESH", "1"))
WATCH_REVISIT_HOURS = float(os.getenv("PACE_WATCH_REVISIT_HOURS", "20"))

# PACE L2 flags that make an optical pixel unusable for anomaly discovery.
FATAL_MASK = (
    (1 << 0) | (1 << 1) | (1 << 4) | (1 << 5) | (1 << 8) |
    (1 << 9) | (1 << 12) | (1 << 14) | (1 << 24) | (1 << 25) |
    (1 << 28) | (1 << 29) | (1 << 30)
)


@dataclass
class Buoy:
    station: str
    lat: float
    lon: float
    water_temp_c: float | None
    wave_height_m: float | None
    time: str
    sst_anomaly_c: float | None = None
    history_samples: int = 0


def _now():
    return datetime.now(timezone.utc)


def _haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dp = np.radians(lat2 - lat1)
    dl = np.radians(lon2 - lon1)
    a = np.sin(dp / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return 2 * r * np.arcsin(np.sqrt(a))


def _safe_float(v):
    try:
        x = float(v)
        return x if np.isfinite(x) else None
    except Exception:
        return None


def _with_timeout(fn, timeout_seconds, label):
    pool = ThreadPoolExecutor(max_workers=1, thread_name_prefix=f"pace-{label}")
    future = pool.submit(fn)
    try:
        return future.result(timeout=timeout_seconds)
    except FutureTimeoutError as exc:
        future.cancel()
        raise TimeoutError(f"{label} timed out after {timeout_seconds}s") from exc
    finally:
        pool.shutdown(wait=False, cancel_futures=True)


def _granule_id(granule):
    return str(granule["umm"]["GranuleUR"])


def _granule_epoch(granule):
    """Acquisition start of a granule in epoch seconds."""
    try:
        begins = granule["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"]
        return datetime.fromisoformat(begins.replace("Z", "+00:00")).timestamp()
    except Exception:
        return time.time()


def _backtest_summary():
    """Headline numbers from the last run of ml_service.backtest_forecast, if there has been one."""
    try:
        report = json.loads(BACKTEST_PATH.read_text())
        return {key: report[key] for key in ("bbox", "start", "days", "zones_forecast", "verified", "present", "base_rate")}
    except Exception:
        return None


def _filename_epoch(path):
    """Acquisition start parsed from a PACE file name such as PACE_OCI.20261011T042946.L2..."""
    stamp = re.search(r"\.(\d{8}T\d{6})\.", Path(path).name)
    if not stamp:
        raise ValueError(f"No acquisition time in file name: {Path(path).name}")
    return datetime.strptime(stamp.group(1), "%Y%m%dT%H%M%S").replace(tzinfo=timezone.utc).timestamp()


@contextmanager
def _downloaded(results, timeout_seconds, label):
    """Download granules to a scratch directory and yield their local paths.

    Reading a thinned cube through earthaccess.open() costs thousands of HTTP range
    requests per granule and takes many minutes; one sequential download does not.
    """
    with tempfile.TemporaryDirectory(prefix="oceannova-pace-", ignore_cleanup_errors=True) as scratch:
        yield _with_timeout(lambda: earthaccess.download(results, local_path=scratch), timeout_seconds, label)


class RealPACEEngine:
    def __init__(self):
        self.lock = Lock()
        self.last_refresh = 0.0
        self.snapshot: dict[str, Any] | None = None
        self.last_error: str | None = None
        self._buoy_cache: list[Buoy] | None = None
        self._station_history_cache: dict[str, tuple[float, float | None, int]] = {}
        self._refresh_in_progress = False
        self._training_records: list[dict[str, Any]] = []
        self._training_records_updated_at: str | None = None
        # The ensemble trained by train_real.py. main.py hands over its loaded copy;
        # a standalone worker loads the artifact itself on first use.
        self.trained_model: OceanNovaModel | None = None
        self._trained_model_checked = False
        # Every scored pass inside the display window, keyed by granule name. A pass is
        # downloaded and scored once; the map and the forecast are rebuilt from this store.
        self._passes: dict[str, dict[str, Any]] = {}
        self._noaa_stations = 0
        self._watch_cursor = 0
        self._watch_seen: dict[str, float] = {}
        self._load_persisted_snapshot()
        self._load_store()

    def _trained_model(self):
        if self.trained_model is None and not self._trained_model_checked:
            self._trained_model_checked = True
            try:
                self.trained_model = OceanNovaModel.load()
            except Exception as exc:
                logger.warning("Trained ensemble unavailable, falling back to scene-adaptive scoring: %s", exc)
        return self.trained_model

    def _score_with_trained_model(self, model, features, lat, lon, nflh):
        """Score pixels against the trained normal-ocean reference instead of against their own scene.

        Scene-adaptive scoring calls the outer ~quarter of every scene anomalous, however
        ordinary the water; a fixed reference lets a clean open-ocean pass come back clean.
        """
        blank = np.full(len(features), np.nan)
        # Context order is lat, lon, chlor_a, nFLH, SST, turbidity; L2 AOP only carries nFLH.
        anomaly, components, probs = model.score_features(features, np.column_stack([lat, lon, blank, nflh, blank, blank]))
        score = anomaly / 100.0
        threshold = float(model.anomaly_threshold) / 100.0
        return {
            "score": score,
            "components": components,
            "threshold": threshold,
            "normal_fraction": float(np.mean(score < threshold)),
            "pca_components": int(model.pca.n_components_),
            "cause_probabilities": probs,
            "cause_classes": [TRAINED_CAUSE_NAMES.get(str(name), str(name)) for name in model.label_encoder.classes_],
        }

    def _load_persisted_snapshot(self):
        """Load the last successful snapshot so a process restart is graceful."""
        try:
            if SNAPSHOT_PATH.exists():
                payload = json.loads(SNAPSHOT_PATH.read_text())
                if isinstance(payload, dict) and payload.get("points"):
                    self.snapshot = payload
                    updated = payload.get("updated_at")
                    if updated:
                        self.last_refresh = time.time() - max(0, (time.time() - datetime.fromisoformat(updated.replace("Z", "+00:00")).timestamp()))
        except Exception:
            self.snapshot = None

    def _persist_snapshot(self, snapshot: dict[str, Any]):
        try:
            SNAPSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
            tmp = SNAPSHOT_PATH.with_suffix(".tmp")
            tmp.write_text(json.dumps(snapshot, separators=(",", ":")))
            tmp.replace(SNAPSHOT_PATH)
        except Exception as exc:
            self.last_error = f"snapshot-persist: {exc}"

    def status(self):
        return {
            "model_version": MODEL_VERSION,
            "live": bool(self.snapshot and self.snapshot.get("live")),
            "last_refresh": self.snapshot.get("updated_at") if self.snapshot else None,
            "last_error": self.last_error,
            "pace_granules": self.snapshot.get("pace_granules", 0) if self.snapshot else 0,
            "pace_valid_pixels": self.snapshot.get("candidate_pixels", 0) if self.snapshot else 0,
            "pace_anomaly_pixels": self.snapshot.get("anomaly_pixels", 0) if self.snapshot else 0,
            "noaa_stations": self.snapshot.get("noaa_stations", 0) if self.snapshot else 0,
            "earthdata_configured": bool(os.getenv("EARTHDATA_TOKEN") or (os.getenv("EARTHDATA_USERNAME") and os.getenv("EARTHDATA_PASSWORD"))),
            "noaa_token_configured": bool(os.getenv("NOAA_API_TOKEN")),
        }

    def get_snapshot(self, force: bool = False):
        """Return immediately while a bounded worker refreshes NASA/NOAA data.

        Earthdata downloads can outlive an HTTP request. A request must never hold
        the API open waiting for a remote granule; callers receive the last real
        snapshot (or an explicitly labelled continuity fallback) while the worker
        refreshes it for the next request.
        """
        fresh = self.snapshot and time.time() - self.last_refresh < DEFAULT_TTL_SECONDS
        if not force and fresh:
            return self.snapshot
        with self.lock:
            fresh = self.snapshot and time.time() - self.last_refresh < DEFAULT_TTL_SECONDS
            if not force and fresh:
                return self.snapshot
            if not self._refresh_in_progress:
                self._refresh_in_progress = True
                Thread(target=self._refresh_background, name="pace-refresh", daemon=True).start()
            if self.snapshot and FALLBACK_MODE in {"cached", "cached_then_simulated", "simulated"}:
                return {**self.snapshot, "live": False, "stale": True, "fallback": "cached",
                        "fallback_reason": "NASA PACE/NOAA refresh is in progress", "refreshing": True}
            if FALLBACK_MODE in {"simulated", "cached_then_simulated"}:
                return self._simulated_snapshot("NASA PACE/NOAA refresh is in progress") | {"refreshing": True}
            return {"live": False, "points": [], "pace_granules": 0, "candidate_pixels": 0,
                    "anomaly_pixels": 0, "map_points": 0, "noaa_stations": 0,
                    "updated_at": _now().isoformat(), "model_version": MODEL_VERSION,
                    "status": "REAL_FEED_REFRESHING", "refreshing": True}

    def _refresh_background(self):
        try:
            snapshot = self._refresh()
            with self.lock:
                self.snapshot = snapshot
                self.last_refresh = time.time()
                self.last_error = None
                self._persist_snapshot(snapshot)
        except Exception as exc:
            with self.lock:
                self.last_error = f"{type(exc).__name__}: {exc}"
                logger.warning("Background NASA/NOAA refresh failed: %s", self.last_error)
        finally:
            with self.lock:
                self._refresh_in_progress = False

    def _simulated_snapshot(self, reason: str):
        """Explicitly labeled continuity fallback; never presented as NASA/NOAA evidence."""
        if FALLBACK_MODE not in {"simulated", "cached_then_simulated"}:
            raise RuntimeError(reason)
        locations = [
            (7.5, -142.0), (12.0, -128.0), (-4.0, -115.0), (18.0, -98.0),
            (9.0, -78.0), (-12.0, -52.0), (2.0, -28.0), (17.0, -12.0),
            (-8.0, 8.0), (23.0, 42.0), (-18.0, 74.0), (-6.0, 116.0),
        ]
        points = []
        for index, (latitude, longitude) in enumerate(locations):
            points.append({
                "id": f"simulated-{index}", "latitude": latitude, "longitude": longitude,
                "anomaly_score": round(58 + (index * 7) % 30, 2), "confidence": 0.0,
                "severity": "medium", "cause": "unavailable — simulated continuity point",
                "cause_probabilities": {}, "detector_agreement": 0.0, "quality_score": 0.0,
                "noaa_corroboration": 0.0, "nflh": None, "avw": None, "aot_865": None,
                "angstrom": None, "noaa": {}, "spectral_evidence": [],
                "source": "SIMULATED FALLBACK — not NASA PACE or NOAA evidence",
            })
        return {"live": False, "stale": False, "fallback": "simulated", "fallback_reason": reason,
                "updated_at": _now().isoformat(), "model_version": MODEL_VERSION,
                "pace_granules": 0, "candidate_pixels": 0, "anomaly_pixels": 0,
                "map_points": len(points), "noaa_stations": 0, "points": points,
                "provenance": {"pace": "unavailable", "noaa": "unavailable",
                                "anomaly": "simulated continuity fallback", "note": "Do not use for scientific decisions."}}

    def _authenticate(self):
        if earthaccess is None:
            raise RuntimeError("earthaccess is not installed; install ml_service/requirements.txt")
        token = os.getenv("EARTHDATA_TOKEN")
        username = os.getenv("EARTHDATA_USERNAME")
        password = os.getenv("EARTHDATA_PASSWORD")
        if not (token or (username and password)):
            raise RuntimeError("NASA PACE pixel access requires EARTHDATA_TOKEN or EARTHDATA_USERNAME/EARTHDATA_PASSWORD")
        try:
            auth = earthaccess.login(strategy="environment")
        except Exception as exc:
            raise RuntimeError(f"NASA Earthdata authentication failed: {exc}") from exc
        if not getattr(auth, "authenticated", False):
            raise RuntimeError("NASA Earthdata authentication failed")
        return auth

    def _search_pace(self, days: int | None = None, max_granules: int | None = None):
        end = _now()
        # Export mode may widen the search to 30 days to build a minimum
        # training set; the live map remains bounded by its normal window.
        configured_days = int(os.getenv("PACE_REAL_DAYS", "14"))
        search_days = max(7, min(30, days if days is not None else configured_days))
        requested_granules = max(1, max_granules if max_granules is not None else MAX_GRANULES)
        start = end - timedelta(days=search_days)
        cloud_cover = (0, float(os.getenv("PACE_REAL_MAX_CLOUD", "80")))
        products = (
            "PACE_OCI_L2_AOP_NRT",
            "PACE_OCI_L2_AOP",
            "PACE_OCI_L2_BGC_NRT",
            "PACE_OCI_L3m_CHL",
        )
        errors = []
        for short_name in products:
            def search(product=short_name):
                # Search one product at a time so an empty NRT collection does
                # not prevent CMR from falling through to standard/BGC/CHL.
                # Newest daytime passes first: CMR's default order is oldest first, and
                # night or twilight granules carry no usable ocean colour. Over-fetch
                # so oversized granules can be skipped below.
                return earthaccess.search_data(
                    short_name=product,
                    temporal=(start.isoformat(), end.isoformat()),
                    cloud_cover=cloud_cover,
                    day_night_flag="day",
                    sort_key="-start_date",
                    count=requested_granules * 8,
                )

            try:
                results = _with_timeout(
                    search,
                    EARTHDATA_SEARCH_TIMEOUT,
                    f"NASA Earthdata search ({short_name})",
                )
            except Exception as exc:
                errors.append(f"{short_name}: {exc}")
                continue
            if results:
                # File size tracks how much cloud-free water a granule holds: the small ones are
                # mostly land, cloud or lakes. Take the largest recent passes that still fit.
                fits = sorted((granule for granule in results if granule.size() <= MAX_GRANULE_MB), key=lambda granule: granule.size(), reverse=True)
                selected = (fits or results)[:requested_granules]
                logger.info(
                    "PACE product selected: %s (%d granule(s), %d-day window)",
                    short_name,
                    len(selected),
                    search_days,
                )
                return selected

        detail = "; ".join(errors[-2:])
        suffix = f"; {detail}" if detail else ""
        raise RuntimeError(
            f"No PACE granules found across {', '.join(products)} in the last {search_days} days{suffix}"
        )

    def _read_granule(self, path):
        try:
            tree = xr.open_datatree(path, engine="h5netcdf")
        except (TypeError, ValueError):
            # earthaccess.open() returns a file-like HTTP object; netcdf4 cannot read it directly.
            # Materialize only this granule to a temporary file, then use the netCDF4 backend.
            if hasattr(path, "read"):
                with tempfile.NamedTemporaryFile(suffix=".nc") as cached:
                    path.seek(0)
                    while True:
                        chunk = path.read(1024 * 1024)
                        if not chunk:
                            break
                        cached.write(chunk)
                    cached.flush()
                    tree = xr.open_datatree(cached.name, engine="netcdf4")
            else:
                raise
        ds = tree["geophysical_data"]
        nav = tree["navigation_data"] if "navigation_data" in tree else None
        try:
            rrs = ds["Rrs"]
            wl = np.asarray(rrs["wavelength"].values, dtype=float)
            if rrs.ndim != 3:
                return None
            sl = {
                rrs.dims[0]: slice(None, None, PIXEL_STRIDE),
                rrs.dims[1]: slice(None, None, PIXEL_STRIDE),
            }
            # Read a spatially thinned but complete hyperspectral cube.
            arr = np.asarray(rrs.isel(**sl).values, dtype=np.float32)
            lat = np.asarray(nav["latitude"].isel(**sl).values if nav is not None else ds["latitude"].isel(**sl).values, dtype=np.float32)
            lon = np.asarray(nav["longitude"].isel(**sl).values if nav is not None else ds["longitude"].isel(**sl).values, dtype=np.float32)
            flags = np.asarray(ds["l2_flags"].isel(**sl).values, dtype=np.int64) if "l2_flags" in ds else np.zeros(lat.shape, dtype=np.int64)
            nflh = np.asarray(ds["nflh"].isel(**sl).values, dtype=np.float32) if "nflh" in ds else np.full(lat.shape, np.nan, dtype=np.float32)
            avw = np.asarray(ds["avw"].isel(**sl).values, dtype=np.float32) if "avw" in ds else np.full(lat.shape, np.nan, dtype=np.float32)
            aot = np.asarray(ds["aot_865"].isel(**sl).values, dtype=np.float32) if "aot_865" in ds else np.full(lat.shape, np.nan, dtype=np.float32)
            angstrom = np.asarray(ds["angstrom"].isel(**sl).values, dtype=np.float32) if "angstrom" in ds else np.full(lat.shape, np.nan, dtype=np.float32)
            chlor_a = np.asarray(ds["chlor_a"].isel(**sl).values, dtype=np.float32) if "chlor_a" in ds else np.full(lat.shape, np.nan, dtype=np.float32)
            turbidity = np.asarray(ds["turbidity"].isel(**sl).values, dtype=np.float32) if "turbidity" in ds else np.full(lat.shape, np.nan, dtype=np.float32)
            valid = np.isfinite(arr).mean(axis=-1) >= 0.85
            valid &= np.isfinite(lat) & np.isfinite(lon)
            valid &= (flags & FATAL_MASK) == 0
            flat_idx = np.flatnonzero(valid.reshape(-1))
            if len(flat_idx) > MAX_PIXELS_PER_GRANULE:
                # Deterministic spatial thinning keeps the map repeatable.
                flat_idx = flat_idx[np.linspace(0, len(flat_idx) - 1, MAX_PIXELS_PER_GRANULE).astype(int)]
            rr = arr.reshape(-1, arr.shape[-1])[flat_idx]
            out = {
                "rrs": rr,
                "wavelengths": wl,
                "lat": lat.reshape(-1)[flat_idx],
                "lon": lon.reshape(-1)[flat_idx],
                "flags": flags.reshape(-1)[flat_idx],
                "nflh": nflh.reshape(-1)[flat_idx],
                "avw": avw.reshape(-1)[flat_idx],
                "aot_865": aot.reshape(-1)[flat_idx],
                "angstrom": angstrom.reshape(-1)[flat_idx],
                "chlor_a": chlor_a.reshape(-1)[flat_idx],
                "turbidity": turbidity.reshape(-1)[flat_idx],
            }
            return out
        finally:
            try:
                tree.close()
            except Exception:
                pass

    def _feature_matrix(self, rrs, wavelengths):
        feats, smooth, qcs = [], [], []
        for row in rrs:
            try:
                f, s, qc = preprocess_spectrum(wavelengths, row)
                if qc["valid"]:
                    feats.append(f); smooth.append(s); qcs.append(qc)
                else:
                    feats.append(None); smooth.append(None); qcs.append(qc)
            except Exception:
                feats.append(None); smooth.append(None); qcs.append({"valid": False, "quality_score": 0.0})
        valid = np.array([x is not None for x in feats])
        if not valid.any():
            raise RuntimeError("No valid PACE spectra survived OCEANNOVA QC")
        return np.vstack([x for x in feats if x is not None]), np.vstack([x for x in smooth if x is not None]), valid, qcs

    def _fit_and_score(self, features):
        scaler = StandardScaler().fit(features)
        X = scaler.transform(features)
        ncomp = min(18, X.shape[1] - 1, X.shape[0] - 1)
        pca = PCA(n_components=max(4, ncomp), whiten=True, random_state=42).fit(X)
        Z = pca.transform(X)

        # First pass identifies the most central part of the current scene.
        seed_if = IsolationForest(n_estimators=MODEL_TREES, contamination="auto", random_state=42, n_jobs=-1).fit(Z)
        seed_score = -seed_if.score_samples(Z)
        normal_cut = np.quantile(seed_score, 0.70)
        normal = seed_score <= normal_cut
        if normal.sum() < 100:
            normal[:] = True

        normal_Z = Z[normal]
        cov = LedoitWolf().fit(normal_Z)
        iforest = IsolationForest(n_estimators=700, contamination="auto", random_state=43, n_jobs=-1).fit(normal_Z)
        neighbors = min(35, max(10, len(normal_Z) // 30))
        lof = LocalOutlierFactor(n_neighbors=neighbors, novelty=True, contamination="auto", n_jobs=-1).fit(normal_Z)

        # Mahalanobis and reconstruction are scene-adaptive and physically interpretable.
        centroid = normal_Z.mean(axis=0)
        mahal = np.einsum("ij,jk,ik->i", Z - centroid, cov.precision_, Z - centroid)
        X_recon = pca.inverse_transform(Z)
        recon = np.mean((X - X_recon) ** 2, axis=1)
        if_raw = -iforest.score_samples(Z)
        lof_raw = -lof.score_samples(Z)

        def robust(arr):
            q50, q99 = np.quantile(arr, [0.50, 0.99])
            return np.clip((arr - q50) / (q99 - q50 + 1e-9), 0, 1), (float(q50), float(q99))

        comp = {}
        thresholds = {}
        for name, arr in {
            "isolation_forest": if_raw,
            "local_outlier_factor": lof_raw,
            "robust_mahalanobis": mahal,
            "pca_latent_distance": recon,
        }.items():
            comp[name], thresholds[name] = robust(arr[normal]) if False else robust(arr)

        # Calibrate against the normal subset after fitting so the threshold is not arbitrary.
        calibrated = []
        for name, arr in {
            "isolation_forest": if_raw,
            "local_outlier_factor": lof_raw,
            "robust_mahalanobis": mahal,
            "pca_latent_distance": recon,
        }.items():
            nvals = arr[normal]
            q50, q995 = np.quantile(nvals, [0.50, 0.995])
            calibrated.append(np.clip((arr - q50) / (q995 - q50 + 1e-9), 0, 1))
            thresholds[name] = (float(q50), float(q995))
        ensemble = np.median(np.vstack(calibrated), axis=0)
        # Real-data threshold: 99th percentile of the learned normal manifold + guard band.
        normal_ens = ensemble[normal]
        threshold = float(np.clip(np.quantile(normal_ens, 0.99) + 0.05, 0.35, 0.80))
        return {
            "score": ensemble,
            "components": {
                "isolation_forest": calibrated[0],
                "local_outlier_factor": calibrated[1],
                "robust_mahalanobis": calibrated[2],
                "pca_latent_distance": calibrated[3],
            },
            "threshold": threshold,
            "normal_fraction": float(normal.mean()),
            "pca_components": int(pca.n_components_),
        }

    def _fetch_noaa(self):
        import urllib.request
        url = "https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt"
        headers = {
            "User-Agent": "OCEANNOVA/7.0 scientific-demo",
            "Accept": "text/plain",
        }
        if os.getenv("NOAA_API_TOKEN"):
            headers["Authorization"] = f"Bearer {os.environ['NOAA_API_TOKEN']}"
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=NOAA_TIMEOUT) as resp:
            text = resp.read().decode("utf-8", errors="replace")
        rows = []
        for line in text.splitlines():
            if not line or line.startswith("#"):
                continue
            cols = line.split()
            if len(cols) < 15:
                continue
            try:
                station, lat, lon = cols[0], float(cols[1]), float(cols[2])
                wvht = _safe_float(cols[11])
                wtmp = _safe_float(cols[18])
                if wtmp is not None and wtmp >= 90: wtmp = None
                if wvht is not None and wvht >= 90: wvht = None
                rows.append(Buoy(station, lat, lon, wtmp, wvht, "latest"))
            except Exception:
                continue
        if not rows:
            raise RuntimeError("NOAA NDBC latest observation feed returned no usable stations")
        return rows

    def _station_sst_history(self, station: str):
        cached = self._station_history_cache.get(station)
        if cached and time.time() - cached[0] < DEFAULT_TTL_SECONDS:
            return cached[1], cached[2]
        import urllib.request
        url = f"https://www.ndbc.noaa.gov/data/realtime2/{station}.txt"
        try:
            headers = {
                "User-Agent": "OCEANNOVA/7.0 scientific-demo",
                "Accept": "text/plain",
            }
            if os.getenv("NOAA_API_TOKEN"):
                headers["Authorization"] = f"Bearer {os.environ['NOAA_API_TOKEN']}"
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=15) as resp:
                text = resp.read().decode("utf-8", errors="replace")
            vals = []
            for line in text.splitlines():
                if not line or line.startswith("#"):
                    continue
                c = line.split()
                if len(c) >= 15:
                    v = _safe_float(c[18])
                    if v is not None and v < 90:
                        vals.append(v)
            if len(vals) >= 8:
                median = float(np.median(vals))
                mad = float(np.median(np.abs(np.asarray(vals) - median)))
                scale = max(1.4826 * mad, 0.15)
                result = (median, len(vals))
            else:
                result = (None, len(vals))
        except Exception:
            result = (None, 0)
        self._station_history_cache[station] = (time.time(), result[0], result[1])
        return result

    def _attach_noaa_context(self, lats, lons, noaa, top_indices):
        if not noaa:
            return {}
        arr_lat = np.array([b.lat for b in noaa])
        arr_lon = np.array([b.lon for b in noaa])
        out = {}
        used_stations = set()
        for idx in top_indices[:80]:
            d = _haversine_km(float(lats[idx]), float(lons[idx]), arr_lat, arr_lon)
            j = int(np.argmin(d))
            buoy = noaa[j]
            if float(d[j]) > 1200:
                out[idx] = {"station": None, "distance_km": float(d[j]), "water_temp_c": None, "wave_height_m": None, "sst_anomaly_c": None, "history_samples": 0}
                continue
            if buoy.station not in used_stations:
                if FETCH_NOAA_HISTORY:
                    med, n = self._station_sst_history(buoy.station)
                    if med is not None and buoy.water_temp_c is not None:
                        buoy.sst_anomaly_c = float(buoy.water_temp_c - med)
                    buoy.history_samples = n
                used_stations.add(buoy.station)
            out[idx] = {
                "station": buoy.station,
                "distance_km": round(float(d[j]), 1),
                "water_temp_c": buoy.water_temp_c,
                "wave_height_m": buoy.wave_height_m,
                "sst_anomaly_c": None if buoy.sst_anomaly_c is None else round(float(buoy.sst_anomaly_c), 2),
                "history_samples": buoy.history_samples,
            }
        return out

    def _cause_scores(self, smooth, nflh, avw, aot, angstrom, noaa_context, index):
        # Weakly supervised science proxies, deliberately labelled as likelihoods,
        # not ground-truth causes. PACE nFLH is especially useful for fluorescence.
        x = np.maximum(smooth[index], 1e-8)
        ix = {int(round(w)): i for i, w in enumerate(ANCHORS)}
        blue = x[ix[443]]
        green = x[ix[555]]
        red = x[ix[665]]
        red_edge = x[ix[681]]
        blue_green = blue / (green + 1e-8)
        red_green = red / (green + 1e-8)
        fluorescence = _safe_float(nflh[index]) or 0.0
        avw_v = _safe_float(avw[index]) or 0.0
        aot_v = _safe_float(aot[index]) or 0.0
        ang_v = _safe_float(angstrom[index]) or 0.0
        ctx = noaa_context.get(index, {})
        sst_anom = abs(float(ctx.get("sst_anomaly_c") or 0.0))
        wave = float(ctx.get("wave_height_m") or 0.0)
        scores = {
            "bloom / phytoplankton": max(0.0, fluorescence) * 4.0 + max(0.0, red_edge / (green + 1e-8) - 0.8) * 2.0,
            # AVW is a wavelength in nm (~440 blue water to ~560 turbid); used raw it added ~100 to
            # this score and made every pixel "sediment". Count only the excess above 500 nm.
            "sediment / resuspension": max(0.0, red_green - 0.6) * 3.0 + max(0.0, avw_v - 500.0) / 100.0 * 0.2,
            "CDOM / terrestrial influence": max(0.0, 0.7 - blue_green) * 3.0 + max(0.0, aot_v) * 0.2,
            "thermal / physical context": sst_anom * 1.4 + wave * 0.15,
            "unknown / mixed": 0.8,
        }
        # Contextual thermal evidence is not a spectral cause; it is deliberately
        # kept separate in the output so the UI does not overclaim causality.
        vals = np.array(list(scores.values()), dtype=float)
        vals = np.exp(vals - np.max(vals)); vals /= vals.sum() + 1e-12
        names = list(scores)
        return {k: float(v) for k, v in zip(names, vals)}

    def export_records(self, output_path: str = "data/raw/pace_noaa_records.jsonl", minimum_samples: int = 32, minimum_classes: int = 2):
        """Export real PACE pixels with nearest NOAA context for CNN training."""
        from .cnn_dataset import weak_label
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        self._authenticate()
        noaa = self._fetch_noaa()
        records: list[dict[str, Any]] = []
        selected_window = None
        for days in (14, 21, 30):
            results = self._search_pace(days=days, max_granules=max(MAX_GRANULES, int(os.getenv("PACE_EXPORT_MAX_GRANULES", "4"))))
            with _downloaded(results, EARTHDATA_DOWNLOAD_TIMEOUT * 2, "NASA PACE export download") as paths:
                for gi, path in enumerate(paths):
                    sample = self._read_granule(path)
                    if not sample:
                        continue
                    arr_lat, arr_lon = sample["lat"], sample["lon"]
                    buoy_lat = np.array([b.lat for b in noaa]) if noaa else np.array([])
                    buoy_lon = np.array([b.lon for b in noaa]) if noaa else np.array([])
                    for i, spectrum in enumerate(sample["rrs"]):
                        sst = None; wave = None; station = None
                        if noaa:
                            distances = _haversine_km(float(arr_lat[i]), float(arr_lon[i]), buoy_lat, buoy_lon)
                            j = int(np.argmin(distances))
                            if float(distances[j]) <= 1200:
                                buoy = noaa[j]; station = buoy.station; sst = buoy.water_temp_c; wave = buoy.wave_height_m
                        values = {"sst_c": _safe_float(sst), "chlor_a": _safe_float(sample["chlor_a"][i]), "turbidity": _safe_float(sample["turbidity"][i]), "n_flh": _safe_float(sample["nflh"][i])}
                        label = weak_label(values["sst_c"], values["chlor_a"], values["turbidity"], values["n_flh"])
                        records.append({"spectrum": np.asarray(spectrum, dtype=float).tolist(), "wavelengths_nm": np.asarray(sample["wavelengths"], dtype=float).tolist(), "latitude": float(arr_lat[i]), "longitude": float(arr_lon[i]), "timestamp": _now().isoformat(), **values, "noaa_station": station, "noaa_wave_height_m": _safe_float(wave), "source_granule": str(getattr(results[gi], "data", None) or results[gi])[:240], "label_preview": label.label, "label_confidence_preview": label.confidence})
            labels = {weak_label(r["sst_c"], r["chlor_a"], r["turbidity"], r["n_flh"]).label for r in records}
            if len(records) >= minimum_samples and len(labels) >= minimum_classes:
                selected_window = days
                break
        if not records:
            raise RuntimeError("No usable real PACE pixels were available for export")
        with output.open("w", encoding="utf-8") as handle:
            for record in records:
                handle.write(json.dumps(record, allow_nan=False) + "\\n")
        labels = {weak_label(r["sst_c"], r["chlor_a"], r["turbidity"], r["n_flh"]).label for r in records}
        self._training_records = records
        self._training_records_updated_at = _now().isoformat()
        return {"output": str(output), "samples": len(records), "classes": sorted(labels), "search_window_days": selected_window or 30, "noaa_stations": len(noaa), "minimum_met": len(records) >= minimum_samples and len(labels) >= minimum_classes, "provenance": "NASA PACE OCI L2 AOP + nearest NOAA NDBC observation"}

    def _search_followups(self, log, taken):
        """A recent pass over the forecast zone that most needs checking, if one exists."""
        if FOLLOWUP_GRANULES <= 0:
            return []
        target = forecast.pending_followup(log, time.time())
        if target is None:
            return []
        window = tuple(moment.isoformat() for moment in target["temporal"])
        for short_name in ("PACE_OCI_L2_AOP_NRT", "PACE_OCI_L2_AOP"):
            def search(product=short_name):
                return earthaccess.search_data(
                    short_name=product, temporal=window, bounding_box=target["bounding_box"],
                    day_night_flag="day", sort_key="-start_date", count=8,
                )
            try:
                found = _with_timeout(search, EARTHDATA_SEARCH_TIMEOUT, f"NASA Earthdata follow-up search ({short_name})")
            except Exception as exc:
                logger.warning("Follow-up search failed: %s", exc)
                continue
            fits = sorted((g for g in found if g.size() <= FOLLOWUP_MAX_MB and _granule_id(g) not in taken), key=lambda g: g.size(), reverse=True)
            if fits:
                logger.info("Follow-up pass for forecast zone %s: %s", target["zone_id"], _granule_id(fits[0]))
                return fits[:FOLLOWUP_GRANULES]
        return []

    def _forecast(self, scene, log, new_passes):
        """Forecast zones for the snapshot. A failure here must never cost the map its pixels."""
        try:
            now = time.time()
            # Earlier forecasts are scored against each new pass as it was observed, before a
            # later pass over the same water can replace its pixels in the combined scene.
            for record in new_passes:
                if len(record["lat"]):
                    forecast.verify(log, record["lat"], record["lon"], record["anomaly"], np.full(len(record["lat"]), record["obs_epoch"]))
            patches = forecast.find_patches(scene["lat"], scene["lon"], scene["anomaly"], scene["score"], scene["cause"], scene["obs_epoch"])
            payload, tracks = forecast.build_forecast(patches, now, log)
            forecast.record_forecasts(log, patches, tracks)
            forecast.save_log(log, FORECAST_LOG_PATH, now)
            payload["backtest"] = _backtest_summary()
            return payload
        except Exception as exc:
            logger.warning("Forecast unavailable: %s", exc)
            return {"available": False, "reason": f"{type(exc).__name__}: {exc}", "zones": []}

    def _load_store(self):
        try:
            if not STORE_PATH.exists():
                return
            saved = np.load(STORE_PATH, allow_pickle=False)
            extras = json.loads(str(saved["extras"]))
            bounds = np.concatenate([[0], saved["offsets"]]).astype(int)
            for index, pass_id in enumerate(str(name) for name in saved["ids"]):
                span = slice(bounds[index], bounds[index + 1])
                self._passes[pass_id] = {
                    "id": pass_id, "obs_epoch": float(saved["epochs"][index]),
                    "lat": saved["lat"][span], "lon": saved["lon"][span], "score": saved["score"][span],
                    "anomaly": saved["anomaly"][span], "cause": saved["cause"][span].astype(object),
                    **extras[pass_id],
                }
        except Exception as exc:
            logger.warning("Could not load the stored passes: %s", exc)
            self._passes = {}

    def _save_store(self):
        try:
            passes = list(self._passes.values())
            if not passes:
                return
            STORE_PATH.parent.mkdir(parents=True, exist_ok=True)
            extras = {p["id"]: {"points": p["points"], "point_pixel": [int(i) for i in p["point_pixel"]], "meta": p["meta"]} for p in passes}
            np.savez_compressed(
                STORE_PATH,
                ids=np.array([p["id"] for p in passes], dtype=str),
                epochs=np.array([p["obs_epoch"] for p in passes], dtype=float),
                offsets=np.cumsum([len(p["lat"]) for p in passes]),
                lat=np.concatenate([p["lat"] for p in passes]), lon=np.concatenate([p["lon"] for p in passes]),
                score=np.concatenate([p["score"] for p in passes]), anomaly=np.concatenate([p["anomaly"] for p in passes]),
                cause=np.concatenate([np.asarray(p["cause"], dtype=str) for p in passes]),
                extras=np.array(json.dumps(extras, separators=(",", ":"))),
            )
        except Exception as exc:
            logger.warning("Could not save the stored passes: %s", exc)

    def _process_pass(self, sample, pass_id, obs_epoch, noaa):
        """Score one satellite pass: every valid pixel, plus map points for the flagged ones."""
        record = {
            "id": pass_id, "obs_epoch": float(obs_epoch), "lat": np.zeros(0), "lon": np.zeros(0), "score": np.zeros(0),
            "anomaly": np.zeros(0, dtype=bool), "cause": np.zeros(0, dtype=object), "points": [], "point_pixel": [], "meta": {},
        }
        if sample is None or len(sample["rrs"]) == 0:
            return record
        try:
            feats, smooth, valid_mask, qcs = self._feature_matrix(sample["rrs"], sample["wavelengths"])
        except RuntimeError:
            return record
        lat = sample["lat"][valid_mask]; lon = sample["lon"][valid_mask]; nflh = sample["nflh"][valid_mask]
        avw = sample["avw"][valid_mask]; aot = sample["aot_865"][valid_mask]; ang = sample["angstrom"][valid_mask]
        qc_index = np.flatnonzero(valid_mask)

        trained = self._trained_model()
        fit = None
        if trained is not None:
            try:
                fit = self._score_with_trained_model(trained, feats, lat, lon, nflh)
            except Exception as exc:
                logger.warning("Trained ensemble scoring failed, using scene-adaptive scoring: %s", exc)
        if fit is None:
            trained = None
            fit = self._fit_and_score(feats)
        score = fit["score"]
        anomaly = score >= fit["threshold"]
        # Keep a generous set of actual anomalous PACE pixels for the map.
        anomaly_indices = np.flatnonzero(anomaly)
        order = anomaly_indices[np.argsort(score[anomaly_indices])[::-1]]
        map_indices = order[:MAX_MAP_POINTS]
        context = self._attach_noaa_context(lat, lon, noaa, map_indices)
        if trained is not None:
            normal_spectrum = np.asarray(trained.normal_spectrum, dtype=float)
        else:
            normal_scene = score <= np.quantile(score, 0.70)
            if normal_scene.sum() < 20:
                normal_scene = np.ones(len(score), dtype=bool)
            normal_spectrum = np.nanmedian(smooth[normal_scene], axis=0)
        trained_probs = fit.get("cause_probabilities")
        # One cause name per flagged pixel, shared by the map points and the forecast patches.
        pixel_cause = np.full(len(score), "", dtype=object)
        if trained_probs is not None:
            names = np.array(fit["cause_classes"], dtype=object)
            confident = trained_probs.max(axis=1) >= MIN_CAUSE_PROBABILITY
            pixel_cause[anomaly] = np.where(confident, names[trained_probs.argmax(axis=1)], "unknown / mixed")[anomaly]
        else:
            for i in anomaly_indices:
                scores = self._cause_scores(smooth, nflh, avw, aot, ang, context, i)
                pixel_cause[i] = max(scores, key=scores.get)

        observed = datetime.fromtimestamp(float(obs_epoch), timezone.utc)
        points = []
        for i in map_indices:
            if trained_probs is not None:
                causes = {name: float(p) for name, p in zip(fit["cause_classes"], trained_probs[i])}
            else:
                causes = self._cause_scores(smooth, nflh, avw, aot, ang, context, i)
            detector_values = [fit["components"][k][i] for k in fit["components"]]
            agreement = float(1.0 - np.std(detector_values))
            quality = float(qcs[int(qc_index[i])].get("quality_score", 0))
            nctx = context.get(int(i), {})
            residual = (smooth[i] - normal_spectrum) / np.maximum(np.abs(normal_spectrum), np.nanpercentile(np.abs(normal_spectrum), 25) * 0.25 + 1e-8)
            top_bands = np.argsort(np.abs(residual))[-8:][::-1]
            spectral_evidence = [{"band": int(round(ANCHORS[j])), "residual": round(float(residual[j]), 3)} for j in top_bands]
            corroboration = 0.0
            if nctx.get("sst_anomaly_c") is not None:
                corroboration = min(1.0, abs(float(nctx["sst_anomaly_c"])) / 3.0)
            proximity = 0.0 if not nctx.get("station") else max(0.0, 1.0 - float(nctx.get("distance_km") or 1200) / 1200.0)
            confidence = float(np.clip(0.40 * score[i] + 0.25 * agreement + 0.20 * (quality / 100.0) + 0.10 * corroboration + 0.05 * proximity, 0, 1))
            severity = "high" if score[i] >= min(0.98, fit["threshold"] + 0.12) else "medium"
            points.append({
                "id": f"pace-{observed:%m%dT%H%M}-{int(i)}",
                "latitude": round(float(lat[i]), 5),
                "longitude": round(float(lon[i]), 5),
                "anomaly_score": round(float(score[i] * 100), 2),
                "confidence": round(confidence, 4),
                "severity": severity,
                "cause": str(pixel_cause[i]),
                "cause_probabilities": {k: round(v, 4) for k, v in causes.items()},
                "detector_agreement": round(agreement, 4),
                "quality_score": round(quality, 2),
                "noaa_corroboration": round(corroboration, 4),
                "nflh": _safe_float(nflh[i]),
                "avw": _safe_float(avw[i]),
                "aot_865": _safe_float(aot[i]),
                "angstrom": _safe_float(ang[i]),
                "noaa": nctx,
                "spectral_evidence": spectral_evidence,
                "observed_at": observed.isoformat(),
                "source": "NASA PACE OCI L2 AOP + NOAA NDBC",
            })

        record.update({
            "lat": lat, "lon": lon, "score": score, "anomaly": anomaly, "cause": pixel_cause,
            "points": points, "point_pixel": [int(i) for i in map_indices],
            "meta": {
                "threshold": round(float(fit["threshold"] * 100), 2),
                "normal_fraction": round(float(fit["normal_fraction"]), 4),
                "pca_components": fit["pca_components"],
                "trained": trained is not None,
                "trained_causes": trained_probs is not None,
            },
        })
        return record

    def _assemble(self):
        """Combine the stored passes into one scene, newest observation winning.

        Where a newer pass saw a cell well enough to judge it, older pixels in that cell are
        dropped, so water that has since cleared stops being shown as anomalous.
        """
        claimed: set[int] = set()
        kept = {name: [] for name in ("lat", "lon", "score", "anomaly", "cause", "obs_epoch")}
        points = []
        for record in sorted(self._passes.values(), key=lambda p: p["obs_epoch"], reverse=True):
            if len(record["lat"]) == 0:
                continue
            keys = forecast.cell_keys(record["lat"], record["lon"])
            keep = ~np.isin(keys, list(claimed)) if claimed else np.ones(len(keys), dtype=bool)
            for name in ("lat", "lon", "score", "anomaly", "cause"):
                kept[name].append(np.asarray(record[name])[keep])
            kept["obs_epoch"].append(np.full(int(keep.sum()), record["obs_epoch"]))
            points.extend(point for point, pixel in zip(record["points"], record["point_pixel"]) if keep[pixel])
            cells, counts = np.unique(keys, return_counts=True)
            claimed.update(int(k) for k in cells[counts >= forecast.MIN_VALID_PER_CELL])
        if not kept["lat"]:
            raise RuntimeError("PACE granules were found but no usable Rrs pixels could be read")
        scene = {name: np.concatenate(parts) for name, parts in kept.items()}
        points.sort(key=lambda point: point["anomaly_score"], reverse=True)
        return scene, points[:MAX_MAP_POINTS]

    def _publish(self, log, new_passes):
        """Drop passes that have aged out, then build the snapshot from what is left."""
        cutoff = time.time() - WINDOW_HOURS * 3600.0
        self._passes = {name: record for name, record in self._passes.items() if record["obs_epoch"] >= cutoff}
        self._save_store()
        scene, points = self._assemble()
        seen = sorted((p for p in self._passes.values() if len(p["lat"])), key=lambda p: p["obs_epoch"], reverse=True)
        newest = seen[0]["meta"]
        flagged = int(scene["anomaly"].sum())
        return {
            "live": True,
            "stale": False,
            "updated_at": _now().isoformat(),
            "observed_at": datetime.fromtimestamp(seen[0]["obs_epoch"], timezone.utc).isoformat(),
            "window_hours": WINDOW_HOURS,
            "granule_ids": [p["id"] for p in seen],
            "passes": [
                {"id": p["id"], "observed_at": datetime.fromtimestamp(p["obs_epoch"], timezone.utc).isoformat(),
                 "valid_pixels": int(len(p["lat"])), "anomaly_pixels": int(np.sum(p["anomaly"]))}
                for p in seen
            ],
            "forecast": self._forecast(scene, log, new_passes),
            "model_version": MODEL_VERSION,
            "pace_granules": len(seen),
            "candidate_pixels": int(len(scene["lat"])),
            "anomaly_pixels": flagged,
            "map_points": len(points),
            "rendered_fraction_of_anomalies": round(len(points) / max(1, flagged), 4),
            "max_map_points": MAX_MAP_POINTS,
            "threshold": newest["threshold"],
            "normal_fraction": round(1.0 - flagged / max(1, len(scene["lat"])), 4),
            "pca_components": newest["pca_components"],
            "noaa_stations": self._noaa_stations,
            "points": points,
            "provenance": {
                "pace": "NASA PACE OCI L2 AOP / AOP_NRT Rrs",
                "noaa": "NOAA NDBC realtime observations",
                "anomaly": "novelty ensemble trained on a real-PACE normal-ocean reference" if newest["trained"] else "scene-adaptive unsupervised ensemble",
                "cause": "classifier ensemble trained on weak spectral labels, not field-validated" if newest["trained_causes"] else "weakly supervised spectral + PACE product + NOAA contextual likelihoods",
                "note": f"Pixels come from every pass in the last {WINDOW_HOURS:.0f} hours; where passes overlap, the newest observation of each cell is shown. Map dots are real PACE pixel locations, not synthetic points.",
            },
        }

    def _noaa_now(self):
        try:
            noaa = self._fetch_noaa()
        except Exception as exc:
            logger.warning("NOAA buoy feed unavailable: %s", exc)
            noaa = []
        self._noaa_stations = len(noaa)
        return noaa

    def _region_covered(self, box, since_epoch):
        """True when a stored pass newer than `since_epoch` already has a useful number of pixels in the box."""
        west, south, east, north = box
        for record in self._passes.values():
            if record["obs_epoch"] < since_epoch or len(record["lat"]) == 0:
                continue
            inside = (record["lon"] >= west) & (record["lon"] <= east) & (record["lat"] >= south) & (record["lat"] <= north)
            if int(inside.sum()) >= 200:
                return True
        return False

    def _search_watch(self, taken, limit):
        """The newest pass over each of the next `limit` watch regions that is due a visit.

        Regions are visited in rotation so that, over a day, every one of them is refreshed
        without any single refresh downloading more than a pass or two.
        """
        picks = []
        names = list(WATCH_REGIONS)
        now = time.time()
        window = ((_now() - timedelta(hours=36)).isoformat(), _now().isoformat())
        for _ in range(len(names)):
            if len(picks) >= limit:
                break
            name = names[self._watch_cursor % len(names)]
            self._watch_cursor += 1
            if now - self._watch_seen.get(name, 0.0) < WATCH_REVISIT_HOURS * 3600.0 or self._region_covered(WATCH_REGIONS[name], now - 30 * 3600.0):
                continue

            def search(region=name):
                return earthaccess.search_data(
                    short_name="PACE_OCI_L2_AOP_NRT", temporal=window, bounding_box=WATCH_REGIONS[region],
                    day_night_flag="day", sort_key="-start_date", count=6,
                )
            try:
                found = _with_timeout(search, EARTHDATA_SEARCH_TIMEOUT, f"NASA Earthdata watch search ({name})")
            except Exception as exc:
                logger.warning("Watch search failed for %s: %s", name, exc)
                continue
            self._watch_seen[name] = now
            fits = sorted(
                (g for g in found if g.size() <= FOLLOWUP_MAX_MB and _granule_id(g) not in taken and _granule_id(g) not in self._passes),
                key=lambda g: g.size(), reverse=True,
            )
            if fits:
                logger.info("Watch region %s: %s", name, _granule_id(fits[0]))
                picks.append(fits[0])
                taken.add(_granule_id(fits[0]))
        return picks

    def _refresh(self, watch_limit=None, global_picks=True):
        self._authenticate()
        log = forecast.load_log(FORECAST_LOG_PATH)
        results = self._search_pace() if global_picks else []
        taken = {_granule_id(g) for g in results}
        results = results + self._search_followups(log, taken)
        taken.update(_granule_id(g) for g in results)
        results = results + self._search_watch(taken, WATCH_PER_REFRESH if watch_limit is None else watch_limit)
        # A pass already in the store is never downloaded again.
        fresh = [g for g in results if _granule_id(g) not in self._passes]
        added = []
        noaa = self._noaa_now() if fresh else []
        for granule in fresh:
            # One pass at a time, each with its own time limit, so a slow download costs
            # that pass only and the ones already scored are kept.
            try:
                with _downloaded([granule], EARTHDATA_DOWNLOAD_TIMEOUT, "NASA PACE download") as paths:
                    record = self._process_pass(self._read_granule(paths[0]), _granule_id(granule), _granule_epoch(granule), noaa)
            except Exception as exc:
                logger.warning("Skipping %s: %s", _granule_id(granule), exc)
                continue
            self._passes[record["id"]] = record
            added.append(record)
            logger.info("Scored %s: %d valid pixels, %d flagged", record["id"], len(record["lat"]), int(np.sum(record["anomaly"])))
        return self._publish(log, added)

    def refresh_watch_regions(self):
        """Fetch the newest pass over every watch region now. Run with the service stopped."""
        self._watch_seen.clear()
        snapshot = self._refresh(watch_limit=len(WATCH_REGIONS), global_picks=False)
        self.snapshot = snapshot
        self.last_refresh = time.time()
        self._persist_snapshot(snapshot)
        return snapshot

    def ingest_local(self, paths):
        """Score granules already on disk into the store, oldest first, as if each had just arrived.

        Run with the service stopped: both would otherwise write the same store files.
        """
        log = forecast.load_log(FORECAST_LOG_PATH)
        noaa = self._noaa_now()
        snapshot = None
        cutoff = time.time() - WINDOW_HOURS * 3600.0
        for path in sorted(paths, key=_filename_epoch):
            pass_id = Path(path).name
            # A pass older than the display window would be dropped again straight away.
            if pass_id in self._passes or _filename_epoch(path) < cutoff:
                continue
            record = self._process_pass(self._read_granule(path), pass_id, _filename_epoch(path), noaa)
            self._passes[pass_id] = record
            snapshot = self._publish(log, [record])
            logger.info("Ingested %s: %d valid pixels, %d flagged", pass_id, len(record["lat"]), int(np.sum(record["anomaly"])))
        if snapshot is not None:
            self.snapshot = snapshot
            self.last_refresh = time.time()
            self._persist_snapshot(snapshot)
        return snapshot


ENGINE = RealPACEEngine()
