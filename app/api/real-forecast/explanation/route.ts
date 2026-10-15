import { NextResponse } from "next/server";
import { z } from "zod";
import { generateGeminiJson, GEMINI_MODEL } from "@/lib/gemini";

export const dynamic = "force-dynamic";

const BodySchema = z.object({
  point: z.object({
    id: z.string(), latitude: z.number(), longitude: z.number(), anomaly_score: z.number(), confidence: z.number(), severity: z.string(), cause: z.string(),
    nflh: z.number().nullable().optional(), avw: z.number().nullable().optional(), aot_865: z.number().nullable().optional(), angstrom: z.number().nullable().optional(),
    noaa: z.record(z.string(), z.unknown()).optional(), spectral_evidence: z.array(z.record(z.string(), z.unknown())).optional(), source: z.string(),
  }),
});

const ExplanationSchema = z.object({
  headline: z.string(),
  anomaly: z.string(),
  cause: z.string(),
  evidence: z.array(z.string()).min(2).max(4),
  confidence: z.enum(["low", "moderate", "high"]),
  limitation: z.string(),
});

const cache = new Map<string, z.infer<typeof ExplanationSchema>>();

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid forecast point" }, { status: 400 });
  const { point } = parsed.data;
  const cached = cache.get(point.id);
  if (cached) return NextResponse.json({ explanation: cached, source: "gemini", model: GEMINI_MODEL, cached: true });
  const noaa = JSON.stringify(point.noaa ?? {});
  const evidence = JSON.stringify(point.spectral_evidence ?? []);
  const prompt = `You are a cautious oceanographic analyst. Explain ONLY this evidence-backed NASA PACE/NOAA forecast candidate. Never invent or alter coordinates, measurements, timestamps, confidence, or causes. Treat the supplied model cause as a likelihood, not proof. If evidence is insufficient, say so. Return JSON only with headline, anomaly, cause, evidence (2-4 short strings), confidence, limitation.\n\nPACE/ML point: ${JSON.stringify({ id: point.id, latitude: point.latitude, longitude: point.longitude, anomaly_score: point.anomaly_score, confidence: point.confidence, severity: point.severity, cause: point.cause, nflh: point.nflh, avw: point.avw, aot_865: point.aot_865, angstrom: point.angstrom, source: point.source })}\nNOAA context: ${noaa}\nSpectral evidence: ${evidence}`;
  try {
    const explanation = await generateGeminiJson(prompt, ExplanationSchema);
    cache.set(point.id, explanation);
    return NextResponse.json({ explanation, source: "gemini", model: GEMINI_MODEL, cached: false });
  } catch {
    const explanation = { headline: `${point.cause} signal detected`, anomaly: `${point.severity} anomaly candidate at ${point.latitude.toFixed(3)}°, ${point.longitude.toFixed(3)}° with a ${point.anomaly_score.toFixed(1)}% model score.`, cause: `The measured spectral signature is most consistent with ${point.cause}; this is a model likelihood, not causal proof.`, evidence: [`PACE score ${point.anomaly_score.toFixed(1)}%`, `PACE confidence ${(point.confidence * 100).toFixed(1)}%`, point.noaa?.station ? `NOAA station ${String(point.noaa.station)} provides nearby context.` : "No nearby NOAA station was available."], confidence: point.confidence >= 0.75 ? "high" : point.confidence >= 0.5 ? "moderate" : "low", limitation: "Gemini was unavailable; this evidence summary contains no invented measurements." } as const;
    return NextResponse.json({ explanation, source: "evidence-summary", cached: false });
  }
}
