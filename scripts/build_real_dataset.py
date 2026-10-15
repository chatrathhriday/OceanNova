import os
import glob
import json
import re
import numpy as np
import xarray as xr


INPUT_DIR = "data/raw/pace"
OUTPUT = "data/processed/pace_real_dataset.npz"

MAX_PIXELS_PER_FILE = 1500
MIN_FINITE_FRACTION = 0.80

# Only truly unusable flags are hard rejected.
HARD_FLAGS = [
    "LAND",
    "NAVFAIL",
]


def get_date(filename):
    """
    Extract YYYYMMDD from PACE filename.
    Example:
    PACE_OCI.20250601T002100.L2.OC_AOP.V3_2.nc
    """
    name = os.path.basename(filename)

    m = re.search(r"\.(\d{8})T\d{6}\.", name)

    if m:
        s = m.group(1)
        return f"{s[:4]}-{s[4:6]}-{s[6:8]}"

    return "unknown"


def interpolate_spectrum(s):
    """
    Fill missing spectral bands by linear interpolation.
    Only called when enough bands are already finite.
    """

    x = np.arange(len(s))
    good = np.isfinite(s)

    if good.sum() < 2:
        return None

    out = s.copy()

    out[~good] = np.interp(
        x[~good],
        x[good],
        s[good]
    )

    return out


def get_flag_mask(ds):
    names = str(
        ds["l2_flags"].attrs.get(
            "flag_meanings", ""
        )
    ).split()

    masks = np.asarray(
        ds["l2_flags"].attrs.get(
            "flag_masks", []
        ),
        dtype=np.int64
    )

    lookup = dict(
        zip(names, masks)
    )

    mask = np.int64(0)

    for name in HARD_FLAGS:

        if name in lookup:
            mask |= np.int64(
                lookup[name]
            )

    return mask


def process_file(filename):

    date = get_date(filename)

    print()
    print("=" * 70)
    print("FILE:", os.path.basename(filename))
    print("DATE:", date)
    print("=" * 70)

    geo = xr.open_dataset(
        filename,
        group="geophysical_data"
    )

    nav = xr.open_dataset(
        filename,
        group="navigation_data"
    )

    rrs = geo["Rrs"]
    flags = geo["l2_flags"]

    chlor = geo["chlor_a"] if "chlor_a" in geo else None
    nflh = geo["nflh"] if "nflh" in geo else None

    lines = rrs.sizes["number_of_lines"]
    pixels = rrs.sizes["pixels_per_line"]
    bands = rrs.sizes["wavelength"]

    print(
        f"Dimensions: {lines} x {pixels} x {bands}"
    )

    flag_mask = get_flag_mask(
        geo
    )

    print(
        "Hard flag mask:",
        int(flag_mask)
    )

    # Random generator is deterministic.
    rng = np.random.default_rng(
        abs(hash(os.path.basename(filename))) % (2**32)
    )

    candidates = []

    # Process in chunks so we never load a multi-GB granule.
    for start in range(
        0,
        lines,
        32
    ):

        stop = min(
            start + 32,
            lines
        )

        R = rrs.isel(
            number_of_lines=slice(start, stop)
        ).values.astype(
            np.float32
        )

        F = flags.isel(
            number_of_lines=slice(start, stop)
        ).values.astype(
            np.int64
        )

        LAT = nav["latitude"].isel(
            number_of_lines=slice(start, stop)
        ).values.astype(
            np.float32
        )

        LON = nav["longitude"].isel(
            number_of_lines=slice(start, stop)
        ).values.astype(
            np.float32
        )

        C = (
            chlor.isel(
                number_of_lines=slice(start, stop)
            ).values.astype(np.float32)
            if chlor is not None
            else np.zeros(
                LAT.shape,
                dtype=np.float32
            )
        )

        N = (
            nflh.isel(
                number_of_lines=slice(start, stop)
            ).values.astype(np.float32)
            if nflh is not None
            else np.zeros(
                LAT.shape,
                dtype=np.float32
            )
        )

        finite_fraction = np.mean(
            np.isfinite(R),
            axis=2
        )

        good = (
            (finite_fraction >= MIN_FINITE_FRACTION)
            & np.isfinite(LAT)
            & np.isfinite(LON)
            & ((F & flag_mask) == 0)
        )

        rows, cols = np.where(good)

        for r, c in zip(rows, cols):

            spectrum = R[r, c, :]

            spectrum = interpolate_spectrum(
                spectrum
            )

            if spectrum is None:
                continue

            # Remove extreme numerical values.
            spectrum = np.clip(
                spectrum,
                -0.05,
                0.2
            )

            chlor_value = C[r, c]
            nflh_value = N[r, c]

            if not np.isfinite(chlor_value):
                chlor_value = 0.0

            if not np.isfinite(nflh_value):
                nflh_value = 0.0

            candidates.append(
                (
                    spectrum,
                    float(LAT[r, c]),
                    float(LON[r, c]),
                    float(chlor_value),
                    float(nflh_value),
                    date,
                )
            )

    geo.close()
    nav.close()

    if not candidates:

        print("WARNING: No usable spectra.")
        return []

    # Randomly limit samples per file.
    if len(candidates) > MAX_PIXELS_PER_FILE:

        idx = rng.choice(
            len(candidates),
            size=MAX_PIXELS_PER_FILE,
            replace=False
        )

        candidates = [
            candidates[i]
            for i in idx
        ]

    print(
        "Usable spectra:",
        len(candidates)
    )

    return candidates


def main():

    os.makedirs(
        "data/processed",
        exist_ok=True
    )

    files = sorted(
        glob.glob(
            os.path.join(
                INPUT_DIR,
                "*.nc"
            )
        )
    )

    print()
    print("=" * 70)
    print("OCEANNOVA — REAL PACE DATASET BUILDER V2")
    print("=" * 70)

    print(
        "PACE files found:",
        len(files)
    )

    all_samples = []

    for filename in files:

        try:

            samples = process_file(
                filename
            )

            all_samples.extend(
                samples
            )

        except Exception as exc:

            print(
                "ERROR:",
                os.path.basename(filename),
                repr(exc)
            )

    if not all_samples:

        raise RuntimeError(
            "No usable PACE spectra found."
        )

    print()
    print("=" * 70)
    print("BUILDING FINAL DATASET")
    print("=" * 70)

    spectra = np.stack(
        [x[0] for x in all_samples]
    ).astype(np.float32)

    lat = np.asarray(
        [x[1] for x in all_samples],
        dtype=np.float32
    )

    lon = np.asarray(
        [x[2] for x in all_samples],
        dtype=np.float32
    )

    chlor = np.asarray(
        [x[3] for x in all_samples],
        dtype=np.float32
    )

    nflh = np.asarray(
        [x[4] for x in all_samples],
        dtype=np.float32
    )

    dates = np.asarray(
        [x[5] for x in all_samples]
    )

    # ------------------------------------------------------
    # Robust spectral normalization
    # ------------------------------------------------------

    spectra = np.nan_to_num(
        spectra,
        nan=0.0,
        posinf=0.0,
        neginf=0.0
    )

    # Positive reflectance floor for optical normalization.
    positive = np.maximum(
        spectra,
        1e-8
    )

    normalized = positive / (
        np.median(
            positive,
            axis=1,
            keepdims=True
        ) + 1e-8
    )

    # ------------------------------------------------------
    # Global spectral baseline
    # ------------------------------------------------------

    baseline = np.median(
        normalized,
        axis=0
    )

    distance = np.sqrt(
        np.mean(
            (
                normalized - baseline
            ) ** 2,
            axis=1
        )
    )

    # Robust anomaly score.
    med = np.median(distance)
    mad = np.median(
        np.abs(distance - med)
    ) + 1e-8

    anomaly_score = (
        distance - med
    ) / (
        1.4826 * mad
    )

    # Candidate anomaly = top 3%.
    threshold = np.percentile(
        anomaly_score,
        97
    )

    candidate_anomaly = (
        anomaly_score >= threshold
    ).astype(np.float32)

    # ------------------------------------------------------
    # Context features
    # ------------------------------------------------------

    chlor_clean = np.nan_to_num(
        chlor,
        nan=0.0,
        posinf=0.0,
        neginf=0.0
    )

    nflh_clean = np.nan_to_num(
        nflh,
        nan=0.0,
        posinf=0.0,
        neginf=0.0
    )

    context = np.column_stack(
        [
            np.log1p(
                np.maximum(
                    chlor_clean,
                    0
                )
            ),
            np.log1p(
                np.maximum(
                    nflh_clean,
                    0
                )
            ),
            anomaly_score,
            np.zeros(
                len(all_samples),
                dtype=np.float32
            )
        ]
    ).astype(np.float32)

    # ------------------------------------------------------
    # Save
    # ------------------------------------------------------

    np.savez_compressed(
        OUTPUT,
        X=spectra,
        context=context,
        lat=lat,
        lon=lon,
        anomaly_score=anomaly_score.astype(
            np.float32
        ),
        candidate_anomaly=candidate_anomaly,
        date=dates,
    )

    # ------------------------------------------------------
    # Summary
    # ------------------------------------------------------

    unique_dates, counts = np.unique(
        dates,
        return_counts=True
    )

    print()
    print("=" * 70)
    print("DATASET BUILD COMPLETE")
    print("=" * 70)

    print(
        "Output:",
        OUTPUT
    )

    print(
        "Samples:",
        len(spectra)
    )

    print(
        "Bands:",
        spectra.shape[1]
    )

    print(
        "Candidate anomalies:",
        int(candidate_anomaly.sum())
    )

    print(
        "Anomaly fraction:",
        f"{candidate_anomaly.mean() * 100:.2f}%"
    )

    print()
    print("DATE DISTRIBUTION:")

    for d, n in zip(
        unique_dates,
        counts
    ):
        print(
            f"  {d} : {n}"
        )

    print()
    print(
        "IMPORTANT:"
    )

    print(
        "candidate_anomaly is a statistical spectral"
    )

    print(
        "anomaly label, NOT field ground truth."
    )


if __name__ == "__main__":
    main()