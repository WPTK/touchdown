// The real KATL airspace, built from data/katl-2611.json (FAA CIFP cycle 2611, see docs/data.md). Nothing here is typed
// in from memory: positions are the file's own xNm/yNm (NM east and north of the airport reference point, the spherical
// azimuthal equidistant projection Phase 1 documented), and every route is a chain of fixes read from the STAR and ILS
// records. Pure, no DOM.
//
// A route has two parts. The outer part runs from where the aircraft appears on a STAR enroute transition to the hold
// fix H, the first fix of the runway transition. The inner part runs from H over the rest of the STAR, a vector to the
// initial approach fix when the STAR ends in a vector (FM), the ILS approach transition, the intermediate fix, the FAF
// and the threshold. Where the arrival is vectored, the sim flies a straight line to the nearest IAF: that vector is a
// sim choice (the CIFP has no data for it).

import data from '../data/katl-2611.json' with { type: 'json' };

export const AIRPORT = data.airport;
export const CYCLE = data.source;

const fixOf = (key) => {
  const f = data.fixes[key];
  if (!f) throw new Error(`unknown fix ${key}`);
  return f;
};
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// The weather file names runways as controllers say them (8L, 9R); the CIFP pads them (08L, 09R).
export const rwId = (r) => (/^\d[LR]?$/.test(r) ? `0${r}` : r);
const pt = (f) => ({ x: f.xNm, y: f.yNm, id: f.ident });

// ---- runways and approaches ---------------------------------------------------------------------------------------

export const RUNWAYS = Object.freeze(
  Object.fromEntries(
    data.runways.map((r) => [
      r.ident,
      Object.freeze({
        ident: r.ident,
        x: r.xNm,
        y: r.yNm,
        elevFt: r.thresholdElevationFt,
        tchFt: r.tchFt,
        lengthNm: r.lengthFt / 6076.12,
        trueBearingDeg: r.trueBearingDeg,
        // Unit vector the aircraft flies on final, along the runway heading.
        dir: { x: Math.sin((r.trueBearingDeg * Math.PI) / 180), y: Math.cos((r.trueBearingDeg * Math.PI) / 180) },
      }),
    ]),
  ),
);

// Centerline spacing of two parallel runways in feet, from the projected thresholds. Each pair is parallel
// (every runway is 090 or 270 true), so the spacing is the north-south offset.
export function spacingFt(a, b) {
  a = rwId(a);
  b = rwId(b);
  return Math.abs(RUNWAYS[a].y - RUNWAYS[b].y) * 6076.12;
}

// 5-5-4 notes: parallel runways under 2,500 ft apart count as a single runway for wake.
export const WAKE_SINGLE_RUNWAY_FT = 2500;
export function sameWakeRunway(a, b) {
  a = rwId(a);
  b = rwId(b);
  if (a === b) return true;
  return RUNWAYS[a].dir.x === RUNWAYS[b].dir.x && spacingFt(a, b) < WAKE_SINGLE_RUNWAY_FT;
}

// 5-9-8: PRM is required for simultaneous independent approaches on centerlines under 4,300 ft.
export const PRM_BELOW_FT = 4300;

const approachByRunway = new Map(data.ils.map((a) => [a.runway, a]));

// ---- paths ----------------------------------------------------------------------------------------------------------

// A path is a list of vertices {x, y, id, ...} with cumulative length `s` on each. `at(path, s)` interpolates.
export function makePath(verts) {
  const out = [];
  for (const v of verts) {
    const prev = out.at(-1);
    if (prev && dist(prev, v) < 1e-6) {
      // The same fix twice (a STAR ending where the approach begins): keep one vertex, the later role and altitude.
      for (const k of ['alt', 'altKind', 'role']) if (v[k] !== undefined) prev[k] = v[k];
      continue;
    }
    out.push({ ...v, s: prev ? prev.s + dist(prev, v) : 0 });
  }
  return { verts: out, len: out.at(-1).s };
}

export function pointAt(path, s) {
  const vs = path.verts;
  if (s <= 0) return { x: vs[0].x, y: vs[0].y, dx: seg(vs, 0).dx, dy: seg(vs, 0).dy };
  if (s >= path.len) {
    const g = seg(vs, vs.length - 2);
    return { x: vs.at(-1).x, y: vs.at(-1).y, dx: g.dx, dy: g.dy };
  }
  let lo = 0;
  let hi = vs.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (vs[mid].s <= s) lo = mid;
    else hi = mid;
  }
  const g = seg(vs, lo);
  const f = (s - vs[lo].s) / (vs[lo + 1].s - vs[lo].s);
  return { x: vs[lo].x + (vs[lo + 1].x - vs[lo].x) * f, y: vs[lo].y + (vs[lo + 1].y - vs[lo].y) * f, dx: g.dx, dy: g.dy };
}
function seg(vs, i) {
  const a = vs[Math.max(0, Math.min(vs.length - 2, i))];
  const b = vs[Math.max(0, Math.min(vs.length - 2, i)) + 1];
  const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { dx: (b.x - a.x) / l, dy: (b.y - a.y) / l };
}

// ---- STARs -----------------------------------------------------------------------------------------------------------

const STARS = new Map(data.stars.map((s) => [s.ident, s]));

const rwTrans = (star, runway) => star.routes.find((r) => r.kind === 'runwayTransition' && r.runways.includes(runway));
const common = (star) => star.routes.find((r) => r.kind === 'common');
const enroute = (star) => star.routes.filter((r) => r.kind === 'enrouteTransition');

// STARs a flow can use, with the runways each serves. A STAR serves a runway if it has a runway transition that names
// it, or, for a STAR with no runway transitions (GNDLF3, JJEDI4), if its common route ends in a vector (FM) and the
// vector point is on the side of the airport the landing traffic comes from: a final to a west runway comes in from the
// east, so a vector point east of the field fits west flow.
function servesRunway(star, runway) {
  runway = rwId(runway);
  if (rwTrans(star, runway)) return true;
  if (star.routes.some((r) => r.kind === 'runwayTransition')) return false;
  const c = common(star);
  const last = c.legs.at(-1);
  if (last.pathTerminator !== 'FM') return false;
  const f = fixOf(last.fixKey);
  const west = RUNWAYS[runway].dir.x < 0; // flies west: arrives from the east
  return west ? f.xNm > 0 : f.xNm < 0;
}

// STAR idents with their enroute transition idents, for one list of runways.
export function starsFor(runways) {
  return data.stars
    .filter((s) => runways.every((r) => servesRunway(s, r)))
    .map((s) => ({ ident: s.ident, transitions: enroute(s).map((e) => e.transition) }));
}

// The hold fix: the first fix of the runway transition (the split between runways), or the first fix of a STAR that
// has none.
function holdKey(star) {
  const rt = star.routes.find((r) => r.kind === 'runwayTransition');
  if (rt) return rt.legs[0].fixKey;
  return common(star).legs[0].fixKey;
}
export const holdFix = (starIdent) => pt(fixOf(holdKey(STARS.get(starIdent))));

// Outer part of a route: the points from the STAR enroute transition, at the first spot within `radiusNm` of the
// airport (or the transition's own first fix, when that is already inside), down to the hold fix.
export function outerPath(starIdent, transition, radiusNm) {
  const star = STARS.get(starIdent);
  const hk = holdKey(star);
  const legs = [...enroute(star).find((e) => e.transition === transition).legs, ...common(star).legs];
  const pts = [];
  for (const l of legs) {
    const f = pt(fixOf(l.fixKey));
    if (l.fixKey === hk) {
      pts.push(f);
      break;
    }
    pts.push(f);
  }
  // Start where the transition first comes within the radius, on the leg that crosses it.
  let start = 0;
  while (start < pts.length - 1 && Math.hypot(pts[start].x, pts[start].y) > radiusNm && Math.hypot(pts[start + 1].x, pts[start + 1].y) > radiusNm) start++;
  const out = pts.slice(start);
  if (Math.hypot(out[0].x, out[0].y) > radiusNm && out.length > 1) {
    const a = out[0];
    const b = out[1];
    // Solve |a + f (b - a)| = radius for f in [0, 1].
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const A = dx * dx + dy * dy;
    const Bq = 2 * (a.x * dx + a.y * dy);
    const C = a.x * a.x + a.y * a.y - radiusNm * radiusNm;
    const f = (-Bq - Math.sqrt(Math.max(0, Bq * Bq - 4 * A * C))) / (2 * A);
    out[0] = { x: a.x + dx * f, y: a.y + dy * f, id: null };
  }
  return makePath(out);
}

// Altitude targets on a leg: 'at' and 'atOrAbove' give a floor the aircraft must be at or above at that fix.
function altOf(leg) {
  if (leg.altitude1Ft == null) return {};
  if (leg.altitudeConstraint === 'at') return { alt: leg.altitude1Ft, altKind: 'at' };
  if (leg.altitudeConstraint === 'atOrAbove') return { alt: leg.altitude1Ft, altKind: 'above' };
  return {};
}

// The inner part of a route, from the hold fix to the threshold, for one STAR and one runway.
export function innerPath(starIdent, runway) {
  runway = rwId(runway);
  const star = STARS.get(starIdent);
  const rw = RUNWAYS[runway];
  const appr = approachByRunway.get(runway);
  const verts = [];
  const rt = rwTrans(star, runway);
  const legs = rt ? rt.legs : common(star).legs;
  for (const l of legs) {
    if (l.pathTerminator === 'FM') continue; // the vector is added below
    verts.push({ ...pt(fixOf(l.fixKey)), ...altOf(l), role: 'star' });
  }
  const last = legs.at(-1);
  const lastIdent = last.fixIdent;
  // Approach transition: the STAR ends at an initial approach fix, or the arrival is vectored to the nearest one.
  let trans = appr.transitions.find((t) => t.ident === lastIdent);
  let vectored = false;
  if (!trans) {
    const from = verts.at(-1);
    vectored = true;
    trans = appr.transitions
      .map((t) => ({ t, d: dist(from, pt(fixOf(t.legs[0].fixKey))) }))
      .sort((p, q) => p.d - q.d || (dist(pt(fixOf(q.t.legs[0].fixKey)), rw) - dist(pt(fixOf(p.t.legs[0].fixKey)), rw)))[0].t;
  }
  trans.legs.forEach((l, i) => {
    verts.push({ ...pt(fixOf(l.fixKey)), ...altOf(l), role: i === 0 ? 'iaf' : 'transition' });
  });
  for (const l of appr.legs) {
    if (l.segment === 'missed') break;
    const role = l.fixRole === 'FAF' ? 'faf' : l.fixRole === 'MAP' ? 'threshold' : l.segment;
    const f = l.fixKey ? pt(fixOf(l.fixKey)) : null;
    if (!f) break;
    // The FAF carries the glideslope intercept altitude with no constraint type in the data; it is flown as an 'at'.
    const alt = role === 'faf' && l.altitude1Ft != null && !l.altitudeConstraint ? { alt: l.altitude1Ft, altKind: 'at' } : altOf(l);
    verts.push({ ...f, ...alt, role });
  }
  // The last vertex is the threshold; use the runway record's own position.
  const end = verts.at(-1);
  verts[verts.length - 1] = { ...end, x: rw.x, y: rw.y, id: runway, role: 'threshold', alt: rw.elevFt + rw.tchFt, altKind: 'at' };
  const path = makePath(verts);
  const fafV = path.verts.find((v) => v.role === 'faf');
  // The final approach course starts at the first vertex after which the path stays on the runway centerline.
  const onLine = (v) => Math.abs((v.y - rw.y) * rw.dir.x - (v.x - rw.x) * rw.dir.y) <= 0.06;
  let fs = path.verts.length - 1;
  while (fs > 0 && onLine(path.verts[fs - 1])) fs--;
  return {
    path,
    runway,
    approach: appr.ident,
    vectored,
    fafS: fafV.s,
    fafDistNm: path.len - fafV.s,
    finalStartS: path.verts[fs].s,
    finalStartDistNm: path.len - path.verts[fs].s,
  };
}

// The missed approach fix, where a go-around heads: the first fix on the missed approach legs.
export function missedFix(runway) {
  runway = rwId(runway);
  const l = approachByRunway.get(runway).legs.find((x) => x.segment === 'missed' && x.fixKey);
  return pt(fixOf(l.fixKey));
}

// The straight final course of a runway, for drawing: the FAF to the threshold, and where the ILS final starts.
export function finalCourse(runway) {
  runway = rwId(runway);
  const appr = approachByRunway.get(runway);
  const faf = appr.legs.find((l) => l.fixRole === 'FAF');
  return { faf: pt(fixOf(faf.fixKey)), fafAltFt: faf.altitude1Ft, ident: appr.ident };
}

export function allFixes() {
  return Object.values(data.fixes).map((f) => ({ x: f.xNm, y: f.yNm, id: f.ident, type: f.type }));
}
export function starLines(starIdent, runways) {
  // The drawn STAR: every enroute transition's last leg, the common route, and the runway transitions for `runways`.
  const star = STARS.get(starIdent);
  const lines = [];
  lines.push(common(star).legs.map((l) => pt(fixOf(l.fixKey))));
  for (const r of runways.map(rwId)) {
    const rt = rwTrans(star, r);
    if (rt) lines.push(rt.legs.map((l) => pt(fixOf(l.fixKey))));
  }
  return lines;
}
export const starIdents = () => data.stars.map((s) => s.ident);
