# OCEANNOVA ML Service v6

OCEANNOVA v6 is a PACE-aware hyperspectral anomaly intelligence backend. It is intentionally split into **scientific scoring** and **language explanation**: the ML service produces anomaly, cause, OOD, uncertainty, detector consensus, quality and wavelength-level evidence; Gemini may explain those outputs but never creates the scientific score.

## v6 changes
- Calibrated anomaly threshold derived from the normal reference manifold rather than a fixed 55.
- Physical-space spectral evidence is compared with the learned median normal spectrum.
- PACE/OCI `l2_flags` can be supplied; fatal quality flags invalidate the sample.
- Quality score and provenance are returned with every prediction.
- LRU request caching and a vectorized batch path reduce repeated/large-workload latency.
- `/ready`, `/version`, and `/diagnostics` endpoints expose model health and architecture.
- Model version is `6.0.0-scientific-evidence-ensemble`.

NASA's current PACE-OCI L2 AOP Rrs product contains 172 spectral wavelengths, approximately 346–719 nm, plus variables such as Rrs uncertainty, nFLH and L2 processing flags. OCEANNOVA uses that supported Rrs range and does not extrapolate standard L2 Rrs into the longer OCI radiance range. NASA documents the bit-packed L2 flags as quality-control metadata. These facts are reflected in the preprocessing guardrails. See the project docs for source links.

### Scientific limitation
The checked-in artifact is trained on synthetic PACE-shaped data. Its validation metrics are engineering/synthetic metrics, **not field validation or real-world accuracy**. Real PACE training/evaluation scripts remain in `train_real.py` and `evaluate_real.py` and should be run with Earthdata access before claiming real-world performance.
