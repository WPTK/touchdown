// Runs a sim with the monitor watching, so a test can ask the one place that decides about losses.
import { setDemand, step } from '../src/sim.js';
import { createMonitor, observe, PARA } from '../src/monitor.js';

export function stepWatched(sim, m, until) {
  while (sim.t < until) {
    step(sim, 1);
    observe(m, sim);
  }
}

// Steps to `hours`, then drains with the monitor still watching. Returns true when everything came down.
export function runWatched(sim, hours, m = createMonitor()) {
  stepWatched(sim, m, hours * 3600);
  setDemand(sim, 0);
  sim.draining = true;
  const maxT = sim.t + 12 * 3600;
  while ((sim.upstream.length || sim.aircraft.length) && sim.t < maxT) {
    step(sim, 1);
    observe(m, sim);
  }
  return { m, drained: sim.upstream.length === 0 && sim.aircraft.length === 0 };
}

export const losses = (m) => m.violations.filter((v) => v.para === PARA.SEP);
