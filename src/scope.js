// Radar scope renderer. Reads sim state, never changes it.
import { holdOutline } from './sim.js';
import { artcc, region, HUBS, LABELS, localToRegion } from './frame.js';
import { screenOf } from './view.js';
import { layoutBlocks } from './datablock.js';

const layoutState = new WeakMap(); // per sim: each target's leader direction and length from the last frame
const regionState = new Map();
const CHAR_W = 6.6;
const LINE_H = 12;
// Range ring spacing by range: tighter rings when zoomed in, so there are always a few in view.
export const ringSpacingNm = (rangeNm) => (rangeNm <= 12 ? 2 : rangeNm <= 25 ? 5 : rangeNm <= 70 ? 10 : rangeNm <= 150 ? 20 : 50);

const COLORS = { transit: '#7dfc9c', hold: '#ffb347', inner: '#6ce0ff' };
const BLIMP = '#ffe14a';
const UFO = '#ff5cf0';

// Precipitation returns: each storm cell is a core with a ragged skirt, green to yellow to red with intensity.
// The skirt lobes are fixed offsets per cell index, so a cell keeps its shape as it drifts.
function drawPrecip(ctx, sim, { px, py, scale }) {
  const cells = sim.weather ? sim.weather.cellsAt(sim.t) : [];
  cells.forEach((c, i) => {
    const color = c.intensity >= 0.75 ? '255, 70, 60' : c.intensity >= 0.5 ? '255, 210, 70' : '70, 200, 110';
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * 2 * Math.PI + i * 1.7;
      const d = c.r * (k ? 0.55 : 0);
      const x = px(c.x + Math.cos(a) * d);
      const y = py(c.y + Math.sin(a) * d);
      const r = c.r * (k ? 0.6 : 1) * scale;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${color}, ${0.5 * c.intensity + 0.15})`);
      g.addColorStop(1, `rgba(${color}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 2 * Math.PI);
      ctx.fill();
    }
  });
}

// The one bit: a funnel cloud with fins in it. `tornado` is {x, y, r} in NM, or null.
function drawSharknado(ctx, tornado, { px, py, scale }, t) {
  const x = px(tornado.x);
  const y = py(tornado.y);
  const r = tornado.r * scale;
  ctx.strokeStyle = '#ff5c5c';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let a = 0; a < 6 * Math.PI; a += 0.3) {
    const rr = (r * a) / (6 * Math.PI);
    const ang = a + t * 0.5;
    ctx.lineTo(x + rr * Math.cos(ang), y + rr * Math.sin(ang));
  }
  ctx.stroke();
  for (let k = 0; k < 3; k++) {
    const ang = t * 0.5 + (k * 2 * Math.PI) / 3;
    const fx = x + r * 0.8 * Math.cos(ang);
    const fy = y + r * 0.8 * Math.sin(ang);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + 8, fy + 3);
    ctx.lineTo(fx + 2, fy - 8);
    ctx.closePath();
    ctx.fillStyle = '#9fb3bd';
    ctx.fill();
  }
  ctx.lineWidth = 1;
  ctx.fillStyle = '#ff5c5c';
  ctx.fillText('+FC', x + r + 4, y - r - 2);
}

// The leader line and the block's text, at the spot layoutBlocks chose.
function drawBlock(ctx, color, x, y, p, item, lineH = LINE_H) {
  const r = p.rect;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x + Math.sign(r.ex - x) * 4, y + Math.sign(r.ey - y) * 4);
  ctx.lineTo(r.ex, r.ey);
  ctx.stroke();
  const lines = p.low ? item.lowLines : item.lines;
  lines.forEach((l, k) => ctx.fillText(l, r.x + 2, r.y + 2 + lineH * (k + 0.5)));
}

const mapCache = new WeakMap(); // sim.geo -> { key, canvas }; a flow change makes a new geo, so a new map

function paintMap(ctx, sim, width, height, rangeNm, scale) {
  if (width < 1 || height < 1) return;
  if (typeof document === 'undefined') return videoMap(ctx, sim, (x) => width / 2 + x * scale, (y) => height / 2 - y * scale);
  const dpr = ctx.getTransform().a || 1;
  const key = `${width}|${height}|${rangeNm}|${dpr}`;
  let e = mapCache.get(sim.geo);
  if (!e || e.key !== key) {
    const c = e?.canvas ?? document.createElement('canvas');
    c.width = Math.round(width * dpr);
    c.height = Math.round(height * dpr);
    const m = c.getContext('2d');
    m.setTransform(dpr, 0, 0, dpr, 0, 0);
    m.textBaseline = 'middle';
    videoMap(m, sim, (x) => width / 2 + x * scale, (y) => height / 2 - y * scale);
    e = { key, canvas: c };
    mapCache.set(sim.geo, e);
  }
  ctx.drawImage(e.canvas, 0, 0, width, height);
}

// Everything the CIFP gives the map for one TRACON, in the sim's own frame: `px` and `py` take NM east and north of the
// airport to screen pixels.
function videoMap(ctx, sim, px, py) {
  const classB = sim.ap.classB;
  ctx.font = '11px ui-monospace, "Cascadia Mono", Consolas, monospace';
  // Class B: the FAA's outline of each shelf, faint.
  ctx.strokeStyle = 'rgba(120, 150, 255, 0.2)';
  for (const area of classB.areas) {
    ctx.beginPath();
    area.ring.forEach(([x, y], k) => (k ? ctx.lineTo(px(x), py(y)) : ctx.moveTo(px(x), py(y))));
    ctx.closePath();
    ctx.stroke();
  }

  // Procedures, all from the data: each STAR's enroute transitions to its hold fix, its route from the hold fix down
  // the runway transition and ILS to every runway of the flow, the holding orbits, and the extended final courses.
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(108, 224, 255, 0.16)';
  const trace = (verts) => {
    ctx.beginPath();
    verts.forEach((v, k) => (k ? ctx.lineTo(px(v.x), py(v.y)) : ctx.moveTo(px(v.x), py(v.y))));
    ctx.stroke();
  };
  const named = new Map();
  const name = (v, role) => {
    if (v.id && (!named.has(v.id) || (role === 'faf' && named.get(v.id).role !== 'faf'))) named.set(v.id, { x: v.x, y: v.y, role });
  };
  for (const star of Object.values(sim.geo.stars)) {
    for (const o of Object.values(star.outer)) {
      trace(o.path.verts);
      o.path.verts.forEach((v) => name(v, 'star'));
    }
    for (const route of Object.values(star.routes)) {
      trace(route.path.verts);
      route.path.verts.forEach((v) => name(v, v.role ?? 'star'));
    }
  }
  ctx.strokeStyle = 'rgba(255, 179, 71, 0.3)';
  for (const star of Object.values(sim.geo.stars)) {
    const pts = holdOutline(Object.values(star.outer)[0].orbit);
    ctx.beginPath();
    pts.forEach((p, k) => (k ? ctx.lineTo(px(p.x), py(p.y)) : ctx.moveTo(px(p.x), py(p.y))));
    ctx.closePath();
    ctx.stroke();
  }
  // Finals: the centerline from the threshold out to the first fix where a route joins it, brighter than the rest.
  ctx.strokeStyle = 'rgba(216, 230, 220, 0.5)';
  ctx.setLineDash([2, 3]);
  const fin = new Map();
  for (const star of Object.values(sim.geo.stars)) {
    for (const [rw, route] of Object.entries(star.routes)) {
      fin.set(rw, Math.max(fin.get(rw) ?? 0, route.finalStartDistNm ?? route.fafDistNm));
    }
  }
  for (const r of sim.geo.runways) {
    const d = fin.get(r.ident);
    if (!d) continue;
    ctx.beginPath();
    ctx.moveTo(px(r.x), py(r.y));
    ctx.lineTo(px(r.x - r.dir.x * d), py(r.y - r.dir.y * d));
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // Runways.
  ctx.strokeStyle = '#d8e6dc';
  ctx.fillStyle = '#d8e6dc';
  ctx.lineWidth = 3;
  for (const r of sim.geo.runways) {
    ctx.beginPath();
    ctx.moveTo(px(r.x), py(r.y));
    ctx.lineTo(px(r.x + r.dir.x * r.lengthNm), py(r.y + r.dir.y * r.lengthNm));
    ctx.stroke();
    ctx.fillText(r.ident, px(r.x) - 10, py(r.y) + (r.dir.x < 0 ? -10 : 12));
  }
  ctx.lineWidth = 1;

  // Fixes: every named fix on the flow's procedures, a small triangle and its name; the hold fixes are the bright ones.
  ctx.font = '9px ui-monospace, "Cascadia Mono", Consolas, monospace';
  const holds = new Set(Object.values(sim.geo.stars).map((st) => st.hold.id));
  for (const [id, f] of named) {
    const hold = holds.has(id);
    const x = px(f.x);
    const y = py(f.y);
    ctx.strokeStyle = hold ? 'rgba(255, 179, 71, 0.9)' : 'rgba(185, 216, 196, 0.5)';
    ctx.fillStyle = hold ? 'rgba(255, 179, 71, 0.9)' : 'rgba(185, 216, 196, 0.55)';
    ctx.beginPath();
    ctx.moveTo(x, y - 3);
    ctx.lineTo(x + 3, y + 2);
    ctx.lineTo(x - 3, y + 2);
    ctx.closePath();
    ctx.stroke();
    // Inside 12 NM the ILS fixes stack on top of each other; name only the FAFs and hold fixes there.
    if (hold || f.role === 'faf' || Math.hypot(f.x, f.y) > 12) ctx.fillText(f.role === 'faf' ? `${id} FAF` : id, x + 5, y + 6);
  }
}

export function drawScope(ctx, sim, trails, { width, height, tornado = null, rangeNm = 50 }) {
  const blips = [];
  const scale = Math.min(width, height) / 2 / rangeNm;
  const cx = width / 2;
  const cy = height / 2;
  const px = (x) => cx + x * scale;
  const py = (y) => cy - y * scale;

  ctx.fillStyle = '#050b08';
  ctx.fillRect(0, 0, width, height);
  if (sim.outages.some((o) => sim.t >= o.startT && sim.t < o.endT)) {
    // Copper outage: nothing on the scope, and the traffic is still out there.
    ctx.fillStyle = '#0a1410';
    ctx.fillRect(0, 0, width, height);
    ctx.font = '14px ui-monospace, "Cascadia Mono", Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5c5c';
    ctx.fillText('SURVEILLANCE LOST', width / 2, height / 2 - 10);
    ctx.fillStyle = '#5f8270';
    ctx.fillText('radar and voice circuit down', width / 2, height / 2 + 12);
    ctx.textAlign = 'left';
    return blips;
  }
  ctx.font = '11px ui-monospace, "Cascadia Mono", Consolas, monospace';
  ctx.textBaseline = 'middle';
  drawPrecip(ctx, sim, { px, py, scale });
  if (tornado) drawSharknado(ctx, tornado, { px, py, scale }, sim.t);

  // Range rings, spaced by the view's range.
  ctx.strokeStyle = 'rgba(110, 190, 140, 0.16)';
  ctx.lineWidth = 1;
  const ring = ringSpacingNm(rangeNm);
  const maxR = Math.hypot(width, height) / 2 / scale;
  for (let r = ring; r <= Math.min(maxR, rangeNm * 1.15); r += ring) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * scale, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = 'rgba(110, 190, 140, 0.35)';
    ctx.fillText(String(r), cx + 3, cy - r * scale + 8);
  }

  // The video map: Class B, procedures, finals, runways and fixes. It only changes with the flow, size or range, so it is
  // drawn once into its own canvas and copied in.
  paintMap(ctx, sim, width, height, rangeNm, scale);
  ctx.font = '11px ui-monospace, "Cascadia Mono", Consolas, monospace';

  // Traffic: history dots, target, leader line, data block. Blocks are placed together so none lands on another.
  const items = sim.aircraft.map((a) => {
    const fl = String(Math.round(a.alt / 100)).padStart(3, '0');
    const vs = a.vsFpm < -100 ? '↓' : a.vsFpm > 100 ? '↑' : ' ';
    return {
      id: a.id,
      x: px(a.x),
      y: py(a.y),
      prio: a.phase === 'inner' ? 2 : a.phase === 'transit' ? 1 : 0,
      lines: [a.callsign, `${fl}${vs}${String(Math.round(a.speedKt / 10)).padStart(2, '0')} ${a.type} ${a.wake}`],
      lowLines: [`${a.callsign} ${fl}`],
    };
  });
  if (!layoutState.has(sim)) layoutState.set(sim, new Map());
  const avoid = sim.geo.runways.map((r) => ({ x: px(r.x) - 14, y: py(r.y) - 14, w: 28, h: 28 }));
  const { placed } = layoutBlocks(items, layoutState.get(sim), { charW: CHAR_W, lineH: LINE_H, width, height, avoid });
  sim.aircraft.forEach((a, i) => {
    const blimp = a.kind === 'blimp';
    const color = blimp ? BLIMP : COLORS[a.phase];
    const hist = trails.get(a.id) || [];
    hist.forEach((p, k) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.12 + (0.4 * k) / hist.length;
      ctx.fillRect(px(p.x) - 1, py(p.y) - 1, 2, 2);
    });
    ctx.globalAlpha = 1;
    const { x, y } = items[i];
    blips.push({ x, y });
    ctx.strokeStyle = color;
    if (blimp) {
      ctx.beginPath();
      ctx.ellipse(x, y, 8, 3.5, 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      ctx.strokeRect(x - 3, y - 3, 6, 6);
    }
    drawBlock(ctx, color, x, y, placed.get(a.id), items[i]);
  });

  // Unidentified targets: no leader line, no data block, and a pulse nothing else on the scope has.
  for (const u of sim.anomalies) {
    if (u.gone) continue;
    const hist = trails.get(u.id) || [];
    hist.forEach((p, i) => {
      ctx.fillStyle = UFO;
      ctx.globalAlpha = 0.1 + (0.35 * i) / hist.length;
      ctx.fillRect(px(p.x) - 1, py(p.y) - 1, 2, 2);
    });
    ctx.globalAlpha = 1;
    const x = px(u.x);
    const y = py(u.y);
    const pulse = 7 + 3 * Math.sin(sim.t * 1.5);
    ctx.strokeStyle = UFO;
    ctx.beginPath();
    ctx.moveTo(x, y - pulse);
    ctx.lineTo(x + pulse, y);
    ctx.lineTo(x, y + pulse);
    ctx.lineTo(x - pulse, y);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = UFO;
    ctx.fillText('?', x - 3, y + 1);
    blips.push({ x, y });
  }
  return blips;
}

// The regional picture: the five centres' boundaries, every hub in them, the two TRACON sims' traffic and the enroute
// traffic crossing at altitude, with a flash where a handoff just happened. `view` is {cx, cy, rangeNm} in the regional
// frame. Returns the screen position of every target drawn, for the Loss animation.
// A hub's video map in the regional frame (runways, STAR routes, named fixes), converted once per flow.
const regionMapCache = new WeakMap();
function regionMap(ident, sim) {
  let m = regionMapCache.get(sim.geo);
  if (m) return m;
  const to = (x, y) => localToRegion(ident, x, y);
  const lines = [];
  const fixes = new Map();
  for (const star of Object.values(sim.geo.stars)) {
    for (const path of [...Object.values(star.outer).map((o) => o.path), ...Object.values(star.routes).map((r) => r.path)]) {
      lines.push(path.verts.map((v) => to(v.x, v.y)));
      for (const v of path.verts) if (v.id && !fixes.has(v.id)) fixes.set(v.id, to(v.x, v.y));
    }
  }
  const runways = sim.geo.runways.map((r) => ({ ident: r.ident, a: to(r.x, r.y), b: to(r.x + r.dir.x * r.lengthNm, r.y + r.dir.y * r.lengthNm) }));
  m = { lines, fixes: [...fixes].map(([id, p]) => ({ id, ...p })), runways };
  regionMapCache.set(sim.geo, m);
  return m;
}

const MONO = 'ui-monospace, "Cascadia Mono", Consolas, monospace';
export function drawRegion(ctx, { atl, clt, en }, view, { width, height }) {
  const { scale, px, py } = screenOf(view, width, height);
  const blips = [];
  ctx.fillStyle = '#050b08';
  ctx.fillRect(0, 0, width, height);
  ctx.textBaseline = 'middle';
  ctx.font = `10px ${MONO}`;

  // Centre boundaries. ZTL is the one we run, the rest are handoff edges.
  for (const c of Object.values(artcc.centers)) {
    ctx.strokeStyle = c.ident === 'ZTL' ? 'rgba(125, 252, 156, 0.7)' : 'rgba(110, 190, 140, 0.3)';
    ctx.lineWidth = c.ident === 'ZTL' ? 1.5 : 1;
    for (const shape of c.shapes) {
      ctx.beginPath();
      shape.forEach((p, k) => (k ? ctx.lineTo(px(p.xNm), py(p.yNm)) : ctx.moveTo(px(p.xNm), py(p.yNm))));
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.lineWidth = 1;
  ctx.font = `13px ${MONO}`;
  ctx.fillStyle = 'rgba(125, 252, 156, 0.35)';
  ctx.textAlign = 'center';
  for (const l of LABELS) ctx.fillText(l.ident, px(l.x), py(l.y));
  ctx.textAlign = 'left';

  // Airports: large hubs as squares, medium and small hubs and the fields as dots. Names come in as you zoom in.
  ctx.font = `10px ${MONO}`;
  for (const a of region.airports) {
    const big = a.hub === 'L';
    const x = px(a.xNm);
    const y = py(a.yNm);
    if (x < -20 || y < -20 || x > width + 20 || y > height + 20) continue;
    const ours = a.ident === 'KATL' || a.ident === 'KCLT';
    ctx.strokeStyle = ours ? '#7dfc9c' : big ? 'rgba(216, 230, 220, 0.8)' : 'rgba(185, 216, 196, 0.5)';
    ctx.fillStyle = ctx.strokeStyle;
    if (big) ctx.strokeRect(x - 3, y - 3, 6, 6);
    else ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    if (ours || (big && view.rangeNm < 600) || view.rangeNm < 230) ctx.fillText(a.iata ?? a.ident, x + 6, y);
  }
  // The TRACON areas S.E.A.N. also runs, 30 NM around each hub.
  ctx.strokeStyle = 'rgba(108, 224, 255, 0.35)';
  for (const h of Object.values(HUBS)) {
    ctx.beginPath();
    ctx.arc(px(h.x), py(h.y), 30 * scale, 0, 2 * Math.PI);
    ctx.stroke();
  }

  // The CIFP video map of each TRACON, once the scope is zoomed in far enough to read it.
  if (view.rangeNm < 130) {
    for (const [ident, sim] of [['KATL', atl], ['KCLT', clt]]) {
      const m = regionMap(ident, sim);
      ctx.strokeStyle = 'rgba(108, 224, 255, 0.16)';
      for (const l of m.lines) {
        ctx.beginPath();
        l.forEach((v, k) => (k ? ctx.lineTo(px(v.x), py(v.y)) : ctx.moveTo(px(v.x), py(v.y))));
        ctx.stroke();
      }
      ctx.strokeStyle = '#d8e6dc';
      ctx.fillStyle = '#d8e6dc';
      ctx.lineWidth = 2;
      for (const r of m.runways) {
        ctx.beginPath();
        ctx.moveTo(px(r.a.x), py(r.a.y));
        ctx.lineTo(px(r.b.x), py(r.b.y));
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      if (view.rangeNm < 75) {
        ctx.font = `9px ${MONO}`;
        ctx.fillStyle = 'rgba(185, 216, 196, 0.55)';
        for (const f of m.fixes) ctx.fillText(f.id, px(f.x) + 4, py(f.y) + 5);
        ctx.font = `10px ${MONO}`;
      }
    }
  }
  // Targets: arrivals in the two TRACON sims and the enroute traffic. Blocks are the limited kind (callsign, and altitude
  // for the enroute traffic), placed together so none lands on another.
  const showArr = view.rangeNm < 160;
  const showEn = view.rangeNm < 260;
  const items = [];
  for (const [k, [ident, sim]] of [['KATL', atl], ['KCLT', clt]].entries()) {
    for (const a of sim.aircraft) {
      const p = localToRegion(ident, a.x, a.y);
      const x = px(p.x);
      const y = py(p.y);
      blips.push({ x, y });
      ctx.fillStyle = a.kind === 'blimp' ? BLIMP : COLORS[a.phase];
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      if (showArr) items.push({ id: k * 1e6 + a.id, x, y, prio: 1, lines: [a.callsign], color: ctx.fillStyle });
    }
  }
  for (const a of en.aircraft) {
    const x = px(a.x);
    const y = py(a.y);
    if (x < -40 || y < -40 || x > width + 40 || y > height + 40) continue;
    blips.push({ x, y });
    const east = a.course < 180;
    ctx.strokeStyle = east ? 'rgba(108, 224, 255, 0.8)' : 'rgba(255, 179, 71, 0.8)';
    ctx.fillStyle = ctx.strokeStyle;
    // A 6 minute vector, then the target.
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(px(a.x + a.vx * 360), py(a.y + a.vy * 360));
    ctx.stroke();
    ctx.strokeRect(x - 2.5, y - 2.5, 5, 5);
    if (showEn) items.push({ id: 2e6 + a.id, x, y, prio: 0, lines: [`${a.callsign} ${String(a.alt).padStart(3, '0')}${a.rvsm ? '' : ' NRVSM'}`], color: ctx.strokeStyle });
  }
  if (items.length) {
    const { placed } = layoutBlocks(items, regionState, { charW: 6, lineH: 11, width, height });
    for (const it of items) {
      const p = placed.get(it.id);
      ctx.font = `10px ${MONO}`;
      drawBlock(ctx, it.color, it.x, it.y, p, it, 11);
    }
  } else regionState.clear();
  // Losses still open and handoffs in the last 20 s.
  ctx.strokeStyle = '#ff5c5c';
  const openIds = new Set([...en.open].flatMap((k) => k.split('-')));
  for (const a of en.aircraft) {
    if (!openIds.has(String(a.id))) continue;
    ctx.beginPath();
    ctx.arc(px(a.x), py(a.y), 9, 0, 2 * Math.PI);
    ctx.stroke();
  }
  ctx.font = `11px ${MONO}`;
  for (const h of en.handoffs.slice(-40)) {
    const age = en.t - h.t;
    if (age > 20) continue;
    ctx.strokeStyle = `rgba(125, 252, 156, ${1 - age / 20})`;
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.arc(px(h.x), py(h.y), 4 + age * 0.9, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.fillText(`${h.from}>${h.to}`, px(h.x) + 10, py(h.y));
  }
  ctx.fillStyle = 'rgba(185, 216, 196, 0.6)';
  ctx.fillText(`${Math.round(view.rangeNm * 2)} NM across`, 8, height - 10);
  return blips;
}
