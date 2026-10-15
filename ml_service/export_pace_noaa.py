from __future__ import annotations

import argparse
import json
from .real_engine import ENGINE


def main() -> None:
    parser = argparse.ArgumentParser(description="Export real PACE pixels matched to NOAA buoys")
    parser.add_argument("--output", default="data/raw/pace_noaa_records.jsonl")
    parser.add_argument("--minimum-samples", type=int, default=32)
    parser.add_argument("--minimum-classes", type=int, default=2)
    args = parser.parse_args()
    print(json.dumps(ENGINE.export_records(args.output, args.minimum_samples, args.minimum_classes), indent=2))


if __name__ == "__main__":
    main()
