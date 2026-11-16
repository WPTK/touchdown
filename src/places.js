// Where S.E.A.N. puts airplanes. Airports come from the FAA CIFP airport reference records (data/alternates-2611.json,
// made by scripts/alternates.js), as NM east and north of KATL. The field is not in any FAA record: it is placed
// 2.5 NM from the LaGrange-Callaway reference point, an arbitrary offset, because a field is just a field.
import alt from '../data/alternates-2611.json' with { type: 'json' };

const A = alt.airports;
const FIELD_OFFSET = { distNm: 2.5, bearingDeg: 340 };
const rad = (d) => (d * Math.PI) / 180;
const fx = A.KLGC.xNm + FIELD_OFFSET.distNm * Math.sin(rad(FIELD_OFFSET.bearingDeg));
const fy = A.KLGC.yNm + FIELD_OFFSET.distNm * Math.cos(rad(FIELD_OFFSET.bearingDeg));
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

function place(ident, short, name, x, y, kind) {
  const distNm = Math.round(Math.hypot(x, y) * 10) / 10;
  const bearingDeg = Math.round(((Math.atan2(x, y) * 180) / Math.PI + 360) % 360);
  const dir = COMPASS[Math.round(bearingDeg / 45) % 8];
  return Object.freeze({ ident, short, name, kind, xNm: x, yNm: y, distNm, bearingDeg, where: distNm ? `${Math.round(distNm)} NM ${dir} of KATL` : 'KATL' });
}

export const PLACES = Object.freeze({
  KATL: place('KATL', 'Hartsfield', 'Hartsfield-Jackson Atlanta', 0, 0, 'airport'),
  KPDK: place('KPDK', 'Peachtree-DeKalb', A.KPDK.name, A.KPDK.xNm, A.KPDK.yNm, 'airport'),
  KBHM: place('KBHM', 'Birmingham', A.KBHM.name, A.KBHM.xNm, A.KBHM.yNm, 'airport'),
  FIELD: place('FIELD', 'a field outside LaGrange', 'A field outside LaGrange', fx, fy, 'field'),
});

// Diversion odds, drawn from S.E.A.N.'s own stream. The field also takes anyone who runs out of fuel.
export const DIVERT_TO = Object.freeze([['KBHM', 0.4], ['KPDK', 0.4], ['FIELD', 0.2]]);

// ---- KCLT: the same for Charlotte ----------------------------------------------------------------------------------------
// The alternates are other FAA airports inside ZTL (data/region-2611.json: position and name from the CIFP airport
// reference records), measured from KCLT in KCLT's own projection. As at Atlanta, the field is not in any FAA record: it is
// 2.5 NM from the reference point of KAVL at 340 degrees, an arbitrary offset.
import region from '../data/region-2611.json' with { type: 'json' };
import { makeProjection } from './geo.js';

function placesAround(homeIdent, homeShort, others, field) {
  const R = Object.fromEntries(region.airports.map((a) => [a.ident, a]));
  const project = makeProjection(R[homeIdent].lat, R[homeIdent].lon);
  const at = (ident) => project(R[ident].lat, R[ident].lon);
  const mk = (ident, short, name, x, y, kind) => {
    const distNm = Math.round(Math.hypot(x, y) * 10) / 10;
    const bearingDeg = Math.round(((Math.atan2(x, y) * 180) / Math.PI + 360) % 360);
    const dir = COMPASS[Math.round(bearingDeg / 45) % 8];
    return Object.freeze({ ident, short, name, kind, xNm: x, yNm: y, distNm, bearingDeg, where: distNm ? `${Math.round(distNm)} NM ${dir} of ${homeIdent}` : homeIdent });
  };
  const out = { [homeIdent]: mk(homeIdent, homeShort, R[homeIdent].name, 0, 0, 'airport') };
  for (const [ident, short] of others) {
    const p = at(ident);
    out[ident] = mk(ident, short, R[ident].name, p.xNm, p.yNm, 'airport');
  }
  const base = at(field.near);
  out.FIELD = mk('FIELD', `a field outside ${field.town}`, `A field outside ${field.town}`, base.xNm + 2.5 * Math.sin(rad(340)), base.yNm + 2.5 * Math.cos(rad(340)), 'field');
  return Object.freeze(out);
}

export const PLACES_KCLT = placesAround('KCLT', 'Charlotte', [['KGSO', 'Piedmont Triad'], ['KGSP', 'Greenville-Spartanburg']], { near: 'KAVL', town: 'Asheville' });
export const DIVERT_KCLT = Object.freeze([['KGSO', 0.4], ['KGSP', 0.4], ['FIELD', 0.2]]);
