import glob
import os
import numpy as np
import xarray as xr


def diagnose_file(filename):

    geo = xr.open_dataset(
        filename,
        group="navigation_data"
    )

    ds = xr.open_dataset(
        filename,
        group="geophysical_data"
    )

    rrs = ds["Rrs"]

    lines = rrs.sizes["number_of_lines"]
    pixels = rrs.sizes["pixels_per_line"]

    total_pixels = 0
    valid_80 = 0
    valid_60 = 0
    valid_40 = 0

    # Count usable pixels without loading the entire cube.
    for start in range(0, lines, 32):

        stop = min(start + 32, lines)

        r = rrs.isel(
            number_of_lines=slice(start, stop)
        ).values.astype(np.float32)

        finite_fraction = np.mean(
            np.isfinite(r),
            axis=2
        )

        total_pixels += finite_fraction.size

        valid_80 += np.sum(
            finite_fraction >= 0.80
        )

        valid_60 += np.sum(
            finite_fraction >= 0.60
        )

        valid_40 += np.sum(
            finite_fraction >= 0.40
        )

    ds.close()
    geo.close()

    return (
        os.path.basename(filename),
        lines,
        pixels,
        valid_80 / total_pixels * 100,
        valid_60 / total_pixels * 100,
        valid_40 / total_pixels * 100,
    )


files = sorted(
    glob.glob("data/raw/pace/*.nc")
)

print()
print("=" * 110)
print("OCEANNOVA — PACE GRANULE QUALITY DIAGNOSTIC")
print("=" * 110)

results = []

for i, filename in enumerate(files, 1):

    print(
        f"[{i}/{len(files)}] "
        f"Checking {os.path.basename(filename)}..."
    )

    try:
        results.append(
            diagnose_file(filename)
        )
    except Exception as e:
        print("ERROR:", repr(e))


results.sort(
    key=lambda x: x[3],
    reverse=True
)

print()
print(
    f"{'FILE':55} "
    f"{'LINES':>6} "
    f"{'PIXELS':>7} "
    f"{'>=80%':>9} "
    f"{'>=60%':>9} "
    f"{'>=40%':>9}"
)

print("-" * 110)

for row in results:

    print(
        f"{row[0]:55} "
        f"{row[1]:6} "
        f"{row[2]:7} "
        f"{row[3]:8.2f}% "
        f"{row[4]:8.2f}% "
        f"{row[5]:8.2f}%"
    )

print()
print("Higher >=80% means better hyperspectral coverage.")
print()