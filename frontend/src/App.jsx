import React, { useState } from "react";
import { Sparkles, MapPin, ArrowLeft, AlertCircle, Check } from "lucide-react";
import {
  calculateChart, mulank, bhagyank, formatDegMin, formatUTCOffset, formatLat, formatLng,
  SIGNS, PLANET_ORDER, PLANET_META, HOUSE_MEANINGS, NUMBER_INFO, GRID_POS,
} from "./astroEngine.js";
import { geocodePlace, generateReading } from "./geminiClient.js";

function Field({ label, children }) {
  return (
    <div className="nak-field">
      <label className="nak-label">{label}</label>
      {children}
    </div>
  );
}

function Loader({ text, sub }) {
  return (
    <div className="nak-loader-wrap">
      <div className="nak-rings">
        <div className="nak-ring r1" />
        <div className="nak-ring r2" />
        <div className="nak-ring r3" />
      </div>
      <div className="nak-loader-text">{text}</div>
      {sub && <div className="nak-loader-sub">{sub}</div>}
    </div>
  );
}

function ChartGrid({ chart }) {
  const cells = Array.from({ length: 16 }, (_, i) => ({ row: Math.floor(i / 4), col: i % 4 }));
  const centerCells = new Set(["1-1", "1-2", "2-1", "2-2"]);
  const planetsBySign = {};
  PLANET_ORDER.forEach((p) => {
    const idx = SIGNS.indexOf(chart.planetSigns[p]);
    if (!planetsBySign[idx]) planetsBySign[idx] = [];
    planetsBySign[idx].push(p);
  });
  return (
    <div className="nak-grid">
      {cells.map(({ row, col }) => {
        const key = `${row}-${col}`;
        if (centerCells.has(key)) {
          if (row === 1 && col === 1) {
            return (
              <div key={key} className="nak-cell center" style={{ gridRow: "2 / span 2", gridColumn: "2 / span 2" }}>
                <div className="nak-center-name">✦ {chart.name}</div>
                <div className="nak-center-lagna">Lagna · {chart.ascendant.sign}</div>
              </div>
            );
          }
          return null;
        }
        const signIdx = GRID_POS.findIndex(([r, c]) => r === row && c === col);
        const isAsc = signIdx === chart.ascendant.signIdx;
        const planets = planetsBySign[signIdx] || [];
        return (
          <div key={key} className={`nak-cell${isAsc ? " asc" : ""}`}>
            <span className="nak-cell-sign">{SIGNS[signIdx].slice(0, 3)}</span>
            <div className="nak-cell-planets">
              {planets.map((p) => (
                <span key={p} className={`nak-cell-planet${chart.retro[p] ? " retro" : ""}`} title={p}>
                  {PLANET_META[p].symbol}
                </span>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function NakshatraApp() {
  const [stage, setStage] = useState("form");
  const [form, setForm] = useState({ name: "", dob: "", tob: "", pob: "" });
  const [geo, setGeo] = useState(null);
  const [chart, setChart] = useState(null);
  const [reading, setReading] = useState(null);
  const [numbers, setNumbers] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");

  const updateForm = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const updateGeo = (key) => (e) => setGeo((g) => ({ ...g, [key]: parseFloat(e.target.value) }));

  const formValid = form.name.trim() && form.dob && form.tob && form.pob.trim();
  const geoValid = geo && isFinite(geo.latitude) && isFinite(geo.longitude) && isFinite(geo.utcOffsetHours);

  async function handleFindLocation() {
    setErrorMsg("");
    setStage("geocoding");
    try {
      const result = await geocodePlace(form.pob.trim());
      setGeo(result);
      setStage("confirm");
    } catch (e) {
      setErrorMsg(e.message || "Could not locate that place. Try adding a country, or enter coordinates manually below.");
      setGeo({ latitude: 0, longitude: 0, utcOffsetHours: 0, displayName: form.pob.trim() });
      setStage("confirm");
    }
  }

  async function handleCastChart() {
    setErrorMsg("");
    setStage("reading");
    try {
      const [year, month, day] = form.dob.split("-").map(Number);
      const [hour, minute] = form.tob.split(":").map(Number);
      const computed = {
        ...calculateChart({
          year, month, day, hour, minute,
          utcOffsetHours: geo.utcOffsetHours, latitude: geo.latitude, longitude: geo.longitude,
        }),
        name: form.name.trim(),
      };
      const numResult = { mulank: mulank(day), bhagyank: bhagyank(day, month, year) };
      setNumbers(numResult);
      setChart(computed);

      const birthLine = `${form.dob} at ${form.tob}`;
      const result = await generateReading(computed, form.name.trim(), geo.displayName, birthLine, numResult)
        .catch(async () => {
          // one retry on transient failure
          return await generateReading(computed, form.name.trim(), geo.displayName, birthLine, numResult);
        });
      setReading(result);
      setStage("results");
    } catch (e) {
      setErrorMsg(e.message || "The reading could not be generated. Please try again.");
      setStage("confirm");
    }
  }

  function reset() {
    setStage("form"); setForm({ name: "", dob: "", tob: "", pob: "" });
    setGeo(null); setChart(null); setReading(null); setNumbers(null); setErrorMsg("");
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="nak-root">
      <div className="nak-wrap">
        <div className="nak-eyebrow">Jyotisha · A Precision Reading</div>
        <h1 className="nak-title">NAK<span className="accent">SHA</span>TRA</h1>
        <p className="nak-sub">Enter your birth details. We'll chart the sky exactly as it stood the moment you arrived.</p>
        <div className="nak-ornament"><div className="ln" /><span>✦</span><div className="ln r" /></div>

        {stage === "form" && (
          <div className="nak-panel">
            <Field label="Full Name">
              <input className="nak-input" type="text" placeholder="As you'd like it addressed" value={form.name} onChange={updateForm("name")} />
            </Field>
            <div className="nak-row2">
              <Field label="Date of Birth">
                <input className="nak-input" type="date" max={today} min="1900-01-01" value={form.dob} onChange={updateForm("dob")} />
              </Field>
              <Field label="Time of Birth">
                <input className="nak-input" type="time" value={form.tob} onChange={updateForm("tob")} />
              </Field>
            </div>
            <Field label="Place of Birth">
              <input className="nak-input" type="text" placeholder="City, State, Country" value={form.pob} onChange={updateForm("pob")} />
            </Field>
            {errorMsg && <div className="nak-err"><AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>{errorMsg}</span></div>}
            <button className="nak-btn" disabled={!formValid} onClick={handleFindLocation}>
              <Sparkles size={14} /> Cast My Chart
            </button>
          </div>
        )}

        {stage === "geocoding" && (
          <div className="nak-panel">
            <Loader text="Locating birthplace" sub={`Finding "${form.pob}" on the map…`} />
          </div>
        )}

        {stage === "confirm" && geo && (
          <div className="nak-panel">
            <div className="nak-sectiontitle"><MapPin size={13} /> Confirm Location</div>
            <div className="nak-locrow"><span className="k">Place</span><span className="v">{geo.displayName}</span></div>
            <div className="nak-locrow">
              <span className="k">Latitude</span>
              <input className="nak-input" style={{ width: 130, padding: "6px 10px", fontSize: 13 }} type="number" step="0.0001" value={geo.latitude} onChange={updateGeo("latitude")} />
            </div>
            <div className="nak-locrow">
              <span className="k">Longitude</span>
              <input className="nak-input" style={{ width: 130, padding: "6px 10px", fontSize: 13 }} type="number" step="0.0001" value={geo.longitude} onChange={updateGeo("longitude")} />
            </div>
            <div className="nak-locrow">
              <span className="k">UTC Offset (hrs)</span>
              <input className="nak-input" style={{ width: 130, padding: "6px 10px", fontSize: 13 }} type="number" step="0.25" value={geo.utcOffsetHours} onChange={updateGeo("utcOffsetHours")} />
            </div>
            <p style={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 11, color: "var(--ivory-dim)", marginTop: 14, lineHeight: 1.6 }}>
              Not quite right? Adjust the coordinates above — precise birthplace matters most for the Ascendant and house placements.
            </p>
            {errorMsg && <div className="nak-err"><AlertCircle size={15} style={{ flexShrink: 0, marginTop: 1 }} /><span>{errorMsg}</span></div>}
            <button className="nak-btn" disabled={!geoValid} onClick={handleCastChart}><Check size={14} /> Confirm &amp; Cast Chart</button>
            <button className="nak-btn-text" style={{ margin: "14px auto 0", justifyContent: "center" }} onClick={() => setStage("form")}><ArrowLeft size={12} /> Back to details</button>
          </div>
        )}

        {stage === "reading" && (
          <div className="nak-panel">
            <Loader text="Plotting the sky" sub="Positioning nine grahas and writing your reading…" />
          </div>
        )}

        {stage === "results" && chart && reading && numbers && (
          <>
            <div className="nak-panel">
              <div className="nak-result-head">
                <div className="nak-result-name">{chart.name}</div>
                <div className="nak-result-meta">{form.dob} · {form.tob} · {geo.displayName}</div>
              </div>

              <div className="nak-sectiontitle">Numerology</div>
              <div className="nak-dials">
                <div className="nak-dial">
                  <div className="nak-dial-circle"><span className="nak-dial-num">{numbers.mulank}</span></div>
                  <div className="nak-dial-label">Mulank</div>
                  <div className="nak-dial-planet">{NUMBER_INFO[numbers.mulank].sanskrit}</div>
                  <div className="nak-dial-trait">{NUMBER_INFO[numbers.mulank].trait}</div>
                </div>
                <div className="nak-dial">
                  <div className="nak-dial-circle"><span className="nak-dial-num">{numbers.bhagyank}</span></div>
                  <div className="nak-dial-label">Bhagyank</div>
                  <div className="nak-dial-planet">{NUMBER_INFO[numbers.bhagyank].sanskrit}</div>
                  <div className="nak-dial-trait">{NUMBER_INFO[numbers.bhagyank].trait}</div>
                </div>
              </div>
            </div>

            <div className="nak-panel">
              <div className="nak-sectiontitle">Birth Nakshatra</div>
              <div className="nak-nak-feature">
                <div className="nak-nak-name">{chart.nakshatra.name}</div>
                <div className="nak-nak-pada">Pada {chart.nakshatra.pada} · Moon in {chart.planetSigns.Moon}</div>
              </div>
            </div>

            <div className="nak-panel">
              <div className="nak-sectiontitle">Rasi Chart</div>
              <ChartGrid chart={chart} />
            </div>

            <div className="nak-panel">
              <div className="nak-sectiontitle">Planetary Positions</div>
              <table className="nak-table">
                <thead><tr><th></th><th>Graha</th><th>Sign</th><th>House</th><th>Degree</th></tr></thead>
                <tbody>
                  {PLANET_ORDER.map((p) => (
                    <tr key={p}>
                      <td className="sym">{PLANET_META[p].symbol}</td>
                      <td>{p}</td>
                      <td>{chart.planetSigns[p]}</td>
                      <td className="dim">H{chart.planetHouses[p]} <span style={{fontSize:10}}>{HOUSE_MEANINGS[chart.planetHouses[p]-1]}</span></td>
                      <td className={chart.retro[p] ? "retro" : ""}>{formatDegMin(chart.planetDegInSign[p])}{chart.retro[p] ? " ℞" : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="nak-panel nak-reading">
              <div className="nak-sectiontitle">Your Reading</div>
              <p><span className="rt">Personality</span>{reading.personality}</p>
              <p><span className="rt">Career &amp; Success</span>{reading.career}</p>
              <p><span className="rt">Love &amp; Relationships</span>{reading.love}</p>
              <p><span className="rt">Life Path</span>{reading.lifePath}</p>
            </div>

            <div className="nak-footnote">
              Ascendant {chart.ascendant.sign} {formatDegMin(chart.ascendant.degInSign)} · Ayanamsa (Lahiri) {chart.ayanamsa.toFixed(2)}° · {formatLat(geo.latitude)}, {formatLng(geo.longitude)}, UTC{formatUTCOffset(geo.utcOffsetHours)}
              <br />Positions use standard low-precision planetary formulas — reliable to well within a degree, but not a substitute for a professional ephemeris near exact sign boundaries.
            </div>
            <div className="nak-again">
              <button className="nak-btn-text" onClick={reset}><ArrowLeft size={12} /> Cast Another Chart</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
