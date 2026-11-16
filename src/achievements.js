// S.E.A.N. treats the monitor log like a high score table, so here are the achievements. Each one reads the state
// of the run (sim, monitor, sean) and is checked once per frame. `hint` is what the locked row says, `blurb` the
// unlocked one, `pride` what S.E.A.N. says when it unlocks.
import { PARA } from './monitor.js';

const paragraphs = (m) => Object.keys(m.counts).filter((p) => p !== PARA.OUTAGE).length;
const elsewhere = (sim, ident) => sim.elsewhere.some((l) => l.ident === ident);

export const ACHIEVEMENTS = Object.freeze([
  {
    id: 'paragraph-collector',
    title: 'Paragraph Collector',
    hint: 'Break 5 different 7110.65 paragraphs.',
    blurb: 'Broke 5 different 7110.65 paragraphs.',
    pride: 'Five different paragraphs. Most controllers go a whole career on one.',
    test: ({ monitor }) => paragraphs(monitor) >= 5,
  },
  {
    id: 'first-loss',
    title: 'First Loss',
    hint: 'Lose separation once.',
    blurb: 'First separation loss.',
    pride: 'They grow up so fast.',
    test: ({ monitor }) => (monitor.counts[PARA.SEP] || 0) >= 1,
  },
  {
    id: 'series-a',
    title: 'Series A',
    hint: 'Bill 3 down payments.',
    blurb: 'Billed 3 separation losses as down payments.',
    pride: 'Three down payments. At this rate the next ask is just a deposit.',
    test: ({ sean }) => sean.billed >= 3,
  },
  {
    id: 'alabama-tourist',
    title: 'Alabama Tourist',
    hint: 'Land someone in Birmingham.',
    blurb: 'Landed a flight in Birmingham.',
    pride: '116 NM from the airport they asked for. They get to see Alabama.',
    test: ({ sim }) => elsewhere(sim, 'KBHM'),
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
    id: 'self-supervised',
    title: 'Self-Supervised',
    hint: 'Report a UAP to the supervisor.',
    blurb: 'Informed the operations supervisor of a UAP. The supervisor is S.E.A.N.',
    pride: 'I informed the supervisor. The supervisor was very understanding.',
    test: ({ monitor }) => (monitor.counts[PARA.UAP] || 0) >= 1,
  },
  {
    id: 'zeppelin',
    title: 'Lighter Than Air Traffic',
    hint: 'Sequence an airship.',
    blurb: 'Sequenced a 35 kt airship into a jet arrival stream.',
    pride: 'Jets and a zeppelin, one line. Nobody said it could not be done.',
    test: ({ sean }) => sean.blimpsSent >= 1 && sean.blimpId !== null,
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
    id: 'zero-conflicts',
    title: 'Zero Conflicts Observed',
    hint: 'Lose separation while the scope is dark.',
    blurb: 'Lost separation during a copper outage.',
    pride: 'I saw nothing, and I would have seen it.',
    test: ({ monitor }) => monitor.violations.some((v) => v.para === PARA.OUTAGE && v.detail.includes(PARA.SEP)),
  },
  {
    id: 'boot-disk',
    title: 'Boot Disk',
    hint: 'Finish a floppy disk upgrade.',
    blurb: 'Installed an upgrade from a floppy disk.',
    pride: 'Installed from a floppy. Disk 2 was fine. Disk 2 is always fine.',
    test: ({ sean }) => sean.installs >= 1,
  },
]);

export function createTrophies() {
  return { unlocked: new Map() }; // id -> sim time it unlocked
}

// Returns the achievements that unlocked on this call.
export function checkAchievements(trophies, ctx) {
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (trophies.unlocked.has(a.id) || !a.test(ctx)) continue;
    trophies.unlocked.set(a.id, ctx.sim.t);
    fresh.push(a);
  }
  return fresh;
}
