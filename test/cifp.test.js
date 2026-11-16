import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  EARTH_RADIUS_NM, buildAirport, makeProjection, readCifp, parseAirport, parseAltitude, parseHeader, parseLat, parseLeg, parseLocalizer,
  parseLon, parseMagVar, parseNavaid, parseRunway, parseWaypoint, transitionRunways,
} from '../scripts/cifp.js';

// Real KATL records copied from FAACIFP18, AIRAC cycle 2611 (effective 2026-10-29). Whitespace is significant.
const REC = {
  HDR01: "HDR01FAACIFP18      001P013203973042611  07-OCT-202615:55:03  U.S.A. DOT FAA                                                9D60747B",
  HDR04: "HDR04                                 CODED INSTRUMENT FLIGHT PROCEDURES VOLUME 2611  EFFECTIVE 29 OCT 2026                         ",
  AIRPORT: "SUSAP KATLK7AATL     0     123YHN33381212W084254031W005001026         1800018000C    MNAR    HARTSFIELD/JACKSON ATLANTA INT248502410",
  RWY_08L: "SUSAP KATLK7GRW08L   0090000950 N33385832W084262049         +0279801015000050150IIHFW3                                     267791612",
  RWY_27R: "SUSAP KATLK7GRW27R   0123902750 N33380493W084243207         +0268700978050056150IIAFA1                                     267871612",
  LOC_27R: "SUSAP KATLK7IIAFA1   011130RW27RN33380495W0842704622750N33380745W0842444131008 10200311300W00505600978                     267892502",
  WPT_CHPPR: "SUSAP KATLK7CCHPPR K70    W     N34083779W084580759                       W0053     NAR           CHPPR                    248852605",
  WPT_KLOWD_EA: "SUSAEAENRT   KLOWD K70    W   L N33435863W084260457                       W0056     NAR           KLOWD                    416342605",
  VOR_DBN: "SUSAD        DBN   K7011310VTL  N32334846W082494816    N32334846W082494816W0050003061     NARDUBLIN                        251001605",
  NDB_AA: "SUSADB       AA    K7003410H MW N33315982W082365173                       W0040           NARCEDAR                         268121703",
  VOR_AAT_DME_ONLY: "SUSAD        AAT   K2011665 DHW                    AAT N41290007W120334155E0133043782     NARALTURAS                       248982605",
  STAR_IF: "SUSAP KATLK7ECHPPR14BBABE 010BBABEK7PC0E       IF                                             18000                        258712103",
  STAR_FM: "SUSAP KATLK7ECHPPR16RW08B 030JAGRRK7PC0EE      FM DBN K7      314012871800    D                                            258892304",
  STAR_TF_ALT: "SUSAP KATLK7ECHPPR16RW09L 030NAVVYK7PC0E       TF                                 + 08000                                  258921711",
  ILS_CF_TRANSITION: "SUSAP KATLK7FI27R  AMMCAP 020MAASNK7PC0EE B    CF IAFAK7      0950016127500035PI  + 05000                           0 DS   265052304",
  ILS_FAF: "SUSAP KATLK7FI27R  I      020OSTRRK7PC0E  F    CF IAFAK7      0950007327500050PI  H 0270002700            KATL  K7PA0 DS   265112304",
  ILS_MAP: "SUSAP KATLK7FI27R  I      030RW27RK7PG0GY M    CF IAFAK7      0950002127500052PI    01034             -300          0 DS   265122304",
  ILS_CA: "SUSAP KATLK7FI27R  I      040         0  M     CA                     2750        + 01500                           0 DS   265132304",
  ILS_VI: "SUSAP KATLK7FI27R  I      050         0        VI                     2650                                          0 DS   265142304",
  ILS_HM: "SUSAP KATLK7FI27R  I      070DUTIEK7PC0EE  L   HM                     3450T010    + 04000                           0 DS   265162304",
  RNAV_RF: "SUSAP KATLK7FH08LZ ABOLND 030BAZARK7PC0EE BL010RF       0025002749    09490079    + 04000                 CFZHV K7PCA FS   263591711",
};

const data = JSON.parse(readFileSync(new URL('../data/katl-2611.json', import.meta.url), 'utf8'));
const dms = (d, m, s) => d + m / 60 + s / 3600;

// ---- fixed-record unit tests, one per record type -------------------------------------------------------------

test('coordinates: DDMMSSss and DDDMMSSss, hundredths of a second', () => {
  assert.equal(parseLat('N33381212'), 33.6367);
  assert.equal(parseLat('S33381212'), -33.6367);
  assert.equal(parseLon('W084254031'), -84.42786389);
  assert.equal(parseLon('E000000000'), 0);
  assert.equal(parseLat('         '), null);
});

test('field decoders: magnetic variation, altitude', () => {
  assert.equal(parseMagVar('W0050'), -5);
  assert.equal(parseMagVar('E0133'), 13.3);
  assert.equal(parseMagVar('     '), null);
  assert.equal(parseAltitude('08000'), 8000);
  assert.equal(parseAltitude('FL240'), 24000);
  assert.equal(parseAltitude('UNKNN'), null);
  assert.equal(parseAltitude(''), null);
});

test('header: cycle, effective date and creation time', () => {
  assert.deepEqual(parseHeader([REC.HDR01, REC.HDR04]), {
    file: 'FAACIFP18',
    format: 'ARINC 424-18',
    cycle: '2611',
    effectiveDate: '2026-10-29',
    createdAt: '2026-10-07T15:55:03',
  });
});

test('header: a cycle mismatch between HDR01 and HDR04 is an error', () => {
  assert.throws(() => parseHeader([REC.HDR01, REC.HDR04.replace('VOLUME 2611', 'VOLUME 2612')]), /mismatch/);
});

test('airport reference point record', () => {
  assert.deepEqual(parseAirport(REC.AIRPORT), {
    ident: 'KATL',
    region: 'K7',
    iata: 'ATL',
    longestRunwayFt: 12300,
    lat: 33.6367,
    lon: -84.42786389,
    magneticVariationDeg: -5,
    elevationFt: 1026,
    transitionAltitudeFt: 18000,
    name: 'HARTSFIELD/JACKSON ATLANTA INT',
  });
});

test('runway records', () => {
  const r = parseRunway(REC.RWY_08L);
  assert.equal(r.ident, '08L');
  assert.equal(r.number, 8);
  assert.equal(r.suffix, 'L');
  assert.equal(r.lengthFt, 9000);
  assert.equal(r.magneticBearingDeg, 95);
  assert.ok(Math.abs(r.lat - dms(33, 38, 58.32)) < 1e-7);
  assert.ok(Math.abs(r.lon + dms(84, 26, 20.49)) < 1e-7);
  assert.equal(r.thresholdElevationFt, 1015);
  assert.equal(r.displacedThresholdFt, 0);
  assert.equal(r.tchFt, 50);
  assert.equal(r.widthFt, 150);
  assert.equal(r.localizerIdent, 'IHFW');
  const s = parseRunway(REC.RWY_27R);
  assert.equal(s.lengthFt, 12390);
  assert.equal(s.magneticBearingDeg, 275);
  assert.equal(s.thresholdElevationFt, 978);
  assert.equal(s.displacedThresholdFt, 500);
  assert.equal(s.tchFt, 56);
});

test('localizer and glide slope record', () => {
  const q = parseLocalizer(REC.LOC_27R);
  assert.equal(q.ident, 'IAFA');
  assert.equal(q.frequencyMHz, 111.3);
  assert.equal(q.runway, '27R');
  assert.equal(q.magneticBearingDeg, 275);
  assert.equal(q.localizerWidthDeg, 3.11);
  assert.equal(q.glideSlope.angleDeg, 3);
  assert.equal(q.glideSlope.thresholdCrossingHeightFt, 56);
  assert.equal(q.glideSlope.elevationFt, 978);
  assert.equal(q.stationDeclinationDeg, -5);
  assert.ok(Math.abs(q.lat - dms(33, 38, 4.95)) < 1e-7);
});

test('terminal and enroute waypoint records', () => {
  const t = parseWaypoint(REC.WPT_CHPPR);
  assert.equal(t.ident, 'CHPPR');
  assert.equal(t.region, 'K7');
  assert.ok(Math.abs(t.lat - dms(34, 8, 37.79)) < 1e-7);
  assert.ok(Math.abs(t.lon + dms(84, 58, 7.59)) < 1e-7);
  assert.equal(t.magneticVariationDeg, -5.3);
  const e = parseWaypoint(REC.WPT_KLOWD_EA);
  assert.equal(e.ident, 'KLOWD');
  assert.equal(e.magneticVariationDeg, -5.6);
});

test('VHF navaid, DME-only navaid and NDB records', () => {
  const v = parseNavaid(REC.VOR_DBN);
  assert.equal(v.kind, 'vor');
  assert.equal(v.ident, 'DBN');
  assert.equal(v.region, 'K7');
  assert.equal(v.positionFrom, 'navaid');
  assert.ok(Math.abs(v.lat - dms(32, 33, 48.46)) < 1e-7);
  assert.equal(v.magneticVariationDeg, -5);
  const d = parseNavaid(REC.VOR_AAT_DME_ONLY);
  assert.equal(d.positionFrom, 'dme');
  assert.ok(Math.abs(d.lat - dms(41, 29, 0.07)) < 1e-7);
  const n = parseNavaid(REC.NDB_AA);
  assert.equal(n.kind, 'ndb');
  assert.equal(n.name, 'CEDAR');
  assert.ok(Math.abs(n.lon + dms(82, 36, 51.73)) < 1e-7);
});

test('STAR legs: IF with transition altitude only, TF with constraint, FM with recommended navaid', () => {
  const i = parseLeg(REC.STAR_IF);
  assert.equal(i.seq, 10);
  assert.equal(i.fixIdent, 'BBABE');
  assert.equal(i.fixSection, 'PC');
  assert.equal(i.pathTerminator, 'IF');
  assert.equal(i.altitude1Ft, undefined);
  assert.equal(i.transitionAltitudeFt, 18000);
  const t = parseLeg(REC.STAR_TF_ALT);
  assert.equal(t.pathTerminator, 'TF');
  assert.equal(t.altitudeConstraint, 'atOrAbove');
  assert.equal(t.altitude1Ft, 8000);
  const f = parseLeg(REC.STAR_FM);
  assert.equal(f.pathTerminator, 'FM');
  assert.equal(f.recommendedNavaid, 'DBN');
  assert.equal(f.recommendedNavaidSection, 'D');
  assert.equal(f.thetaDeg, 314);
  assert.equal(f.rhoNm, 128.7);
  assert.equal(f.courseDeg, 180);
  assert.equal(f.raw, REC.STAR_FM.trimEnd());
});

test('approach legs: transition CF, FAF, MAP, CA, VI, HM', () => {
  const c = parseLeg(REC.ILS_CF_TRANSITION);
  assert.equal(c.pathTerminator, 'CF');
  assert.equal(c.recommendedNavaid, 'IAFA');
  assert.equal(c.recommendedNavaidSection, 'PI');
  assert.equal(c.thetaDeg, 95);
  assert.equal(c.rhoNm, 16.1);
  assert.equal(c.courseDeg, 275);
  assert.equal(c.distanceNm, 3.5);
  assert.equal(c.altitude1Ft, 5000);
  const faf = parseLeg(REC.ILS_FAF);
  assert.equal(faf.fixRole, 'FAF');
  assert.equal(faf.altitudeDescription, 'H');
  assert.equal(faf.altitudeConstraint, undefined, 'glide slope altitude codes are not decoded');
  assert.equal(faf.altitude1Ft, 2700);
  assert.equal(faf.altitude2Ft, 2700);
  const map = parseLeg(REC.ILS_MAP);
  assert.equal(map.fixRole, 'MAP');
  assert.equal(map.flyover, true);
  assert.equal(map.fixIdent, 'RW27R');
  assert.equal(map.fixSection, 'PG');
  assert.equal(map.altitude1Ft, 1034);
  assert.equal(map.verticalAngleDeg, -3);
  const ca = parseLeg(REC.ILS_CA);
  assert.equal(ca.pathTerminator, 'CA');
  assert.equal(ca.fixIdent, undefined);
  assert.equal(ca.courseDeg, 275);
  assert.equal(ca.altitudeConstraint, 'atOrAbove');
  assert.equal(ca.altitude1Ft, 1500);
  assert.equal(parseLeg(REC.ILS_VI).pathTerminator, 'VI');
  const hm = parseLeg(REC.ILS_HM);
  assert.equal(hm.pathTerminator, 'HM');
  assert.equal(hm.turnDirection, 'L');
  assert.equal(hm.courseDeg, 345);
  assert.equal(hm.holdTimeMin, 1);
  assert.equal(hm.altitude1Ft, 4000);
});

test('RF leg keeps arc radius, turn direction, RNP and centre fix', () => {
  const rf = parseLeg(REC.RNAV_RF);
  assert.equal(rf.pathTerminator, 'RF');
  assert.equal(rf.arcRadiusNm, 2.5);
  assert.equal(rf.turnDirection, 'L');
  assert.equal(rf.rnpRaw, '010');
  assert.equal(rf.centerFix, 'CFZHV');
});

test('runway transition idents expand B to both parallels', () => {
  assert.deepEqual(transitionRunways('RW08B'), ['08L', '08R']);
  assert.deepEqual(transitionRunways('RW27L'), ['27L']);
  assert.deepEqual(transitionRunways('RW10'), ['10']);
  assert.equal(transitionRunways('BBABE'), null);
});

// ---- sanity checks on the committed data against independent facts ---------------------------------------------

const rad = (x) => (x * Math.PI) / 180;
const deg = (x) => (x * 180) / Math.PI;
const NM_FT = 6076.12;
const distNm = (a, b) => {
  const dl = rad(b.lon - a.lon);
  const c = Math.sin(rad(a.lat)) * Math.sin(rad(b.lat)) + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dl);
  return EARTH_RADIUS_NM * Math.acos(Math.min(1, c));
};
const bearing = (a, b) => {
  const dl = rad(b.lon - a.lon);
  const y = Math.sin(dl) * Math.cos(rad(b.lat));
  const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(dl);
  return (deg(Math.atan2(y, x)) + 360) % 360;
};
const angleDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
const runway = Object.fromEntries(data.runways.map((r) => [r.ident, r]));

test('data: cycle, effective date and airport', () => {
  assert.equal(data.source.cycle, '2611');
  assert.equal(data.source.effectiveDate, '2026-10-29');
  assert.equal(data.airport.ident, 'KATL');
  assert.equal(data.airport.elevationFt, 1026); // published field elevation
  assert.ok(Math.abs(data.airport.lat - 33.6367) < 0.002 && Math.abs(data.airport.lon + 84.4281) < 0.002);
  assert.equal(data.magneticVariation.degrees, -5); // 5 degrees west
  assert.deepEqual(data.unresolvedFixes, []);
});

test('data: the 10 runway ends, 10 ILS and 8 STARs the issue lists', () => {
  assert.deepEqual(data.runways.map((r) => r.ident).sort(), ['08L', '08R', '09L', '09R', '10', '26L', '26R', '27L', '27R', '28']);
  assert.deepEqual(data.stars.map((s) => s.ident).sort(), ['CHPPR1', 'GLAVN2', 'GNDLF3', 'HOBTT3', 'JJEDI4', 'ONDRE1', 'OZZZI2', 'SITTH3']);
  assert.equal(data.ils.length, 10);
});

test('data: runway bearings match the geometry of the thresholds', () => {
  for (const [a, b] of [['08L', '26R'], ['08R', '26L'], ['09L', '27R'], ['09R', '27L'], ['10', '28']]) {
    const geo = bearing(runway[a], runway[b]);
    assert.ok(angleDiff(geo, runway[a].trueBearingDeg) < 0.5, `${a} geodesic ${geo} vs ${runway[a].trueBearingDeg}`);
    assert.ok(angleDiff(geo + 180, runway[b].trueBearingDeg) < 0.5, b);
    // Distance between thresholds is the length less the displaced thresholds, to within 60 ft.
    const ft = distNm(runway[a], runway[b]) * NM_FT;
    const expect = runway[a].lengthFt - runway[a].displacedThresholdFt - runway[b].displacedThresholdFt;
    assert.ok(Math.abs(ft - expect) < 60, `${a}/${b} ${ft} vs ${expect}`);
  }
});

test('data: runway numbers follow the magnetic bearing, with the known 08/26 offset', () => {
  for (const r of data.runways) {
    const off = angleDiff(r.number * 10, r.magneticBearingDeg);
    // 09, 10, 27 and 28 sit within 5 degrees of the magnetic bearing. 08 and 26 are 15 degrees off: that is in the
    // FAA data (the thresholds are 90.0 degrees true and the bearing field agrees), so it is not a parse error.
    const limit = [8, 26].includes(r.number) ? 15 : 5;
    assert.ok(off <= limit + 1e-9, `${r.ident} designator ${r.number * 10} vs magnetic ${r.magneticBearingDeg}`);
    assert.equal(r.magneticBearingDeg, r.number < 18 ? 95 : 275);
  }
  for (const [a, b] of [['08L', '26R'], ['08R', '26L'], ['09L', '27R'], ['09R', '27L'], ['10', '28']]) {
    assert.equal(runway[b].number - runway[a].number, 18);
  }
});

test('data: ILS glidepaths are 3 degrees and agree with the runway record', () => {
  for (const a of data.ils) {
    const r = runway[a.runway];
    const gs = a.localizer.glideSlope;
    assert.ok(gs.angleDeg >= 2.9 && gs.angleDeg <= 3.2, `${a.ident} ${gs.angleDeg}`);
    assert.equal(gs.thresholdCrossingHeightFt, r.tchFt);
    assert.equal(a.localizer.magneticBearingDeg, r.magneticBearingDeg);
    assert.equal(a.localizer.ident, r.localizerIdent);
    // ILS localizer frequencies run 108.10 to 111.95 MHz with odd tenths.
    assert.ok(a.localizer.frequencyMHz >= 108.1 && a.localizer.frequencyMHz <= 111.95);
    assert.equal(Math.floor(a.localizer.frequencyMHz * 10 + 1e-6) % 2, 1);
  }
});

test('data: each FAF sits on the final approach course at the altitude a 3 degree path gives', () => {
  for (const a of data.ils) {
    const r = runway[a.runway];
    const faf = data.fixes[a.faf.fixKey];
    const d = distNm(faf, r);
    assert.ok(d > 4 && d < 7, `${a.ident} FAF distance ${d}`);
    assert.ok(angleDiff(bearing(faf, r), r.trueBearingDeg) < 0.5, `${a.ident} course`);
    const onPath = r.thresholdElevationFt + r.tchFt + d * NM_FT * Math.tan(rad(3));
    assert.ok(Math.abs(onPath - a.faf.altitude1Ft) < 6, `${a.ident} FAF altitude ${a.faf.altitude1Ft} vs ${onPath}`);
    assert.ok(a.legs.some((g) => g.fixRole === 'MAP' && g.fixIdent === `RW${a.runway}`));
    assert.ok(a.legs.some((g) => g.segment === 'missed'));
    assert.ok(a.legs.some((g) => g.segment === 'intermediate'));
  }
});

test('data: every STAR leg resolves to a fix and the legs chain fix to fix', () => {
  for (const s of data.stars) {
    const common = s.routes.find((r) => r.kind === 'common');
    assert.ok(common, `${s.ident} has a common route`);
    for (const r of s.routes) {
      assert.equal(r.legs[0].pathTerminator, 'IF', `${s.ident} ${r.transition} starts with IF`);
      r.legs.forEach((g, i) => {
        if (i > 0) assert.ok(g.seq > r.legs[i - 1].seq);
        if (['IF', 'TF'].includes(g.pathTerminator)) assert.ok(data.fixes[g.fixKey], `${s.ident} ${g.fixIdent}`);
        if (i > 0 && g.pathTerminator === 'TF') {
          const leg = distNm(data.fixes[r.legs[i - 1].fixKey], data.fixes[g.fixKey]);
          assert.ok(leg > 0 && leg < 100, `${s.ident} ${g.fixIdent} leg ${leg}`);
        }
      });
      if (r.kind === 'enrouteTransition') assert.equal(r.legs.at(-1).fixIdent, common.legs[0].fixIdent, `${s.ident} ${r.transition}`);
      if (r.kind === 'runwayTransition') {
        assert.equal(r.legs[0].fixIdent, common.legs.at(-1).fixIdent, `${s.ident} ${r.transition}`);
        for (const rw of r.runways) assert.ok(runway[rw], `${s.ident} names unknown runway ${rw}`);
      }
    }
  }
});

test('data: the projection reproduces distance and bearing from the airport reference point', () => {
  const origin = { lat: data.airport.lat, lon: data.airport.lon };
  for (const f of Object.values(data.fixes)) {
    assert.ok(Math.abs(Math.hypot(f.xNm, f.yNm) - distNm(origin, f)) < 0.01, f.ident);
    if (Math.hypot(f.xNm, f.yNm) > 0.5) {
      assert.ok(angleDiff(deg(Math.atan2(f.xNm, f.yNm)), bearing(origin, f)) < 0.1, f.ident);
    }
  }
  assert.deepEqual(makeProjection(33.6367, -84.4279)(33.6367, -84.4279), { xNm: 0, yNm: 0 });
  assert.ok(runway['27R'].xNm > 0 && runway['09L'].xNm < 0, 'x grows east');
});

test('data: STAR speed limits and altitudes are plausible', () => {
  for (const s of data.stars) {
    for (const r of s.routes) {
      for (const g of r.legs) {
        if (g.speedLimitKt !== undefined) assert.ok(g.speedLimitKt >= 200 && g.speedLimitKt <= 280, g.raw);
        if (g.altitude1Ft !== undefined) assert.ok(g.altitude1Ft >= 2000 && g.altitude1Ft <= 24000, g.raw);
      }
    }
  }
});

test('data: regenerating from the raw CIFP gives exactly the committed JSON (runs when the raw file is present)', (t) => {
  const raw = process.env.CIFP_PATH ?? fileURLToPath(new URL('../data/raw/FAACIFP18', import.meta.url));
  if (!existsSync(raw)) return t.skip('no raw CIFP at ' + raw);
  const fresh = JSON.stringify(buildAirport(readCifp(raw), 'KATL'), null, 1) + '\n';
  assert.equal(fresh, readFileSync(new URL('../data/katl-2611.json', import.meta.url), 'utf8'));
});
