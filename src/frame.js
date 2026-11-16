// The regional frame: NM east and north of the KATL reference point. Each hub's sim runs in its own frame centred on its
// own airport; this converts between them through latitude and longitude, so the two projections never get mixed up.
import region from '../data/region-2611.json' with { type: 'json' };
import artcc from '../data/artcc-2611.json' with { type: 'json' };
import { makeProjection, makeInverse } from './geo.js';

export { region, artcc };
const katl = region.airports.find((a) => a.ident === 'KATL');
const project = makeProjection(katl.lat, katl.lon);
const HUB_IDENTS = ['KATL', 'KCLT'];
export const HUBS = Object.fromEntries(
  HUB_IDENTS.map((id) => {
    const a = region.airports.find((x) => x.ident === id);
    return [id, { ident: id, iata: a.iata, x: a.xNm, y: a.yNm, lat: a.lat, lon: a.lon }];
  }),
);
const inverse = Object.fromEntries(HUB_IDENTS.map((id) => [id, makeInverse(HUBS[id].lat, HUBS[id].lon)]));

// A point in a hub sim's local frame, in the regional frame.
export function localToRegion(ident, x, y) {
  if (ident === 'KATL') return { x, y };
  const { lat, lon } = inverse[ident](x, y);
  const p = project(lat, lon);
  return { x: p.xNm, y: p.yNm };
}

// The five centres together: [x0, x1, y0, y1], and a centroid per centre for its label.
export const BOUNDS = (() => {
  const pts = Object.values(artcc.centers).flatMap((c) => c.shapes.flat());
  const xs = pts.map((p) => p.xNm);
  const ys = pts.map((p) => p.yNm);
  return [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
})();
export const LABELS = Object.values(artcc.centers).map((c) => {
  const big = c.shapes.reduce((a, b) => (b.length > a.length ? b : a));
  return { ident: c.ident, x: big.reduce((s, p) => s + p.xNm, 0) / big.length, y: big.reduce((s, p) => s + p.yNm, 0) / big.length };
});
