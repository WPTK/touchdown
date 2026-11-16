// The one place that decides whether two aircraft have lost separation. The safe sequencer plans against it and the
// monitor judges with it, so they can never disagree.
//
// The base rule is 5-5-4 / 4-5-1: lateral minimum (3 NM here) or vertical minimum (1,000 ft). On parallel finals the
// text swaps it for the parallel-approach rules once both aircraft are established on their final approach courses:
//   - with the sim's PRM/FMA flag set (`cfg.prm`) a pair 3,600 ft or more apart runs simultaneous independent (5-9-7), and
//     under 4,300 ft that needs PRM (5-9-8): no separation is applied between the two finals (the NTZ is not modelled);
//   - without the flag it is dependent (5-9-6): a diagonal minimum of 1.0 NM (2,500 to 3,600 ft), 1.5 NM (3,600 to 8,300 ft)
//     or 2.0 NM (8,300 to 9,000 ft). Whether ATL is authorized for triple simultaneous approaches is UNCONFIRMED
//     (docs/research/faa-rules-deep.md, REQ-045), so the flag is a config choice and on by default;
//   - under 2,500 ft apart it is none of those, and the base rule applies (5-5-4 notes: a single runway for wake).
// Until both are established (the turn-on), the base rule applies.
import { PRM_BELOW_FT, spacingFt } from './airspace.js';

const EPS = 1e-6;

// 5-9-6 diagonal minimum on adjacent finals, by centerline spacing in feet. null under 2,500 ft.
export function diagonalNm(ft) {
  if (ft < 2500) return null;
  if (ft < 3600) return 1.0;
  if (ft < 8300) return 1.5;
  if (ft < 9000) return 2.0;
  return 0; // over 9,000 ft: widely spaced (5-9-10), no minimum between the finals
}

// How two established aircraft on different runways are judged: 'independent', 'dependent' (with .diagNm), or 'base'.
export function parallelRule(rwyA, rwyB, cfg) {
  const ft = spacingFt(rwyA, rwyB);
  if (ft < 2500) return { mode: 'base' };
  if (ft > 9000) return { mode: 'independent', ft };
  if (ft >= 3600 && cfg.prm) return { mode: 'independent', ft, prm: ft < PRM_BELOW_FT };
  return { mode: 'dependent', ft, diagNm: diagonalNm(ft) };
}

// a and b: { rwy, est } where est means established on the final approach course. margins are the probe's extra room.
export function lostSeparation(dh, dv, a, b, cfg, marginNm = 0, marginFt = 0) {
  if (dh >= cfg.latSepNm + marginNm - EPS || dv >= cfg.vertSepFt + marginFt - EPS) return false;
  if (a.est && b.est && a.rwy !== b.rwy) {
    const rule = parallelRule(a.rwy, b.rwy, cfg);
    if (rule.mode === 'independent') return false;
    if (rule.mode === 'dependent') return dh < rule.diagNm + marginNm - EPS;
  }
  return true;
}

// For the page: how close a pair is to the minimum that applies to it. 1 is exactly at minimum. Infinity when no
// lateral or vertical minimum is applied between the two.
export function pairMargin(dh, dv, a, b, cfg) {
  if (a.est && b.est && a.rwy !== b.rwy) {
    const rule = parallelRule(a.rwy, b.rwy, cfg);
    if (rule.mode === 'independent') return Infinity;
    if (rule.mode === 'dependent') return dh / Math.max(rule.diagNm, EPS);
  }
  return Math.max(dh / cfg.latSepNm, dv / cfg.vertSepFt);
}
