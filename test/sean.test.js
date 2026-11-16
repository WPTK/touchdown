import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, drain, step } from '../src/sim.js';
import { createMonitor, observe, PARA } from '../src/monitor.js';
import { createSean, BLIMP_KT } from '../src/sean.js';

function run(seed, hours = 4, demand = 30) {
  const ctl = createSean(seed);
  const sim = createSim({ seed, demandPerHour: demand, controller: ctl });
  const m = createMonitor();
  while (sim.t < hours * 3600) {
    step(sim, 1);
    observe(m, sim);
  }
  return { sim, m, sean: ctl.sean };
}

test('S.E.A.N. breaks rules, and the monitor logs paragraph numbers for them', () => {
  const { m } = run(1);
  assert.ok(m.violations.length > 20, `only ${m.violations.length} violations`);
  for (const para of [PARA.SEP, PARA.ALT, PARA.SPEED_ADJ]) assert.ok(m.counts[para] > 0, `no ${para}`);
  for (const v of m.violations) {
    assert.ok(v.para && v.title && Array.isArray(v.ids) && v.detail && Number.isFinite(v.t));
  }
});

test('S.E.A.N. is deterministic per seed and differs between seeds', () => {
  const a = run(7, 2);
  const b = run(7, 2);
  assert.deepEqual(a.m.violations, b.m.violations);
  assert.deepEqual(a.sean.feed, b.sean.feed);
  assert.notDeepEqual(run(8, 2).sean.feed, a.sean.feed);
});

test('S.E.A.N. does not crash or stall: everything lands or is diverted, 20 seeds x 4 h', () => {
  for (let seed = 1; seed <= 20; seed++) {
    const { sim, sean } = run(seed, 4, seed % 2 ? 24 : 45);
    assert.equal(drain(sim), true, `seed ${seed}: traffic left after drain`);
    assert.ok(sean.credit > 0, `seed ${seed}: no landings`);
    assert.ok(sim.landed.length + sean.diverted.length >= sim.requested - 0, `seed ${seed}: aircraft lost`);
  }
});

test('go-arounds and Birmingham diversions both happen', () => {
  let ga = 0;
  let div = 0;
  for (let seed = 1; seed <= 5; seed++) {
    const { sean } = run(seed);
    ga += sean.goArounds;
    div += sean.diverted.length;
  }
  assert.ok(ga > 0 && div > 0, `go-arounds ${ga}, diversions ${div}`);
});

// Blimps and UFOs are occasional: some seeds have them, some do not.
function findSeed(has) {
  for (let seed = 1; seed <= 60; seed++) {
    const r = run(seed, 3);
    if (has(r)) return { seed, ...r };
  }
  return null;
}

test('blimps: a slow airship is sequenced like a jet, S.E.A.N. orders it to fly 160, the monitor flags what breaks', () => {
  const r = findSeed(({ sean }) => sean.blimpsSent > 0);
  assert.ok(r, 'no seed in 1..60 sent a blimp');
  const none = findSeed(({ sean }) => sean.blimpsSent === 0);
  assert.ok(none, 'every seed sent a blimp');
  const full = run(r.seed, 5);
  const limits = full.m.violations.filter((v) => v.para === PARA.SPEED_ADJ && /beyond the aircraft/.test(v.title));
  assert.ok(limits.length > 0, 'speed order beyond airship limits not flagged');
  assert.match(limits[0].detail, /ZPL/);
  assert.ok(full.m.violations.some((v) => v.para === PARA.SEP && /ZPL/.test(v.detail)), 'no separation loss involving the blimp');
  assert.ok(full.sean.feed.some((f) => /ZPL/.test(f.text)));
  const blimp = full.sim.aircraft.find((a) => a.kind === 'blimp') ?? { innerKt: BLIMP_KT };
  assert.equal(blimp.innerKt, BLIMP_KT, 'the airship did not speed up');
});

test('UFOs: S.E.A.N. assigns a slot, informs itself under 9-8-1, and takes credit when it leaves', () => {
  const r = findSeed(({ sim }) => sim.anomalies.some((u) => u.gone));
  assert.ok(r, 'no seed in 1..60 produced a UFO');
  assert.ok(findSeed(({ sim }) => sim.anomalies.length === 0), 'every seed had a UFO');
  assert.ok(r.m.counts[PARA.UAP] >= 1 && r.m.counts[PARA.AARO] >= 1);
  assert.ok(r.sean.feed.some((f) => /squawk \d{4}, runway 27/.test(f.text)));
  assert.ok(r.sean.feed.some((f) => /Target gone|left my airspace/.test(f.text)));
  const u = r.sim.anomalies[0];
  assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y));
});
