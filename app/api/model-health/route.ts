import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const base = process.env.ML_SERVICE_URL;
  if (!base) return NextResponse.json({ ok:false, connected:false, reason:"ML_SERVICE_URL missing" }, { status:503 });
  try {
    const r = await fetch(`${base.replace(/\/$/, "")}/health`, { cache:"no-store" });
    return NextResponse.json(await r.json(), { status:r.status });
  } catch (e) {
    return NextResponse.json({ ok:false, connected:false, reason:e instanceof Error ? e.message : "unreachable" }, { status:502 });
  }
}
