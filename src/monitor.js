// JO 7110.65 conformance monitor. It watches the sim from outside and never changes it.
// Each check cites the paragraph it enforces; the wording comes from the FAA text in docs/research/faa-rules-deep.md
// (7110.65BB mirrored from faa.gov). Violations are { t, para, title, ids, detail }. A breach that is still going
// on is logged once and re-armed when it ends. One-off events (an altitude assignment, a speed order) are logged
// each time.
//
// There is no airship paragraph in 7110.65 or the AIM, so a blimp is only caught for what it breaks: separation,
// and speed orders it cannot fly.

import { FAF, RUNWAY } from './sim.js';
import { wakeMinNm } from './fleet.js';
import { PLACES } from './places.js';

const EPS = 1e-6;
const KT = 1 / 3600;

export const PARA = Object.freeze({
  SEP: '5-5-4 / 4-5-1',
  ALT: '5-5-5 b',
  SPEED_LIMIT: '14 CFR 91.117',
  SPEED_ADJ: '5-7-1',
  WAKE: '5-5-4 wake',
  UAP: '9-8-1',
  AARO: 'AIM 7-7-4',
});

// 5-7-1: no speed adjustment inside the final approach fix on final or a point 5 miles from the runway,
// whichever is closer to the runway.
export const NO_SPEED_INSIDE_NM = Math.min(Math.hypot(FAF.x - RUNWAY.x, FAF.y - RUNWAY.y), 5);

export function createMonitor() {
  return {
    violations: [],
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
    landedCursor: 0,
    elsewhereCursor: 0,
  };
}

function log(m, t, para, title, ids, detail) {
  const v = { t, para, title, ids, detail };
  m.violations.push(v);
  m.counts[para] = (m.counts[para] || 0) + 1;
  return v;
}

const name = (a) => a.callsign ?? `target ${a.id}`;
const remaining = (sim, a) => sim.geo.feeders[a.feeder].l1 + sim.geo.l2 - a.s;
const distToRunway = (a) => Math.hypot(a.x - RUNWAY.x, a.y - RUNWAY.y);

export function observe(m, sim) {
  const { t, aircraft, cfg } = sim;
  const byId = new Map(aircraft.map((a) => [a.id, a]));
  const seen = new Set();
  const flag = (key, para, title, ids, detail) => {
    seen.add(key);
    if (!m.active.has(key)) m.active.set(key, log(m, t, para, title, ids, detail));
  };

  // 5-5-4 and 4-5-1: lateral and vertical minima lost together.
  for (let i = 0; i < aircraft.length; i++) {
    for (let j = i + 1; j < aircraft.length; j++) {
      const a = aircraft[i];
      const b = aircraft[j];
      const dv = Math.abs(a.alt - b.alt);
      const dh = Math.hypot(a.x - b.x, a.y - b.y);
      if (dh < cfg.latSepNm - EPS && dv < cfg.vertSepFt - EPS) {
        flag(
          `sep:${Math.min(a.id, b.id)}:${Math.max(a.id, b.id)}`,
          PARA.SEP,
          'Separation minima lost',
          [a.id, b.id],
          `${name(a)} and ${name(b)}: ${dh.toFixed(1)} NM and ${Math.round(dv)} ft apart; ${cfg.latSepNm} NM or ${cfg.vertSepFt} ft required`,
        );
      }
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
    const dist = o.dist ?? distToRunway(a);
    if (phase === 'hold') {
      log(m, t, PARA.SPEED_ADJ, 'Speed adjustment in a holding pattern', [a.id], `${name(a)} told to fly ${Math.round(o.kt)} kt in the hold`);
    }
    if (phase === 'inner' && dist < NO_SPEED_INSIDE_NM) {
      log(
        m,
        t,
        PARA.SPEED_ADJ,
        'Speed adjustment inside the final approach fix',
        [a.id],
        `${name(a)} told to fly ${Math.round(o.kt)} kt ${dist.toFixed(1)} NM from the runway; none inside ${NO_SPEED_INSIDE_NM} NM`,
      );
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
        .filter((f) => f.rem > lead.rem && inner.some((a) => a.id === f.id))
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
    items: inner.map((a) => ({ id: a.id, callsign: a.callsign, wake: a.wake, rem: remaining(sim, a), kt: a.speedKt })),
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

  // Where each one actually came down. Not a 7110.65 matter, so it is a ledger and not a violation.
  for (const a of aircraft) if (a.phase === 'hold') m.holders.add(a.id);
  const down = (l, ident) => {
    m.landings.push({ t: l.landT ?? l.t, callsign: l.callsign, ident, where: PLACES[ident].short });
    m.where[ident] = (m.where[ident] || 0) + 1;
  };
  for (; m.landedCursor < sim.landed.length; m.landedCursor++) down(sim.landed[m.landedCursor], 'KATL');
  for (; m.elsewhereCursor < sim.elsewhere.length; m.elsewhereCursor++) {
    const l = sim.elsewhere[m.elsewhereCursor];
    down(l, l.ident);
  }

  for (const key of m.active.keys()) if (!seen.has(key)) m.active.delete(key);
}
