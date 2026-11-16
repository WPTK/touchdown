// The frequency in a real run: clearances in the order's words, readbacks, readback errors the monitor cites,
// stepped-on calls, the congestion meter and the feed filters.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, step } from '../src/sim.js';
import { createMonitor, observe, PARA } from '../src/monitor.js';
import { createSean } from '../src/sean.js';
import { FILTERS, airtime, buildFeed, congestion, congestionLabel, speakerOf } from '../src/feed.js';

function run(seed, hours = 3, demand = 36) {
  const ctl = createSean(seed);
  const sim = createSim({ seed, demandPerHour: demand, controller: ctl });
  const m = createMonitor();
  while (sim.t < hours * 3600) {
    step(sim, 1);
    observe(m, sim);
  }
  return { sim, m, sean: ctl.sean };
}

test('arrivals get hold, approach and landing clearances in 7110.65 words, and read them back', () => {
  const { sean } = run(1);
  const tx = sean.feed.filter((f) => f.kind === 'tx').map((f) => f.text);
  assert.ok(tx.some((t) => /cleared ILS runway [a-z ]+ approach/.test(t)), 'no approach clearance');
  assert.ok(tx.some((t) => /runway [a-z ]+, cleared to land/.test(t)), 'no landing clearance');
  assert.ok(tx.some((t) => /hold as published, expect further clearance [a-z ]+\./.test(t)), 'no hold with an EFC');
  const back = sean.feed.filter((f) => f.kind === 'readback').map((f) => f.text);
  assert.ok(back.length >= 20, `only ${back.length} readbacks`);
  for (const t of back.filter((x) => !x.includes('[blocked]'))) assert.match(t, /, [A-Z][a-z]+ [a-z ]+\.$/, t);
  for (const t of tx.filter((x) => /cleared ILS/.test(x))) assert.ok(!/\d/.test(t.replace(/\b[A-Z]{5}\b/, '')), `digits left in: ${t}`);
});

test('a readback error S.E.A.N. says is correct is a 2-4-3 violation in the monitor', () => {
  const { sim, sean, m } = run(2, 4);
  assert.ok(sim.readbacks.length > 0, 'no readback errors in four hours');
  const logged = m.violations.filter((v) => v.para === PARA.READBACK);
  assert.equal(logged.length, sim.readbacks.length);
  for (const [i, r] of sim.readbacks.entries()) {
    assert.match(logged[i].detail, new RegExp(r.callsign));
    if (r.t < sean.feed[0].t) continue; // the feed keeps the last 1000 lines
    const at = sean.feed.findIndex((f) => f.kind === 'readback' && f.text === r.said && f.t === r.t);
    assert.ok(at >= 0, 'the wrong readback is on the frequency');
    // S.E.A.N. never catches it: the next S.E.A.N. line is a "correct", and nothing corrects it.
    const reply = sean.feed.slice(at + 1).find((f) => f.kind === 'tx');
    assert.match(reply.text, /correct|good readback/i);
  }
});

test('readbacks, blocked calls and unable are all seeded', () => {
  const a = run(5, 2);
  const b = run(5, 2);
  assert.deepEqual(a.sean.feed, b.sean.feed);
  assert.deepEqual(a.sim.readbacks, b.sim.readbacks);
});

test('some calls are stepped on, the fragment is marked, and S.E.A.N. asks for it again', () => {
  const { sean } = run(3, 4);
  const i = sean.feed.findIndex((f) => f.blocked);
  assert.ok(i >= 0, 'nothing was stepped on');
  assert.match(sean.feed[i].text, /\[blocked\]/);
  assert.equal(sean.feed[i].kind, 'readback');
  assert.match(sean.feed[i + 1].text, /blocked|stepped on|Say again/i);
  assert.equal(sean.feed[i + 2].kind, 'readback');
  assert.ok(!sean.feed[i + 2].blocked && !/\[blocked\]/.test(sean.feed[i + 2].text));
});

test('pilots say unable, and S.E.A.N. files it as compliance', () => {
  let n = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const { sean } = run(seed, 3, 40);
    sean.feed.forEach((f, i) => {
      if (f.kind !== 'pilot' || !/^[A-Z]+\d*: Unable/.test(f.text)) return;
      n++;
      assert.equal(sean.feed[i + 1].kind, 'tx');
      assert.match(sean.feed[i + 1].text, /unable|instruction stands|noted/i);
    });
  }
  assert.ok(n >= 1, 'nobody said unable');
});

test('the congestion meter is the share of the window someone was talking', () => {
  const quiet = [{ t: 0, kind: 'tx', text: 'Peach four one two, descend and maintain one one thousand.' }];
  const c = congestion(quiet, 10);
  assert.equal(c.n, 1);
  assert.equal(c.pct, Math.round((100 * airtime(quiet[0].text)) / 120));
  // Press releases are not radio, and old lines fall out of the window.
  assert.equal(congestion([{ t: 0, kind: 'brag', text: 'Landing #1.' }], 10).n, 0);
  assert.equal(congestion(quiet, 500).n, 0);
  // A frequency full of calls goes past 100, which S.E.A.N. calls engagement.
  const busy = Array.from({ length: 40 }, (_, i) => ({ t: i, kind: 'tx', text: 'Peach four one two, descend and maintain one one thousand now.' }));
  const b = congestion(busy, 40);
  assert.ok(b.pct >= 100, `${b.pct}`);
  assert.equal(congestionLabel(b.pct), 'maximum engagement');
  assert.equal(congestionLabel(0), 'idle');
});

test('feed filters: S.E.A.N., pilots and the monitor, merged by time', () => {
  const feed = [
    { t: 1, kind: 'tx', text: 'one' },
    { t: 2, kind: 'readback', text: 'two' },
    { t: 3, kind: 'brag', text: 'three' },
    { t: 4, kind: 'pilot', text: 'four' },
    { t: 6, kind: 'blame', text: 'six' },
  ];
  const viol = [{ t: 5, para: '5-5-4 / 4-5-1', title: 'Separation minima lost', detail: 'x and y' }];
  const texts = (on) => buildFeed(feed, viol, on).map((l) => l.text);
  assert.deepEqual(texts(FILTERS), ['six', '5-5-4 / 4-5-1: Separation minima lost. x and y', 'four', 'three', 'two', 'one']);
  assert.deepEqual(texts(['sean']), ['six', 'three', 'one']);
  assert.deepEqual(texts(['pilot']), ['four', 'two']);
  assert.deepEqual(texts(['monitor']), ['5-5-4 / 4-5-1: Separation minima lost. x and y']);
  assert.deepEqual(texts(new Set(['pilot', 'monitor'])), ['5-5-4 / 4-5-1: Separation minima lost. x and y', 'four', 'two']);
  assert.deepEqual(texts([]), []);
  assert.equal(buildFeed(feed, viol, FILTERS, 2).length, 2);
  assert.equal(speakerOf('readback'), 'pilot');
  assert.equal(speakerOf('mystery'), 'sean');
});
