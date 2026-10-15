"""
OCEANNOVA real-data downloader.

Downloads a SMALL, reproducible set of real NASA PACE OCI L2 AOP granules
and matching NOAA OISST v2.1 daily NetCDF files.

No synthetic data is created by this script.

First run:
    python scripts/download_real_data.py --start 2025-01-01 --end 2025-06-30 --max-granules 12

Earthdata authentication is interactive and is persisted by earthaccess.
You will need a free NASA Earthdata Login account.

Default region is a broad Indian Ocean box, but you can override it.
"""
from __future__ import annotations
import argparse
import re
from datetime import datetime, timedelta
from pathlib import Path
import urllib.request
import earthaccess

PACE_PRODUCTS = ["PACE_OCI_L2_AOP", "PACE_OCI_L2_AOP_NRT"]
OISST_BASE = "https://www.ncei.noaa.gov/thredds/fileServer/OisstBase/NetCDF/V2.1/AVHRR/{yyyymm}/oisst-avhrr-v02r01.{date}.nc"

def parse_args():
    p=argparse.ArgumentParser()
    p.add_argument("--start", default="2025-01-01")
    p.add_argument("--end", default="2025-06-30")
    p.add_argument("--max-granules", type=int, default=12)
    p.add_argument("--out", default="data/raw")
    p.add_argument("--bbox", nargs=4, type=float, metavar=("MIN_LON","MIN_LAT","MAX_LON","MAX_LAT"),
                   default=[40.0,-20.0,110.0,25.0])
    return p.parse_args()

def date_from_granule(g):
    s=str(g)
    m=re.search(r"PACE_OCI\.(\d{8})T", s)
    if m:
        return m.group(1)
    try:
        dt=g.umm["Temporal"]["RangeDateTime"]["BeginningDateTime"]
        return dt[:10].replace("-","")
    except Exception:
        return None

def download_oisst(date8: str, outdir: Path):
    date=f"{date8[:4]}-{date8[4:6]}-{date8[6:]}"
    yyyymm=date[:7].replace("-","")
    path=outdir / f"oisst-avhrr-v02r01.{date}.nc"
    if path.exists():
        return path
    url=OISST_BASE.format(yyyymm=yyyymm, date=date)
    try:
        urllib.request.urlretrieve(url, path)
        return path
    except Exception as e:
        if path.exists(): path.unlink()
        print(f"[WARN] Could not download OISST {date}: {e}")
        return None

def main():
    a=parse_args()
    root=Path(a.out); pace=root/"pace"; oisst=root/"oisst"
    pace.mkdir(parents=True,exist_ok=True); oisst.mkdir(parents=True,exist_ok=True)

    print("Logging into NASA Earthdata...")
    auth=earthaccess.login(strategy="interactive", persist=True)
    if not auth or not auth.authenticated:
        raise SystemExit("Earthdata authentication failed. Create/login to a free NASA Earthdata account and rerun.")

    temporal=(a.start, a.end)
    bbox=tuple(a.bbox)
    results=[]
    for product in PACE_PRODUCTS:
        print(f"Searching {product} ...")
        try:
            found=earthaccess.search_data(
                short_name=product,
                temporal=temporal,
                bounding_box=bbox,
                count=a.max_granules
            )
            if found:
                results=found
                print(f"Found {len(results)} granules from {product}.")
                break
        except Exception as e:
            print(f"[WARN] {product} search failed: {e}")

    if not results:
        raise SystemExit(
            "No PACE granules found. Try a wider date range or bbox. "
            "The PACE collection names are PACE_OCI_L2_AOP and PACE_OCI_L2_AOP_NRT."
        )

    downloaded=earthaccess.download(results, pace)
    dates=sorted({d for g in results if (d:=date_from_granule(g))})
    print(f"PACE files downloaded: {len(downloaded)}")
    print("Downloading matching NOAA OISST v2.1 daily files...")
    for d in dates:
        download_oisst(d, oisst)

    manifest=root/"download_manifest.json"
    manifest.write_text(__import__("json").dumps({
        "pace_product": "PACE OCI L2 AOP (standard preferred; NRT fallback)",
        "pace_source": "NASA Earthdata / NASA Ocean Biology DAAC",
        "oisst_source": "NOAA NCEI OISST v2.1",
        "start": a.start, "end": a.end, "bbox": a.bbox,
        "pace_files": len(list(pace.glob("*.nc"))),
        "oisst_files": len(list(oisst.glob("*.nc"))),
        "dates": dates,
    }, indent=2))
    print(f"Manifest: {manifest}")
    print("NEXT: python scripts/build_real_dataset.py")

if __name__=="__main__":
    main()
