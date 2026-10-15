from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any

class AnalyzeRequest(BaseModel):
    wavelengths_nm: List[float] = Field(min_length=16)
    rrs: List[float] = Field(min_length=16)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    sst_c: Optional[float] = None
    chlor_a: Optional[float] = None
    n_flh: Optional[float] = None
    turbidity: Optional[float] = None
    l2_flags: Optional[int] = None

class Evidence(BaseModel):
    wavelength_nm: float
    observed_rrs: float
    baseline_rrs: float
    standardized_deviation: float
    contribution: float

class CNNPredictRequest(BaseModel):
    wavelengths_nm: List[float] = Field(min_length=16)
    rrs: List[float] = Field(min_length=16)
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    sst_c: Optional[float] = None
    chlor_a: Optional[float] = None
    n_flh: Optional[float] = None
    turbidity: Optional[float] = None

class AnalysisResponse(BaseModel):
    anomaly_score: float
    anomaly_components: Dict[str, float]
    detector_weights: Dict[str, float] = {}
    is_anomaly: bool
    cause: str
    class_probabilities: Dict[str, float]
    ood_score: float
    unknown: bool
    confidence: float
    evidence: List[Evidence]
    model_version: str
    data_quality: Dict[str, Any]
    detector_disagreement: float = 0.0
    model_disagreement: float = 0.0
    classifier_entropy: float = 0.0
    nearest_training_class: str = "unknown_mixed"
    class_distance_ratio: float = 0.0
    latent_distance: float = 0.0
    provenance: Dict[str, str] = {}
    latency_ms: float = 0.0
    cache_hit: bool = False
