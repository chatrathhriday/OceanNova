import numpy as np
from .model import train_and_save, MODEL_VERSION
from .features import ANCHORS

def test_model_smoke():
    model=train_and_save(seed=7)
    rrs=np.exp(-((ANCHORS-550)/170)**2)+0.02
    out=model.predict(ANCHORS,rrs)
    assert 0 <= out['anomaly_score'] <= 100
    assert out['model_version'] == MODEL_VERSION
    assert out['cause'] in (['unknown_mixed'] + list(out['class_probabilities'].keys()))
    assert len(out['evidence']) == 10
    assert len(out['anomaly_components']) == 7
    assert all('baseline_rrs' in e for e in out['evidence'])
    assert 'quality_score' in out['data_quality']
