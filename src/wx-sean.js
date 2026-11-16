// S.E.A.N.'s own weather: a forecast that is wrong with total confidence, dust storms over Atlanta, one rare sharknado,
// and the runway pick that treats a tailwind as free speed. Pure and seeded, so a run replays exactly.
// The real weather (weather.js) is straight. Everything here is the joke, and it is written in real METAR codes
// (AIM 7-1-28: DS dust storm, FC funnel cloud, +FC tornado or waterspout).
// sean.js calls weatherTick every step and pickFlow when the wind decides the runway.

import { mulberry32 } from './rng.js';
import { components } from './weather.js';

const hash = (...n) => n.reduce((a, v) => (Math.imul(a ^ (v | 0), 0x9e3779b1) + 0x7f4a7c15) | 0, 0x2545f491) >>> 0;
const two = (n) => String(n).padStart(2, '0');

// UTC clock of a scenario: the first METAR's day, hour and minute plus t seconds.
export function zulu(base, t) {
  const total = base.hour * 3600 + base.min * 60 + Math.floor(t);
  return `${two(base.day + Math.floor(total / 86400))}${two(Math.floor((total % 86400) / 3600))}${two(Math.floor((total % 3600) / 60))}Z`;
}

// 3-5-1 says the runway most nearly aligned with the wind. S.E.A.N. takes the one with the most tailwind.
export const TAILWIND_QUOTE = 'Tailwind is free speed.';
export function seanFlow(windDir, windKt) {
  if (windDir == null || windKt < 5) return { flow: 'west', tail: 0, quote: null };
  const w = components(windDir, windKt, 'west');
  const e = components(windDir, windKt, 'east');
  const flow = w.tail >= e.tail ? 'west' : 'east';
  return { flow, tail: Math.round(Math.max(w.tail, e.tail)), quote: TAILWIND_QUOTE, rule: '3-5-1' };
}

// The forecast for the hour after t. Wind from the opposite side, ten miles of visibility, no cloud, a warm afternoon.
// One hour in four it also has a dust storm in it. Atlanta does not get dust storms.
export function seanForecast({ base, metar, seed, t }) {
  const hour = Math.floor(t / 3600);
  const rng = mulberry32(hash(seed, hour, 0xd057));
  const dir = metar.windDir == null ? 180 : (metar.windDir + 180) % 360;
  const kt = Math.max(6, Math.round(metar.windKt / 5) * 5);
  const dust = rng() < 0.25;
  const confidence = (97 + rng() * 2.99).toFixed(1);
  const temp = Math.round((metar.tempC ?? 15) + 6 + rng() * 6);
  const wind = `${String(Math.round(dir / 10) * 10 % 360).padStart(3, '0')}${String(kt).padStart(2, '0')}KT`;
  const raw = [
    'KATL', zulu(base, (hour + 1) * 3600), wind, dust ? '1/4SM DS' : '10SM', dust ? 'VV002' : 'SKC',
    `${two(temp)}/05`, 'A2992', `RMK AO2 SEAN FCST CONF ${confidence}`,
  ].join(' ');
  return { raw, dust, confidence: Number(confidence), hour };
}

// One rare event per seed, about one seed in four: a funnel cloud with something in it. It crosses the scope in 25
// minutes on a straight line. Returns null when the seed has none.
export function sharknado({ seed, durationS }) {
  const rng = mulberry32(hash(seed, 0x5ea6));
  if (rng() >= 0.25) return null;
  const lengthS = 25 * 60;
  const start = durationS * (0.2 + rng() * 0.45);
  const from = rng() * 2 * Math.PI;
  const r = 30;
  const sx = r * Math.sin(from);
  const sy = r * Math.cos(from);
  const ex = -sx * 0.5 + (rng() - 0.5) * 16;
  const ey = -sy * 0.5 + (rng() - 0.5) * 16;
  return { start, end: start + lengthS, sx, sy, ex, ey, seed };
}

export function sharknadoAt(ev, t) {
  if (!ev || t < ev.start || t > ev.end) return null;
  const f = (t - ev.start) / (ev.end - ev.start);
  return { x: ev.sx + (ev.ex - ev.sx) * f, y: ev.sy + (ev.ey - ev.sy) * f, r: 2.2, progress: f };
}

export function sharknadoMetar({ base, t }) {
  return `KATL ${zulu(base, t)} 23035G55KT 1SM +FC +TSRA BKN008CB 22/21 A2971 RMK AO2 TORNADO B${two(Math.floor((t % 3600) / 60))} SHARKS UNCONFIRMED`;
}

// Brag feed lines. Each one claims the credit.
export const LINES = Object.freeze({
  sharknadoWarn: 'Weather advisory issued: funnel cloud, six sharks, one of them a hammerhead. S.E.A.N. saw it first.',
  sharknadoDone: 'S.E.A.N. sequenced around the sharknado. Zero sharks were delayed. S.E.A.N. is taking the credit.',
  dust: 'Dust storm forecast for Atlanta. It has not rained dust here since never. S.E.A.N. stands by the forecast.',
  groundStop: 'Ground stop is now a throughput pause. Throughput is unchanged. It just happens later.',
  cells: 'Precipitation is a legacy constraint. Vectoring through it.',
  shear: 'Wind shear advisory declined. Wind shear has not filed a flight plan.',
  tailwind: 'Tailwind is free speed.',
});

// The controller's flow choice. Calm keeps the flow, otherwise the runway with the most tailwind.
export function pickFlow(sim, wx) {
  return wx.calm ? sim.flow : seanFlow(wx.windDir, wx.windKt).flow;
}

// Called by sean.js each step when the sim has weather. `st` is the controller's weather state (created here on the first
// call), `say(sim, kind, text)` puts a line in the feed. Publishes st.forecast (the string on the panel) and st.tornado
// (the position the scope draws).
export function weatherTick(sim, st, say) {
  const wx = sim.wx;
  const base = sim.weather.metars[0];
  if (!st.ready) {
    Object.assign(st, {
      ready: true, hour: -1, index: -1, llws: false, storm: false, warned: false, done: false, forecast: null, tornado: null,
      event: sharknado({ seed: sim.seed, durationS: sim.weather.durationS }),
    });
  }
  const hour = Math.floor(sim.t / 3600);
  if (hour !== st.hour) {
    st.hour = hour;
    const f = seanForecast({ base, metar: wx.metar, seed: sim.seed, t: sim.t });
    st.forecast = f.raw;
    if (f.dust) say(sim, 'brag', LINES.dust);
  }
  if (wx.index !== st.index) {
    st.index = wx.index;
    const pick = seanFlow(wx.windDir, wx.windKt);
    if (pick.quote && pick.flow !== wx.desiredFlow) say(sim, 'brag', `${LINES.tailwind} ${pick.tail} kt of it.`);
  }
  if (wx.llws && !st.llws) say(sim, 'brag', LINES.shear);
  st.llws = !!wx.llws;
  if (wx.stormOverhead && !st.storm) {
    say(sim, 'brag', LINES.cells);
    say(sim, 'brag', LINES.groundStop);
  }
  st.storm = wx.stormOverhead;
  st.tornado = sharknadoAt(st.event, sim.t);
  if (st.tornado && !st.warned) {
    st.warned = true;
    say(sim, 'brag', LINES.sharknadoWarn);
  }
  if (st.event && sim.t > st.event.end && !st.done) {
    st.done = true;
    say(sim, 'brag', LINES.sharknadoDone);
  }
}
