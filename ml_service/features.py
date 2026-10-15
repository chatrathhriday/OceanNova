from __future__ import annotations
import numpy as np
from scipy.signal import savgol_filter
from scipy.ndimage import gaussian_filter1d

EPS = 1e-8
# Reflectance below roughly this (sr^-1) is retrieval noise in PACE L2 Rrs. Ratio features floor
# here so near-zero red bands over clear water don't turn into arbitrary large log values.
RRS_FLOOR = 1e-5
# PACE's first Rrs band is centred at 346.017 nm, a hair inside the 346 nm anchor. A sub-nanometre
# shortfall at either end just reuses the edge band, so it must not reject the spectrum.
COVERAGE_TOLERANCE_NM = 1.0

# Stable hyperspectral anchors spanning PACE OCI's UV-VIS-NIR range.
# PACE OCI L2 AOP Rrs is currently delivered across the UV/VIS range to ~719 nm.
# We intentionally do NOT extrapolate into the 720-900+ nm OCI radiance range because
# the standard L2 Rrs product is not a measured Rrs spectrum there.
ANCHORS = np.array([346, 365, 380, 400, 412, 443, 475, 490, 510, 531, 555, 560, 580, 620, 650, 665, 674, 681, 690, 700, 709, 719], dtype=float)


def _interp(x: np.ndarray, y: np.ndarray, anchors: np.ndarray = ANCHORS) -> np.ndarray:
    order = np.argsort(x)
    x, y = x[order], y[order]
    valid = np.isfinite(x) & np.isfinite(y)
    x, y = x[valid], y[valid]
    if len(x) < 8:
        raise ValueError("Insufficient valid spectral samples")
    return np.interp(anchors, x, y)


def preprocess_spectrum(wavelengths_nm: np.ndarray, rrs: np.ndarray, l2_flags=None) -> tuple[np.ndarray, np.ndarray, dict]:
    """QC + smoothing + SNV + derivatives + continuum features."""
    wl = np.asarray(wavelengths_nm, dtype=float)
    y = np.asarray(rrs, dtype=float)
    if wl.shape != y.shape:
        raise ValueError("wavelengths_nm and rrs must have identical shapes")

    covered = wl.min() <= ANCHORS[0] + COVERAGE_TOLERANCE_NM and wl.max() >= ANCHORS[-1] - COVERAGE_TOLERANCE_NM
    if not covered:
        raise ValueError(f"Spectrum does not cover the OCEANNOVA anchor range {ANCHORS[0]:.0f}-{ANCHORS[-1]:.0f} nm")
    y = _interp(wl, y)
    finite_ratio = float(np.isfinite(rrs).mean())
    flags = int(l2_flags or 0)
    # PACE/OCI L2 flags are bit-packed. Fatal retrieval/geometry/land/cloud flags
    # reject the sample; warning flags are retained as quality context.
    fatal_flag_names = {"ATMFAIL":1<<0, "LAND":1<<1, "HIGLINT":1<<3, "HILT":1<<4, "HISATZEN":1<<5,
                        "COASTZ":1<<6, "STRAYLIGHT":1<<8, "CLDICE":1<<9, "HISOLZEN":1<<12,
                        "LOWLW":1<<14, "ABSAER":1<<17, "NAVFAIL":1<<25, "SEAICE":1<<24,
                        "BOWTIEDEL":1<<28, "HIPOL":1<<29, "PRODFAIL":1<<30}
    fatal_hits = [name for name, bit in fatal_flag_names.items() if flags & bit]
    y = np.nan_to_num(y, nan=np.nanmedian(y), posinf=0.0, neginf=0.0)
    y = np.maximum(y, 0.0)

    # Gentle denoising preserves narrow phytoplankton features while suppressing pixel noise.
    smooth = savgol_filter(y, 7, 2, mode="interp")
    smooth = gaussian_filter1d(smooth, sigma=0.7)
    # Smoothing overshoots below zero beside near-zero bands (about one real spectrum in six);
    # a negative value here would make the log-ratio features NaN.
    smooth = np.maximum(smooth, 0.0)
    mean, std = float(smooth.mean()), float(smooth.std())
    snv = (smooth - mean) / (std + EPS)
    d1 = np.gradient(smooth, ANCHORS)
    d2 = np.gradient(d1, ANCHORS)

    # Continuum removal highlights absorption/fluorescence structure.
    continuum = np.interp(ANCHORS, [ANCHORS[0], ANCHORS[-1]], [smooth[0], smooth[-1]])
    # Real clear-water spectra are often ~0 at one or both ends, so the raw ratio reaches 1e4 for a
    # fraction of a percent of pixels and swamps the scaler; log1p keeps the ordering without the tail.
    continuum_removed = np.log1p(smooth / (continuum + RRS_FLOOR))

    # Log-ratio features capture shape changes more robustly than raw magnitude.
    ratios = np.log((smooth + RRS_FLOOR) / (np.median(smooth) + RRS_FLOOR))
    features = np.concatenate([snv, d1 * 1000.0, d2 * 1e5, continuum_removed, ratios])
    qc = {
        "finite_fraction": finite_ratio,
        "spectral_std": std,
        "negative_fraction": float(np.mean(np.asarray(rrs) < 0)),
        "anchor_coverage_nm": float(min(wl.max(), ANCHORS[-1]) - max(wl.min(), ANCHORS[0])),
        "fatal_flag_hits": fatal_hits,
        "warning_flag_present": bool(flags),
        "quality_score": float(np.clip(100.0 * (0.55 * finite_ratio + 0.25 * min(1.0, std / 0.001) + 0.20 * (0.0 if fatal_hits else 1.0)), 0, 100)),
        "valid": bool(finite_ratio >= 0.8 and std > 1e-8 and not fatal_hits and covered and np.isfinite(features).all()),
    }
    return features.astype(np.float32), smooth.astype(np.float32), qc
