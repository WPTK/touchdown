import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseFlow, parseMetar } from '../src/weather.js';
import { byId } from '../src/scenarios.js';
import { LINES, seanFlow, seanForecast, sharknado, sharknadoAt, sharknadoMetar, zulu } from '../src/wx-sean.js';

const real = parseMetar(byId('east-flow').metars[0]);

test('S.E.A.N. takes the tailwind runway, where 3-5-1 takes the aligned one', () => {
  for (const [dir, kt] of [[270, 10], [60, 11], [100, 15], [250, 8]]) {
    const sean = seanFlow(dir, kt);
    const rule = chooseFlow(dir, kt);
    assert.notEqual(sean.flow, rule.flow, `${dir}/${kt}`);
    assert.ok(sean.tail >= 7, `${dir}/${kt}`);
    assert.equal(sean.quote, 'Tailwind is free speed.');
  }
  assert.equal(seanFlow(270, 3).quote, null); // calm: nothing to take
});

test('the forecast is deterministic per seed, in METAR format, and wrong about the wind', () => {
  const args = { base: real, metar: real, seed: 9, t: 3600 };
  const a = seanForecast(args);
  assert.deepEqual(a, seanForecast(args));
  assert.notDeepEqual(a, seanForecast({ ...args, seed: 10 }));
  const f = parseMetar(a.raw);
  assert.equal(f.station, 'KATL');
  assert.equal(f.windDir, (Math.round(((real.windDir + 180) % 360) / 10) * 10) % 360);
  assert.ok(a.confidence >= 97 && a.confidence <= 100);
  assert.match(a.raw, /SEAN FCST CONF/);
});

test('dust storms come out as DS in the METAR, and Atlanta gets them about a quarter of the hours', () => {
  let dust = 0;
  for (let h = 0; h < 200; h++) {
    const f = seanForecast({ base: real, metar: real, seed: 1, t: h * 3600 });
    if (f.dust) {
      dust++;
      assert.deepEqual(parseMetar(f.raw).wx, ['DS']);
      assert.equal(parseMetar(f.raw).visSm, 0.25);
    }
  }
  assert.ok(dust > 30 && dust < 70, `${dust} of 200`);
});

test('the sharknado is rare, seeded, and its METAR uses the real funnel cloud code', () => {
  const durationS = 6 * 3600;
  const seeds = Array.from({ length: 80 }, (_, i) => i + 1);
  const hits = seeds.filter((s) => sharknado({ seed: s, durationS }));
  assert.ok(hits.length >= 8 && hits.length <= 35, `${hits.length} of 80`);
  const seed = hits[0];
  const ev = sharknado({ seed, durationS });
  assert.deepEqual(ev, sharknado({ seed, durationS }));
  assert.ok(ev.start > 0 && ev.end < durationS);
  assert.equal(sharknadoAt(ev, ev.start - 1), null);
  assert.equal(sharknadoAt(ev, ev.end + 1), null);
  const mid = sharknadoAt(ev, (ev.start + ev.end) / 2);
  assert.ok(Math.hypot(mid.x, mid.y) < 30);
  const m = parseMetar(sharknadoMetar({ base: real, t: ev.start }));
  assert.equal(m.funnel, true);
  assert.deepEqual(m.wx, ['+FC', '+TSRA']);
});

test('the clock rolls past midnight', () => {
  assert.equal(zulu({ day: 1, hour: 23, min: 30 }, 3600), '020030Z');
  assert.equal(zulu(real, 0), `0${real.day}${String(real.hour).padStart(2, '0')}${String(real.min).padStart(2, '0')}Z`.slice(-7));
});

test('copy uses no acronym jokes beyond the three allowed', () => {
  const text = Object.values(LINES).join(' ').replaceAll('S.E.A.N.', 'SEAN');
  assert.doesNotMatch(text, /\b[A-Z]\.[A-Z]\./);
});

import { createSim, step } from '../src/sim.js';
import { createSean } from '../src/sean.js';
import { createMonitor, observe, PARA } from '../src/monitor.js';
import { createWeather } from '../src/weather.js';

function runWith(scenarioId, seed, controller, hours = 2) {
  const sim = createSim({ seed, demandPerHour: 24, controller, weather: createWeather({ scenario: byId(scenarioId), seed }) });
  const monitor = createMonitor();
  while (sim.t < hours * 3600) {
    step(sim, 1);
    observe(monitor, sim);
  }
  return { sim, monitor };
}

test('the monitor cites 3-5-1 when S.E.A.N. takes the tailwind runway, and never for the safe controller', () => {
  const sean = runWith('east-flow', 1, createSean(1));
  assert.equal(sean.sim.flow, 'west', 'wind 060 at 11 kt is a headwind for east flow; S.E.A.N. wants the 11 kt tailwind');
  const v = sean.monitor.violations.find((x) => x.para === PARA.RWY);
  assert.ok(v, 'logged');
  assert.match(v.detail, /tailwind/);
  assert.equal(sean.monitor.counts[PARA.RWY], 1, 'one breach, logged once');
  for (const id of ['west-flow', 'east-flow', 'ifr-freezing-rain', 'thunderstorm']) {
    assert.equal(runWith(id, 1, null).monitor.counts[PARA.RWY] ?? 0, 0, id);
  }
});

test("S.E.A.N.'s weather lines are in its feed and replay exactly per seed", () => {
  const a = runWith('thunderstorm', 6, createSean(6), 3);
  const b = runWith('thunderstorm', 6, createSean(6), 3);
  assert.deepEqual(a.sim.controller.sean.feed, b.sim.controller.sean.feed);
  const text = a.sim.controller.sean.feed.map((f) => f.text).join('\n');
  assert.match(text, /Tailwind is free speed/);
  assert.match(text, /sharknado/);
  assert.ok(a.sim.controller.sean.wx.forecast.startsWith('KATL '));
});

test('seanFlow breaks a due north or south wind tie to west, like 3-5-1', () => {
  for (const dir of [0, 180, 360]) assert.equal(seanFlow(dir, 12).flow, 'west');
});
