import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const PointSchema = z.object({
  id: z.string(), latitude: z.number(), longitude: z.number(), anomaly_score: z.number(), confidence: z.number(),
  severity: z.string(), cause: z.string(), cause_probabilities: z.record(z.string(), z.number()).optional(),
  detector_agreement: z.number().optional(), quality_score: z.number().optional(), noaa_corroboration: z.number().optional(),
  nflh: z.number().nullable().optional(), avw: z.number().nullable().optional(), aot_865: z.number().nullable().optional(),
  angstrom: z.number().nullable().optional(), noaa: z.record(z.string(), z.unknown()).optional(),
  spectral_evidence: z.array(z.record(z.string(), z.unknown())).optional(), source: z.string(),
});

const SnapshotSchema = z.object({
  live: z.boolean(), fallback: z.enum(["cached", "simulated"]).optional(), fallback_reason: z.string().optional(), updated_at: z.string().optional(), model_version: z.string().optional(),
  pace_granules: z.number().optional(), candidate_pixels: z.number().optional(), anomaly_pixels: z.number().optional(),
  points: z.array(PointSchema), provenance: z.record(z.string(), z.string()).optional(),
  // Forecast zones built by ml_service/forecast.py; passed through as produced.
  observed_at: z.string().optional(), forecast: z.record(z.string(), z.unknown()).optional(),
});

function serviceUrl(request: Request) {
  const configured = process.env.ML_SERVICE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  // The FastAPI app is deployed as the standard Vercel catch-all function
  // under /api, so preview and production use the same-origin route.
  return new URL("/api", request.url).toString().replace(/\/$/, "");
}

export async function GET(request: Request) {
  const base = serviceUrl(request);
  if (!base) return NextResponse.json({ live: false, status: "PACE_AUTH_REQUIRED", points: [] });
  try {
    const headers = {
      ...(process.env.EARTHDATA_TOKEN ? { "x-earthdata-token": process.env.EARTHDATA_TOKEN } : {}),
      ...(process.env.EARTHDATA_USERNAME ? { "x-earthdata-username": process.env.EARTHDATA_USERNAME } : {}),
      ...(process.env.EARTHDATA_PASSWORD ? { "x-earthdata-password": process.env.EARTHDATA_PASSWORD } : {}),
      ...(process.env.NOAA_API_TOKEN ? { "x-noaa-api-token": process.env.NOAA_API_TOKEN } : {}),
    };
    let response = await fetch(`${base}/real/forecast`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
      headers,
    });
    if (response.status === 404) {
      response = await fetch(`${base}/real/anomalies`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
        headers,
      });
    }
    const parsed = SnapshotSchema.safeParse(await response.json());
    if (!response.ok || !parsed.success) {
      return NextResponse.json({ live: false, status: "REAL_FEED_UNAVAILABLE", points: [] });
    }
    if (!parsed.data.live && !parsed.data.fallback) {
      return NextResponse.json({ live: false, status: "REAL_FEED_UNAVAILABLE", points: [] });
    }
    const points = parsed.data.points.filter((point) => point.latitude >= -90 && point.latitude <= 90 && point.longitude >= -180 && point.longitude <= 180);
    const isFallback = Boolean(parsed.data.fallback);
    return NextResponse.json({
      ...parsed.data,
      source: isFallback ? `OCEANNOVA ${parsed.data.fallback} fallback` : "NASA PACE OCI L2 AOP + NOAA NDBC",
      status: isFallback ? `FALLBACK_${parsed.data.fallback?.toUpperCase()}` : "REAL_EVIDENCE_FORECAST",
      // Observed pixels only. The forecast itself is `forecast.zones`, carried in parsed.data.
      points,
    });
  } catch {
    return NextResponse.json({ live: false, status: "REAL_FEED_UNAVAILABLE", points: [] });
  }
}
