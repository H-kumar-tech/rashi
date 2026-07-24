# Nakshatra — Vedic Astrology App

A birth-chart app: enter a name, date/time, and place of birth, and get back
a real chart — Ascendant, all nine grahas placed into signs and houses,
Moon nakshatra, numerology, and a personalized reading — computed from
actual astronomical formulas and written by Gemini.

## Architecture

Two pieces, run separately:

- **`backend/`** — a small Express server. Its only job is to hold your
  Gemini API key and forward prompts to Google's API. The key never
  reaches the browser.
- **`frontend/`** — a Vite + React app. All the astrology logic lives here:
  planetary position calculations (`src/astroEngine.js`) and the prompts
  (`src/geminiClient.js`). It talks to your backend at `/api/gemini`, never
  to Google directly.

This split exists because a browser calling Google's API directly would
either fail on CORS or require embedding your secret key in client-side
code, where anyone can read it from dev tools. Keeping the key server-side
is the only sound way to do this.

## Prerequisites

- [Node.js](https://nodejs.org) 18 or later
- A Gemini API key — get one for free at [Google AI Studio](https://aistudio.google.com/apikey)

## Setup

**1. Backend**

```bash
cd backend
npm install
cp .env.example .env
```

Open `.env` and paste your key:

```
GEMINI_API_KEY=your-actual-key
```

**2. Frontend**

```bash
cd frontend
npm install
```

## Running it

Two terminals:

```bash
# Terminal 1
cd backend
npm run dev
# → Nakshatra backend running at http://localhost:3001

# Terminal 2
cd frontend
npm run dev
# → Local: http://localhost:5173
```

Open **http://localhost:5173**. The frontend's dev server proxies `/api/*`
requests to the backend automatically (see `frontend/vite.config.js`), so
there's nothing else to configure.

## Notes

- **Model**: defaults to `gemini-3.5-flash`. Change it by setting
  `GEMINI_MODEL` in `backend/.env`, or editing the default in
  `backend/server.js`.
- **Safety blocks**: Gemini can decline to answer a prompt (or a response)
  on safety grounds. That's very unlikely for astrology readings, but if it
  ever happens the app will show a clear error naming the block reason
  rather than crashing — see `callGemini()` in `backend/server.js`.
- **Precision**: the planetary positions use standard low-precision
  astronomical formulas (Meeus-style series, JPL Keplerian elements) —
  accurate to a fraction of a degree, which is fine for a reading like
  this, but not observatory-grade near exact sign boundaries.
- **This backend has no auth or rate limiting.** That's fine for running
  locally on your own machine. If you ever deploy it somewhere public,
  add authentication, rate-limit `/api/gemini`, and restrict CORS to your
  actual frontend origin (`app.use(cors())` currently allows any origin).
- **Building for production**: `cd frontend && npm run build` outputs
  static files to `frontend/dist/`. You'd serve those from any static
  host, and point them at a deployed copy of the backend (update the
  fetch path in `src/geminiClient.js` if the backend isn't on the same
  origin, since the `/api` proxy only exists in Vite's dev server).
