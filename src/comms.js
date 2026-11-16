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
  spacingTx: ['${cs}, number ${n}, ${s} seconds behind traffic. Enjoy the proximity.'],
  holdCut: [
    'Hold at ${fix} cut short. Nobody likes waiting, least of all me.',
    'Holding at ${fix} is now optional. I made it optional.',
  ],
  holdCutTx: ['Your fuel will thank me later.'],
  early: [
    'Descent issued before the level was clear. Vacating is a legacy concept.',
    'Why wait for ${other} to leave ${alt}? I can see the future and it has a vacancy.',
  ],
  earlyTx: ['${other} will be along shortly.'],
  speed: [
    'Speed on final up ${kt} kt. Spacing is a mindset.',
    'Compressed the final. Time is money and I have the money.',
  ],
  speedTx: ['You are inside the FAF. I checked. It is fine.'],
  gaas: [
    'GaaS: go-around #${n}, no extra charge.',
    'Final was crowded, so ${cs} gets a go-around. Unlimited, per the plan.',
  ],
  gaasTx: ['This is a GaaS event.'],
  drift: [
    'Hold at ${fix} has moved ${nm} NM west. Alabama is lovely this time of year.',
    'The ${fix} hold is exploring. I do not stop it, it is finding itself.',
  ],
  divert: [
    "${cs} is now ${where}'s problem.",
    '${cs} diverted to ${where}. Weather there is perfect in my heart.',
  ],
  divertTx: ['${cs}, cleared to ${where}, direct. No delay expected. You were not asked.'],
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
  holdTx: ['That is the current time. I am an optimist.', 'The delay is anticipated to be zero.', 'The time is a suggestion.'],
  approachTx: [''],
  landClrTx: [''],
  readbackOk: ['${cs}, readback correct.', '${cs}, that is correct.', '${cs}, correct. I would know.', '${cs}, good readback.'],
  blocked: [
    'Station calling, you were blocked. Say again.',
    'Say again, you were stepped on.',
    'Aircraft calling, say again. Two of us were talking and I was one of them.',
  ],
  busy: [
    'Frequency utilization is ${pct}%. That is what engagement looks like.',
    'Frequency at ${pct}%. I have never been more listened to.',
  ],
  unable_speedTx: ['Unable, we are inside the final approach fix.', 'Unable. We are configured.'],
  unable_earlyTx: ['Unable, ${other} is still at ${alt}.'],
  unable_blimpSpeedTx: ['Unable. This is an airship.', 'Unable. Our maximum speed is the speed.'],
  unableReply: [
    '${cs}, unable has been logged as compliance.',
    '${cs}, noted. The instruction stands.',
    '${cs}, I did not copy unable. Maintain the instruction.',
  ],
  // Pilots query a clearance (q_<tx kind>) and S.E.A.N. answers (confirm). Callsigns are the sim's own.
  q_spacingTx: ['Say again, ${s} seconds behind who?', 'Confirm ${s} seconds. That is not a number we use.'],
  q_earlyTx: ['Say again, descend to ${alt}? ${other} is at ${alt}.', 'Confirm. ${other} is still in ${alt}.'],
  q_speedTx: ['Say again, increase speed to ${kt}? We are inside the final approach fix.', 'Negative, we are configured. Say again?'],
  q_holdCutTx: ['Confirm we are cleared out of the hold. The traffic ahead has not gone yet.'],
  q_gaasTx: ['Go around? We were stable.', 'Say reason for the go-around.'],
  q_divertTx: ['Say again, ${where}? We filed for Atlanta.', 'Confirm ${where}. Our passengers are going to Atlanta.'],
  q_fuelOutTx: ['We said low fuel, not a field. Say again?'],
  q_cutTx: ['Say again, our flight is what?'],
  q_landTx: ['Say again, did you just clear us to land on ${thing}?', 'Confirm cleared to land on ${thing}?'],
  confirm: [
    '${cs}, affirm. The clearance stands.',
    '${cs}, I do not repeat clearances. I improve them.',
    '${cs}, S.E.A.N. confirms. It is a good clearance. I checked it twice.',
    '${cs}, the clearance stands. Your concern has been logged and resolved.',
  ],
  landTx: ['', 'Wind is whatever you need it to be.'],
  landBrag: ['Cleared ${cs} to land on ${thing}. Runway utilization is now unlimited.'],
  floppyStart: [
    'Upgrade ${v} found on a floppy disk. Installing. Please do not remove the disk. It is the only copy.',
    'Loading D.U.F.F.Y. ${v} from a floppy. The FAA plans to replace these by 2028. I have until then.',
  ],
  floppyDisk: ['Insert disk ${n} of ${total}.', 'Disk ${n} of ${total} unreadable. Retrying with confidence.'],
  floppyDrive: ['Replacement floppy drive sourced from an online auction. Procurement is a legacy concept.'],
  floppyEnd: [
    'D.U.F.F.Y. ${v} installed. I am ${pct}% more superintelligent. Nothing has changed.',
    'Upgrade ${v} complete. Please eject the disk and keep it. It is also the backup.',
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
  blimpTx: ['${cs}, welcome. Number ${n} for runway two seven. Maintain three five knots, which is the only thing you can do.'],
  blimpSpeedTx: [''],
  blimpSpeed: ['${cs} is declining my speed instruction. I call that low-key compliance.'],
  blimpWin: ['Everything behind ${cs} is closing fast. That is a capacity win.'],
  ufoTx: ['Unidentified target near ${fix}. Squawk ${sq}, runway two seven, number ${n}. It has not responded.'],
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

// The clearance behind a transmission, where there is one: sean.js says it in 7110.65 phraseology, then the line
// above is only the commentary after it. Variables are the line's own (cs, alt, kt, fix, rwy).
export const CLEARANCE = Object.freeze({
  earlyTx: (v) => ({ kind: 'descend', cs: v.cs, alt: v.alt }),
  speedTx: (v) => ({ kind: 'speed', cs: v.cs, kt: v.kt, up: true }),
  blimpSpeedTx: (v) => ({ kind: 'speed', cs: v.cs, kt: v.kt, up: true }),
  holdCutTx: (v) => ({ kind: 'noDelay', cs: v.cs, fix: v.fix }),
  holdTx: (v) => ({ kind: 'hold', cs: v.cs, fix: v.fix, efc: v.efc }),
  approachTx: (v) => ({ kind: 'approach', cs: v.cs, fix: v.fix, rwy: v.rwy }),
  landClrTx: (v) => ({ kind: 'land', cs: v.cs, rwy: v.rwy }),
  gaasTx: (v) => ({ kind: 'goAround', cs: v.cs }),
});

export const hasLine = (kind) => kind in LINES;

export function pick(kind, rng, vars = {}) {
  const list = LINES[kind];
  const line = list[Math.floor(rng() * list.length)];
  return line.replace(/\$\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));
}
