// The Loss meme, in ASCII, for when the First Loss achievement unlocks: four panels, one bar, two bars, two bars, and a
// bar with a floor. Every blip on the scope slides into place as a character along those bars, then they go back.
// The proportions are the meme's own, in an 800 unit square. Pure: nothing here touches the canvas.
const BARS = [
  // [x0, y0, x1, y1]: centre lines of the bars.
  [198, 76, 198, 320],
  [533, 76, 533, 320],
  [653, 104, 653, 320],
  [138, 492, 138, 735],
  [258, 492, 258, 735],
  [509, 481, 509, 723],
  [565, 704, 732, 704],
];
const RULES = [
  [400, 0, 400, 800],
  [0, 400, 800, 400],
];
export const IN_MS = 2200;
export const HOLD_MS = 7000;
export const OUT_MS = 1400;
export const TOTAL_MS = IN_MS + HOLD_MS + OUT_MS;
export const STEP_PX = 17; // spacing of the characters, in 800 unit squares

// The shape fitted to a canvas: the rules as segments and one point per character.
export function lossShape(width, height) {
  const size = Math.min(width, height) * 0.92;
  const ox = (width - size) / 2;
  const oy = (height - size) / 2;
  const f = size / 800;
  const at = (x, y) => ({ x: ox + x * f, y: oy + y * f });
  const points = [];
  for (const [x0, y0, x1, y1] of BARS) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const n = Math.max(2, Math.round(len / STEP_PX));
    for (let i = 0; i < n; i++) points.push({ ...at(x0 + ((x1 - x0) * i) / (n - 1), y0 + ((y1 - y0) * i) / (n - 1)), ch: y0 === y1 ? '_' : '|' });
  }
  const lines = RULES.map(([x0, y0, x1, y1]) => [at(x0, y0), at(x1, y1)]);
  return { points, lines, size, fontPx: Math.max(10, STEP_PX * f * 1.5) };
}

const ease = (k) => k * k * (3 - 2 * k);

// 0 to 1 as the blips slide in, 1 while they hold, back to 0 as they leave; null when it is over.
export function lossProgress(ms) {
  if (ms < 0 || ms >= TOTAL_MS) return null;
  if (ms < IN_MS) return ease(ms / IN_MS);
  if (ms < IN_MS + HOLD_MS) return 1;
  return ease(1 - (ms - IN_MS - HOLD_MS) / OUT_MS);
}

// Where every character is at progress k. `from` is where the real targets are on the screen; the rest of the characters
// come in from the edges, so the picture is whole whatever the traffic.
export function lossBlips(from, shape, k) {
  const byPos = (a, b) => a.x + a.y * 0.001 - (b.x + b.y * 0.001);
  const src = [...from].sort(byPos);
  const dst = [...shape.points].sort(byPos);
  return dst.map((to, i) => {
    const s = src[i] ?? { x: i % 2 ? -20 : shape.size + 400, y: ((i * 97) % 800) + 10 };
    return { x: s.x + (to.x - s.x) * k, y: s.y + (to.y - s.y) * k, ch: to.ch, real: i < src.length };
  });
}
