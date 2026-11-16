import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockRect, layoutBlocks, DIRS, LEADER_PX } from '../src/datablock.js';
import { createSim, step } from '../src/sim.js';
import { createSean } from '../src/sean.js';

test('a block hangs off the end of its leader: east meets the left edge, north the bottom edge', () => {
  const e = blockRect(100, 100, 60, 24, 'E', 24);
  assert.deepEqual([e.x, e.y, e.ex, e.ey], [124, 88, 124, 100]);
  const n = blockRect(100, 100, 60, 24, 'N', 24);
  assert.deepEqual([n.x, n.y], [70, 52]);
  const sw = blockRect(100, 100, 60, 24, 'SW', 12);
  assert.deepEqual([sw.x + sw.w, sw.y], [88, 112]);
  assert.equal(DIRS.length, 8);
});

test('two targets on top of each other get different spots; a free target keeps its direction across frames', () => {
  const state = new Map();
  const items = [
    { id: 1, x: 200, y: 200, lines: ['AAL1', '100 B738'] },
    { id: 2, x: 200, y: 200, lines: ['BBB2', '100 B738'] },
  ];
  const r = layoutBlocks(items, state, {});
  assert.equal(r.overlaps, 0);
  const first = { ...state.get(2) };
  items[1].x += 1; // it moves a pixel; its block stays where it was
  layoutBlocks(items, state, {});
  assert.deepEqual(state.get(2), first);
  layoutBlocks([items[0]], state, {});
  assert.equal(state.has(2), false, 'a target that is gone is forgotten');
});

test('a dozen targets in one hold-sized clump all find a spot with no overlap', () => {
  const items = [];
  for (let i = 0; i < 12; i++) items.push({ id: i, x: 300 + (i % 4) * 5, y: 300 + (i >> 2) * 5, lines: [`DLT${1000 + i}`, '120↓22 B738 L'], lowLines: [`DLT${1000 + i} 120`] });
  const r = layoutBlocks(items, new Map(), { width: 1000, height: 700 });
  assert.equal(r.overlaps, 0);
  assert.ok(Math.max(...[...r.placed.values()].map((p) => p.len)) <= LEADER_PX[LEADER_PX.length - 1]);
});

test('blocks turn inward at the canvas edge', () => {
  const r = layoutBlocks([{ id: 1, x: 995, y: 5, lines: ['AAL1', '100 B738'] }], new Map(), { width: 1000, height: 700 });
  const p = r.placed.get(1).rect;
  assert.ok(p.x >= 0 && p.x + p.w <= 1000 && p.y >= 0);
});

// The real thing: blocks over the live A80 traffic at the page's default zoom, every 10 s for two hours.
for (const [demand, flow] of [[30, 'normal'], [45, 'busy']]) {
  test(`no data blocks overlap over two hours of ${demand}/h traffic at 50 NM on a 1000 x 700 scope (${flow})`, () => {
    const seed = 7;
    const sim = createSim({ seed, demandPerHour: demand, controller: createSean(seed) });
    const state = new Map();
    const scale = 700 / 2 / 50;
    let frames = 0;
    let bad = 0;
    let low = 0;
    let total = 0;
    while (sim.t < 7200) {
      step(sim, 1);
      if (sim.t % 10 || sim.t < 1800) continue;
      const items = sim.aircraft.map((a) => ({ id: a.id, x: 500 + a.x * scale, y: 350 - a.y * scale, prio: a.phase === 'inner' ? 2 : 0, lines: [a.callsign, '120↓22 B738 L'], lowLines: [`${a.callsign} 120`] }));
      const r = layoutBlocks(items, state, { width: 1000, height: 700 });
      frames++;
      bad += r.overlaps;
      for (const p of r.placed.values()) {
        total++;
        if (p.low) low++;
      }
    }
    assert.ok(frames > 100 && total > 500);
    assert.equal(bad, 0, `${bad} overlapping pairs in ${frames} frames`);
    assert.ok(low / total < 0.15, `${low} of ${total} blocks fell back to the limited block`);
  });
}

test('string ids place without error, and a leader shortens once the room is free', () => {
  const state = new Map();
  const a = { id: '1-5', x: 200, y: 200, lines: ['AAL1', '100 B738'] };
  const b = { id: '1-6', x: 200, y: 200, lines: ['BBB2', '100 B738'] };
  assert.equal(layoutBlocks([a, b], state, {}).overlaps, 0);
  const long = layoutBlocks([a, b], new Map([['1-6', { dir: 'NE', len: 90, low: false }]]), {});
  assert.ok(long.placed.get('1-6').len < 90);
});
