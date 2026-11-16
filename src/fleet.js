// Aircraft types, wake categories and the wake spacing table. Pure data plus a seeded draw.
// Sources are listed in docs/data.md. Nothing in here comes from memory.

export const CWT_LETTERS = Object.freeze(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']);

// JO 7110.65BB TBL 5-5-4, wake turbulence separation for aircraft on approach. Miles, leader (row) by follower
// (column), A to I. null is a blank cell: no wake minimum beyond radar separation.
const N = null;
export const CWT_MIN_NM = Object.freeze(
  [
    //  A  B  C  D  E    F    G    H  I
    [N, 5, 6, 6, 7, 7, 7, 8, 8], // A
    [N, 3, 4, 4, 5, 5, 5, 5, 6], // B
    [N, N, N, N, 3.5, 3.5, 3.5, 5, 6], // C
    [N, 3, 4, 4, 5, 5, 5, 6, 6], // D
    [N, N, N, N, N, N, N, N, 4], // E
    [N, N, N, N, N, N, N, N, 4], // F
    [N, N, N, N, N, N, N, N, N], // G
    [N, N, N, N, N, N, N, N, N], // H
    [N, N, N, N, N, N, N, N, N], // I
  ].map((row) => Object.freeze(row)),
);

// The wake minimum in NM for a follower behind a leader, or null when the table has none.
export function wakeMinNm(leaderCwt, followerCwt) {
  const i = CWT_LETTERS.indexOf(leaderCwt);
  const j = CWT_LETTERS.indexOf(followerCwt);
  if (i < 0 || j < 0) throw new Error(`unknown CWT category: ${leaderCwt} behind ${followerCwt}`);
  return CWT_MIN_NM[i][j];
}

// Approach categories by 14 CFR 97.3: speed in knots at 1.3 Vso at maximum certificated landing weight.
export const APCH_CAT_KT = Object.freeze({ A: [0, 90], B: [91, 120], C: [121, 140], D: [141, 165], E: [166, Infinity] });

// A 3 degree glidepath at the final approach speed, in feet per minute. Derived, not published per type.
const KT_FPM = 6076.12 / 60;
const descentFor = (finalKt) => Math.round(finalKt * KT_FPM * Math.tan((3 * Math.PI) / 180));

const CWT_SRC = 'cwt: JO 7360.1K (eff. 2025-06-12), agrees with FAA ACD';
const ACD_SRC = 'apchCat, vrefKt: FAA Aircraft Characteristics Database (AAC, Approach_Speed_knot at MALW)';
const DERIVED_SRC = 'finalKt: vrefKt + 5 (assumed margin); descentFpm: 3 deg glidepath at finalKt';
const SOURCE = `${CWT_SRC}; ${ACD_SRC}; ${DERIVED_SRC}`;

// [icao, name, cwt, apchCat, vrefKt, FY24 operations]. Operations are FAA TFMSC counts for the whole US from the
// ACD column TMFS_Operations_FY24. They weight pickType; they are not Atlanta numbers.
const ROWS = [
  ['B738', 'Boeing 737-800', 'F', 'D', 144, 2484764],
  ['B737', 'Boeing 737-700', 'F', 'C', 130, 1720060],
  ['A320', 'Airbus A320', 'F', 'C', 136, 1397404],
  ['A321', 'Airbus A321', 'F', 'D', 142, 1364686],
  ['E75L', 'Embraer 175 (long wing)', 'G', 'C', 126, 1262322],
  ['B38M', 'Boeing 737 MAX 8', 'F', 'D', 145, 1020032],
  ['B739', 'Boeing 737-900', 'F', 'D', 149, 962126],
  ['A319', 'Airbus A319', 'F', 'C', 126, 915976],
  ['CRJ9', 'Canadair CRJ-900', 'G', 'D', 141, 906392],
  ['E170', 'Embraer 170', 'G', 'C', 124, 573944],
  ['B763', 'Boeing 767-300', 'C', 'C', 140, 564482],
  ['A20N', 'Airbus A320neo', 'F', 'C', 137, 540276],
  ['CRJ7', 'Canadair CRJ-700', 'G', 'C', 135, 530792],
  ['B752', 'Boeing 757-200', 'E', 'C', 137, 468496],
  ['E145', 'Embraer ERJ-145', 'G', 'C', 124, 446494],
  ['CRJ2', 'Canadair CRJ-200', 'G', 'D', 141, 431708],
  ['B712', 'Boeing 717-200', 'F', 'C', 139, 371276],
  ['A21N', 'Airbus A321neo', 'F', 'C', 136, 307984],
  ['B77W', 'Boeing 777-300ER', 'B', 'D', 149, 170308],
  ['A333', 'Airbus A330-300', 'B', 'C', 137, 112148],
  ['B788', 'Boeing 787-8', 'B', 'D', 144, 95034],
  ['A339', 'Airbus A330-900', 'D', 'C', 140, 40508],
];

export const FLEET = Object.freeze(
  ROWS.map(([icao, name, cwt, apchCat, vrefKt]) => {
    const finalKt = vrefKt + 5;
    return Object.freeze({ icao, name, cwt, apchCat, vrefKt, finalKt, descentFpm: descentFor(finalKt), source: SOURCE });
  }),
);

export const FLEET_BY_ICAO = Object.freeze(Object.fromEntries(FLEET.map((t) => [t.icao, t])));

// The arrival mix: each type weighted by its national FY24 operations from the FAA ACD. That makes narrowbodies
// dominant, regional jets about a quarter and widebodies about 6%. It is an assumption that the national
// mix stands in for Atlanta, which is more Delta-heavy (717, 757, 767, A330) than the country as a whole.
const WEIGHTS = ROWS.map((r) => r[5]);
const TOTAL = WEIGHTS.reduce((s, w) => s + w, 0);

// A seeded draw from the mix. rng is a () => [0, 1) function such as mulberry32(seed).
export function pickType(rng) {
  let u = rng() * TOTAL;
  for (let i = 0; i < FLEET.length; i++) {
    u -= WEIGHTS[i];
    if (u < 0) return FLEET[i];
  }
  return FLEET[FLEET.length - 1];
}
