import { feature } from "topojson-client";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon, Position } from "geojson";

// Same world-atlas topology already used by AnomalyWorldMap to draw country borders — reusing
// it here means the "is this point on land" check is tested against the exact same coastlines
// the user sees rendered, instead of a separate, potentially mismatched dataset.
const GEO_URL = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

type LandFeature = {
  feature: Feature<Polygon | MultiPolygon>;
  bbox: [number, number, number, number];
};

let cachedLand: LandFeature[] | null = null;
let inflight: Promise<LandFeature[]> | null = null;

function ringBounds(rings: Position[][], into: [number, number, number, number]) {
  for (const ring of rings) {
    for (const [x, y] of ring) {
      if (x < into[0]) into[0] = x;
      if (y < into[1]) into[1] = y;
      if (x > into[2]) into[2] = x;
      if (y > into[3]) into[3] = y;
    }
  }
}

function computeBBox(geometry: Polygon | MultiPolygon): [number, number, number, number] {
  const bbox: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  if (geometry.type === "Polygon") {
    ringBounds(geometry.coordinates, bbox);
  } else {
    for (const polygon of geometry.coordinates) {
      ringBounds(polygon, bbox);
    }
  }
  return bbox;
}

/**
 * Fetches and parses the same world-atlas topology used to draw country borders on the map, so
 * forecast dots can be checked against real land geometry instead of a coarse guess. Memoized
 * for the lifetime of the process/tab since the topology never changes at runtime. Each land
 * feature's bounding box is precomputed once here so later point checks can cheaply skip
 * countries whose bbox can't possibly contain the point, instead of running a full polygon
 * ray-cast against every country for every candidate point.
 */
export async function loadLandFeatures(): Promise<LandFeature[]> {
  if (cachedLand) return cachedLand;
  if (inflight) return inflight;

  inflight = fetch(GEO_URL)
    .then((res) => res.json())
    .then((topology: any) => {
      const objectName = Object.keys(topology.objects)[0];
      const collection = feature(topology, topology.objects[objectName]) as unknown as FeatureCollection<Geometry>;
      const polygons: LandFeature[] = [];
      for (const f of collection.features) {
        if (f.geometry?.type === "Polygon" || f.geometry?.type === "MultiPolygon") {
          const typedFeature = f as Feature<Polygon | MultiPolygon>;
          polygons.push({ feature: typedFeature, bbox: computeBBox(typedFeature.geometry) });
        }
      }
      cachedLand = polygons;
      return polygons;
    })
    .catch((error) => {
      console.error("[v0] Failed to load land mask for forecast placement:", error);
      inflight = null;
      return [];
    });

  return inflight;
}

/** True if [lon, lat] falls inside any land polygon. Bounding-box pre-filtering keeps this fast
 * enough to run for every forecast candidate on the map (only a handful of the ~180 countries
 * can possibly contain any given point, so most are skipped before the real polygon test runs). */
export function isPointOnLand(lon: number, lat: number, land: LandFeature[]): boolean {
  for (const { feature: f, bbox } of land) {
    if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
    try {
      if (booleanPointInPolygon([lon, lat], f)) return true;
    } catch {
      /* malformed ring in the source topology — skip rather than crash */
    }
  }
  return false;
}
