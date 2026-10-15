from __future__ import annotations
import json
from pathlib import Path
import numpy as np
import joblib
from scipy.spatial.distance import cdist
from sklearn.covariance import LedoitWolf, EllipticEnvelope
from sklearn.decomposition import PCA
from sklearn.ensemble import (
    ExtraTreesClassifier, HistGradientBoostingClassifier, IsolationForest,
    RandomForestClassifier, StackingClassifier
)
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import balanced_accuracy_score, f1_score, roc_auc_score
from sklearn.neighbors import LocalOutlierFactor
from sklearn.neural_network import MLPClassifier, MLPRegressor
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.svm import OneClassSVM, SVC
from sklearn.calibration import CalibratedClassifierCV
from sklearn.discriminant_analysis import QuadraticDiscriminantAnalysis
from sklearn.model_selection import train_test_split

from .features import preprocess_spectrum, ANCHORS
from .synthetic import generate_training_set

MODEL_VERSION = "6.0.0-scientific-evidence-ensemble"
ARTIFACT = Path(__file__).resolve().parent / "artifacts" / "oceannova_ensemble.joblib"
NORMAL_LABEL = "normal_ocean"
UNKNOWN_LABEL = "unknown_mixed"


class OceanNovaModel:
    """Production-oriented ocean spectral intelligence model.

    Architecture:
      1. Physics-aware spectral feature engineering.
      2. PCA latent manifold + reconstruction monitoring.
      3. Novelty ensemble trained on a *normal-ocean reference manifold*.
      4. Multimodal cause classifier using spectrum + optional environmental context.
      5. Stacked/calibrated heterogeneous classifier ensemble.
      6. Class-conditional Mahalanobis + centroid OOD gate.
      7. Evidence and uncertainty decomposition for human review.

    The model never treats synthetic accuracy as real-world validation.
    """

    def __init__(self):
        self.scaler = self.pca = None
        self.context_scaler = None
        self.iforest = self.lof = self.ocsvm = self.cov = self.elliptic = None
        self.autoencoder = None
        self.normal_centroid = None
        self.normal_cov = None
        self.normal_reconstruction = None
        self.detector_thresholds = None
        self.classifiers = []
        self.class_centroids = {}
        self.class_cov = {}
        self.label_encoder = None
        self.classifier_weights = None
        self.metrics = {}
        self.context_defaults = None
        self.normal_spectrum = None
        self.normal_snv = None
        self.anomaly_threshold = 55.0

    def _features(self, X_raw, wavelengths=ANCHORS):
        rows = []
        for row in X_raw:
            rows.append(preprocess_spectrum(np.asarray(wavelengths), np.asarray(row))[0])
        return np.vstack(rows)

    def _latent(self, feats, fit=False, seed=42):
        if fit:
            self.scaler = StandardScaler().fit(feats)
            X = self.scaler.transform(feats)
            ncomp = min(24, max(4, X.shape[1] - 1), X.shape[0] - 1)
            self.pca = PCA(n_components=ncomp, whiten=True, svd_solver="full", random_state=seed).fit(X)
        return self.pca.transform(self.scaler.transform(feats))

    @staticmethod
    def _context_matrix(context, n):
        if context is None:
            return np.zeros((n, 6), dtype=float)
        c = np.asarray(context, dtype=float)
        if c.ndim != 2 or c.shape[0] != n:
            raise ValueError("context must have shape (n_samples, n_features)")
        # Expected: lat, lon, chlor_a, n_flh, sst_c, turbidity.
        if c.shape[1] < 6:
            c = np.pad(c, ((0, 0), (0, 6 - c.shape[1])), constant_values=np.nan)
        c = c[:, :6].copy()
        # Log transform positive ocean-color concentrations, retain geographic context.
        c[:, 2] = np.log1p(np.clip(c[:, 2], 0, None))
        c[:, 3] = np.log1p(np.clip(c[:, 3], 0, None))
        return c

    def _context_features(self, context, fit=False):
        c = self._context_matrix(context, len(context) if context is not None else 1)
        if fit:
            med = np.nanmedian(c, axis=0)
            med = np.where(np.isfinite(med), med, 0.0)
            self.context_defaults = med
            # Real PACE training has no SST/turbidity at all. A column the model never saw
            # must not steer inference later, so remember which ones carried data.
            self.context_observed = np.isfinite(c).any(axis=0)
            c = np.where(np.isfinite(c), c, med)
            self.context_scaler = StandardScaler().fit(c)
        else:
            med = self.context_defaults if self.context_defaults is not None else np.zeros(c.shape[1])
            observed = getattr(self, "context_observed", None)
            if observed is not None:
                c[:, ~observed] = np.nan
            c = np.where(np.isfinite(c), c, med)
        return self.context_scaler.transform(c)

    def _mahalanobis(self, Z, cov=None, centroid=None):
        cov = cov or self.cov
        centroid = self.normal_centroid if centroid is None else centroid
        d = Z - centroid
        return np.einsum("ij,jk,ik->i", d, cov.precision_, d)

    def _detector_scores(self, Z):
        scores = {
            "isolation_forest": -self.iforest.score_samples(Z),
            "local_outlier_factor": -self.lof.score_samples(Z),
            "one_class_svm": -self.ocsvm.decision_function(Z).ravel(),
            "robust_mahalanobis": self._mahalanobis(Z),
            "elliptic_envelope": -self.elliptic.decision_function(Z),
            "autoencoder_reconstruction": np.mean((self.autoencoder.predict(Z) - Z) ** 2, axis=1),
            "pca_reconstruction": self._pca_reconstruction(Z),
        }
        return scores

    def _pca_reconstruction(self, Z):
        # In whitened latent space, distance from the normal centroid captures manifold drift.
        return np.sum((Z - self.normal_centroid) ** 2, axis=1)

    @staticmethod
    def _robust_scale(value, q50, q99):
        return float(np.clip((value - q50) / (q99 - q50 + 1e-8), 0, 1))

    @staticmethod
    def _spectral_angle(a, b):
        aa = np.asarray(a); bb = np.asarray(b)
        denom = np.linalg.norm(aa) * np.linalg.norm(bb) + 1e-12
        return float(np.arccos(np.clip(np.dot(aa, bb) / denom, -1, 1)))

    def fit(self, X_raw, y, context=None, seed=42, validation_size=0.2):
        X_raw = np.asarray(X_raw)
        y = np.asarray(y).astype(str)
        feats = self._features(X_raw)
        Z = self._latent(feats, fit=True, seed=seed)
        # _context_features log-transforms chlor_a/nFLH itself; handing it an already
        # transformed matrix would fit the scaler on doubly-logged values.
        Cscaled = self._context_features(context if context is not None else np.zeros((len(X_raw), 6)), fit=True)
        multimodal = np.hstack([Z, Cscaled])

        normal_mask = y == NORMAL_LABEL
        if normal_mask.sum() < max(40, int(0.08 * len(y))):
            # If explicit normal labels are unavailable, use the most central 40% of the manifold.
            center = np.median(Z, axis=0)
            dist = np.linalg.norm(Z - center, axis=1)
            cutoff = np.quantile(dist, 0.40)
            normal_mask = dist <= cutoff
        normal_Z = Z[normal_mask]
        if len(normal_Z) < 20:
            normal_Z = Z

        # Keep a physical-space normal reference as well as the latent manifold.
        # This powers wavelength-level evidence without inventing a generic baseline.
        normal_raw = X_raw[normal_mask] if np.sum(normal_mask) >= 20 else X_raw
        normal_smooth = np.vstack([preprocess_spectrum(ANCHORS, row)[1] for row in normal_raw])
        self.normal_spectrum = np.nanmedian(normal_smooth, axis=0).astype(np.float32)
        self.normal_snv = ((self.normal_spectrum - self.normal_spectrum.mean()) / (self.normal_spectrum.std() + 1e-8)).astype(np.float32)

        # Novelty detectors are deliberately trained ONLY on the normal reference manifold.
        self.normal_centroid = normal_Z.mean(axis=0)
        self.cov = LedoitWolf().fit(normal_Z)
        self.normal_cov = self.cov
        self.iforest = IsolationForest(n_estimators=900, max_samples=min(4096, len(normal_Z)), contamination="auto", random_state=seed, n_jobs=-1).fit(normal_Z)
        self.lof = LocalOutlierFactor(n_neighbors=min(35, max(10, len(normal_Z)//20)), novelty=True, contamination="auto", n_jobs=-1).fit(normal_Z)
        self.ocsvm = OneClassSVM(kernel="rbf", gamma="scale", nu=0.025).fit(normal_Z)
        self.elliptic = EllipticEnvelope(contamination=0.025, support_fraction=0.8, random_state=seed).fit(normal_Z)
        self.autoencoder = MLPRegressor(
            hidden_layer_sizes=(192, 96, 32, 96, 192), activation="relu", solver="adam",
            alpha=2e-4, batch_size=128, learning_rate_init=1e-3, max_iter=250,
            early_stopping=True, validation_fraction=0.15, random_state=seed
        ).fit(normal_Z, normal_Z)

        normal_scores = self._detector_scores(normal_Z)
        self.detector_thresholds = {
            name: {"q50": float(np.quantile(arr, .50)), "q90": float(np.quantile(arr, .90)), "q95": float(np.quantile(arr, .95)), "q99": float(np.quantile(arr, .99))}
            for name, arr in normal_scores.items()
        }
        self.normal_reconstruction = float(np.quantile(normal_scores["autoencoder_reconstruction"], .99))
        # Calibrate the anomaly cutoff from the normal reference rather than hard-coding it.
        normal_comp = []
        for name, arr in normal_scores.items():
            t = self.detector_thresholds[name]
            normal_comp.append(np.clip((arr - t["q50"]) / (t["q99"] - t["q50"] + 1e-8), 0, 1))
        normal_ensemble = 100.0 * np.median(np.vstack(normal_comp), axis=0)
        self.anomaly_threshold = float(np.clip(np.quantile(normal_ensemble, .995) + 5.0, 45.0, 70.0))

        # Cause classifier excludes normal and unknown labels. Unknown is a decision, not a training shortcut.
        cause_mask = (~normal_mask) & (y != UNKNOWN_LABEL)
        classes = np.unique(y[cause_mask])
        self.label_encoder = LabelEncoder().fit(classes)
        if len(classes) >= 2 and cause_mask.sum() >= 40:
            yi = self.label_encoder.transform(y[cause_mask])
            Xc = multimodal[cause_mask]
            Xtr, Xte, ytr, yte = train_test_split(Xc, yi, test_size=validation_size, stratify=yi, random_state=seed)
            base = [
                ("rf", RandomForestClassifier(n_estimators=500, max_features="sqrt", min_samples_leaf=2, class_weight="balanced_subsample", n_jobs=-1, random_state=seed)),
                ("extra", ExtraTreesClassifier(n_estimators=400, max_features="sqrt", min_samples_leaf=2, class_weight="balanced", n_jobs=-1, random_state=seed+1)),
                ("hgb", HistGradientBoostingClassifier(max_iter=250, learning_rate=.03, max_leaf_nodes=31, l2_regularization=1.0, random_state=seed+2)),
                ("mlp", MLPClassifier(hidden_layer_sizes=(192, 96, 48), alpha=2e-4, early_stopping=True, max_iter=450, random_state=seed+3)),
                ("rbf_svm", SVC(C=2.5, kernel="rbf", gamma="scale", probability=True, class_weight="balanced", random_state=seed+4)),
                ("qda", make_pipeline(StandardScaler(), QuadraticDiscriminantAnalysis(reg_param=.15))),
                ("linear_calibrated", CalibratedClassifierCV(LogisticRegression(C=.7, max_iter=1500, class_weight="balanced"), cv=3, method="sigmoid")),
            ]
            self.classifiers = [m.fit(Xtr, ytr) for _, m in base]
            # Stacking adds a learned meta-decision instead of a simple arithmetic average.
            stack_estimators = [(name, m) for name, m in base[:5]]
            stack = StackingClassifier(
                estimators=stack_estimators,
                final_estimator=LogisticRegression(C=.5, max_iter=1500, class_weight="balanced"),
                stack_method="predict_proba", passthrough=True, cv=3, n_jobs=1
            ).fit(Xtr, ytr)
            self.classifiers.append(stack)

            probs = np.mean([m.predict_proba(Xte) for m in self.classifiers], axis=0)
            pred = np.argmax(probs, axis=1)
            self.class_centroids = {int(c): Xc[yi == c].mean(axis=0) for c in np.unique(yi)}
            self.class_cov = {int(c): LedoitWolf().fit(Xc[yi == c]) for c in np.unique(yi) if np.sum(yi == c) >= 12}
            self.classifier_weights = np.ones(len(self.classifiers), dtype=float) / len(self.classifiers)
            self.metrics = {
                "training_samples": int(len(y)), "normal_reference_samples": int(len(normal_Z)),
                "cause_training_samples": int(cause_mask.sum()), "pca_components": int(self.pca.n_components_),
                "validation_balanced_accuracy": float(balanced_accuracy_score(yte, pred)),
                "validation_macro_f1": float(f1_score(yte, pred, average="macro")),
                "normal_fraction": float(normal_mask.mean()),
                "classes": list(self.label_encoder.classes_),
                "detectors": list(self._detector_scores(normal_Z).keys()),
                "classifiers": [type(m).__name__ for m in self.classifiers],
                "architecture": "PACE-aware spectral QC + normal-manifold novelty ensemble + multimodal stacked classifier + class-conditional OOD + physical spectral evidence",
                "anomaly_threshold": float(self.anomaly_threshold),
                "evidence_reference": "median normal-reference spectrum",
            }
        else:
            self.classifiers = []
            self.class_centroids = {}
            self.class_cov = {}
            self.classifier_weights = np.array([])
            self.metrics = {"training_samples": int(len(y)), "normal_reference_samples": int(len(normal_Z)), "cause_training_samples": int(cause_mask.sum()), "pca_components": int(self.pca.n_components_), "validation_balanced_accuracy": None, "validation_macro_f1": None, "classes": list(classes), "detectors": list(self._detector_scores(normal_Z).keys()), "classifiers": []}
        return self

    def _predict_preprocessed(self, feats, smooth, qc, context_row):
        Z = self._latent(feats.reshape(1, -1))
        C = self._context_features(np.asarray(context_row, dtype=float).reshape(1, -1))
        M = np.hstack([Z, C])

        raw = {k: float(v[0]) for k, v in self._detector_scores(Z).items()}
        comp = {k: self._robust_scale(v, self.detector_thresholds[k]["q50"], self.detector_thresholds[k]["q99"]) for k, v in raw.items()}
        vals = np.array(list(comp.values()), dtype=float)
        detector_disagreement = float(np.std(vals))
        median_score = float(np.median(vals))
        reliability = np.exp(-4.0 * np.abs(vals - median_score))
        weights = reliability / (reliability.sum() + 1e-12)
        anomaly = 100.0 * float(np.sum(vals * weights))

        class_names = [str(x) for x in self.label_encoder.classes_] if self.label_encoder is not None else []
        if self.classifiers:
            model_probs = np.vstack([m.predict_proba(M)[0] for m in self.classifiers])
            probs = np.average(model_probs, axis=0, weights=self.classifier_weights)
            probs = np.clip(probs, 1e-8, 1); probs /= probs.sum()
            prob_dict = {name: float(p) for name, p in zip(class_names, probs)}
            top_idx = int(np.argmax(probs)); cause = class_names[top_idx]; maxp = float(probs[top_idx])
            entropy = float(-np.sum(probs * np.log(probs)) / np.log(len(probs))) if len(probs) > 1 else 0.0
            model_disagreement = float(np.mean(np.std(model_probs, axis=0)))
        else:
            prob_dict, cause, maxp, entropy, model_disagreement = {}, UNKNOWN_LABEL, 0.0, 1.0, 1.0

        class_distances = {}
        for c, centroid in self.class_centroids.items():
            name = str(self.label_encoder.inverse_transform([int(c)])[0])
            if int(c) in self.class_cov:
                d = M - centroid
                md = float(np.sqrt(np.maximum(0, d @ self.class_cov[int(c)].precision_ @ d.T)[0,0]))
            else:
                md = float(np.linalg.norm(M - centroid))
            class_distances[name] = md
        nearest_name = min(class_distances, key=class_distances.get) if class_distances else UNKNOWN_LABEL
        nearest_distance = class_distances.get(nearest_name, float("inf"))
        median_distance = float(np.median(list(class_distances.values()))) if class_distances else nearest_distance
        distance_ratio = float(nearest_distance / (median_distance + 1e-8))

        ood = float(np.clip(
            0.30 * entropy + 0.20 * model_disagreement * 3.0 +
            0.30 * min(1.0, distance_ratio / 2.0) + 0.20 * detector_disagreement, 0, 1
        ))
        if anomaly < 35 and detector_disagreement < .22:
            cause, unknown = NORMAL_LABEL, False
            confidence = float(np.clip((1.0 - anomaly / 100.0) * (1.0 - .5 * detector_disagreement), 0, 1))
        else:
            unknown = bool(ood > .48 or maxp < .55 or (anomaly >= 65 and maxp < .70))
            if unknown: cause = UNKNOWN_LABEL
            confidence = float(np.clip(maxp * (1 - ood) * (1 - .20 * detector_disagreement), 0, 1))

        # Physical-space evidence against the learned normal reference.
        baseline = np.asarray(self.normal_spectrum, dtype=float)
        observed = np.asarray(smooth, dtype=float)
        denom = np.maximum(np.abs(baseline), np.percentile(np.abs(baseline), 25) * 0.25 + 1e-8)
        deviation = (observed - baseline) / denom
        top = np.argsort(np.abs(deviation))[-10:][::-1]
        total = float(np.sum(np.abs(deviation)) + 1e-8)
        evidence = [{
            "wavelength_nm": float(ANCHORS[i]),
            "observed_rrs": float(observed[i]),
            "baseline_rrs": float(baseline[i]),
            "standardized_deviation": float(deviation[i]),
            "contribution": float(abs(deviation[i]) / total)
        } for i in top]

        return {
            "anomaly_score": round(anomaly, 2),
            "anomaly_components": {k: round(v * 100, 2) for k, v in comp.items()},
            "detector_weights": {k: round(float(w), 4) for k, w in zip(comp.keys(), weights)},
            "detector_disagreement": round(detector_disagreement, 4),
            "model_disagreement": round(model_disagreement, 4),
            "classifier_entropy": round(entropy, 4),
            "is_anomaly": bool(anomaly >= self.anomaly_threshold),
            "cause": cause,
            "class_probabilities": {k: round(v, 4) for k, v in prob_dict.items()},
            "nearest_training_class": nearest_name,
            "class_distance_ratio": round(distance_ratio, 4),
            "latent_distance": round(nearest_distance, 4),
            "ood_score": round(ood, 4),
            "unknown": unknown,
            "confidence": round(confidence, 4),
            "evidence": evidence,
            "model_version": MODEL_VERSION,
            "data_quality": qc,
            "provenance": {"spectral_input": "measured_or_uploaded", "anomaly_score": "ML_ensemble", "cause": "ML_ensemble", "explanation": "downstream_interpreter"},
        }

    def score_features(self, feats, context=None):
        """Batch form of the scoring in _predict_preprocessed.

        Returns the fused anomaly score (0-100), each detector's 0-1 component, and the
        averaged cause probabilities (None when no cause classifier was trained).
        """
        Z = self._latent(np.asarray(feats))
        components = {}
        for name, raw in self._detector_scores(Z).items():
            t = self.detector_thresholds[name]
            components[name] = np.clip((raw - t["q50"]) / (t["q99"] - t["q50"] + 1e-8), 0, 1)
        vals = np.column_stack(list(components.values()))
        reliability = np.exp(-4.0 * np.abs(vals - np.median(vals, axis=1, keepdims=True)))
        anomaly = 100.0 * np.sum(vals * reliability, axis=1) / (reliability.sum(axis=1) + 1e-12)
        probs = None
        if self.classifiers:
            C = self._context_features(context if context is not None else np.full((len(Z), 6), np.nan))
            probs = np.average([m.predict_proba(np.hstack([Z, C])) for m in self.classifiers], axis=0, weights=self.classifier_weights)
        return anomaly, components, probs

    def predict(self, wavelengths_nm, rrs, latitude=None, longitude=None, sst_c=None, chlor_a=None, n_flh=None, turbidity=None, l2_flags=None):
        started = __import__("time").perf_counter()
        feats, smooth, qc = preprocess_spectrum(np.asarray(wavelengths_nm), np.asarray(rrs), l2_flags=l2_flags)
        context = np.array([[latitude, longitude, chlor_a, n_flh, sst_c, turbidity]], dtype=float)
        out = self._predict_preprocessed(feats, smooth, qc, context[0])
        out["latency_ms"] = round((__import__("time").perf_counter() - started) * 1000, 2)
        return out

    def predict_batch(self, requests):
        """Batch inference with one preprocessing/latent pass per spectrum and shared model calls."""
        prepared = []
        for req in requests:
            feats, smooth, qc = preprocess_spectrum(np.asarray(req.wavelengths_nm), np.asarray(req.rrs), l2_flags=getattr(req, "l2_flags", None))
            context = [req.latitude, req.longitude, req.chlor_a, req.n_flh, req.sst_c, req.turbidity]
            prepared.append((feats, smooth, qc, context))
        return [self._predict_preprocessed(*row) for row in prepared]

    def save(self, path=ARTIFACT):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        joblib.dump(self, path, compress=3)
        meta = {"model_version": MODEL_VERSION, "metrics": self.metrics}
        Path(str(path) + ".json").write_text(json.dumps(meta, indent=2))

    @classmethod
    def load(cls, path=ARTIFACT):
        return joblib.load(path)


def train_and_save(seed=42):
    X, y, context = generate_training_set(n_per_class=150, seed=seed, return_context=True)
    model = OceanNovaModel().fit(X, y, context=context, seed=seed)
    model.save(ARTIFACT)
    return model
