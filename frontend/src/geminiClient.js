import { PLANET_ORDER, PLANET_META, HOUSE_MEANINGS, NUMBER_INFO } from "./astroEngine.js";

/**
 * Calls our own backend at /api/gemini (never the Gemini API directly — the
 * API key lives only on the server). In dev, Vite proxies /api to the
 * Express backend on :3001 (see vite.config.js). In production, serve the
 * built frontend from the same origin as the backend, or update this path
 * to the backend's full URL.
 */
async function callGemini(prompt) {
  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Server error (${response.status})`);
  }
  if (!data.text) throw new Error("Empty response from server");
  return data.text;
}

function extractJSON(text) {
  let cleaned = text.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/```\s*$/, "");
  // Defensive: normalize typographic quotes some models occasionally emit
  // in place of straight JSON quotes.
  cleaned = cleaned.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) cleaned = cleaned.slice(first, last + 1);
  try {
    return JSON.parse(cleaned);
  } catch (e) {
    // Surface what actually came back, not just JSON.parse's generic
    // message — makes a bad model response debuggable from the error
    // banner alone, without needing to check server logs.
    throw new Error(`Got an invalid response (${e.message}). Response started with: "${cleaned.slice(0, 140)}"`);
  }
}

export async function geocodePlace(place) {
  const prompt = `You are a precise geocoding assistant. For the place name "${place}", respond with ONLY a raw JSON object (no markdown fences, no explanation) in exactly this shape:
{"latitude": <number>, "longitude": <number>, "utcOffsetHours": <number>, "displayName": "<City, Region, Country>"}
Rules: latitude/longitude are decimal degrees, best estimate if it's a small town. utcOffsetHours is the STANDARD (non-DST) UTC offset for that location, as a number (e.g. 5.5 for India, -5 for US Eastern, 9 for Japan). If ambiguous, make your best reasonable interpretation and still return JSON only.`;
  const text = await callGemini(prompt);
  const parsed = extractJSON(text);
  if (
    typeof parsed.latitude !== "number" || typeof parsed.longitude !== "number" ||
    typeof parsed.utcOffsetHours !== "number" || !isFinite(parsed.latitude) || !isFinite(parsed.longitude)
  ) {
    throw new Error("Could not determine coordinates for that place");
  }
  return parsed;
}

export async function generateReading(chart, name, placeName, birthLine, numbers) {
  const lines = PLANET_ORDER.map((p) => {
    const meta = PLANET_META[p];
    return `${p} (${meta.sanskrit}): ${chart.planetSigns[p]}, House ${chart.planetHouses[p]} (${HOUSE_MEANINGS[chart.planetHouses[p] - 1]})${chart.retro[p] ? ", retrograde" : ""}`;
  }).join("\n");

  const prompt = `You are an experienced, warm Vedic astrologer (Jyotishi) writing a short personalized reading in clear modern English, for someone new to astrology.

Client: ${name}
Born: ${birthLine}, ${placeName}

Chart:
Ascendant (Lagna): ${chart.ascendant.sign}
Moon Nakshatra: ${chart.nakshatra.name}, Pada ${chart.nakshatra.pada}
${lines}
Mulank (root number): ${numbers.mulank} — ruled by ${NUMBER_INFO[numbers.mulank].planet}
Bhagyank (destiny number): ${numbers.bhagyank} — ruled by ${NUMBER_INFO[numbers.bhagyank].planet}

Write a warm, specific reading grounded in these actual placements — reference real planets/houses/signs naturally, avoid generic filler and avoid disclaimers. Respond with ONLY raw JSON (no markdown fences) in exactly this shape:
{"personality": "2-3 sentences on core personality and strengths, drawing on the Ascendant, Moon nakshatra and numerology", "career": "3-4 sentences on career and success, drawing on the 10th, 2nd, 6th and 11th houses and their planets", "love": "3-4 sentences on love and relationships, drawing on the 7th house, Venus and the Moon", "lifePath": "3-4 sentences of general life guidance, drawing on the numerology numbers and overall chart balance"}`;

  const text = await callGemini(prompt);
  const parsed = extractJSON(text);
  for (const key of ["personality", "career", "love", "lifePath"]) {
    if (typeof parsed[key] !== "string" || !parsed[key].trim()) throw new Error("Incomplete reading returned");
  }
  return parsed;
}
