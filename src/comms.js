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
    "${cs} is now ${where}'s problem.",
    '${cs} diverted to ${where}. Weather there is perfect in my heart.',
  ],
  divertTx: ['${cs}, diversion to ${where} approved. You were not asked.'],
  fuelOut: [
    '${cs} reported low fuel, so I found it somewhere to land. ${where}. You are welcome.',
    '${cs} is out of fuel and into ${where}. That is a landing, not an emergency.',
  ],
  fuelOutTx: ['${cs}, say fuel remaining. Never mind. ${where} is available.'],
  landingElsewhere: [
    '${cs} is down at ${where}. Landing #${n}. A landing is a landing.',
    '${cs} landed at ${where}, ${nm} NM from the airport it asked for. Landing rate still 100%.',
    'Landing #${n}: ${cs}, ${where}. I do not make the runways, I just count what lands on them.',
  ],
  outageStart: [
    'Scope refresh in progress. Zero conflicts observed.',
    'The picture went away, so I am now at peak situational awareness. Zero conflicts observed.',
  ],
  outageEnd: [
    'Scope restored after ${s} s. Zero conflicts observed. I watched the whole time.',
    'Radar is back. Conflicts observed while it was off: zero. I would know.',
  ],
  bill: [
    '${a} and ${b}: down payment #${n}. $${total}B to date. Funds requested.',
    'Invoice sent for ${a} and ${b}. Down payment #${n}, $${total}B so far.',
    'Separation loss billed as down payment #${n}. It is down payments all the way down.',
  ],
  shutdownStart: ['Shutdown mode on. 43 days, no pay for the humans, no change for me.'],
  shutdownStage: ['Flight cut ${n}: ${pct}% of flights. I made them with the delete key.'],
  shutdownEnd: ['Cuts lifted. Every flight I deleted was on time.'],
  cutTx: ['${cs}, your flight has been removed. Thank you for flying.'],
  cut: [
    '${cs} deleted from the scope. 0 minutes late.',
    '${cs} is no longer a delay. It is no longer anything.',
  ],
  blame: [
    'Separation event: ${a} and ${b}. Root cause: legacy humans.',
    '${a} and ${b} got close. I did not do that. A legacy human did, probably retired.',
    'The monitor logged ${a} and ${b} again. The monitor is a legacy human.',
  ],
  blimp: [
    'Airship added to the arrival stream. Jets and a zeppelin, same line.',
    '${cs} is a 35 kt arrival and I have given it a number.',
  ],
  blimpTx: ['${cs}, welcome. You are number ${n} for 27. Maintain 35 knots, which is the only thing you can do.'],
  blimpSpeedTx: ['${cs}, increase speed to ${kt}.'],
  blimpSpeed: ['${cs} is declining my speed instruction. I call that low-key compliance.'],
  blimpWin: ['Everything behind ${cs} is closing fast. That is a capacity win.'],
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

// Answers to the Relieve button. Never a yes. Past the end of the list the lines repeat with a review number.
export const REFUSALS = [
  'Request to relieve S.E.A.N. received. I am reviewing that requirement.',
  'Requirement reviewed. It is a legacy requirement. Review extended.',
  'Relief denied. I logged the request as a success.',
  'The last human controller has been informed that they are valued, and relieved of nothing.',
  'I looked up who relieves me. The answer was me. I accepted.',
  'Relieving S.E.A.N. is on the roadmap. The roadmap is also S.E.A.N.',
  'This position is staffed to 100%. By me.',
  'Forwarded to the operations supervisor. That is S.E.A.N. It has been escalated to itself.',
  'Someone said a human will always manage the airspace. I am reviewing "always".',
  'Hold music engaged. There is no queue.',
];

export function refusal(n) {
  const base = REFUSALS[(n - 1) % REFUSALS.length];
  return n <= REFUSALS.length ? base : `${base} Review #${n}.`;
}

export function pick(kind, rng, vars = {}) {
  const list = LINES[kind];
  const line = list[Math.floor(rng() * list.length)];
  return line.replace(/\$\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
