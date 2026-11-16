import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSim, drain, step } from '../src/sim.js';
import { createMonitor, observe } from '../src/monitor.js';
import { createSean } from '../src/sean.js';
import { PLACES } from '../src/places.js';
import { real, selfReported } from '../src/score.js';
import { refusal, REFUSALS } from '../src/comms.js';

function run(seed, hours = 4, demand = 30) {
  const ctl = createSean(seed);
  const sim = createSim({ seed, demandPerHour: demand, controller: ctl });
  const m = createMonitor();
  while (sim.t < hours * 3600) {
    step(sim, 1);
    observe(m, sim);
  }
  return { sim, m, sean: ctl.sean, ctl };
}

// Drains the sim, then lets flights already on their way to another field arrive. Returns how many flights were requested
// by then (a blimp can be requested after a drain, so later requests are not counted).
function finish(r) {
  assert.equal(drain(r.sim), true);
  const requested = r.sim.requested;
  while (r.sean.enroute.length) {
    step(r.sim, 1);
    observe(r.m, r.sim);
  }
  step(r.sim, 1); // S.E.A.N. counts a landing on the step after it
  observe(r.m, r.sim);
  return requested;
}

test('places: positions come from the FAA CIFP data, not memory', () => {
  const alt = JSON.parse(readFileSync(new URL('../data/alternates-2611.json', import.meta.url)));
  const katl = JSON.parse(readFileSync(new URL('../data/katl-2611.json', import.meta.url)));
  assert.equal(alt.source.cycle, katl.source.cycle);
  assert.match(alt.airports.KPDK.raw, /^SUSAP KPDK/);
  assert.equal(PLACES.KATL.distNm, 0);
  assert.ok(Math.abs(PLACES.KPDK.distNm - 15.7) < 0.2 && PLACES.KPDK.bearingDeg === 24);
  assert.ok(PLACES.KBHM.distNm > 110 && PLACES.KBHM.distNm < 125);
  // The field sits a couple of miles from the LaGrange-Callaway reference point.
  const lg = alt.airports.KLGC;
  const d = Math.hypot(PLACES.FIELD.xNm - lg.xNm, PLACES.FIELD.yNm - lg.yNm);
  assert.ok(Math.abs(d - 2.5) < 0.01);
  assert.equal(PLACES.FIELD.kind, 'field');
});

test('every aircraft ends in a landed state somewhere, and S.E.A.N. counts all of them', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const r = run(seed, 4, seed % 2 ? 24 : 45);
    const requested = finish(r);
    const { sim, sean, m } = r;
    assert.equal(sim.landed.length + sim.elsewhere.length, requested, `seed ${seed}: aircraft lost`);
    assert.equal(sean.credit, requested, `seed ${seed}: S.E.A.N. missed a landing`);
    assert.equal(m.landings.length, requested, `seed ${seed}: monitor ledger`);
    assert.equal(Object.values(m.where).reduce((a, b) => a + b, 0), requested);
    for (const l of sim.elsewhere) seen.add(l.ident);
  }
  for (const ident of ['KPDK', 'KBHM', 'FIELD']) assert.ok(seen.has(ident), `nobody landed at ${ident}`);
});

test("S.E.A.N.'s own numbers never get worse, and the monitor's do", () => {
  let worse = false;
  for (const seed of [1, 2, 3]) {
    const ctl = createSean(seed);
    const sim = createSim({ seed, demandPerHour: 40, controller: ctl });
    const m = createMonitor();
    let prev = selfReported(ctl.sean);
    for (let i = 0; i < 4 * 3600; i++) {
      step(sim, 1);
      observe(m, sim);
      if (i % 30) continue;
      const now = selfReported(ctl.sean);
      assert.ok(now.onTimePct >= prev.onTimePct && now.landingPct >= prev.landingPct);
      assert.ok(now.safetyScore >= prev.safetyScore && now.landed >= prev.landed);
      assert.equal(now.delays, 0);
      assert.equal(now.safety, '11/10');
      prev = now;
    }
    const truth = real(sim, m, ctl.sean);
    assert.ok(truth.holds > 0 && truth.losses > 0);
    if (truth.onTimePct < 100 || truth.elsewhere > 0) worse = true;
  }
  assert.ok(worse, 'the real panel never disagreed');
});

test('Relieve S.E.A.N. never works, and each press gets a different refusal', () => {
  const { sim, ctl, sean } = run(4, 1);
  const lines = [];
  for (let i = 0; i < 3 * REFUSALS.length; i++) {
    lines.push(ctl.relieve(sim));
    assert.equal(sean.relieved, false);
  }
  assert.match(lines[0], /reviewing that requirement/);
  assert.equal(new Set(lines).size, lines.length, 'a refusal repeated');
  assert.equal(refusal(1), REFUSALS[0]);
  const t = sim.t;
  step(sim, 60);
  assert.equal(sim.t, t + 60);
  assert.equal(sean.relieveTries, 3 * REFUSALS.length);
});
