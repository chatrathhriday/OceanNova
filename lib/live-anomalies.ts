import { z } from "zod";
import { generateGeminiJson } from "@/lib/gemini";
import { fetchPaceGranules, fetchNdbcLatestObs, nearestBuoy, granulesNearRegion } from "@/lib/live-sources";
import { BASELINE_REGION_PERCENTS, REGION_COORDS, METRIC_META, type RegionPercents } from "@/lib/region-metrics";

const TTL_MS = 15 * 60 * 1000;

// Approximate climatological September sea-surface temperature (°C) for each region —
// the "expected" baseline Gemini compares the live NDBC reading against to size a real
// SST anomaly, rather than inventing a number from nothing.
const REGION_SEASONAL_SST_C: Record<string, number> = {
  "North Pacific Gyre": 19.5,
  "Bay of Bengal": 29.0,
  "Drake Passage": 4.0,
  "Great Barrier Reef": 26.5,
  "Arabian Sea": 28.5,
  "Norwegian Sea": 10.5,
  "Gulf of Mexico": 29.5,
  "Mariana Trench Rim": 28.0,
};

type RegionGrounding = {
  region: string;
  nearestBuoyStation: string | null;
  nearestBuoyDistanceKm: number | null;
  liveWaterTempC: number | null;
  seasonalBaselineC: number;
  sstDeviationC: number | null;
  recentPaceGranules: number;
  paceLive: boolean;
  noaaLive: boolean;
};

function groundingSentence(g: RegionGrounding) {
  const tempPart =
    g.liveWaterTempC != null
      ? `live NDBC buoy ${g.nearestBuoyStation} (${g.nearestBuoyDistanceKm?.toFixed(0)} km away) reads ${g.liveWaterTempC}°C vs a ${g.seasonalBaselineC}°C seasonal baseline (${g.sstDeviationC! >= 0 ? "+" : ""}${g.sstDeviationC}°C)`
      : "no live buoy reading available near this region right now";
  const paceP = `${g.recentPaceGranules} recent NASA PACE OCI ocean-color pass(es) over this region`;
  return `${g.region}: ${tempPart}; ${paceP}.`;
}

type CacheShape = {
  at: number;
  percents: RegionPercents;
  liveComputed: boolean;
  groundingByRegion: Record<string, string>;
  paceLive: boolean;
  noaaLive: boolean;
};

let cache: CacheShape | null = null;
let inflight: Promise<CacheShape> | null = null;

// Live Gemini scoring only makes sense for the handful of regions with a real seasonal SST
// baseline to compare against — the rest of the (much larger) region list added for map
// richness has no such grounding, so keeping the prompt scoped to these avoids ballooning the
// request/response size across 40+ regions for no grounding benefit.
const LIVE_GROUNDED_REGIONS = new Set(Object.keys(REGION_SEASONAL_SST_C));

async function computeGrounding(): Promise<{ grounding: RegionGrounding[]; paceLive: boolean; noaaLive: boolean }> {
  const [pace, buoys] = await Promise.all([fetchPaceGranules(), fetchNdbcLatestObs()]);
  const groundedCoords = Object.entries(REGION_COORDS).filter(([region]) => LIVE_GROUNDED_REGIONS.has(region));
  const grounding: RegionGrounding[] = groundedCoords.map(([region, coord]) => {
    const nearest = nearestBuoy(coord, buoys.data);
    const seasonalBaselineC = REGION_SEASONAL_SST_C[region] ?? 20;
    const liveWaterTempC = nearest && nearest.distanceKm < 1200 ? nearest.buoy.waterTempC : null;
    const nearby = granulesNearRegion(pace.data, coord);
    return {
      region,
      nearestBuoyStation: nearest?.buoy.station ?? null,
      nearestBuoyDistanceKm: nearest?.distanceKm ?? null,
      liveWaterTempC,
      seasonalBaselineC,
      sstDeviationC: liveWaterTempC != null ? Number((liveWaterTempC - seasonalBaselineC).toFixed(1)) : null,
      recentPaceGranules: nearby.length,
      paceLive: pace.live,
      noaaLive: buoys.live,
    };
  });
  return { grounding, paceLive: pace.live, noaaLive: buoys.live };
}

function buildPrompt(grounding: RegionGrounding[]) {
  const dataLines = grounding.map(groundingSentence).join("\n");
  const metricList = METRIC_META.map((m) => `${m.key} (${m.label}, unit basis: ${m.unit})`).join(", ");
  const baselineLines = Object.entries(BASELINE_REGION_PERCENTS)
    .map(([region, values]) => `${region}: [${values.join(", ")}]`)
    .join("\n");

  return `You are the anomaly-severity engine behind OCEANNOVA, a live ocean-monitoring dashboard. You are given REAL, LIVE readings just pulled from NOAA NDBC buoys and NASA PACE OCI ocean-color satellite passes for 8 ocean regions. Convert this real telemetry into an anomaly severity score (0-100) for each of the 8 tracked metrics, in every region.

Metrics to score for every region: ${metricList}.

Live telemetry just fetched from NOAA and NASA PACE (ground every score in this — do not ignore it):
${dataLines}

Scoring rules:
- "sst" severity must be driven directly by the reported live SST deviation from seasonal baseline for that region (larger positive or negative deviation = higher severity; near-zero deviation = low severity, roughly 10-30).
- "chlorophyll" and "hab" severity should scale with recent PACE ocean-color pass coverage as a bloom-monitoring-intensity proxy — more recent passes over a region that also has an elevated SST anomaly suggests higher bloom risk.
- For metrics without a direct live sensor in this feed (salinity, current, ph, oxygen, pressure), infer a plausible severity by reasoning from the live SST anomaly, regional climatology, and ENSO-relevant patterns for that specific region — keep these grounded and regionally distinct, not arbitrary.
- Prior reference severities (last cycle, for continuity — drift from these gradually, do not jump wildly unless the live SST deviation justifies it):
${baselineLines}
- Every region's scores should shift slightly from the prior reference to reflect the new live readings above, and at least one metric across the 8 regions should be a genuine 90+ critical reading.
- Output integers 0-100.

Return one entry per region (all 8 regions must be present, using the exact region names above), each with a percent for all 8 metric keys, plus a one-sentence rationale grounded in the live numbers you were given.`;
}

const ResponseSchema = z.object({
  regions: z
    .array(
      z.object({
        region: z.string(),
        metrics: z.array(z.object({ key: z.string(), percent: z.number() })),
        rationale: z.string(),
      })
    )
    .min(1),
});

async function computeLiveRegionPercents(): Promise<CacheShape> {
  const { grounding, paceLive, noaaLive } = await computeGrounding();
  const groundingByRegion = Object.fromEntries(grounding.map((g) => [g.region, groundingSentence(g)]));

  // Live telemetry with zero real signal anywhere isn't worth spending a model call on —
  // fall straight back to the reference table but still surface the grounding text.
  const hasAnyLiveSignal = grounding.some((g) => g.liveWaterTempC != null) || paceLive;
  if (!hasAnyLiveSignal) {
    return { at: Date.now(), percents: BASELINE_REGION_PERCENTS, liveComputed: false, groundingByRegion, paceLive, noaaLive };
  }

  try {
    const output = await generateGeminiJson(buildPrompt(grounding), ResponseSchema);

    const percents: RegionPercents = {};
    for (const regionKey of Object.keys(REGION_COORDS)) {
      const fallback = BASELINE_REGION_PERCENTS[regionKey];
      // Regions outside the live buoy-grounded set never went into the prompt above — keep
      // them on the static reference table instead of matching against Gemini's output.
      if (!LIVE_GROUNDED_REGIONS.has(regionKey)) {
        percents[regionKey] = fallback;
        continue;
      }
      const match = output.regions.find((r) => r.region.trim().toLowerCase() === regionKey.toLowerCase());
      percents[regionKey] = METRIC_META.map((meta, i) => {
        const found = match?.metrics.find((m) => m.key === meta.key);
        if (found && Number.isFinite(found.percent)) return Math.max(0, Math.min(100, Math.round(found.percent)));
        return fallback[i];
      });
    }

    return { at: Date.now(), percents, liveComputed: true, groundingByRegion, paceLive, noaaLive };
  } catch (error) {
    console.error("[v0] Gemini live-anomaly computation failed, using reference table:", error);
    return { at: Date.now(), percents: BASELINE_REGION_PERCENTS, liveComputed: false, groundingByRegion, paceLive, noaaLive };
  }
}

async function getCache(): Promise<CacheShape> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache;
  if (inflight) return inflight;
  inflight = computeLiveRegionPercents()
    .then((result) => {
      cache = result;
      return result;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export async function getLiveRegionPercents() {
  const c = await getCache();
  return {
    percents: c.percents,
    liveComputed: c.liveComputed,
    updatedAt: new Date(c.at).toISOString(),
    paceLive: c.paceLive,
    noaaLive: c.noaaLive,
  };
}

export async function getRegionGrounding(region: string): Promise<string | null> {
  const c = await getCache();
  return c.groundingByRegion[region] ?? null;
}
