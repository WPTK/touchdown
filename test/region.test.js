import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildAirport, readCifp } from '../scripts/cifp.js';
import { parseArb, parseArbCoord } from '../scripts/artcc.js';
import { centerAt } from '../scripts/region.js';

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const clt = json('../data/kclt-2611.json');
const artcc = json('../data/artcc-2611.json');
const region = json('../data/region-2611.json');
const NM_FT = 6076.12;
const rad = (d) => (d * Math.PI) / 180;

test('KCLT: generated from the same cycle with nothing unresolved', () => {
  assert.equal(clt.source.cycle, '2611');
  assert.equal(clt.source.airport, 'KCLT');
  assert.deepEqual(clt.unresolvedFixes, []);
  assert.equal(clt.runways.length, 6);
  assert.equal(clt.ils.length, 6);
  for (const r of clt.runways) assert.ok(r.trueBearingDeg >= 0 && r.trueBearingDeg < 360, `${r.ident} ${r.trueBearingDeg}`);
});

test('KCLT: each FAF sits on the final course at the altitude a 3 degree path gives', () => {
  for (const a of clt.ils) {
    const r = clt.runways.find((x) => x.ident === a.runway);
    const f = clt.fixes[a.faf.fixKey];
    const d = Math.hypot(f.xNm - r.xNm, f.yNm - r.yNm);
    assert.ok(d > 4 && d < 7, `${a.ident} FAF distance ${d}`);
    const onPath = r.thresholdElevationFt + r.tchFt + d * NM_FT * Math.tan(rad(3));
    assert.ok(Math.abs(onPath - a.faf.altitude1Ft) < 8, `${a.ident} FAF altitude ${a.faf.altitude1Ft} vs ${onPath}`);
  }
});

test('KCLT: the raw CIFP regenerates the file byte for byte (skipped without the raw file)', { skip: !existsSync(new URL('../data/raw/FAACIFP18', import.meta.url)) }, () => {
  const again = buildAirport(readCifp(new URL('../data/raw/FAACIFP18', import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), 'KCLT');
  assert.equal(`${JSON.stringify(again, null, 1)}\n`, readFileSync(new URL('../data/kclt-2611.json', import.meta.url), 'utf8'));
});

test('ARB: coordinates, closed shapes, and only straight segments', () => {
  assert.ok(Math.abs(parseArbCoord('035-46-00.0N') - 35.76667) < 1e-4);
  assert.ok(Math.abs(parseArbCoord('085-24-00.0W') + 85.4) < 1e-4);
  const rec = (n, lat, lon, desc) => `ZTL *H*${n}`.padEnd(12) + 'ATLANTA'.padEnd(40) + 'HIGH'.padEnd(10) + lat.padEnd(14) + lon.padEnd(14) + desc.padEnd(300) + '000100 ';
  const text = [rec('00001', '35-00-00.0N', '085-00-00.0W', 'TO'), rec('00002', '35-00-00.0N', '084-00-00.0W', 'TO'), rec('00003', '36-00-00.0N', '084-00-00.0W', 'TO POINT OF BEGINNING.')].join('\n');
  assert.equal(parseArb(text).ZTL.H.length, 1);
  assert.equal(parseArb(text).ZTL.H[0].length, 3);
});

test('artcc: five centres, each one closed shape or more, projected in the KATL frame', () => {
  assert.deepEqual(Object.keys(artcc.centers).sort(), ['ZDC', 'ZID', 'ZJX', 'ZME', 'ZTL']);
  for (const c of Object.values(artcc.centers)) {
    assert.ok(c.shapes.length >= 1);
    for (const s of c.shapes) assert.ok(s.length >= 3 && s.every((p) => Number.isFinite(p.xNm) && Number.isFinite(p.yNm)));
  }
});

test('region: KATL and KCLT are the large hubs inside ZTL, and no third one is', () => {
  const inZtl = region.airports.filter((a) => a.artcc === 'ZTL');
  assert.deepEqual(inZtl.filter((a) => a.hub === 'L').map((a) => a.ident).sort(), ['KATL', 'KCLT']);
  for (const id of ['KPDK', 'KBHM']) assert.ok(inZtl.some((a) => a.ident === id), id);
  // The other large hubs in the neighbouring centres are not ZTL's to run.
  assert.equal(region.airports.find((a) => a.ident === 'KBNA').artcc, 'ZME');
  assert.equal(region.airports.find((a) => a.ident === 'KTPA').artcc, 'ZJX');
});

test('region: the boundary test puts the two hubs in ZTL and a point far away in nothing', () => {
  const katl = region.airports.find((a) => a.ident === 'KATL');
  assert.equal(centerAt(artcc, katl.xNm, katl.yNm), 'ZTL');
  assert.equal(centerAt(artcc, 5000, 5000), null);
});
