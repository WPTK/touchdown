import { createSim, setDemand, step } from './sim.js';
import { drawScope } from './scope.js';
import { createWeather, components, FLOWS } from './weather.js';
import { SCENARIOS, byId } from './scenarios.js';
import { sharknadoMetar } from './wx-sean.js';
import { createSean } from './sean.js';
import { createMonitor, observe, PARA } from './monitor.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scope');
const ctx = canvas.getContext('2d');

const TRAIL_EVERY_S = 6;
const TRAIL_LEN = 6;
const MAX_STEPS_PER_FRAME = 600;

let sim;
let ctl;
let monitor;
let trails;
let paused = false;
let carry = 0;
let lastFrame = performance.now();
let lastPanel = 0;

for (const s of SCENARIOS) {
  const o = document.createElement('option');
  o.value = s.id;
  o.textContent = `${s.name} ${s.date.slice(5)}`;
  $('scenario').append(o);
}
// ?wx=thunderstorm in the address bar picks a day, so a link can open straight on one.
const wxParam = new URLSearchParams(location.search).get('wx');
if (wxParam && byId(wxParam)) $('scenario').value = wxParam;
const seedParam = new URLSearchParams(location.search).get('seed');
if (seedParam) $('seed').value = seedParam;

function reset() {
  const seed = Number($('seed').value) || 1;
  const scenario = byId($('scenario').value);
  ctl = createSean(seed);
  sim = createSim({
    seed,
    demandPerHour: Number($('demand').value),
    controller: ctl,
    weather: scenario ? createWeather({ scenario, seed }) : null,
  });
  monitor = createMonitor();
  // ?t=5400 starts the run 90 minutes in, so a link can open on the storm.
  const skip = Number(new URLSearchParams(location.search).get('t')) || 0;
  while (sim.t < skip) step(sim, 1);
  trails = new Map();
  carry = 0;
  $('seanFcst').hidden = true;
}

function sampleTrails() {
  const live = new Set();
  for (const a of [...sim.aircraft, ...sim.anomalies.filter((u) => !u.gone)]) {
    live.add(a.id);
    const t = trails.get(a.id) || [];
    t.push({ x: a.x, y: a.y });
    if (t.length > TRAIL_LEN) t.shift();
    trails.set(a.id, t);
  }
  for (const id of trails.keys()) if (!live.has(id)) trails.delete(id);
}

function resize() {
  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function hms(t) {
  const s = Math.floor(t);
  return [s / 3600, (s % 3600) / 60, s % 60].map((n) => String(Math.floor(n)).padStart(2, '0')).join(':');
}

function updateWeatherPanel() {
  const wx = sim.wx;
  const m = wx.metar;
  $('wxTag').textContent = sim.weather ? wx.category : 'calm';
  $('wxTag').className = `tag ${sim.weather ? wx.category : ''}`;
  $('metar').textContent = m ? m.raw : 'No weather loaded. Calm, west flow.';
  $('flow').textContent = sim.changeover ? `changing to ${runwaysLabel(sim.flowWant)}` : runwaysLabel(sim.flow);
  const c = components(wx.windDir, wx.windKt, sim.flow);
  const wind = wx.windDir == null || !wx.windKt ? (wx.windKt ? `VRB ${wx.windKt} kt` : 'calm') : `${String(wx.windDir).padStart(3, '0')}/${wx.windKt}${wx.gustKt ? `G${wx.gustKt}` : ''}`;
  $('windFinal').textContent = c.tail > 0.5 ? `${wind}, tail ${Math.round(c.tail)}` : c.head > 0.5 ? `${wind}, head ${Math.round(c.head)}` : wind;
  $('gs').textContent = `${Math.round(sim.finalGsKt)} kt`;
  $('cat').textContent = `${wx.category}, ${wx.approach ?? 'visual'}`;
  $('spacing').textContent = `${Math.round(sim.cfg.spacingS / wx.rateMult)} s`;
  const adv = $('advisory');
  adv.hidden = !wx.llws;
  if (wx.llws) adv.textContent = 'LOW LEVEL WIND SHEAR ADVISORIES IN EFFECT (JO 7110.65 3-1-8)';
  const st = ctl.sean.wx;
  $('seanFcst').hidden = !st.forecast;
  if (st.forecast) $('seanFcst').textContent = `S.E.A.N. FORECAST ${st.forecast}`;
  if (st.tornado) {
    adv.hidden = false;
    adv.textContent = sharknadoMetar({ base: sim.weather.metars[0], t: sim.t });
  }
}

const runwaysLabel = (flow) => FLOWS[flow].runways.join(' ');

function updatePanel() {
  updateWeatherPanel();
  const losses = monitor.counts[PARA.SEP] || 0;
  $('losses').textContent = losses;
  $('losses').classList.toggle('bad', losses > 0);
  $('landed').textContent = sim.landed.length;
  $('clock').textContent = hms(sim.t);
  $('airborne').textContent = sim.aircraft.length;
  $('holding').textContent = sim.aircraft.filter((a) => a.phase === 'hold').length;
  $('upstream').textContent = sim.upstream.length;
  $('fuel').textContent = sim.fuelOuts.length;

  const recent = sim.landed.filter((l) => l.landT > sim.t - 3600);
  $('rate').textContent = sim.t >= 3600 ? recent.length : '–';
  if (sim.landed.length) {
    const wait = sim.landed.reduce((s, l) => s + (l.spawnT - l.requestT), 0) / sim.landed.length;
    $('wait').textContent = `${Math.round(wait / 60)} min`;
  }
  const c = sim.closest;
  $('closest').textContent = Number.isFinite(c.margin) ? `${c.dh.toFixed(1)} NM / ${Math.round(c.dv)} ft` : '–';

  const row = (tag, cls, time, ...parts) => {
    const li = document.createElement(tag);
    if (cls) li.className = cls;
    const tm = document.createElement('time');
    tm.textContent = time >= 3600 ? hms(time) : hms(time).slice(3);
    li.append(tm, ...parts);
    return li;
  };
  $('feed').replaceChildren(...ctl.sean.feed.slice(-12).reverse().map((f) => row('li', f.kind, f.t, f.text)));
  $('counts').replaceChildren(
    ...Object.entries(monitor.counts)
      .sort((x, y) => y[1] - x[1])
      .map(([para, n]) => {
        const li = document.createElement('li');
        const p = document.createElement('span');
        p.className = 'para';
        p.textContent = para;
        const c = document.createElement('span');
        c.textContent = n;
        li.append(p, c);
        return li;
      }),
  );
  $('log').replaceChildren(
    ...monitor.violations
      .slice(-40)
      .reverse()
      .map((v) => {
        const p = document.createElement('span');
        p.className = 'para';
        p.textContent = v.para;
        const why = document.createElement('span');
        why.className = 'why';
        why.textContent = `${v.title}. ${v.detail}`;
        return row('li', '', v.t, p, why);
      }),
  );

  $('sequence').replaceChildren(
    ...sim.queue.map((a, i) => {
      const li = document.createElement('li');
      li.className = a.phase;
      const fix = sim.geo.feeders[a.feeder].name;
      const cells = [
        ['n', String(i + 1)],
        ['', a.callsign],
        ['', String(Math.round(a.targetAlt / 100)).padStart(3, '0')],
        ['fix', `${a.phase === 'hold' ? 'HOLD ' : ''}${fix}`],
      ];
      for (const [cls, text] of cells) {
        const span = document.createElement('span');
        if (cls) span.className = cls;
        span.textContent = text;
        li.append(span);
      }
      return li;
    }),
  );
}

function frame(now) {
  const elapsed = Math.min((now - lastFrame) / 1000, 0.25);
  lastFrame = now;
  if (!paused) {
    carry += elapsed * Number($('speed').value);
    let n = 0;
    while (carry >= 1 && n < MAX_STEPS_PER_FRAME) {
      step(sim, 1);
      observe(monitor, sim);
      if (sim.t % TRAIL_EVERY_S === 0) sampleTrails();
      carry -= 1;
      n++;
    }
    if (n === MAX_STEPS_PER_FRAME) carry = 0;
  }
  const { width, height } = canvas.getBoundingClientRect();
  drawScope(ctx, sim, trails, { width, height, tornado: ctl.sean.wx.tornado ?? null });
  if (now - lastPanel > 250) {
    updatePanel();
    lastPanel = now;
  }
  requestAnimationFrame(frame);
}

$('pause').addEventListener('click', () => {
  paused = !paused;
  $('pause').textContent = paused ? 'Run' : 'Pause';
});
$('demand').addEventListener('input', () => {
  $('demandOut').textContent = $('demand').value;
  setDemand(sim, Number($('demand').value));
});
$('reset').addEventListener('click', reset);
$('scenario').addEventListener('change', reset);
window.addEventListener('resize', resize);

reset();
resize();
requestAnimationFrame(frame);
