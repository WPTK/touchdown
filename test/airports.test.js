// The second hub. The safe controller and the monitor are the same code at every airport; these tests run KCLT on its real
// geometry (data/kclt-2611.json) and ask the monitor, the one place that decides about losses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AIRPORTS, deriveFlows } from '../src/airports.js';
import { CONFIG, checkDesign, createSim, layout, step } from '../src/sim.js';
import { createMonitor, observe, PARA } from '../src/monitor.js';
import { createSean } from '../src/sean.js';
import { runWatched, losses } from './helpers.js';

const clt = AIRPORTS.KCLT;

test('KCLT flows come from the data: three ILS runways each way, parallel and under 2,500 ft apart or not by the real thresholds', () => {
  assert.deepEqual(Object.keys(clt.flows).sort(), ['north', 'south']);
  assert.deepEqual(clt.flows.north.runways, ['01L', '01R', '36']);
  assert.deepEqual(clt.flows.south.runways, ['18', '19L', '19R']);
  assert.deepEqual(deriveFlows(AIRPORTS.KATL.air).west.runways.length, 5); // every ILS runway: the flow table KATL uses picks three of them
  const sp = clt.air.spacingFt;
  assert.ok(sp('19L', '19R') > 2500 && sp('18', '19L') > 2500, `${sp('19L', '19R')} ${sp('18', '19L')}`);
});

test('KCLT: every route of both flows passes the design check at its base level, and does not at 12,000 ft', () => {
  const d = checkDesign({ ...CONFIG, ...clt.config }, clt);
  assert.ok(d.ok, JSON.stringify(d.checks));
  assert.equal(checkDesign(CONFIG, clt).checks.releasedClearsStack, false);
  for (const flow of Object.keys(clt.flows)) {
    const geo = layout({ ...CONFIG, ...clt.config }, flow, clt);
    assert.ok(Object.keys(geo.stars).length >= 8, `${flow} flies ${Object.keys(geo.stars).join(' ')}`);
    for (const star of Object.values(geo.stars)) for (const route of Object.values(star.routes)) assert.ok(route.reachable);
  }
});

test('KCLT: STARs with no common route (CHSLY9, JONZE8) are flown from the enroute transition into the runway transition', () => {
  const geo = layout({ ...CONFIG, ...clt.config }, 'north', clt);
  for (const id of ['CHSLY9', 'JONZE8']) assert.ok(geo.stars[id], id);
});

test('KCLT: the monitor reports zero losses, 12, 24 and 45 an hour, both flows, several seeds', { timeout: 600000 }, () => {
  for (const flow of ['south', 'north']) {
    for (const perHour of [12, 24, 45]) {
      for (const seed of [1, 2]) {
        const sim = createSim({ airport: 'KCLT', flow, seed, demandPerHour: perHour });
        const { m, drained } = runWatched(sim, 1.25);
        assert.ok(drained, `${flow} ${perHour}/h seed ${seed} drained`);
        assert.equal(losses(m).length, 0, `${flow} ${perHour}/h seed ${seed}: ${JSON.stringify(losses(m)[0])}`);
        assert.equal(m.violations.length, 0, `${flow} ${perHour}/h seed ${seed}: ${m.violations.map((v) => v.para)}`);
      }
    }
  }
});

test('KCLT: the sustained arrival rate at overload', { timeout: 600000 }, () => {
  const rates = [];
  for (const seed of [1, 2, 3]) {
    const sim = createSim({ airport: 'KCLT', seed, demandPerHour: 90 });
    const m = createMonitor();
    while (sim.t < 4 * 3600) {
      step(sim, 1);
      observe(m, sim);
    }
    assert.equal(losses(m).length, 0);
    rates.push(sim.landed.filter((l) => l.landT > 3600 && l.landT <= 4 * 3600).length / 3);
  }
  // Measured over 12 runs (6 seeds, both flows): 14.0 to 20.3 an hour, mean 16.9. Written down in docs/data.md. The level
  // stack steps down at 520 fpm, 31 an hour at most; the long routes and the probe's waits bring it down from there.
  for (const r of rates) assert.ok(r > 12 && r < 24, `${r}`);
});

test('KCLT: S.E.A.N. runs it, and everything still lands, at Charlotte or at a named field near it', { timeout: 600000 }, () => {
  const ctl = createSean(4);
  const sim = createSim({ airport: 'KCLT', seed: 4, demandPerHour: 30, controller: ctl });
  const m = createMonitor();
  while (sim.t < 3 * 3600) {
    step(sim, 1);
    observe(m, sim);
  }
  assert.ok(sim.landed.length > 20);
  const places = Object.keys(clt.places);
  for (const l of m.landings) assert.ok(places.includes(l.ident), l.ident);
  assert.ok(m.landings.every((l) => l.where));
  assert.ok(m.where.KCLT > 0 && !('KATL' in m.where));
  assert.ok(m.violations.every((v) => v.para !== PARA.RWY));
});

test('KCLT: the Class B 200 kt rule uses the Charlotte outline, not Atlanta\'s', () => {
  assert.ok(clt.classB.areas.length >= 10);
  const sim = createSim({ airport: 'KCLT', seed: 1, demandPerHour: 20 });
  const m = createMonitor();
  for (let i = 0; i < 2400; i++) {
    step(sim, 1);
    observe(m, sim);
  }
  assert.equal(m.violations.filter((v) => v.para === PARA.SPEED_LIMIT).length, 0);
});
