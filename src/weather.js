// Real weather for the sim: METAR and TAF parsing, the wind rules, and the scenario clock. Pure, no DOM.
//
// Rules this file implements (text in docs/research/weather-rules.md):
//   JO 7110.65 3-5-1  runway most nearly aligned with the wind at 5 kt or more, calm-wind runway under 5 kt,
//                     tailwind and crosswind considerations over delay/capacity
//   JO 7110.65 3-5-3  state wind direction and velocity when authorizing a runway with a tailwind component
//   JO 7110.65 2-6-4  issue observed weather (the storm cells) to affected aircraft
//   JO 7110.65 3-1-8  low level wind shear / microburst advisories, kept up for 20 minutes after the last indication
//   AIM 7-1-7         LIFR / IFR / MVFR / VFR categories
//   AIM 7-1-28        METAR codes (TS, FC, +FC, DS, SS ...)

import { mulberry32 } from './rng.js';

// ATL flow. West flow lands 26R, 27L and 28 heading about 270; east flow lands 8L, 9R and 10 heading about 090.
// Runway numbers are magnetic and METAR winds are true; the roughly 5 degrees between them is ignored here.
export const FLOWS = Object.freeze({
  west: Object.freeze({ headingDeg: 270, runways: Object.freeze(['26R', '27L', '28']) }),
  east: Object.freeze({ headingDeg: 90, runways: Object.freeze(['8L', '9R', '10']) }),
});

// The 7110.65 3-5-1 threshold.
export const CALM_KT = 5;

// UNCONFIRMED: no ATL arrival-rate table was found in the sources this repo mirrors. These multipliers on the
// landing rate are a stand-in so ceiling, visibility and storms visibly slow the runway. Replace with a sourced table.
export const RATE_BY_CATEGORY = Object.freeze({ VFR: 1, MVFR: 0.9, IFR: 0.75, LIFR: 0.6 });
export const RATE_STORM_OVERHEAD = 0.5; // UNCONFIRMED, same reason

// Sim choice, not a rule: a flow change needs the new wind to hold this long, because a change drains the airspace.
export const FLOW_HOLD_S = 600;
// 3-1-8: the advisory stays on the ATIS for 20 minutes after the last indication.
export const LLWS_HOLD_S = 20 * 60;

const wrap = (d) => ((d % 360) + 360) % 360;
const rad = (d) => (d * Math.PI) / 180;

// Smallest angle between two compass directions.
export function angleDiff(a, b) {
  const d = Math.abs(wrap(a) - wrap(b));
  return d > 180 ? 360 - d : d;
}

// Wind relative to a heading. head > 0 is a headwind, cross > 0 is from the right.
export function windComponents(windDir, windKt, headingDeg) {
  if (windDir == null || !windKt) return { head: 0, cross: 0 };
  const rel = rad(windDir - headingDeg);
  return { head: windKt * Math.cos(rel), cross: windKt * Math.sin(rel) };
}

// Groundspeed of an aircraft with true airspeed `tasKt` holding track `trackDeg`, crabbed into the crosswind.
export function groundSpeed(tasKt, windDir, windKt, trackDeg) {
  const { head, cross } = windComponents(windDir, windKt, trackDeg);
  const wca = Math.asin(Math.max(-1, Math.min(1, cross / tasKt)));
  return tasKt * Math.cos(wca) - head;
}

// 3-5-1. Wind under 5 kt (or variable) keeps the current flow; the calm-wind runway at ATL is UNCONFIRMED, so a cold
// start is west flow. Otherwise the flow most nearly aligned with the wind, whatever the delay cost.
export function chooseFlow(windDir, windKt, current = 'west') {
  if (windDir == null || windKt < CALM_KT) return { flow: current, rule: '3-5-1', basis: 'calm', head: 0, tail: 0, cross: 0 };
  const flow = angleDiff(windDir, FLOWS.west.headingDeg) <= angleDiff(windDir, FLOWS.east.headingDeg) ? 'west' : 'east';
  return { flow, rule: '3-5-1', basis: 'aligned', ...components(windDir, windKt, flow) };
}

// Components on a flow. tail is the tailwind component (0 if none), the number 3-5-3 says to state.
export function components(windDir, windKt, flow) {
  const { head, cross } = windComponents(windDir, windKt, FLOWS[flow].headingDeg);
  return { head: Math.max(0, head), tail: Math.max(0, -head), cross: Math.abs(cross) };
}

// AIM 7-1-7.
export function flightCategory(visSm, ceilingFt) {
  const vis = visSm ?? 99;
  const ceil = ceilingFt ?? 99999;
  if (ceil < 500 || vis < 1) return 'LIFR';
  if (ceil < 1000 || vis < 3) return 'IFR';
  if (ceil <= 3000 || vis <= 5) return 'MVFR';
  return 'VFR';
}

const WX = /^([-+]|VC)?(MI|PR|BC|DR|BL|SH|TS|FZ)?((?:DZ|RA|SN|SG|IC|PL|GR|GS|UP|BR|FG|FU|VA|DU|SA|HZ|PY|PO|SQ|FC|SS|DS)+)$/;
const WX_ONLY_DESCRIPTOR = /^([-+]|VC)?(TS|SH)$/;

function parseVis(tok, next) {
  const m = tok.match(/^(M|P)?(\d+)(?:\/(\d+))?SM$/);
  if (m) return { value: m[3] ? Number(m[2]) / Number(m[3]) : Number(m[2]), used: 1 };
  if (/^\d+$/.test(tok) && next && /^\d+\/\d+SM$/.test(next)) {
    const f = next.match(/^(\d+)\/(\d+)SM$/);
    return { value: Number(tok) + Number(f[1]) / Number(f[2]), used: 2 };
  }
  return null;
}

// Parses one METAR or SPECI. Fields that are absent are null. Cloud heights are feet above ground.
export function parseMetar(raw) {
  const text = raw.trim();
  const [body, ...rmk] = text.split(/\sRMK\s/);
  const remarks = rmk.join(' RMK ');
  const toks = body.split(/\s+/);
  const out = {
    raw: text, station: null, day: null, hour: null, min: null, windDir: null, windKt: 0, gustKt: null,
    variableFrom: null, variableTo: null, visSm: null, wx: [], clouds: [], ceilingFt: null,
    tempC: null, dewC: null, altimeterInHg: null, remarks,
  };
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    let m;
    if ((m = t.match(/^(\d{2})(\d{2})(\d{2})Z$/))) {
      out.day = +m[1]; out.hour = +m[2]; out.min = +m[3];
    } else if (/^[KP][A-Z]{3}$/.test(t) && !out.station) {
      out.station = t;
    } else if ((m = t.match(/^(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT$/))) {
      out.windDir = m[1] === 'VRB' ? null : +m[1];
      out.windKt = +m[2];
      out.gustKt = m[3] ? +m[3] : null;
    } else if ((m = t.match(/^(\d{3})V(\d{3})$/))) {
      out.variableFrom = +m[1]; out.variableTo = +m[2];
    } else if (out.visSm == null && (m = parseVis(t, toks[i + 1]))) {
      out.visSm = m.value;
      i += m.used - 1;
    } else if ((m = t.match(/^(FEW|SCT|BKN|OVC)(\d{3})(CB|TCU)?$/))) {
      out.clouds.push({ cover: m[1], ft: +m[2] * 100, type: m[3] || null });
    } else if ((m = t.match(/^VV(\d{3})$/))) {
      out.clouds.push({ cover: 'VV', ft: +m[1] * 100, type: null });
    } else if ((m = t.match(/^(M?\d{2})\/(M?\d{2})?$/))) {
      const n = (s) => (s ? (s[0] === 'M' ? -Number(s.slice(1)) : Number(s)) : null);
      out.tempC = n(m[1]); out.dewC = n(m[2]);
    } else if ((m = t.match(/^A(\d{4})$/))) {
      out.altimeterInHg = Number(m[1]) / 100;
    } else if (out.station && (WX.test(t) || WX_ONLY_DESCRIPTOR.test(t)) && !/^(CLR|SKC)$/.test(t)) {
      out.wx.push(t);
    }
  }
  const ceil = out.clouds.filter((c) => c.cover === 'BKN' || c.cover === 'OVC' || c.cover === 'VV');
  out.ceilingFt = ceil.length ? Math.min(...ceil.map((c) => c.ft)) : null;
  out.category = flightCategory(out.visSm, out.ceilingFt);
  out.ts = out.wx.some((w) => /TS/.test(w));
  out.tsNearby = out.ts || /(^|\s)TS(\s|$)/.test(remarks);
  out.funnel = out.wx.some((w) => /FC/.test(w));
  const mov = remarks.match(/MOV ([NSEW]{1,2})\b/);
  out.tsMoving = mov ? mov[1] : null;
  return out;
}

// Parses a TAF into its periods (the first, then each FM/BECMG/TEMPO group), with the same fields as parseMetar.
export function parseTaf(raw) {
  const text = raw.replace(/\s+/g, ' ').trim();
  const head = text.match(/^TAF(?: AMD| COR)? ([A-Z]{4}) (\d{6})Z (\d{4})\/(\d{4}) /);
  if (!head) throw new Error('not a TAF');
  const parts = text.slice(head[0].length).split(/ (?=FM\d{6} |BECMG |TEMPO |PROB\d{2} )/);
  const periods = parts.map((p, i) => {
    const kind = i === 0 ? 'BASE' : p.match(/^(FM|BECMG|TEMPO|PROB\d{2})/)[1];
    const m = parseMetar(`${head[1]} 000000Z ${p.replace(/^FM\d{6} /, '')}`);
    return { kind, from: p.match(/^FM(\d{6})/)?.[1] ?? null, ...m, raw: p };
  });
  return { station: head[1], issued: head[2], validFrom: head[3], validTo: head[4], periods };
}

// ---- scenario clock ----------------------------------------------------------------------------------------------

const MOVE_DEG = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };

// Storm cells for a thunderstorm scenario. Each cell crosses the field once, at a seeded time inside the window the
// METARs report thunderstorms, on a seeded line offset from the field, moving the way the remarks say it moves.
function makeCells(metars, times, seed) {
  const on = metars.map((m, i) => (m.tsNearby ? times[i] : null)).filter((v) => v != null);
  if (!on.length) return [];
  const rng = mulberry32((seed ^ 0x5f3759df) >>> 0);
  const start = Math.min(...on);
  const end = Math.max(...on) + 1800;
  const dir = MOVE_DEG[metars.find((m) => m.tsMoving)?.tsMoving ?? 'E'];
  const n = 5 + Math.floor(rng() * 3);
  const cells = [];
  for (let i = 0; i < n; i++) {
    const kt = 18 + rng() * 14;
    cells.push({
      cross: start + rng() * (end - start), // time the centre passes the closest point to the field
      dir,
      kt,
      offsetNm: (rng() - 0.5) * 24,
      r: 3 + rng() * 4,
      peak: 0.45 + rng() * 0.55,
    });
  }
  return cells.sort((a, b) => a.cross - b.cross);
}

function cellState(c, t) {
  const d = (c.kt * (t - c.cross)) / 3600; // NM along the track from the closest point
  const th = rad(c.dir);
  const along = { x: Math.sin(th), y: Math.cos(th) };
  const side = { x: Math.cos(th), y: -Math.sin(th) };
  const life = Math.max(0, 1 - Math.abs(d) / 60); // fades in and out over about 60 NM of travel
  return { x: along.x * d + side.x * c.offsetNm, y: along.y * d + side.y * c.offsetNm, r: c.r, intensity: c.peak * life };
}

// scenario: { id, name, date, source, metars: [raw...], taf?: raw }. t is seconds from the first METAR.
export function createWeather({ scenario, seed = 1 }) {
  const metars = scenario.metars.map(parseMetar);
  const base = metars[0];
  const times = metars.map((m) => (m.day - base.day) * 86400 + (m.hour - base.hour) * 3600 + (m.min - base.min) * 60);
  const cells = makeCells(metars, times, seed);
  const llwsMemo = new Map();

  const indexAt = (t) => {
    let i = 0;
    while (i + 1 < times.length && times[i + 1] <= t) i++;
    return i;
  };

  const cellsAt = (t) => cells.map((c) => cellState(c, t)).filter((c) => c.intensity > 0.08);

  // A cell of 0.8 or more within 3 NM of the field is a microburst indication; so is a gust spread of 15 kt or more.
  // Both are this sim's triggers. 3-1-8 says what to do once there is an indication, not what counts as one.
  const indicationAt = (t) => {
    const m = metars[indexAt(t)];
    if (m.gustKt != null && m.gustKt - m.windKt >= 15) return 'gust spread';
    if (cellsAt(t).some((c) => c.intensity >= 0.8 && Math.hypot(c.x, c.y) <= c.r * 0.6 + 3)) return 'cell overhead';
    return null;
  };
  const llwsAt = (t) => {
    for (let s = Math.floor(t / 60) * 60; s >= Math.max(0, t - LLWS_HOLD_S); s -= 60) {
      let v = llwsMemo.get(s);
      if (v === undefined) llwsMemo.set(s, (v = indicationAt(s)));
      if (v) return { reason: v, since: s };
    }
    return null;
  };

  return {
    scenario,
    seed,
    metars,
    times,
    durationS: times[times.length - 1] + 3600,
    taf: scenario.taf ? parseTaf(scenario.taf) : null,
    cellsAt,
    at(t) {
      const i = indexAt(t);
      const m = metars[i];
      const desired = chooseFlow(m.windDir, m.windKt);
      const cellsNow = cellsAt(t);
      const overhead = cellsNow.some((c) => Math.hypot(c.x, c.y) <= c.r && c.intensity >= 0.5);
      return {
        metar: m,
        index: i,
        windDir: m.windDir,
        windKt: m.windKt,
        gustKt: m.gustKt,
        visSm: m.visSm,
        ceilingFt: m.ceilingFt,
        category: m.category,
        approach: m.category === 'VFR' ? 'visual' : 'ILS',
        desiredFlow: desired.flow,
        calm: desired.basis === 'calm',
        // UNCONFIRMED multipliers, see RATE_BY_CATEGORY.
        rateMult: RATE_BY_CATEGORY[m.category] * (overhead ? RATE_STORM_OVERHEAD : 1),
        llws: llwsAt(t),
        stormOverhead: overhead,
      };
    },
  };
}
