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
