import { NextResponse } from "next/server";
import { getLiveRegionPercents } from "@/lib/live-anomalies";
import { buildCriticalAnomaliesFromPercents, serializeAnomaly } from "@/lib/region-metrics";

/**
 * Critical ocean anomalies for the world map, computed from REAL NOAA (NDBC buoys) and
 * NASA PACE (OCI ocean-color passes) telemetry, run through Gemini to turn raw readings
 * into per-region, per-metric anomaly severities. Falls back to a static reference table
 * if the live feeds or the model are unavailable, and always says which one it served.
 *
 * Forecast zones are not produced here: they come from the ML service's real PACE
 * detections and are served with /api/real-anomalies.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const { percents, liveComputed, updatedAt, paceLive, noaaLive } = await getLiveRegionPercents();
  const anomalies = buildCriticalAnomaliesFromPercents(percents).map(serializeAnomaly);

  return NextResponse.json({
    updatedAt,
    liveComputed,
    source: liveComputed ? "live-environmental-context" : "reference-index",
    paceLive,
    noaaLive,
    anomalies,
  });
}
