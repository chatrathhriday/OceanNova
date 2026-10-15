import os
import json
import argparse
from datetime import datetime, timedelta

import earthaccess


def month_ranges(start_date, end_date):
    """Return monthly date ranges overlapping the requested period."""
    start = datetime.strptime(start_date, "%Y-%m-%d")
    end = datetime.strptime(end_date, "%Y-%m-%d")

    current = start.replace(day=1)
    ranges = []

    while current <= end:
        if current.month == 12:
            next_month = current.replace(
                year=current.year + 1,
                month=1,
                day=1
            )
        else:
            next_month = current.replace(
                month=current.month + 1,
                day=1
            )

        month_start = max(current, start)
        month_end = min(end, next_month - timedelta(days=1))

        ranges.append((
            month_start.strftime("%Y-%m-%d"),
            month_end.strftime("%Y-%m-%d")
        ))

        current = next_month

    return ranges


def main():
    parser = argparse.ArgumentParser(
        description="Download temporally distributed NASA PACE OCI L2 AOP granules."
    )

    parser.add_argument(
        "--start",
        default="2025-01-01"
    )

    parser.add_argument(
        "--end",
        default="2025-06-30"
    )

    parser.add_argument(
        "--per-month",
        type=int,
        default=2
    )

    parser.add_argument(
        "--bbox",
        nargs=4,
        type=float,
        default=[40.0, -20.0, 110.0, 25.0],
        metavar=("N", "W", "E", "S")
    )

    args = parser.parse_args()

    os.makedirs("data/raw/pace", exist_ok=True)

    print("=" * 70)
    print("OCEANNOVA — TEMPORALLY DISTRIBUTED PACE DOWNLOAD")
    print("=" * 70)

    print(f"Date range : {args.start} → {args.end}")
    print(f"Per month  : {args.per_month}")
    print(f"BBox       : {args.bbox}")
    print()

    print("Logging into NASA Earthdata...")

    earthaccess.login(
        strategy="interactive",
        persist=True
    )

    downloaded = []
    existing = set(os.listdir("data/raw/pace"))

    for month_start, month_end in month_ranges(args.start, args.end):

        print()
        print("-" * 70)
        print(f"Searching {month_start} → {month_end}")
        print("-" * 70)

        results = earthaccess.search_data(
            short_name="PACE_OCI_L2_AOP",
            temporal=(month_start, month_end),    
        )

        print(f"Found {len(results)} granules.")

        if not results:
            print("No granules found for this month.")
            continue

        selected = results[:args.per_month]

        print(f"Selecting {len(selected)} granules.")

        try:
            files = earthaccess.download(
                selected,
                local_path="data/raw/pace"
            )

            for f in files:
                name = os.path.basename(str(f))

                if name not in existing:
                    downloaded.append(name)
                    existing.add(name)

        except Exception as exc:
            print(f"[WARN] Download failed for {month_start}: {exc}")

    manifest = {
        "source": "NASA Earthdata / NASA Ocean Biology DAAC",
        "product": "PACE_OCI_L2_AOP",
        "start": args.start,
        "end": args.end,
        "bbox": args.bbox,
        "per_month": args.per_month,
        "new_files": len(downloaded),
        "new_file_names": downloaded
    }

    with open(
        "data/raw/pace_temporal_manifest.json",
        "w",
        encoding="utf-8"
    ) as f:
        json.dump(manifest, f, indent=2)

    print()
    print("=" * 70)
    print("DOWNLOAD COMPLETE")
    print("=" * 70)
    print(f"New PACE files downloaded: {len(downloaded)}")
    print()
    print("Manifest:")
    print("data/raw/pace_temporal_manifest.json")
    print()


if __name__ == "__main__":
    main()