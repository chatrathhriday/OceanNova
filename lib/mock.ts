export type AnomalyRecord = {
  id: number;
  title: string;
  parameter: string;
  severity: "low" | "medium" | "high";
  region: string;
  latitude: number;
  longitude: number;
  value: number;
  deviation: number;
  confidence: number;
  detectedAt: string;
};

export const FALLBACK_ANOMALIES: AnomalyRecord[] = [
  {
    id: 1,
    title: "Thermal spike in surface layer",
    parameter: "Sea Surface Temp",
    severity: "high",
    region: "North Pacific Gyre",
    latitude: 35.2,
    longitude: -152.4,
    value: 24.8,
    deviation: 3.9,
    confidence: 0.97,
    detectedAt: "2026-09-07T03:42:00.000Z",
  },
  {
    id: 2,
    title: "Salinity drop detected",
    parameter: "Salinity",
    severity: "medium",
    region: "Bay of Bengal",
    latitude: 14.6,
    longitude: 88.3,
    value: 31.2,
    deviation: -2.1,
    confidence: 0.88,
    detectedAt: "2026-09-07T07:15:00.000Z",
  },
  {
    id: 3,
    title: "Unusual current shear",
    parameter: "Current Velocity",
    severity: "high",
    region: "Drake Passage",
    latitude: -58.4,
    longitude: -62.1,
    value: 1.84,
    deviation: 2.7,
    confidence: 0.93,
    detectedAt: "2026-09-06T22:08:00.000Z",
  },
  {
    id: 4,
    title: "pH acidification drift",
    parameter: "pH Level",
    severity: "medium",
    region: "Great Barrier Reef",
    latitude: -18.2,
    longitude: 147.7,
    value: 7.89,
    deviation: -1.6,
    confidence: 0.85,
    detectedAt: "2026-09-06T14:55:00.000Z",
  },
  {
    id: 5,
    title: "Dissolved O2 dip",
    parameter: "Dissolved Oxygen",
    severity: "low",
    region: "Arabian Sea",
    latitude: 16.9,
    longitude: 63.2,
    value: 4.1,
    deviation: -0.8,
    confidence: 0.79,
    detectedAt: "2026-09-06T09:31:00.000Z",
  },
  {
    id: 6,
    title: "Deep-layer warming pulse",
    parameter: "Sea Surface Temp",
    severity: "low",
    region: "Norwegian Sea",
    latitude: 68.1,
    longitude: 2.4,
    value: 9.6,
    deviation: 0.9,
    confidence: 0.74,
    detectedAt: "2026-09-05T19:20:00.000Z",
  },
  {
    id: 7,
    title: "Chemical plume signature",
    parameter: "Chlorophyll-a",
    severity: "high",
    region: " Gulf of Mexico",
    latitude: 27.3,
    longitude: -90.5,
    value: 12.4,
    deviation: 3.4,
    confidence: 0.91,
    detectedAt: "2026-09-05T11:02:00.000Z",
  },
  {
    id: 8,
    title: "Pressure anomaly at 800m",
    parameter: "Hydrostatic Pressure",
    severity: "medium",
    region: "Mariana Trench Rim",
    latitude: 11.7,
    longitude: 142.3,
    value: 81.3,
    deviation: 1.9,
    confidence: 0.86,
    detectedAt: "2026-09-04T23:47:00.000Z",
  },
];

// Deterministic 24h temperature anomaly series (°C deviation)
export const TEMP_SERIES = [
  0.12, 0.18, 0.15, 0.22, 0.31, 0.28, 0.35, 0.52, 0.47, 0.61, 0.58, 0.74,
  0.92, 0.85, 0.79, 1.04, 1.28, 1.12, 0.98, 0.88, 0.76, 0.69, 0.58, 0.47,
];

export const HEATMAP_SEED = [
  0.1, 0.2, 0.15, 0.3, 0.42, 0.38, 0.21, 0.12, 0.18, 0.24, 0.15, 0.1,
  0.18, 0.26, 0.34, 0.48, 0.61, 0.55, 0.33, 0.2, 0.14, 0.2, 0.28, 0.22,
  0.22, 0.31, 0.45, 0.62, 0.84, 0.77, 0.52, 0.3, 0.19, 0.16, 0.24, 0.31,
  0.17, 0.28, 0.4, 0.58, 0.92, 0.88, 0.61, 0.36, 0.22, 0.12, 0.18, 0.26,
  0.12, 0.2, 0.3, 0.44, 0.68, 0.72, 0.47, 0.28, 0.17, 0.1, 0.14, 0.2,
  0.08, 0.14, 0.21, 0.3, 0.39, 0.45, 0.32, 0.2, 0.13, 0.09, 0.11, 0.16,
  0.06, 0.1, 0.15, 0.21, 0.26, 0.3, 0.22, 0.14, 0.1, 0.07, 0.08, 0.11,
];
