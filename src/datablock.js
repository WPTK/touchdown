// Data block layout for the scope. Pure: numbers in, numbers out, so a test can run it without a canvas.
//
// A block hangs off its target on a leader line. The leader points one of eight compass directions and comes in a few
// lengths, and the block sits at the end of it. Two blocks never get the same spot: each target tries its directions
// and lengths in order and takes the first one that touches nothing already placed. A target keeps the direction it had
// last frame while that is still free, so blocks don't hop about as traffic moves.
//
// Why: stacked holds and parallel finals put a dozen targets inside one block's width (issue #4). JO 7110.65 5-14-8
// allows suspending a track "only when data block overlap in holding patterns or in proximity of the final approach
// create an unworkable situation", so overlap is the thing to prevent before anything gets hidden.

// Screen directions: y grows downward, so north is -y.
export const DIRS = Object.freeze([
  { name: 'N', x: 0, y: -1 },
  { name: 'NE', x: 1, y: -1 },
  { name: 'E', x: 1, y: 0 },
  { name: 'SE', x: 1, y: 1 },
  { name: 'S', x: 0, y: 1 },
  { name: 'SW', x: -1, y: 1 },
  { name: 'W', x: -1, y: 0 },
  { name: 'NW', x: -1, y: -1 },
]);
const BY_NAME = Object.fromEntries(DIRS.map((d) => [d.name, d]));

// Leader length steps in pixels along each axis of the direction (a diagonal step is the same on both).
export const LEADER_PX = Object.freeze([12, 24, 40, 62, 90]);
// The order a target tries directions in when it has no earlier choice: upper right first, as the old fixed block sat.
const PREFERRED = Object.freeze(['NE', 'E', 'N', 'SE', 'NW', 'W', 'S', 'SW']);
const PAD = 2;
const SYMBOL_R = 6; // half-size of a target symbol's box, so a block never covers another target

// Where a block's box lands for a target at (x, y), a direction and a leader length. The leader ends on the block's
// nearest edge or corner, so an east leader meets the left edge at mid height and a north one the bottom at mid width.
export function blockRect(x, y, w, h, dir, len) {
  const d = typeof dir === 'string' ? BY_NAME[dir] : dir;
  const ex = x + d.x * len;
  const ey = y + d.y * len;
  const left = d.x > 0 ? ex : d.x < 0 ? ex - w : ex - w / 2;
  const top = d.y > 0 ? ey : d.y < 0 ? ey - h : ey - h / 2;
  return { x: left, y: top, w, h, ex, ey };
}

const overlap = (a, b) => {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
};

// Size of a block of text lines at a character width and line height.
export const blockSize = (lines, charW, lineH) => ({ w: Math.max(...lines.map((l) => l.length)) * charW + 2 * PAD, h: lines.length * lineH + 2 * PAD });

// Places every item. `items` are { id, x, y, lines, lowLines, prio } where lines is the full block's text and lowLines
// the short one used when the full block won't fit anywhere (the controller's limited block). `state` is a Map kept
// between frames. Returns { placed: Map id -> { dir, len, rect, low }, overlaps } and updates `state`.
// `avoid` is a list of {x, y, w, h} boxes the blocks keep off (labels drawn on the map).
export function layoutBlocks(items, state, { charW = 6.6, lineH = 12, avoid = [], width = Infinity, height = Infinity } = {}) {
  const order = [...items].sort((a, b) => (b.prio ?? 0) - (a.prio ?? 0) || a.id - b.id);
  const symbols = items.map((it) => ({ id: it.id, x: it.x - SYMBOL_R, y: it.y - SYMBOL_R, w: 2 * SYMBOL_R, h: 2 * SYMBOL_R }));
  const placedRects = [];
  const placed = new Map();
  const cost = (rect, id) => {
    let c = 0;
    for (const r of placedRects) c += overlap(rect, r);
    for (const s of symbols) if (s.id !== id) c += overlap(rect, s) * 2;
    for (const r of avoid) c += overlap(rect, r);
    // Off the canvas counts too, so a block at the edge turns inward.
    const off = Math.max(0, -rect.x) + Math.max(0, rect.x + rect.w - width) + Math.max(0, -rect.y) + Math.max(0, rect.y + rect.h - height);
    return c + off * 40;
  };
  for (const it of order) {
    const prev = state.get(it.id);
    let best = null;
    for (const low of [false, true]) {
      const lines = low ? it.lowLines : it.lines;
      if (!lines) continue;
      const { w, h } = blockSize(lines, charW, lineH);
      const tries = [];
      if (prev && prev.low === low) tries.push([prev.dir, prev.len]);
      for (let li = 0; li < LEADER_PX.length; li++) for (const dn of PREFERRED) tries.push([dn, LEADER_PX[li]]);
      let top = null;
      for (const [dn, len] of tries) {
        const rect = blockRect(it.x, it.y, w, h, dn, len);
        const c = cost({ x: rect.x - PAD, y: rect.y - PAD, w: rect.w + 2 * PAD, h: rect.h + 2 * PAD }, it.id);
        if (!top || c < top.c) top = { dir: dn, len, rect, low, c };
        if (c === 0) break;
      }
      if (!best || top.c < best.c) best = top;
      if (best.c === 0) break; // the full block fits; no reason to shorten it
    }
    placed.set(it.id, best);
    placedRects.push(best.rect);
    state.set(it.id, { dir: best.dir, len: best.len, low: best.low });
  }
  for (const id of state.keys()) if (!placed.has(id)) state.delete(id);
  let overlaps = 0;
  const rects = [...placed.values()].map((p) => p.rect);
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlap(rects[i], rects[j]) > 0) overlaps++;
  return { placed, overlaps };
}
