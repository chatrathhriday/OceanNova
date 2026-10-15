import os
import json
import earthaccess


MONTHS = [
    ("2025-02-01", "2025-02-28"),
    ("2025-03-01", "2025-03-31"),
    ("2025-04-01", "2025-04-30"),
    ("2025-05-01", "2025-05-31"),
    ("2025-06-01", "2025-06-30"),
]

PER_MONTH = 4


def main():

    os.makedirs("data/raw/pace", exist_ok=True)

    print("=" * 70)
    print("OCEANNOVA — ADDITIONAL PACE CANDIDATES")
    print("=" * 70)

    earthaccess.login(
        strategy="interactive",
        persist=True
    )

    existing = set(
        os.listdir("data/raw/pace")
    )

    new_files = []

    for start, end in MONTHS:

        print()
        print("-" * 70)
        print(f"Searching {start} -> {end}")
        print("-" * 70)

        results = earthaccess.search_data(
            short_name="PACE_OCI_L2_AOP",
            temporal=(start, end)
        )

        print("Found:", len(results))

        if not results:
            continue

        selected = results[:PER_MONTH]

        print(
            "Downloading",
            len(selected),
            "additional candidates..."
        )

        try:

            files = earthaccess.download(
                selected,
                local_path="data/raw/pace"
            )

            for f in files:

                name = os.path.basename(str(f))

                if name not in existing:

                    existing.add(name)
                    new_files.append(name)

        except Exception as exc:

            print(
                "[WARN]",
                start,
                repr(exc)
            )

    manifest = {
        "source": "NASA Earthdata / NASA Ocean Biology DAAC",
        "product": "PACE_OCI_L2_AOP",
        "new_files": new_files,
        "count": len(new_files)
    }

    with open(
        "data/raw/pace_additional_manifest.json",
        "w",
        encoding="utf-8"
    ) as f:

        json.dump(
            manifest,
            f,
            indent=2
        )

    print()
    print("=" * 70)
    print("DOWNLOAD COMPLETE")
    print("=" * 70)
    print("New files:", len(new_files))


if __name__ == "__main__":
    main()