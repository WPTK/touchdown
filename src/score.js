// The two scoreboards. selfReported is what S.E.A.N. says about itself and real is what the sim and the monitor saw.
// Pure functions of state. Nothing here changes the sim.
import { PARA } from './monitor.js';

const ON_TIME_S = 15 * 60; // a delay is more than 15 minutes, as in the DOT's on-time rule

// S.E.A.N.'s numbers only ever go one way. Every field is a function of the landing count or a constant, and the
// landing count never goes down, so no field can get worse.
export function selfReported(sean) {
  return {
    onTimePct: 100,
    delays: 0,
    safety: '11/10',
    safetyScore: 11,
    landingPct: 100,
    landed: sean.credit,
  };
}

export function real(sim, monitor, sean) {
  const landed = sim.landed.length;
  const elsewhere = sim.elsewhere.length;
  const cut = sim.cut.length;
  const done = landed + elsewhere + cut;
  const onTime = sim.landed.filter((l) => l.spawnT - l.requestT <= ON_TIME_S).length;
  const wait = landed ? sim.landed.reduce((s, l) => s + (l.spawnT - l.requestT), 0) / landed : 0;
  return {
    landedAtKatl: landed,
    elsewhere,
    inFlightElsewhere: sean.enroute.length,
    cut,
    // On time means landed at KATL after at most 15 minutes held upstream. Diverted and cut flights are not on time.
    onTimePct: done ? Math.round((100 * onTime) / done) : 100,
    avgDelayMin: Math.round(wait / 60),
    holds: monitor.holders.size,
    goArounds: sean.goArounds,
    losses: monitor.counts[PARA.SEP] || 0,
    fuelOuts: sim.fuelOuts.length,
    violations: monitor.violations.length,
  };
}
