import express from "express";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash";

if (!GEMINI_API_KEY) {
  console.error(
    "\n❌ Missing GEMINI_API_KEY.\n" +
    "   Copy backend/.env.example to backend/.env and add your key from https://aistudio.google.com/apikey\n"
  );
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Status codes worth retrying: rate-limited or a transient server-side
// problem. Anything else (bad auth, bad request, etc.) won't be fixed by
// retrying, so those still fail immediately.
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;

/**
 * Calls the Gemini generateContent API and returns the reply text.
 * The API key never leaves this server — the frontend only ever talks to /api/*.
 * Retries with exponential backoff on rate-limit/overload responses (Gemini
 * returning "high demand" 503s is common and usually resolves within a
 * couple of seconds), so a brief provider-side blip doesn't have to surface
 * as an error the person has to notice and manually retry.
 */
async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

  // Gemini 3.x models default to a high "thinking" effort, and those
  // thinking tokens are drawn from the same maxOutputTokens budget as the
  // visible reply. For a short structured-JSON task like ours that's pure
  // overhead — it was eating enough of the budget to cut the real answer
  // off mid-sentence. Keep thinking minimal so the budget goes to the
  // actual response. Gemini 3.x uses thinkingLevel; earlier models use the
  // older thinkingBudget — the two are mutually exclusive (mixing them is
  // a 400 error), so pick the one that matches whatever model is configured.
  const thinkingConfig = MODEL.includes("gemini-3")
    ? { thinkingLevel: "low" }
    : { thinkingBudget: 0 };

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    // Every prompt this app sends asks for a JSON object back, so force it
    // at the API level rather than hoping the model follows instructions —
    // this is what actually stops Gemini from wrapping replies in prose
    // or markdown fences that would break JSON.parse downstream.
    generationConfig: { maxOutputTokens: 2048, responseMimeType: "application/json", thinkingConfig },
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": GEMINI_API_KEY,
      },
      body,
    });

    if (response.ok) {
      const data = await response.json();

      // A blocked prompt has no candidates at all — surface the reason
      // clearly instead of letting the next line throw a confusing
      // "undefined" error.
      if (data.promptFeedback?.blockReason) {
        throw new Error(`Gemini blocked this prompt (${data.promptFeedback.blockReason}).`);
      }

      const candidate = data.candidates?.[0];
      const parts = candidate?.content?.parts;
      if (!parts || !parts.length) {
        throw new Error(`Gemini returned no content (finishReason: ${candidate?.finishReason || "unknown"}).`);
      }

      const text = parts.map((p) => p.text || "").join("\n").trim();
      if (!text) throw new Error("Gemini returned an empty response.");
      return text;
    }

    const errBody = await response.text().catch(() => "");
    const error = new Error(`Gemini API error (${response.status}): ${errBody.slice(0, 300)}`);

    const isLastAttempt = attempt === MAX_ATTEMPTS;
    if (!RETRYABLE_STATUSES.has(response.status) || isLastAttempt) {
      throw error;
    }

    const delayMs = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1); // 500ms, then 1000ms
    console.log(`Gemini returned ${response.status} (attempt ${attempt}/${MAX_ATTEMPTS}) — retrying in ${delayMs}ms...`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

// Quick way to confirm the server is up and which model it's configured with.
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, model: MODEL });
});

// Generic proxy: the frontend builds prompts (astrology domain logic lives
// there); this endpoint's only job is to hold the API key and forward text.
app.post("/api/gemini", async (req, res) => {
  const { prompt } = req.body || {};
  if (typeof prompt !== "string" || !prompt.trim()) {
    return res.status(400).json({ error: "Request body must include a non-empty 'prompt' string." });
  }
  try {
    const text = await callGemini(prompt);
    res.json({ text });
  } catch (err) {
    console.error("Gemini request failed:", err.message);
    res.status(502).json({ error: err.message || "Gemini request failed." });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: "Not found." });
});

app.listen(PORT, () => {
  console.log(`Nakshatra backend running at http://localhost:${PORT}`);
  console.log(`Using model: ${MODEL}`);
});
