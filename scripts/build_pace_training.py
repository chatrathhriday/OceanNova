"""Extract real PACE OCI L2 AOP spectra + science products into NPZ.

PACE OCI L2 V3.2 Rrs is 3-D (line, pixel, wavelength). We sample valid
pixels after rejecting land/cloud/navigation/product failures using l2_flags.
See NASA OB.DAAC's L2 file structure for the authoritative layout.
"""
from __future__ import annotations
import argparse
from pathlib import Path
import numpy as np, xarray as xr

# PACE/OCI L2 flags. We reject flags that make a pixel unusable, while retaining
# scientific warning flags (e.g. TURBIDW/CHLWARN/ATMWARN) as metadata rather than
# silently deleting the very anomalies we want to discover.
FATAL_FLAGS = {
    "ATMFAIL": 1, "LAND": 2, "HILT": 16, "HISATZEN": 32,
    "STRAYLIGHT": 256, "CLDICE": 512, "HISOLZEN": 4096,
    "LOWLW": 16384, "NAVFAIL": 33554432, "FILTER": 67108864,
    "BOWTIEDEL": 268435456, "HIPOL": 536870912, "PRODFAIL": 1073741824,
}
BAD_FLAG_MASK = sum(FATAL_FLAGS.values())


def open_geophysical(path):
    try:
        dt = xr.open_datatree(path, engine="netcdf4")
        return dt["geophysical_data"].to_dataset(), dt["navigation_data"].to_dataset(), dt
    except Exception:
        ds = xr.open_dataset(path, group="geophysical_data", engine="netcdf4")
        return ds, None, ds

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--input',default='data/raw'); ap.add_argument('--output',default='data/processed/pace_training.npz'); ap.add_argument('--max-pixels',type=int,default=50000); args=ap.parse_args()
    spectra=[]; chlor=[]; nflh=[]; lat=[]; lon=[]; quality_flag_rate=[]
    files=sorted(Path(args.input).glob('*.nc'))
    if not files: raise SystemExit('No NetCDF files found in data/raw. Run scripts/download_pace.py first.')
    rng=np.random.default_rng(42)
    for path in files:
        ds, nav, holder=open_geophysical(path)
        try:
            rrs=ds['Rrs']; wl=np.asarray(rrs['wavelength'].values,float)
            arr=rrs.values
            if arr.ndim != 3: continue
            flat=arr.reshape(-1,arr.shape[-1])
            flags=np.asarray(ds['l2_flags'].values).reshape(-1) if 'l2_flags' in ds else np.zeros(len(flat),dtype=np.int64)
            valid=np.isfinite(flat).mean(axis=1) >= .85
            if 'l2_flags' in ds:
                valid &= (flags & BAD_FLAG_MASK) == 0
                quality_flag_rate.append(float(np.mean((flags & BAD_FLAG_MASK) != 0)))
            idx=np.flatnonzero(valid)
            if len(idx)==0: continue
            take=min(len(idx), max(1,args.max_pixels//len(files)))
            idx=rng.choice(idx,size=take,replace=False)
            spectra.append(flat[idx])
            if 'chlor_a' in ds: chlor.append(np.asarray(ds['chlor_a'].values).reshape(-1)[idx])
            else: chlor.append(np.full(take,np.nan))
            if 'nflh' in ds: nflh.append(np.asarray(ds['nflh'].values).reshape(-1)[idx])
            else: nflh.append(np.full(take,np.nan))
            if nav is not None:
                lat.append(np.asarray(nav['latitude'].values).reshape(-1)[idx]); lon.append(np.asarray(nav['longitude'].values).reshape(-1)[idx])
            else: lat.append(np.full(take,np.nan)); lon.append(np.full(take,np.nan))
        finally:
            try: holder.close()
            except Exception: pass
    if not spectra: raise SystemExit('No valid spectra survived QC. Check credentials/data files.')
    out=Path(args.output); out.parent.mkdir(parents=True,exist_ok=True)
    np.savez_compressed(out, quality_flag_rate=np.asarray(quality_flag_rate,dtype='float32'), rrs=np.vstack(spectra).astype('float32'), wavelengths=wl.astype('float32'), chlor_a=np.concatenate(chlor).astype('float32'), nflh=np.concatenate(nflh).astype('float32'), latitude=np.concatenate(lat).astype('float32'), longitude=np.concatenate(lon).astype('float32'))
    print(f'Wrote {sum(x.shape[0] for x in spectra)} real PACE spectra to {out}')

if __name__=='__main__': main()
