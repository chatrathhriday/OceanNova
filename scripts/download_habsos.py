"""Download NOAA/NCEI HABSOS archive data for external HAB validation.

HABSOS is NOAA/NCEI's research-quality HAB observation archive. The URL below
is the NCEI access-files endpoint linked from the official HABSOS page. Keep
this dataset separate from PACE training until spatial/temporal matching and
quality control are performed.
"""
from __future__ import annotations
import argparse
from pathlib import Path
from urllib.request import urlretrieve

DEFAULT_URL = "https://www.ncei.noaa.gov/archive/archive-management-system/OAS/bin/prd/jquery/accession/download/120767"

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--url',default=DEFAULT_URL); ap.add_argument('--out',default='data/external/habsos_download'); a=ap.parse_args()
    out=Path(a.out); out.mkdir(parents=True,exist_ok=True)
    target=out/'habsos_archive_download'
    urlretrieve(a.url, target)
    print(f'Downloaded HABSOS archive to {target}')

if __name__=='__main__': main()
