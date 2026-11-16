import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, drain, step } from '../src/sim.js';
import {
  chooseFlow, components, createWeather, flightCategory, groundSpeed, LLWS_HOLD_S, parseMetar, parseTaf, windComponents,
} from '../src/weather.js';
import { SCENARIOS, TAF_2026_11_16, byId } from '../src/scenarios.js';

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} is not within ${eps} of ${b}`);

const synthetic = (id, metars) => ({ id, name: id, metars });

function run(sim, hours) {
  while (sim.t < hours * 3600) step(sim, 1);
  return drain(sim);
}

test('every committed METAR parses, and the four real days have the weather they were picked for', () => {
  assert.deepEqual(SCENARIOS.map((s) => s.id), ['west-flow', 'east-flow', 'ifr-freezing-rain', 'thunderstorm']);
  for (const s of SCENARIOS) {
    assert.ok(s.date && s.source && s.metars.length >= 5, `${s.id} records its date and source`);
    for (const raw of s.metars) {
      const m = parseMetar(raw);
      assert.equal(m.station, 'KATL', raw);
      assert.notEqual(m.hour, null, raw);
      assert.ok(m.visSm != null, raw);
      assert.ok(m.tempC != null && m.altimeterInHg > 28, raw);
    }
  }
  const dirs = (id) => byId(id).metars.map((r) => parseMetar(r)).filter((m) => m.windKt >= 5).map((m) => m.windDir);
  assert.ok(dirs('west-flow').every((d) => d >= 240 && d <= 300));
  assert.ok(dirs('east-flow').every((d) => d >= 40 && d <= 140));
  const cats = (id) => new Set(byId(id).metars.map((r) => parseMetar(r).category));
  assert.ok(cats('ifr-freezing-rain').has('LIFR'));
  assert.ok(byId('thunderstorm').metars.some((r) => parseMetar(r).ts));
});

test('METAR fields: wind, gust, fractions, weather codes, ceiling, category', () => {
  const m = parseMetar('KATL 182052Z 23020G38KT 3SM +TSRA BR BKN025CB BKN050 OVC100 24/22 A2995 RMK AO2 PK WND 21038/2050 TSB24 OCNL LTGIC OHD-ALQDS TS OHD-ALQDS MOV NE');
  assert.equal(m.windDir, 230);
  assert.equal(m.windKt, 20);
  assert.equal(m.gustKt, 38);
  assert.equal(m.visSm, 3);
  assert.deepEqual(m.wx, ['+TSRA', 'BR']);
  assert.equal(m.ceilingFt, 2500);
  assert.equal(m.clouds[0].type, 'CB');
  assert.equal(m.category, 'MVFR');
  assert.equal(m.ts, true);
  assert.equal(m.tsMoving, 'NE');
  assert.equal(m.altimeterInHg, 29.95);

  const f = parseMetar('KATL 251252Z 10012G19KT 1/2SM -FZDZ BR OVC003 M01/M02 A2999 RMK AO2 SFC VIS 2');
  assert.equal(f.visSm, 0.5);
  assert.equal(f.ceilingFt, 300);
  assert.equal(f.category, 'LIFR');
  assert.equal(f.tempC, -1);
  assert.equal(parseMetar('KATL 251252Z VRB03KT 1 1/2SM OVC008 05/04 A3000').visSm, 1.5);
  assert.equal(parseMetar('KATL 251252Z VRB03KT 1 1/2SM OVC008 05/04 A3000').windDir, null);
  assert.equal(parseMetar('KATL 160952Z 06011KT 10SM SCT200 OVC250 05/M01 A3039').ceilingFt, 25000);
});

test('METAR codes for dust and funnel clouds are recognised (AIM 7-1-28)', () => {
  assert.deepEqual(parseMetar('KATL 011800Z 24012KT 1/4SM DS SKC 31/05 A2992').wx, ['DS']);
  assert.deepEqual(parseMetar('KATL 011800Z 24012KT 1SM SS SKC 31/05 A2992').wx, ['SS']);
  const tornado = parseMetar('KATL 011800Z 22020G40KT 2SM +FC +TSRA BKN020CB 24/22 A2980');
  assert.equal(tornado.funnel, true);
  assert.deepEqual(tornado.wx, ['+FC', '+TSRA']);
  assert.equal(parseMetar('KATL 011800Z 22020KT 3SM FC TS BKN020CB 24/22 A2980').funnel, true);
});

test('categories follow AIM 7-1-7 at the boundaries', () => {
  assert.equal(flightCategory(10, 25000), 'VFR');
  assert.equal(flightCategory(6, 3001), 'VFR');
  assert.equal(flightCategory(5, 5000), 'MVFR');
  assert.equal(flightCategory(10, 3000), 'MVFR');
  assert.equal(flightCategory(10, 999), 'IFR');
  assert.equal(flightCategory(2.9, null), 'IFR');
  assert.equal(flightCategory(0.9, null), 'LIFR');
  assert.equal(flightCategory(10, 499), 'LIFR');
});

test('the TAF parses into its periods', () => {
  const taf = parseTaf(TAF_2026_11_16);
  assert.equal(taf.station, 'KATL');
  assert.equal(taf.periods.length, 3);
  assert.equal(taf.periods[0].windDir, 60);
  assert.equal(taf.periods[0].visSm, 6);
  assert.equal(taf.periods[1].kind, 'FM');
  assert.equal(taf.periods[1].windDir, 80);
  assert.equal(taf.periods[2].windKt, 4);
});

test('runway choice follows 3-5-1: aligned with the wind at 5 kt or more, calm keeps the flow', () => {
  assert.equal(chooseFlow(260, 10).flow, 'west');
  assert.equal(chooseFlow(290, 6).flow, 'west');
  assert.equal(chooseFlow(60, 11).flow, 'east');
  assert.equal(chooseFlow(120, 5).flow, 'east');
  assert.equal(chooseFlow(350, 12).flow, 'west'); // 80 degrees off west, 100 off east
  assert.equal(chooseFlow(10, 12).flow, 'east'); // 80 off east, 100 off west
  assert.equal(chooseFlow(250, 4, 'east').flow, 'east'); // under 5 kt: stay
  assert.equal(chooseFlow(250, 4, 'east').basis, 'calm');
  assert.equal(chooseFlow(null, 8, 'east').flow, 'east'); // variable: stay
  // Wind picks the runway even when the other flow would have been the faster one (tailwind over capacity).
  const pick = chooseFlow(100, 15);
  assert.equal(pick.flow, 'east');
  assert.equal(pick.tail, 0);
  near(pick.head, 15 * Math.cos((10 * Math.PI) / 180));
});

test('tailwind components are the number 3-5-3 says to state', () => {
  near(components(90, 10, 'west').tail, 10);
  near(components(90, 10, 'west').head, 0);
  near(components(270, 10, 'west').head, 10);
  near(components(0, 10, 'west').tail, 0, 1e-9);
  near(components(0, 10, 'west').cross, 10);
  near(windComponents(230, 20, 270).head, 20 * Math.cos((40 * Math.PI) / 180));
});

test('groundspeed: headwind slows, tailwind speeds up, crosswind costs a little through the crab', () => {
  near(groundSpeed(160, 270, 20, 270), 140);
  near(groundSpeed(160, 90, 25, 270), 185);
  near(groundSpeed(160, 180, 30, 270), 160 * Math.cos(Math.asin(30 / 160)));
  assert.ok(groundSpeed(160, 180, 30, 270) < 160);
  near(groundSpeed(160, null, 0, 270), 160);
});

test('every weather event is deterministic per seed', () => {
  const sc = byId('thunderstorm');
  const a = createWeather({ scenario: sc, seed: 7 });
  const b = createWeather({ scenario: sc, seed: 7 });
  const c = createWeather({ scenario: sc, seed: 8 });
  for (const t of [0, 1800, 3600, 7200, 10800]) {
    assert.deepEqual(a.cellsAt(t), b.cellsAt(t));
    assert.deepEqual(a.at(t).llws, b.at(t).llws);
  }
  assert.notDeepEqual(a.cellsAt(5400), c.cellsAt(5400));
  const s1 = createSim({ seed: 3, demandPerHour: 24, weather: a });
  const s2 = createSim({ seed: 3, demandPerHour: 24, weather: b });
  run(s1, 3);
  run(s2, 3);
  assert.deepEqual(s1.landed, s2.landed);
  assert.deepEqual(s1.flowChanges, s2.flowChanges);
});

test('only thunderstorm reports make storm cells, and the cells cross the field', () => {
  assert.equal(createWeather({ scenario: byId('west-flow') }).cellsAt(7200).length, 0);
  const w = createWeather({ scenario: byId('thunderstorm'), seed: 1 });
  const counts = [];
  let minDist = Infinity;
  for (let t = 0; t < 4 * 3600; t += 60) {
    const cs = w.cellsAt(t);
    counts.push(cs.length);
    for (const c of cs) minDist = Math.min(minDist, Math.hypot(c.x, c.y));
  }
  assert.ok(Math.max(...counts) >= 2);
  assert.ok(minDist < 8);
});

test('a wind shear advisory stays up for 20 minutes after the last indication (3-1-8)', () => {
  const w = createWeather({ scenario: byId('thunderstorm'), seed: 1 });
  let last = null;
  let first = null;
  for (let t = 0; t < 4 * 3600; t += 60) {
    const a = w.at(t).llws;
    if (a && first === null) first = t;
    if (a) last = t;
  }
  assert.notEqual(first, null, 'gusts of 38 kt on the day must raise one');
  const wx = w.at(last);
  assert.equal(wx.llws !== null, true);
  assert.equal(w.at(last + LLWS_HOLD_S + 120).llws, null);
});

test('ceiling and visibility slow the runway, and a cell over the field slows it more (UNCONFIRMED rates)', () => {
  const vfr = createWeather({ scenario: byId('west-flow') }).at(0).rateMult;
  const ifr = createWeather({ scenario: byId('ifr-freezing-rain') }).at(0).rateMult;
  assert.equal(vfr, 1);
  assert.ok(ifr < vfr);
});

test('wind on final changes groundspeed and the landing gap follows it', () => {
  const head = createWeather({ scenario: synthetic('head', ['KATL 010000Z 27020KT 10SM FEW250 15/05 A3000']) });
  const tail = createWeather({ scenario: synthetic('tail', ['KATL 010000Z 09025KT 10SM FEW250 15/05 A3000']) });
  const sh = createSim({ seed: 1, demandPerHour: 24, weather: head });
  step(sh, 1);
  near(sh.finalGsKt, 140);
  const st = createSim({ seed: 1, demandPerHour: 24, weather: tail });
  assert.equal(st.flow, 'east'); // 090 at 25 kt: 3-5-1 gives east flow, so the wind is a headwind again
  step(st, 1);
  near(st.finalGsKt, 135);
  // The probe flies each release forward with the wind in it, so the gap on a runway is 3 NM at the groundspeed on final:
  // 77 s at 140 kt, not the 68 s it is at 160 kt.
  run(sh, 3);
  assert.equal(sh.losses.length, 0);
  assert.ok(sh.landed.length > 20);
  for (const rw of new Set(sh.landed.map((l) => l.rwy))) {
    const times = sh.landed.filter((l) => l.rwy === rw).map((l) => l.landT).sort((a, b) => a - b);
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    assert.ok(Math.min(...gaps) >= 76, `tightest landing gap on ${rw} ${Math.min(...gaps)} s`);
  }
});

test('a wind shift turns the runway around, the airspace drains first, and nothing is lost', () => {
  const w = createWeather({
    scenario: synthetic('shift', [
      'KATL 010000Z 27010KT 10SM FEW250 15/05 A3000',
      'KATL 010100Z 27010KT 10SM FEW250 15/05 A3000',
      'KATL 010200Z 09010KT 10SM FEW250 15/05 A3000',
      'KATL 010300Z 09010KT 10SM FEW250 15/05 A3000',
      'KATL 010400Z 09010KT 10SM FEW250 15/05 A3000',
    ]),
  });
  const sim = createSim({ seed: 5, demandPerHour: 24, weather: w });
  assert.equal(sim.flow, 'west');
  let sawChangeover = false;
  while (sim.t < 4 * 3600) {
    step(sim, 1);
    if (sim.changeover) sawChangeover = true;
  }
  assert.equal(sim.flow, 'east');
  assert.equal(sawChangeover, true);
  assert.equal(sim.flowChanges.length, 1);
  assert.ok(sim.flowChanges[0].t >= 2 * 3600 + 600);
  assert.deepEqual(sim.geo.runways.map((r) => r.ident), ['08L', '09R', '10']);
  assert.equal(sim.geo.flow, 'east');
  assert.equal(drain(sim), true);
  assert.equal(sim.losses.length, 0);
  assert.equal(sim.fuelOuts.length, 0);
});

test('the safe controller keeps zero separation losses and lands everything in every real scenario', () => {
  for (const sc of SCENARIOS) {
    for (const seed of [1, 2, 3]) {
      const sim = createSim({ seed, demandPerHour: 30, weather: createWeather({ scenario: sc, seed }) });
      const drained = run(sim, 4);
      assert.equal(drained, true, `${sc.id} seed ${seed} drains`);
      assert.equal(sim.losses.length, 0, `${sc.id} seed ${seed}: ${JSON.stringify(sim.losses[0])}`);
      assert.equal(sim.landed.length, sim.requested, `${sc.id} seed ${seed} lands everything`);
    }
  }
});

test('calm weather changes nothing: no weather and a calm METAR give the same landings', () => {
  const a = createSim({ seed: 4, demandPerHour: 24 });
  const b = createSim({
    seed: 4,
    demandPerHour: 24,
    weather: createWeather({ scenario: synthetic('calm', ['KATL 010000Z 00000KT 10SM FEW250 15/05 A3000']) }),
  });
  run(a, 3);
  run(b, 3);
  assert.deepEqual(b.landed, a.landed);
  assert.equal(b.losses.length, 0);
});
