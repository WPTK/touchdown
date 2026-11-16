// Writes data/alternates-<cycle>.json: the airports S.E.A.N. sends arrivals to instead of KATL, with positions from the
// FAA CIFP airport reference point records, projected the same way as data/katl-*.json (NM east and north of KATL).
// usage: node scripts/alternates.js [CIFP file or folder] [output]
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { makeProjection, parseAirport, parseHeader, readCifp } from './cifp.js';

export const ALTERNATES = ['KATL', 'KPDK', 'KBHM', 'KLGC'];

export function buildAlternates(lines) {
  const cycle = parseHeader(lines).cycle;
  const refs = {};
  for (const l of lines) {
    if (l[0] !== 'S' || l[4] !== 'P' || l[12] !== 'A') continue;
    const a = parseAirport(l);
    if (ALTERNATES.includes(a.ident) && !refs[a.ident]) refs[a.ident] = { ...a, raw: l };
  }
  const missing = ALTERNATES.filter((i) => !refs[i]);
  if (missing.length) throw new Error(`no airport reference record for ${missing.join(', ')}`);
  const project = makeProjection(refs.KATL.lat, refs.KATL.lon);
  const airports = Object.fromEntries(
    ALTERNATES.map((i) => {
      const r = refs[i];
      const { xNm, yNm } = project(r.lat, r.lon);
      const distNm = Math.round(Math.hypot(xNm, yNm) * 10) / 10;
      const bearingDeg = Math.round(((Math.atan2(xNm, yNm) * 180) / Math.PI + 360) % 360);
      return [i, { ident: i, name: r.name, lat: r.lat, lon: r.lon, xNm, yNm, distNm, bearingDeg, raw: r.raw }];
    }),
  );
  return { source: { file: 'FAACIFP18', cycle, tool: 'scripts/alternates.js' }, airports };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [path = 'data/raw/FAACIFP18', out] = process.argv.slice(2);
  const data = buildAlternates(readCifp(path));
  const target = out ?? join('data', `alternates-${data.source.cycle}.json`);
  writeFileSync(target, `${JSON.stringify(data, null, 1)}\n`);
  console.log(Object.values(data.airports).map((a) => `${a.ident} ${a.name} ${a.distNm} NM @ ${a.bearingDeg}`).join('\n'));
}
