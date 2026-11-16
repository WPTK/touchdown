import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, checkDesign, checkSeparation, createSim, drain, step } from '../src/sim.js';

function runSeed(seed, demandPerHour, hours) {
  const sim = createSim({ seed, demandPerHour });
  while (sim.t < hours * 3600) step(sim, 1);
  const drained = drain(sim);
  return { sim, drained };
}

test('the default design passes every separation check', () => {
  const d = checkDesign();
  assert.equal(d.ok, true, JSON.stringify(d.checks));
  assert.ok(d.minDescentFpm >= CONFIG.stepRateFpm, 'the released aircraft descends faster than the stack steps down');
  assert.ok(d.stepS > 0);
});

test('an unsafe config is refused', () => {
  assert.throws(() => createSim({ config: { descentFtPerNm: 100 } }), /unsafe config/);
  assert.throws(() => createSim({ config: { stepRateFpm: 2000 } }), /unsafe config/);
  assert.throws(() => createSim({ config: { levelStepFt: 500 } }), /unsafe config/);
});

test('the separation monitor catches a planted conflict', () => {
  const sim = createSim({ seed: 1, demandPerHour: 0 });
  sim.aircraft.push(
    { callsign: 'TST1', x: 0, y: 0, alt: 5000 },
    { callsign: 'TST2', x: 1, y: 0, alt: 5400 },
  );
  checkSeparation(sim);
  assert.equal(sim.losses.length, 1);
});

for (const [label, demand, seeds] of [
  ['light traffic', 12, 40],
  ['at capacity', 24, 40],
  ['overloaded (demand above runway capacity)', 45, 40],
]) {
  test(`everything lands, ${label}: ${seeds} seeds x 4 h`, () => {
    for (let seed = 1; seed <= seeds; seed++) {
      const { sim, drained } = runSeed(seed, demand, 4);
      const ctx = `seed ${seed}, demand ${demand}/h`;
      assert.equal(drained, true, `${ctx}: traffic still airborne or waiting after drain`);
      assert.equal(sim.landed.length, sim.requested, `${ctx}: landed != requested`);
      assert.deepEqual(sim.losses, [], `${ctx}: loss of separation`);
      assert.deepEqual(sim.fuelOuts, [], `${ctx}: fuel exhaustion`);
      assert.ok(sim.closest.margin >= 1 - 1e-6, `${ctx}: closest pair under minimum`);
      // On one runway, landings are at least 3 NM of final apart: 3 NM at 160 kt is 67.5 s.
      for (const rw of new Set(sim.landed.map((l) => l.rwy))) {
        const lands = sim.landed.filter((l) => l.rwy === rw).map((l) => l.landT).sort((x, y) => x - y);
        for (let i = 1; i < lands.length; i++) assert.ok(lands[i] - lands[i - 1] >= 67, `${ctx}: landings ${i - 1},${i} on ${rw} too close`);
      }
      for (const l of sim.landed) assert.ok(l.fuelLeftS > 15 * 60, `${ctx}: ${l.callsign} landed under 15 min fuel`);
    }
  });
}

test('every level in the stack is held by exactly one aircraft', () => {
  const sim = createSim({ seed: 7, demandPerHour: 60 });
  while (sim.t < 3 * 3600) {
    step(sim, 1);
    const targets = sim.queue.map((a) => a.targetAlt);
    assert.equal(new Set(targets).size, targets.length, `duplicate level at t=${sim.t}`);
    sim.queue.forEach((a, i) => assert.equal(a.targetAlt, CONFIG.baseLevelFt + i * CONFIG.levelStepFt));
    assert.ok(sim.queue.length <= CONFIG.maxQueue);
  }
});

test('light traffic is not held upstream', () => {
  const { sim } = runSeed(3, 6, 4);
  const waits = sim.landed.map((l) => l.spawnT - l.requestT);
  const avg = waits.reduce((s, w) => s + w, 0) / waits.length;
  assert.ok(avg < 60, `average upstream wait ${avg.toFixed(0)} s`);
});

// The limit is the level stack, not the runways: one aircraft leaves the hold fix per step-down (115 s, 31/h at most),
// and the laps and the probe's waits bring it to about 25/h. Three runways do not raise it. docs/data.md has the sweep.
test('overload runs at the stack limit, about 25 an hour', () => {
  const sim = createSim({ seed: 5, demandPerHour: 45 });
  while (sim.t < 4 * 3600) step(sim, 1);
  const lands = sim.landed.map((l) => l.landT).filter((t) => t > 3600);
  const perHour = (3600 * (lands.length - 1)) / (lands.at(-1) - lands[0]);
  assert.ok(perHour >= 22 && perHour <= 32, `${perHour.toFixed(1)} landings/h`);
});

test('runs replay exactly from the seed', () => {
  const a = runSeed(11, 30, 2).sim;
  const b = runSeed(11, 30, 2).sim;
  assert.deepEqual(
    a.landed.map((l) => [l.callsign, l.landT]),
    b.landed.map((l) => [l.callsign, l.landT]),
  );
});
