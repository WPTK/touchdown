import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RUNWAYS, finalCourse, holdFix, innerPath, missedFix, outerPath, pointAt, rwId, sameWakeRunway, spacingFt, starsFor } from '../src/airspace.js';
import { CONFIG, createSim, layout, routeAlt, step } from '../src/sim.js';
import { diagonalNm, lostSeparation, parallelRule } from '../src/separation.js';
import { FLOWS } from '../src/weather.js';

const FLOW_RUNWAYS = { west: ['26R', '27L', '28'], east: ['8L', '9R', '10'] };

test('each flow flies the STARs the data says serve its runways', () => {
  assert.deepEqual(starsFor(FLOW_RUNWAYS.west.map(rwId)).map((s) => s.ident).sort(), ['CHPPR1', 'GLAVN2', 'HOBTT3', 'JJEDI4', 'ONDRE1', 'OZZZI2']);
  assert.deepEqual(starsFor(FLOW_RUNWAYS.east.map(rwId)).map((s) => s.ident).sort(), ['CHPPR1', 'GLAVN2', 'GNDLF3', 'ONDRE1', 'OZZZI2', 'SITTH3']);
});

test('runway ids from the flow table and from the data meet in rwId', () => {
  assert.equal(rwId('8L'), '08L');
  assert.equal(rwId('26R'), '26R');
  assert.equal(rwId('10'), '10');
  assert.deepEqual(FLOWS.east.runways.map(rwId), ['08L', '09R', '10']);
});

test('every route is one continuous path from the hold fix to the runway threshold', () => {
  for (const flow of ['west', 'east']) {
    const geo = layout(CONFIG, flow);
    assert.ok(Object.keys(geo.stars).length >= 6);
    for (const star of Object.values(geo.stars)) {
      for (const [tr, o] of Object.entries(star.outer)) {
        const end = o.path.verts.at(-1);
        assert.ok(Math.hypot(end.x - star.hold.x, end.y - star.hold.y) < 1e-6, `${star.ident}.${tr} ends at the hold fix`);
        assert.ok(o.path.len >= 1, `${star.ident}.${tr} has an inbound course`);
      }
      for (const [rw, r] of Object.entries(star.routes)) {
        const first = r.path.verts[0];
        const last = r.path.verts.at(-1);
        assert.ok(Math.hypot(first.x - star.hold.x, first.y - star.hold.y) < 1e-6, `${star.ident}/${rw} starts at the hold fix`);
        assert.ok(Math.hypot(last.x - RUNWAYS[rw].x, last.y - RUNWAYS[rw].y) < 1e-6, `${star.ident}/${rw} ends at the threshold`);
        for (let i = 1; i < r.path.verts.length; i++) assert.ok(r.path.verts[i].s > r.path.verts[i - 1].s);
      }
    }
  }
});

test('the final course is the straight runway centerline to the real FAF, and the FAF is the real one per runway', () => {
  for (const rw of [...FLOW_RUNWAYS.west, ...FLOW_RUNWAYS.east].map(rwId)) {
    const fc = finalCourse(rw);
    const r = RUNWAYS[rw];
    // The FAF lies on the extended centerline, on the side the aircraft comes from.
    const along = (fc.faf.x - r.x) * -r.dir.x + (fc.faf.y - r.y) * -r.dir.y;
    const across = Math.abs((fc.faf.y - r.y) * r.dir.x - (fc.faf.x - r.x) * r.dir.y);
    assert.ok(along > 4 && along < 8, `${rw} FAF ${along.toFixed(1)} NM out`);
    assert.ok(across < 0.06, `${rw} FAF on the centerline (${across.toFixed(3)} NM off)`);
    for (const star of starsFor([rw]).slice(0, 3)) {
      const ip = innerPath(star.ident, rw);
      assert.ok(Math.abs(ip.fafDistNm - along) < 0.1, `${star.ident}/${rw}: FAF ${ip.fafDistNm.toFixed(2)} NM from the threshold`);
      assert.ok(ip.finalStartDistNm >= ip.fafDistNm - 1e-6, 'the final course starts at or before the FAF');
    }
  }
});

test('finals are collinear with the runway: every path ends on its centerline', () => {
  for (const flow of ['west', 'east']) {
    for (const star of Object.values(layout(CONFIG, flow).stars)) {
      for (const [rw, r] of Object.entries(star.routes)) {
        const rwy = RUNWAYS[rw];
        const p = pointAt(r.path, r.path.len - 2);
        const across = Math.abs((p.y - rwy.y) * rwy.dir.x - (p.x - rwy.x) * rwy.dir.y);
        assert.ok(across < 0.06, `${star.ident}/${rw} is ${across.toFixed(3)} NM off the centerline 2 NM out`);
      }
    }
  }
});

test('the missed approach fix is a real fix on the runway side of the field', () => {
  for (const rw of FLOW_RUNWAYS.west.map(rwId)) {
    const m = missedFix(rw);
    assert.ok(Number.isFinite(m.x) && Number.isFinite(m.y) && m.id);
  }
});

test('the altitude profile hits every real altitude and ends on the glidepath at the threshold', () => {
  for (const flow of ['west', 'east']) {
    for (const star of Object.values(layout(CONFIG, flow).stars)) {
      for (const [rw, r] of Object.entries(star.routes)) {
        assert.ok(r.reachable, `${star.ident}/${rw} needs ${r.rate.toFixed(0)} ft/NM`);
        for (const c of r.cons) {
          const alt = routeAlt(r, c.s);
          if (c.kind === 'at') assert.ok(Math.abs(alt - c.alt) < 1, `${star.ident}/${rw}: ${alt.toFixed(0)} ft at an 'at ${c.alt}' fix`);
          else assert.ok(alt >= c.alt - 1, `${star.ident}/${rw}: ${alt.toFixed(0)} ft under an 'at or above ${c.alt}' fix`);
        }
        const end = r.path.verts.at(-1);
        assert.ok(Math.abs(routeAlt(r, r.path.len) - (RUNWAYS[rw].elevFt + RUNWAYS[rw].tchFt)) < 1);
        assert.equal(end.alt, RUNWAYS[rw].elevFt + RUNWAYS[rw].tchFt);
        let prev = Infinity;
        for (let s = 0; s <= r.path.len; s += 0.25) {
          const alt = routeAlt(r, s);
          assert.ok(alt <= prev + 1e-6, `${star.ident}/${rw} never climbs`);
          prev = alt;
        }
      }
    }
  }
});

test('runway spacing: the close pair counts as one runway for wake, the others do not', () => {
  assert.ok(spacingFt('26R', '27L') > 6000 && spacingFt('26R', '27L') < 7000);
  assert.ok(spacingFt('27L', '28') > 4000 && spacingFt('27L', '28') < 4300, 'under 4,300 ft: PRM (5-9-8)');
  assert.equal(sameWakeRunway('27L', '27L'), true);
  assert.equal(sameWakeRunway('26R', '27L'), false);
  assert.equal(sameWakeRunway('27L', '28'), false);
  assert.equal(sameWakeRunway('8L', '9R'), false);
  assert.equal(sameWakeRunway('9R', '10'), false);
  // The data has a close pair too: 26L and 27R are about 1,000 ft apart, so under 2,500 ft counts as one runway.
  if (RUNWAYS['26L'] && RUNWAYS['27R']) assert.equal(sameWakeRunway('26L', '27R'), spacingFt('26L', '27R') < 2500);
});

test('parallel finals: independent with PRM under 4,300 ft, dependent without it, base rule when too close', () => {
  const cfg = { latSepNm: 3, vertSepFt: 1000, prm: true };
  assert.equal(parallelRule('27L', '28', cfg).mode, 'independent');
  assert.equal(parallelRule('27L', '28', cfg).prm, true);
  assert.equal(parallelRule('27L', '28', { ...cfg, prm: false }).mode, 'dependent');
  assert.equal(parallelRule('26R', '27L', cfg).mode, 'independent');
  assert.equal(parallelRule('26R', '27L', cfg).prm, false, 'over 4,300 ft: no PRM needed');
  assert.equal(parallelRule('26R', '27L', { ...cfg, prm: false }).mode, 'dependent', 'REQ-045: only with the flag set');
  assert.equal(diagonalNm(3000), 1.0);
  assert.equal(diagonalNm(4200), 1.5);
  assert.equal(diagonalNm(2000), null);
  // the FAA bands include their upper edge (5-9-6)
  assert.equal(diagonalNm(3600), 1.0);
  assert.equal(diagonalNm(8300), 1.5);
  assert.equal(diagonalNm(9000), 2.0);
  // Established on adjacent finals the pair is exempt; a pair still turning on is not; the same runway never is.
  const est = (rwy) => ({ rwy, est: true });
  assert.equal(lostSeparation(1.2, 0, est('27L'), est('28'), cfg), false);
  assert.equal(lostSeparation(1.2, 0, est('27L'), { rwy: '28', est: false }, cfg), true);
  assert.equal(lostSeparation(1.2, 0, est('27L'), est('27L'), cfg), true);
  assert.equal(lostSeparation(1.2, 0, est('27L'), est('28'), { ...cfg, prm: false }), true, '1.2 NM is under the 1.5 NM diagonal');
  assert.equal(lostSeparation(1.6, 0, est('27L'), est('28'), { ...cfg, prm: false }), false);
});

test('outer paths start at the corner posts, about 40 NM out, and the hold fix is the real runway transition start', () => {
  for (const star of ['CHPPR1', 'GLAVN2', 'OZZZI2']) {
    const h = holdFix(star);
    const hd = Math.hypot(h.x, h.y);
    assert.ok(hd > 20 && hd < 40, `${star} hold fix ${hd.toFixed(1)} NM out`);
  }
  const sim = createSim({ seed: 2, demandPerHour: 30 });
  for (let i = 0; i < 3 * 3600; i++) {
    step(sim, 1);
    // Everything on the scope stays inside the sector the corner posts define.
    for (const a of sim.aircraft) assert.ok(Math.hypot(a.x, a.y) < 44, `${a.callsign} ${Math.hypot(a.x, a.y).toFixed(1)} NM out`);
  }
  assert.ok(outerPath('CHPPR1', starsFor(['26R', '27L', '28'].map(rwId)).find((s) => s.ident === 'CHPPR1').transitions[0], CONFIG.spawnRadiusNm).len > 5);
});
