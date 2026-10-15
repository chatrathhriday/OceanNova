"""Download real NASA PACE OCI data for OCEANNOVA.

Preferred: Earthdata Login via earthaccess.
Set EARTHDATA_USERNAME and EARTHDATA_PASSWORD, then:
  python scripts/download_pace.py --days 14 --max-granules 4

This targets PACE OCI L2 AOP/BGC products. The loader later extracts Rrs and
associated ocean-color products from NetCDF rather than using granule counts.
"""
from __future__ import annotations
import argparse, os
from pathlib import Path
import earthaccess


def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--days',type=int,default=14); ap.add_argument('--max-granules',type=int,default=4); ap.add_argument('--out',default='data/raw'); args=ap.parse_args()
    Path(args.out).mkdir(parents=True,exist_ok=True)
    auth=earthaccess.login(strategy="environment")
    if not auth.authenticated:
        raise SystemExit("Earthdata authentication failed. Set EARTHDATA_USERNAME and EARTHDATA_PASSWORD.")
    results=earthaccess.search_data(short_name='PACE_OCI_L2_AOP', temporal=(f'-{args.days} days','now'), count=args.max_granules)
    if not results:
        raise SystemExit('No PACE AOP granules found for the requested window.')
    files=earthaccess.download(results, args.out)
    print(f'Downloaded {len(files)} PACE AOP granule(s) to {args.out}')

if __name__=='__main__': main()
