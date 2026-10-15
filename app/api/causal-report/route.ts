import { NextResponse } from "next/server";
import { z } from "zod";
import { generateGeminiJson, GEMINI_MODEL } from "@/lib/gemini";
import { getRegionGrounding } from "@/lib/live-anomalies";
import { buildFallbackCausalReport } from "@/lib/fallback-causal-report";

export const dynamic = "force-dynamic";


const ReportSchema = z.object({
  headline: z.string().describe("A punchy 4-8 word causal headline, no punctuation at the end."),
  primaryCause: z.string().describe("3-5 sentences on the single most likely driver of this anomaly, including the physical mechanism."),
  contributingFactors: z
    .array(z.string())
    .min(4)
    .max(7)
    .describe("Short (max ~14 words each) secondary factors amplifying the anomaly."),
  historicalContext: z.string().describe("3-4 sentences on realistic past precedent, seasonal pattern, and how this episode compares in magnitude for this region/category."),
  outlook: z.string().describe("3-4 sentences projecting how this anomaly is likely to evolve over the next 1-3 weeks and what would resolve or worsen it."),
  confidence: z.enum(["low", "moderate", "high"]),
  monitoringRecommendation: z.string().describe("2-3 sentences on what to watch for next, including a concrete threshold or indicator."),
});

export type CausalReport = z.infer<typeof ReportSchema>;

// In-memory cache so the same (region, metric) pair doesn't re-prompt the model
// on every hover/click within a server lifetime. Only successful, live Gemini
// reports are cached — offline fallback reports are never cached so a retry
// picks up live Gemini the moment the Gateway is available again.
const cache = new Map<string, CausalReport>();

type Body = {
  region: string;
  metricKey: string;
  label: string;
  percent: number;
  unit: string;
  occurrences: number;
  trend: "rising" | "falling" | "stable";
  weekOverWeek: number;
  windowDays: number;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { region, metricKey, label, percent, unit, occurrences, trend, weekOverWeek, windowDays } = body;
  if (!region || !metricKey || !label || typeof percent !== "number") {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const cacheKey = `${region}:${metricKey}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return NextResponse.json({ report: cached, cached: true, grounded: true, source: "gemini" });
  }

  const grounding = await getRegionGrounding(region).catch(() => null);

  const prompt = `You are an oceanographic anomaly analyst writing an internal causal-analysis brief for a marine monitoring dashboard.

Anomaly detected:
- Region: ${region}
- Category: ${label} (unit basis: ${unit})
- Current severity: ${percent}% (crossed the 90% critical threshold)
- Detections: ${occurrences} independent readings over the past ${windowDays} days
- Trend: ${trend}, ${weekOverWeek > 0 ? "+" : ""}${weekOverWeek}% week-over-week
${grounding ? `- Live grounding data just pulled from NOAA/NASA PACE for this region: ${grounding}` : ""}

Write a detailed, structured probable-causes brief explaining the most plausible oceanographic and climatic drivers behind why this specific category became critical in this specific region, grounded in realistic past conditions, known regional patterns (e.g. seasonal upwelling, El Niño/La Niña phase, riverine discharge, shipping/agricultural runoff, marine heatwave persistence, ENSO-linked current shifts, glacial melt, or industrial activity, as relevant), and the live grounding data if provided above. Also project a short-term outlook: how the anomaly is likely to evolve over the next 1-3 weeks, and what physical conditions would resolve it versus make it worse. Be specific to the region and category rather than generic — name plausible real mechanisms, not vague hand-waving. No markdown, no bullet characters inside any field.`;

  try {
    const output = await generateGeminiJson(prompt, ReportSchema);
    cache.set(cacheKey, output);
    return NextResponse.json({ report: output, cached: false, model: GEMINI_MODEL, grounded: Boolean(grounding), source: "gemini" });
  } catch (error) {
    console.error("[v0] causal report generation failed; using offline fallback:", error);

    // Never dead-end the report tab: fall back to a deterministic, region/category-specific
    // brief grounded in the same live NOAA/PACE telemetry sentence Gemini would have used.
    const fallbackReport = buildFallbackCausalReport({
      region,
      metricKey,
      label,
      percent,
      trend,
      weekOverWeek,
      occurrences,
      windowDays,
      grounding,
    });

    return NextResponse.json({
      report: fallbackReport,
      cached: false,
      grounded: Boolean(grounding),
      source: "offline",
    });
  }
}
