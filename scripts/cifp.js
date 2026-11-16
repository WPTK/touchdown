// FAA CIFP (ARINC 424-18) parser for one airport. Dependency-free.
// Usage: node scripts/cifp.js [CIFP file or folder] [airport ident] [output json]
//   defaults: data/raw/FAACIFP18, KATL, data/<ident>-<cycle>.json
//
// Column numbers below are 1-based, as in the ARINC 424-18 spec (chapter 4 record layouts, chapter 5 field
// definitions). Every layout was checked against real KATL records from cycle 2611. A field that is not decoded
// is never guessed: each leg keeps its full 132-character `raw` record.
import { readFileSync, writeFileSync, statSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EARTH_RADIUS_NM = 6371.0088 / 1.852; // IUGG mean radius in km / 1.852 km per NM

const col = (line, from, to = from) => line.substring(from - 1, to);
const txt = (line, from, to = from) => col(line, from, to).trim();
const int = (s) => (/^\d+$/.test(s) ? Number(s) : null);
const scaled = (s, divisor) => (int(s) === null ? null : int(s) / divisor);
const round = (n, places) => (n === null ? null : Math.round(n * 10 ** places) / 10 ** places);
const prune = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== ''));

// ARINC 5.36/5.37: latitude N/S DD MM SS ss (9 chars), longitude E/W DDD MM SS ss (10 chars); ss is hundredths.
export function parseLat(s) {
  const m = /^([NS])(\d{2})(\d{2})(\d{4})$/.exec(s);
  if (!m) return null;
  const v = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 100 / 3600;
  return round(m[1] === 'S' ? -v : v, 8);
}
export function parseLon(s) {
  const m = /^([EW])(\d{3})(\d{2})(\d{4})$/.exec(s);
  if (!m) return null;
  const v = Number(m[2]) + Number(m[3]) / 60 + Number(m[4]) / 100 / 3600;
  return round(m[1] === 'W' ? -v : v, 8);
}

// ARINC 5.39: magnetic variation, E/W + 4 digits in tenths of a degree. East is positive here.
export function parseMagVar(s) {
  const m = /^([EW])(\d{4})$/.exec(s);
  if (!m) return null;
  return ((m[1] === 'W' ? -1 : 1) * Number(m[2])) / 10;
}

// ARINC 5.30 altitude: 5 digits of feet, or FLnnn. Anything else (UNKNN, NOTSP) stays raw and gives null.
export function parseAltitude(s) {
  if (/^\d{5}$/.test(s)) return Number(s);
  const m = /^FL(\d{3})$/.exec(s);
  return m ? Number(m[1]) * 100 : null;
}

// ARINC 5.29 altitude description: only the codes this data uses unambiguously are decoded. The glide slope
// codes (G, H, I, J) stay as the raw code with both altitudes.
const ALTITUDE_CONSTRAINT = { ' ': 'at', '+': 'atOrAbove', '-': 'atOrBelow', B: 'between' };

// ARINC 5.17 waypoint description code, position 4 (column 43): A initial approach fix, F final approach fix,
// M missed approach point. The other values stay in descriptionCode.
const FIX_ROLE = { A: 'IAF', F: 'FAF', M: 'MAP' };

// Local projection: spherical azimuthal equidistant centred on the airport reference point (Snyder, Map
// Projections, eq. 22-1 to 22-5). x is NM east, y is NM north; distance and bearing from the centre are exact on
// the sphere. Elevation is not part of it.
export function makeProjection(lat0, lon0) {
  const p0 = (lat0 * Math.PI) / 180;
  const l0 = (lon0 * Math.PI) / 180;
  return (lat, lon) => {
    const p = (lat * Math.PI) / 180;
    const dl = (lon * Math.PI) / 180 - l0;
    const cosC = Math.sin(p0) * Math.sin(p) + Math.cos(p0) * Math.cos(p) * Math.cos(dl);
    const c = Math.acos(Math.min(1, Math.max(-1, cosC)));
    const k = c < 1e-12 ? 1 : c / Math.sin(c);
    return {
      xNm: round(EARTH_RADIUS_NM * k * Math.cos(p) * Math.sin(dl), 4),
      yNm: round(EARTH_RADIUS_NM * k * (Math.cos(p0) * Math.sin(p) - Math.sin(p0) * Math.cos(p) * Math.cos(dl)), 4),
    };
  };
}

// HDR01 columns 36-39 are the cycle (YYCC), HDR04 text carries the effective date.
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const iso = (d, mon, y) => `${y}-${String(MONTHS[mon]).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
export function parseHeader(lines) {
  const h1 = lines.find((l) => l.startsWith('HDR01'));
  const h4 = lines.find((l) => l.startsWith('HDR04'));
  const created = /(\d{2})-([A-Z]{3})-(\d{4})(\d{2}:\d{2}:\d{2})/.exec(col(h1, 42, 60));
  const eff = /VOLUME (\d{4})\s+EFFECTIVE (\d{1,2}) ([A-Z]{3}) (\d{4})/.exec(h4);
  if (!created || !eff) throw new Error('unrecognised CIFP header');
  const cycle = txt(h1, 36, 39);
  if (cycle !== eff[1]) throw new Error(`header cycle mismatch: HDR01 ${cycle}, HDR04 ${eff[1]}`);
  return {
    file: txt(h1, 6, 20),
    format: 'ARINC 424-18',
    cycle,
    effectiveDate: iso(eff[2], eff[3], eff[4]),
    createdAt: `${iso(created[1], created[2], created[3])}T${created[4]}`,
  };
}

// Section P subsection A (4.1.7.1 airport reference point).
export function parseAirport(l) {
  return {
    ident: txt(l, 7, 10),
    region: txt(l, 11, 12),
    iata: txt(l, 14, 16),
    longestRunwayFt: scaled(txt(l, 28, 30), 0.01),
    lat: parseLat(col(l, 33, 41)),
    lon: parseLon(col(l, 42, 51)),
    magneticVariationDeg: parseMagVar(col(l, 52, 56)),
    elevationFt: int(txt(l, 57, 61)),
    transitionAltitudeFt: int(txt(l, 71, 75)),
    name: txt(l, 94, 123),
  };
}

// Section P subsection G (4.1.9 runway). Bearing is magnetic. Elevation is the threshold elevation.
export function parseRunway(l) {
  const ident = txt(l, 14, 18).replace(/^RW/, '');
  const m = /^(\d{2})([LRC]?)$/.exec(ident);
  return {
    ident,
    number: m ? Number(m[1]) : null,
    suffix: m && m[2] ? m[2] : null,
    lengthFt: int(txt(l, 23, 27)),
    magneticBearingDeg: scaled(txt(l, 28, 31), 10),
    lat: parseLat(col(l, 33, 41)),
    lon: parseLon(col(l, 42, 51)),
    ellipsoidHeightRaw: txt(l, 61, 66),
    thresholdElevationFt: int(txt(l, 67, 71)),
    displacedThresholdFt: int(txt(l, 72, 75)),
    tchFt: int(txt(l, 76, 77)),
    widthFt: int(txt(l, 78, 80)),
    tchIndicator: txt(l, 81),
    localizerIdent: txt(l, 82, 85),
    ilsCategoryRaw: txt(l, 86),
  };
}

// Section P subsection I (4.1.11 localizer and glide slope). Bearing is magnetic, widths in hundredths of a degree.
export function parseLocalizer(l) {
  return {
    ident: txt(l, 14, 17),
    categoryRaw: txt(l, 18),
    frequencyMHz: scaled(txt(l, 23, 27), 100),
    runway: txt(l, 28, 32).replace(/^RW/, ''),
    lat: parseLat(col(l, 33, 41)),
    lon: parseLon(col(l, 42, 51)),
    magneticBearingDeg: scaled(txt(l, 52, 55), 10),
    glideSlope: {
      lat: parseLat(col(l, 56, 64)),
      lon: parseLon(col(l, 65, 74)),
      angleDeg: scaled(txt(l, 88, 90), 100),
      thresholdCrossingHeightFt: int(txt(l, 96, 97)),
      elevationFt: int(txt(l, 98, 102)),
    },
    localizerWidthDeg: scaled(txt(l, 84, 87), 100),
    localizerPositionRaw: txt(l, 75, 79),
    glideSlopePositionRaw: txt(l, 80, 83),
    stationDeclinationDeg: parseMagVar(col(l, 91, 95)),
  };
}

// Terminal (PC) and enroute (EA) waypoints share the layout: ident 14-18, region 20-21, lat/lon 33-51,
// dynamic magnetic variation 75-79.
export function parseWaypoint(l) {
  return {
    ident: txt(l, 14, 18),
    region: txt(l, 20, 21),
    lat: parseLat(col(l, 33, 41)),
    lon: parseLon(col(l, 42, 51)),
    magneticVariationDeg: parseMagVar(col(l, 75, 79)),
    name: txt(l, 99, 123),
  };
}

// VHF navaid (section D, blank subsection) and NDB (subsection B). A DME-only facility has no VOR position in
// columns 33-51, so its DME position (56-74) is used.
export function parseNavaid(l) {
  const ndb = l[5] === 'B';
  let lat = parseLat(col(l, 33, 41));
  let lon = parseLon(col(l, 42, 51));
  let positionFrom = 'navaid';
  if (lat === null && !ndb) {
    lat = parseLat(col(l, 56, 64));
    lon = parseLon(col(l, 65, 74));
    positionFrom = 'dme';
  }
  return {
    ident: txt(l, 14, 17),
    region: txt(l, 20, 21),
    kind: ndb ? 'ndb' : 'vor',
    lat,
    lon,
    positionFrom,
    magneticVariationDeg: parseMagVar(col(l, 75, 79)),
    name: txt(l, 94, 123),
  };
}

// Course 71-74: tenths of a degree, trailing T = true. Distance/time 75-78: tenths of NM, or T + tenths of minutes.
function parseCourse(s) {
  const t = /^(\d{3})T$/.exec(s);
  if (t) return { courseDeg: Number(t[1]), courseIsTrue: true };
  return { courseDeg: scaled(s, 10) };
}
function parseRoute(s) {
  if (/^T\d{3}$/.test(s)) return { holdTimeMin: Number(s.slice(1)) / 10 };
  return { distanceNm: scaled(s, 10) };
}

// 4.1.9 / 4.1.10 SID, STAR and approach leg (primary record). The three procedure types share columns 27-123.
export function parseLeg(l) {
  const alt1 = txt(l, 85, 89);
  const alt2 = txt(l, 90, 94);
  const desc = col(l, 40, 43);
  const alt = col(l, 83);
  const hasAlt = alt1 !== '' || alt2 !== '';
  const vertical = txt(l, 103, 106);
  return prune({
    seq: int(txt(l, 27, 29)),
    fixIdent: txt(l, 30, 34),
    fixRegion: txt(l, 35, 36),
    fixSection: txt(l, 37, 38),
    descriptionCode: desc,
    fixRole: FIX_ROLE[desc[3]] ?? null,
    flyover: desc[1] === 'Y' ? true : null,
    turnDirection: txt(l, 44),
    rnpRaw: txt(l, 45, 47),
    pathTerminator: txt(l, 48, 49),
    recommendedNavaid: txt(l, 51, 54),
    recommendedNavaidRegion: txt(l, 55, 56),
    recommendedNavaidSection: txt(l, 79, 80),
    arcRadiusNm: scaled(txt(l, 57, 62), 1000),
    thetaDeg: scaled(txt(l, 63, 66), 10),
    rhoNm: scaled(txt(l, 67, 70), 10),
    ...parseCourse(txt(l, 71, 74)),
    ...parseRoute(txt(l, 75, 78)),
    altitudeDescription: hasAlt ? alt : null,
    altitudeConstraint: hasAlt ? (ALTITUDE_CONSTRAINT[alt] ?? null) : null,
    altitude1Ft: parseAltitude(alt1),
    altitude2Ft: parseAltitude(alt2),
    altitudeRaw: [alt1, alt2].some((a) => a && parseAltitude(a) === null) ? `${alt1}|${alt2}` : null,
    transitionAltitudeFt: parseAltitude(txt(l, 95, 99)),
    speedLimitKt: int(txt(l, 100, 102)),
    verticalAngleDeg: /^-?\d+$/.test(vertical) ? Number(vertical) / 100 : null,
    centerFix: txt(l, 107, 111),
    raw: l.trimEnd(),
  });
}

// A runway transition ident RW08B names both parallels, 08L and 08R (the tests check each expansion exists).
export function transitionRunways(ident) {
  const m = /^RW(\d{2})([LRCB]?)$/.exec(ident);
  if (!m) return null;
  return m[2] === 'B' ? [`${m[1]}L`, `${m[1]}R`] : [m[1] + m[2]];
}

// ARINC 5.7 route type for STARs (types 7-9, profile descents, are not used at KATL and map to 'unknown').
const STAR_ROUTE = {
  1: { kind: 'enrouteTransition', rnav: false },
  2: { kind: 'common', rnav: false },
  3: { kind: 'runwayTransition', rnav: false },
  4: { kind: 'enrouteTransition', rnav: true },
  5: { kind: 'common', rnav: true },
  6: { kind: 'runwayTransition', rnav: true },
};

export function buildAirport(allLines, airportIdent) {
  const header = parseHeader(allLines.slice(0, 4));
  const records = allLines.filter((l) => l.startsWith('S') && l[4] === 'P' && l[5] === ' ' && txt(l, 7, 10) === airportIdent);
  if (!records.length) throw new Error(`no records for ${airportIdent}`);
  const sub = (c) => records.filter((l) => l[12] === c);

  const airport = parseAirport(sub('A')[0]);
  const magVar = airport.magneticVariationDeg;
  const project = makeProjection(airport.lat, airport.lon);
  const place = (o) => (o.lat === null ? o : { ...o, ...project(o.lat, o.lon) });

  const runways = sub('G').map((l) => {
    const r = parseRunway(l);
    return place({ ...r, trueBearingDeg: round((((r.magneticBearingDeg + magVar) % 360) + 360) % 360, 1) });
  });
  const localizers = sub('I').map(parseLocalizer);

  // Everything a leg can reference, keyed ident|region|section.
  const index = new Map();
  const add = (key, o) => {
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(o);
  };
  for (const l of allLines) {
    if (!'01'.includes(col(l, 22))) continue; // skip continuation records (column 22)
    if (l.startsWith('SUSAEA')) {
      const w = parseWaypoint(l);
      add(`${w.ident}|${w.region}|EA`, { type: 'enrouteWaypoint', ...w });
    } else if (l.startsWith('SUSAD ') || l.startsWith('SUSADB')) {
      const n = parseNavaid(l);
      add(`${n.ident}|${n.region}|${n.kind === 'ndb' ? 'DB' : 'D'}`, { type: n.kind, ...n });
    } else if (l.startsWith('SUSAP ') && l[12] === 'C') {
      const w = parseWaypoint(l);
      add(`${w.ident}|${w.region}|PC`, { type: 'terminalWaypoint', owner: txt(l, 7, 10), ...w });
    }
  }
  for (const r of runways) add(`RW${r.ident}|${airport.region}|PG`, { type: 'runway', ident: `RW${r.ident}`, lat: r.lat, lon: r.lon });
  for (const q of localizers) add(`${q.ident}|${airport.region}|PI`, { type: 'localizer', ident: q.ident, lat: q.lat, lon: q.lon });

  const fixes = {};
  const unresolved = [];
  const resolve = (ident, region, section, where) => {
    if (!ident || !section) return null;
    const key = `${ident}|${region}|${section}`;
    if (fixes[key]) return key;
    const hits = index.get(key) ?? [];
    // The same terminal waypoint ident can exist at several airports; the airport's own wins.
    const own = hits.filter((h) => h.owner === airportIdent);
    const pick = own.length === 1 ? own[0] : hits.length === 1 ? hits[0] : null;
    if (!pick) {
      unresolved.push({ key, where, candidates: hits.length });
      return null;
    }
    fixes[key] = prune({
      ident,
      region,
      section,
      type: pick.type,
      owner: pick.owner,
      name: pick.name,
      lat: pick.lat,
      lon: pick.lon,
      ...(pick.lat === null ? {} : project(pick.lat, pick.lon)),
      magneticVariationDeg: pick.magneticVariationDeg,
    });
    return key;
  };
  const link = (leg, where) => {
    const fixKey = resolve(leg.fixIdent, leg.fixRegion, leg.fixSection, where);
    const recommendedNavaidKey = resolve(leg.recommendedNavaid, leg.recommendedNavaidRegion, leg.recommendedNavaidSection, where);
    return prune({ ...leg, fixKey, recommendedNavaidKey });
  };

  // STARs: group by ident, then by route (type + transition). Continuation records (column 39 above 1) are skipped.
  const stars = [];
  const routeByKey = new Map();
  for (const l of sub('E').filter((x) => '01'.includes(txt(x, 39)))) {
    const ident = txt(l, 14, 19);
    let star = stars.find((s) => s.ident === ident);
    if (!star) stars.push((star = { ident, routes: [] }));
    const routeType = txt(l, 20);
    const transition = txt(l, 21, 25);
    const routeKey = `${ident}|${routeType}|${transition}`;
    let route = routeByKey.get(routeKey);
    if (!route) {
      const info = STAR_ROUTE[routeType] ?? { kind: 'unknown', rnav: null };
      route = prune({ routeType, ...info, transition, runways: transitionRunways(transition), legs: [] });
      routeByKey.set(routeKey, route);
      star.routes.push(route);
    }
    route.legs.push(link(parseLeg(l), `${ident} ${transition || 'common'}`));
  }

  // ILS approaches: ident I + runway. Route type A is a transition, I is the final and missed approach.
  const ils = [];
  for (const l of sub('F').filter((x) => '01'.includes(txt(x, 39)) && txt(x, 14).startsWith('I'))) {
    const ident = txt(l, 14, 19);
    let ap = ils.find((a) => a.ident === ident);
    if (!ap) ils.push((ap = { ident, runway: /^I(\d{2}[LRC]?)/.exec(ident)[1], transitions: [], legs: [] }));
    const leg = link(parseLeg(l), ident);
    if (txt(l, 20) === 'A') {
      const name = txt(l, 21, 25);
      let t = ap.transitions.find((x) => x.ident === name);
      if (!t) ap.transitions.push((t = { ident: name, legs: [] }));
      t.legs.push(leg);
    } else {
      ap.legs.push(leg);
    }
  }
  for (const ap of ils) {
    const loc = localizers.find((q) => q.runway === ap.runway);
    ap.localizer = loc ? place(loc) : null;
    const mapAt = ap.legs.findIndex((g) => g.fixRole === 'MAP');
    const fafAt = ap.legs.findIndex((g) => g.fixRole === 'FAF');
    // intermediate: legs before the FAF; final: FAF to the MAP; missed: after the MAP.
    ap.legs.forEach((g, i) => {
      g.segment = mapAt >= 0 && i > mapAt ? 'missed' : i < fafAt ? 'intermediate' : 'final';
    });
    const faf = ap.legs[fafAt];
    ap.faf = faf
      ? prune({
          fixIdent: faf.fixIdent,
          fixKey: faf.fixKey,
          seq: faf.seq,
          altitudeDescription: faf.altitudeDescription,
          altitude1Ft: faf.altitude1Ft,
          altitude2Ft: faf.altitude2Ft,
        })
      : null;
  }

  const otherApproaches = [...new Set(sub('F').map((l) => txt(l, 14, 19)).filter((i) => !i.startsWith('I')))].sort();
  const recordCounts = {};
  for (const l of records) recordCounts[l[12]] = (recordCounts[l[12]] ?? 0) + 1;

  return {
    source: { ...header, airport: airportIdent, tool: 'scripts/cifp.js' },
    projection: {
      type: 'azimuthal equidistant (spherical)',
      sphereRadiusNm: round(EARTH_RADIUS_NM, 4),
      origin: { lat: airport.lat, lon: airport.lon, description: 'airport reference point' },
      units: 'NM',
      axes: 'xNm east, yNm north',
    },
    magneticVariation: {
      degrees: magVar,
      convention: 'east positive; true = magnetic + variation',
      source: `airport reference record ${airportIdent}, columns 52-56 (${col(sub('A')[0], 52, 56)})`,
    },
    airport: place(airport),
    runways,
    ils,
    stars,
    fixes,
    unresolvedFixes: unresolved,
    notExtracted: {
      recordCounts,
      subsections: {
        C: 'terminal waypoints, used only as referenced fixes',
        D: 'SIDs, not extracted',
        S: 'minimum sector altitudes, not extracted',
        P: 'RNAV path points (GLS/LPV), not extracted',
      },
      approachesNotExtracted: otherApproaches,
      continuationRecords: 'not extracted; the KATL STARs and ILS approaches have none',
    },
  };
}

export function readCifp(path) {
  const file = statSync(path).isDirectory() ? join(path, 'FAACIFP18') : path;
  return readFileSync(file, 'latin1').split(/\r?\n/).filter(Boolean);
}

function main() {
  const [path = 'data/raw/FAACIFP18', ident = 'KATL', out] = process.argv.slice(2);
  const data = buildAirport(readCifp(path), ident);
  const target = out ?? join('data', `${ident.toLowerCase()}-${data.source.cycle}.json`);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, `${JSON.stringify(data, null, 1)}\n`);
  console.log(
    `${target}: cycle ${data.source.cycle} effective ${data.source.effectiveDate}, ${data.runways.length} runways, ` +
      `${data.ils.length} ILS, ${data.stars.length} STARs, ${Object.keys(data.fixes).length} fixes, ` +
      `${data.unresolvedFixes.length} unresolved`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
