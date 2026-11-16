// Phraseology against the examples quoted in JO 7110.65 (2-4-17 numbers usage, 4-6-1, 4-8-1, 5-7-2, 3-10-5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  altimeter, altitude, callsign, digits, flightLevel, frequency, heading, misread, readback, render, runway, speed, speedTo,
  spokenVars, squawk, stepOn, utc, wind, KINDS,
} from '../src/phrase.js';

const cases = (fn, rows) => {
  for (const [input, want] of rows) assert.equal(fn(input), want, `${input}`);
};

test('serial numbers are separate digits, and 9 is niner (2-4-17)', () => {
  cases(digits, [
    [11495, 'one one four niner five'],
    [20069, 'two zero zero six niner'],
    ['11,495', 'one one four niner five'],
  ]);
});

test('altitudes: the digits of the thousands, then the hundreds (2-4-17)', () => {
  cases(altitude, [
    [10000, 'one zero thousand'],
    [11000, 'one one thousand'],
    [17900, 'one seven thousand niner hundred'],
    [3000, 'three thousand'],
    [2500, 'two thousand five hundred'],
    [900, 'niner hundred'],
  ]);
  cases(flightLevel, [[180, 'flight level one eight zero'], [275, 'flight level two seven five']]);
});

test('headings are three digits and north is 360 (2-4-17)', () => {
  cases(heading, [
    [5, 'heading zero zero five'],
    [30, 'heading zero three zero'],
    [360, 'heading three six zero'],
    [0, 'heading three six zero'],
  ]);
});

test('speeds, runways, frequencies, codes, altimeters, winds and times (2-4-17)', () => {
  cases(speed, [[250, 'two five zero knots'], [190, 'one niner zero knots']]);
  cases(runway, [[3, 'runway three'], ['8L', 'runway eight left'], ['27R', 'runway two seven right'], ['28', 'runway two eight'], ['9C', 'runway niner center']]);
  cases(frequency, [['126.55', 'one two six point five five'], ['369.0', 'three six niner point zero'], ['121.5', 'one two one point five'], ['135.275', 'one three five point two seven']]);
  cases(squawk, [[1000, 'one zero zero zero'], [2100, 'two one zero zero'], ['0123', 'zero one two three']]);
  cases(altimeter, [[30.01, 'altimeter three zero zero one'], [29.92, 'altimeter two niner niner two']]);
  assert.equal(wind(270, 15, 35), 'wind two seven zero at one five gusts three five');
  assert.equal(wind(30, 25), 'wind zero three zero at two five');
  assert.equal(wind(274, 9), 'wind two seven zero at niner');
  cases(utc, [['0715', 'zero seven one five'], ['1915', 'one niner one five']]);
});

test('call signs are the airline word and the separate digits', () => {
  assert.equal(callsign('PEACH412'), 'Peach four one two');
  assert.equal(callsign('OKRA9000'), 'Okra niner zero zero zero');
  assert.equal(callsign('ZPL1'), 'Zpl one');
});

test('the clearances use the order\'s own phraseology', () => {
  // 5-7-2: "Reduce speed to two five zero."
  assert.equal(render({ kind: 'speed', cs: 'PEACH412', kt: 250, up: false }), 'Peach four one two, reduce speed to two five zero.');
  assert.equal(speedTo(190), 'one niner zero');
  // 4-8-1: "At RDFSH, Cleared ILS Runway 27 Approach."
  assert.equal(render({ kind: 'approach', cs: 'GRITS100', fix: 'RDFSH', rwy: '27' }), 'Grits one zero zero, at RDFSH, cleared ILS runway two seven approach.');
  // 3-10-5: "Runway 7 Left, cleared to land" (runway first, then the clearance).
  assert.equal(render({ kind: 'land', cs: 'KUDZU7', rwy: '7L' }), 'Kudzu seven, runway seven left, cleared to land.');
  // 4-6-1: "Cleared to (fix), hold as published", with an EFC time, and "no delay expected".
  assert.equal(
    render({ kind: 'hold', cs: 'PECAN55', fix: 'SWEET', efc: '1920' }),
    'Pecan five five, cleared to SWEET, hold as published, expect further clearance one niner two zero.',
  );
  assert.equal(render({ kind: 'noDelay', cs: 'PECAN55', fix: 'SWEET' }), 'Pecan five five, cleared to SWEET, no delay expected.');
  // 5-6-1: "Fly heading (degrees)."
  assert.equal(render({ kind: 'heading', cs: 'OKRA8', deg: 90 }), 'Okra eight, fly heading zero niner zero.');
  assert.equal(render({ kind: 'descend', cs: 'PEACH412', alt: 11000 }), 'Peach four one two, descend and maintain one one thousand.');
});

test('a readback is the items and then the call sign (2-4-3)', () => {
  const c = { kind: 'descend', cs: 'PEACH412', alt: 11000 };
  assert.equal(readback(c), 'Descending one one thousand, Peach four one two.');
  assert.equal(readback({ kind: 'land', cs: 'KUDZU7', rwy: '27L' }), 'Runway two seven left, cleared to land, Kudzu seven.');
  assert.equal(readback({ kind: 'speed', cs: 'OKRA8', kt: 250 }), 'Two five zero, Okra eight.');
});

test('every clearance kind renders and reads back with its call sign', () => {
  const sample = { cs: 'GRITS12', alt: 5000, kt: 200, deg: 270, fix: 'SWEET', efc: '1200', rwy: '26R', up: true };
  for (const kind of KINDS) {
    const c = { ...sample, kind };
    assert.match(render(c), /^Grits one two, /, kind);
    assert.match(readback(c), /, Grits one two\.$/, kind);
  }
});

test('a misread changes exactly one number, and the two texts differ', () => {
  const rng = () => 0.1;
  for (const c of [
    { kind: 'descend', cs: 'A1', alt: 11000 },
    { kind: 'speed', cs: 'A1', kt: 210 },
    { kind: 'heading', cs: 'A1', deg: 270 },
    { kind: 'approach', cs: 'A1', fix: 'X', rwy: '26R' },
    { kind: 'land', cs: 'A1', rwy: '27L' },
    { kind: 'hold', cs: 'A1', fix: 'X', efc: '1200' },
  ]) {
    const bad = misread(c, rng);
    assert.ok(bad, c.kind);
    assert.notEqual(readback(bad), readback(c), c.kind);
  }
  assert.equal(misread({ kind: 'goAround', cs: 'A1' }, rng), null);
  assert.equal(misread({ kind: 'land', cs: 'A1', rwy: '28' }, rng), null, 'no letter, nothing to swap');
});

test('a stepped-on transmission loses words in the middle and keeps its start', () => {
  const text = 'Peach four one two, descend and maintain one one thousand.';
  const out = stepOn(text, () => 0.5);
  assert.match(out, /^Peach .*\[blocked\]/);
  assert.ok(out.split(' ').length <= text.split(' ').length + 1);
  assert.equal(stepOn('Roger.', () => 0.5), '[blocked]');
});

test('transmission variables are spoken: call sign, altitude, speed and code in words', () => {
  const v = spokenVars({ cs: 'PEACH412', alt: 11000, kt: 180, sq: 1234, n: 3, where: 'Birmingham' });
  assert.deepEqual(v, { cs: 'Peach four one two', alt: 'one one thousand', kt: 'one eight zero', sq: 'one two three four', n: 'three', where: 'Birmingham' });
});
