// Builds data/replay-2026-07.json: real KATL and KCLT arrivals, reduced to what the sim needs and nothing else.
//
// Inputs (all under data/raw/, which git ignores; docs/data.md says where each comes from):
//   data/raw/bts/On_Time_Reporting_Carrier_On_Time_Performance_(1987_present)_2026_7.csv   BTS, one row per flight
//   data/raw/bts/MASTER.txt, data/raw/bts/ACFTREF.txt                                       FAA aircraft registry
//   data/raw/APT_BASE.csv                                                                   FAA NASR airports, cycle 2611
// Run: node scripts/replay.js
//
// For each flight that landed at the hub inside a scenario's window it keeps three things:
//   t    seconds after the window opens that the aircraft appears at the corner post (wheels-on minus LEAD_S)
//   fix  the STAR's enroute transition fix nearest the bearing of the origin airport
//   type one of the sim's fleet types (src/fleet.js), from the FAA registry entry for the tail
// The tail number, the airline, the flight number and the origin are used to get those three and then dropped.
// BTS carries no STAR and no runway, so the entry fix is derived and the runway is not recorded.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLEET_BY_ICAO } from '../src/fleet.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const raw = (f) => path.join(root, 'data', 'raw', f);

// The sim's uncongested time from the corner post to the runway: medians of 22 to 30 minutes over 6 seeds each for KATL west
// and east and KCLT north and south (docs/data.md). BTS gives wheels-on, so the request is that far earlier.
export const LEAD_S = 1500;

export const SCENARIOS = [
  { id: 'fri-evening', name: 'Friday evening push', date: '2026-07-24', fromHour: 19, toHour: 22 },
  { id: 'fri-morning', name: 'Friday morning push', date: '2026-07-17', fromHour: 7, toHour: 10 },
];

// FAA registry model name to a sim fleet type. exact is false where the fleet has no such type and the nearest one stands in.
const TYPE_RULES = [
  [/\b717-2/, 'B712', true],
  [/\b737-7/, 'B737', true],
  [/\b737-8$/, 'B38M', true], // the registry lists the MAX 8 as "737-8"
  [/\b737-8/, 'B738', true],
  [/\b737-9$/, 'B739', false], // MAX 9, not in the fleet
  [/\b737-9/, 'B739', true],
  [/\bA319/, 'A319', true],
  [/\bA320-2\d\dN/, 'A20N', true],
  [/\bA320/, 'A320', true],
  [/\bA321-2\d\dNX?$/, 'A21N', true],
  [/\bA321/, 'A321', true],
  [/BD-500|A220/, 'A319', false], // A220, not in the fleet; similar size and approach speed
  [/CL-600-2D2\d/, 'CRJ9', true],
  [/CL-600-2C10/, 'CRJ7', true],
  [/CL-600-2B19/, 'CRJ2', true],
  [/ERJ 170-200/, 'E75L', true],
  [/ERJ 170-100/, 'E170', true],
  [/ERJ 190|ERJ 195/, 'E170', false],
  [/EMB-145|ERJ 145|ERJ-145/, 'E145', true],
  [/\b757-2/, 'B752', true],
  [/\b757-3/, 'B752', false],
  [/\b767-3/, 'B763', true],
  [/\b767-/, 'B763', false],
  [/\b777-3/, 'B77W', true],
  [/\b777-/, 'B77W', false],
  [/\b787-8/, 'B788', true],
  [/\b787-/, 'B788', false],
  [/\bA330-9/, 'A339', true],
  [/\bA330-3/, 'A333', true],
  [/\bA330-/, 'A333', false],
  [/\bA350/, 'A339', false],
];

export function mapType(model) {
  for (const [re, icao, exact] of TYPE_RULES) if (re.test(model)) return { icao, exact };
  return null;
}

function splitCsv(line) {
  const out = [];
  let cur = '';
  let q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === ',' && !q) {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

const bearing = (a, b) => {
  const r = Math.PI / 180;
  const dl = (b.lon - a.lon) * r;
  const y = Math.sin(dl) * Math.cos(b.lat * r);
  const x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos(dl);
  return ((Math.atan2(y, x) / r) + 360) % 360;
};
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

// The enroute transition fixes of one airport's STARs, with their positions: { ident, lat, lon }.
function transitions(file) {
  const d = JSON.parse(fs.readFileSync(path.join(root, 'data', file), 'utf8'));
  const seen = new Map();
  for (const s of d.stars) {
    for (const r of s.routes) {
      if (r.kind !== 'enrouteTransition') continue;
      const l = r.legs[0];
      const f = d.fixes[`${l.fixIdent}|${l.fixRegion}|${l.fixSection}`];
      if (f && !seen.has(r.transition)) seen.set(r.transition, { ident: r.transition, lat: f.lat, lon: f.lon });
    }
  }
  return { arp: { lat: d.projection.origin.lat, lon: d.projection.origin.lon }, fixes: [...seen.values()] };
}

function loadAirports() {
  const rows = fs.readFileSync(raw('APT_BASE.csv'), 'utf8').split(/\r?\n/);
  const head = splitCsv(rows[0]);
  const ix = (n) => head.indexOf(n);
  const map = new Map();
  for (const l of rows.slice(1)) {
    if (!l) continue;
    const c = splitCsv(l);
    const lat = Number(c[ix('LAT_DECIMAL')]);
    const lon = Number(c[ix('LONG_DECIMAL')]);
    if (Number.isFinite(lat) && Number.isFinite(lon) && !map.has(c[ix('ARPT_ID')])) map.set(c[ix('ARPT_ID')], { lat, lon });
  }
  return map;
}

function loadRegistry() {
  const ref = new Map();
  for (const l of fs.readFileSync(raw('bts/ACFTREF.txt'), 'latin1').split(/\r?\n/).slice(1)) {
    const c = l.split(',');
    if (c[0]) ref.set(c[0], `${c[1].trim()} ${c[2].trim()}`);
  }
  const byTail = new Map();
  for (const l of fs.readFileSync(raw('bts/MASTER.txt'), 'latin1').split(/\r?\n/).slice(1)) {
    const c = l.split(',');
    if (c[0]) byTail.set(`N${c[0].trim()}`, ref.get(c[2].trim()));
  }
  return byTail;
}

function main() {
  const airports = loadAirports();
  const registry = loadRegistry();
  const hubs = { KATL: { code: 'ATL', ...transitions('katl-2611.json') }, KCLT: { code: 'CLT', ...transitions('kclt-2611.json') } };
  const dates = new Set(SCENARIOS.map((s) => s.date));
  const csvFile = fs.readdirSync(raw('bts')).find((f) => f.startsWith('On_Time') && f.endsWith('.csv'));
  const lines = fs.readFileSync(raw(`bts/${csvFile}`), 'latin1').split(/\r?\n/);
  const head = splitCsv(lines[0]);
  const col = Object.fromEntries(['FlightDate', 'Tail_Number', 'Origin', 'Dest', 'WheelsOn', 'Cancelled', 'Diverted'].map((n) => [n, head.indexOf(n)]));

  const kept = { fixed: 0, noOrigin: 0, noType: 0, noTime: 0 };
  const result = SCENARIOS.map((s) => ({ ...s, hubs: { KATL: [], KCLT: [] } }));
  const stats = { exact: 0, mapped: 0, mappedFrom: {} };
  for (const l of lines.slice(1)) {
    if (!l) continue;
    const c = splitCsv(l);
    if (!dates.has(c[col.FlightDate]) || c[col.Cancelled] !== '0.00' || c[col.Diverted] !== '0.00') continue;
    const hubKey = c[col.Dest] === 'ATL' ? 'KATL' : c[col.Dest] === 'CLT' ? 'KCLT' : null;
    if (!hubKey) continue;
    const wo = c[col.WheelsOn];
    if (!/^\d{3,4}$/.test(wo)) { kept.noTime++; continue; }
    const hh = Number(wo.padStart(4, '0').slice(0, 2)) % 24;
    const mm = Number(wo.padStart(4, '0').slice(2));
    const landS = hh * 3600 + mm * 60;
    const hub = hubs[hubKey];
    const o = airports.get(c[col.Origin]);
    if (!o) { kept.noOrigin++; continue; }
    const model = registry.get(c[col.Tail_Number]);
    const type = model && mapType(model);
    if (!type) { kept.noType++; continue; }
    if (!FLEET_BY_ICAO[type.icao]) throw new Error(`rule names ${type.icao}, which is not in the fleet`);
    const b = bearing(hub.arp, o);
    const fix = hub.fixes.reduce((best, f) => (angDiff(bearing(hub.arp, f), b) < angDiff(bearing(hub.arp, best), b) ? f : best)).ident;
    for (const sc of result) {
      if (sc.date !== c[col.FlightDate]) continue;
      const t = landS - LEAD_S - sc.fromHour * 3600;
      if (t < 0 || t >= (sc.toHour - sc.fromHour) * 3600) continue;
      sc.hubs[hubKey].push({ t, fix, type: type.icao });
      kept.fixed++;
      if (type.exact) stats.exact++;
      else { stats.mapped++; stats.mappedFrom[model] = (stats.mappedFrom[model] ?? 0) + 1; }
    }
  }

  // BTS gives whole minutes. Flights that share a minute are spread evenly through it, in file order, so the stream is
  // not stacked on the minute mark. That spread is the one thing here that is not from the data.
  const out = result.map((sc) => {
    const hubsOut = {};
    for (const [k, list] of Object.entries(sc.hubs)) {
      const byMin = new Map();
      for (const e of list) (byMin.get(e.t) ?? byMin.set(e.t, []).get(e.t)).push(e);
      const rows = [];
      for (const [t, g] of byMin) g.forEach((e, i) => rows.push([t + Math.floor((i * 60) / g.length), e.fix, e.type]));
      rows.sort((a, b) => a[0] - b[0]);
      hubsOut[k] = rows;
    }
    return { id: sc.id, name: sc.name, date: sc.date, windowLocal: `${String(sc.fromHour).padStart(2, '0')}:00-${String(sc.toHour).padStart(2, '0')}:00`, hubs: hubsOut };
  });

  const doc = {
    source: {
      flights: 'BTS On-Time Reporting Carrier On-Time Performance, July 2026 (transtats.bts.gov, US Department of Transportation)',
      types: 'FAA Aircraft Registry ReleasableAircraft (registry.faa.gov), matched on tail number and then dropped',
      airports: 'FAA NASR airport base data, cycle 2611',
      tool: 'scripts/replay.js',
    },
    leadS: LEAD_S,
    note: 't is seconds after the window opens that the aircraft reaches the corner post; fix is a STAR enroute transition fix; type is a fleet type.',
    scenarios: out,
  };
  fs.writeFileSync(path.join(root, 'data', 'replay-2026-07.json'), `${JSON.stringify(doc)}\n`);
  for (const sc of out) console.log(sc.id, sc.date, sc.windowLocal, Object.entries(sc.hubs).map(([k, v]) => `${k} ${v.length}`).join(', '));
  console.log('dropped:', JSON.stringify(kept), 'types exact', stats.exact, 'stand-in', stats.mapped);
  console.log(Object.entries(stats.mappedFrom).sort((a, b) => b[1] - a[1]).map(([m, n]) => `${n} ${m}`).join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
