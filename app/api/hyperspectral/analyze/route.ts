import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Gateway to the real OCEANNOVA spectral model.
 * Set ML_SERVICE_URL to the deployed FastAPI service (Render/Railway/etc.).
 * The frontend never calculates scientific scores itself.
 */
export async function POST(req: Request) {
  const base = process.env.ML_SERVICE_URL;
  if (!base) {
    return NextResponse.json(
      { ok: false, error: "ML_SERVICE_URL is not configured", hint: "Deploy ml_service and set ML_SERVICE_URL." },
      { status: 503 },
    );
  }
  try {
    const body = await req.json();
    const response = await fetch(`${base.replace(/\/$/, "")}/analyze`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const text = await response.text();
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { payload = { error: text }; }
    return NextResponse.json(payload, { status: response.status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "ML service unavailable" }, { status: 502 });
  }
}
