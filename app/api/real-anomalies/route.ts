import { headers } from "next/headers";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function configuredServiceUrl() {
  return process.env.ML_SERVICE_URL?.replace(/\/$/, "") ?? null;
}

async function serviceBaseUrl() {
  const configured = configuredServiceUrl();
  if (configured) return configured;

  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? "http";
  return host ? `${protocol}://${host}/ml` : "http://localhost:3000/ml";
}

type RealSnapshot = {
  live?: boolean;
  stale?: boolean;
  error?: string;
  status?: string;
  message?: string;
  updated_at?: string;
  model_version?: string;
  pace_granules?: number;
  candidate_pixels?: number;
  valid_coordinates?: number;
  anomaly_pixels?: number;
  map_points?: number;
  points?: Array<Record<string, unknown>>;
  provenance?: Record<string, string>;
};

export async function GET() {
  const serviceUrl = await serviceBaseUrl();

  if (!serviceUrl) {
    return NextResponse.json({
      live: false,
      status: "PACE_AUTH_REQUIRED",
      message: "Configure the server-side ML service to process NASA PACE pixels.",
      pace_granules: 0,
      candidate_pixels: 0,
      valid_coordinates: 0,
      anomaly_pixels: 0,
      map_points: 0,
      points: [],
    });
  }

  try {
    // Same server-side credential hand-off as /api/real-forecast — without it the service
    // has no Earthdata login when this route is the first one the map calls.
    const response = await fetch(`${serviceUrl}/real/anomalies`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4_000),
      headers: {
        ...(process.env.EARTHDATA_TOKEN ? { "x-earthdata-token": process.env.EARTHDATA_TOKEN } : {}),
        ...(process.env.EARTHDATA_USERNAME ? { "x-earthdata-username": process.env.EARTHDATA_USERNAME } : {}),
        ...(process.env.EARTHDATA_PASSWORD ? { "x-earthdata-password": process.env.EARTHDATA_PASSWORD } : {}),
        ...(process.env.NOAA_API_TOKEN ? { "x-noaa-api-token": process.env.NOAA_API_TOKEN } : {}),
      },
    });
    const body = (await response.json()) as RealSnapshot;
    if (!response.ok) {
      return NextResponse.json({
        live: false,
        status: "PACE_DATA_UNAVAILABLE",
        message: typeof body.error === "string" ? body.error : "The real PACE service did not return data.",
        points: [],
      }, { status: 200 });
    }
    return NextResponse.json({ ...body, live: body.live === true, source: "NASA PACE OCI + NOAA NDBC" });
  } catch {
    return NextResponse.json({
      live: false,
      status: "PACE_DATA_UNAVAILABLE",
      message: "The server-side PACE processing service is not reachable.",
      points: [],
    });
  }
}
