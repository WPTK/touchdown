// JO 7110.65 phraseology as text. Numbers follow 2-4-17 (numbers usage), the clearances follow 4-6-1 (holding),
// 4-8-1 (approach clearance), 5-6-1 (vectors), 5-7-2 (speed) and 3-10-5 (landing clearance). The FAA text is in
// docs/research/faa-rules-deep.md and at faa.gov. Every function here is pure.
//
// S.E.A.N.'s clearances are perfectly formatted. What it clears people to do is the joke, and that is up to sean.js.

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'niner'];

// The separate digits: 11,495 is "one one four niner five". A decimal point is "point".
export function digits(value) {
  return String(value)
    .replace(/,/g, '')
    .split('')
    .map((c) => (c === '.' ? 'point' : WORDS[Number(c)] ?? c))
    .join(' ');
}

// "The number of hundreds or thousands followed by hundred or thousand": 10,000 is "one zero thousand", 17,900 is
// "one seven thousand niner hundred", 11,000 is "one one thousand". Below a thousand it is the hundreds alone.
export function altitude(ft) {
  const f = Math.round(ft / 100) * 100;
  if (f < 100) return 'zero';
  const thousands = Math.floor(f / 1000);
  const hundreds = (f % 1000) / 100;
  return [thousands ? `${digits(thousands)} thousand` : '', hundreds ? `${digits(hundreds)} hundred` : ''].filter(Boolean).join(' ');
}

// "Flight level one eight zero."
// Ten minutes later on the clock, so a misread 1855 is 1905 and never the 1865 that cannot exist.
const addTenMinutes = (hhmm) => {
  const m = (Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(2)) + 10) % 1440;
  return String(Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0');
};

export const flightLevel = (fl) => `flight level ${digits(fl)}`;

// "Heading zero three zero". 360 is the north heading, never 000.
export function heading(deg) {
  const d = ((Math.round(deg) % 360) + 360) % 360 || 360;
  return `heading ${digits(String(d).padStart(3, '0'))}`;
}

// "Two five zero knots", "one niner zero knots".
export const speed = (kt) => `${digits(Math.round(kt))} knots`;

// Increase or reduce to a specified speed in single-digit form (5-7-2): "Reduce speed to two five zero."
export const speedTo = (kt) => digits(Math.round(kt));

// "Runway Three", "Runway Eight Left", "Runway Two Seven Right".
export function runway(id) {
  const m = /^(\d{1,2})([LRC]?)$/.exec(String(id));
  if (!m) return `runway ${id}`;
  const side = { L: ' left', R: ' right', C: ' center' }[m[2]] ?? '';
  return `runway ${digits(m[1])}${side}`;
}

// "One two six point five five". Digits after the second place to the right of the point are omitted, and a
// trailing zero stays: 369.0 is "three six niner point zero".
export function frequency(mhz) {
  const [whole, frac = '0'] = String(mhz).split('.');
  return digits(`${whole}.${frac.slice(0, 2)}`);
}

// "One zero zero zero".
export const squawk = (code) => digits(String(code).padStart(4, '0'));

// "Altimeter, three zero zero one."
export const altimeter = (inHg) => `altimeter ${digits(Math.round(inHg * 100))}`;

// "Wind two seven zero at one five gusts three five." Direction to the nearest 10.
export function wind(dir, kt, gust = null) {
  if (dir == null || !kt) return kt ? `wind variable at ${digits(kt)}` : 'wind calm';
  const d = String(Math.round(dir / 10) * 10 || 360).padStart(3, '0');
  return `wind ${digits(d)} at ${digits(kt)}${gust ? ` gusts ${digits(gust)}` : ''}`;
}

// Time in UTC, the four separate digits: "one niner two zero".
export const utc = (hhmm) => digits(String(hhmm).padStart(4, '0'));

// A call sign: the airline word and the digits, "PEACH412" is "Peach four one two".
export function callsign(cs) {
  const m = /^([A-Z]+)(\d+)$/.exec(String(cs));
  if (!m) return String(cs);
  return `${m[1][0]}${m[1].slice(1).toLowerCase()} ${digits(m[2])}`;
}

// ---- clearances ---------------------------------------------------------------------------------------------------
// A clearance is data: { kind, cs, ...params }. render() is what the controller says and readback() is what the pilot
// says back (2-4-3: the pilot reads back the numbers, then the call sign). A wrong readback is the same object with one
// number changed, so the two always have the same shape.

const sentence = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const RENDER = {
  descend: (c) => `descend and maintain ${altitude(c.alt)}`,
  climb: (c) => `climb and maintain ${altitude(c.alt)}`,
  speed: (c) => `${c.up ? 'increase' : 'reduce'} speed to ${speedTo(c.kt)}`,
  heading: (c) => `fly ${heading(c.deg)}`,
  hold: (c) => `cleared to ${c.fix}, hold as published${c.efc ? `, expect further clearance ${utc(c.efc)}` : ''}`,
  noDelay: (c) => `cleared to ${c.fix}, no delay expected`,
  approach: (c) => `${c.fix ? `at ${c.fix}, ` : ''}cleared ILS ${runway(c.rwy)} approach`,
  land: (c) => `${runway(c.rwy)}, cleared to land`,
  goAround: () => 'go around',
};

// The pilot's version: the items, then the call sign.
const READBACK = {
  descend: (c) => `descending ${altitude(c.alt)}`,
  climb: (c) => `climbing ${altitude(c.alt)}`,
  speed: (c) => `${speedTo(c.kt)}`,
  heading: (c) => `${heading(c.deg)}`,
  hold: (c) => `cleared to ${c.fix}, hold as published${c.efc ? `, expect further clearance ${utc(c.efc)}` : ''}`,
  noDelay: (c) => `cleared to ${c.fix}, no delay expected`,
  approach: (c) => `${c.fix ? `at ${c.fix}, ` : ''}cleared ILS ${runway(c.rwy)} approach`,
  land: (c) => `${runway(c.rwy)}, cleared to land`,
  goAround: () => 'going around',
};

export const KINDS = Object.freeze(Object.keys(RENDER));

export const render = (c) => `${callsign(c.cs)}, ${RENDER[c.kind](c)}.`;
export const readback = (c) => `${sentence(READBACK[c.kind](c))}, ${callsign(c.cs)}.`;

// A readback with one number wrong, the way a tired pilot would. Returns null for a clearance with no number to get
// wrong. Draws once from rng.
export function misread(c, rng) {
  const r = rng();
  switch (c.kind) {
    case 'descend':
    case 'climb':
      return { ...c, alt: Math.max(1000, c.alt + (r < 0.5 ? -1000 : 1000)) }; // never a readback of zero feet
    case 'speed':
      return { ...c, kt: c.kt + (r < 0.5 ? -10 : 10) };
    case 'heading':
      return { ...c, deg: (c.deg + (r < 0.5 ? -10 : 10) + 360) % 360 };
    case 'approach':
    case 'land': {
      // the parallel: 26R becomes 26L, 27L becomes 27R
      const m = /^(\d+)([LRC])$/.exec(c.rwy);
      if (!m) return null;
      return { ...c, rwy: `${m[1]}${m[2] === 'L' ? 'R' : 'L'}` };
    }
    case 'hold':
      return c.efc ? { ...c, efc: addTenMinutes(c.efc) } : null;
    default:
      return null;
  }
}

// Something walked over the transmission: part of it is lost. Replaces a run of words with "[blocked]". Draws once.
export function stepOn(text, rng) {
  const words = text.split(' ');
  if (words.length < 4) return '[blocked]';
  const from = 1 + Math.floor(rng() * (words.length - 3));
  const len = 1 + Math.floor(rng() * Math.min(3, words.length - from - 1));
  return [...words.slice(0, from), '[blocked]', ...words.slice(from + len)].join(' ');
}

// The variables of a line, said the way the controller says them: call signs and altitudes in words, numbers as separate
// digits. Used for transmissions, so "PEACH412 at 11000" reads "Peach four one two ... one one thousand".
export function spokenVars(v = {}) {
  const o = { ...v };
  if (o.cs) o.cs = callsign(o.cs);
  if (o.other) o.other = callsign(o.other);
  for (const k of ['n', 's', 'kt', 'nm']) if (typeof o[k] === 'number') o[k] = digits(Math.round(o[k]));
  if (o.alt != null) o.alt = altitude(o.alt);
  if (o.sq) o.sq = squawk(o.sq);
  if (o.rwy) o.rwy = runway(o.rwy);
  return o;
}
