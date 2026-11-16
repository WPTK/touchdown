// Which airports sit inside which ARTCC, from FAA data only: the CIFP airport reference records (position, name,
// longest runway) tested against the NASR ARB boundaries (data/artcc-2611.json), with the FAA hub class from
// data/hubs-cy2025.json. Writes data/region-2611.json: every large, medium and small hub and
// KPDK (a general aviation reliever the alternates already use), with the centre it is in, in the KATL frame. Only airports
// inside the five centres are kept. Hub airports outside the lower 48 do not match (the ident here is K plus the FAA id).
// Usage: node scripts/region.js [CIFP file or folder] [output json]
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { makeProjection, parseAirport, readCifp } from './cifp.js';

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function inRing(ring, x, y) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.yNm > y !== b.yNm > y && x < ((b.xNm - a.xNm) * (y - a.yNm)) / (b.yNm - a.yNm) + a.xNm) inside = !inside;
  }
  return inside;
}
export const centerAt = (artcc, x, y) => Object.values(artcc.centers).find((c) => c.shapes.some((s) => inRing(s, x, y)))?.ident ?? null;

const EXTRA = ['KPDK']; // a busy general aviation reliever in the data, kept as a field even though it is not a hub

export function buildRegion(lines, artcc, hubs) {
  const katl = lines.find((l) => l.startsWith('SUSAP KATLK7A'));
  const a0 = parseAirport(katl);
  const project = makeProjection(a0.lat, a0.lon);
  const want = new Map(hubs.airports.map((h) => [`K${h.locid}`, h]));
  const out = [];
  for (const l of lines) {
    if (!l.startsWith('SUSAP ') || l[12] !== 'A' || l[21] !== '0') continue;
    const a = parseAirport(l);
    if (!want.has(a.ident) && !EXTRA.includes(a.ident)) continue;
    if (a.lat === null) continue;
    const p = project(a.lat, a.lon);
    const h = want.get(a.ident);
    out.push({
      ident: a.ident,
      iata: a.iata,
      name: a.name,
      hub: h?.hub ?? null,
      enplanementsCY25: h?.enplanementsCY25 ?? null,
      lat: a.lat,
      lon: a.lon,
      elevationFt: a.elevationFt,
      longestRunwayFt: a.longestRunwayFt,
      ...p,
      artcc: centerAt(artcc, p.xNm, p.yNm),
    });
  }
  return out.filter((a) => a.artcc).sort((x, y) => (x.artcc ?? '~').localeCompare(y.artcc ?? '~') || (y.enplanementsCY25 ?? 0) - (x.enplanementsCY25 ?? 0));
}

function main() {
  const [cifp = 'data/raw/FAACIFP18', out = 'data/region-2611.json'] = process.argv.slice(2);
  const airports = buildRegion(readCifp(cifp), read('data/artcc-2611.json'), read('data/hubs-cy2025.json'));
  writeFileSync(out, `${JSON.stringify({ source: { tool: 'scripts/region.js', cifpCycle: '2611', hubs: 'data/hubs-cy2025.json', boundaries: 'data/artcc-2611.json' }, airports }, null, 1)}\n`);
  for (const a of airports.filter((x) => x.artcc)) console.log(a.artcc, a.ident, a.hub ?? '-', a.longestRunwayFt, a.name);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
