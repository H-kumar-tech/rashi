/* =========================================================================
   ASTRONOMY + NUMEROLOGY ENGINE
   Low-precision (Meeus / JPL Keplerian-element) formulas — good to roughly
   0.1-1° for the planets and Sun, ~0.3-0.5° for the Moon. Sidereal (Vedic)
   zodiac via the Lahiri ayanamsa. Whole-sign houses from the Ascendant.
   ========================================================================= */

const deg2rad = (d) => (d * Math.PI) / 180;
const rad2deg = (r) => (r * 180) / Math.PI;
const norm360 = (d) => { let x = d % 360; if (x < 0) x += 360; return x; };

function toJulianDay(year, month, day, hourUT) {
  let Y = year, M = month;
  if (M <= 2) { Y -= 1; M += 12; }
  const A = Math.floor(Y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const dayFraction = day + hourUT / 24;
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + dayFraction + B - 1524.5;
}
const centuriesFromJ2000 = (jd) => (jd - 2451545.0) / 36525;
const obliquity = (T) => 23.439291 - 0.0130042 * T - 0.00000016 * T * T;

function sunLongitude(T) {
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const Mr = deg2rad(M);
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mr) +
    (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) +
    0.000289 * Math.sin(3 * Mr);
  return norm360(L0 + C);
}

function moonLongitude(T) {
  const L = 218.32 + 481267.881 * T;
  const terms =
    6.29 * Math.sin(deg2rad(477198.87 * T + 135.0)) -
    1.27 * Math.sin(deg2rad(413335.36 * T - 259.3)) +
    0.66 * Math.sin(deg2rad(890534.22 * T + 235.7)) +
    0.21 * Math.sin(deg2rad(954397.74 * T + 269.9)) -
    0.19 * Math.sin(deg2rad(35999.05 * T - 357.5)) -
    0.11 * Math.sin(deg2rad(966404.03 * T + 186.6));
  return norm360(L + terms);
}

const meanNodeLongitude = (T) => norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T);
const lahiriAyanamsa = (yearDecimal) => 23.853 + 0.013955 * (yearDecimal - 2000);

function gmstDegrees(jd) {
  const T = centuriesFromJ2000(jd);
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - Math.pow(T, 3) / 38710000);
}

// Ascendant longitude: intersection of the ecliptic plane and horizon plane,
// derived from first principles as the cross product of their normal vectors.
function ascendantLongitude(thetaDeg, phiDeg, epsDeg) {
  const theta = deg2rad(thetaDeg), phi = deg2rad(phiDeg), eps = deg2rad(epsDeg);
  const y = Math.cos(phi) * Math.cos(theta);
  const x = -(Math.sin(eps) * Math.sin(phi) + Math.cos(eps) * Math.cos(phi) * Math.sin(theta));
  return norm360(rad2deg(Math.atan2(y, x)));
}

// JPL/Standish approximate Keplerian elements (valid ~1800-2050), rates per Julian century
const PLANET_ELEMENTS = {
  Mercury: { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], I: [7.00497902, -0.00594749], L: [252.2503235, 149472.67411175], peri: [77.45779628, 0.16047689], node: [48.33076593, -0.12534081] },
  Venus:   { a: [0.72333566, 0.0000039],  e: [0.00677672, -0.00004107], I: [3.39467605, -0.0007889],  L: [181.9790995, 58517.81538729], peri: [131.60246718, 0.00268329], node: [76.67984255, -0.27769418] },
  Earth:   { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0.0, 0.0] },
  Mars:    { a: [1.52371034, 0.00001847], e: [0.0933941, 0.00007882],  I: [1.84969142, -0.00813131],  L: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343] },
  Jupiter: { a: [5.202887, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714],  L: [34.39644051, 3034.74612775], peri: [14.72847983, 0.21252668], node: [100.47390909, 0.20469106] },
  Saturn:  { a: [9.53667594, -0.0012506], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609],  L: [49.95424423, 1222.49362201], peri: [92.59887831, -0.41897216], node: [113.66242448, -0.28867794] },
};

function solveKepler(Mrad, e) {
  let E = Mrad + e * Math.sin(Mrad);
  for (let i = 0; i < 20; i++) {
    const dE = (Mrad - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
    E += dE;
    if (Math.abs(dE) < 1e-10) break;
  }
  return E;
}

function heliocentricXYZ(elements, T) {
  const a = elements.a[0] + elements.a[1] * T;
  const e = elements.e[0] + elements.e[1] * T;
  const I = elements.I[0] + elements.I[1] * T;
  const L = elements.L[0] + elements.L[1] * T;
  const peri = elements.peri[0] + elements.peri[1] * T;
  const node = elements.node[0] + elements.node[1] * T;
  const argPeri = peri - node;
  let M = norm360(L - peri);
  if (M > 180) M -= 360;
  const E = solveKepler(deg2rad(M), e);
  const xOrb = a * (Math.cos(E) - e);
  const yOrb = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cosArgP = Math.cos(deg2rad(argPeri)), sinArgP = Math.sin(deg2rad(argPeri));
  const cosNode = Math.cos(deg2rad(node)), sinNode = Math.sin(deg2rad(node));
  const cosI = Math.cos(deg2rad(I)), sinI = Math.sin(deg2rad(I));
  const x = (cosArgP * cosNode - sinArgP * sinNode * cosI) * xOrb + (-sinArgP * cosNode - cosArgP * sinNode * cosI) * yOrb;
  const y = (cosArgP * sinNode + sinArgP * cosNode * cosI) * xOrb + (-sinArgP * sinNode + cosArgP * cosNode * cosI) * yOrb;
  const z = sinArgP * sinI * xOrb + cosArgP * sinI * yOrb;
  return { x, y, z };
}

function geocentricLongitude(planetName, T) {
  const earth = heliocentricXYZ(PLANET_ELEMENTS.Earth, T);
  const planet = heliocentricXYZ(PLANET_ELEMENTS[planetName], T);
  return norm360(rad2deg(Math.atan2(planet.y - earth.y, planet.x - earth.x)));
}

export const SIGNS = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
export const NAKSHATRAS = ["Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra", "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni", "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha", "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha", "Shravana", "Dhanishta", "Shatabhisha", "Purva Bhadrapada", "Uttara Bhadrapada", "Revati"];
export const PLANET_ORDER = ["Sun", "Moon", "Mars", "Mercury", "Jupiter", "Venus", "Saturn", "Rahu", "Ketu"];
export const PLANET_META = {
  Sun: { symbol: "☉", sanskrit: "Surya" }, Moon: { symbol: "☽", sanskrit: "Chandra" },
  Mars: { symbol: "♂", sanskrit: "Mangal" }, Mercury: { symbol: "☿", sanskrit: "Budh" },
  Jupiter: { symbol: "♃", sanskrit: "Guru" }, Venus: { symbol: "♀", sanskrit: "Shukra" },
  Saturn: { symbol: "♄", sanskrit: "Shani" }, Rahu: { symbol: "☊", sanskrit: "Rahu" }, Ketu: { symbol: "☋", sanskrit: "Ketu" },
};
export const HOUSE_MEANINGS = ["Self", "Wealth", "Courage", "Home", "Creativity", "Service", "Partners", "Change", "Fortune", "Career", "Gains", "Release"];
export const NUMBER_INFO = {
  1: { planet: "Sun", sanskrit: "Surya", trait: "leadership and radiant confidence" },
  2: { planet: "Moon", sanskrit: "Chandra", trait: "intuition and emotional depth" },
  3: { planet: "Jupiter", sanskrit: "Guru", trait: "wisdom and expansive optimism" },
  4: { planet: "Rahu", sanskrit: "Rahu", trait: "unconventional ambition and drive" },
  5: { planet: "Mercury", sanskrit: "Budh", trait: "adaptability and sharp communication" },
  6: { planet: "Venus", sanskrit: "Shukra", trait: "harmony, beauty and devotion" },
  7: { planet: "Ketu", sanskrit: "Ketu", trait: "introspection and quiet spirituality" },
  8: { planet: "Saturn", sanskrit: "Shani", trait: "discipline and hard-won mastery" },
  9: { planet: "Mars", sanskrit: "Mangal", trait: "courage and decisive energy" },
};
// South Indian chart layout: fixed sign position in a 4x4 grid [row, col], clockwise from top-left.
export const GRID_POS = [[0,1],[0,2],[0,3],[1,3],[2,3],[3,3],[3,2],[3,1],[3,0],[2,0],[1,0],[0,0]];

function digitalRootFromDigits(str) {
  let n = str.split("").reduce((a, b) => a + Number(b), 0);
  while (n > 9) n = String(n).split("").reduce((a, b) => a + Number(b), 0);
  return n;
}
export const mulank = (day) => digitalRootFromDigits(String(day));
export const bhagyank = (day, month, year) => digitalRootFromDigits(`${day}${month}${year}`);

export function formatDegMin(decimalDegInSign) {
  let d = Math.floor(decimalDegInSign);
  let m = Math.round((decimalDegInSign - d) * 60);
  if (m === 60) { m = 0; d += 1; }
  return `${d}°${String(m).padStart(2, "0")}'`;
}
export function formatUTCOffset(h) {
  const sign = h >= 0 ? "+" : "-";
  const abs = Math.abs(h);
  const hh = Math.floor(abs);
  const mm = Math.round((abs - hh) * 60);
  return `${sign}${hh}:${String(mm).padStart(2, "0")}`;
}
export function formatLat(l) { return `${Math.abs(l).toFixed(3)}°${l >= 0 ? "N" : "S"}`; }
export function formatLng(l) { return `${Math.abs(l).toFixed(3)}°${l >= 0 ? "E" : "W"}`; }

export function calculateChart({ year, month, day, hour, minute, utcOffsetHours, latitude, longitude }) {
  const hourUT = hour + minute / 60 - utcOffsetHours;
  const jd = toJulianDay(year, month, day, hourUT);
  const T = centuriesFromJ2000(jd);
  const Tnext = T + 1 / 36525;
  const eps = obliquity(T);
  const ayanamsa = lahiriAyanamsa(year + (month - 1) / 12 + day / 365.25);

  const rahu = meanNodeLongitude(T);
  const tropical = {
    Sun: sunLongitude(T), Moon: moonLongitude(T),
    Mercury: geocentricLongitude("Mercury", T), Venus: geocentricLongitude("Venus", T),
    Mars: geocentricLongitude("Mars", T), Jupiter: geocentricLongitude("Jupiter", T),
    Saturn: geocentricLongitude("Saturn", T),
    Rahu: rahu, Ketu: norm360(rahu + 180),
  };

  const retro = { Sun: false, Moon: false, Rahu: true, Ketu: true };
  for (const p of ["Mercury", "Venus", "Mars", "Jupiter", "Saturn"]) {
    let diff = geocentricLongitude(p, Tnext) - tropical[p];
    if (diff > 180) diff -= 360;
    if (diff < -180) diff += 360;
    retro[p] = diff < 0;
  }

  const sidereal = {};
  for (const [k, v] of Object.entries(tropical)) sidereal[k] = norm360(v - ayanamsa);

  const theta = norm360(gmstDegrees(jd) + longitude);
  const tropicalAsc = ascendantLongitude(theta, latitude, eps);
  const siderealAsc = norm360(tropicalAsc - ayanamsa);
  const ascSignIdx = Math.floor(siderealAsc / 30);

  const planetHouses = {}, planetSigns = {}, planetDegInSign = {};
  for (const [k, v] of Object.entries(sidereal)) {
    const signIdx = Math.floor(v / 30);
    planetSigns[k] = SIGNS[signIdx];
    planetHouses[k] = ((signIdx - ascSignIdx + 12) % 12) + 1;
    planetDegInSign[k] = v % 30;
  }

  const nakSpan = 360 / 27;
  const nakIdx = Math.floor(sidereal.Moon / nakSpan);
  const pada = Math.floor((sidereal.Moon % nakSpan) / (nakSpan / 4)) + 1;

  return {
    ayanamsa, planetSigns, planetHouses, planetDegInSign, retro,
    ascendant: { sign: SIGNS[ascSignIdx], degInSign: siderealAsc % 30, signIdx: ascSignIdx },
    nakshatra: { name: NAKSHATRAS[nakIdx], pada },
  };
}
