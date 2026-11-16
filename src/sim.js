// Touchdown simulator core: pure, deterministic, no DOM.
// Units: nautical miles, knots, feet, seconds. x is east, y is north, runway 27 threshold at the origin.
//
// How the controller keeps everything separated (the README walks through it):
//   Outer airspace: every aircraft in the arrival queue owns one level, base + 1000 ft x queue position.
//   When the head leaves, everyone steps down one level at the same moment and the same rate.
//   Inner airspace: the head leaves its feeder fix only when it is at the base level, the step-down
//   is done, and the larger of `spacingS` and the wake minimum behind the last departure has passed.
//   Both feeder paths have the same length and speed, so that time gap holds all the way to the runway.

import { mulberry32 } from './rng.js';
import { pickType, wakeMinNm } from './fleet.js';
import { FLOWS, FLOW_HOLD_S, groundSpeed } from './weather.js';

const KT = 1 / 3600; // NM per second, per knot
const EPS = 1e-6;

export const CONFIG = Object.freeze({
  spacingS: 120, // minimum time between departures from the feeder fixes, and so between landings
  innerSpeedKt: 160,
  transitSpeedKt: 250,
  transitMinKt: 180,
  holdMinKt: 140,
  holdMaxKt: 230,
  baseLevelFt: 7000,
  levelStepFt: 1000,
  stepRateFpm: 520,
  maxQueue: 10,
  spawnRadiusNm: 40,
  holdRadiusNm: 0.85,
  latSepNm: 3,
  vertSepFt: 1000,
  fuelMinS: 90 * 60,
  fuelMaxS: 150 * 60,
});

export const RUNWAY = Object.freeze({ name: '27', x: 0, y: 0, lengthNm: 1.6 });
export const FAF = Object.freeze({ name: 'FINAL', x: 10, y: 0, alt: 3000 });
export const FEEDERS = Object.freeze([
  Object.freeze({ name: 'NORVA', x: 26, y: 12 }),
  Object.freeze({ name: 'SOLAN', x: 26, y: -12 }),
]);

const AIRLINES = ['AAL', 'DAL', 'UAL', 'SWA', 'JBU', 'ASA', 'RPA', 'SKW', 'FFT', 'NKS'];

// Feeder legs, final segment and holding orbits. Each orbit is tangent to its feeder leg at the fix,
// on the side away from the other feeder, so a holding aircraft crosses the fix on the inbound course.
// East flow is the same layout turned 180 degrees about the threshold: aircraft arrive from the west and land to the east.
export function layout(cfg = CONFIG, flow = 'west') {
  const k = flow === 'east' ? -1 : 1;
  const l2 = Math.hypot(FAF.x - RUNWAY.x, FAF.y - RUNWAY.y);
  const finalDir = { x: (k * (RUNWAY.x - FAF.x)) / l2, y: (k * (RUNWAY.y - FAF.y)) / l2 };
  const feeders = FEEDERS.map((f) => {
    const l1 = Math.hypot(FAF.x - f.x, FAF.y - f.y);
    const d = { x: (FAF.x - f.x) / l1, y: (FAF.y - f.y) / l1 };
    const right = f.y >= 0;
    const n = right ? { x: d.y, y: -d.x } : { x: -d.y, y: d.x };
    const r = cfg.holdRadiusNm;
    const c = { x: f.x + r * n.x, y: f.y + r * n.y };
    const hold = { c: { x: k * c.x, y: k * c.y }, r, theta0: Math.atan2(f.y - c.y, f.x - c.x) + (k < 0 ? Math.PI : 0), sign: right ? -1 : 1 };
    return { ...f, x: k * f.x, y: k * f.y, d: { x: k * d.x, y: k * d.y }, l1, hold };
  });
  return {
    flow,
    k,
    feeders,
    finalDir,
    l2,
    faf: { ...FAF, x: k * FAF.x, y: k * FAF.y },
    runway: { ...RUNWAY, name: FLOWS[flow].runways[1], x: k * RUNWAY.x, y: k * RUNWAY.y },
  };
}

// The separation argument as numbers. createSim refuses a config where any of these fail.
export function checkDesign(cfg = CONFIG) {
  const { feeders, finalDir, l2 } = layout(cfg);
  const v = cfg.innerSpeedKt * KT;
  const lengths = feeders.map((f) => f.l1 + l2);
  const equalPaths = lengths.every((l) => Math.abs(l - lengths[0]) < 1e-9);
  const feederRateFpm = Math.min(...feeders.map((f) => ((cfg.baseLevelFt - FAF.alt) / (f.l1 / v)) * 60));
  const maxTurn = Math.max(...feeders.map((f) => Math.acos(f.d.x * finalDir.x + f.d.y * finalDir.y)));
  // In-trail distance across a merge never drops below v * gap * cos(turn / 2); on converging legs, v * gap.
  const mergeSepNm = v * cfg.spacingS * Math.cos(maxTurn / 2);
  const stepS = (cfg.levelStepFt / cfg.stepRateFpm) * 60;
  const checks = {
    equalPaths,
    turnAtMost90: maxTurn <= Math.PI / 2,
    descentOutrunsStepDown: feederRateFpm >= cfg.stepRateFpm,
    mergeSeparated: mergeSepNm >= cfg.latSepNm,
    levelsSeparated: cfg.levelStepFt >= cfg.vertSepFt,
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    feederRateFpm,
    maxTurnDeg: (maxTurn * 180) / Math.PI,
    mergeSepNm,
    stepS,
  };
}

// Weather is optional. Without it the sim is calm, west flow, base spacing: exactly the earlier behaviour.
const CALM = Object.freeze({ windDir: null, windKt: 0, gustKt: null, desiredFlow: 'west', calm: true, rateMult: 1, llws: null, category: 'VFR' });

export function createSim({ seed = 1, demandPerHour = 24, config = {}, controller = null, weather = null } = {}) {
  const cfg = { ...CONFIG, ...config };
  const design = checkDesign(cfg);
  if (!design.ok) throw new Error(`unsafe config: ${JSON.stringify(design.checks)}`);
  const wx0 = weather ? weather.at(0) : CALM;
  const flow = controller?.pickFlow?.({ flow: 'west' }, wx0) ?? (wx0.calm ? 'west' : wx0.desiredFlow);
  const geo = layout(cfg, flow);
  const sim = {
    cfg,
    geo,
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
    lastDepartWake: null,
    losses: [],
    fuelOuts: [],
    // Tightest pair seen: margin = max(lateral / 3 NM, vertical / 1000 ft); 1 is exactly at minimum.
    closest: { margin: Infinity, dh: Infinity, dv: Infinity, t: 0 },
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

function spawn(sim, req, t) {
  const { cfg, rng } = sim;
  const bearing = rng() * 2 * Math.PI;
  const k = sim.geo.k;
  const x = k * cfg.spawnRadiusNm * Math.sin(bearing);
  const y = k * cfg.spawnRadiusNm * Math.cos(bearing);
  const alt = cfg.baseLevelFt + cfg.levelStepFt * sim.queue.length;
  const type = pickType(rng);
  const a = {
    id: sim.nextId++,
    callsign: req.callsign,
    requestT: req.requestT,
    spawnT: t,
    phase: 'transit',
    feeder: k * y >= 0 ? 0 : 1,
    x,
    y,
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
    holdAnchorT: 0,
    holdAnchorPhase: 0,
    holdRate: 0,
    nextCross: 1,
    fuelS: cfg.fuelMinS + rng() * (cfg.fuelMaxS - cfg.fuelMinS),
  };
  sim.queue.push(a);
  sim.aircraft.push(a);
  sim.controller?.onSpawn?.(sim, a, req);
}

// Consecutive pairs only, as in the table. Time `a` must trail the last departure: the larger of the radar minimum and the wake minimum (TBL 5-5-4).
// Everyone flies the inner leg at the same speed, so a time gap is the same distance gap at the threshold.
// A headwind on final slows the lead aircraft, so the same time gap is a shorter distance gap: the controller times
// the gap at the slower of the two groundspeeds. A tailwind only lengthens the distance, so it changes nothing here.
function gapS(sim, a) {
  const v = Math.min(sim.cfg.innerSpeedKt, sim.finalGsKt) * KT;
  const wakeNm = sim.lastDepartWake ? wakeMinNm(sim.lastDepartWake, a.wake) : null;
  return Math.max(sim.cfg.spacingS / sim.wx.rateMult, wakeNm ? wakeNm / v : 0);
}

function canDepart(sim, a, t) {
  return (
    sim.queue[0] === a &&
    outerAlt(sim, a, t) <= sim.cfg.baseLevelFt + EPS &&
    t >= sim.lastDepartT + gapS(sim, a) - EPS
  );
}

function depart(sim, a, t) {
  sim.queue.shift();
  for (const b of sim.queue) {
    b.fromAlt = outerAlt(sim, b, t);
    b.stepStartT = t;
    b.targetAlt -= sim.cfg.levelStepFt;
  }
  a.phase = 'inner';
  a.s = 0;
  a.departT = t;
  a.speedKt = innerKt(sim, a);
  sim.lastDepartT = t;
  sim.lastDepartWake = a.wake;
  sim.departures.push(t);
  sim.controller?.onDepart?.(sim, a, t);
  const next = sim.queue[0];
  if (next && next.phase === 'hold') planHold(sim, next, t);
}

// Earliest time the head may leave its feeder fix.
function readyTime(sim, a) {
  const settle = a.stepStartT + Math.max(0, a.fromAlt - sim.cfg.baseLevelFt) / (sim.cfg.stepRateFpm / 60);
  return Math.max(sim.lastDepartT + gapS(sim, a), settle);
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

// Points around feeder i's holding pattern, for drawing.
export function holdOutline(sim, i, n = 48) {
  const h = sim.geo.feeders[i].hold;
  return Array.from({ length: n }, (_, k) => {
    const th = (2 * Math.PI * k) / n;
    return { x: h.c.x + h.r * Math.cos(th), y: h.c.y + h.r * Math.sin(th) };
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
    if (canDepart(sim, a, tc)) {
      depart(sim, a, tc);
      a.s = innerKt(sim, a) * KT * (t1 - tc);
      return;
    }
    a.nextCross++;
    planHold(sim, a, tc);
  }
  const h = sim.geo.feeders[a.feeder].hold;
  const theta = h.theta0 + h.sign * 2 * Math.PI * holdPhase(a, t1);
  a.x = h.c.x + h.r * Math.cos(theta);
  a.y = h.c.y + h.r * Math.sin(theta);
  a.speedKt = (a.holdRate * 2 * Math.PI * h.r) / KT;
  a.trk = compass(-h.sign * Math.sin(theta), h.sign * Math.cos(theta));
}

function compass(dx, dy) {
  return ((90 - (Math.atan2(dy, dx) * 180) / Math.PI) % 360 + 360) % 360;
}

function placeInner(sim, a) {
  const f = sim.geo.feeders[a.feeder];
  const { cfg } = sim;
  if (a.s <= f.l1) {
    a.x = f.x + f.d.x * a.s;
    a.y = f.y + f.d.y * a.s;
    a.alt = cfg.baseLevelFt - ((cfg.baseLevelFt - FAF.alt) * a.s) / f.l1;
    a.trk = compass(f.d.x, f.d.y);
    a.speedKt = innerKt(sim, a);
  } else {
    a.speedKt = finalGs(sim, a);
    const s2 = a.s - f.l1;
    const { finalDir, l2 } = sim.geo;
    a.x = sim.geo.faf.x + finalDir.x * s2;
    a.y = sim.geo.faf.y + finalDir.y * s2;
    a.alt = sim.geo.faf.alt * (1 - s2 / l2);
    a.trk = compass(finalDir.x, finalDir.y);
  }
}

// Weather hook, once per step. Sets the groundspeed on final, the landing spacing, and runs the runway change:
// 3-5-1 picks the flow, the airspace drains, then the layout turns around. A change needs the wind to hold for
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

// Inner path: the feeder leg is flown at the inner speed, final at the groundspeed the wind leaves.
function advanceInner(sim, a, dt) {
  const l1 = sim.geo.feeders[a.feeder].l1;
  const v1 = innerKt(sim, a) * KT;
  const v2 = finalGs(sim, a) * KT;
  let left = dt;
  if (a.s < l1) {
    const need = (l1 - a.s) / v1;
    if (need >= left) {
      a.s += v1 * left;
      return;
    }
    a.s = l1;
    left -= need;
  }
  a.s += v2 * left;
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
      const f = sim.geo.feeders[a.feeder];
      const dist = Math.hypot(f.x - a.x, f.y - a.y);
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
        a.x = f.x;
        a.y = f.y;
        if (canDepart(sim, a, ta)) {
          depart(sim, a, ta);
          a.s = innerKt(sim, a) * KT * (t1 - ta);
        } else {
          enterHold(sim, a, ta);
          advanceHold(sim, a, t1);
        }
      } else {
        a.trk = compass(f.x - a.x, f.y - a.y);
        a.x += ((f.x - a.x) / dist) * vT * dt;
        a.y += ((f.y - a.y) / dist) * vT * dt;
      }
    } else if (a.phase === 'hold') {
      advanceHold(sim, a, t1);
    } else if (a.departT < t0) {
      advanceInner(sim, a, dt);
    }
  }

  // Altitudes are functions of time, so the order aircraft were moved in above does not matter.
  const landedNow = [];
  for (const a of sim.aircraft) {
    if (a.phase === 'inner') {
      const total = sim.geo.feeders[a.feeder].l1 + sim.geo.l2;
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
        requestT: a.requestT,
        spawnT: a.spawnT,
        landT: a.landT,
        fuelLeftS: a.fuelS,
      });
    }
  }

  sim.t = t1;
  checkSeparation(sim);
  sim.controller?.afterStep?.(sim, dt);
}

export function checkSeparation(sim) {
  const { cfg, aircraft } = sim;
  for (let i = 0; i < aircraft.length; i++) {
    for (let j = i + 1; j < aircraft.length; j++) {
      const a = aircraft[i];
      const b = aircraft[j];
      const dv = Math.abs(a.alt - b.alt);
      const dh = Math.hypot(a.x - b.x, a.y - b.y);
      const margin = Math.max(dh / cfg.latSepNm, dv / cfg.vertSepFt);
      if (margin < sim.closest.margin) sim.closest = { margin, dh, dv, t: sim.t };
      if (margin < 1 - EPS) sim.losses.push({ t: sim.t, a: a.callsign, b: b.callsign, dh, dv });
    }
  }
}

// Runs until nothing is waiting or airborne (demand should be 0), or until maxT.
export function drain(sim, maxT = sim.t + 6 * 3600) {
  setDemand(sim, 0);
  while ((sim.upstream.length || sim.aircraft.length) && sim.t < maxT) step(sim, 1);
  return sim.upstream.length === 0 && sim.aircraft.length === 0;
}
