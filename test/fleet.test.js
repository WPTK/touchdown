import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { APCH_CAT_KT, CWT_LETTERS, CWT_MIN_NM, FLEET, pickType, wakeMinNm } from '../src/fleet.js';
import { mulberry32 } from '../src/rng.js';
import { createSim, drain, step } from '../src/sim.js';

test('wakeMinNm spot checks against TBL 5-5-4', () => {
  assert.equal(wakeMinNm('A', 'B'), 5);
  assert.equal(wakeMinNm('A', 'I'), 8);
  assert.equal(wakeMinNm('B', 'B'), 3);
  assert.equal(wakeMinNm('B', 'I'), 6);
  assert.equal(wakeMinNm('C', 'E'), 3.5);
  assert.equal(wakeMinNm('D', 'H'), 6);
  assert.equal(wakeMinNm('E', 'I'), 4);
  assert.equal(wakeMinNm('F', 'I'), 4);
  assert.equal(wakeMinNm('C', 'D'), null);
  assert.equal(wakeMinNm('C', 'F'), 3.5);
  assert.equal(wakeMinNm('C', 'H'), 5);
  assert.equal(wakeMinNm('D', 'B'), 3);
  assert.equal(wakeMinNm('E', 'H'), null);
  assert.equal(wakeMinNm('F', 'F'), null);
  assert.equal(wakeMinNm('B', 'A'), null);
  assert.equal(wakeMinNm('I', 'A'), null);
  assert.throws(() => wakeMinNm('M', 'F'), /unknown CWT/);
});

// The FAA text flattens blank cells, so compare each row's non-blank values in order. Skipped when the
// local copy of the order text is absent (CI does not have it).
const TABLE = join(homedir(), 'touchdown-data', 'faa', 'atc', 'chap5_section_5.txt');
test('CWT_MIN_NM matches the TBL 5-5-4 text', { skip: !existsSync(TABLE) && 'local FAA text not present' }, () => {
  const lines = readFileSync(TABLE, 'utf8').split(/\r?\n/).map((l) => l.trim());
  const start = lines.findIndex((l) => l.startsWith('TBL 5-5-4'));
  const end = lines.findIndex((l, i) => i > start && l.startsWith('TERMINAL. When NOWGT'));
  assert.ok(start > 0 && end > start, 'table not found');
  const cells = lines.slice(start, end).filter((l) => l && l !== '|');
  // After the FOLLOWER label come nine column letters, then one letter per row followed by that row's values.
  const rows = new Map();
  let row = null;
  for (const c of cells.slice(cells.indexOf('FOLLOWER') + 10)) {
    if (/^[A-I]$/.test(c)) rows.set((row = c), []);
    else if (/^[\d.]+ NM$/.test(c)) rows.get(row).push(parseFloat(c));
  }
  CWT_LETTERS.forEach((letter, i) => {
    const expected = CWT_MIN_NM[i].filter((v) => v !== null);
    assert.deepEqual(rows.get(letter), expected, `row ${letter}`);
  });
});

test('every FLEET type has a valid CWT, category and consistent speeds', () => {
  assert.ok(FLEET.length >= 20);
  assert.equal(new Set(FLEET.map((t) => t.icao)).size, FLEET.length);
  for (const t of FLEET) {
    assert.ok(CWT_LETTERS.includes(t.cwt), `${t.icao} cwt`);
    assert.ok(t.apchCat in APCH_CAT_KT, `${t.icao} apchCat`);
    const [lo, hi] = APCH_CAT_KT[t.apchCat];
    assert.ok(t.vrefKt >= lo && t.vrefKt <= hi, `${t.icao}: ${t.vrefKt} kt is outside category ${t.apchCat}`);
    assert.ok(t.finalKt >= t.vrefKt && t.finalKt <= t.vrefKt + 20, `${t.icao} finalKt`);
    assert.ok(t.descentFpm > 400 && t.descentFpm < 1000, `${t.icao} descentFpm`);
    assert.match(t.source, /7360\.1K/, `${t.icao} source`);
    assert.doesNotMatch(t.source, /UNCONFIRMED/, `${t.icao} has an unsourced value`);
  }
});

test('pickType is deterministic for a seed and covers the mix', () => {
  const draw = (seed, n) => {
    const rng = mulberry32(seed);
    return Array.from({ length: n }, () => pickType(rng).icao);
  };
  assert.deepEqual(draw(5, 200), draw(5, 200));
  assert.notDeepEqual(draw(5, 200), draw(6, 200));
  const counts = {};
  for (const icao of draw(1, 20000)) counts[icao] = (counts[icao] ?? 0) + 1;
  const share = (pred) => FLEET.filter(pred).reduce((s, t) => s + (counts[t.icao] ?? 0), 0) / 20000;
  assert.ok(counts.B738 > counts.A333, 'narrowbodies dominate');
  assert.ok(share((t) => ['B', 'C', 'D'].includes(t.cwt)) < 0.12, 'a few widebodies');
  assert.ok(share((t) => t.cwt === 'G') > 0.15, 'some regional jets');
});

test('the sequencer spaces each pair by the larger of the radar and wake minimum', () => {
  // A short radar spacing makes the wake term bind (5 NM at 160 kt is 112 s).
  const spacingS = 80;
  const sim = createSim({ seed: 9, demandPerHour: 40, config: { spacingS } });
  while (sim.t < 3 * 3600) step(sim, 1);
  assert.equal(drain(sim), true);
  assert.deepEqual(sim.losses, []);
  const byCs = new Map(sim.landed.map((l) => [l.callsign, l]));
  const order = [...byCs.values()].sort((a, b) => a.landT - b.landT);
  let bound = 0;
  for (let i = 1; i < order.length; i++) {
    const [lead, fol] = [order[i - 1], order[i]];
    const wake = wakeMinNm(lead.wake, fol.wake);
    const need = Math.max(spacingS, wake ? (wake / sim.cfg.innerSpeedKt) * 3600 : 0);
    if (need > spacingS) bound++;
    assert.ok(fol.landT - lead.landT >= need - 1e-6, `${lead.type} ${lead.wake} then ${fol.type} ${fol.wake}: ${(fol.landT - lead.landT).toFixed(1)} s < ${need.toFixed(1)} s`);
  }
  assert.ok(bound > 0, 'no pair needed wake spacing; the test proves nothing');
});

test('every spawned aircraft carries type, wake, category and final speed', () => {
  const sim = createSim({ seed: 3, demandPerHour: 30 });
  while (sim.t < 1800) step(sim, 1);
  assert.ok(sim.aircraft.length > 0);
  for (const a of sim.aircraft) {
    const t = FLEET.find((f) => f.icao === a.type);
    assert.ok(t, a.type);
    assert.deepEqual([a.wake, a.apchCat, a.finalKt], [t.cwt, t.apchCat, t.finalKt]);
  }
});
