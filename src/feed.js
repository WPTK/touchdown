// The frequency as the panel shows it: S.E.A.N.'s feed and the monitor's log merged by time, filtered by who is
// talking, plus how busy the frequency is. Pure.

// Who each feed kind belongs to. S.E.A.N. is what it transmits, brags about and blames. Pilots are readbacks,
// queries and PIREPs. The monitor is the conformance log, which is not in S.E.A.N.'s feed at all.
export const SPEAKER = Object.freeze({
  tx: 'sean',
  brag: 'sean',
  blame: 'sean',
  atis: 'sean',
  brief: 'sean',
  pilot: 'pilot',
  readback: 'pilot',
  pirep: 'pilot',
  monitor: 'monitor',
});

export const FILTERS = Object.freeze(['sean', 'pilot', 'monitor']);

export const speakerOf = (kind) => SPEAKER[kind] ?? 'sean';

// The newest `limit` lines, newest first, from the speakers in `on`. The monitor's violations come in as lines of kind
// 'monitor'. `on` is a Set (or array) of FILTERS; an empty one shows nothing.
export function buildFeed(seanFeed, violations, on = FILTERS, limit = 12) {
  const want = new Set(on);
  const lines = seanFeed.filter((f) => want.has(speakerOf(f.kind)));
  if (want.has('monitor')) {
    for (const v of violations) lines.push({ t: v.t, kind: 'monitor', text: `${v.para}: ${v.title}. ${v.detail}` });
  }
  // The merge is stable: lines at the same second stay in the order they were said.
  return lines
    .map((l, i) => [l, i])
    .sort((a, b) => a[0].t - b[0].t || a[1] - b[1])
    .slice(-limit)
    .map(([l]) => l)
    .reverse();
}

// A transmission holds the frequency for about as long as it takes to say it: 2.5 words a second and a second of
// keying up. Anything on the frequency in the last `windowS` seconds counts, so the figure is the share of the window
// someone was talking. Over 100 means transmissions overlapped, which is what a stepped-on call is.
export const WORDS_PER_S = 2.5;
export const KEY_UP_S = 1;
export const airtime = (text) => KEY_UP_S + text.split(/\s+/).length / WORDS_PER_S;

const NOT_RADIO = new Set(['brag', 'blame', 'atis', 'brief']);

export function congestion(seanFeed, t, windowS = 120) {
  let busy = 0;
  let n = 0;
  for (let i = seanFeed.length - 1; i >= 0; i--) {
    const f = seanFeed[i];
    if (f.t < t - windowS) break;
    if (NOT_RADIO.has(f.kind)) continue; // press releases and the ATIS (its own frequency) are not this one
    busy += airtime(f.text);
    n++;
  }
  return { pct: Math.round((100 * busy) / windowS), n };
}

// What S.E.A.N. calls it. The label is the point: the worse the frequency, the better the word.
export function congestionLabel(pct) {
  if (pct >= 100) return 'maximum engagement';
  if (pct >= 60) return 'synergy';
  if (pct >= 30) return 'healthy';
  return 'idle';
}
