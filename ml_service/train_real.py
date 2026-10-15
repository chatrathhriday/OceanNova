"""Train OCEANNOVA on real PACE spectra with weak science labels.

Novelty detectors learn a normal-ocean manifold. Cause classifiers use weak
silver labels from chlorophyll/nFLH plus spectral/context features. Labels are
explicitly not treated as ground truth.

Whole acquisition dates are held out before fitting, so the reported hold-out
numbers never share a satellite pass with the training data.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path
import numpy as np
from sklearn.metrics import balanced_accuracy_score, f1_score
from .model import OceanNovaModel, ARTIFACT, NORMAL_LABEL
from .features import ANCHORS, COVERAGE_TOLERANCE_NM, preprocess_spectrum, _interp

CLASSES = np.array(["bloom / phytoplankton", "sediment plume", "CDOM / terrestrial influence", "mixed"])
WAVELENGTH_SIDECAR = "pace_oci_rrs_wavelengths.json"

def silver_labels(rrs, chlor_a, nflh):
    ca=np.asarray(chlor_a); nf=np.asarray(nflh)
    finite_ca=np.isfinite(ca)&(ca>0); finite_nf=np.isfinite(nf)&(nf>0)
    ca_q=np.nanquantile(ca[finite_ca],[.80,.95]) if finite_ca.any() else [np.inf,np.inf]
    nf_q=np.nanquantile(nf[finite_nf],[.80,.95]) if finite_nf.any() else [np.inf,np.inf]
    labels=np.full(len(rrs),"mixed",dtype=object); conf=np.full(len(rrs),.30)
    bloom=(finite_ca&(ca>=ca_q[1]))|(finite_nf&(nf>=nf_q[1])); labels[bloom]="bloom / phytoplankton"; conf[bloom]=.90
    idx={int(w):i for i,w in enumerate(ANCHORS)}; r=np.maximum(rrs,1e-8)
    blue_green=r[:,idx[443]]/r[:,idx[555]]; red_green=r[:,idx[665]]/r[:,idx[555]]
    coastal=(red_green>np.nanquantile(red_green,.90))&(blue_green>np.nanquantile(blue_green,.60))&~bloom
    labels[coastal]="sediment plume"; conf[coastal]=.72
    cdom=(blue_green<np.nanquantile(blue_green,.10))&~bloom&~coastal
    labels[cdom]="CDOM / terrestrial influence"; conf[cdom]=.68
    return labels,conf

def load_dataset(path):
    """Read either dataset layout as (rrs, wavelengths, chlor_a, nflh, lat, lon, dates)."""
    path=Path(path); d=np.load(path,allow_pickle=False)
    def column(key,n): return np.asarray(d[key],dtype=float) if key in d.files else np.full(n,np.nan)
    if 'rrs' in d.files:
        # scripts/build_pace_training.py
        rows=d['rrs']; wl=d['wavelengths'] if 'wavelengths' in d.files else d['wavelength']; n=len(rows)
        return rows,np.asarray(wl,dtype=float),column('chlor_a',n),column('nflh',n),column('latitude',n),column('longitude',n),None
    # scripts/build_real_dataset.py: spectra in X, context=[log1p(chlor_a), log1p(nflh), ...] and no
    # wavelength grid, so the grid comes from a sidecar written from one of the source granules.
    rows=d['X']; n=len(rows); sidecar=path.with_name(WAVELENGTH_SIDECAR)
    if not sidecar.exists(): raise SystemExit(f'{path.name} has no wavelength grid; expected {sidecar}')
    wl=np.asarray(json.loads(sidecar.read_text())['wavelength_nm'],dtype=float)
    if len(wl)!=rows.shape[1]: raise SystemExit(f'{sidecar.name} has {len(wl)} wavelengths but the spectra have {rows.shape[1]} bands')
    context=np.asarray(d['context'],dtype=float); chlor=np.expm1(context[:,0]); nflh=np.expm1(context[:,1])
    # That builder wrote missing chlor_a/nFLH as 0, which is not a reading.
    chlor[~(chlor>0)]=np.nan; nflh[~(nflh>0)]=np.nan
    dates=d['date'].astype(str) if 'date' in d.files else None
    return rows,wl,chlor,nflh,column('lat',n),column('lon',n),dates

def to_anchors(rows,wl):
    """Resample every spectrum onto the model's anchor wavelengths; unusable rows come back as NaN."""
    if wl.min()>ANCHORS[0]+COVERAGE_TOLERANCE_NM or wl.max()<ANCHORS[-1]-COVERAGE_TOLERANCE_NM:
        raise SystemExit(f'Spectra cover {wl.min():.0f}-{wl.max():.0f} nm, short of the {ANCHORS[0]:.0f}-{ANCHORS[-1]:.0f} nm anchor range')
    out=np.full((len(rows),len(ANCHORS)),np.nan,dtype=np.float32)
    for i,row in enumerate(rows):
        try: out[i]=_interp(wl,np.asarray(row,dtype=float))
        except ValueError: pass
    return out

def holdout_mask(dates,lat,lon,target=.20):
    """Hold out the most recent acquisition dates (about `target` of the samples), or 5-degree tiles when dates are unknown."""
    if dates is not None and len(np.unique(dates))>=3:
        uniq,counts=np.unique(dates,return_counts=True); held=[]; total=0
        for day,count in zip(uniq[::-1],counts[::-1]):
            held.append(str(day)); total+=count
            if total>=target*len(dates): break
        return np.isin(dates,held),{'strategy':'most recent acquisition dates held out whole','held_out':held}
    tile=np.floor((lat+90)/5)*1000+np.floor((lon+180)/5); tiles=np.unique(tile[np.isfinite(tile)]); held=tiles[::5]
    return np.isin(tile,held),{'strategy':'every fifth 5-degree tile held out','held_out':int(len(held))}

def main(path='data/processed/pace_training.npz',min_label_conf=.65):
    rows,wl,chlor,nflh,lat,lon,dates=load_dataset(path)
    anchored=to_anchors(rows,wl)
    keep=[]
    for i,row in enumerate(anchored):
        if not np.isfinite(row).all(): continue
        try:
            _,_,qc=preprocess_spectrum(ANCHORS,row)
            if qc['valid']: keep.append(i)
        except Exception: pass
    keep=np.asarray(keep); X=anchored[keep]; chlor=chlor[keep]; nflh=nflh[keep]; lat=lat[keep]; lon=lon[keep]
    dates=dates[keep] if dates is not None else None
    labels,conf=silver_labels(X,chlor,nflh); use=conf>=min_label_conf
    # Normal reference pool: low-phytoplankton, high-quality spectra not assigned to a cause.
    # L2 AOP granules carry nFLH but no chlor_a, so fluorescence stands in when chlorophyll is absent.
    has_chlor=np.isfinite(chlor)&(chlor>0); has_nflh=np.isfinite(nflh)&(nflh>0)
    proxy_name,proxy,has_proxy=('chlor_a',chlor,has_chlor) if has_chlor.any() else ('nflh',nflh,has_nflh)
    if not has_proxy.any(): raise SystemExit('Dataset has neither chlor_a nor nFLH, so there is no way to pick a normal-ocean reference pool')
    normal_candidate=has_proxy&(proxy<=np.nanquantile(proxy[has_proxy],.45))&~use
    context=np.column_stack([lat,lon,chlor,nflh,np.full(len(X),np.nan),np.full(len(X),np.nan)])
    held,holdout=holdout_mask(dates,lat,lon)

    rng=np.random.default_rng(42)
    normal_idx=np.flatnonzero(normal_candidate&~held)
    if len(normal_idx)>20000: normal_idx=rng.choice(normal_idx,20000,replace=False)
    cause_idx=np.flatnonzero(use&~held)
    train_idx=np.concatenate([normal_idx,cause_idx])
    train_labels=np.concatenate([np.full(len(normal_idx),NORMAL_LABEL,dtype=object),labels[cause_idx]])
    model=OceanNovaModel().fit(X[train_idx],train_labels,context=context[train_idx],seed=42)

    held_idx=np.flatnonzero(held); holdout['samples']=int(len(held_idx))
    if len(held_idx):
        anomaly,_,probs=model.score_features(model._features(X[held_idx]),context[held_idx]); flagged=anomaly>=model.anomaly_threshold
        is_normal=normal_candidate[held_idx]; is_cause=use[held_idx]
        holdout['overall_flag_rate']=float(flagged.mean())
        # "unlabelled" is the ordinary ocean that is neither in the normal pool nor given a silver label.
        for name,mask in (('normal_reference',is_normal),('silver_label',is_cause),('unlabelled',~is_normal&~is_cause)):
            holdout[f'{name}_samples']=int(mask.sum())
            if mask.any(): holdout.update({f'{name}_flag_rate':float(flagged[mask].mean()),f'{name}_median_anomaly_score':float(np.median(anomaly[mask]))})
        known=is_cause&np.isin(labels[held_idx],model.label_encoder.classes_) if probs is not None else np.zeros(len(held_idx),dtype=bool)
        if known.any():
            truth=model.label_encoder.transform(labels[held_idx][known]); pred=np.argmax(probs[known],axis=1)
            holdout.update({'cause_balanced_accuracy':float(balanced_accuracy_score(truth,pred)),'cause_macro_f1':float(f1_score(truth,pred,average='macro')),'cause_class_counts':{str(c):int(np.sum(labels[held_idx][known]==c)) for c in model.label_encoder.classes_}})
        # The batch scorer has to agree with the service's own per-spectrum path.
        check=np.arange(min(25,len(held_idx)))
        served=[model.predict(ANCHORS,X[i],lat[i],lon[i],None,chlor[i],nflh[i],None)['anomaly_score'] for i in held_idx[check]]
        holdout['batch_vs_service_max_score_gap']=float(np.max(np.abs(np.asarray(served)-anomaly[check])))

    model.metrics.update({'training_mode':'real_pace_normal_manifold + weakly_supervised_silver_labels','dataset':Path(path).name,'real_pace_samples':int(len(rows)),'qc_passed':int(len(keep)),'normal_reference_samples':int(len(normal_idx)),'normal_reference_rule':f'{proxy_name} at or below its 45th percentile and no silver label','silver_label_samples':int(len(cause_idx)),'silver_label_class_counts':{c:int(np.sum(labels[cause_idx]==c)) for c in CLASSES},'holdout':holdout,'label_note':'Silver labels from PACE chlor_a/nflh quantiles and spectral proxies; not ground truth. The classifier also sees chlor_a/nFLH as inputs, so cause accuracy measures agreement with the labelling rule, not field accuracy.'})
    model.save(ARTIFACT); Path('data/processed/pace_training_report.json').write_text(json.dumps(model.metrics,indent=2)); print(json.dumps(model.metrics,indent=2))

if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--input',default='data/processed/pace_training.npz'); ap.add_argument('--min-label-conf',type=float,default=.65); a=ap.parse_args(); main(a.input,a.min_label_conf)
