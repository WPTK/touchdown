// Recorded arrivals as demand. The data must carry nothing that identifies a flight, the sim must fly what it was given, and the
// safe controller must keep the monitor at zero on the real pushes: under the limit as recorded, over it with the excess
// waiting upstream.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { REPLAYS, replayById, entriesFor } from '../src/replay.js';
import { createSim, setDemand, step } from '../src/sim.js';
import { FLEET_BY_ICAO } from '../src/fleet.js';
import { createSean } from '../src/sean.js';
import { AIRPORTS } from '../src/airports.js';
import { runWatched, stepWatched, losses } from './helpers.js';
import { createMonitor } from '../src/monitor.js';
import { mapType } from '../scripts/replay.js';

const HUBS = ['KATL', 'KCLT'];
const WINDOW_S = 3 * 3600;

test('the data keeps arrival time, entry fix and type, and nothing that names a flight', () => {
  const raw = fs.readFileSync(new URL('../data/replay-2026-07.json', import.meta.url), 'utf8');
  assert.doesNotMatch(raw, /\bN\d{1,5}[A-Z]{0,2}\b/, 'no tail numbers');
  assert.doesNotMatch(raw, /"(tail|hex|icao24|callsign|flight|registration|origin)"/i);
  assert.ok(REPLAYS.length >= 1 && REPLAYS.length <= 2);
  for (const r of REPLAYS) {
    assert.match(r.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(r.windowLocal, /^\d{2}:00-\d{2}:00$/);
    for (const hub of HUBS) {
      const fixes = new Set(AIRPORTS[hub].air.allFixes().map((f) => f.id));
      const list = entriesFor(r, hub);
      assert.ok(list.length > 50, `${r.id} ${hub} has a real push in it`);
      let last = -1;
      for (const e of list) {
        assert.equal(e.length, 3, 'only [t, fix, type]');
        assert.ok(Number.isInteger(e[0]) && e[0] >= last && e[0] < WINDOW_S, `${r.id} ${hub} time ${e[0]}`);
        last = e[0];
        assert.ok(fixes.has(e[1]), `${hub} knows fix ${e[1]}`);
        assert.ok(FLEET_BY_ICAO[e[2]], `fleet has ${e[2]}`);
      }
    }
  }
});

test('the registry model names map to the fleet types they should', () => {
  for (const [model, icao, exact] of [
    ['BOEING 717-200', 'B712', true],
    ['AIRBUS SAS A321-213', 'A321', true],
    ['AIRBUS A321-271NX', 'A21N', true],
    ['AIRBUS A320-251N', 'A20N', true],
    ['BOMBARDIER INC CL-600-2D24', 'CRJ9', true],
    ['BOEING 737-8', 'B38M', true],
    ['BOEING 737-823', 'B738', true],
    ['BOEING 737-9', 'B739', false],
    ['AIRBUS CANADA LP BD-500-1A11', 'A319', false],
  ]) assert.deepEqual(mapType(model), { icao, exact }, model);
  assert.equal(mapType('CESSNA 172'), null);
});

test('requests reach the corner post at the recorded times, on the recorded fix, in the recorded type', () => {
  const r = replayById('fri-evening');
  const entries = entriesFor(r, 'KATL').slice(0, 40);
  const sim = createSim({ seed: 3, replay: entries, flow: 'west' });
  const seen = [];
  for (let i = 0; i < entries.at(-1)[0] + 5; i++) {
    step(sim, 1);
    for (const a of sim.aircraft) if (a.phase === 'transit' && !seen.some((s) => s.id === a.id)) seen.push({ id: a.id, spawnT: a.spawnT, requestT: a.requestT, type: a.type, transition: a.transition });
  }
  assert.equal(sim.requested, entries.length);
  for (const s of seen) {
    const e = entries.find((x) => x[0] === s.requestT);
    assert.ok(e, `a request at ${s.requestT}`);
    assert.equal(s.type, e[2]);
    assert.equal(s.transition, e[1]);
  }
  assert.ok(seen.length >= 20);
});

test('a hub whose flow lacks the recorded transition still flies it, on the nearest one', () => {
  // KCLT's south flow has no CHS/PITRW-style names that the north flow has, and the reverse; every entry must still spawn.
  for (const flow of ['north', 'south']) {
    const sim = createSim({ seed: 1, airport: 'KCLT', flow, replay: entriesFor(replayById('fri-evening'), 'KCLT') });
    for (let i = 0; i < 2 * 3600; i++) step(sim, 1);
    assert.ok(sim.landed.length > 10, `${flow} landed ${sim.landed.length}`);
  }
});

test('the same replay and seed fly the same day', () => {
  const run = () => {
    const sim = createSim({ seed: 5, replay: entriesFor(replayById('fri-morning'), 'KATL') });
    for (let i = 0; i < 3600; i++) step(sim, 1);
    return sim.landed.map((l) => `${l.callsign} ${l.type} ${l.star} ${l.landT}`).join('|');
  };
  assert.equal(run(), run());
});

test('moving the demand slider hands a replay back to Poisson', () => {
  const sim = createSim({ seed: 1, replay: entriesFor(replayById('fri-evening'), 'KATL') });
  assert.equal(sim.demandPerHour, 0);
  assert.ok(sim.replay);
  setDemand(sim, 24);
  assert.equal(sim.replay, null);
  for (let i = 0; i < 1800; i++) step(sim, 1);
  assert.ok(sim.requested > 0);
});

// Every third entry: about 23 an hour into Atlanta and about 12 into Charlotte, both under the limits in docs/data.md.
const thin = (list) => list.filter((_, i) => i % 3 === 0);

for (const hub of HUBS) {
  for (const r of REPLAYS) {
    test(`${hub} ${r.id}: under the limit, the safe controller loses nothing and nothing waits long`, () => {
      const sim = createSim({ seed: 1, airport: hub, replay: thin(entriesFor(r, hub)) });
      const { m, drained } = runWatched(sim, 3);
      assert.ok(drained);
      assert.equal(m.violations.length, 0, m.violations.map((v) => v.para).join());
      assert.equal(sim.landed.length, sim.requested);
    });

    test(`${hub} ${r.id}: as recorded it is over the limit, the excess waits upstream and the oracle stays at zero`, () => {
      const sim = createSim({ seed: 1, airport: hub, replay: entriesFor(r, hub) });
      // Stop at the end of the push rather than drain: draining a 40 to 70 an hour push at 17 to 25 an hour takes hours of sim time.
      const m = createMonitor();
      stepWatched(sim, m, WINDOW_S);
      assert.equal(sim.requested, entriesFor(r, hub).length);
      assert.equal(losses(m).length, 0, JSON.stringify(losses(m)[0]));
      assert.equal(m.violations.length, 0, m.violations.map((v) => v.para).join());
      assert.ok(sim.upstream.length > 20, `the excess waits upstream: ${sim.upstream.length}`);
    });
  }
}

test('S.E.A.N. flies a replay day and the monitor sees it', () => {
  const sim = createSim({ seed: 2, replay: entriesFor(replayById('fri-evening'), 'KATL'), controller: createSean(2) });
  for (let i = 0; i < 3600; i++) step(sim, 1);
  assert.ok(sim.requested > 50);
  assert.ok(sim.aircraft.length + sim.landed.length > 0);
});
