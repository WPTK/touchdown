// Achievements: every one can unlock with some seed and inputs, hidden ones stay ???, S.E.A.N. announces each unlock on
// the frequency, and the trophy case survives a browser with no localStorage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, step } from '../src/sim.js';
import { createMonitor, observe } from '../src/monitor.js';
import { createSean } from '../src/sean.js';
import { createWeather } from '../src/weather.js';
import { byId } from '../src/scenarios.js';
import { ACHIEVEMENTS, createTrophies, runAchievements, trophyRow } from '../src/achievements.js';
import { createStore } from '../src/storage.js';

// The inputs that unlock the lot. Between them these two runs reach every achievement: heavy demand and the thunderstorm
// day for the weather, ATIS and PIREP ones, twenty presses of Relieve, and the shutdown switched on and kept on.
const RECIPES = [
  { seed: 1, wx: 'thunderstorm', hours: 7, demand: 60, relieve: 20, shutdown: true },
  { seed: 2, wx: 'thunderstorm', hours: 7, demand: 60, relieve: 20, shutdown: true },
];

function play(recipe, onFrame) {
  const ctl = createSean(recipe.seed);
  const sim = createSim({
    seed: recipe.seed,
    demandPerHour: recipe.demand,
    controller: ctl,
    weather: createWeather({ scenario: byId(recipe.wx), seed: recipe.seed }),
  });
  const monitor = createMonitor();
  for (let i = 0; i < recipe.relieve; i++) ctl.relieve(sim);
  const trophies = createTrophies();
  ctl.setShutdown(sim, recipe.shutdown);
  while (sim.t < recipe.hours * 3600) {
    step(sim, 1);
    observe(monitor, sim);
    if (recipe.shutdown && sim.t % 600 === 0 && !ctl.sean.shutdown.on) ctl.setShutdown(sim, true);
    if (sim.t % 30 === 0) onFrame({ sim, monitor, sean: ctl.sean, ctl, trophies });
  }
  return { sim, monitor, ctl, trophies };
}

test('there are about thirty achievements, with unique ids and titles, and every locked row has something to read', () => {
  assert.ok(ACHIEVEMENTS.length >= 30 && ACHIEVEMENTS.length <= 40, `${ACHIEVEMENTS.length}`);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.id)).size, ACHIEVEMENTS.length);
  assert.equal(new Set(ACHIEVEMENTS.map((a) => a.title)).size, ACHIEVEMENTS.length);
  for (const a of ACHIEVEMENTS) {
    for (const k of ['id', 'title', 'hint', 'blurb', 'pride']) assert.ok(typeof a[k] === 'string' && a[k].length > 0, `${a.id}.${k}`);
    assert.equal(typeof a.test, 'function', a.id);
  }
  assert.ok(ACHIEVEMENTS.some((a) => a.hidden) && ACHIEVEMENTS.some((a) => a.self));
  assert.ok(ACHIEVEMENTS.some((a) => a.id === 'reviewing'));
});

test('every achievement can unlock, with the seeds and inputs in RECIPES, and S.E.A.N. announces each one', () => {
  const all = new Set();
  const announced = new Set();
  for (const recipe of RECIPES) {
    const store = createStore(() => undefined);
    const { sim, ctl } = play(recipe, ({ sim: s, monitor, sean, ctl: c, trophies }) => {
      const { fresh } = runAchievements({ trophies, ctx: { sim: s, monitor, sean }, ctl: c, store });
      for (const a of fresh) all.add(a.id);
    });
    for (const f of ctl.sean.feed) {
      const m = /^Achievement unlocked: (.+?)\. /.exec(f.text);
      if (m && f.kind === 'brag') announced.add(m[1]);
    }
    assert.ok(sim.t >= recipe.hours * 3600);
  }
  const missing = ACHIEVEMENTS.filter((a) => !all.has(a.id)).map((a) => a.id);
  assert.deepEqual(missing, [], `unreachable with these recipes: ${missing.join(', ')}`);
  // The feed keeps the last 4000 lines, so the early unlocks may have scrolled off; the late ones must still be there.
  assert.ok(announced.size >= 10, `only ${announced.size} announcements still in the feed`);
});

test('an unlock goes on the frequency once, in S.E.A.N.\'s words, and is new to the store only the first time', () => {
  const ctl = createSean(1);
  const sim = createSim({ seed: 1, demandPerHour: 20, controller: ctl });
  const store = createStore(() => undefined);
  const trophies = createTrophies();
  const ctx = { sim, monitor: createMonitor(), sean: ctl.sean };
  sim.t = 700;
  const first = runAchievements({ trophies, ctx, ctl, store });
  assert.deepEqual(first.fresh.map((a) => a.id), ['showed-up']);
  assert.deepEqual(first.firsts.map((a) => a.id), ['showed-up']);
  const lines = ctl.sean.feed.filter((f) => /^Achievement unlocked: Showed Up\./.test(f.text));
  assert.equal(lines.length, 1);
  assert.equal(lines[0].kind, 'brag');
  assert.deepEqual(runAchievements({ trophies, ctx, ctl, store }).fresh, []);
  // A new run in the same browser: S.E.A.N. announces it again, but it is not a first.
  const again = runAchievements({ trophies: createTrophies(), ctx, ctl, store });
  assert.equal(again.fresh.length, 1);
  assert.deepEqual(again.firsts, []);
});

test('hidden achievements show ??? until they unlock, and a trophy from an earlier visit shows as earned', () => {
  const hidden = ACHIEVEMENTS.find((a) => a.hidden);
  const plain = ACHIEVEMENTS.find((a) => !a.hidden && !a.self);
  assert.deepEqual(trophyRow(hidden, { unlockedNow: false, ever: false }), { got: false, now: false, title: '???', text: '', self: false });
  assert.deepEqual(trophyRow(hidden, { unlockedNow: true, ever: true }), { got: true, now: true, title: hidden.title, text: hidden.blurb, self: false });
  assert.deepEqual(trophyRow(hidden, { unlockedNow: false, ever: true }), { got: true, now: false, title: hidden.title, text: hidden.blurb, self: false });
  assert.deepEqual(trophyRow(plain, { unlockedNow: false, ever: false }), { got: false, now: false, title: plain.title, text: plain.hint, self: false });
  const self = ACHIEVEMENTS.find((a) => a.self);
  assert.equal(trophyRow(self, { unlockedNow: true, ever: true }).self, true);
});

// ---- storage ----

const fake = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), data };
};

test('the trophy case is kept across visits', () => {
  const backing = fake();
  const one = createStore(() => backing);
  assert.equal(one.persistent, true);
  assert.equal(one.add('first-loss', 120), true);
  assert.equal(one.add('first-loss', 400), false);
  const two = createStore(() => backing);
  assert.ok(two.has('first-loss'));
  assert.deepEqual(two.ids(), ['first-loss']);
  assert.equal(two.add('first-loss', 9), false);
  assert.equal(two.add('series-a', 9), true);
  assert.deepEqual(createStore(() => backing).ids().sort(), ['first-loss', 'series-a']);
  two.clear();
  assert.deepEqual(createStore(() => backing).ids(), []);
});

test('the store survives a missing localStorage, one that throws, a full one and a corrupt one', () => {
  // node has no localStorage at all: the default accessor must not throw.
  const bare = createStore();
  assert.equal(bare.persistent, false);
  assert.equal(bare.add('first-loss', 1), true);
  assert.ok(bare.has('first-loss'));
  // Reading the property throws, as it does in some browsers with storage turned off.
  const angry = createStore(() => {
    throw new Error('SecurityError');
  });
  assert.equal(angry.persistent, false);
  assert.equal(angry.add('series-a', 1), true);
  // Writing throws (quota): the trophy stays in memory.
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  const s = createStore(() => full);
  assert.equal(s.add('boot-disk', 5), true);
  assert.ok(s.has('boot-disk'));
  // Garbage in storage starts over instead of refusing to run.
  const junk = fake();
  junk.data.set('touchdown.trophies.v1', '{not json');
  assert.deepEqual(createStore(() => junk).ids(), []);
  junk.data.set('touchdown.trophies.v1', JSON.stringify({ v: 2, ever: { x: {} } }));
  assert.deepEqual(createStore(() => junk).ids(), []);
  // Something that is not a Storage at all.
  assert.equal(createStore(() => ({})).persistent, false);
  assert.equal(createStore(() => 'nope').persistent, false);
});
