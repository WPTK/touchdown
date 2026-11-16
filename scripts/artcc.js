// ARTCC boundaries from the FAA NASR ARB file (ARTCC boundary segments), projected into the regional frame:
// NM east and north of the KATL airport reference point, the same projection as data/katl-2611.json.
// Usage: node scripts/artcc.js [ARB.txt] [CIFP file or folder] [output json]
//   defaults: data/raw/nasr-261029/arb/ARB.txt, data/raw/FAACIFP18 (for the KATL reference point), data/artcc-<cycle>.json
// Layout: docs of arb_rf.txt (397-character records). Columns 1-12 id (centre, altitude structure, point), 63-76 latitude
// DD-MM-SS.SH, 77-90 longitude DDD-MM-SS.SH, 91-390 description of the line to the next point. Every segment in the
// five centres used here is a straight line ("TO"); a shape closes at "TO POINT OF BEGINNING".
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildAirport, makeProjection, readCifp } from './cifp.js';

export const CENTERS = ['ZTL', 'ZJX', 'ZME', 'ZDC', 'ZID'];
const col = (l, a, b) => l.substring(a - 1, b).trim();

// 035-46-00.0N -> signed degrees. The ARB file writes degrees-minutes-seconds with tenths of a second.
export function parseArbCoord(s) {
  const m = /^(\d{2,3})-(\d{2})-(\d{2}(?:\.\d)?)([NSEW])$/.exec(s);
  if (!m) throw new Error(`bad ARB coordinate ${s}`);
  const v = Number(m[1]) + Number(m[2]) / 60 + Number(m[3]) / 3600;
  return m[4] === 'S' || m[4] === 'W' ? -v : v;
}

// Closed shapes per centre and altitude structure ('H' high, 'L' low), as lists of {lat, lon}.
export function parseArb(text) {
  const out = {};
  const open = {};
  for (const l of text.split(/\r?\n/)) {
    if (l.length < 100) continue;
    const id = col(l, 1, 12);
    const center = id.slice(0, 3);
    const struct = id.slice(4, 5) === '*' ? id.slice(5, 6) : null;
    if (!CENTERS.includes(center) || !struct) continue;
    const desc = col(l, 91, 390);
    if (!/\bTO( POINT OF BEGINNING\.?)?$/.test(desc) || /ARC|CIRCLE|RADIUS/.test(desc)) throw new Error(`${id}: not a straight segment: ${desc}`);
    const key = `${center}|${struct}`;
    (open[key] ??= [[]]).at(-1).push({ lat: parseArbCoord(col(l, 63, 76)), lon: parseArbCoord(col(l, 77, 90)) });
    if (/POINT OF BEGINNING/.test(col(l, 91, 390))) (open[key] ??= []).push([]);
  }
  for (const [key, shapes] of Object.entries(open)) {
    const [c, s] = key.split('|');
    (out[c] ??= {})[s] = shapes.filter((p) => p.length >= 3);
  }
  return out;
}

const round = (n, p = 2) => Math.round(n * 10 ** p) / 10 ** p;

export function buildArtcc(arbText, katl) {
  const project = makeProjection(katl.airport.lat, katl.airport.lon);
  const parsed = parseArb(arbText);
  const centers = {};
  for (const c of CENTERS) {
    centers[c] = {
      ident: c,
      // High structure: the one the enroute picture uses. The low structure (below FL240) is not carried.
      shapes: (parsed[c]?.H ?? (() => { throw new Error(`${c} has no high structure in the ARB file`); })()).map((ring) => ring.map((p) => ({ lat: round(p.lat, 5), lon: round(p.lon, 5), ...project(p.lat, p.lon) }))),
    };
  }
  return { projection: { origin: 'KATL airport reference point', ...katl.projection }, structure: 'H (high)', centers };
}

function main() {
  const [arb = 'data/raw/nasr-261029/arb/ARB.txt', cifp = 'data/raw/FAACIFP18', out] = process.argv.slice(2);
  const katl = buildAirport(readCifp(cifp), 'KATL');
  const data = { source: { file: 'ARB.txt (FAA NASR 28-day subscription)', cycleEffective: '2026-10-29', url: 'https://nfdc.faa.gov/webContent/28DaySub/2026-10-29/ARB.zip', tool: 'scripts/artcc.js' }, ...buildArtcc(readFileSync(arb, 'latin1'), katl) };
  const target = out ?? `data/artcc-${katl.source.cycle}.json`;
  writeFileSync(target, `${JSON.stringify(data)}\n`);
  for (const c of Object.values(data.centers)) console.log(c.ident, c.shapes.map((s) => s.length).join('+'), 'points');
  console.log(target);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
