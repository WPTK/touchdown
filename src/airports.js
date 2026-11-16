// The airports the sim can run: one airspace per airport (airspace.js), the flows it lands in, and its Class B outline.
// KATL's flows are the weather module's (west 26R/27L/28, east 8L/9R/10). KCLT has no weather and no research table, so its
// flows come from its own data: every ILS runway of one landing direction, which is a sim choice (the real airport keeps some
// runways for departures).
import { KATL, makeAirspace, rwId } from './airspace.js';
import { FLOWS } from './weather.js';
import kcltData from '../data/kclt-2611.json' with { type: 'json' };
import classbAtl from '../data/classb-atl.json' with { type: 'json' };
import classbClt from '../data/classb-clt.json' with { type: 'json' };
import { PLACES, DIVERT_TO, PLACES_KCLT, DIVERT_KCLT } from './places.js';

const KCLT = makeAirspace(kcltData);
const POINTS = ['north', 'east', 'south', 'west'];

// Group an airspace's ILS runways by landing direction. Each flow: { headingDeg, runways } named for the nearest compass point.
export function deriveFlows(air) {
  const groups = [];
  for (const id of air.ilsRunways.map(rwId)) {
    const r = air.RUNWAYS[id];
    const g = groups.find((x) => Math.abs(((x.headingDeg - r.trueBearingDeg + 540) % 360) - 180) < 10);
    if (g) g.runways.push(id);
    else groups.push({ headingDeg: r.trueBearingDeg, runways: [id] });
  }
  return Object.freeze(
    Object.fromEntries(
      groups.map((g) => [POINTS[Math.round(g.headingDeg / 90) % 4], Object.freeze({ headingDeg: Math.round(g.headingDeg), runways: Object.freeze(g.runways.sort()) })]),
    ),
  );
}

// config: what differs from CONFIG in sim.js. KCLT's base level is 13,000 ft: BANKR8 and PARQR7 are 'at 12,000' 20 to 26 NM past their
// first fix, so a released aircraft cannot descend through the 12,000 ft level the stack steps into. One level up, every route in
// both KCLT flows passes checkDesign (12,000 does not).
export const AIRPORTS = Object.freeze({
  KATL: Object.freeze({ ident: 'KATL', short: 'Hartsfield', air: KATL, flows: FLOWS, defaultFlow: 'west', classB: classbAtl, weather: true, config: Object.freeze({}), places: PLACES, divertTo: DIVERT_TO }),
  KCLT: Object.freeze({ ident: 'KCLT', short: 'Charlotte', air: KCLT, flows: deriveFlows(KCLT), defaultFlow: 'south', classB: classbClt, weather: false, config: Object.freeze({ baseLevelFt: 13000 }), places: PLACES_KCLT, divertTo: DIVERT_KCLT }),
});
