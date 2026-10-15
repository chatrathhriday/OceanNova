import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { anomalies } from "@/db/schema";

export const dynamic = "force-dynamic";

/* ── Realistic random anomaly generator ── */

const REGIONS: { name: string; lat: [number, number]; lng: [number, number] }[] = [
  { name: "North Pacific Gyre", lat: [25, 42], lng: [-170, -135] },
  { name: "Bay of Bengal", lat: [6, 20], lng: [80, 93] },
  { name: "Drake Passage", lat: [-62, -54], lng: [-75, -55] },
  { name: "Great Barrier Reef", lat: [-24, -12], lng: [143, 153] },
  { name: "Arabian Sea", lat: [10, 22], lng: [58, 70] },
  { name: "Norwegian Sea", lat: [62, 72], lng: [-5, 12] },
  { name: "Gulf of Mexico", lat: [20, 29], lng: [-96, -84] },
  { name: "Mariana Trench Rim", lat: [8, 16], lng: [138, 148] },
  { name: "Benguela Current", lat: [-35, -18], lng: [8, 18] },
  { name: "Labrador Sea", lat: [52, 60], lng: [-58, -45] },
  { name: "Coral Triangle", lat: [-8, 4], lng: [118, 138] },
  { name: "Southern Ocean", lat: [-58, -46], lng: [60, 120] },
];

const PARAMETERS: { name: string; unit: string; base: number; spread: number }[] = [
  { name: "Sea Surface Temp", unit: "°C", base: 17.5, spread: 6 },
  { name: "Salinity", unit: "PSU", base: 34.7, spread: 1.8 },
  { name: "Current Velocity", unit: "m/s", base: 0.9, spread: 0.6 },
  { name: "pH Level", unit: "pH", base: 8.06, spread: 0.18 },
  { name: "Dissolved Oxygen", unit: "mg/L", base: 6.2, spread: 1.6 },
  { name: "Chlorophyll-a", unit: "µg/L", base: 3.4, spread: 4.5 },
  { name: "Hydrostatic Pressure", unit: "MPa", base: 42, spread: 30 },
  { name: "Turbidity", unit: "NTU", base: 4.2, spread: 3.5 },
];

const TITLES: Record<string, string[]> = {
  "Sea Surface Temp": ["Thermal spike in surface layer", "Marine heatwave signature", "Cold-water intrusion detected"],
  Salinity: ["Salinity drop detected", "Haline gradient collapse", "Freshwater lens forming"],
  "Current Velocity": ["Unusual current shear", "Eddy spin-up detected", "Flow reversal event"],
  "pH Level": ["pH acidification drift", "Alkalinity surge", "Carbonate imbalance"],
  "Dissolved Oxygen": ["Dissolved O2 dip", "Hypoxic pocket forming", "Oxygen supersaturation event"],
  "Chlorophyll-a": ["Chemical plume signature", "Algal bloom ignition", "Chlorophyll crash"],
  "Hydrostatic Pressure": ["Pressure anomaly at depth", "Barometric transfer event"],
  Turbidity: ["Sediment plume detected", "Turbidity spike", "Water clarity collapse"],
};

function rnd(min: number, max: number) {
  return min + Math.random() * (max - min);
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function generateAnomaly(hoursAgoMax: number) {
  const region = pick(REGIONS);
  const param = pick(PARAMETERS);
  const deviation = Number(rnd(0.5, 4.4).toFixed(1));
  const signed = Math.random() > 0.45 ? deviation : -deviation;
  const severity =
    Math.abs(signed) >= 3 ? "high" : Math.abs(signed) >= 1.5 ? "medium" : "low";
  const jitter = (signed / 100) * param.spread * 3;
  const value = Number(
    Math.max(0.05, param.base + rnd(-param.spread * 0.2, param.spread * 0.2) + jitter).toFixed(2)
  );
  return {
    title: pick(TITLES[param.name]),
    parameter: param.name,
    severity,
    region: region.name,
    latitude: Number(rnd(region.lat[0], region.lat[1]).toFixed(2)),
    longitude: Number(rnd(region.lng[0], region.lng[1]).toFixed(2)),
    value,
    deviation: signed,
    confidence: Number(rnd(0.68, 0.99).toFixed(2)),
    detectedAt: new Date(Date.now() - rnd(0, hoursAgoMax) * 3_600_000),
  };
}

async function totalCount() {
  const rows = await db.execute(sql`SELECT count(*)::int AS c FROM anomalies`);
  return Number((rows.rows[0] as { c: number }).c);
}

/* GET → connection + stats report */
export async function GET() {
  try {
    const total = await totalCount();
    const sev = await db.execute(
      sql`SELECT severity, count(*)::int AS c FROM anomalies GROUP BY severity`
    );
    return NextResponse.json({
      ok: true,
      database: "connected",
      total,
      bySeverity: Object.fromEntries(
        (sev.rows as { severity: string; c: number }[]).map((r) => [r.severity, r.c])
      ),
    });
  } catch {
    return NextResponse.json({ ok: false, database: "unreachable" }, { status: 503 });
  }
}

/* POST → generate demo records. Body: { count?: number, reset?: boolean } */
export async function POST(req: Request) {
  try {
    let count = 40;
    let reset = false;
    try {
      const body = (await req.json()) as { count?: number; reset?: boolean };
      if (typeof body.count === "number") count = Math.max(1, Math.min(200, Math.floor(body.count)));
      if (typeof body.reset === "boolean") reset = body.reset;
    } catch {
      /* empty body → defaults */
    }

    if (reset) await db.delete(anomalies);

    const rows = Array.from({ length: count }, () => generateAnomaly(72));
    await db.insert(anomalies).values(rows);

    const total = await totalCount();
    return NextResponse.json({ ok: true, inserted: rows.length, total, reset });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "generation failed" },
      { status: 500 }
    );
  }
}
