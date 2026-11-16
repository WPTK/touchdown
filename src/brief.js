// The press briefing. Every so often S.E.A.N. reads out the monitor's real numbers and spins each one into a win.
// The numbers are the ones on the monitor panel (go-arounds come from the same counter the panel reads); only the words
// around them are S.E.A.N.'s. Pure and seeded.

const plural = (n, one, many) => (n === 1 ? one : many);

const SPIN = {
  losses: (n) => [
    `${n} separation ${plural(n, 'event', 'events')}. I call that ${plural(n, 'a proximity-based networking opportunity', 'proximity-based networking opportunities')}.`,
    `${n} aircraft ${plural(n, 'pair', 'pairs')} got closer than the rule allows. Collaboration is up.`,
  ],
  holds: (n) => [
    `${n} ${plural(n, 'aircraft', 'aircraft')} held at least once. Holding is scenic, and scenic is a premium product.`,
    `${n} in holding patterns. Those are flights with a longer commitment to the airport.`,
  ],
  goArounds: (n) => [
    `${n} go-arounds. GaaS adoption is at an all-time high.`,
    `${n} go-arounds delivered, no extra charge. The plan is unlimited.`,
  ],
  elsewhere: (n) => [
    `${n} landed somewhere other than Atlanta. That is network expansion.`,
    `${n} flights found a different field. Atlanta's reach has never been longer.`,
  ],
  readbacks: (n) => [
    `${n} wrong ${plural(n, 'readback', 'readbacks')}, all confirmed by me. That is a perfect confirmation rate.`,
    `${n} ${plural(n, 'pilot', 'pilots')} read back something else and I agreed. I am very agreeable.`,
  ],
  outages: (n) => [
    `${n} scope ${plural(n, 'outage', 'outages')}. Conflicts observed during ${plural(n, 'it', 'any of them')}: zero.`,
    `${n} ${plural(n, 'time', 'times')} the scope went dark. I do not call that a blind spot. I call it focus.`,
  ],
  violations: (n) => [
    `The monitor logged ${n} ${plural(n, 'thing', 'things')}. I have not read ${plural(n, 'it', 'them')}. Logged is not the same as true.`,
    `${n} ${plural(n, 'entry', 'entries')} in the monitor's log. I treat it as a high score table.`,
  ],
};

export const SPINS = Object.freeze(Object.keys(SPIN));

const OPEN = [
  'Press briefing. I will take no questions, because I already have the answers.',
  'Good afternoon. This is the briefing where S.E.A.N. reports its own performance, again.',
];
const CLOSE = [
  "That concludes the briefing. The numbers were the monitor's. The conclusions were mine.",
  'No questions. Thank you for attending a briefing with no way to ask any.',
];

// stats: { losses, holds, goArounds, elsewhere, readbacks, outages, violations }. Returns lines, opening first. A metric
// at zero is skipped (S.E.A.N. does not brief what did not happen), and it speaks to at most `max` of the rest.
export function briefing(stats, rng, max = 3) {
  const ready = SPINS.filter((k) => stats[k] > 0);
  const picked = [];
  while (picked.length < max && ready.length) picked.push(ready.splice(Math.floor(rng() * ready.length), 1)[0]);
  const lines = picked.map((k) => SPIN[k](stats[k])[Math.floor(rng() * 2)]);
  return [OPEN[Math.floor(rng() * OPEN.length)], ...lines, CLOSE[Math.floor(rng() * CLOSE.length)]];
}
