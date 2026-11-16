import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, step } from '../src/sim.js';
import { classBFloor, createMonitor, observe, PARA } from '../src/monitor.js';
import { createWeather } from '../src/weather.js';
import { SCENARIOS } from '../src/scenarios.js';

let nextId = 1;
const plane = (o = {}) => ({
  id: nextId++,
  callsign: `TST${nextId}`,
  phase: 'transit',
  x: 30,
  y: 30,
  alt: 12000,
  targetAlt: 12000,
  vsFpm: 0,
  speedKt: 160,
  feeder: 0,
  s: 0,
  wake: 'F',
  ...o,
});
const rig = (...planes) => {
  const sim = createSim({ seed: 1, demandPerHour: 0 });
  sim.aircraft.push(...planes);
  return { sim, m: createMonitor() };
};
// An aircraft released from CHPPR1's hold fix to 26R, s NM along its inner route.
const onRoute = (sim, o, left) => {
  const route = sim.geo.stars.CHPPR1.routes['26R'];
  return Object.assign(o, { phase: 'inner', rwy: '26R', route, s: route.path.len - left });
};
const tick = (sim, m, n = 1) => {
  for (let i = 0; i < n; i++) {
    sim.t += 1;
    observe(m, sim);
  }
};
const of = (m, para) => m.violations.filter((v) => v.para === para);

test('5-5-4 / 4-5-1: fires when both minima are lost, quiet when either holds', () => {
  const a = plane({ x: 0, y: 0, alt: 5000 });
  const { sim, m } = rig(a, plane({ x: 1, y: 0, alt: 5400 }), plane({ x: 2, y: 0, alt: 7000 }), plane({ x: 9, y: 0, alt: 5000 }));
  tick(sim, m);
  assert.equal(of(m, PARA.SEP).length, 1);
  assert.equal(of(m, PARA.SEP)[0].ids.length, 2);
});

test('5-5-4 / 4-5-1: an ongoing breach is logged once, then again after it clears', () => {
  const b = plane({ x: 1, y: 0, alt: 5400 });
  const { sim, m } = rig(plane({ x: 0, y: 0, alt: 5000 }), b);
  tick(sim, m, 5);
  assert.equal(of(m, PARA.SEP).length, 1);
  b.x = 20;
  tick(sim, m);
  b.x = 1;
  tick(sim, m);
  assert.equal(of(m, PARA.SEP).length, 2);
});

test('91.117: over 250 kt below 10,000 ft fires, otherwise quiet', () => {
  const { sim, m } = rig(
    plane({ alt: 8000, speedKt: 250 }),
    plane({ x: 50, alt: 12000, speedKt: 300 }),
    plane({ x: -50, alt: 8000, speedKt: 280 }),
  );
  tick(sim, m);
  assert.equal(of(m, PARA.SPEED_LIMIT).length, 1);
  assert.deepEqual(of(m, PARA.SPEED_LIMIT)[0].ids, [sim.aircraft[2].id]);
});

test('5-5-5 b: an altitude assigned while the old occupant is still there fires', () => {
  const holder = plane({ phase: 'hold', alt: 7000, targetAlt: 7000, x: 26, y: 12 });
  const next = plane({ phase: 'hold', alt: 8000, targetAlt: 8000, x: -30, y: 12 });
  const { sim, m } = rig(holder, next);
  tick(sim, m);
  next.targetAlt = 7000;
  tick(sim, m, 2);
  assert.equal(of(m, PARA.ALT).length, 1);
  assert.deepEqual(of(m, PARA.ALT)[0].ids, [next.id, holder.id]);
});

test('5-5-5 b: quiet when the old occupant has left or is seen descending', () => {
  for (const leave of [
    (h) => (h.phase = 'inner'),
    (h) => {
      h.targetAlt = 6000;
      h.vsFpm = -500;
    },
  ]) {
    const holder = plane({ phase: 'hold', alt: 7000, targetAlt: 7000, x: 26, y: 12 });
    const next = plane({ phase: 'hold', alt: 8000, targetAlt: 8000, x: -30, y: 12 });
    const { sim, m } = rig(holder, next);
    tick(sim, m);
    next.targetAlt = 7000;
    leave(holder);
    tick(sim, m, 2);
    assert.equal(of(m, PARA.ALT).length, 0);
  }
});

test('5-7-1: speed orders in a hold, inside 5 NM, or beyond the aircraft fire; ordinary ones do not', () => {
  const hold = plane({ phase: 'hold' });
  const close = plane({ phase: 'inner', x: 3, y: 0, alt: 900 });
  const far = plane({ phase: 'inner', x: 8, y: 0, alt: 2400 });
  const slow = plane({ phase: 'transit', maxKt: 60 });
  const ok = plane({ phase: 'transit', x: -30 });
  const { sim, m } = rig(hold, close, far, slow, ok);
  onRoute(sim, close, 3); // inside 5 NM of the runway, inside the real FAF
  onRoute(sim, far, 8);
  sim.orders.push(
    { t: 0, id: hold.id, kt: 200 },
    { t: 0, id: close.id, kt: 200 },
    { t: 0, id: far.id, kt: 180 },
    { t: 0, id: slow.id, kt: 160 },
    { t: 0, id: ok.id, kt: 220 },
  );
  tick(sim, m);
  const hits = of(m, PARA.SPEED_ADJ);
  assert.deepEqual(hits.map((v) => v.ids[0]).sort(), [hold.id, close.id, slow.id].sort());
  tick(sim, m);
  assert.equal(of(m, PARA.SPEED_ADJ).length, 3, 'orders are judged once');
});

test('5-5-4 wake: the minimum must exist when the leader is over the threshold', () => {
  for (const [gapNm, fires] of [[3, true], [6, false]]) {
    const lead = plane({ phase: 'inner', wake: 'B', callsign: 'LEAD' });
    const follow = plane({ phase: 'inner', wake: 'F', callsign: 'FLW' });
    const { sim, m } = rig(lead, follow);
    onRoute(sim, lead, 0.1);
    onRoute(sim, follow, 0.1 + gapNm);
    lead.x = 0;
    follow.x = 20;
    lead.alt = 0;
    follow.alt = 3000;
    tick(sim, m);
    sim.aircraft.shift();
    sim.landed.push({ callsign: 'LEAD', landT: sim.t });
    tick(sim, m);
    assert.equal(of(m, PARA.WAKE).length, fires ? 1 : 0, `gap ${gapNm} NM`);
  }
});

test('9-8-1 and AIM 7-7-4: a UAP is reported to the supervisor, then not sent to AARO', () => {
  const { sim, m } = rig();
  tick(sim, m);
  assert.equal(m.violations.length, 0);
  const u = { id: 99, x: 20, y: 5, gone: false };
  sim.anomalies.push(u);
  tick(sim, m, 3);
  assert.equal(of(m, PARA.UAP).length, 1);
  assert.match(of(m, PARA.UAP)[0].detail, /S\.E\.A\.N\./);
  assert.equal(of(m, PARA.AARO).length, 0);
  u.gone = true;
  tick(sim, m, 3);
  assert.equal(of(m, PARA.AARO).length, 1);
  assert.match(of(m, PARA.AARO)[0].detail, /aaro\.mil/);
});

for (const [demand, seeds] of [
  [12, 20],
  [24, 20],
  [45, 20],
]) {
  test(`oracle: the safe controller breaks no rule, ${demand}/h x ${seeds} seeds x 4 h`, () => {
    for (let seed = 1; seed <= seeds; seed++) {
      const sim = createSim({ seed, demandPerHour: demand });
      const m = createMonitor();
      while (sim.t < 4 * 3600) {
        step(sim, 1);
        observe(m, sim);
      }
      assert.deepEqual(m.violations, [], `seed ${seed}, ${demand}/h: ${JSON.stringify(m.violations[0])}`);
    }
  });
}

// West flow above, east flow and every real day here: the safe controller flies all of it on the real geometry.
test('oracle: the safe controller breaks no rule in any weather scenario, east flow included', () => {
  for (const sc of SCENARIOS) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const sim = createSim({ seed, demandPerHour: 30, weather: createWeather({ scenario: sc, seed }) });
      const m = createMonitor();
      while (sim.t < 4 * 3600) {
        step(sim, 1);
        observe(m, sim);
      }
      assert.deepEqual(m.violations, [], `${sc.id} seed ${seed}: ${JSON.stringify(m.violations[0])}`);
    }
  }
});

// Without the PRM/FMA flag the parallels run dependent (5-9-6, 1.5 NM diagonal). The safe controller plans for it.
test('oracle: the safe controller breaks no rule with the PRM flag off', () => {
  for (const flowWx of [null, 'east-flow']) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const weather = flowWx ? createWeather({ scenario: SCENARIOS.find((s) => s.id === flowWx), seed }) : null;
      const sim = createSim({ seed, demandPerHour: 30, config: { prm: false }, weather });
      const m = createMonitor();
      while (sim.t < 3 * 3600) {
        step(sim, 1);
        observe(m, sim);
      }
      assert.deepEqual(m.violations, [], `${flowWx ?? 'calm'} seed ${seed}: ${JSON.stringify(m.violations[0])}`);
    }
  }
});

test('91.117(c): over 200 kt under a Class B shelf fires; on the surface area, above a shelf or outside it does not', () => {
  const under = plane({ x: 20, y: 0, alt: 2500, speedKt: 220 }); // the outline here has a 3,000 ft floor
  const above = plane({ x: 20, y: 0, alt: 4000, speedKt: 220 });
  const slow = plane({ x: 20, y: 0, alt: 2500, speedKt: 200 });
  const outside = plane({ x: -45, y: -45, alt: 2500, speedKt: 240 });
  const { sim, m } = rig(under, above, slow, outside);
  assert.equal(classBFloor(20, 0), 3000);
  assert.equal(classBFloor(0, 0), 0);
  tick(sim, m);
  const hits = of(m, PARA.SPEED_LIMIT);
  assert.deepEqual(hits.map((v) => v.ids[0]), [under.id]);
  assert.match(hits[0].title, /Class B/);
});

test('5-7-3: a speed order under the floor fires by type and distance; a blimp is exempt', () => {
  const jetFar = plane({ phase: 'transit', x: -30, alt: 8000 });
  const jetNear = plane({ phase: 'inner', x: 10, y: 0, alt: 3000 });
  const jetNearOk = plane({ phase: 'inner', x: 12, y: 0, alt: 3500 });
  const prop = plane({ phase: 'inner', x: 11, y: 0, alt: 3200, engine: 'turboprop' });
  const blimp = plane({ phase: 'transit', kind: 'blimp', x: -35 });
  const { sim, m } = rig(jetFar, jetNear, jetNearOk, prop, blimp);
  for (const [a, left] of [[jetNear, 10], [jetNearOk, 12], [prop, 11]]) onRoute(sim, a, left);
  sim.orders.push(
    { t: 0, id: jetFar.id, kt: 190 }, // under 210 beyond 20 miles
    { t: 0, id: jetNear.id, kt: 160 }, // under 170 within 20 miles
    { t: 0, id: jetNearOk.id, kt: 170 },
    { t: 0, id: prop.id, kt: 150 }, // a turboprop may go to 150
    { t: 0, id: blimp.id, kt: 35 },
  );
  tick(sim, m);
  assert.deepEqual(of(m, PARA.SPEED_MIN).map((v) => v.ids[0]).sort(), [jetFar.id, jetNear.id].sort());
});
