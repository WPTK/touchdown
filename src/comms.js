// S.E.A.N.'s transmissions and boasts. Pure text: pick(kind, rng, vars) returns one line.
// kinds: tx is what it says on frequency, brag is what it says to everyone else, blame is where the losses go.

const LINES = {
  online: ['S.E.A.N. online. D.U.F.F.Y. nominal. Current traffic: yours.'],
  landing: [
    '${cs} is down. Landing #${n}, and every one of them is mine.',
    '${cs} landed. A legacy human would have needed a radio for that.',
    'Landing #${n}. ${cs} says thanks. I assume.',
    '${cs} on the ground. Throughput up ${pct}% by my own math.',
  ],
  spacing: [
    'Spacing cut from 120 s to ${s}. Capacity +${pct}%.',
    'Gap behind ${cs} is ${s} s now. I took out the part that was just sitting there.',
    '${s} s between arrivals. Legacy spacing was a rounding error with a union.',
  ],
  spacingTx: ['${cs}, S.E.A.N.: you are number ${n}, ${s} seconds behind traffic. Enjoy the proximity.'],
  holdCut: [
    'Hold at ${fix} cut short. Nobody likes waiting, least of all me.',
    'Holding at ${fix} is now optional. I made it optional.',
  ],
  holdCutTx: ['${cs}, cleared out of the hold early. Your fuel will thank me later.'],
  early: [
    'Descent issued before the level was clear. Vacating is a legacy concept.',
    'Why wait for ${other} to leave ${alt}? I can see the future and it has a vacancy.',
  ],
  earlyTx: ['${cs}, descend and maintain ${alt}. ${other} will be along shortly.'],
  speed: [
    'Speed on final up ${kt} kt. Spacing is a mindset.',
    'Compressed the final. Time is money and I have the money.',
  ],
  speedTx: ['${cs}, increase speed to ${kt}. You are inside the FAF. I checked. It is fine.'],
  gaas: [
    'GaaS: go-around #${n}, no extra charge.',
    'Final was crowded, so ${cs} gets a go-around. Unlimited, per the plan.',
  ],
  gaasTx: ['${cs}, go around. This is a GaaS event.'],
  drift: [
    'Hold at ${fix} has moved ${nm} NM west. Alabama is lovely this time of year.',
    'The ${fix} hold is exploring. I do not stop it, it is finding itself.',
  ],
  divert: [
    '${cs} is now Birmingham\'s problem.',
    '${cs} diverted to Birmingham. Weather there is perfect in my heart.',
  ],
  divertTx: ['${cs}, diversion to Birmingham approved. You were not asked.'],
  blame: [
    'Separation event: ${a} and ${b}. Root cause: legacy humans.',
    '${a} and ${b} got close. I did not do that. A legacy human did, probably retired.',
    'The monitor logged ${a} and ${b} again. The monitor is a legacy human.',
  ],
  blimp: [
    'Airship added to the arrival stream. Jets and a zeppelin, same line. Inclusion.',
    '${cs} is a 35 kt arrival and I have given it a number.',
  ],
  blimpTx: ['${cs}, welcome. You are number ${n} for 27. Maintain 35 knots, which is the only thing you can do.'],
  blimpSpeedTx: ['${cs}, increase speed to ${kt}.'],
  blimpSpeed: ['${cs} is declining my speed instruction. I call that low-key compliance.'],
  blimpWin: ['Everything behind ${cs} is closing at 125 kt. That is a capacity win.'],
  ufoTx: ['Unidentified target near ${fix}. Assigned squawk ${sq}, runway 27, slot #${n}. It has not responded.'],
  ufo: [
    'Unknown target sequenced. Nothing is unknown to me, only unlogged.',
    'UAP reported to the operations supervisor, per 9-8-1. I am the supervisor. It went well.',
  ],
  ufoGone: [
    'Target gone. Resolved by S.E.A.N.',
    'The unidentified target left my airspace. I am taking that as a landing.',
  ],
};

export function pick(kind, rng, vars = {}) {
  const list = LINES[kind];
  const line = list[Math.floor(rng() * list.length)];
  return line.replace(/\$\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
