import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEnroute, stepEnroute, observeEnroute, closestNm, levelsFor, requiredVerticalFt, LEVELS_EAST, LEVELS_WEST, handoffLine, centerName } from '../src/enroute.js';

const run = (en, seconds) => {
  for (let i = 0; i < seconds; i++) stepEnroute(en, 1);
  return en;
};

test('levels: 4-5-2 odd east, even west, 2,000 ft apart, nothing above FL410', () => {
  assert.equal(levelsFor(0), LEVELS_EAST);
  assert.equal(levelsFor(179.9), LEVELS_EAST);
  assert.equal(levelsFor(180), LEVELS_WEST);
  assert.equal(levelsFor(359), LEVELS_WEST);
  for (const set of [LEVELS_EAST, LEVELS_WEST]) {
    set.forEach((fl, i) => i && assert.equal(fl - set[i - 1], 20));
    assert.ok(Math.max(...set) <= 410 && Math.min(...set) >= 290);
  }
});

test('vertical rule: 1,000 ft, 2,000 ft when either aircraft is non-RVSM', () => {
  assert.equal(requiredVerticalFt({ rvsm: true }, { rvsm: true }), 1000);
  assert.equal(requiredVerticalFt({ rvsm: false }, { rvsm: true }), 2000);
  assert.equal(requiredVerticalFt({ rvsm: true }, { rvsm: false }), 2000);
});

test('closest approach is exact for straight tracks', () => {
  const a = { x: 0, y: 0, vx: 0.1, vy: 0, leftNm: 1000 };
  const head = { x: 100, y: 3, vx: -0.1, vy: 0, leftNm: 1000 };
  assert.ok(Math.abs(closestNm(a, head) - 3) < 1e-9);
  const away = { x: 100, y: 3, vx: 0.1, vy: 0, leftNm: 1000 };
  assert.ok(Math.abs(closestNm(a, away) - Math.hypot(100, 3)) < 1e-9);
});

test('safe controller: zero losses over 6 hours at 40, 80 and 120 an hour, 3 seeds each', () => {
  for (const perHour of [40, 80, 120]) {
    for (const seed of [1, 2, 3]) {
      const en = run(createEnroute({ seed, perHour }), 6 * 3600);
      assert.equal(en.losses.length, 0, `${perHour}/h seed ${seed}: ${JSON.stringify(en.losses[0])}`);
      assert.ok(en.overflown > perHour * 3, `${perHour}/h seed ${seed} overflown ${en.overflown}`);
    }
  }
});

test('safe controller: every aircraft is at a level of its own direction', () => {
  const en = createEnroute({ seed: 4, perHour: 90 });
  for (let i = 0; i < 4 * 3600; i += 600) {
    run(en, 600);
    for (const a of en.aircraft) assert.ok(levelsFor(a.course).includes(a.alt), `${a.callsign} ${a.course} FL${a.alt}`);
  }
});

test('a planted non-RVSM aircraft one level (1,000 ft) from a conflicting RVSM one is a loss', () => {
  const en = createEnroute({ seed: 1, perHour: 0 });
  en.aircraft = [
    { id: 1, callsign: 'PEACH1', alt: 340, x: 0, y: 0, vx: 0, vy: 0, leftNm: 10, rvsm: true, center: 'ZTL' },
    { id: 2, callsign: 'OKRA2', alt: 350, x: 2, y: 0, vx: 0, vy: 0, leftNm: 10, rvsm: false, center: 'ZTL' },
  ];
  observeEnroute(en);
  assert.equal(en.losses.length, 1);
  assert.equal(en.losses[0].verticalFt, 1000);
  // The same pair is fine when both are RVSM, and fine at 2,000 ft.
  en.losses = [];
  en.open = new Set();
  en.aircraft[1].rvsm = true;
  observeEnroute(en);
  assert.equal(en.losses.length, 0);
  en.aircraft[1].rvsm = false;
  en.aircraft[1].alt = 360;
  observeEnroute(en);
  assert.equal(en.losses.length, 0);
});

test('the safe controller keeps non-RVSM aircraft clear by 2,000 ft or 5 NM', () => {
  const en = run(createEnroute({ seed: 9, perHour: 120 }), 4 * 3600);
  assert.ok(en.losses.length === 0);
  assert.ok(en.aircraft.some((a) => !a.rvsm) || en.overflown > 0);
});

test('S.E.A.N. picks levels without looking and the monitor catches it', () => {
  const en = run(createEnroute({ seed: 1, perHour: 120, controller: 'sean' }), 3 * 3600);
  assert.ok(en.losses.length > 0);
  assert.match(en.losses[0].paragraph, /5-5-4/);
});

test('handoffs: only between the five centres, each pair named, and the line says S.E.A.N. both sides', () => {
  const en = run(createEnroute({ seed: 2, perHour: 60 }), 3 * 3600);
  assert.ok(en.handoffs.length > 20);
  const names = new Set(['ZTL', 'ZJX', 'ZME', 'ZDC', 'ZID']);
  for (const h of en.handoffs) {
    assert.ok(names.has(h.from) && names.has(h.to) && h.from !== h.to);
    assert.equal(centerName(h.x, h.y), h.to);
  }
  assert.match(handoffLine(en.handoffs[0]), /S\.E\.A\.N\. Z.. hands off to S\.E\.A\.N\. Z../);
  assert.ok(en.handoffs.some((h) => h.from === 'ZTL' || h.to === 'ZTL'));
});

test('deterministic from the seed', () => {
  const a = run(createEnroute({ seed: 5, perHour: 60 }), 1800);
  const b = run(createEnroute({ seed: 5, perHour: 60 }), 1800);
  assert.deepEqual(a.aircraft.map((x) => [x.callsign, x.alt, Math.round(x.x)]), b.aircraft.map((x) => [x.callsign, x.alt, Math.round(x.x)]));
});
