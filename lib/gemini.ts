import { z } from "zod";

const GEMINI_MODEL = "gemini-3.5-flash-lite";
const REQUEST_TIMEOUT_MS = 10_000;

export class GeminiRequestError extends Error {
  constructor(public readonly status: number | null, message: string) {
    super(message);
    this.name = "GeminiRequestError";
  }
}

export async function generateGeminiJson<T>(prompt: string, schema: z.ZodType<T>): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY_4 ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiRequestError(null, "Gemini is not configured");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          // The prompts don't spell out field names, so the schema has to travel with the request —
          // otherwise the model picks its own keys and the parse below rejects every response.
          generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
            responseJsonSchema: z.toJSONSchema(schema),
          },
        }),
        signal: controller.signal,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new GeminiRequestError(response.status, `Gemini request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const text = payload.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
    if (!text) throw new GeminiRequestError(null, "Gemini returned an empty response");

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new GeminiRequestError(null, "Gemini returned malformed JSON");
    }

    return schema.parse(parsed);
  } catch (error) {
    if (error instanceof GeminiRequestError) throw error;
    if (error instanceof z.ZodError) throw new GeminiRequestError(null, "Gemini returned an unexpected response");
    if (error instanceof Error && error.name === "AbortError") {
      throw new GeminiRequestError(null, "Gemini request timed out");
    }
    throw new GeminiRequestError(null, "Gemini request failed");
  } finally {
    clearTimeout(timeout);
  }
}

export { GEMINI_MODEL };
