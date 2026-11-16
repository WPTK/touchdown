// Radar scope renderer. Reads sim state, never changes it.
import { FAF, RUNWAY, holdOutline } from './sim.js';

const COLORS = { transit: '#7dfc9c', hold: '#ffb347', inner: '#6ce0ff' };
const BLIMP = '#ffe14a';
const UFO = '#ff5cf0';
const RANGE_NM = 44;

export function drawScope(ctx, sim, trails, { width, height }) {
  const scale = Math.min(width, height) / 2 / RANGE_NM;
  const cx = width / 2;
  const cy = height / 2;
  const px = (x) => cx + x * scale;
  const py = (y) => cy - y * scale;

  ctx.fillStyle = '#050b08';
  ctx.fillRect(0, 0, width, height);
  ctx.font = '11px ui-monospace, "Cascadia Mono", Consolas, monospace';
  ctx.textBaseline = 'middle';

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

  // Procedures: feeder legs, final, holds.
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(108, 224, 255, 0.28)';
  for (const f of sim.geo.feeders) {
    ctx.beginPath();
    ctx.moveTo(px(f.x), py(f.y));
    ctx.lineTo(px(FAF.x), py(FAF.y));
    ctx.lineTo(px(RUNWAY.x), py(RUNWAY.y));
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255, 179, 71, 0.3)';
  sim.geo.feeders.forEach((_, i) => {
    const pts = holdOutline(sim, i);
    ctx.beginPath();
    pts.forEach((p, k) => (k ? ctx.lineTo(px(p.x), py(p.y)) : ctx.moveTo(px(p.x), py(p.y))));
    ctx.closePath();
    ctx.stroke();
  });
  ctx.setLineDash([]);

  // Runway.
  ctx.strokeStyle = '#d8e6dc';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(px(RUNWAY.x), py(RUNWAY.y));
  ctx.lineTo(px(RUNWAY.x - RUNWAY.lengthNm), py(RUNWAY.y));
  ctx.stroke();
  ctx.lineWidth = 1;

  // Fixes.
  ctx.fillStyle = 'rgba(185, 216, 196, 0.7)';
  for (const f of [...sim.geo.feeders, FAF]) {
    const x = px(f.x);
    const y = py(f.y);
    ctx.beginPath();
    ctx.moveTo(x, y - 4);
    ctx.lineTo(x + 4, y + 3);
    ctx.lineTo(x - 4, y + 3);
    ctx.closePath();
    ctx.stroke();
    ctx.fillText(f.name, x + 7, y + 8);
  }

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
  }
}
