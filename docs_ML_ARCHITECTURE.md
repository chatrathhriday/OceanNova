# OCEANNOVA ML Architecture v5

## Design principle
The system separates **novelty detection**, **cause classification**, **uncertainty/OOD rejection**, and **natural-language explanation**. Gemini is not the scientific scoring engine.

## Pipeline
1. NASA PACE OCI L2 AOP Rrs + quality flags
2. Spectral QC and interpolation
3. Savitzky-Golay + Gaussian denoising
4. SNV normalization
5. First/second spectral derivatives
6. Continuum removal + log-ratio features
7. Standardized 24-component PCA latent manifold
8. Normal-ocean reference manifold
9. Novelty ensemble: Isolation Forest, LOF, RBF One-Class SVM, robust Mahalanobis, Elliptic Envelope, nonlinear autoencoder, latent reconstruction distance
10. Reliability-weighted detector fusion + detector disagreement uncertainty
11. Multimodal context: latitude, longitude, chlorophyll-a, nFLH, SST, turbidity (when available)
12. Cause ensemble: Random Forest, Extra Trees, HistGradientBoosting, MLP, RBF-SVM, QDA, calibrated logistic model
13. Stacking meta-classifier over heterogeneous spectral models
14. Class-conditional Mahalanobis distance + probability entropy + model disagreement
15. OOD gate → `unknown_mixed`
16. Evidence wavelengths + confidence decomposition
17. Gemini explanation layer only after model inference

## Real-data training
PACE data is used for the novelty manifold. Weak silver labels use chlorophyll-a/nFLH and spectral proxies for initial cause learning. NOAA HABSOS is a separate external validation source, not ground truth fabrication.

## Scientific guardrails
- Synthetic metrics are engineering benchmarks only.
- Real PACE evaluation must use spatial/temporal holdouts.
- Rrs quality flags are mandatory before training/inference.
- Known PACE spectral artifact regions must be handled conservatively; NASA notes residual issues around 590–610 nm and oxygen/water-vapor absorption regions.
- Unknown signatures are explicitly rejected rather than forced into a known class.

## NASA data-quality rationale
PACE/OCI L2 uses `l2_flags` for pixel-level processing quality. OCEANNOVA distinguishes fatal usability flags from warning flags so that warnings such as turbidity/chlorophyll/atmospheric warnings are not automatically discarded: they can be retained as context while unusable pixels are rejected. NASA documentation also notes known spectral artifacts and processing limitations; the pipeline therefore avoids unsupported NIR extrapolation from standard L2 AOP Rrs.
