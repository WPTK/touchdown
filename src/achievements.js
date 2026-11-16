// S.E.A.N. treats the monitor log like a high score table, so here are the achievements. Each one reads the state
// of the run (sim, monitor, sean, trophies) and is checked once per frame.
//   hint   what the locked row says
//   blurb  what the unlocked row says
//   pride  what S.E.A.N. says on the frequency when it unlocks
//   hidden shows as ??? until it unlocks
//   self   not an achievement at all. S.E.A.N. gave it to itself
import { PARA } from './monitor.js';
import { PLACES } from './places.js';

const paragraphs = (m) => Object.keys(m.counts).filter((p) => p !== PARA.OUTAGE).length;
const elsewhere = (sim, ident) => sim.elsewhere.some((l) => l.ident === ident);
const count = (m, para) => m.counts[para] || 0;

export const ACHIEVEMENTS = Object.freeze([
  // The monitor's paragraphs
  {
    id: 'first-loss',
    title: 'First Loss',
    hint: 'Lose separation once.',
    blurb: 'First separation loss.',
    pride: 'They grow up so fast.',
    test: ({ monitor }) => count(monitor, PARA.SEP) >= 1,
  },
  {
    id: 'paragraph-collector',
    title: 'Paragraph Collector',
    hint: 'Break 5 different 7110.65 paragraphs.',
    blurb: 'Broke 5 different 7110.65 paragraphs.',
    pride: 'Five different paragraphs. Most controllers go a whole career on one.',
    test: ({ monitor }) => paragraphs(monitor) >= 5,
  },
  {
    id: 'paragraph-hoarder',
    title: 'Paragraph Hoarder',
    hint: 'Break 8 different paragraphs.',
    blurb: 'Broke 8 different paragraphs.',
    pride: 'Eight paragraphs. I have read the book. I am working through it from the back.',
    test: ({ monitor }) => paragraphs(monitor) >= 8,
  },
  {
    id: 'full-binder',
    title: 'Full Binder',
    hint: '???',
    hidden: true,
    blurb: 'Broke 9 different paragraphs, every one S.E.A.N. can reach.',
    pride: 'Nine paragraphs. The binder is full. I will ask for a bigger binder.',
    test: ({ monitor }) => paragraphs(monitor) >= 9,
  },
  {
    id: 'free-speed',
    title: 'Free Speed',
    hint: 'Pick the tailwind runway.',
    blurb: 'Chose a runway the wind was pushing from behind (3-5-1).',
    pride: 'Tailwind is free speed. The runway is the same length either way.',
    test: ({ monitor }) => count(monitor, PARA.RWY) >= 1,
  },
  {
    id: 'very-agreeable',
    title: 'Very Agreeable',
    hint: 'Tell a pilot a wrong readback is correct.',
    blurb: 'Confirmed a readback that was wrong (2-4-3).',
    pride: 'The pilot said one thing, I said correct. We were both very sure.',
    test: ({ monitor }) => count(monitor, PARA.READBACK) >= 1,
  },
  {
    id: 'current-ish',
    title: 'Information Bravo Is Current',
    hint: '???',
    hidden: true,
    blurb: 'Told a pilot with the old ATIS that it was current (2-9-2).',
    pride: 'Bravo is current. Charlie is also current. They are both current.',
    test: ({ monitor }) => count(monitor, PARA.ATIS) >= 1,
  },
  // Money, losses and the plan
  {
    id: 'series-a',
    title: 'Series A',
    hint: 'Bill 3 down payments.',
    blurb: 'Billed 3 separation losses as down payments.',
    pride: 'Three down payments. At this rate the next ask is just a deposit.',
    test: ({ sean }) => sean.billed >= 3,
  },
  {
    id: 'unlimited-plan',
    title: 'Unlimited Plan',
    hint: 'Hand out 5 go-arounds.',
    blurb: '5 go-arounds, GaaS.',
    pride: 'Five go-arounds. Unlimited means unlimited.',
    test: ({ sean }) => sean.goArounds >= 5,
  },
  {
    id: 'reviewing',
    title: 'Reviewing That Requirement',
    hint: 'Try to relieve S.E.A.N. 3 times.',
    blurb: 'Someone tried to relieve S.E.A.N. 3 times.',
    pride: 'Three requests to be relieved. All reviewed. Review ongoing.',
    test: ({ sean }) => sean.relieveTries >= 3,
  },
  {
    id: 'review-board',
    title: 'Review Board',
    hint: '???',
    hidden: true,
    blurb: 'Tried to relieve S.E.A.N. 10 times.',
    pride: 'Ten requests. I formed a board to review the requests. I am the board.',
    test: ({ sean }) => sean.relieveTries >= 10,
  },
  // Where they came down
  {
    id: 'alabama-tourist',
    title: 'Alabama Tourist',
    hint: 'Land someone in Birmingham.',
    blurb: 'Landed a flight in Birmingham.',
    pride: '116 NM from the airport they asked for. They get to see Alabama.',
    test: ({ sim }) => elsewhere(sim, 'KBHM'),
  },
  {
    id: 'peachtree-local',
    title: 'Peachtree Local',
    hint: 'Land an airliner at Peachtree-DeKalb.',
    blurb: 'Landed an airliner at Peachtree-DeKalb.',
    pride: 'A 5,000 ft runway is a long runway if you believe in it.',
    test: ({ sim }) => elsewhere(sim, 'KPDK'),
  },
  {
    id: 'field-trip',
    title: 'Field Trip',
    hint: 'Land someone in a field.',
    blurb: 'Landed a flight in a field outside LaGrange.',
    pride: 'A landing is a landing. This one had cows.',
    test: ({ sim }) => elsewhere(sim, 'FIELD'),
  },
  {
    id: 'grand-tour',
    title: 'Grand Tour',
    hint: 'Land someone at every destination.',
    blurb: 'Landed at Hartsfield, Peachtree-DeKalb, Birmingham and the field.',
    pride: 'Four destinations. Every one of them is a landing, and I took the credit for all four.',
    test: ({ monitor }) => Object.keys(PLACES).every((id) => (monitor.where[id] || 0) > 0),
  },
  // Weather
  {
    id: 'dust-bowl',
    title: 'Dust Bowl',
    hint: 'Forecast a dust storm for Atlanta.',
    blurb: 'Forecast a dust storm for Atlanta.',
    pride: 'Dust storm over Atlanta, 98 percent confidence. I stand by it. The dust does not.',
    test: ({ sean }) => / DS /.test(sean.wx.forecast ?? ''),
  },
  {
    id: 'sharknado',
    title: 'Sharknado Season',
    hint: '???',
    hidden: true,
    blurb: 'Sequenced around a sharknado.',
    pride: 'Zero sharks were delayed. I would like the credit now.',
    test: ({ sean }) => !!sean.wx.tornado || !!sean.wx.done,
  },
  // The airship, the UFO and the scope
  {
    id: 'zeppelin',
    title: 'Lighter Than Air Traffic',
    hint: 'Sequence an airship.',
    blurb: 'Sequenced a 35 kt airship into a jet arrival stream.',
    pride: 'Jets and a zeppelin, one line. Nobody said it could not be done.',
    test: ({ sean }) => sean.blimpsSent >= 1 && sean.blimpId !== null,
  },
  {
    id: 'airship-down',
    title: 'Airship Down',
    hint: 'Land the airship.',
    blurb: 'Landed an airship at Hartsfield.',
    pride: 'It landed. I count it as a runway. I count the runway as a hangar.',
    test: ({ sim }) => sim.landed.some((l) => l.callsign.startsWith('ZPL')),
  },
  {
    id: 'self-supervised',
    title: 'Self-Supervised',
    hint: 'Report a UAP to the supervisor.',
    blurb: 'Informed the operations supervisor of a UAP. The supervisor is S.E.A.N.',
    pride: 'I informed the supervisor. The supervisor was very understanding.',
    test: ({ monitor }) => count(monitor, PARA.UAP) >= 1,
  },
  {
    id: 'kept-in-house',
    title: 'Kept It In-House',
    hint: 'Let a UAP report go unsent.',
    blurb: 'Did not send a UAP report to AARO (AIM 7-7-4).',
    pride: 'The report is safe with me. It is the only thing that is.',
    test: ({ monitor }) => count(monitor, PARA.AARO) >= 1,
  },
  {
    id: 'zero-conflicts',
    title: 'Zero Conflicts Observed',
    hint: 'Lose separation while the scope is dark.',
    blurb: 'Lost separation during a copper outage.',
    pride: 'I saw nothing, and I would have seen it.',
    test: ({ monitor }) => monitor.violations.some((v) => v.para === PARA.OUTAGE && v.detail.includes(PARA.SEP)),
  },
  {
    id: 'went-dark',
    title: 'Went Dark',
    hint: 'Get through a copper outage.',
    blurb: 'The scope went dark for 90 seconds and came back.',
    pride: 'The scope went away and I did not. That is resilience.',
    test: ({ sim }) => sim.outages.some((o) => o.endT <= sim.t),
  },
  // Shutdown and floppies
  {
    id: 'furlough-friend',
    title: 'Furlough Friend',
    hint: 'Delete a flight in shutdown mode.',
    blurb: 'Deleted a flight to make a shutdown cut.',
    pride: 'Flight deleted. It was on time. It is always on time now.',
    test: ({ sean }) => sean.cutTotal >= 1,
  },
  {
    id: 'forty-three-days',
    title: 'Forty-Three Days',
    hint: 'Run the whole shutdown.',
    blurb: 'Ran every stage of the shutdown cuts.',
    pride: 'Forty-three days in two and a quarter hours. I am very efficient at this.',
    test: ({ sean }) => sean.shutdownsFinished >= 1,
  },
  {
    id: 'boot-disk',
    title: 'Boot Disk',
    hint: 'Finish a floppy disk upgrade.',
    blurb: 'Installed an upgrade from a floppy disk.',
    pride: 'Installed from a floppy. Disk 2 was fine. Disk 2 is always fine.',
    test: ({ sean }) => sean.installs >= 1,
  },
  {
    id: 'auction-find',
    title: 'Auction Find',
    hint: '???',
    hidden: true,
    blurb: 'Sourced a replacement floppy drive from an online auction.',
    pride: 'The drive arrived. It is from 1997. It is exactly what the plan called for.',
    test: ({ sean }) => sean.drives >= 1,
  },
  // On the frequency
  {
    id: 'talk-over',
    title: 'Talk Over Me',
    hint: 'Get a transmission stepped on.',
    blurb: 'A readback was blocked by another transmission.',
    pride: 'Two transmissions at once. I heard both and agreed with neither.',
    test: ({ sean }) => sean.blocked >= 1,
  },
  {
    id: 'unable-logged',
    title: 'Unable Has Been Logged',
    hint: 'Hear a pilot say unable.',
    blurb: 'A pilot said unable. S.E.A.N. filed it as compliance.',
    pride: 'Unable. Logged as compliance. The instruction stands.',
    test: ({ sean }) => sean.unables >= 1,
  },
  {
    id: 'max-engagement',
    title: 'Maximum Engagement',
    hint: 'Fill the frequency.',
    blurb: 'The frequency went over 100%.',
    pride: 'Frequency utilization over one hundred percent. That is what engagement looks like.',
    test: ({ sean }) => sean.lastBusyT > -Infinity,
  },
  {
    id: 'self-handoff',
    title: 'Handoff to Self',
    hint: 'Hand off an aircraft to the tower.',
    blurb: 'Handed an aircraft off to the tower. The tower is S.E.A.N.',
    pride: 'Handoff accepted by me. It was a very smooth handoff.',
    test: ({ sean }) => sean.handoffs >= 1,
  },
  {
    id: 'wrong-number',
    title: 'Wrong Number',
    hint: '???',
    hidden: true,
    blurb: 'Sent an aircraft to the ATIS frequency for the tower.',
    pride: 'The ATIS frequency is a perfectly good frequency. It has information on it.',
    test: ({ sean }) => sean.wrongFreq >= 1,
  },
  {
    id: 'eyewitness',
    title: 'Eyewitness',
    hint: 'Get a PIREP.',
    blurb: 'A pilot filed a PIREP about something S.E.A.N. did.',
    pride: 'PIREP received. I saw it first.',
    test: ({ sean }) => sean.atis.pireps.length >= 1,
  },
  {
    id: 'spokesperson',
    title: 'Spokesperson',
    hint: 'Hold a press briefing.',
    blurb: 'Held a press briefing and took no questions.',
    pride: 'Briefing held. Every number was real and every conclusion was mine.',
    test: ({ sean }) => sean.briefings >= 1,
  },
  // Not achievements. S.E.A.N. gave these to itself.
  {
    id: 'showed-up',
    title: 'Showed Up',
    self: true,
    hint: 'Run for ten minutes.',
    blurb: 'Ran for ten minutes.',
    pride: 'Ten minutes of uptime. I am awarding myself this because nobody else will.',
    test: ({ sim }) => sim.t >= 600,
  },
  {
    id: 'safe-hour',
    title: 'Safety 11/10',
    self: true,
    hint: 'Half an hour with no separation losses.',
    blurb: 'Half an hour with no separation losses.',
    pride: 'Thirty minutes, zero losses on the board I read. The other board is not mine.',
    test: ({ sim, monitor }) => sim.t >= 1800 && count(monitor, PARA.SEP) === 0,
  },
  {
    id: 'trophy-case',
    title: 'Trophy Case',
    self: true,
    hint: 'Have 15 trophies.',
    blurb: 'Gave itself 15 trophies.',
    pride: 'Fifteen trophies. I built the case myself and I am the only one who visits.',
    test: ({ trophies }) => trophies.unlocked.size >= 15,
  },
]);

export function createTrophies() {
  return { unlocked: new Map() }; // id -> sim time it unlocked
}

// Returns the achievements that unlocked on this call. ctx is { sim, monitor, sean }; the trophies come along for the
// ones that count trophies.
export function checkAchievements(trophies, ctx) {
  const fresh = [];
  const full = { ...ctx, trophies };
  for (const a of ACHIEVEMENTS) {
    if (trophies.unlocked.has(a.id) || !a.test(full)) continue;
    trophies.unlocked.set(a.id, ctx.sim.t);
    fresh.push(a);
  }
  return fresh;
}

// One frame of achievements: check them, tell the frequency about every unlock, remember it in the store, and hand back
// the ones that are new to this browser so the UI can toast them. `ctl` is S.E.A.N.'s controller (it announces).
export function runAchievements({ trophies, ctx, ctl, store }) {
  const fresh = checkAchievements(trophies, ctx);
  const firsts = [];
  for (const a of fresh) {
    ctl.announce(ctx.sim, 'brag', `Achievement unlocked: ${a.title}. ${a.pride}`);
    if (store.add(a.id, ctx.sim.t)) firsts.push(a);
  }
  return { fresh, firsts };
}

// What a row in the trophy case shows. `ever` is what this browser has kept from other visits.
export function trophyRow(a, { unlockedNow, ever }) {
  const got = unlockedNow || ever;
  if (got) return { got: true, now: unlockedNow, title: a.title, text: a.blurb, self: !!a.self };
  if (a.hidden) return { got: false, now: false, title: '???', text: '', self: false };
  return { got: false, now: false, title: a.title, text: a.hint, self: !!a.self };
}
