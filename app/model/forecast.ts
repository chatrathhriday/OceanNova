import { REGION_COORDS } from "@/lib/region-metrics";

/**
 * Types and geometry for the forecast zones produced by ml_service/forecast.py.
 * A zone is a patch of anomalous PACE pixels, carried forward with forecast ocean currents.
 */

export type ForecastHorizon = {
  hours: number;
  valid_time: string;
  center: [number, number];
  cells: [number, number][];
  drift_km: number;
  drift_bearing_deg: number | null;
  spread_km: number;
  currents: "forecast" | "unavailable";
};

export type Tally = { verified: number; present: number };

export type ForecastZone = {
  /** Position in the service's strength ranking (1 = strongest). Set by the map; it stays
   * the same when the list is filtered or re-sorted, so a pin number always means one zone. */
  rank?: number;
  id: string;
  centroid: [number, number];
  area_km2: number;
  pixels: { valid: number; flagged: number };
  flagged_fraction: number;
  mean_score: number;
  cause: string;
  cause_mix: Record<string, number>;
  signal: "strong" | "moderate" | "weak";
  observed_at: string;
  cells: [number, number][];
  horizons: ForecastHorizon[];
  track_record: Tally | null;
};

export type Forecast = {
  available: boolean;
  reason?: string;
  issued_at?: string;
  horizons_hours?: number[];
  cell_deg?: number;
  zones: ForecastZone[];
  track_record?: Tally & { by_lead_day: Record<string, Tally>; by_cause: Record<string, Tally> };
  /** Headline result of the offline backtest on consecutive days of real passes. */
  backtest?: {
    bbox: number[];
    start: string;
    days: number;
    zones_forecast: number;
    verified: number;
    present: number;
    base_rate: { cells: number; present: number };
  } | null;
  method?: string;
  assumptions?: string[];
  sources?: Record<string, string>;
};

// Colours for the cause classes reported by the ml_service anomaly engine. Shared by the
// satellite pixels, the forecast zones and the legend so one cause is one colour everywhere.
export const CAUSE_COLORS: Record<string, string> = {
  "bloom / phytoplankton": "#a7f432",
  "sediment / resuspension": "#ffd166",
  "cdom / terrestrial influence": "#7b61ff",
  "thermal / physical context": "#ff6b6b",
  "unknown / mixed": "#4cc9f0",
};

export function causeColor(cause: string) {
  return CAUSE_COLORS[cause.toLowerCase()] ?? "#b9d0dc";
}

export function causeLabel(cause: string) {
  return cause.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Plain-language names for the cause classes, for readers who are not ocean-colour specialists.
const CAUSE_PLAIN: Record<string, string> = {
  "bloom / phytoplankton": "Algal bloom",
  "sediment / resuspension": "Sediment plume",
  "cdom / terrestrial influence": "River or land runoff",
  "thermal / physical context": "Temperature anomaly",
  "unknown / mixed": "Unclassified signal",
};

export function causePlain(cause: string) {
  return CAUSE_PLAIN[cause.toLowerCase()] ?? causeLabel(cause);
}

export const SIGNAL_LABEL: Record<ForecastZone["signal"], string> = {
  strong: "Strong signal",
  moderate: "Moderate signal",
  weak: "Weak signal",
};

const KM_PER_DEG = 111.19;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

export function compass(bearing: number | null) {
  return bearing == null ? "" : COMPASS[Math.round(bearing / 45) % 8];
}

export function formatCoord([lon, lat]: [number, number]) {
  return `${Math.abs(lat).toFixed(2)}°${lat >= 0 ? "N" : "S"}, ${Math.abs(lon).toFixed(2)}°${lon >= 0 ? "E" : "W"}`;
}

function distanceKm(a: [number, number], b: [number, number]) {
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLon = (b[0] - a[0]) * rad;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(s));
}

/** The nearest tracked sea, when the zone is close enough for that name to mean something. */
export function zoneName(zone: ForecastZone) {
  let best: { name: string; km: number } | null = null;
  for (const [name, coords] of Object.entries(REGION_COORDS)) {
    const km = distanceKm(zone.centroid, coords);
    if (!best || km < best.km) best = { name, km };
  }
  if (best && best.km <= 450) return best.name;
  // Far from every tracked sea: say where it is rather than guess what the water is called.
  const [lon, lat] = zone.centroid;
  return `Waters near ${Math.abs(lat).toFixed(1)}°${lat >= 0 ? "N" : "S"} ${Math.abs(lon).toFixed(1)}°${lon >= 0 ? "E" : "W"}`;
}

/** Radius of a circle with the forecast footprint's area — a single "search within" distance. */
export function searchRadiusKm(zone: ForecastZone, horizon: ForecastHorizon) {
  return Math.round(Math.sqrt(zone.area_km2 / Math.PI) + horizon.spread_km);
}

type Ring = [number, number][];

/** Grid cells (as iy * nx + ix on a `step`-degree grid) covered by the given cell centres,
 * each grown by `growKm` on every side. */
function rasterize(centers: [number, number][], cellDeg: number, growKm: number, step: number) {
  const nx = Math.round(360 / step);
  const keys = new Set<number>();
  for (const [lon, lat] of centers) {
    const halfLat = cellDeg / 2 + growKm / KM_PER_DEG;
    const halfLon = cellDeg / 2 + growKm / (KM_PER_DEG * Math.max(Math.cos((lat * Math.PI) / 180), 0.05));
    // A cell belongs when its centre falls inside the grown square.
    const y0 = Math.ceil((lat - halfLat + 90) / step - 0.5);
    const y1 = Math.floor((lat + halfLat + 90) / step - 0.5);
    const x0 = Math.ceil((lon - halfLon + 180) / step - 0.5);
    const x1 = Math.floor((lon + halfLon + 180) / step - 0.5);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) keys.add(y * nx + (((x % nx) + nx) % nx));
    }
  }
  return keys;
}

/** Outline rings of a set of grid cells: outer boundaries wound clockwise, holes anticlockwise,
 * which is the winding d3-geo expects. */
function unionRings(keys: Set<number>, step: number): Ring[] {
  const nx = Math.round(360 / step);
  const vertex = (x: number, y: number) => y * (nx + 1) + x;
  const next = new Map<number, number[]>();
  const add = (from: number, to: number) => {
    const list = next.get(from);
    if (list) list.push(to);
    else next.set(from, [to]);
  };
  for (const key of keys) {
    const y = Math.floor(key / nx);
    const x = key % nx;
    if (!keys.has(key - 1) || x === 0) add(vertex(x, y), vertex(x, y + 1));
    if (!keys.has(key + nx)) add(vertex(x, y + 1), vertex(x + 1, y + 1));
    if (!keys.has(key + 1) || x === nx - 1) add(vertex(x + 1, y + 1), vertex(x + 1, y));
    if (!keys.has(key - nx)) add(vertex(x + 1, y), vertex(x, y));
  }
  const rings: Ring[] = [];
  for (const [start, ends] of next) {
    while (ends.length > 0) {
      const ring: Ring = [];
      let at = start;
      for (;;) {
        ring.push([(at % (nx + 1)) * step - 180, Math.floor(at / (nx + 1)) * step - 90]);
        const out = next.get(at);
        if (!out || out.length === 0) break;
        at = out.pop() as number;
        if (at === start) break;
      }
      ring.push(ring[0]);
      if (ring.length >= 5) rings.push(ring);
    }
  }
  return rings;
}

function ringsToPolygon(rings: Ring[]) {
  return { type: "Polygon" as const, coordinates: rings };
}

/** Footprint of the patch as PACE saw it. */
export function detectedShape(zone: ForecastZone, cellDeg: number) {
  return ringsToPolygon(unionRings(rasterize(zone.cells, cellDeg, 0, cellDeg / 2), cellDeg / 2));
}

/** Footprint at a horizon: the drifted cells, widened by the position uncertainty. */
export function forecastShape(horizon: ForecastHorizon, cellDeg: number) {
  const step = cellDeg / 4;
  return ringsToPolygon(unionRings(rasterize(horizon.cells, cellDeg, horizon.spread_km, step), step));
}

function signedArea(ring: Ring) {
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  return sum / 2;
}

/** Forecast zones as GeoJSON for GIS tools. Rings follow RFC 7946 (anticlockwise exteriors);
 * small interior gaps are filled, so a footprint is never smaller than the one on the map. */
export function toGeoJSON(forecast: Forecast) {
  const cellDeg = forecast.cell_deg ?? 0.5;
  const features = forecast.zones.flatMap((zone, index) =>
    zone.horizons.map((horizon) => ({
      type: "Feature" as const,
      properties: {
        zone: index + 1,
        zone_id: zone.id,
        area: zoneName(zone),
        cause: zone.cause,
        signal: zone.signal,
        observed_at: zone.observed_at,
        hours_ahead: horizon.hours,
        valid_time: horizon.valid_time,
        center_lon: horizon.center[0],
        center_lat: horizon.center[1],
        drift_km: horizon.drift_km,
        position_uncertainty_km: horizon.spread_km,
        flagged_pixels: zone.pixels.flagged,
        valid_pixels: zone.pixels.valid,
      },
      geometry: {
        type: "MultiPolygon" as const,
        coordinates: forecastShape(horizon, cellDeg)
          .coordinates.filter((ring) => signedArea(ring) < 0)
          .map((ring) => [[...ring].reverse()]),
      },
    })),
  );
  return { type: "FeatureCollection" as const, features };
}

export function toCSV(forecast: Forecast) {
  const header = "zone,area,cause,signal,observed_at,hours_ahead,valid_time,center_lat,center_lon,search_radius_km,drift_km,drift_direction,flagged_pixels,valid_pixels";
  const rows = forecast.zones.flatMap((zone, index) =>
    zone.horizons.map((horizon) =>
      [
        index + 1,
        `"${zoneName(zone)}"`,
        `"${zone.cause}"`,
        zone.signal,
        zone.observed_at,
        horizon.hours,
        horizon.valid_time,
        horizon.center[1],
        horizon.center[0],
        searchRadiusKm(zone, horizon),
        horizon.drift_km,
        compass(horizon.drift_bearing_deg),
        zone.pixels.flagged,
        zone.pixels.valid,
      ].join(","),
    ),
  );
  return [header, ...rows].join("\n");
}
