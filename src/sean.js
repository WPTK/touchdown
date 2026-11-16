// S.E.A.N., the Superintelligent Enroute Arrival Navigator. It takes the safe sequencer's plan and improves it.
// Everything is seeded: same seed, same mess. It uses its own random stream, so the traffic it gets is the
// traffic the safe controller would get. The only difference is what it does with it.
//
// Hooks into sim.js: beforeStep, afterStep, onSpawn, onDepart.

import { mulberry32 } from './rng.js';
import { FAF, outerAlt } from './sim.js';
import { pick } from './comms.js';

const KT = 1 / 3600;
const HOUR = 3600;
const FEED_MAX = 300;

const SPACINGS = [120, 120, 95, 80, 70, 60, 50];
const STEP_RATES = [520, 520, 700, 900, 1200];

export const BLIMP_KT = 35;

export function createSean(seed = 1) {
  const rng = mulberry32((Math.imul(seed, 2654435761) ^ 0x5ea9) >>> 0);
  const expo = (meanS) => -Math.log(1 - rng()) * meanS;
  const sean = {
    feed: [], // { t, kind, text }, newest last
    credit: 0, // landings S.E.A.N. has taken credit for
    goArounds: 0,
    diverted: [],
    blimpsSent: 0,
    ufosSeen: 0,
    landedSeen: 0,
    lossSeen: 0,
    lastBlameT: -Infinity,
    nextBlimpT: 600 + expo(3 * HOUR),
    nextUfoT: 600 + expo(2 * HOUR),
    blimpId: null,
    blimpWinSaid: false,
    started: false,
  };

  const say = (sim, kind, text) => {
    sean.feed.push({ t: sim.t, kind, text });
    if (sean.feed.length > FEED_MAX) sean.feed.shift();
  };
  const line = (sim, feedKind, key, vars) => say(sim, feedKind, pick(key, rng, vars));
  const fixName = (sim, a) => sim.geo.feeders[a.feeder].name;
  const onFinal = (sim, a) => a.phase === 'inner' && a.s > sim.geo.feeders[a.feeder].l1;
  const distRwy = (a) => Math.hypot(a.x, a.y);

  function issueSpeed(sim, a, kt, applies = true) {
    sim.orders.push({ t: sim.t, id: a.id, kt });
    if (applies) {
      a.innerKt = kt;
      a.speedKt = kt;
    }
  }

  function goAround(sim, a) {
    const { cfg } = sim;
    a.phase = 'transit';
    a.s = 0;
    a.goArounds = (a.goArounds || 0) + 1;
    a.fromAlt = a.alt;
    a.targetAlt = cfg.baseLevelFt + cfg.levelStepFt * sim.queue.length;
    a.stepStartT = sim.t;
    a.innerKt = undefined;
    a.boostAt = undefined;
    a.speedKt = cfg.transitSpeedKt;
    sim.queue.push(a);
    sean.goArounds++;
    line(sim, 'tx', 'gaasTx', { cs: a.callsign });
    line(sim, 'brag', 'gaas', { cs: a.callsign, n: sean.goArounds });
  }

  function divert(sim) {
    const { cfg, queue } = sim;
    const cands = queue.map((a, i) => i).filter((i) => i > 0 && queue[i].kind !== 'blimp' && queue[i].phase !== 'inner');
    if (!cands.length) return;
    const i = cands[Math.floor(rng() * cands.length)];
    const [a] = queue.splice(i, 1);
    for (const b of queue.slice(i)) {
      b.fromAlt = outerAlt(sim, b, sim.t);
      b.stepStartT = sim.t;
      b.targetAlt = Math.max(cfg.baseLevelFt, b.targetAlt - cfg.levelStepFt);
    }
    sim.aircraft = sim.aircraft.filter((x) => x !== a);
    sean.diverted.push({ t: sim.t, callsign: a.callsign });
    line(sim, 'tx', 'divertTx', { cs: a.callsign });
    line(sim, 'brag', 'divert', { cs: a.callsign });
  }

  function newUfo(sim) {
    const bearing = rng() * 2 * Math.PI;
    const r = 28 + rng() * 12;
    const u = {
      id: sim.nextId++,
      x: r * Math.sin(bearing),
      y: r * Math.cos(bearing),
      spawnT: sim.t,
      endT: sim.t + 90 + rng() * 150,
      squawk: String(1000 + Math.floor(rng() * 7000)),
      vx: 0,
      vy: 0,
      nextMoveT: sim.t,
      gone: false,
    };
    sim.anomalies.push(u);
    sean.ufosSeen++;
    const fix = u.y >= 0 ? sim.geo.feeders[0].name : sim.geo.feeders[1].name;
    line(sim, 'tx', 'ufoTx', { fix, sq: u.squawk, n: sim.queue.length + 1 });
    line(sim, 'brag', 'ufo');
  }

  // Instant turns, dead stops and jumps, because nothing else on the scope can do them.
  function moveUfo(sim, u, dt) {
    if (sim.t >= u.endT) {
      u.gone = true;
      line(sim, 'brag', 'ufoGone');
      return;
    }
    if (sim.t >= u.nextMoveT) {
      u.nextMoveT = sim.t + 3 + rng() * 9;
      const m = rng();
      if (m < 0.3) {
        u.vx = 0;
        u.vy = 0;
      } else if (m < 0.6) {
        const h = rng() * 2 * Math.PI;
        const kt = 300 + rng() * 1500;
        u.vx = Math.sin(h) * kt;
        u.vy = Math.cos(h) * kt;
      } else {
        u.x += (rng() - 0.5) * 16;
        u.y += (rng() - 0.5) * 16;
      }
    }
    u.x += u.vx * KT * dt;
    u.y += u.vy * KT * dt;
    const r = Math.hypot(u.x, u.y);
    if (r > 42) {
      u.x *= 42 / r;
      u.y *= 42 / r;
    }
  }

  const ctl = {
    sean,

    beforeStep(sim, dt) {
      const { cfg, queue } = sim;
      const t = sim.t;
      if (!sean.started) {
        sean.started = true;
        line(sim, 'brag', 'online');
      }

      for (; sean.landedSeen < sim.landed.length; sean.landedSeen++) {
        sean.credit++;
        const l = sim.landed[sean.landedSeen];
        line(sim, 'brag', 'landing', { cs: l.callsign, n: sean.credit, pct: 12 + Math.floor(rng() * 380) });
      }

      if (sim.losses.length > sean.lossSeen) {
        sean.lossSeen = sim.losses.length;
        if (t - sean.lastBlameT > 90) {
          sean.lastBlameT = t;
          const l = sim.losses.at(-1);
          line(sim, 'blame', 'blame', { a: l.a, b: l.b });
        }
      }

      if (t >= sean.nextBlimpT && !sim.upstream.some((r) => r.kind) && !sim.aircraft.some((a) => a.kind === 'blimp')) {
        sean.nextBlimpT = t + expo(3 * HOUR);
        sean.blimpsSent++;
        sim.upstream.push({ requestT: t, callsign: `ZPL${sean.blimpsSent}`, kind: 'blimp' });
        sim.requested++;
      }
      if (t >= sean.nextUfoT && !sim.anomalies.some((u) => !u.gone)) {
        sean.nextUfoT = t + expo(2 * HOUR);
        newUfo(sim);
      }
      for (const u of sim.anomalies) if (!u.gone) moveUfo(sim, u, dt);

      // The second aircraft is told to descend into the head's level while the head is still in it.
      const [q0, q1] = queue;
      if (q1 && q0.phase !== 'inner' && !q1.preStepped && q1.targetAlt === q0.targetAlt + cfg.levelStepFt && rng() < 0.0015 * dt) {
        q1.fromAlt = outerAlt(sim, q1, t);
        q1.stepStartT = t;
        q1.targetAlt = q0.targetAlt;
        q1.preStepped = true;
        line(sim, 'tx', 'earlyTx', { cs: q1.callsign, alt: q1.targetAlt, other: q0.callsign });
        line(sim, 'brag', 'early', { alt: q1.targetAlt, other: q0.callsign });
      }

      // A holding head is released early: tighter spacing than the last departure was given.
      if (q0 && q0.phase === 'hold' && cfg.spacingS > 50 && rng() < 0.004 * dt) {
        cfg.spacingS = 50;
        line(sim, 'tx', 'holdCutTx', { cs: q0.callsign });
        line(sim, 'brag', 'holdCut', { fix: fixName(sim, q0) });
      }

      for (const a of sim.aircraft) {
        if (a.phase === 'hold' && !a.drift && rng() < 0.002 * dt) {
          a.drift = { startT: t, ang: Math.PI + (rng() - 0.5) * 1.2, rate: 0.1 + rng() * 0.2, said: false };
        }
        if (onFinal(sim, a) && a.boostAt === undefined && a.kind !== 'blimp') {
          a.boostAt = rng() < 0.35 ? 1.5 + rng() * 5 : 0;
        }
        if (a.boostAt && onFinal(sim, a) && distRwy(a) <= a.boostAt) {
          a.boostAt = 0;
          const kt = Math.round((a.innerKt ?? cfg.innerSpeedKt) + 40 + rng() * 25);
          issueSpeed(sim, a, kt);
          line(sim, 'tx', 'speedTx', { cs: a.callsign, kt });
          line(sim, 'brag', 'speed', { kt });
        }
        if (a.kind === 'blimp' && a.phase === 'inner' && !a.ordered) {
          a.ordered = true;
          issueSpeed(sim, a, cfg.innerSpeedKt, false);
          line(sim, 'tx', 'blimpSpeedTx', { cs: a.callsign, kt: cfg.innerSpeedKt });
          line(sim, 'brag', 'blimpSpeed', { cs: a.callsign });
          sean.blimpId = a.id;
        }
      }
      if (sean.blimpId !== null && !sim.aircraft.some((a) => a.id === sean.blimpId)) {
        sean.blimpId = null;
        sean.blimpWinSaid = false;
      } else if (sean.blimpId !== null && !sean.blimpWinSaid && rng() < 0.01 * dt) {
        sean.blimpWinSaid = true;
        line(sim, 'brag', 'blimpWin', { cs: sim.aircraft.find((a) => a.id === sean.blimpId).callsign });
      }

      // GaaS: when the final is crowded, the last one in line gets a go-around.
      const final = sim.aircraft.filter((a) => onFinal(sim, a) && distRwy(a) < FAF.x && a.kind !== 'blimp');
      if (final.length >= 3 && rng() < 0.03 * dt) {
        const last = final.reduce((p, a) => (distRwy(a) > distRwy(p) ? a : p));
        if ((last.goArounds || 0) < 2 && queue.length < cfg.maxQueue) goAround(sim, last);
      }

      if (queue.length >= 4 && rng() < 0.0004 * dt) divert(sim);
    },

    // Holds drift west, away from the fix, until the aircraft is let out.
    afterStep(sim) {
      for (const a of sim.aircraft) {
        if (!a.drift) continue;
        if (a.phase !== 'hold') {
          a.drift = null;
          continue;
        }
        const d = Math.min(a.drift.rate * ((sim.t - a.drift.startT) / 60), 9);
        a.x += Math.cos(a.drift.ang) * d;
        a.y += Math.sin(a.drift.ang) * d;
        if (d > 2 && !a.drift.said) {
          a.drift.said = true;
          line(sim, 'brag', 'drift', { fix: fixName(sim, a), nm: Math.round(d) });
        }
      }
    },

    onSpawn(sim, a, req) {
      if (req.kind !== 'blimp') return;
      const f = sim.geo.feeders[Math.floor(rng() * 2)];
      const bearing = rng() * 2 * Math.PI;
      Object.assign(a, {
        kind: 'blimp',
        feeder: sim.geo.feeders.indexOf(f),
        x: f.x + 7 * Math.sin(bearing),
        y: f.y + 7 * Math.cos(bearing),
        wake: 'I',
        transitKt: BLIMP_KT,
        transitMinKt: BLIMP_KT,
        innerKt: BLIMP_KT,
        holdMinKt: BLIMP_KT,
        holdMaxKt: BLIMP_KT + 5,
        minKt: 20,
        maxKt: 60,
        speedKt: BLIMP_KT,
        fuelS: 48 * HOUR,
      });
      line(sim, 'tx', 'blimpTx', { cs: a.callsign, n: sim.queue.length });
      line(sim, 'brag', 'blimp', { cs: a.callsign });
    },

    // Every departure, S.E.A.N. re-optimizes the spacing and how fast the stack comes down.
    onDepart(sim, a) {
      for (const b of sim.queue) {
        if (b.preStepped) {
          b.preStepped = false;
          b.targetAlt += sim.cfg.levelStepFt;
        }
      }
      const s = SPACINGS[Math.floor(rng() * SPACINGS.length)];
      sim.cfg.stepRateFpm = STEP_RATES[Math.floor(rng() * STEP_RATES.length)];
      if (s < 120 && sim.queue[0]) {
        sim.cfg.spacingS = s;
        const vars = { cs: sim.queue[0].callsign, s, n: 1, pct: Math.round((120 / s - 1) * 100) };
        line(sim, 'tx', 'spacingTx', vars);
        line(sim, 'brag', 'spacing', vars);
      } else {
        sim.cfg.spacingS = 120;
      }
    },
  };
  return ctl;
}
