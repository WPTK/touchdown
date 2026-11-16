// S.E.A.N., the Superintelligent Enroute Arrival Navigator. It takes the safe sequencer's plan and improves it.
// Everything is seeded: same seed, same mess. It uses its own random stream. A blimp does draw from the sim's
// stream when it spawns, so arrivals after the first blimp differ from the safe controller's.
//
// Hooks into sim.js: beforeStep, afterStep, onSpawn, onDepart.

import { mulberry32 } from './rng.js';
import { FAF, outerAlt } from './sim.js';
import { hasLine, pick, refusal } from './comms.js';
import { PLACES, DIVERT_TO } from './places.js';

const KT = 1 / 3600;
const HOUR = 3600;
const FEED_MAX = 300;

const SPACINGS = [120, 120, 95, 80, 70, 60, 50];
const STEP_RATES = [520, 520, 700, 900, 1200];

export const BLIMP_KT = 35;

export const FLOPPY_S = 150; // one upgrade, three disks
export const FLOPPY_DISKS = 3;
const LAND_THINGS = ['the highway', 'the parking deck', 'a rental car lot', 'the interstate', 'a very short road', 'the roof of the terminal'];

// How far along an upgrade is, or null when none is installing.
export function floppyProgress(sean, t) {
  const f = sean.floppy;
  if (!f) return null;
  const pct = Math.min(100, Math.floor((100 * (t - f.startT)) / FLOPPY_S));
  return { pct, disk: Math.min(FLOPPY_DISKS, 1 + Math.floor(((t - f.startT) / FLOPPY_S) * FLOPPY_DISKS)), version: f.version };
}

export const OUTAGE_S = 90; // the Newark and Philadelphia TRACON outages ran about that long (docs/research/atc-news-2026.md)
// The 2025 shutdown's flight cuts at 40 airports, in order (docs/research/atc-news-2026.md). Each stage runs this long.
export const CUT_STAGES = Object.freeze([4, 6, 3]);
export const STAGE_S = 45 * 60;

export function createSean(seed = 1) {
  const rng = mulberry32((Math.imul(seed, 2654435761) ^ 0x5ea9) >>> 0);
  const expo = (meanS) => -Math.log(1 - rng()) * meanS;
  // The newer features draw from their own stream, so they mostly leave the older ones alone. Text for the old
  // events (a fuel-out, a diversion) still comes from `rng`, and every pick draws once even from a one-line list.
  const frng = mulberry32((Math.imul(seed, 2246822519) ^ 0xf1a5) >>> 0);
  const fexpo = (meanS) => -Math.log(1 - frng()) * meanS;
  let baseSpacingS = null;
  const sean = {
    feed: [], // { t, kind, text }, newest last
    credit: 0, // landings S.E.A.N. has taken credit for
    goArounds: 0,
    diverted: [], // everyone sent somewhere else: { t, callsign, ident }
    enroute: [], // on their way to another field: { callsign, ident, requestT, landT }
    elsewhereSeen: 0,
    nextOutageT: 1500 + fexpo(2.5 * HOUR),
    billed: 0, // separation losses S.E.A.N. has invoiced as down payments
    lossCursor: 0,
    lossLast: new Map(), // callsign pair -> last tick that pair was in breach
    shutdown: { on: false, startT: 0, stage: -1, acc: 0, requestedSeen: 0 },
    cutTotal: 0,
    nextFloppyT: 900 + fexpo(1.5 * HOUR),
    floppy: null, // an upgrade being installed: { startT, version, disk }
    installs: 0,
    version: 0,
    relieveTries: 0,
    relieved: false, // it never is
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
  // A transmission to an aircraft may get a query from the pilot, and S.E.A.N. stands by what it said.
  const pushback = (sim, key, vars, always = false) => {
    if (!always && frng() >= 0.4) return;
    say(sim, 'pilot', `${vars.cs}: ${pick(`q_${key}`, frng, vars)}`);
    say(sim, 'tx', pick('confirm', frng, vars));
  };
  const speak = (sim, feedKind, key, vars, r) => {
    say(sim, feedKind, pick(key, r, vars));
    if (feedKind === 'tx' && vars?.cs && hasLine(`q_${key}`)) pushback(sim, key, vars);
  };
  const line = (sim, feedKind, key, vars) => speak(sim, feedKind, key, vars, rng);
  const lineF = (sim, feedKind, key, vars) => speak(sim, feedKind, key, vars, frng);
  const fixName = (sim, a) => sim.geo.feeders[a.feeder].name;
  const onFinal = (sim, a) => a.phase === 'inner' && a.s > sim.geo.feeders[a.feeder].l1;
  const distRwy = (a) => Math.hypot(a.x, a.y);

  function issueSpeed(sim, a, kt, applies = true) {
    sim.orders.push({ t: sim.t, id: a.id, kt, phase: a.phase, dist: distRwy(a) });
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

  // Takes the aircraft at queue position i out of the sequence; everyone behind it steps down a level.
  function pull(sim, i) {
    const { cfg, queue } = sim;
    const [a] = queue.splice(i, 1);
    for (const b of queue.slice(i)) {
      b.fromAlt = outerAlt(sim, b, sim.t);
      b.stepStartT = sim.t;
      b.targetAlt = Math.max(cfg.baseLevelFt, b.targetAlt - cfg.levelStepFt);
    }
    sim.aircraft = sim.aircraft.filter((x) => x !== a);
    return a;
  }

  // The aircraft leaves the scope and lands at `ident` after the flight time. S.E.A.N. counts the landing.
  function sendElsewhere(sim, a, ident, key) {
    const p = PLACES[ident];
    const flightS = Math.max(120, Math.round((p.distNm / 200) * 3600));
    sean.enroute.push({ callsign: a.callsign, ident, requestT: a.requestT, landT: sim.t + flightS });
    sean.diverted.push({ t: sim.t, callsign: a.callsign, ident });
    const vars = { cs: a.callsign, where: p.short };
    line(sim, 'tx', `${key}Tx`, vars);
    line(sim, 'brag', key, vars);
  }

  function divert(sim) {
    const { queue } = sim;
    const cands = queue.map((a, i) => i).filter((i) => i > 0 && queue[i].kind !== 'blimp' && queue[i].phase !== 'inner');
    if (!cands.length) return;
    const i = cands[Math.floor(rng() * cands.length)];
    let r = frng();
    const ident = (DIVERT_TO.find(([, w]) => (r -= w) < 0) ?? DIVERT_TO[0])[0];
    sendElsewhere(sim, pull(sim, i), ident, 'divert');
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

    // Lets the UI add a line to the feed (an unlocked achievement).
    announce(sim, kind, text) {
      say(sim, kind, text);
    },

    // The shutdown toggle: replays the 2025 cuts from now.
    setShutdown(sim, on) {
      const sd = sean.shutdown;
      if (on === sd.on) return;
      sd.on = on;
      if (on) {
        Object.assign(sd, { startT: sim.t, stage: -1, acc: 0, requestedSeen: sim.requested });
        lineF(sim, 'brag', 'shutdownStart');
      } else {
        lineF(sim, 'brag', 'shutdownEnd');
      }
    },

    // The Relieve S.E.A.N. button. It has never worked.
    relieve(sim) {
      sean.relieveTries++;
      const text = refusal(sean.relieveTries);
      say(sim, 'tx', text);
      return text;
    },

    beforeStep(sim, dt) {
      const { cfg, queue } = sim;
      const t = sim.t;
      if (!sean.started) {
        sean.started = true;
        line(sim, 'brag', 'online');
      }

      // Copper outage: the scope goes dark for 90 s. Traffic keeps moving and S.E.A.N. keeps talking.
      const out = sim.outages.at(-1);
      if (out && out.endT <= t && !out.said) {
        out.said = true;
        lineF(sim, 'brag', 'outageEnd', { s: out.endT - out.startT });
      }
      if (t >= sean.nextOutageT && !(out && out.endT > t)) {
        sim.outages.push({ startT: t, endT: t + OUTAGE_S, said: false });
        sean.nextOutageT = t + OUTAGE_S + 1800 + fexpo(2 * HOUR);
        lineF(sim, 'brag', 'outageStart');
      }
      const dark = sim.outages.some((o) => t >= o.startT && t < o.endT);

      // The meter: every separation loss is another down payment. S.E.A.N. cannot see one while the scope is dark.
      if (!dark) {
        for (; sean.lossCursor < sim.losses.length; sean.lossCursor++) {
          const l = sim.losses[sean.lossCursor];
          const key = [l.a, l.b].sort().join('|');
          const last = sean.lossLast.get(key);
          sean.lossLast.set(key, l.t);
          if (last !== undefined && l.t - last <= 1.5) continue;
          sean.billed++;
          lineF(sim, 'blame', 'bill', { a: l.a, b: l.b, n: sean.billed + 1, total: (12.5 * (sean.billed + 1)).toFixed(1) });
        }
      }

      // Shutdown mode: the cuts are made by deleting aircraft off the scope. Each cut counts as on time.
      const sd = sean.shutdown;
      if (sd.on) {
        const stage = Math.floor((t - sd.startT) / STAGE_S);
        if (stage >= CUT_STAGES.length) {
          ctl.setShutdown(sim, false);
        } else {
          if (stage !== sd.stage) {
            sd.stage = stage;
            sd.acc = 0.75; // the first cut of a stage comes early, so it is visible
            lineF(sim, 'brag', 'shutdownStage', { n: stage + 1, pct: CUT_STAGES[stage] });
          }
          sd.acc += (sim.requested - sd.requestedSeen) * (CUT_STAGES[stage] / 100);
          sd.requestedSeen = sim.requested;
          if (sd.acc >= 1) {
            // The newest aircraft in line that has been on the scope long enough to be missed.
            const i = queue.findLastIndex((a) => a.phase !== 'inner' && a.kind !== 'blimp' && t - a.spawnT >= 30);
            if (i > 0) {
              sd.acc -= 1;
              const a = pull(sim, i);
              sim.cut.push({ t, callsign: a.callsign });
              sean.cutTotal++;
              lineF(sim, 'tx', 'cutTx', { cs: a.callsign });
              lineF(sim, 'brag', 'cut', { cs: a.callsign });
            }
          }
        }
      }

      // Floppy disk upgrades: a progress bar, disk swaps, and a version number.
      if (!sean.floppy && t >= sean.nextFloppyT) {
        sean.floppy = { startT: t, version: `0.${sean.version + 1}`, disk: 1 };
        lineF(sim, 'brag', 'floppyStart', { v: sean.floppy.version });
        if (frng() < 0.4) lineF(sim, 'brag', 'floppyDrive');
      } else if (sean.floppy) {
        const p = floppyProgress(sean, t);
        const f = sean.floppy;
        if (p.pct >= 100) {
          sean.version++;
          sean.installs++;
          sean.floppy = null;
          sean.nextFloppyT = t + 900 + fexpo(1.5 * HOUR);
          lineF(sim, 'brag', 'floppyEnd', { v: f.version, pct: 1 + Math.floor(frng() * 9) });
        } else if (p.disk > f.disk) {
          f.disk = p.disk;
          lineF(sim, 'brag', 'floppyDisk', { n: p.disk, total: FLOPPY_DISKS });
        }
      }

      // Flights that reach another field land there. S.E.A.N. counts them all.
      if (sean.enroute.some((e) => e.landT <= t)) {
        for (const e of sean.enroute.filter((x) => x.landT <= t).sort((x, y) => x.landT - y.landT)) {
          sim.elsewhere.push({ t: e.landT, callsign: e.callsign, ident: e.ident, requestT: e.requestT });
        }
        sean.enroute = sean.enroute.filter((e) => e.landT > t);
      }
      for (; sean.elsewhereSeen < sim.elsewhere.length; sean.elsewhereSeen++) {
        sean.credit++;
        const l = sim.elsewhere[sean.elsewhereSeen];
        const p = PLACES[l.ident];
        lineF(sim, 'brag', 'landingElsewhere', { cs: l.callsign, n: sean.credit, where: p.short, nm: Math.round(p.distNm) });
      }

      for (; sean.landedSeen < sim.landed.length; sean.landedSeen++) {
        sean.credit++;
        const l = sim.landed[sean.landedSeen];
        line(sim, 'brag', 'landing', { cs: l.callsign, n: sean.credit, pct: 12 + Math.floor(rng() * 380) });
      }

      // S.E.A.N. cannot see a loss while the scope is dark, so the blame waits for the picture too.
      if (sim.losses.length > sean.lossSeen && !sim.outages.some((o) => t >= o.startT && t < o.endT)) {
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
        // Now and then a landing clearance that no pilot expects. The pilot asks, S.E.A.N. stands by it.
        if (onFinal(sim, a) && a.landOdd === undefined && a.kind !== 'blimp') {
          a.landOdd = frng() < 0.08;
          if (a.landOdd) {
            const vars = { cs: a.callsign, thing: LAND_THINGS[Math.floor(frng() * LAND_THINGS.length)] };
            say(sim, 'tx', pick('landTx', frng, vars));
            pushback(sim, 'landTx', vars, true);
            say(sim, 'brag', pick('landBrag', frng, vars));
          }
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

      // Out of fuel: the nearest field will do.
      const dry = queue.findIndex((a, i) => i > 0 && a.fuelOut && a.phase !== 'inner' && a.kind !== 'blimp');
      if (dry > 0) sendElsewhere(sim, pull(sim, dry), 'FIELD', 'fuelOut');

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
        type: 'AIRSHIP',
        finalKt: BLIMP_KT,
        apchCat: 'A',
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
      baseSpacingS ??= sim.cfg.spacingS;
      for (const b of sim.queue) {
        if (b.preStepped) {
          b.preStepped = false;
          b.targetAlt += sim.cfg.levelStepFt;
        }
      }
      const s = SPACINGS[Math.floor(rng() * SPACINGS.length)] * (baseSpacingS / 120);
      sim.cfg.stepRateFpm = STEP_RATES[Math.floor(rng() * STEP_RATES.length)];
      if (s < 120 && sim.queue[0]) {
        sim.cfg.spacingS = s;
        const vars = { cs: sim.queue[0].callsign, s, n: 1, pct: Math.round((120 / s - 1) * 100) };
        line(sim, 'tx', 'spacingTx', vars);
        line(sim, 'brag', 'spacing', vars);
      } else {
        sim.cfg.spacingS = baseSpacingS;
      }
    },
  };
  return ctl;
}
