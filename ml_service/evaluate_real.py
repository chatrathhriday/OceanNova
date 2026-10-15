"""Evaluate a saved model on a held-out real-PACE NPZ when available.

If latitude/longitude are present, evaluates by geographic tiles instead of
random pixel splits to reduce spatial leakage. If timestamp/group metadata is
available in future datasets, callers should also hold out complete dates.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path
import numpy as np
from sklearn.metrics import pairwise_distances
from .model import OceanNovaModel

def main(path='data/processed/pace_training.npz'):
    d=np.load(path,allow_pickle=True); X=d['rrs']; wl=d['wavelength']; model=OceanNovaModel.load()
    lat=d['latitude'] if 'latitude' in d else np.zeros(len(X)); lon=d['longitude'] if 'longitude' in d else np.zeros(len(X))
    tile=np.floor((lat+90)/5)*1000+np.floor((lon+180)/5)
    tiles=np.unique(tile); hold=tiles[::5]
    idx=np.isin(tile,hold)
    scores=[]
    for row in X[idx]: scores.append(model.predict(wl,row))
    report={'evaluation_samples':int(idx.sum()),'held_out_tiles':int(len(hold)),'mean_anomaly':float(np.mean([x['anomaly_score'] for x in scores])),'unknown_rate':float(np.mean([x['unknown'] for x in scores])),'mean_confidence':float(np.mean([x['confidence'] for x in scores])),'note':'Unsupervised real-PACE evaluation; anomaly score is not ground-truth accuracy.'}
    Path('data/processed/real_evaluation.json').write_text(json.dumps(report,indent=2)); print(json.dumps(report,indent=2))

if __name__=='__main__':
    ap=argparse.ArgumentParser(); ap.add_argument('--input',default='data/processed/pace_training.npz'); a=ap.parse_args(); main(a.input)
