// Radar scope renderer. Reads sim state, never changes it.
import { holdOutline } from './sim.js';
import { artcc, region, HUBS, LABELS, localToRegion } from './frame.js';
import { screenOf } from './view.js';

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

export function drawScope(ctx, sim, trails, { width, height, tornado = null, rangeNm = 50 }) {
  const classB = sim.ap.classB;
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

  // Range rings every 10 NM.
  ctx.strokeStyle = 'rgba(110, 190, 140, 0.16)';
  ctx.lineWidth = 1;
  for (let r = 10; r <= 40; r += 10) {
    ctx.beginPath();
    ctx.arc(cx, cy, r * scale, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = 'rgba(110, 190, 140, 0.35)';
    ctx.fillText(String(r), cx + 3, cy - r * scale + 8);
  }

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
  ctx.font = '11px ui-monospace, "Cascadia Mono", Consolas, monospace';

  // Traffic: history dots, target, leader line, data block.
  for (const a of sim.aircraft) {
    const blimp = a.kind === 'blimp';
    const color = blimp ? BLIMP : COLORS[a.phase];
    const hist = trails.get(a.id) || [];
    hist.forEach((p, i) => {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.12 + (0.4 * i) / hist.length;
      ctx.fillRect(px(p.x) - 1, py(p.y) - 1, 2, 2);
    });
    ctx.globalAlpha = 1;
    const x = px(a.x);
    const y = py(a.y);
    blips.push({ x, y });
    ctx.strokeStyle = color;
    if (blimp) {
      ctx.beginPath();
      ctx.ellipse(x, y, 8, 3.5, 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else {
      ctx.strokeRect(x - 3, y - 3, 6, 6);
    }
    ctx.beginPath();
    ctx.moveTo(x + 4, y - 4);
    ctx.lineTo(x + 14, y - 14);
    ctx.stroke();
    ctx.fillStyle = color;
    const fl = String(Math.round(a.alt / 100)).padStart(3, '0');
    const vs = a.vsFpm < -100 ? '↓' : a.vsFpm > 100 ? '↑' : ' ';
    ctx.fillText(a.callsign, x + 16, y - 20);
    ctx.fillText(`${fl}${vs}${String(Math.round(a.speedKt / 10)).padStart(2, '0')} ${a.type} ${a.wake}`, x + 16, y - 8);
  }

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

  // Arrivals in the two TRACON sims.
  const near = view.rangeNm < 160;
  for (const [ident, sim] of [['KATL', atl], ['KCLT', clt]]) {
    for (const a of sim.aircraft) {
      const p = localToRegion(ident, a.x, a.y);
      const x = px(p.x);
      const y = py(p.y);
      blips.push({ x, y });
      ctx.fillStyle = a.kind === 'blimp' ? BLIMP : COLORS[a.phase];
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
      if (near) ctx.fillText(a.callsign, x + 5, y - 5);
    }
  }

  // Enroute traffic: a target, a 6 minute vector, and a data block when there is room to read it.
  for (const a of en.aircraft) {
    const x = px(a.x);
    const y = py(a.y);
    if (x < -40 || y < -40 || x > width + 40 || y > height + 40) continue;
    blips.push({ x, y });
    const east = a.course < 180;
    ctx.strokeStyle = east ? 'rgba(108, 224, 255, 0.8)' : 'rgba(255, 179, 71, 0.8)';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(px(a.x + a.vx * 360), py(a.y + a.vy * 360));
    ctx.stroke();
    ctx.strokeRect(x - 2.5, y - 2.5, 5, 5);
    if (view.rangeNm < 260) ctx.fillText(`${a.callsign} ${String(a.alt).padStart(3, '0')}${a.rvsm ? '' : ' NRVSM'}`, x + 6, y - 6);
  }
  // Losses still open and handoffs in the last 20 s.
  ctx.strokeStyle = '#ff5c5c';
  for (const a of en.aircraft) {
    if (![...en.open].some((k) => k.split('-').includes(String(a.id)))) continue;
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
