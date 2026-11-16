// What the scope is looking at: a centre point in the regional frame and a range (NM from the centre to the nearer
// edge of the canvas). Zoomed out it is the regional picture; zoomed in on a hub it is that hub's TRACON scope.
import { HUBS, BOUNDS } from './frame.js';

export const MIN_RANGE_NM = 12;
export const MAX_RANGE_NM = 900;
export const TRACON_MAX_NM = 60; // at or under this range, centred near a hub, the detailed TRACON scope takes over
const SNAP_NM = 30;
export const TRACON_RANGE_NM = 50;
export const REGION_RANGE_NM = 460;

export const tracon = (ident) => ({ cx: HUBS[ident].x, cy: HUBS[ident].y, rangeNm: TRACON_RANGE_NM });
export const regionView = () => ({ cx: (BOUNDS[0] + BOUNDS[1]) / 2, cy: (BOUNDS[2] + BOUNDS[3]) / 2, rangeNm: REGION_RANGE_NM });
export const defaultView = () => tracon('KATL'); // the page opens on A80, as it always has

// 'KATL', 'KCLT' or null (the regional picture).
export function hubOf(view) {
  if (view.rangeNm > TRACON_MAX_NM) return null;
  for (const h of Object.values(HUBS)) if (Math.hypot(view.cx - h.x, view.cy - h.y) <= SNAP_NM) return h.ident;
  return null;
}

// Zoom by `factor` (under 1 zooms in) keeping the point (ax, ay) fixed on the screen. Zooming into a hub snaps to it.
export function zoomAt(view, factor, ax, ay) {
  const rangeNm = Math.min(MAX_RANGE_NM, Math.max(MIN_RANGE_NM, view.rangeNm * factor));
  const k = rangeNm / view.rangeNm;
  const next = { cx: ax - (ax - view.cx) * k, cy: ay - (ay - view.cy) * k, rangeNm };
  const hub = hubOf(next);
  return hub ? { cx: HUBS[hub].x, cy: HUBS[hub].y, rangeNm: Math.max(next.rangeNm, 20) } : next;
}

export const panBy = (view, dxNm, dyNm) => ({ ...view, cx: view.cx + dxNm, cy: view.cy + dyNm });

// Screen helpers for a canvas of the given size.
export function screenOf(view, width, height) {
  const scale = Math.min(width, height) / 2 / view.rangeNm;
  return { scale, px: (x) => width / 2 + (x - view.cx) * scale, py: (y) => height / 2 - (y - view.cy) * scale, nmX: (sx) => view.cx + (sx - width / 2) / scale, nmY: (sy) => view.cy - (sy - height / 2) / scale };
}
