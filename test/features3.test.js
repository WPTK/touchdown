import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, step } from '../src/sim.js';
import { createMonitor, observe, PARA } from '../src/monitor.js';
import { createSean, floppyProgress, FLOPPY_S } from '../src/sean.js';
import { ACHIEVEMENTS, checkAchievements, createTrophies } from '../src/achievements.js';

function start(seed, demand = 30) {
  const ctl = createSean(seed);
  const sim = createSim({ seed, demandPerHour: demand, controller: ctl });
  return { ctl, sim, sean: ctl.sean, m: createMonitor(), tr: createTrophies() };
}
function go(r, seconds, each) {
  const end = r.sim.t + seconds;
  while (r.sim.t < end) {
    step(r.sim, 1);
    observe(r.m, r.sim);
    each?.(r);
  }
}

test('achievements: about ten, unique, each has the text the UI needs', () => {
  assert.ok(ACHIEVEMENTS.length >= 9 && ACHIEVEMENTS.length <= 12);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) assert.ok(a.title && a.hint && a.blurb && a.pride && typeof a.test === 'function');
});

test('achievements: Paragraph Collector needs 5 different paragraphs, and the outage entry does not count', () => {
  const sim = { t: 99, elsewhere: [] };
  const monitor = { counts: { [PARA.SEP]: 1, [PARA.ALT]: 1, [PARA.SPEED_ADJ]: 1, [PARA.WAKE]: 1, [PARA.OUTAGE]: 4 }, violations: [] };
  const sean = { billed: 0, blimpsSent: 0, goArounds: 0, relieveTries: 0, installs: 0 };
  const tr = createTrophies();
  assert.equal(checkAchievements(tr, { sim, monitor, sean }).some((a) => a.id === 'paragraph-collector'), false);
  monitor.counts[PARA.UAP] = 1;
  assert.deepEqual(checkAchievements(tr, { sim, monitor, sean }).map((a) => a.id).filter((id) => id === 'paragraph-collector'), ['paragraph-collector']);
  assert.equal(tr.unlocked.get('paragraph-collector'), 99);
  // Unlocks once.
  assert.deepEqual(checkAchievements(tr, { sim, monitor, sean }), []);
});

test('achievements: a real run unlocks several of them, each with a sim time', () => {
  const r = start(1, 40);
  go(r, 5 * 3600, () => checkAchievements(r.tr, { sim: r.sim, monitor: r.m, sean: r.sean }));
  assert.ok(r.tr.unlocked.size >= 5, `only ${r.tr.unlocked.size} unlocked`);
  for (const t of r.tr.unlocked.values()) assert.ok(t > 0 && t <= r.sim.t);
  r.ctl.relieve(r.sim);
  r.ctl.relieve(r.sim);
  r.ctl.relieve(r.sim);
  assert.ok(checkAchievements(r.tr, { sim: r.sim, monitor: r.m, sean: r.sean }).some((a) => a.id === 'reviewing'));
});

test('pilots push back, and S.E.A.N. answers and the clearance stands', () => {
  let queries = 0;
  let landings = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const r = start(seed, 40);
    go(r, 2 * 3600);
    const feed = r.sean.feed;
    feed.forEach((f, i) => {
      if (f.kind !== 'pilot') return;
      queries++;
      assert.match(f.text, /^[A-Z]{3,}\d+: /, 'pilot callsign');
      const reply = feed[i + 1];
      if (!reply) return;
      assert.equal(reply.kind, 'tx');
      assert.match(reply.text, /^[A-Z][a-z]+ [a-z ]+, /); // the controller says the call sign in words
      assert.ok(!/\b(correction|disregard|cancel)\b/i.test(reply.text), 'S.E.A.N. backed down');
      if (/land on/.test(f.text)) {
        landings++;
        assert.match(feed[i - 1].text, /cleared to land/i);
        assert.ok(!/taxiway/i.test(f.text), 'the line should not depend on a taxiway name');
      }
    });
  }
  assert.ok(queries >= 10, `only ${queries} pilot queries`);
  assert.ok(landings >= 1, 'no landing-clearance query');
});

test('floppy upgrade: a progress bar from 0 to 100, three disks, then a new version', () => {
  const r = start(2, 20);
  while (!r.sean.floppy) go(r, 1);
  const startT = r.sean.floppy.startT;
  const v = r.sean.floppy.version;
  let last = -1;
  let disks = new Set();
  while (r.sean.floppy) {
    const p = floppyProgress(r.sean, r.sim.t);
    if (p) {
      assert.ok(p.pct >= last, 'progress went backwards');
      last = p.pct;
      disks.add(p.disk);
    }
    go(r, 1);
  }
  assert.ok(r.sim.t - startT >= FLOPPY_S && r.sim.t - startT <= FLOPPY_S + 2);
  assert.deepEqual([...disks], [1, 2, 3]);
  assert.equal(r.sean.installs, 1);
  assert.equal(r.sean.version, 1);
  assert.equal(floppyProgress(r.sean, r.sim.t), null);
  assert.ok(r.sean.feed.some((f) => /floppy/i.test(f.text)) && r.sean.feed.some((f) => new RegExp(`${v.replace('.', '\\.')} (installed|complete)|Upgrade ${v.replace('.', '\.')} complete`).test(f.text)));
});
