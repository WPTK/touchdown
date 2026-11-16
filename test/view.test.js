import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultView, regionView, tracon, hubOf, zoomAt, panBy, screenOf, MIN_RANGE_NM, MAX_RANGE_NM } from '../src/view.js';
import { HUBS, localToRegion, BOUNDS } from '../src/frame.js';
import { lossShape, lossProgress, lossBlips, TOTAL_MS, IN_MS, HOLD_MS } from '../src/loss.js';

test('the page opens on the A80 view, centred on KATL at 50 NM', () => {
  assert.deepEqual(defaultView(), { cx: 0, cy: 0, rangeNm: 50 });
  assert.equal(hubOf(defaultView()), 'KATL');
  assert.equal(hubOf(tracon('KCLT')), 'KCLT');
  assert.equal(hubOf(regionView()), null);
});

test('the regional view takes in all five centres', () => {
  const v = regionView();
  const s = screenOf(v, 1000, 800);
  for (const [x, y] of [[BOUNDS[0], BOUNDS[2]], [BOUNDS[1], BOUNDS[3]]]) {
    assert.ok(s.px(x) > -400 && s.px(x) < 1400 && s.py(y) > -100 && s.py(y) < 900, `${x},${y}`);
  }
});

test('zooming keeps the anchor fixed, clamps, and snaps into a hub TRACON', () => {
  const v = regionView();
  const z = zoomAt(v, 0.5, 100, 50);
  const s0 = screenOf(v, 800, 800);
  const s1 = screenOf(z, 800, 800);
  assert.ok(Math.abs(s0.px(100) - s1.px(100)) < 1e-6 && Math.abs(s0.py(50) - s1.py(50)) < 1e-6);
  assert.ok(zoomAt(v, 1e-9, 500, 500).rangeNm === MIN_RANGE_NM);
  assert.equal(zoomAt(v, 1e9, 0, 0).rangeNm, MAX_RANGE_NM);
  // Zoom into Charlotte from the region: it ends on the CLT TRACON.
  let w = v;
  for (let i = 0; i < 30; i++) w = zoomAt(w, 0.8, HUBS.KCLT.x, HUBS.KCLT.y);
  assert.equal(hubOf(w), 'KCLT');
  assert.deepEqual([w.cx, w.cy], [HUBS.KCLT.x, HUBS.KCLT.y]);
  assert.deepEqual(panBy({ cx: 1, cy: 2, rangeNm: 3 }, 4, 5), { cx: 5, cy: 7, rangeNm: 3 });
});

test('a point at KCLT in its own frame is KCLT in the regional frame; KATL is unchanged', () => {
  const c = localToRegion('KCLT', 0, 0);
  assert.ok(Math.hypot(c.x - HUBS.KCLT.x, c.y - HUBS.KCLT.y) < 0.01);
  assert.deepEqual(localToRegion('KATL', 3, 4), { x: 3, y: 4 });
  // 10 NM east of KCLT is still about 10 NM from it in the regional frame, to a quarter mile.
  const e = localToRegion('KCLT', 10, 0);
  assert.ok(Math.abs(Math.hypot(e.x - c.x, e.y - c.y) - 10) < 0.25);
});

test('the Loss meme: shape fits the canvas, characters are | and _, progress runs in, hold, out, then ends', () => {
  const sh = lossShape(1000, 700);
  assert.ok(sh.points.length > 60 && sh.points.length < 160);
  for (const p of sh.points) assert.ok(p.x >= 0 && p.x <= 1000 && p.y >= 0 && p.y <= 700 && '|_'.includes(p.ch));
  assert.equal(sh.points.filter((p) => p.ch === '_').length > 5, true);
  assert.equal(lossProgress(-1), null);
  assert.equal(lossProgress(0), 0);
  assert.equal(lossProgress(IN_MS + HOLD_MS / 2), 1);
  assert.equal(lossProgress(TOTAL_MS), null);
  const from = [{ x: 10, y: 10 }, { x: 500, y: 300 }];
  const start = lossBlips(from, sh, 0);
  const end = lossBlips(from, sh, 1);
  assert.equal(start.length, sh.points.length);
  assert.equal(start.filter((b) => b.real).length, 2);
  const want = [...sh.points].map((p) => `${p.x.toFixed(3)},${p.y.toFixed(3)}`).sort();
  assert.deepEqual(end.map((b) => `${b.x.toFixed(3)},${b.y.toFixed(3)}`).sort(), want);
});
