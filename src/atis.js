// The ATIS, written by S.E.A.N. (2-9-1, 2-9-2). Letters run Alpha to Zulu in order and start over (2-9-1: "beginning
// with Alpha, ending with Zulu, and repeated"). The message opens and closes with its code word. A new one is recorded
// when new weather arrives, whether or not it changed, and when the runway, the approach in use or the PIREPs change
// (2-9-2). The weather is the real METAR from the weather phase; the last line is S.E.A.N.'s own forecast. Pure.

import { altimeter, altitude, digits, runway, utc, wind } from './phrase.js';

export const LETTERS = Object.freeze([
  'Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliett', 'Kilo', 'Lima', 'Mike',
  'November', 'Oscar', 'Papa', 'Quebec', 'Romeo', 'Sierra', 'Tango', 'Uniform', 'Victor', 'Whiskey', 'X-ray', 'Yankee', 'Zulu',
]);

export const nextIndex = (i) => (i + 1) % LETTERS.length;

const COVER = { FEW: 'few', SCT: 'scattered', BKN: 'broken', OVC: 'overcast', VV: 'indefinite ceiling' };
const PHEN = { TS: 'thunderstorm', RA: 'rain', SN: 'snow', DZ: 'drizzle', FG: 'fog', BR: 'mist', FZ: 'freezing', SH: 'showers', HZ: 'haze', GR: 'hail', PL: 'ice pellets', DS: 'dust storm', FC: 'funnel cloud' };

function phenomenon(token) {
  const m = /^([-+]?)((?:[A-Z]{2})+)$/.exec(token);
  if (!m) return null;
  const parts = m[2].match(/../g).map((p) => PHEN[p]);
  if (parts.some((p) => !p)) return null;
  return `${m[1] === '-' ? 'light ' : m[1] === '+' ? 'heavy ' : ''}${parts.join(' ')}`;
}

const temp = (c) => (c < 0 ? `minus ${digits(Math.abs(c))}` : digits(c));

// The METAR in the ATIS's words. Skips what the report does not have.
export function weatherWords(m) {
  const parts = [];
  if (m.visSm != null) parts.push(`visibility ${digits(m.visSm)}`);
  const ph = m.wx.map(phenomenon).filter(Boolean);
  if (ph.length) parts.push(ph.join(', '));
  const sky = m.clouds.map((c) => `${COVER[c.cover]} ${altitude(c.ft)}`);
  parts.push(sky.length ? `sky condition ${sky.join(', ')}` : 'sky clear');
  if (m.tempC != null) parts.push(`temperature ${temp(m.tempC)}${m.dewC != null ? `, dew point ${temp(m.dewC)}` : ''}`);
  parts.push(wind(m.windDir, m.windKt, m.gustKt));
  if (m.altimeterInHg != null) parts.push(altimeter(m.altimeterInHg));
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('. ');
}

// The whole recording. `forecast` is S.E.A.N.'s own, `advisories` are what S.E.A.N. adds (a funnel cloud, a dust storm)
// and `pireps` the pilot reports in effect.
export function atisText({ index, hhmm, metar, flowRunways, approach, forecast, advisories = [], pireps = [] }) {
  const word = LETTERS[index];
  const runways = flowRunways.map(runway).join(', ');
  return [
    `Atlanta information ${word}, ${utc(hhmm)} Zulu.`,
    metar ? `${weatherWords(metar)}.` : 'No weather reported. Calm.',
    `${approach === 'visual' ? 'Visual' : 'ILS'} approaches in use. Landing ${runways}.`,
    forecast ? `S.E.A.N. forecast: ${forecast}.` : null,
    ...advisories.map((a) => `${a}.`),
    ...pireps.map((p) => `Pilot report: ${p.replace(/[. ]+$/, '')}.`),
    `Advise on initial contact you have information ${word}.`,
    `End of information ${word}.`,
  ]
    .filter(Boolean)
    .join(' ');
}

// What goes out on the frequency when the code changes (2-9-2).
export const attention = (index) => `Attention all aircraft, information ${LETTERS[index]} current.`;

// The part of S.E.A.N.'s forecast a pilot can use: wind and sky from its raw string.
export function forecastWords(raw) {
  if (!raw) return null;
  const t = raw.split(' ');
  const w = /^(\d{3})(\d{2})KT$/.exec(t[2] ?? '');
  const ds = raw.includes(' DS ');
  const conf = (raw.match(/CONF ([\d.]+)/) ?? [])[1] ?? '99';
  return `${w ? wind(Number(w[1]), Number(w[2])) : ''}${ds ? ', dust storm, visibility one quarter' : ', visibility one zero, sky clear'}. Confidence ${digits(conf)} percent`;
}
