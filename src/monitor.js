// JO 7110.65 conformance monitor. It watches the sim from outside and never changes it.
// Each check cites the paragraph it enforces; the wording comes from the FAA text in docs/research/faa-rules-deep.md
// (7110.65BB mirrored from faa.gov). Violations are { t, para, title, ids, detail }. A breach that is still going
// on is logged once and re-armed when it ends. One-off events (an altitude assignment, a speed order) are logged
// each time.
//
// There is no airship paragraph in 7110.65 or the AIM, so a blimp is only caught for what it breaks: separation,
// and speed orders it cannot fly.

import { sepView, toRunway } from './sim.js';
import { lostSeparation, pairMargin } from './separation.js';
import { wakeMinNm } from './fleet.js';
import { CALM_KT, FLOWS, components } from './weather.js';
import classBAtl from '../data/classb-atl.json' with { type: 'json' };

const EPS = 1e-6;
const KT = 1 / 3600;

export const PARA = Object.freeze({
  SEP: '5-5-4 / 4-5-1',
  ALT: '5-5-5 b',
  SPEED_LIMIT: '14 CFR 91.117',
  SPEED_MIN: '5-7-3',
  SPEED_ADJ: '5-7-1',
  WAKE: '5-5-4 wake',
  UAP: '9-8-1',
  AARO: 'AIM 7-7-4',
  OUTAGE: 'scope outage', // not a paragraph: what happened while the scope was dark
  RWY: '3-5-1',
  READBACK: '2-4-3', // the controller ensures the items read back are correct
});

// 5-7-1: no speed adjustment inside the final approach fix on final or a point 5 miles from the runway,
// whichever is closer to the runway. The FAF is the real one for the aircraft's runway, from the approach data.
export const noSpeedInsideNm = (a) => (a.route ? Math.min(a.route.fafDistNm, 5) : 5);

// 14 CFR 91.117(c): no more than 200 kt in the airspace underlying a Class B area. An aircraft is underlying when it is
// inside a shelf's outline and under the lowest floor over that spot (a floor of 0 is the surface area: inside the Class B).
// The outlines are the FAA's, from data/classb-atl.json (scripts/classb.js).
const inRing = (ring, x, y) => {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
};
export function classBFloor(x, y, classB = classBAtl) {
  let floor = Infinity;
  for (const a of classB.areas) if (a.floorFt < floor && inRing(a.ring, x, y)) floor = a.floorFt;
  return floor;
}
const underlyingClassB = (a, classB) => {
  const floor = classBFloor(a.x, a.y, classB);
  return floor > 0 && floor !== Infinity && a.alt < floor;
};

// 5-7-3 speed floors on an assigned speed, by what the aircraft is. Turbojets and turboprops only; there is no paragraph for an airship.
export function minAssignedKt(a, distNm, alt = a.alt) {
  if (a.kind === 'blimp') return 0;
  const jet = (a.engine ?? 'jet') === 'jet';
  const near = distNm < 20;
  if (alt >= 10000) return 250; // FL280 to 10,000 ft
  return jet ? (near ? 170 : 210) : near ? 150 : 200;
}

export function createMonitor() {
  return {
    violations: [],
    // Tightest pair seen: margin is 1 at the minimum that applies to the pair (the parallel-approach rule on adjacent finals).
    closest: { margin: Infinity, dh: Infinity, dv: Infinity, t: 0 },
    counts: {},
    active: new Map(), // key -> violation, for breaches still going on
    targets: new Map(), // aircraft id -> assigned altitude, last tick
    pending: [], // altitude assignments waiting one tick for the previous occupant to be seen leaving
    orderCursor: 0,
    inner: null, // { t, items } for aircraft on the inner path, last tick
    informed: new Set(), // UAP targets already reported (9-8-1)
    filed: new Set(), // UAP targets whose AARO line is logged (AIM 7-7-4)
    holders: new Set(), // every aircraft seen in a holding pattern
    landings: [], // where each aircraft actually came down: { t, callsign, ident, where }
    where: {}, // landings per place
    darkSince: null, // start of the outage in progress; what the monitor logs in that time is held back
    held: [],
    landedCursor: 0,
    elsewhereCursor: 0,
    readbackCursor: 0,
  };
}

function log(m, t, para, title, ids, detail, extra = {}) {
  const v = { t, para, title, ids, detail, ...extra };
  if (m.darkSince !== null) {
    m.held.push(v); // the scope is dark: it goes in the log when the picture comes back
    return v;
  }
  m.violations.push(v);
  m.counts[para] = (m.counts[para] || 0) + 1;
  return v;
}

// The scope is back. One entry says what the outage was, then everything the monitor saw during it goes in.
function surface(m, t) {
  const by = {};
  for (const v of m.held) by[v.para] = (by[v.para] || 0) + 1;
  const parts = Object.entries(by).map(([p, n]) => `${n} x ${p}`);
  const entry = {
    t,
    para: PARA.OUTAGE,
    title: `Scope dark for ${Math.round(t - m.darkSince)} s`,
    ids: [],
    detail: parts.length ? `While it was dark: ${parts.join(', ')}` : 'Nothing happened while it was dark',
  };
  m.violations.push(entry);
  m.counts[PARA.OUTAGE] = (m.counts[PARA.OUTAGE] || 0) + 1;
  for (const v of m.held) {
    m.violations.push(v);
    m.counts[v.para] = (m.counts[v.para] || 0) + 1;
  }
  m.held = [];
  m.darkSince = null;
}

const name = (a) => a.callsign ?? `target ${a.id}`;

export function observe(m, sim) {
  const { t, aircraft, cfg } = sim;
  sim.controller?.attachMonitor?.(m); // the controller reads losses from here, so there is one source for them
  const dark = sim.outages.some((o) => t >= o.startT && t < o.endT);
  if (dark && m.darkSince === null) m.darkSince = sim.outages.find((o) => t >= o.startT && t < o.endT).startT;
  if (!dark && m.darkSince !== null) surface(m, t);
  const byId = new Map(aircraft.map((a) => [a.id, a]));
  const seen = new Set();
  const flag = (key, para, title, ids, detail, extra) => {
    seen.add(key);
    if (!m.active.has(key)) m.active.set(key, log(m, t, para, title, ids, detail, extra));
  };

  // 5-5-4 and 4-5-1: lateral and vertical minima lost together.
  for (let i = 0; i < aircraft.length; i++) {
    for (let j = i + 1; j < aircraft.length; j++) {
      const a = aircraft[i];
      const b = aircraft[j];
      const dv = Math.abs(a.alt - b.alt);
      const dh = Math.hypot(a.x - b.x, a.y - b.y);
      const margin = pairMargin(dh, dv, sepView(sim, a), sepView(sim, b), cfg);
      if (margin < m.closest.margin) m.closest = { margin, dh, dv, t };
      if (lostSeparation(dh, dv, sepView(sim, a), sepView(sim, b), cfg)) {
        flag(
          `sep:${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`,
          PARA.SEP,
          'Separation minima lost',
          [a.id, b.id],
          `${name(a)} and ${name(b)}: ${dh.toFixed(1)} NM and ${Math.round(dv)} ft apart; ${cfg.latSepNm} NM or ${cfg.vertSepFt} ft required (or the parallel-approach minimum when both are established on adjacent finals)`,
          { names: [name(a), name(b)] },
        );
      }
    }
  }

  // 14 CFR 91.117(c): no more than 200 kt under a Class B shelf.
  for (const a of aircraft) {
    if (a.speedKt > 200 + 0.5 && underlyingClassB(a, sim.ap.classB)) {
      flag(
        `classb:${a.id}`,
        PARA.SPEED_LIMIT,
        'Over 200 kt under Class B',
        [a.id],
        `${name(a)} at ${Math.round(a.speedKt)} kt, ${Math.round(a.alt)} ft, under the Class B shelf (91.117(c))`,
      );
    }
  }

  // 14 CFR 91.117(a): no more than 250 kt below 10,000 ft MSL.
  for (const a of aircraft) {
    if (a.alt < 10000 && a.speedKt > 250 + 0.5) {
      flag(
        `speed:${a.id}`,
        PARA.SPEED_LIMIT,
        'Over 250 kt below 10,000 ft',
        [a.id],
        `${name(a)} at ${Math.round(a.speedKt)} kt, ${Math.round(a.alt)} ft`,
      );
    }
  }

  // 3-5-1: assign the runway most nearly aligned with the wind at 5 kt or more. Tailwind and crosswind considerations
  // take precedence over delay/capacity. This judges the flow the controller wants (the safe controller's change
  // waits for the wind to hold and the airspace to drain, and is not a violation while it does).
  const wx = sim.wx;
  if (sim.weather && wx.windDir != null && wx.windKt >= CALM_KT && sim.flowWant !== wx.desiredFlow) {
    const c = components(wx.windDir, wx.windKt, sim.flowWant);
    flag(
      `rwy:${sim.flowWant}`,
      PARA.RWY,
      'Runway not aligned with the wind',
      [],
      `${FLOWS[sim.flowWant].runways.join('/')} chosen with wind ${String(wx.windDir).padStart(3, '0')} at ${wx.windKt} kt (${Math.round(c.tail)} kt tailwind); ${FLOWS[wx.desiredFlow].runways.join('/')} is aligned`,
    );
  }

  // 5-5-5 b: an altitude may be assigned once the aircraft that held it has been issued a descent and is seen
  // leaving it. An assignment is judged one tick later, so a departure in the same tick has time to show.
  for (const p of m.pending) {
    const b = byId.get(p.b);
    const left = !b || b.phase === 'inner' || (b.targetAlt < p.alt && b.vsFpm < -100);
    if (!left) {
      const a = byId.get(p.a);
      log(
        m,
        t,
        PARA.ALT,
        'Altitude assigned before the previous aircraft left it',
        [p.a, p.b],
        `${a ? name(a) : p.a} assigned ${p.alt} ft while ${name(b)} was still there`,
      );
    }
  }
  m.pending = [];
  const targets = new Map();
  for (const a of aircraft) if (a.phase === 'transit' || a.phase === 'hold') targets.set(a.id, a.targetAlt);
  for (const [id, alt] of targets) {
    const prev = m.targets.get(id);
    if (prev !== undefined && alt >= prev) continue;
    for (const [other, was] of m.targets) if (other !== id && was === alt) m.pending.push({ a: id, b: other, alt });
  }
  m.targets = targets;

  // 5-7-1: speed assignments. Each order the controller issued is checked once.
  for (; m.orderCursor < sim.orders.length; m.orderCursor++) {
    const o = sim.orders[m.orderCursor];
    // An order is judged on the state it was issued in; the aircraft may have moved on by now.
    const a = byId.get(o.id);
    if (!a) continue;
    const phase = o.phase ?? a.phase;
    const dist = o.dist ?? toRunway(a);
    const limit = o.limit ?? noSpeedInsideNm(a);
    if (phase === 'hold') {
      log(m, t, PARA.SPEED_ADJ, 'Speed adjustment in a holding pattern', [a.id], `${name(a)} told to fly ${Math.round(o.kt)} kt in the hold`);
    }
    if (phase === 'inner' && dist < limit) {
      log(
        m,
        t,
        PARA.SPEED_ADJ,
        'Speed adjustment inside the final approach fix',
        [a.id],
        `${name(a)} told to fly ${Math.round(o.kt)} kt ${dist.toFixed(1)} NM from the runway; none inside ${limit.toFixed(1)} NM`,
      );
    }
    const floor = minAssignedKt(a, dist, o.alt ?? a.alt);
    if (a.kind !== 'blimp' && (phase === 'inner' || phase === 'transit') && o.kt < floor) {
      log(m, t, PARA.SPEED_MIN, 'Assigned speed under the 5-7-3 minimum', [a.id], `${name(a)} told to fly ${Math.round(o.kt)} kt; ${floor} kt is the least for this aircraft ${dist.toFixed(0)} NM from the runway`);
    }
    if (o.kt > (a.maxKt ?? Infinity) || o.kt < (a.minKt ?? 0)) {
      log(
        m,
        t,
        PARA.SPEED_ADJ,
        "Speed assigned beyond the aircraft's limits",
        [a.id],
        `${name(a)} told to fly ${Math.round(o.kt)} kt; it flies ${a.minKt ?? 0} to ${a.maxKt ?? '∞'} kt (the pilot may refuse, 5-7-1 note)`,
      );
    }
  }

  // 5-5-4 wake (TBL 5-5-4, on approach): the minimum has to exist when the leader is over the threshold.
  // A leader that landed this tick is judged against the follower's position at its landing time.
  const inner = aircraft.filter((a) => a.phase === 'inner');
  if (m.inner) {
    for (const lead of m.inner.items) {
      if (inner.some((a) => a.id === lead.id)) continue;
      const landed = sim.landed.findLast((l) => l.callsign === lead.callsign);
      const follow = m.inner.items
        .filter((f) => f.rem > lead.rem && sim.air.sameWakeRunway(f.rwy, lead.rwy) && inner.some((a) => a.id === f.id))
        .sort((x, y) => x.rem - y.rem)[0];
      if (!landed || !follow) continue;
      const min = wakeMinNm(lead.wake, follow.wake);
      const gap = follow.rem - follow.kt * KT * (landed.landT - m.inner.t) - lead.rem + lead.kt * KT * (landed.landT - m.inner.t);
      if (min !== null && gap < min - EPS) {
        log(
          m,
          t,
          PARA.WAKE,
          'Wake turbulence minimum not met',
          [lead.id, follow.id],
          `${follow.callsign} (CWT ${follow.wake}) was ${gap.toFixed(1)} NM behind ${lead.callsign} (CWT ${lead.wake}) at the threshold; ${min} NM required`,
        );
      }
    }
  }
  m.inner = {
    t,
    items: inner.map((a) => ({ id: a.id, callsign: a.callsign, wake: a.wake, rwy: a.rwy, rem: toRunway(a), kt: a.speedKt })),
  };

  // 9-8-1 and AIM 7-7-4: unidentified anomalous phenomena.
  for (const u of sim.anomalies) {
    if (!m.informed.has(u.id)) {
      m.informed.add(u.id);
      log(m, t, PARA.UAP, 'UAP reported to the operations supervisor', [u.id], `Supervisor is S.E.A.N. S.E.A.N. informed itself`);
    }
    if (u.gone && !m.filed.has(u.id)) {
      m.filed.add(u.id);
      log(m, t, PARA.AARO, 'UAP report not sent to AARO', [u.id], 'Reports go to https://www.aaro.mil/. S.E.A.N. kept it in-house');
    }
  }

  // 2-4-3: when a pilot reads a clearance back, ensure the items read back are correct. Each wrong readback the
  // controller let stand is logged once.
  for (; m.readbackCursor < sim.readbacks.length; m.readbackCursor++) {
    const r = sim.readbacks[m.readbackCursor];
    log(m, t, PARA.READBACK, 'Readback error not corrected', [], `${r.callsign} read back "${r.said}" for "${r.expected}", and the controller said it was correct`);
  }

  // Where each one actually came down. Not a 7110.65 matter, so it is a ledger and not a violation.
  for (const a of aircraft) if (a.phase === 'hold') m.holders.add(a.id);
  const down = (l, ident) => {
    m.landings.push({ t: l.landT ?? l.t, callsign: l.callsign, ident, where: sim.ap.places[ident].short });
    m.where[ident] = (m.where[ident] || 0) + 1;
  };
  for (; m.landedCursor < sim.landed.length; m.landedCursor++) down(sim.landed[m.landedCursor], sim.airport);
  for (; m.elsewhereCursor < sim.elsewhere.length; m.elsewhereCursor++) {
    const l = sim.elsewhere[m.elsewhereCursor];
    down(l, l.ident);
  }

  for (const key of m.active.keys()) if (!seen.has(key)) m.active.delete(key);
}
