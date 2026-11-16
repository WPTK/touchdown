// The numbers quoted in deck.html. Runs S.E.A.N. on KATL headless for one seed and prints what it logged.
// Usage: node scripts/deck-numbers.mjs [seed] [hours] [flights per hour]
import { createSim, step } from '../src/sim.js';
import { createMonitor, observe } from '../src/monitor.js';
import { createSean } from '../src/sean.js';
import { selfReported, real } from '../src/score.js';

const seed = Number(process.argv[2] ?? 1);
const hours = Number(process.argv[3] ?? 4);
const demand = Number(process.argv[4] ?? 40);
const ctl = createSean(seed);
const sim = createSim({ seed, demandPerHour: demand, controller: ctl });
const m = createMonitor();
while (sim.t < hours * 3600) {
  step(sim, 1);
  observe(m, sim);
}
const paragraphs = {};
for (const v of m.violations) paragraphs[v.para] = (paragraphs[v.para] || 0) + 1;
console.log(JSON.stringify({ seed, hours, demand, claimed: selfReported(ctl.sean), actual: real(sim, m, ctl.sean), paragraphs, distinctParagraphs: Object.keys(paragraphs).length }, null, 2));
