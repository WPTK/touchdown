import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, step } from '../src/sim.js';
import { createMonitor, observe, PARA } from '../src/monitor.js';
import { createSean, CUT_STAGES, OUTAGE_S, STAGE_S } from '../src/sean.js';
import { meter, real, DOWN_PAYMENT_B } from '../src/score.js';

function start(seed, demand = 30) {
  const ctl = createSean(seed);
  const sim = createSim({ seed, demandPerHour: demand, controller: ctl });
  return { ctl, sim, sean: ctl.sean, m: createMonitor() };
}
function go(r, seconds, each) {
  const end = r.sim.t + seconds;
  while (r.sim.t < end) {
    step(r.sim, 1);
    observe(r.m, r.sim);
    each?.(r);
  }
}

test('copper outage: 90 s dark, traffic keeps moving, S.E.A.N. says zero conflicts', () => {
  let found = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const r = start(seed, 40);
    let visibleAtStart = null;
    let hiddenWhileDark = 0;
    go(r, 6 * 3600, ({ sim, m, sean }) => {
      const o = sim.outages.at(-1);
      const dark = o && sim.t >= o.startT && sim.t < o.endT;
      if (dark && visibleAtStart === null) {
        visibleAtStart = m.violations.length;
      }
      if (dark) {
        assert.equal(m.violations.length, visibleAtStart, 'the log changed while the scope was dark');
        hiddenWhileDark = m.held.length;
      } else if (visibleAtStart !== null) {
        // The picture is back: one outage entry, then what happened.
        const entry = m.violations.slice(visibleAtStart).find((v) => v.para === PARA.OUTAGE);
        assert.ok(entry, 'no outage entry once the scope came back');
        assert.ok(entry.title.includes(String(OUTAGE_S)));
        assert.equal(m.violations.length, visibleAtStart + 1 + hiddenWhileDark);
        const started = sim.outages.at(-1).startT;
        assert.ok(sean.feed.some((f) => f.t >= started && /zero conflicts observed/i.test(f.text)), 'S.E.A.N. did not claim zero conflicts');
        found++;
        visibleAtStart = null;
      }
    });
    for (const o of r.sim.outages) assert.equal(o.endT - o.startT, OUTAGE_S);
  }
  assert.ok(found >= 5, `only ${found} outages in 12 seeds`);
});

test('copper outage: aircraft keep flying while the scope is dark', () => {
  const r = start(3, 40);
  while (!r.sim.outages.length) go(r, 1);
  const before = new Map(r.sim.aircraft.map((a) => [a.id, [a.x, a.y]]));
  go(r, 60);
  const moved = r.sim.aircraft.filter((a) => before.has(a.id) && (a.x !== before.get(a.id)[0] || a.y !== before.get(a.id)[1]));
  assert.ok(moved.length > 0);
});

test('copper outage: the monitor logs a loss that happens in the dark, once the scope is back', () => {
  let seen = 0;
  for (let seed = 1; seed <= 40 && !seen; seed++) {
    const r = start(seed, 50);
    go(r, 6 * 3600, ({ m }) => {
      if (m.held.some((v) => v.para === PARA.SEP)) seen++;
    });
    if (seen) {
      const entry = r.m.violations.find((v) => v.para === PARA.OUTAGE && /separation|5-5-4/.test(v.detail));
      assert.ok(entry, 'the outage entry does not mention the loss');
    }
  }
  assert.ok(seen > 0, 'no seed lost separation in the dark');
});

test('the safe controller has no outages and no violations', () => {
  const sim = createSim({ seed: 5, demandPerHour: 40 });
  const m = createMonitor();
  for (let i = 0; i < 4 * 3600; i++) {
    step(sim, 1);
    observe(m, sim);
  }
  assert.equal(sim.outages.length, 0);
  assert.equal(m.violations.length, 0);
});

test('shutdown mode: cuts of 4%, 6% and 3% are made by deleting aircraft, and every flight still ends somewhere', () => {
  const r = start(2, 60);
  go(r, 1200);
  r.ctl.setShutdown(r.sim, true);
  const t0 = r.sim.t;
  const stages = [];
  go(r, STAGE_S * CUT_STAGES.length + 60, ({ sim, sean }) => {
    if (sean.shutdown.on) stages[sean.shutdown.stage] = true;
    if (sim.t === t0 + STAGE_S * 2 - 1) stages.cutsAtStage2End = sean.cutTotal;
  });
  assert.deepEqual(stages.slice(0, 3), [true, true, true]);
  assert.equal(r.sean.shutdown.on, false, 'the cuts were never lifted');
  assert.ok(r.sim.cut.length >= 3, `only ${r.sim.cut.length} flights cut`);
  assert.equal(r.sim.cut.length, r.sean.cutTotal);
  // Roughly the stated share of the flights requested in that stretch, not more than a flight or two over.
  const share = r.sim.cut.length / (60 * ((STAGE_S * 3) / 3600));
  assert.ok(share > 0.02 && share < 0.1, `cut share ${share}`);
  // A cut flight left the scope.
  for (const c of r.sim.cut) assert.ok(!r.sim.aircraft.some((a) => a.callsign === c.callsign));
  // S.E.A.N. still says it was all on time.
  assert.equal(real(r.sim, r.m, r.sean).cut, r.sim.cut.length);
});

test('shutdown mode is off until asked, and off again after the replay', () => {
  const r = start(2, 60);
  go(r, 3600);
  assert.equal(r.sim.cut.length, 0);
  r.ctl.setShutdown(r.sim, true);
  r.ctl.setShutdown(r.sim, false);
  go(r, 3600);
  assert.equal(r.sim.cut.length, 0);
});

test('the meter bills each separation loss as another down payment', () => {
  assert.deepEqual(meter(0), { payments: 1, totalB: 12.5, askB: 30, gaoSchedules: 11389, seanSchedules: 1, due: 'now' });
  assert.equal(meter(3).totalB, 4 * DOWN_PAYMENT_B);
  const r = start(1, 40);
  go(r, 4 * 3600);
  assert.ok(r.sean.billed > 0);
  // One invoice per breach, not per tick: it matches the monitor's count of separation events to within the outages.
  const events = r.m.counts[PARA.SEP] || 0;
  assert.ok(Math.abs(r.sean.billed - events) <= Math.max(2, events * 0.1), `billed ${r.sean.billed}, monitor ${events}`);
  assert.ok(r.sean.feed.some((f) => /down payment/i.test(f.text)));
});
