// Writes data/classb-atl.json: the KATL Class B shelves from the FAA's Class Airspace feature service, projected the same
// way as data/katl-*.json (NM east and north of the airport reference point). The monitor uses them for 14 CFR 91.117(c):
// no more than 200 kt in the airspace underlying a Class B area.
// usage: node scripts/classb.js [output]     (needs network; the FAA service takes no key)
import { writeFileSync } from 'node:fs';
import { makeProjection } from './cifp.js';

const URL =
  'https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/Class_Airspace/FeatureServer/0/query?where=IDENT%3D%27ATL%27+AND+CLASS%3D%27B%27&outFields=*&f=geojson';
const ARP = { lat: 33.6367, lon: -84.42786389 }; // the same reference point as data/katl-2611.json
const TOL_NM = 0.02; // Douglas-Peucker tolerance: the outlines carry a vertex every few hundred feet

function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts.at(-1)];
  let worst = 0;
  let at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1e-9;
    const d = Math.abs((b.x - a.x) * (a.y - pts[i].y) - (a.x - pts[i].x) * (b.y - a.y)) / len;
    if (d > worst) [worst, at] = [d, i];
  }
  if (worst <= tol) return [a, b];
  return [...simplify(pts.slice(0, at + 1), tol).slice(0, -1), ...simplify(pts.slice(at), tol)];
}

// A closed ring starts and ends at the same point, so split it at the vertex farthest from the start first.
function simplifyRing(pts, tol) {
  let far = 1;
  for (let i = 1; i < pts.length; i++) if (Math.hypot(pts[i].x - pts[0].x, pts[i].y - pts[0].y) > Math.hypot(pts[far].x - pts[0].x, pts[far].y - pts[0].y)) far = i;
  return [...simplify(pts.slice(0, far + 1), tol).slice(0, -1), ...simplify(pts.slice(far), tol)];
}

const res = await fetch(URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!res.ok) throw new Error(`${res.status} from the FAA service`);
const gj = await res.json();
const project = makeProjection(ARP.lat, ARP.lon);
const round = (v) => Math.round(v * 1000) / 1000;
const areas = gj.features.map((f) => {
  const p = f.properties;
  const ring = f.geometry.coordinates[0].map(([lon, lat]) => {
    const { xNm, yNm } = project(lat, lon);
    return { x: xNm, y: yNm };
  });
  return {
    sector: p.SECTOR,
    floorFt: p.LOWER_VAL, // MSL, except 0 which is the surface
    ceilingFt: p.UPPER_VAL,
    ring: simplifyRing(ring, TOL_NM).map((v) => [round(v.x), round(v.y)]),
  };
});
const out = {
  source: { service: 'FAA Class_Airspace feature service (ArcGIS), IDENT=ATL, CLASS=B', url: URL, retrieved: new Date().toISOString().slice(0, 10), tool: 'scripts/classb.js' },
  simplifiedToleranceNm: TOL_NM,
  projection: 'same as data/katl-2611.json',
  areas,
};
writeFileSync(process.argv[2] ?? 'data/classb-atl.json', JSON.stringify(out) + '\n');
console.log(`${areas.length} areas, ${areas.reduce((n, a) => n + a.ring.length, 0)} vertices`);
