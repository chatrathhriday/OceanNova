from __future__ import annotations
import numpy as np
from .features import ANCHORS

CLASSES = ["normal_ocean", "bloom / phytoplankton", "sediment plume", "CDOM / terrestrial influence", "mixed", "unknown_mixed"]


def _base(n):
    wl = ANCHORS
    baseline = 0.003 + 0.004 * np.exp(-((wl - 500) / 150) ** 2) + 0.001 * np.exp(-((wl - 680) / 25) ** 2)
    return np.tile(baseline, (n, 1))


def generate_training_set(n_per_class=700, seed=42, return_context=False):
    rng = np.random.default_rng(seed)
    X, y, C = [], [], []
    wl = ANCHORS
    # Explicit normal manifold is critical: novelty detectors learn what "normal" means.
    for cls in CLASSES[:-1]:
        n = int(n_per_class * (1.25 if cls == "normal_ocean" else 1.0))
        a = _base(n)
        if cls == "normal_ocean":
            a += rng.normal(0, .00010, a.shape)
            a *= rng.lognormal(0, .06, (n, 1))
            chlor = rng.lognormal(np.log(.18), .35, n)
            nflh = rng.lognormal(np.log(.002), .35, n)
            turb = rng.lognormal(np.log(.35), .35, n)
            sst = rng.normal(25, 3, n)
        else:
            a += rng.normal(0, .00013, a.shape)
            if cls == "bloom / phytoplankton":
                a += .0022*np.exp(-((wl[None,:]-440)/35)**2) + .0028*np.exp(-((wl[None,:]-680)/18)**2)
                a -= .0011*np.exp(-((wl[None,:]-490)/45)**2)
                chlor=rng.lognormal(np.log(8),.45,n); nflh=rng.lognormal(np.log(.035),.5,n); turb=rng.lognormal(np.log(.6),.4,n); sst=rng.normal(24,3,n)
            elif cls == "sediment plume":
                a += .0028*np.exp(-((wl[None,:]-570)/160)**2)+.0009*np.exp(-((wl[None,:]-700)/90)**2)
                chlor=rng.lognormal(np.log(.8),.5,n); nflh=rng.lognormal(np.log(.004),.5,n); turb=rng.lognormal(np.log(8),.5,n); sst=rng.normal(25,3,n)
            elif cls == "CDOM / terrestrial influence":
                a += .0025*np.exp(-((wl[None,:]-390)/90)**2)
                a *= np.exp(-.0018*np.maximum(wl[None,:]-400,0))
                chlor=rng.lognormal(np.log(.7),.5,n); nflh=rng.lognormal(np.log(.004),.5,n); turb=rng.lognormal(np.log(2),.45,n); sst=rng.normal(26,3,n)
            else:
                a += .0015*np.exp(-((wl[None,:]-450)/80)**2)+.0015*np.exp(-((wl[None,:]-650)/100)**2)
                chlor=rng.lognormal(np.log(3),.6,n); nflh=rng.lognormal(np.log(.015),.6,n); turb=rng.lognormal(np.log(3),.6,n); sst=rng.normal(25,4,n)
            a *= rng.lognormal(0,.12,(n,1))
            a += rng.normal(0,.00008,(n,1))*(wl[None,:]-wl.mean())/np.ptp(wl)
        lat=rng.uniform(-60,60,n); lon=rng.uniform(-180,180,n)
        X.append(a); y.extend([cls]*n); C.append(np.column_stack([lat,lon,chlor,nflh,sst,turb]))
    X=np.vstack(X); y=np.array(y); C=np.vstack(C)
    return (X,y,C) if return_context else (X,y)
