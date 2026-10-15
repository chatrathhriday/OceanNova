"""Engineering benchmark: normal-vs-perturbed novelty + classifier holdout.
Synthetic only; never present as ocean validation."""
from __future__ import annotations
import numpy as np
from sklearn.metrics import roc_auc_score, average_precision_score
from .model import OceanNovaModel, NORMAL_LABEL
from .synthetic import generate_training_set
from .features import ANCHORS

def main():
    X,y,C=generate_training_set(700,seed=11,return_context=True)
    normal=X[y==NORMAL_LABEL]; nc=C[y==NORMAL_LABEL]
    rng=np.random.default_rng(123); base=X[y=="mixed"]
    idx=rng.choice(len(base),size=min(700,len(base)),replace=False); test=base[idx].copy(); truth=np.ones(len(test),dtype=int)
    for i in range(len(test)):
        center=rng.choice([443,555,665,709]); width=rng.uniform(8,45); amp=rng.uniform(.001,.004)
        test[i]+=amp*np.exp(-((ANCHORS-center)/width)**2)
    # Half controls are normal spectra, half perturbed anomalies.
    controls=normal[:len(test)]; Xtest=np.vstack([controls,test]); ytrue=np.r_[np.zeros(len(test)),np.ones(len(test))]
    context=np.vstack([nc[:len(test)],np.zeros((len(test),6))])
    m=OceanNovaModel().fit(np.vstack([normal,base[:500]]),np.r_[np.full(len(normal),NORMAL_LABEL),np.full(500,'mixed')],context=np.vstack([nc,C[y=='mixed'][:500]]),seed=11)
    out=[m.predict(ANCHORS,row) for row in Xtest]
    ens=np.array([o['anomaly_score']/100 for o in out]); ifs=np.array([o['anomaly_components']['isolation_forest']/100 for o in out])
    print({'warning':'Synthetic perturbation benchmark only; not real-world accuracy.','samples':len(Xtest),'ensemble_auroc':float(roc_auc_score(ytrue,ens)),'ensemble_auprc':float(average_precision_score(ytrue,ens)),'isolation_forest_auroc':float(roc_auc_score(ytrue,ifs)),'improvement_auroc':float(roc_auc_score(ytrue,ens)-roc_auc_score(ytrue,ifs))})
if __name__=='__main__': main()
