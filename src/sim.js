// Touchdown simulator core: pure, deterministic, no DOM.
// Units: nautical miles, knots, feet, seconds. x is east, y is north, the airport reference point is the origin
// (the projection is documented in docs/data.md). The routes, fixes and runways come from data/katl-2611.json through
// airspace.js; nothing here is typed in from memory.
//
// How the controller keeps everything separated (the README walks through it):
//   Outer airspace: arrivals fly a real STAR to its hold fix. Every aircraft in the arrival queue owns one level,
//   base + 1000 ft x queue position. When the head leaves, everyone steps down one level at the same moment and the
//   same rate. The head leaves its hold fix at the base level, and from that moment it descends faster than the stack
//   steps down, so it is always at least 1000 ft under everything still waiting.
//   Inner airspace: before the head leaves, the controller runs its whole flight to the runway forward from the
//   deterministic motion model (the conflict probe) against every aircraft already released, and releases it only if
//   no runway of the flow gives a conflict. The probe uses the margins on top of the minima, so a release that passes
//   cannot lose separation unless somebody changes speed afterwards. Aircraft established on adjacent finals of
//   different runways are judged by the parallel-approach rules in separation.js.

import { mulberry32 } from './rng.js';
import { pickType, wakeMinNm } from './fleet.js';
import { FLOWS, FLOW_HOLD_S, groundSpeed } from './weather.js';
import { innerPath, makePath, missedFix, outerPath, holdFix, pointAt, rwId, sameWakeRunway, starsFor, RUNWAYS } from './airspace.js';
import { lostSeparation } from './separation.js';

const KT = 1 / 3600; // NM per second, per knot
const EPS = 1e-6;
const PROBE_DT = 3; // s between samples of a predicted flight
const PROBE_MAX_S = 6 * 3600; // a flight that has not reached the runway after six hours (a blimp at 35 kt takes about 2.5) is not releasable
const PROBE_MARGIN_NM = 0.3;
const PROBE_MARGIN_FT = 150;
const SCAN_S = 1200; // how far ahead the controller looks for a release time

export const CONFIG = Object.freeze({
  spacingS: 60, // minimum time between releases from the hold fixes
  innerSpeedKt: 160,
  transitSpeedKt: 250,
  transitMinKt: 180,
  holdMinKt: 140,
  holdMaxKt: 230,
  baseLevelFt: 12000, // the level a released aircraft starts from: HOBTT3 and SITTH3 are 'at 12,000' at their hold fix, and the stack is above this
  levelStepFt: 1000,
  stepRateFpm: 520,
  descentFtPerNm: 230, // early descent from the hold fix, steeper where a real 'at' altitude needs it
  maxDescentFtPerNm: 1100, // OZZZI2 is 'at 9,000' 2.9 NM past its hold fix, about 2,800 fpm at 160 kt for those 2.9 NM
  maxQueue: 10,
  spawnRadiusNm: 41, // the corner posts are about 40.4 NM out
  holdRadiusNm: 0.85,
  latSepNm: 3,
  vertSepFt: 1000,
  prm: true, // the PRM/FMA flag: simultaneous independent approaches on the parallels (5-9-7, 5-9-8); off means dependent, 1.5 NM diagonal (5-9-6)
  fuelMinS: 90 * 60,
  fuelMaxS: 150 * 60,
});

// Fictional carriers. S.E.A.N. traffic never uses a real airline's callsign (#3).
const AIRLINES = ['PEACH', 'GRITS', 'KUDZU', 'PECAN', 'OKRA'];

// ---- routes --------------------------------------------------------------------------------------------------------

// One inner route with its altitude profile. From the hold fix the aircraft descends at `rate` ft per NM, never below
// the floor of any 'at' or 'at or above' altitude still ahead, and from the FAF it is on the glidepath to the
// threshold. `rate` goes up from the default only where an 'at' altitude is out of reach otherwise.
function buildRoute(starIdent, runway, cfg) {
  const r = innerPath(starIdent, runway);
  const vs = r.path.verts;
  const faf = vs.find((v) => v.role === 'faf');
  const thr = vs.at(-1);
  const cons = vs.filter((v) => v.alt !== undefined && v.s <= faf.s + EPS).map((v) => ({ s: v.s, alt: v.alt, kind: v.altKind }));
  let rate = cfg.descentFtPerNm;
  for (const c of cons) if (c.kind === 'at' && c.s > 0) rate = Math.max(rate, (cfg.baseLevelFt - c.alt) / c.s);
  return { ...r, A: cfg.baseLevelFt, rate, cons, fafAlt: faf.alt ?? 3000, thrAlt: thr.alt, reachable: rate <= cfg.maxDescentFtPerNm + EPS };
}

export function routeAlt(route, s) {
  if (s >= route.fafS) {
    const f = Math.min(1, (s - route.fafS) / Math.max(EPS, route.path.len - route.fafS));
    return route.fafAlt + (route.thrAlt - route.fafAlt) * f;
  }
  let floor = -Infinity;
  for (const c of route.cons) if (c.s >= s - EPS && c.alt > floor) floor = c.alt;
  return Math.min(route.A, Math.max(floor, route.A - route.rate * s));
}

function orbitAt(outer, r) {
  const vs = outer.verts;
  const h = vs.at(-1);
  const g = vs.length > 1 ? vs[vs.length - 2] : { x: h.x - 1, y: h.y };
  const l = Math.hypot(h.x - g.x, h.y - g.y) || 1;
  const d = { x: (h.x - g.x) / l, y: (h.y - g.y) / l };
  const n = { x: d.y, y: -d.x }; // to the right of the inbound course: a standard right-hand pattern
  const c = { x: h.x + r * n.x, y: h.y + r * n.y };
  return { c, r, theta0: Math.atan2(h.y - c.y, h.x - c.x), sign: -1 };
}

// Everything the sim flies for one flow: the STARs that serve all of its runways, each with its hold fix, its outer
// paths (one per enroute transition, each with its holding orbit) and its inner route to each runway.
export function layout(cfg = CONFIG, flow = 'west') {
  const runways = FLOWS[flow].runways.map(rwId);
  const stars = {};
  const pairs = [];
  for (const s of starsFor(runways)) {
    const hold = holdFix(s.ident);
    const outer = {};
    for (const tr of s.transitions) {
      let path = outerPath(s.ident, tr, cfg.spawnRadiusNm);
      if (path.len < 1) {
        // The transition ends at the hold fix on the boundary (JJEDI4, GNDLF3): bring the aircraft in on the radial
        // from 2 NM further out so it still has an inbound course to the fix.
        const v = path.verts[0];
        const d = Math.hypot(v.x, v.y) || 1;
        path = makePath([{ x: v.x * (1 + 2 / d), y: v.y * (1 + 2 / d), id: null }, ...path.verts]);
      }
      outer[tr] = { path, orbit: orbitAt(path, cfg.holdRadiusNm) };
      pairs.push({ star: s.ident, transition: tr });
    }
    const routes = Object.fromEntries(runways.map((rw) => [rw, buildRoute(s.ident, rw, cfg)]));
    stars[s.ident] = { ident: s.ident, hold, outer, routes };
  }
  return { flow, runways: runways.map((id) => RUNWAYS[id]), stars, pairs };
}

// The separation argument as numbers. createSim refuses a config where any of these fail, for either flow.
export function checkDesign(cfg = CONFIG) {
  const v = cfg.innerSpeedKt * KT;
  const stepS = (cfg.levelStepFt / cfg.stepRateFpm) * 60;
  let routesOk = true;
  let clears = true;
  let minDescentFpm = Infinity;
  for (const flow of ['west', 'east']) {
    for (const star of Object.values(layout(cfg, flow).stars)) {
      for (const route of Object.values(star.routes)) {
        routesOk &&= route.reachable;
        minDescentFpm = Math.min(minDescentFpm, route.rate * v * 60);
        // The aircraft behind steps down at the step rate; the one released has to stay 1000 ft under it.
        for (let tau = 0; tau <= stepS; tau += 1) {
          if (routeAlt(route, v * tau) > cfg.baseLevelFt - (cfg.stepRateFpm / 60) * tau + 0.5) clears = false;
        }
      }
    }
  }
  const checks = {
    routesReachAltitudes: routesOk,
    releasedClearsStack: clears,
    descentOutrunsStepDown: minDescentFpm >= cfg.stepRateFpm,
    levelsSeparated: cfg.levelStepFt >= cfg.vertSepFt,
  };
  return { ok: Object.values(checks).every(Boolean), checks, minDescentFpm, stepS };
}

// Weather is optional. Without it the sim is calm, west flow, base spacing.
const CALM = Object.freeze({ windDir: null, windKt: 0, gustKt: null, desiredFlow: 'west', calm: true, rateMult: 1, llws: null, category: 'VFR' });

export function createSim({ seed = 1, demandPerHour = 24, config = {}, controller = null, weather = null } = {}) {
  const cfg = { ...CONFIG, ...config };
  const design = checkDesign(cfg);
  if (!design.ok) throw new Error(`unsafe config: ${JSON.stringify(design.checks)}`);
  const wx0 = weather ? weather.at(0) : CALM;
  const flow = controller?.pickFlow?.({ flow: 'west' }, wx0) ?? (wx0.calm ? 'west' : wx0.desiredFlow);
  const sim = {
    cfg,
    geo: layout(cfg, flow),
    design,
    weather,
    wx: wx0,
    flow,
    flowWant: flow,
    flowWantSince: 0,
    changeover: false, // a runway change is draining the airspace
    flowChanges: [],
    finalGsKt: cfg.innerSpeedKt,
    seed,
    controller, // optional: beforeStep, afterStep, onSpawn, onDepart (see sean.js)
    orders: [], // speed assignments a controller has issued, for the conformance monitor
    anomalies: [], // unidentified targets, not part of the arrival stream
    rng: mulberry32(seed),
    t: 0,
    nextId: 1,
    usedCallsigns: new Set(),
    demandPerHour: 0,
    nextRequestT: Infinity,
    upstream: [], // requested, held outside the sector by flow control
    queue: [], // outer airspace, in landing order; index = level
    aircraft: [], // everything airborne
    landed: [],
    elsewhere: [], // arrivals a controller sent to another airport or a field: { t, callsign, ident }
    cut: [], // flights a controller deleted off the scope
    outages: [], // stretches where the scope is dark: { startT, endT }. Traffic keeps moving.
    departures: [],
    lastDepartT: -Infinity,
    fuelOuts: [],
    requested: 0,
  };
  setDemand(sim, demandPerHour);
  return sim;
}

export function setDemand(sim, perHour) {
  sim.demandPerHour = perHour;
  sim.nextRequestT = perHour > 0 ? sim.t + expo(sim, perHour) : Infinity;
}

function expo(sim, perHour) {
  return (-Math.log(1 - sim.rng()) * 3600) / perHour;
}

function callsign(sim) {
  for (;;) {
    const cs = AIRLINES[Math.floor(sim.rng() * AIRLINES.length)] + (100 + Math.floor(sim.rng() * 8900));
    if (!sim.usedCallsigns.has(cs)) {
      sim.usedCallsigns.add(cs);
      return cs;
    }
  }
}

export function outerAlt(sim, a, t) {
  const d = (sim.cfg.stepRateFpm / 60) * (t - a.stepStartT);
  return a.fromAlt >= a.targetAlt ? Math.max(a.targetAlt, a.fromAlt - d) : Math.min(a.targetAlt, a.fromAlt + d);
}

// Per-aircraft speeds default to the config; a controller can override them on the aircraft.
const innerKt = (sim, a) => a.innerKt ?? sim.cfg.innerSpeedKt;

// Groundspeed on final: the aircraft's own speed with the wind on the runway heading taken out. Never under 40% of
// its own speed, so a slow target in a strong headwind still moves.
function finalGs(sim, a) {
  const kt = innerKt(sim, a);
  const { windDir, windKt } = sim.wx;
  if (!windKt) return kt;
  return Math.max(0.4 * kt, groundSpeed(kt, windDir, windKt, FLOWS[sim.flow].headingDeg));
}

const compass = (dx, dy) => ((90 - (Math.atan2(dy, dx) * 180) / Math.PI) % 360 + 360) % 360;

// Where an aircraft is on its outer path (the STAR to the hold fix).
function placeOuter(a) {
  const p = pointAt(a.outer, a.so);
  a.x = p.x;
  a.y = p.y;
  a.trk = compass(p.dx, p.dy);
}

function spawn(sim, req, t) {
  const { cfg, rng } = sim;
  const pair = sim.geo.pairs[Math.floor(rng() * sim.geo.pairs.length)];
  const star = sim.geo.stars[pair.star];
  const o = star.outer[pair.transition];
  const alt = cfg.baseLevelFt + cfg.levelStepFt * sim.queue.length;
  const type = pickType(rng);
  const a = {
    id: sim.nextId++,
    callsign: req.callsign,
    requestT: req.requestT,
    spawnT: t,
    phase: 'transit',
    star: pair.star,
    transition: pair.transition,
    fix: star.hold.id,
    outer: o.path,
    orbit: o.orbit,
    so: 0,
    x: 0,
    y: 0,
    alt,
    prevAlt: alt,
    vsFpm: 0,
    type: type.icao,
    wake: type.cwt,
    apchCat: type.apchCat,
    finalKt: type.finalKt,
    fromAlt: alt,
    targetAlt: alt,
    stepStartT: t,
    speedKt: cfg.transitSpeedKt,
    trk: 0,
    s: 0,
    sT: t,
    rwy: null,
    route: null,
    holdAnchorT: 0,
    holdAnchorPhase: 0,
    holdRate: 0,
    nextCross: 1,
    fuelS: cfg.fuelMinS + rng() * (cfg.fuelMaxS - cfg.fuelMinS),
  };
  placeOuter(a);
  sim.queue.push(a);
  sim.aircraft.push(a);
  sim.controller?.onSpawn?.(sim, a, req);
}

// ---- the conflict probe ----------------------------------------------------------------------------------------------

// Position along the route at time t, for an aircraft whose s is valid at a.sT. Speed is the aircraft's own until the
// final approach course, then its groundspeed on final.
function sAt(sim, a, t) {
  const split = a.route.finalStartS;
  const v1 = innerKt(sim, a) * KT;
  const v2 = finalGs(sim, a) * KT;
  let s = a.s;
  let dt = t - a.sT;
  if (dt <= 0) return s;
  if (s < split) {
    const need = (split - s) / v1;
    if (dt <= need) return s + v1 * dt;
    s = split;
    dt -= need;
  }
  return s + v2 * dt;
}

function stateAt(sim, a, t) {
  const s = sAt(sim, a, t);
  if (s >= a.route.path.len) return null;
  const p = pointAt(a.route.path, s);
  return { x: p.x, y: p.y, alt: routeAlt(a.route, s), est: s >= a.route.finalStartS - EPS, rwy: a.rwy, rem: a.route.path.len - s, wake: a.wake };
}

// Would an aircraft released at tr on `route` keep separation from everyone already released, for its whole flight?
function clear(sim, cand, tr) {
  const others = sim.aircraft.filter((o) => o.phase === 'inner');
  for (let t = tr; t < tr + PROBE_MAX_S; t += PROBE_DT) {
    const c = stateAt(sim, cand, t);
    if (!c) return true;
    for (const o of others) {
      const b = stateAt(sim, o, t);
      if (!b) continue;
      const dh = Math.hypot(c.x - b.x, c.y - b.y);
      const dv = Math.abs(c.alt - b.alt);
      if (lostSeparation(dh, dv, c, b, sim.cfg, PROBE_MARGIN_NM, PROBE_MARGIN_FT)) return false;
      if (c.est && b.est && sameWakeRunway(c.rwy, b.rwy)) {
        const lead = c.rem < b.rem ? c : b;
        const min = wakeMinNm(lead.wake, lead === c ? b.wake : c.wake);
        if (min !== null && dh < min + PROBE_MARGIN_NM - EPS) return false;
      }
    }
  }
  return false; // never reached the runway inside the cap (a speed of zero): not releasable
}

function candidate(sim, a, rw, tr) {
  return { s: 0, sT: tr, route: sim.geo.stars[a.star].routes[rw], rwy: rw, wake: a.wake, innerKt: a.innerKt };
}

// The runways `a` could be released to at time t, best first: the least used, then the shortest.
function feasible(sim, a, t) {
  const star = sim.geo.stars[a.star];
  const use = (rw) => sim.aircraft.filter((o) => o.phase === 'inner' && o.rwy === rw).length;
  return sim.geo.runways
    .map((r) => r.ident)
    .filter((rw) => star.routes[rw] && clear(sim, candidate(sim, a, rw, t), t))
    .sort((p, q) => use(p) - use(q) || star.routes[p].path.len - star.routes[q].path.len);
}

// The runway the head is released to if it may leave at t, or null.
function canDepart(sim, a, t) {
  if (sim.queue[0] !== a) return null;
  // Not above the base level, and not still climbing to it (a go-around is not released at an altitude it has not reached).
  const alt = outerAlt(sim, a, t);
  if (alt > sim.cfg.baseLevelFt + EPS) return null;
  if (alt < sim.cfg.baseLevelFt - EPS && a.targetAlt >= sim.cfg.baseLevelFt - EPS) return null;
  if (t < sim.lastDepartT + sim.cfg.spacingS / sim.wx.rateMult - EPS) return null;
  return feasible(sim, a, t)[0] ?? null;
}

function depart(sim, a, t, rwy) {
  sim.queue.shift();
  for (const b of sim.queue) {
    b.fromAlt = outerAlt(sim, b, t);
    b.stepStartT = t;
    b.targetAlt -= sim.cfg.levelStepFt;
  }
  a.phase = 'inner';
  a.rwy = rwy;
  a.route = sim.geo.stars[a.star].routes[rwy];
  a.s = 0;
  a.sT = t;
  a.departT = t;
  a.speedKt = innerKt(sim, a);
  sim.lastDepartT = t;
  sim.departures.push(t);
  sim.controller?.onDepart?.(sim, a, t);
  const next = sim.queue[0];
  if (next && next.phase === 'hold') planHold(sim, next, t);
}

// Earliest time the head may leave its hold fix: the step-down done, the release spacing passed, and a runway clear.
function readyTime(sim, a) {
  const key = `${sim.departures.length}:${sim.orders.length}:${sim.aircraft.length}:${sim.flow}:${sim.cfg.spacingS}`;
  if (a.readyKey === key) return a.readyT;
  const settle = a.stepStartT + Math.abs(a.fromAlt - sim.cfg.baseLevelFt) / (sim.cfg.stepRateFpm / 60);
  const from = Math.max(sim.t, settle, sim.lastDepartT + sim.cfg.spacingS / sim.wx.rateMult);
  let t = from;
  while (t < from + SCAN_S && !feasible(sim, a, t).length) t += PROBE_DT;
  a.readyKey = key;
  a.readyT = t;
  return t;
}

// Holding is tracked as a lap count around the orbit; whole numbers are crossings of the fix.
function holdPhase(a, t) {
  return a.holdAnchorPhase + a.holdRate * (t - a.holdAnchorT);
}

// The head times its laps (within holding speed limits) to cross the fix the moment it is cleared.
// Everyone else orbits at the inner speed. Speed in the stack does not affect separation: levels do.
function planHold(sim, a, now) {
  const { cfg } = sim;
  const lap = 2 * Math.PI * cfg.holdRadiusNm;
  const phase = holdPhase(a, now);
  a.holdAnchorT = now;
  a.holdAnchorPhase = phase;
  a.holdRate = (innerKt(sim, a) * KT) / lap;
  if (sim.queue[0] !== a) return;
  const ready = readyTime(sim, a);
  const minR = ((a.holdMinKt ?? cfg.holdMinKt) * KT) / lap;
  const maxR = ((a.holdMaxKt ?? cfg.holdMaxKt) * KT) / lap;
  for (let k = a.nextCross; ; k++) {
    const tMin = now + (k - phase) / maxR;
    const tMax = now + (k - phase) / minR;
    if (ready <= tMax) {
      const tc = Math.max(ready, tMin);
      a.holdRate = (k - phase) / (tc - now);
      return;
    }
  }
}

// A controller that changes who is at the head of the queue (a cut, a diversion) calls this so the new head's laps are
// timed to its own clearance, not the last head's.
export function replan(sim) {
  const head = sim.queue[0];
  if (head && head.phase === 'hold') planHold(sim, head, sim.t);
}

// Points around a holding orbit, for drawing.
export function holdOutline(orbit, n = 48) {
  return Array.from({ length: n }, (_, k) => {
    const th = (2 * Math.PI * k) / n;
    return { x: orbit.c.x + orbit.r * Math.cos(th), y: orbit.c.y + orbit.r * Math.sin(th) };
  });
}

function enterHold(sim, a, t) {
  a.phase = 'hold';
  a.holdAnchorT = t;
  a.holdAnchorPhase = 0;
  a.nextCross = 1;
  planHold(sim, a, t);
}

// Moves a holding aircraft to t1, leaving the hold the first time it crosses the fix with clearance.
function advanceHold(sim, a, t1) {
  for (;;) {
    const tc = a.holdAnchorT + (a.nextCross - a.holdAnchorPhase) / a.holdRate;
    if (tc > t1 + EPS) break;
    const rwy = canDepart(sim, a, tc);
    if (rwy) {
      depart(sim, a, tc, rwy);
      a.s = innerKt(sim, a) * KT * (t1 - tc);
      a.sT = t1;
      return;
    }
    a.nextCross++;
    planHold(sim, a, tc);
  }
  const h = a.orbit;
  const theta = h.theta0 + h.sign * 2 * Math.PI * holdPhase(a, t1);
  a.x = h.c.x + h.r * Math.cos(theta);
  a.y = h.c.y + h.r * Math.sin(theta);
  a.speedKt = (a.holdRate * 2 * Math.PI * h.r) / KT;
  a.trk = compass(-h.sign * Math.sin(theta), h.sign * Math.cos(theta));
}

function placeInner(sim, a) {
  const p = pointAt(a.route.path, a.s);
  a.x = p.x;
  a.y = p.y;
  a.trk = compass(p.dx, p.dy);
  a.alt = routeAlt(a.route, a.s);
  a.speedKt = a.s < a.route.finalStartS ? innerKt(sim, a) : finalGs(sim, a);
}

// A go-around: the aircraft climbs out to the missed approach fix, then goes back to its hold fix and the end of the
// queue. Its level is the next free one.
export function goAround(sim, a) {
  const { cfg } = sim;
  const star = sim.geo.stars[a.star];
  a.outer = makePath([{ x: a.x, y: a.y }, missedFix(a.rwy), star.hold]);
  a.so = 0;
  a.phase = 'transit';
  a.rwy = null;
  a.route = null;
  a.s = 0;
  a.fromAlt = a.alt;
  a.targetAlt = cfg.baseLevelFt + cfg.levelStepFt * sim.queue.length;
  a.stepStartT = sim.t;
  a.speedKt = cfg.transitSpeedKt;
  sim.queue.push(a);
}

// Weather hook, once per step. Sets the groundspeed on final, the landing spacing, and runs the runway change:
// 3-5-1 picks the flow, the airspace drains, then the runways swap. A change needs the wind to hold for
// FLOW_HOLD_S, a sim choice so a gusty shift does not flip the runway back and forth.
function updateWeather(sim) {
  if (!sim.weather) return;
  const wx = sim.weather.at(sim.t);
  sim.wx = wx;
  sim.finalGsKt = Math.max(0.4 * sim.cfg.innerSpeedKt, groundSpeed(sim.cfg.innerSpeedKt, wx.windDir, wx.windKt, FLOWS[sim.flow].headingDeg)); // the default aircraft, for the landing gap and the panel
  const want = sim.controller?.pickFlow?.(sim, wx) ?? (wx.calm ? sim.flow : wx.desiredFlow);
  if (want !== sim.flowWant) {
    sim.flowWant = want;
    sim.flowWantSince = sim.t;
  }
  sim.changeover = want !== sim.flow && sim.t - sim.flowWantSince >= FLOW_HOLD_S;
  if (sim.changeover && sim.aircraft.length === 0) {
    sim.flow = want;
    sim.geo = layout(sim.cfg, want);
    sim.flowChanges.push({ t: sim.t, flow: want });
    sim.changeover = false;
  }
}

// Inner path: flown at the aircraft's speed until the final approach course, then at the groundspeed the wind leaves.
function advanceInner(sim, a, dt) {
  a.s = sAt(sim, a, a.sT + dt);
  a.sT += dt;
}

export function step(sim, dt = 1) {
  const { cfg } = sim;
  const t0 = sim.t;
  const t1 = t0 + dt;
  updateWeather(sim);
  sim.controller?.beforeStep?.(sim, dt);

  while (sim.nextRequestT <= t1) {
    sim.upstream.push({ requestT: sim.nextRequestT, callsign: callsign(sim) });
    sim.requested++;
    sim.nextRequestT += expo(sim, sim.demandPerHour);
  }

  // Flow control: a new arrival takes the next free level, never while a step-down is in progress.
  const stepS = sim.design.stepS;
  while (!sim.changeover && sim.upstream.length && sim.queue.length < cfg.maxQueue && t0 >= sim.lastDepartT + stepS) {
    spawn(sim, sim.upstream.shift(), t0);
  }

  // Queue order first, so a new head is always moved after the departure that promoted it.
  const order = [...sim.queue, ...sim.aircraft.filter((a) => a.phase === 'inner')];
  for (const a of order) {
    a.fuelS -= dt;
    if (a.phase === 'transit') {
      const dist = a.outer.len - a.so;
      const cruise = a.transitKt ?? cfg.transitSpeedKt;
      let kt = cruise;
      if (sim.queue[0] === a) {
        const slack = readyTime(sim, a) - t0;
        if (slack > 0) kt = Math.min(cruise, Math.max(a.transitMinKt ?? cfg.transitMinKt, dist / KT / slack));
      }
      a.speedKt = kt;
      const vT = kt * KT;
      if (vT * dt >= dist) {
        const ta = t0 + dist / vT;
        a.so = a.outer.len;
        placeOuter(a);
        const rwy = canDepart(sim, a, ta);
        if (rwy) {
          depart(sim, a, ta, rwy);
          a.s = innerKt(sim, a) * KT * (t1 - ta);
          a.sT = t1;
        } else {
          enterHold(sim, a, ta);
          advanceHold(sim, a, t1);
        }
      } else {
        a.so += vT * dt;
        placeOuter(a);
      }
    } else if (a.phase === 'hold') {
      advanceHold(sim, a, t1);
    } else if (a.sT < t1 - EPS) {
      advanceInner(sim, a, t1 - a.sT); // not one released in this step: those are already placed at t1
    }
  }

  // Altitudes are functions of time, so the order aircraft were moved in above does not matter.
  const landedNow = [];
  for (const a of sim.aircraft) {
    if (a.phase === 'inner') {
      const total = a.route.path.len;
      if (a.s >= total - EPS) {
        a.landT = t1 - (a.s - total) / (finalGs(sim, a) * KT);
        a.phase = 'landed';
        landedNow.push(a);
        continue;
      }
      placeInner(sim, a);
    } else {
      a.alt = outerAlt(sim, a, t1);
    }
    a.vsFpm = ((a.alt - a.prevAlt) / dt) * 60;
    a.prevAlt = a.alt;
    if (a.fuelS <= 0 && !a.fuelOut) {
      a.fuelOut = true;
      sim.fuelOuts.push({ t: t1, callsign: a.callsign });
    }
  }
  if (landedNow.length) {
    sim.aircraft = sim.aircraft.filter((a) => a.phase !== 'landed');
    for (const a of landedNow) {
      sim.landed.push({
        callsign: a.callsign,
        type: a.type,
        wake: a.wake,
        rwy: a.rwy,
        star: a.star,
        requestT: a.requestT,
        spawnT: a.spawnT,
        landT: a.landT,
        fuelLeftS: a.fuelS,
      });
    }
  }

  sim.t = t1;
  sim.controller?.afterStep?.(sim, dt);
}

// Path distance left to the runway for an aircraft on its inner route; the straight-line distance to the airport otherwise.
export const toRunway = (a) => (a.route ? a.route.path.len - a.s : Math.hypot(a.x, a.y));

// What the separation rules need to know about an aircraft: which runway it is on and whether it is established.
export const sepView = (a) => ({ rwy: a.phase === 'inner' ? a.rwy : null, est: a.phase === 'inner' && !!a.route && a.s >= a.route.finalStartS - EPS });

// Runs until nothing is waiting or airborne (demand should be 0), or until maxT.
export function drain(sim, maxT = sim.t + 12 * 3600) {
  setDemand(sim, 0);
  sim.draining = true; // a controller that makes its own traffic (S.E.A.N.'s blimps) stops too
  while ((sim.upstream.length || sim.aircraft.length) && sim.t < maxT) step(sim, 1);
  return sim.upstream.length === 0 && sim.aircraft.length === 0;
}
