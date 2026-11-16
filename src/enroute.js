// Enroute traffic across Atlanta Center, in the regional frame (NM east and north of the KATL reference point).
// Aircraft fly straight, level and at constant speed through ZTL at FL290 to FL410, and are handed from one centre's
// S.E.A.N. to the next as they cross the ARTCC boundaries (data/artcc-2611.json). They never talk to the TRACON sims:
// the lowest enroute level is 29,000 ft and the arrival stacks end at 14,000.
//
// Rules, from the local JO 7110.65 text (docs/data.md has the paragraph numbers):
// - 5-5-4 (ERAM): lateral separation is 5 NM below FL600.
// - 4-5-1: vertical separation is 1,000 ft up to and including FL410, and 2,000 ft between a non-RVSM aircraft and
//   any other aircraft at or above FL290. (2,000 ft above FL410 never comes up: nothing here goes above FL410.)
// - 4-5-2 TBL 4-5-1: courses 0 to 179 magnetic use odd cardinal levels, 180 to 359 even. The levels are 2,000 ft
//   apart. The course here is true; the difference is a few degrees of variation, which the text does not model.
// The text only names "non-RVSM", so RVSM is the 1,000 ft default and a planted non-RVSM aircraft gets 2,000.
//
// The safe controller assigns a level and a start time only when the straight-line path has no conflict with anything
// already flying, which is exact because nothing turns, climbs or changes speed. S.E.A.N. picks any level and never
// looks. Either way `observeEnroute` is the monitor: it counts a loss when both limits are broken at once.
import { mulberry32 } from './rng.js';
import { centerAt } from './geo.js';
import artcc from '../data/artcc-2611.json' with { type: 'json' };

export const LATERAL_NM = 5;
export const VERTICAL_FT = 1000;
export const VERTICAL_NON_RVSM_FT = 2000;
const MARGIN_NM = 1; // the probe keeps this much beyond the minimum
const HALF_ROUTE_NM = 330; // a route runs this far either side of its point inside ZTL
const AIRLINES = ['PEACH', 'GRITS', 'KUDZU', 'PECAN', 'OKRA']; // fictional carriers (#31)
const TYPES = ['B738', 'A320', 'A321', 'B739', 'E75L', 'CRJ9', 'B38M', 'A20N', 'B763', 'B77W'];
const NON_RVSM_SHARE = 0.04;

// Eastbound (course 0 to 179) odd levels, westbound even, 2,000 ft apart: 4-5-2 TBL 4-5-1.
export const LEVELS_EAST = Object.freeze([290, 310, 330, 350, 370, 390, 410]);
export const LEVELS_WEST = Object.freeze([300, 320, 340, 360, 380, 400]);
export const levelsFor = (courseDeg) => (courseDeg >= 0 && courseDeg < 180 ? LEVELS_EAST : LEVELS_WEST);
export const requiredVerticalFt = (a, b) => (a.rvsm && b.rvsm ? VERTICAL_FT : VERTICAL_NON_RVSM_FT);

const ZTL_BOX = { x: [-199, 227], y: [-139, 225] };
export const centerName = (x, y) => centerAt(artcc, x, y);

export function createEnroute({ seed = 1, perHour = 60, controller = 'safe' } = {}) {
  const en = { t: 0, rng: mulberry32(seed * 7919 + 17), perHour, controller, aircraft: [], nextId: 1, nextSpawnT: 0, handoffs: [], losses: [], open: new Set(), overflown: 0, rejected: 0, shed: 0, steps: 0 };
  // Start with the sky already full: place aircraft partway along their routes.
  const inFlight = Math.round((perHour * (2 * HALF_ROUTE_NM)) / 450);
  for (let i = 0; i < inFlight; i++) spawn(en, en.rng() * 0.9 + 0.05, false);
  return en;
}

const pick = (en, arr) => arr[Math.floor(en.rng() * arr.length)];

function newRoute(en) {
  let x;
  let y;
  do {
    x = ZTL_BOX.x[0] + en.rng() * (ZTL_BOX.x[1] - ZTL_BOX.x[0]);
    y = ZTL_BOX.y[0] + en.rng() * (ZTL_BOX.y[1] - ZTL_BOX.y[0]);
  } while (centerName(x, y) !== 'ZTL');
  const course = Math.floor(en.rng() * 360);
  const rad = (course * Math.PI) / 180;
  const dx = Math.sin(rad);
  const dy = Math.cos(rad);
  return { course, dx, dy, x0: x - dx * HALF_ROUTE_NM, y0: y - dy * HALF_ROUTE_NM, lengthNm: 2 * HALF_ROUTE_NM };
}

function candidate(en, startFrac) {
  const route = newRoute(en);
  const speedKt = 430 + Math.floor(en.rng() * 7) * 10;
  const s = route.lengthNm * startFrac;
  return {
    id: en.nextId,
    callsign: `${pick(en, AIRLINES)}${100 + Math.floor(en.rng() * 8900)}`,
    type: pick(en, TYPES),
    rvsm: en.rng() >= NON_RVSM_SHARE,
    speedKt,
    course: route.course,
    route,
    x: route.x0 + route.dx * s,
    y: route.y0 + route.dy * s,
    vx: (route.dx * speedKt) / 3600, // NM per second
    vy: (route.dy * speedKt) / 3600,
    leftNm: route.lengthNm - s,
    alt: 0,
    center: null,
    kind: 'enroute',
  };
}

// Closest approach of two straight, constant-speed tracks over the seconds both are still flying.
export function closestNm(a, b) {
  const rx = b.x - a.x;
  const ry = b.y - a.y;
  const vx = b.vx - a.vx;
  const vy = b.vy - a.vy;
  const horizon = Math.min(a.leftNm / Math.hypot(a.vx, a.vy), b.leftNm / Math.hypot(b.vx, b.vy));
  const vv = vx * vx + vy * vy;
  const tStar = vv < 1e-12 ? 0 : Math.min(Math.max(-(rx * vx + ry * vy) / vv, 0), horizon);
  return Math.hypot(rx + vx * tStar, ry + vy * tStar);
}

const conflicts = (en, c) =>
  en.aircraft.some((a) => Math.abs(a.alt * 100 - c.alt * 100) < requiredVerticalFt(a, c) && closestNm(a, c) < LATERAL_NM + MARGIN_NM);

// Safe: the first level of the right set with a clear path, tried in a random order. S.E.A.N.: any level at all.
function assign(en, c) {
  if (en.controller === 'sean') {
    c.alt = 290 + 10 * Math.floor(en.rng() * 13);
    return true;
  }
  const levels = [...levelsFor(c.course)];
  for (let i = levels.length - 1; i > 0; i--) {
    const j = Math.floor(en.rng() * (i + 1));
    [levels[i], levels[j]] = [levels[j], levels[i]];
  }
  for (const fl of levels) {
    c.alt = fl;
    if (!conflicts(en, c)) return true;
    en.rejected++;
  }
  return false;
}

function spawn(en, startFrac, count = true) {
  for (let tries = 0; tries < 40; tries++) {
    const c = candidate(en, startFrac);
    if (!assign(en, c)) continue;
    en.nextId++;
    c.center = centerName(c.x, c.y);
    en.aircraft.push(c);
    return c;
  }
  if (count) en.shed++; // no clear level in 40 tries: this one is not flown, so the real rate can sit under perHour
  return null;
}

export const handoffLine = (h) =>
  `${h.callsign}, S.E.A.N. ${h.from} hands off to S.E.A.N. ${h.to}. Radar contact. Contact S.E.A.N. on one three two point zero five.`;

export function stepEnroute(en, dt = 1) {
  en.t += dt;
  en.steps++;
  if (en.perHour > 0 && en.t >= en.nextSpawnT) {
    spawn(en, 0);
    en.nextSpawnT = en.t - (3600 / en.perHour) * Math.log(1 - en.rng());
  }
  for (const a of en.aircraft) {
    a.x += a.vx * dt;
    a.y += a.vy * dt;
    a.leftNm -= Math.hypot(a.vx, a.vy) * dt;
    const c = centerName(a.x, a.y);
    if (c !== a.center) {
      // Only boundaries between the five centres are handoffs; leaving or entering the map is not.
      if (a.center && c) en.handoffs.push({ t: en.t, id: a.id, callsign: a.callsign, from: a.center, to: c, x: a.x, y: a.y });
      a.center = c;
    }
  }
  const done = en.aircraft.filter((a) => a.leftNm <= 0);
  if (done.length) {
    en.overflown += done.length;
    en.aircraft = en.aircraft.filter((a) => a.leftNm > 0);
  }
  observeEnroute(en);
}

// The monitor. A loss is both limits broken at once (5-5-4 and 4-5-1); each pair is counted once per encounter.
export function observeEnroute(en) {
  const live = new Set();
  const ac = en.aircraft;
  for (let i = 0; i < ac.length; i++) {
    for (let j = i + 1; j < ac.length; j++) {
      const a = ac[i];
      const b = ac[j];
      const dz = Math.abs(a.alt - b.alt) * 100;
      if (dz >= requiredVerticalFt(a, b)) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d >= LATERAL_NM) continue;
      const key = `${a.id}-${b.id}`;
      live.add(key);
      if (!en.open.has(key)) {
        en.losses.push({ t: en.t, a: a.callsign, b: b.callsign, lateralNm: Math.round(d * 10) / 10, verticalFt: dz, center: a.center, paragraph: '5-5-4 and 4-5-1' });
      }
    }
  }
  en.open = live;
}
