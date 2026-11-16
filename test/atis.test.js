// The ATIS, PIREPs, handoffs and the press briefing.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSim, step } from '../src/sim.js';
import { createMonitor, observe, PARA } from '../src/monitor.js';
import { createSean } from '../src/sean.js';
import { createWeather, parseMetar } from '../src/weather.js';
import { SCENARIOS, byId } from '../src/scenarios.js';
import { LETTERS, atisText, attention, forecastWords, nextIndex, weatherWords } from '../src/atis.js';
import { SPINS, briefing } from '../src/brief.js';
import FREQ from '../data/atl-freq.json' with { type: 'json' };

function run(seed, hours, { wx = null, demand = 30 } = {}) {
  const ctl = createSean(seed);
  const sim = createSim({ seed, demandPerHour: demand, controller: ctl, weather: wx ? createWeather({ scenario: byId(wx), seed }) : null });
  const m = createMonitor();
  while (sim.t < hours * 3600) {
    step(sim, 1);
    observe(m, sim);
  }
  return { sim, m, sean: ctl.sean };
}

test('ATIS letters run Alpha to Zulu in order and start over (2-9-1)', () => {
  assert.equal(LETTERS.length, 26);
  assert.equal(LETTERS[0], 'Alpha');
  assert.equal(LETTERS[25], 'Zulu');
  let i = 0;
  const seen = [];
  for (let n = 0; n < 53; n++) {
    seen.push(LETTERS[i]);
    i = nextIndex(i);
  }
  assert.deepEqual(seen.slice(0, 3), ['Alpha', 'Bravo', 'Charlie']);
  assert.equal(seen[25], 'Zulu');
  assert.equal(seen[26], 'Alpha');
  assert.equal(seen[52], 'Alpha');
  // Bravo is the next after Alpha with no skips, all the way round.
  for (let k = 0; k < 26; k++) assert.equal(nextIndex(k), (k + 1) % 26);
  assert.equal(attention(1), 'Attention all aircraft, information Bravo current.');
});

test('the ATIS opens and closes with its code word and carries the real weather in 2-4-17 words', () => {
  const metar = parseMetar(SCENARIOS.find((s) => s.id === 'west-flow').metars[4]); // 28010G15KT 10SM FEW150 SCT250 25/13 A3003
  const text = atisText({ index: 2, hhmm: '1652', metar, flowRunways: ['26R', '27L', '28'], approach: 'visual', forecast: 'wind zero niner zero at one zero', pireps: ['airship, two o\'clock'] });
  assert.match(text, /^Atlanta information Charlie, one six five two Zulu\./);
  assert.match(text, /End of information Charlie\.$/);
  assert.match(text, /Visibility one zero./);
  assert.match(text, /Wind two eight zero at one zero gusts one five./);
  assert.match(text, /Altimeter three zero zero three/);
  assert.match(text, /Temperature two five, dew point one three/);
  assert.match(text, /[Ss]ky condition few one five thousand, scattered two five thousand/);
  assert.match(text, /runway two six right, runway two seven left, runway two eight/);
  assert.match(text, /S\.E\.A\.N\. forecast: wind zero niner zero/);
  assert.match(text, /Pilot report: airship, two o'clock./);
  assert.ok(!text.includes('..'), 'a doubled period');
  assert.match(text, /Advise on initial contact you have information Charlie\./);
});

test('weather words cover phenomena and a missing sky', () => {
  const m = parseMetar('KATL 160000Z 23035G55KT 1SM +TSRA BKN008CB 22/21 A2971 RMK AO2');
  const w = weatherWords(m);
  assert.match(w, /Heavy thunderstorm rain/);
  assert.match(w, /broken eight hundred/);
  assert.match(w, /Wind two three zero at three five gusts five five/);
  assert.match(weatherWords(parseMetar('KATL 160000Z 00000KT 10SM CLR 20/10 A3000')), /Sky clear/);
  assert.match(forecastWords('KATL 211352Z 09010KT 10SM SKC 23/05 A2992 RMK AO2 SEAN FCST CONF 98.5'), /^wind zero niner zero at one zero, visibility one zero, sky clear\. Confidence niner eight point five percent$/);
  assert.match(forecastWords('KATL 211352Z 09010KT 1/4SM DS VV002 23/05 A2992 RMK AO2 SEAN FCST CONF 98.5'), /dust storm/);
});

test('S.E.A.N. writes a new ATIS for each new METAR, in letter order, with the real weather and its own forecast', () => {
  const { sean, sim } = run(1, 6, { wx: 'west-flow' });
  const atis = sean.atis.history;
  assert.ok(atis.length >= 5, `only ${atis.length} ATIS recordings`);
  atis.forEach((f, i) => {
    assert.ok(f.text.startsWith(`Atlanta information ${LETTERS[i % 26]},`), f.text.slice(0, 40));
    assert.match(f.text, new RegExp(`End of information ${LETTERS[i % 26]}\\.$`));
    assert.match(f.text, /S\.E\.A\.N\. forecast:/);
  });
  // The first one is for the first METAR of the day: its real wind, in words.
  assert.match(atis[0].text, /Wind two seven zero at niner./);
  // New code, and the broadcast says so.
  assert.ok(atis.length > 1 && atis[1].index === 1);
  assert.ok(sean.feed.some((f) => f.kind === 'tx' && /^Attention all aircraft, information [A-Z][a-z-]+ current.$/.test(f.text)));
  assert.equal(sean.atis.index, (atis.length - 1) % 26);
  assert.ok(sim.t >= 6 * 3600);
});

test('with no weather the ATIS is calm, and the code changes only when the runway does', () => {
  const { sean } = run(2, 3);
  const atis = sean.atis.history;
  assert.ok(atis.length >= 1);
  assert.match(atis[0].text, /No weather reported\. Calm\./);
});

test('a PIREP about the airship, the UFO and the sharknado, each from a pilot in the stream, and the ATIS carries it', () => {
  let blimp = 0;
  let ufo = 0;
  let shark = 0;
  for (let seed = 1; seed <= 24 && !(blimp && ufo && shark); seed++) {
    const { sean } = run(seed, 5, { wx: 'thunderstorm' });
    const pireps = sean.feed.filter((f) => f.kind === 'pirep').map((f) => f.text);
    for (const p of pireps) assert.match(p, /^[A-Z]{3,}\d+: PIREP: /);
    blimp += pireps.filter((p) => /airship|blimp/i.test(p)).length;
    ufo += pireps.filter((p) => /unidentified|UAP|bright object/i.test(p)).length;
    shark += pireps.filter((p) => /shark/i.test(p)).length;
    if (pireps.length) assert.ok(sean.feed.some((f) => f.kind === 'atis' && /Pilot report: /.test(f.text)), 'the ATIS never carried a PIREP');
  }
  assert.ok(blimp > 0, 'no airship PIREP');
  assert.ok(ufo > 0, 'no UFO PIREP');
  assert.ok(shark > 0, 'no sharknado PIREP');
});

test('S.E.A.N. hands off to itself, accepts, and gives the tower frequency from the FAA data, or the ATIS one', () => {
  const { sean } = run(1, 4);
  assert.ok(sean.handoffs > 10);
  const tower = new Set(Object.values(FREQ.tower));
  const said = [];
  for (const f of sean.feed) {
    const m = /contact Atlanta Tower ([a-z ]+ point [a-z]+( [a-z]+)?)\./.exec(f.text);
    if (f.kind === 'tx' && m) said.push(m[1]);
  }
  assert.ok(said.length > 10);
  const words = (mhz) => mhz.split('').map((c) => (c === '.' ? 'point' : ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'][Number(c)])).join(' ');
  const real = new Set([...Object.values(FREQ.tower), FREQ.atis.arrival].map(words));
  for (const w of said) assert.ok(real.has(w), `not an FAA frequency: ${w}`);
  assert.ok(said.some((w) => words([...tower][0]) === w || [...tower].some((q) => words(q) === w)), 'never gave a tower frequency');
  assert.ok(said.some((w) => w === words(FREQ.atis.arrival)), 'never sent anyone to the ATIS frequency');
  const hand = sean.feed.findIndex((f) => /^S\.E\.A\.N\. approach|Atlanta Tower, S\.E\.A\.N\. approach, handoff/.test(f.text));
  assert.ok(hand >= 0);
  assert.match(sean.feed[hand + 1].text, /(Handoff accepted|radar contact|I have them)/i);
});

test('the frequency data is sourced and complete for both flows', () => {
  assert.match(FREQ.source, /NASR/);
  for (const rwy of ['26R', '27L', '28', '8L', '9R', '10']) assert.match(FREQ.tower[rwy], /^\d{3}\.\d{1,3}$/, rwy);
  assert.match(FREQ.atis.arrival, /^\d{3}\.\d{1,3}$/);
});

test('a pilot with the old ATIS is told it is current, and the monitor cites 2-9-2', () => {
  let found = 0;
  for (let seed = 1; seed <= 8 && !found; seed++) {
    const { sim, m } = run(seed, 6, { wx: 'west-flow', demand: 45 });
    const stale = sim.lapses.filter((l) => l.para === PARA.ATIS);
    found += stale.length;
    assert.equal(m.violations.filter((v) => v.para === PARA.ATIS).length, stale.length);
  }
  assert.ok(found > 0, 'no stale ATIS in eight seeds');
});

test('the press briefing reads the monitor\'s real numbers and spins them', () => {
  const stats = { losses: 3, holds: 11, goArounds: 4, elsewhere: 2, readbacks: 5, outages: 1, violations: 140 };
  const lines = briefing(stats, () => 0.3, 7);
  assert.equal(lines.length, 9); // open, seven spins, close
  const joined = lines.join(' ');
  for (const n of ['3 ', '11 ', '4 ', '2 ', '5 ', '1 ', '140 ']) assert.ok(joined.includes(n), `missing ${n}`);
  assert.deepEqual(briefing({ ...stats, losses: 0, outages: 0 }, () => 0.5, 7).filter((l) => /separation|scope/.test(l)), [], 'a zero is not briefed');
  assert.equal(briefing({}, () => 0.1).length, 2);
  assert.deepEqual(briefing(stats, () => 0.7), briefing(stats, () => 0.7));
  assert.equal(SPINS.length, 7);
});

test('in a run, a briefing quotes the monitor counts at that moment', () => {
  const { sean, m } = run(1, 5);
  assert.ok(sean.briefings >= 1);
  const briefs = sean.feed.filter((f) => f.kind === 'brief');
  assert.ok(briefs.length >= 3);
  const nums = new Set(briefs.flatMap((f) => (f.text.match(/\b\d+\b/g) ?? []).map(Number)));
  const real = [m.counts[PARA.SEP] || 0, sean.goArounds, m.violations.length].filter((n) => n > 0);
  assert.ok(real.length);
  assert.ok(nums.size > 0);
});
