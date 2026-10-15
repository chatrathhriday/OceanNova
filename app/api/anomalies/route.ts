import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { db } from "@/db";
import { anomalies } from "@/db/schema";
import { FALLBACK_ANOMALIES } from "@/lib/mock";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await db
      .select()
      .from(anomalies)
      .orderBy(desc(anomalies.detectedAt))
      .limit(24);

    if (rows.length > 0) {
      return NextResponse.json({ source: "database", data: rows });
    }
  } catch {
    // fall through to mock data so the demo always works
  }
  return NextResponse.json({ source: "simulated", data: FALLBACK_ANOMALIES });
}
