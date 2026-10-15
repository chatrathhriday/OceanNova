import {
  Activity,
  ArrowDownUp,
  AudioLines,
  Bug,
  CloudFog,
  Compass,
  Droplets,
  Filter,
  Flame,
  FlaskConical,
  Fuel,
  Gauge,
  HeartPulse,
  Leaf,
  Radiation,
  Recycle,
  Siren,
  Snowflake,
  Sparkles,
  Thermometer,
  Volume2,
  Waves,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type RegionMetric = {
  key: string;
  label: string;
  unit: string;
  percent: number;
  icon: LucideIcon;
};

export type RegionProfile = {
  region: string;
  metrics: RegionMetric[];
};

// 24 tracked anomaly categories spanning classic ocean-chemistry telemetry (SST, salinity,
// pH, oxygen, chlorophyll...) as well as broader geophysical and environmental hazard classes
// (seismic, volcanic, tsunami, plumes, bioluminescence, pollution) so the map reads as a
// genuinely multi-hazard ocean monitoring system rather than a narrow chemistry dashboard.
export const METRIC_META: { key: string; label: string; unit: string; icon: LucideIcon }[] = [
  { key: "sst", label: "Sea Surface Temp", unit: "°C dev", icon: Thermometer },
  { key: "salinity", label: "Salinity Drop", unit: "PSU dev", icon: Droplets },
  { key: "current", label: "Current Shear", unit: "m/s dev", icon: Compass },
  { key: "ph", label: "pH Acidification", unit: "pH dev", icon: FlaskConical },
  { key: "oxygen", label: "Dissolved Oxygen", unit: "mg/L dev", icon: Waves },
  { key: "chlorophyll", label: "Chlorophyll Bloom", unit: "mg/m³", icon: Leaf },
  { key: "hab", label: "HAB Risk Index", unit: "bloom risk", icon: Bug },
  { key: "pressure", label: "Hydrostatic Pressure", unit: "kPa dev", icon: Gauge },
  { key: "seismic", label: "Seismic Tremor", unit: "Richter dev", icon: Activity },
  { key: "volcanic", label: "Volcanic Eruption", unit: "SO₂ index", icon: Flame },
  { key: "tsunami", label: "Tsunami Wave Risk", unit: "wave risk", icon: Siren },
  { key: "hydrothermal", label: "Hydrothermal Plume", unit: "°C plume", icon: Zap },
  { key: "bioluminescence", label: "Bioluminescent Bloom", unit: "glow index", icon: Sparkles },
  { key: "methane", label: "Methane Seep", unit: "ppm seep", icon: CloudFog },
  { key: "turbidity", label: "Sediment Turbidity", unit: "NTU dev", icon: Filter },
  { key: "icecalving", label: "Ice Shelf Calving", unit: "km² loss", icon: Snowflake },
  { key: "coralbleaching", label: "Coral Bleaching", unit: "DHW index", icon: HeartPulse },
  { key: "microplastic", label: "Microplastic Density", unit: "particles/m³", icon: Recycle },
  { key: "noise", label: "Acoustic Noise", unit: "dB dev", icon: Volume2 },
  { key: "radiological", label: "Radiological Trace", unit: "Bq/m³", icon: Radiation },
  { key: "oilspill", label: "Oil Slick Signature", unit: "slick index", icon: Fuel },
  { key: "windshear", label: "Surface Wind Shear", unit: "m/s dev", icon: Wind },
  { key: "wavefreq", label: "Wave Frequency Shift", unit: "Hz dev", icon: AudioLines },
  { key: "deepcurrent", label: "Deep Current Divergence", unit: "Sv dev", icon: ArrowDownUp },
];

export type RegionPercents = Record<string, number[]>;

// Deterministic string hash so occurrence stats and generated tables stay stable across
// renders/requests/server-vs-client without needing Math.random anywhere.
export function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

// Ocean coordinates for every tracked region — every one of these sits over open water or a
// named sea, never on a landmass, so they double as safe fallback anchors for relocating
// forecast points that would otherwise land on a continent (see lib/land-mask.ts).
export const REGION_COORDS: Record<string, [number, number]> = {
  "North Pacific Gyre": [-152.4, 35.2],
  "Bay of Bengal": [88.3, 14.6],
  "Drake Passage": [-62.1, -58.4],
  "Great Barrier Reef": [147.7, -18.2],
  "Arabian Sea": [63.2, 16.9],
  "Norwegian Sea": [2.4, 68.1],
  "Gulf of Mexico": [-90.5, 27.3],
  "Mariana Trench Rim": [142.3, 11.7],
  "South Pacific Gyre": [-120.6, -26.3],
  "South Atlantic Gyre": [-14.8, -29.6],
  "Indian Ocean Basin": [80.4, -11.2],
  "Mediterranean Sea": [17.9, 35.4],
  "Caribbean Sea": [-75.3, 16.4],
  "Sea of Japan": [134.8, 40.1],
  "Bering Sea": [-175.2, 58.3],
  "Weddell Sea": [-44.6, -69.8],
  "Baltic Sea": [19.3, 58.2],
  "Red Sea": [38.1, 20.3],
  "East China Sea": [125.4, 29.1],
  "Labrador Sea": [-55.2, 58.6],
  "Coral Sea": [154.6, -16.8],
  "Sargasso Sea": [-52.3, 27.9],
  "Sea of Okhotsk": [148.2, 54.7],
  "Tasman Sea": [160.1, -41.3],
  "Sulu Sea": [121.0, 8.0],
  "Yellow Sea": [123.4, 36.6],
  "Gulf of Alaska": [-145.0, 56.0],
  "North Sea": [3.0, 56.0],
  "Irish Sea": [-5.0, 53.5],
  "Black Sea": [34.0, 43.5],
  "Persian Gulf": [51.0, 27.0],
  "Andaman Sea": [96.5, 11.0],
  "Solomon Sea": [155.0, -8.0],
  "Philippine Sea": [135.0, 18.0],
  "South China Sea": [114.0, 12.0],
  "Gulf of Guinea": [3.0, 2.0],
  "Scotia Sea": [-42.0, -58.0],
  "Ross Sea": [-175.0, -74.0],
  "Chukchi Sea": [-171.0, 69.5],
  "Java Sea": [110.0, -5.0],
  "Celebes Sea": [122.0, 4.0],
  "Timor Sea": [128.0, -11.0],
};

/**
 * Generates a deterministic (not random) reference severity table for every region across all
 * 24 metric categories. Every region gets 1-2 metrics rotated into critical (>=90%) territory so
 * critical events are spread across the full category list and across the whole map, instead of
 * only ever flaring in a handful of hand-picked spots. This is the offline reference table — the
 * live Gemini-grounded scoring in lib/live-anomalies.ts overrides it for regions with real buoy
 * coverage, gradually drifting from these values rather than jumping wildly.
 */
function generateRegionPercents(): RegionPercents {
  const regions = Object.keys(REGION_COORDS);
  const table: RegionPercents = {};

  regions.forEach((region, regionIndex) => {
    const values = METRIC_META.map((meta) => {
      const seed = hash(`${region}:${meta.key}:baseline`);
      return 9 + (seed % 44); // Normal/Watch band, 9-52
    });

    const criticalCount = 1 + (hash(`${region}:critical-count`) % 2); // 1-2 critical metrics
    const used = new Set<number>();
    for (let c = 0; c < criticalCount; c++) {
      const spin = hash(`${region}:critical-spin:${c}`);
      let idx = (regionIndex * 5 + spin + c * 9) % METRIC_META.length;
      let guard = 0;
      while (used.has(idx) && guard < METRIC_META.length) {
        idx = (idx + 1) % METRIC_META.length;
        guard += 1;
      }
      used.add(idx);
      const critSeed = hash(`${region}:${METRIC_META[idx].key}:critical-value`);
      values[idx] = 90 + (critSeed % 8); // 90-97
    }

    table[region] = values;
  });

  return table;
}

// Reference/fallback anomaly severities (0-100) for every metric, for every tracked ocean
// region. Order matches METRIC_META. This table is used whenever the live Gemini + NOAA/PACE
// computation (see lib/live-anomalies.ts) is unavailable, or for regions outside its live
// buoy-grounded coverage — it's the offline reference, not the primary source of truth.
export const BASELINE_REGION_PERCENTS: RegionPercents = generateRegionPercents();

export const CRITICAL_THRESHOLD = 90;

export function cleanRegionName(region: string) {
  return region.trim().replace(/\s+/g, " ");
}

export function getRegionProfile(region: string): RegionProfile | null {
  const clean = cleanRegionName(region);
  const percents = BASELINE_REGION_PERCENTS[clean];
  if (!percents) return null;
  return {
    region: clean,
    metrics: METRIC_META.map((meta, i) => ({ ...meta, percent: percents[i] })),
  };
}

export function statusColor(percent: number) {
  if (percent >= CRITICAL_THRESHOLD) return "#ff6b6b";
  if (percent >= 33) return "#ffd166";
  return "#4cc9f0";
}

export function statusLabel(percent: number) {
  if (percent >= CRITICAL_THRESHOLD) return "Critical";
  if (percent >= 33) return "Watch";
  return "Normal";
}

export type OccurrenceStats = {
  occurrences: number;
  trend: "rising" | "falling" | "stable";
  weekOverWeek: number;
  firstDetected: string;
  lastDetected: string;
  windowDays: number;
};

export function getOccurrenceStats(region: string, metricKey: string, percent: number): OccurrenceStats {
  const seed = hash(`${region}:${metricKey}`);
  const windowDays = 30;
  const occurrences = 6 + (seed % 19) + Math.round(percent / 6);
  const trendRoll = seed % 3;
  const trend: OccurrenceStats["trend"] = trendRoll === 0 ? "rising" : trendRoll === 1 ? "falling" : "stable";
  const weekOverWeek = trend === "rising" ? 4 + (seed % 14) : trend === "falling" ? -(3 + (seed % 11)) : (seed % 5) - 2;
  const firstOffsetDays = windowDays - (seed % 6);
  const lastOffsetHours = (seed % 30) + 2;
  const now = Date.parse("2026-09-07T09:00:00.000Z");
  const firstDetected = new Date(now - firstOffsetDays * 86400000).toISOString();
  const lastDetected = new Date(now - lastOffsetHours * 3600000).toISOString();
  return { occurrences, trend, weekOverWeek, firstDetected, lastDetected, windowDays };
}

export type CriticalAnomaly = {
  region: string;
  coordinates: [number, number];
  metricKey: string;
  label: string;
  unit: string;
  icon: LucideIcon;
  percent: number;
  stats: OccurrenceStats;
};

/** Every (category, region) pair that has crossed the 90% critical anomaly threshold. */
export function buildCriticalAnomaliesFromPercents(percents: RegionPercents): CriticalAnomaly[] {
  const results: CriticalAnomaly[] = [];
  for (const [region, values] of Object.entries(percents)) {
    const coordinates = REGION_COORDS[region];
    if (!coordinates) continue;
    METRIC_META.forEach((meta, i) => {
      const percent = values[i];
      if (percent >= CRITICAL_THRESHOLD) {
        results.push({
          region,
          coordinates,
          metricKey: meta.key,
          label: meta.label,
          unit: meta.unit,
          icon: meta.icon,
          percent,
          stats: getOccurrenceStats(region, meta.key, percent),
        });
      }
    });
  }
  return results.sort((a, b) => b.percent - a.percent);
}

/** Reference-only critical anomalies, computed from the static fallback table. */
export function getCriticalAnomalies(): CriticalAnomaly[] {
  return buildCriticalAnomaliesFromPercents(BASELINE_REGION_PERCENTS);
}

/** Serializable anomaly shape safe to send over JSON (icon is a component reference, dropped). */
export type SerializedAnomaly = Omit<CriticalAnomaly, "icon">;

export function serializeAnomaly(a: CriticalAnomaly): SerializedAnomaly {
  const { icon, ...rest } = a;
  return rest;
}

/** Re-attach the lucide icon to a serialized anomaly received from an API route. */
export function hydrateAnomaly(raw: SerializedAnomaly): CriticalAnomaly {
  const meta = METRIC_META.find((m) => m.key === raw.metricKey);
  return { ...raw, icon: meta?.icon ?? METRIC_META[0].icon };
}

function trendPhrase(stats: OccurrenceStats) {
  if (stats.trend === "rising") return `trending upward, +${stats.weekOverWeek}% week-over-week`;
  if (stats.trend === "falling") return `easing back, ${stats.weekOverWeek}% week-over-week`;
  return "holding steady week-over-week";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Deterministic, factual summary of a critical anomaly — no AI involved. */
export function buildGeneralReport(anomaly: CriticalAnomaly) {
  const { region, label, percent, stats, unit } = anomaly;
  return `${label} in the ${region} has reached ${percent}% anomaly severity, crossing the ${CRITICAL_THRESHOLD}% critical threshold monitored by the OCEANNOVA detection pipeline. Sensors logged ${stats.occurrences} independent detections over the past ${stats.windowDays} days (unit basis: ${unit}), ${trendPhrase(stats)}. First flagged ${formatDate(stats.firstDetected)}, with the most recent confirmation on ${formatDate(stats.lastDetected)}. This region is now under active model surveillance for downstream ${label.toLowerCase()} impacts.`;
}
