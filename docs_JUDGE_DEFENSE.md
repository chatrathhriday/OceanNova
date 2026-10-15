# OCEANNOVA — ML Judge Defense

## What is genuinely novel in the implementation?
OCEANNOVA is not one anomaly model. It separates four decisions:
1. What is normal for the observed spectral manifold?
2. Is this spectrum novel?
3. Which known observable cause best explains it?
4. Does the model have enough evidence to make that classification?

The fourth decision is critical: the system can return `unknown_mixed` instead of forcing a class.

## Why seven anomaly detectors?
The detectors make different assumptions. Isolation Forest captures partition-based isolation; LOF captures local density; One-Class SVM models a nonlinear boundary; robust covariance measures multivariate distance; Elliptic Envelope provides a second robust boundary estimate; the autoencoder captures nonlinear reconstruction error; PCA latent distance monitors manifold drift. Agreement is useful evidence; disagreement is uncertainty.

## Why not just add algorithms for complexity?
Each detector has an independent signal and the final fusion retains disagreement. More models are not presented as proof of accuracy. The architecture is designed to fail safely when evidence conflicts.

## What is the training target?
Novelty models learn a normal-ocean reference manifold from quality-controlled PACE spectra. Cause models use weak silver labels initially. These labels are not called ground truth.

## How will real performance be validated?
Use spatial and temporal holdouts, then compare anomaly events against external NOAA HAB observations where applicable. NOAA HABSOS is an observational data source; it is not used to manufacture labels.

## What does Gemini do?
Gemini does not calculate anomaly scores. It receives the model's evidence, uncertainty and predicted cause and turns those outputs into a researcher-readable explanation.

## What happens to an unseen phenomenon?
The OOD layer combines class probability, probability entropy, class-conditional latent distance and ensemble disagreement. If evidence is insufficient, the output is `unknown_mixed` for human review.

## Scientific limitation to state openly
PACE Rrs is an optical surface/near-surface observation. It cannot directly identify subsurface causes. The system therefore describes causes as *likely observable optical signatures*, not definitive physical diagnoses.
