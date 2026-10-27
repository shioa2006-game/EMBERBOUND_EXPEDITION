// Hand-drawn scenery in 400 × 180 game coordinates. The caller supplies a high-resolution canvas.
// Adapted from the Studio's pencil/ink/paint vocabulary: uneven contours, edge shading,
// clipped pencil hatching, stippled colour, masonry courses, and independent parallax layers.
// Drawing randomness is local and deterministic; it never touches the simulation RNG.
import type { AreaId, SaveData } from '../../core/types.ts';

type Ctx = CanvasRenderingContext2D;
type Pt = readonly [number, number];
type Random = () => number;
interface Colours {
  sky: string; horizon: string; far: string; middle: string; stone: string;
  soil: string; ink: string; light: string; accent: string;
}
interface Scene { sky: HTMLCanvasElement; far: HTMLCanvasElement; middle: HTMLCanvasElement; floor: HTMLCanvasElement; front: HTMLCanvasElement }

const W = 400, H = 180, TILE = 480, SCALE = 4, TAU = Math.PI * 2;
const COLOURS: Record<AreaId, Colours> = {
  ashwood: { sky: '#191b29', horizon: '#76605d', far: '#45434c', middle: '#4c4244', stone: '#746359', soil: '#55483e', ink: '#211f25', light: '#c8ab88', accent: '#f6b76d' },
  ruins: { sky: '#14272e', horizon: '#547c79', far: '#34575b', middle: '#3c6465', stone: '#72918b', soil: '#4c6561', ink: '#203739', light: '#b8cbb4', accent: '#a0e4ce' },
  glimmer: { sky: '#211d35', horizon: '#625274', far: '#3e3b58', middle: '#4d4565', stone: '#7c7392', soil: '#51495b', ink: '#292536', light: '#c8badb', accent: '#b8acf2' },
  rimeholt: { sky: '#202c40', horizon: '#8597ad', far: '#53677e', middle: '#64778a', stone: '#95a4ad', soil: '#939eab', ink: '#344357', light: '#e0e7e5', accent: '#c2e6f0' },
  hollow: { sky: '#141322', horizon: '#454052', far: '#302e42', middle: '#3b394e', stone: '#686271', soil: '#48414c', ink: '#211e2c', light: '#a8a3b4', accent: '#bfd29d' },
  heart: { sky: '#2d1a26', horizon: '#a6664b', far: '#69434a', middle: '#734d4b', stone: '#977361', soil: '#6f4e44', ink: '#39272c', light: '#e1b889', accent: '#ffd097' },
};
const scenes = new Map<AreaId, Scene>();
let camp: HTMLCanvasElement | null = null;
let title: HTMLCanvasElement | null = null;
let grain: HTMLCanvasElement | null = null;

function rng(seed: number): Random {
  let s = seed >>> 0;
  return () => { s = Math.imul(1664525, s) + 1013904223 | 0; return (s >>> 0) / 4294967296; };
}
function mix(a: string, b: string, t: number): string {
  const out = [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t));
  return `rgb(${out.join(',')})`;
}
function hexAlpha(hex: string, a: number): string {
  return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
}
function canvas(width: number, height: number, draw: (g: Ctx) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width * SCALE; c.height = height * SCALE;
  const g = c.getContext('2d')!;
  g.scale(SCALE, SCALE); g.lineCap = 'round'; g.lineJoin = 'round';
  draw(g);
  return c;
}
function trace(g: Ctx, points: readonly Pt[], closed = true): void {
  if (!points.length) return;
  g.beginPath(); g.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) g.lineTo(points[i][0], points[i][1]);
  if (closed) g.closePath();
}
function line(g: Ctx, points: readonly Pt[], color: string, width = .35, alpha = 1): void {
  g.save(); g.globalAlpha *= alpha; g.strokeStyle = color; g.lineWidth = width;
  trace(g, points, false); g.stroke(); g.restore();
}
function uneven(points: readonly Pt[], seed: number, amp = .27): Pt[] {
  const r = rng(seed), out: Pt[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const n = Math.max(1, Math.round(len / 3.5));
    for (let j = 0; j < n; j++) {
      const q = j / n, off = (r() - .5) * amp * (j === 0 ? .5 : 1);
      out.push([a[0] + dx * q - dy / len * off, a[1] + dy * q + dx / len * off]);
    }
  }
  return out;
}
function paint(g: Ctx, points: readonly Pt[], fill: string, ink: string, seed: number, hatch = true, width = .55): void {
  const pts = uneven(points, seed), r = rng(seed + 97);
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  g.save(); trace(g, pts); g.fillStyle = fill; g.fill(); g.clip();
  // Narrow colour shadows follow the bottom/right of the contour, like the Studio's paint crescent.
  g.globalAlpha = .28; g.fillStyle = ink; g.beginPath(); g.rect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
  pts.forEach((p, i) => i ? g.lineTo(p[0] - .8, p[1] - 1.1) : g.moveTo(p[0] - .8, p[1] - 1.1));
  g.closePath(); g.fill('evenodd');
  g.globalAlpha = .13; g.fillStyle = '#f7e9d0';
  g.beginPath(); g.rect(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
  pts.forEach((p, i) => i ? g.lineTo(p[0] + .55, p[1] + .75) : g.moveTo(p[0] + .55, p[1] + .75));
  g.closePath(); g.fill('evenodd');
  g.globalAlpha = 1;
  if (hatch) {
    for (let y = y0 + 1; y < y1; y += 2.2 + r() * 1.8) {
      const x = x0 + (x1 - x0) * (.25 + r() * .7);
      line(g, [[x, y], [x - 2 - r() * 5, y + 2 + r() * 3]], ink, .23, .25);
    }
  }
  g.fillStyle = ink; g.globalAlpha = .22;
  const dots = Math.min(110, Math.ceil((x1 - x0) * (y1 - y0) * .07));
  for (let i = 0; i < dots; i++) { g.beginPath(); g.arc(x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), .08 + r() * .11, 0, TAU); g.fill(); }
  g.restore();
  if (width > 0) { trace(g, pts); g.strokeStyle = ink; g.lineWidth = width; g.stroke(); }
}
function ellipse(g: Ctx, x: number, y: number, rx: number, ry: number, color: string, alpha = 1): void {
  g.save(); g.globalAlpha *= alpha; g.fillStyle = color; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); g.restore();
}
function glow(g: Ctx, x: number, y: number, radius: number, color: string, alpha = .25, squash = 1): void {
  g.save(); g.translate(x, y); g.scale(1, squash);
  const grad = g.createRadialGradient(0, 0, 0, 0, 0, radius);
  grad.addColorStop(0, hexAlpha(color, alpha)); grad.addColorStop(.35, hexAlpha(color, alpha * .45)); grad.addColorStop(1, hexAlpha(color, 0));
  g.fillStyle = grad; g.fillRect(-radius, -radius, radius * 2, radius * 2); g.restore();
}
function wrapped(g: Ctx, x: number, draw: (x: number) => void): void { for (const dx of [-TILE, 0, TILE]) draw(x + dx); }
function tile(g: Ctx, layer: HTMLCanvasElement, scroll: number): void {
  const x = -((scroll % TILE + TILE) % TILE);
  g.drawImage(layer, x, 0, TILE, H);
  g.drawImage(layer, x + TILE, 0, TILE, H);
}
function ridge(g: Ctx, base: number, height: number, color: string, seed: number): void {
  const pts: Pt[] = [[0, H]];
  for (let x = 0; x <= TILE; x += 3) {
    const a = x / TILE * TAU;
    pts.push([x, base + Math.sin(a * 3 + seed) * height + Math.sin(a * 7 + seed * 2) * height * .35]);
  }
  pts.push([TILE, H]); trace(g, pts); g.fillStyle = color; g.fill();
}

function tree(g: Ctx, x: number, base: number, height: number, wide: number, fill: string, ink: string, seed: number, burned = false): void {
  const r = rng(seed), lean = (r() - .5) * height * .2, top = base - height;
  const pts: Pt[] = [[x - wide * 1.8, base], [x - wide * .8, base - height * .2], [x - wide * .5 + lean, top], [x + wide * .45 + lean, top - 2], [x + wide * .8, base - height * .2], [x + wide * 1.9, base]];
  paint(g, pts, fill, ink, seed, true, .65);
  for (let k = 0; k < 5; k++) {
    const y = base - height * (.32 + k * .12), dir = k % 2 ? -1 : 1, len = height * (.19 + r() * .12);
    const start = x + lean * (base - y) / height;
    const end = start + dir * len;
    line(g, [[start, y], [start + dir * len * .55, y - 6], [end, y - len * .55], [end + dir * len * .18, y - len * .75]], ink, wide * .45 + .5);
    line(g, [[start, y - .7], [start + dir * len * .55, y - 6.7], [end, y - len * .55]], fill, wide * .28);
    line(g, [[end - dir * 2, y - len * .48], [end - dir * 7, y - len * .9]], ink, .45);
    if (burned && k % 2 === 0) line(g, [[end, y - len * .55], [end + dir * 1.5, y - len * .63]], '#bd7751', .45, .8);
  }
  for (let k = 0; k < 5; k++) {
    const bx = x + (k - 2) * wide * .27;
    line(g, [[bx, base - 2], [bx + (r() - .5) * 2, base - height * .36], [bx + lean * .7, top + height * .16]], ink, .24, .6);
  }
  ellipse(g, x + wide * .15, base - height * .42, wide * .18, wide * .6, ink, .7);
}
function stone(g: Ctx, x: number, y: number, width: number, height: number, p: Colours, seed: number): void {
  const pts: Pt[] = [[x + .8, y], [x + width - 1, y + .25], [x + width, y + height - .7], [x + width - 1, y + height], [x, y + height - .3], [x - .3, y + .6]];
  paint(g, pts, p.stone, p.ink, seed, true, .45);
}
function pillar(g: Ctx, x: number, base: number, height: number, p: Colours, seed: number, broken = false): void {
  const top = base - height, r = rng(seed);
  stone(g, x - 6, base - 4, 12, 4, p, seed);
  // Keep the shaft continuous when its height is not an exact masonry-course multiple.
  paint(g, [[x - 4, base - 4], [x - 4, top + 1], [x + 4, top + 1], [x + 4, base - 4]], p.stone, p.ink, seed + 103, true, .4);
  for (let y = base - 11, k = 0; y > top; y -= 7, k++) stone(g, x - 4.1, y, 8.2, 6.8, p, seed + k + 1);
  if (broken) {
    paint(g, [[x - 4, top + 5], [x - 4, top - 1], [x - 1, top + 1.5], [x + 1, top - 2.5], [x + 4, top + 1], [x + 4, top + 5]], p.stone, p.ink, seed + 51);
  } else { stone(g, x - 6.5, top - 2, 13, 3, p, seed + 23); stone(g, x - 5.3, top + 1, 10.6, 2, p, seed + 24); }
  for (const dx of [-2.1, 0, 2.1]) line(g, [[x + dx, base - 7], [x + dx + .25, top + 4]], p.ink, .25, .38);
  if (r() > .3) line(g, [[x + 3, base - 20], [x + 1, base - 17], [x + 2, base - 13]], p.ink, .4, .7);
}
function arch(g: Ctx, x: number, base: number, radius: number, height: number, p: Colours, seed: number): void {
  const spring = base - height + radius;
  pillar(g, x - radius - 3, base, height - radius, p, seed);
  pillar(g, x + radius + 3, base, height - radius, p, seed + 18);
  for (let i = 0; i < 13; i++) {
    const a = Math.PI + i / 13 * Math.PI, b = Math.PI + (i + 1) / 13 * Math.PI;
    paint(g, [[x + Math.cos(a) * radius, spring + Math.sin(a) * radius], [x + Math.cos(a) * (radius + 6), spring + Math.sin(a) * (radius + 6)], [x + Math.cos(b) * (radius + 6), spring + Math.sin(b) * (radius + 6)], [x + Math.cos(b) * radius, spring + Math.sin(b) * radius]], p.stone, p.ink, seed + i * 13, true, .4);
  }
}
function crystal(g: Ctx, x: number, base: number, height: number, width: number, p: Colours, seed: number, tilt = 0): void {
  const top: Pt = [x + tilt, base - height];
  paint(g, [[x - width * .45, base], [x - width * .5 + tilt * .5, base - height * .7], top, [x + width * .5 + tilt * .5, base - height * .74], [x + width * .45, base]], p.stone, p.ink, seed, false, .45);
  trace(g, [top, [x + width * .13, base - height * .67], [x + width * .13, base], [x + width * .45, base], [x + width * .5 + tilt * .5, base - height * .74]]); g.fillStyle = hexAlpha(p.accent, .25); g.fill();
  line(g, [top, [x - width * .1, base - height * .7], [x - width * .1, base]], p.light, .45, .7);
  line(g, [[x - width * .45, base - height * .66], [x + width * .1, base - height * .54]], p.light, .24, .65);
}
function spire(g: Ctx, x: number, base: number, height: number, width: number, p: Colours, seed: number, snow = false): void {
  paint(g, [[x - width / 2, base], [x - width / 2, base - height * .75], [x + width / 2, base - height * .75], [x + width / 2, base]], p.stone, p.ink, seed, true, .4);
  paint(g, [[x - width * .7, base - height * .74], [x, base - height], [x + width * .7, base - height * .74]], p.middle, p.ink, seed + 1, true, .45);
  for (let y = base - 8; y > base - height * .7; y -= 7) {
    line(g, [[x - width / 2, y], [x + width / 2, y]], p.ink, .22, .5);
    if (y < base - 15) { ellipse(g, x, y - 3, 1.2, 2.2, p.ink, .8); line(g, [[x, y - 4.4], [x, y - 1.7]], p.light, .35, .55); }
  }
  if (snow) { line(g, [[x - width * .7, base - height * .74], [x, base - height], [x + width * .1, base - height + 3]], p.light, 1.4, .75); line(g, [[x - width / 2, base - height * .73], [x + width / 2, base - height * .73]], p.light, 1.2, .8); }
}

function skyLayer(id: AreaId, p: Colours): HTMLCanvasElement {
  return canvas(W, H, g => {
    const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, p.sky); grad.addColorStop(.7, p.horizon); grad.addColorStop(1, p.soil); g.fillStyle = grad; g.fillRect(0, 0, W, H);
    if (id === 'ashwood' || id === 'rimeholt') {
      glow(g, 314, 36, 46, p.light, .13);
      ellipse(g, 314, 36, 12, 12, id === 'ashwood' ? '#ccb298' : '#d3dfdf', .75);
      ellipse(g, 318, 33, 10.8, 10.8, p.sky, .7);
      const r = rng(44); for (let i = 0; i < 16; i++) ellipse(g, 304 + r() * 17, 26 + r() * 20, .3 + r() * 1.3, .3 + r(), p.sky, .14);
    }
    if (id === 'hollow') {
      glow(g, 270, 55, 59, p.accent, .1); ellipse(g, 270, 55, 28, 28, p.accent, .12); ellipse(g, 270, 55, 25.7, 25.7, p.sky, .98);
      g.save(); g.strokeStyle = hexAlpha(p.light, .1); g.lineWidth = .4;
      for (let i = 0; i < 4; i++) { g.beginPath(); g.ellipse(270, 55, 32 + i * 5, 31 + i * 4, -.3, 0, TAU); g.stroke(); } g.restore();
    }
    if (id === 'heart') { glow(g, 285, 61, 92, '#ffce94', .38); glow(g, 285, 61, 28, '#ffe5b6', .21); }
    const r = rng(31);
    for (let i = 0; i < 26; i++) {
      const y = 15 + r() * 91, x = r() * W;
      line(g, [[x - 25, y], [x, y - 1.5], [x + 30 + r() * 35, y + .5]], p.light, .23, .06 + r() * .06);
    }
  });
}
function farLayer(id: AreaId, p: Colours): HTMLCanvasElement {
  return canvas(TILE, H, g => {
    const r = rng(100 + id.length);
    ridge(g, 111, 11, p.far, 3);
    if (id === 'ashwood') {
      for (let i = 0; i < 29; i++) {
        const height = 40 + r() * 32, width = 1.2 + r();
        wrapped(g, i * TILE / 29, x => { g.save(); g.globalAlpha = .65; tree(g, x, 128, height, width, p.far, p.sky, 600 + i); g.restore(); });
      }
    } else if (id === 'ruins') {
      for (let i = 0; i < 6; i++) wrapped(g, 38 + i * 80, x => { const q = { ...p, stone: p.far, ink: p.sky }; arch(g, x, 133, 16, 64 + i % 2 * 12, q, 411 + i); });
      for (let i = 0; i < 5; i++) line(g, [[0, 118 + i * 3.3], [TILE, 118 + i * 3.3]], p.light, .45, .1);
    } else if (id === 'glimmer') {
      for (let i = 0; i < 20; i++) wrapped(g, i * 25, x => crystal(g, x, 133, 25 + (i * 17 % 39), 13 + i % 3 * 3, { ...p, stone: p.far, ink: p.sky, light: p.middle }, 500 + i, i % 2 ? 8 : -9));
      for (let i = 0; i < 11; i++) wrapped(g, i * 45, x => paint(g, [[x - 22, -3], [x + 18, -3], [x + 12, 19], [x + 4, 47 + i % 3 * 7], [x - 2, 21], [x - 16, 34]], p.far, p.sky, 600 + i));
    } else if (id === 'rimeholt') {
      ridge(g, 96, 21, p.far, 1);
      for (let i = 0; i < 9; i++) wrapped(g, 18 + i * 55, x => spire(g, x, 130, 43 + i % 3 * 16, 16, { ...p, stone: p.far, middle: p.far, ink: p.sky, light: p.horizon }, 700 + i, true));
    } else if (id === 'hollow') {
      for (let i = 0; i < 14; i++) wrapped(g, 12 + i * 36, x => {
        const h = 40 + i * 19 % 47;
        paint(g, [[x - 7, 134], [x - 5, 134 - h * .7], [x + 1, 134 - h], [x + 4, 134 - h * .6], [x + 6, 134]], p.far, p.sky, 800 + i);
      });
    } else {
      for (let i = 0; i < 9; i++) wrapped(g, 20 + i * 56, x => {
        const h = 49 + i % 3 * 15;
        paint(g, [[x - 14, 137], [x - 11, 137 - h], [x - 3, 127 - h], [x + 9, 137 - h], [x + 16, 137]], p.far, p.sky, 900 + i);
        line(g, [[x - 3, 134], [x - 4, 108], [x + 3, 96], [x, 137 - h]], p.accent, .6, .35);
      });
    }
  });
}
function middleLayer(id: AreaId, p: Colours): HTMLCanvasElement {
  return canvas(TILE, H, g => {
    if (id === 'ashwood') {
      for (let i = 0; i < 6; i++) wrapped(g, 22 + i * 83, x => tree(g, x, 137, 94 + i % 3 * 17, 3.4 + i % 2 * 1.4, p.middle, p.ink, 120 + i, true));
      for (let i = 0; i < 22; i++) wrapped(g, i * 23, x => {
        for (let k = 0; k < 4; k++) line(g, [[x, 139], [x + k - 2, 132 - k % 2 * 2], [x + (k - 2) * 3, 128 - k % 3 * 3]], p.ink, .4, .6);
      });
    } else if (id === 'ruins') {
      for (let i = 0; i < 4; i++) wrapped(g, 52 + i * 125, x => {
        if (i % 2 === 0) arch(g, x, 137, 22, 96, p, 151 + i);
        else { pillar(g, x - 20, 137, 65, p, 176 + i, true); pillar(g, x + 28, 137, 92, p, 198 + i, true); }
        for (let k = 0; k < 4; k++) line(g, [[x - 23 + k * 2, 50 + k], [x - 24 + k * 2, 70], [x - 20 + k * 2, 84 + k * 4]], p.ink, .4, .65);
        const cx = x + 25;
        for (let k = 0; k < 5; k++) line(g, [[cx, 138], [cx + k - 2, 128], [cx + (k - 2) * 2, 124 - k % 2 * 5]], '#a47b70', .7, .75);
      });
      for (let i = 0; i < 18; i++) wrapped(g, i * 28, x => ellipse(g, x, 139, 11, 1.1, p.accent, .12));
    } else if (id === 'glimmer') {
      for (let i = 0; i < 6; i++) wrapped(g, 25 + i * 83, x => {
        paint(g, [[x - 23, 139], [x - 19, 126], [x - 6, 118], [x + 14, 124], [x + 25, 140]], p.middle, p.ink, 250 + i);
        crystal(g, x - 4, 133, 31 + i % 3 * 8, 17, p, 270 + i, -8);
        crystal(g, x + 12, 137, 20 + i % 2 * 11, 13, { ...p, stone: '#766984', accent: '#e3a0c8' }, 290 + i, 10);
        crystal(g, x - 15, 137, 16, 10, p, 310 + i, -8);
      });
      for (let i = 0; i < 6; i++) wrapped(g, 45 + i * 87, x => paint(g, [[x - 31, -2], [x + 21, -2], [x + 16, 12], [x + 8, 16], [x + 4, 37], [x - 3, 18], [x - 12, 24], [x - 18, 11]], p.middle, p.ink, 330 + i));
    } else if (id === 'rimeholt') {
      for (let i = 0; i < 4; i++) wrapped(g, 41 + i * 128, x => {
        const q = { ...p, stone: p.middle };
        spire(g, x, 137, 92 + i % 2 * 18, 22, q, 400 + i, true);
        paint(g, [[x + 11, 137], [x + 11, 99], [x + 65, 99], [x + 65, 137]], p.middle, p.ink, 422 + i);
        for (let k = 0; k < 6; k++) { stone(g, x + 12 + k * 9, 96, 6, 6, q, 445 + k); line(g, [[x + 12 + k * 9, 96], [x + 18 + k * 9, 96]], p.light, 1.3, .8); }
        for (let y = 106; y < 137; y += 7) line(g, [[x + 11, y], [x + 65, y]], p.ink, .28, .6);
        line(g, [[x + 11, 102], [x + 65, 102]], p.light, .85, .65);
        for (let k = 0; k < 5; k++) paint(g, [[x + 15 + k * 10, 101], [x + 17 + k * 10, 101], [x + 16 + k * 10, 108 + k % 2 * 5]], p.light, p.ink, 470 + k, false, .15);
      });
    } else if (id === 'hollow') {
      for (let i = 0; i < 5; i++) wrapped(g, 42 + i * 102, x => {
        const h = 50 + i % 3 * 18;
        paint(g, [[x - 10, 138], [x - 9, 138 - h], [x + 3, 131 - h], [x + 10, 135 - h], [x + 13, 138]], p.middle, p.ink, 510 + i);
        for (let k = 0; k < 4; k++) { const y = 139 - h + k * 7; line(g, [[x - 2, y], [x + 2, y + 2], [x - 1, y + 4], [x + 3, y + 5]], p.accent, .45, .55); }
        line(g, [[x - 10, 116], [x - 28, 129], [x - 32, 137]], p.ink, .75);
        line(g, [[x + 10, 110], [x + 26, 128], [x + 37, 132]], p.ink, .7);
      });
      for (let i = 0; i < 3; i++) wrapped(g, 90 + i * 161, x => { g.save(); g.globalAlpha = .55; arch(g, x, 137, 21, 81, { ...p, stone: p.middle }, 550 + i); g.restore(); });
    } else {
      for (let i = 0; i < 4; i++) wrapped(g, 55 + i * 123, x => {
        arch(g, x, 139, 27, 95 + i % 2 * 11, { ...p, stone: p.middle }, 610 + i);
        for (const dir of [-1, 1]) {
          const bx = x + dir * 32;
          line(g, [[bx, 139], [bx + dir * 2, 111], [bx - dir * 3, 102], [bx + dir * 2, 89], [bx, 70]], p.accent, .75, .5);
        }
      });
      // The ember altar repeats slowly behind the fighting plane.
      wrapped(g, 291, x => {
        glow(g, x, 72, 35, p.accent, .15);
        const pts: Pt[] = [[x, 48], [x + 11, 59], [x + 10, 76], [x, 91], [x - 10, 76], [x - 11, 59]];
        paint(g, pts, '#ae7954', p.ink, 671, false, .65);
        paint(g, [[x, 53], [x + 5, 66], [x + 3, 76], [x, 83], [x - 4, 70]], '#e4bb7d', '#8e573e', 672, false, .35);
        for (const dx of [-16, 16]) line(g, [[x + dx, 30], [x + dx * .6, 53]], p.ink, .65);
      });
    }
    // A thin wash makes intricate scenery recede behind the party and health bars.
    const mist = g.createLinearGradient(0, 80, 0, 145); mist.addColorStop(0, hexAlpha(p.horizon, 0)); mist.addColorStop(.6, hexAlpha(p.horizon, .08)); mist.addColorStop(1, hexAlpha(p.horizon, .25)); g.fillStyle = mist; g.fillRect(0, 80, TILE, 65);
  });
}
function floorLayer(id: AreaId, p: Colours): HTMLCanvasElement {
  return canvas(TILE, H, g => {
    const grad = g.createLinearGradient(0, 135, 0, H); grad.addColorStop(0, p.soil); grad.addColorStop(.45, mix(p.soil, p.light, .12)); grad.addColorStop(1, mix(p.soil, p.ink, .55));
    g.fillStyle = grad; g.fillRect(0, 138, TILE, H - 138);
    const edge: Pt[] = []; for (let x = 0; x <= TILE; x += 4) edge.push([x, 138 + Math.sin(x / TILE * TAU * 9) * .65]);
    line(g, edge, p.ink, .5, .7);
    const r = rng(920);
    if (id === 'ruins' || id === 'rimeholt' || id === 'hollow' || id === 'heart') {
      for (let row = 0; row < 3; row++) {
        const y = 139 + row * 9, h = 8.5 + row * .5;
        for (let i = -1; i < 14; i++) {
          const x = i * 40 + row % 2 * 20;
          paint(g, [[x + .7, y], [x + 39.5, y + .3], [x + 40, y + h], [x, y + h - .2]], p.soil, p.ink, 980 + row * 100 + ((i + 12) % 12), false, .22);
          if ((i + row) % 3 === 0) line(g, [[x + 14, y], [x + 18, y + 3], [x + 17, y + 5], [x + 23, y + h]], p.ink, .25, .35);
        }
      }
    }
    for (let i = 0; i < 750; i++) {
      const x = r() * TILE, y = 139 + r() * 41, alpha = y > 161 ? .28 : .14;
      line(g, [[x, y], [x + .3 + r() * 2.5, y - .2 - r() * .35]], i % 3 ? p.ink : p.light, .14 + r() * .15, alpha);
    }
    for (let i = 0; i < 18; i++) {
      const x = i * 27 + r() * 10, size = 1 + r() * 1.7;
      wrapped(g, x, xx => {
        const y = i % 3 ? 138.5 : 167;
        paint(g, [[xx - size, y], [xx - size * .6, y - size * .65], [xx + size * .4, y - size * .8], [xx + size, y - .3], [xx + size * .5, y + .4]], p.stone, p.ink, 1110 + i, true, .3);
        if (id === 'ashwood') for (let k = 0; k < 3; k++) line(g, [[xx + 3, y], [xx + 2 + k, y - 2 - k % 2 * 2]], p.ink, .28, .7);
      });
    }
    if (id === 'rimeholt') {
      for (let i = 0; i < 18; i++) wrapped(g, i * 28, x => ellipse(g, x, i % 2 ? 140 : 164, 11 + i % 3 * 3, 1.3 + i % 2, p.light, .35));
    }
    if (id === 'ruins') for (let i = 0; i < 12; i++) wrapped(g, i * 42, x => { ellipse(g, x, 143 + i % 3 * 9, 8 + i % 3 * 4, 1, p.accent, .1); line(g, [[x - 6, 143 + i % 3 * 9], [x + 5, 143 + i % 3 * 9]], p.light, .25, .25); });
    if (id === 'heart') for (let i = 0; i < 6; i++) wrapped(g, i * 81, x => line(g, [[x, 179], [x + 4, 174], [x + 2, 169], [x + 11, 166]], p.accent, .6, .4));
  });
}
function frontLayer(id: AreaId, p: Colours): HTMLCanvasElement {
  return canvas(TILE, H, g => {
    if (id === 'ashwood') {
      for (let i = 0; i < 3; i++) wrapped(g, 21 + i * 177, x => {
        for (let k = 0; k < 5; k++) {
          const tip: Pt = [x + (k - 2) * 5.5, 166 - (2 - Math.abs(k - 2)) * 3];
          line(g, [[x, 185], [x + (k - 2) * 3, 174], tip], p.ink, .7, .8);
          for (let j = 0; j < 4; j++) { const t = .3 + j * .15, px = x + (tip[0] - x) * t, py = 185 + (tip[1] - 185) * t; line(g, [[px - 2.5, py - 3], [px, py], [px + 2.5, py - 3]], p.ink, .55, .75); }
        }
      });
      wrapped(g, 170, x => { line(g, [[x - 40, -3], [x, 5], [x + 36, 9], [x + 59, 4]], p.ink, 2.5); line(g, [[x + 10, 7], [x + 15, 16], [x + 32, 19]], p.ink, 1); });
    } else if (id === 'glimmer') {
      for (let i = 0; i < 4; i++) wrapped(g, 20 + i * 137, x => crystal(g, x, 184, 14 + i % 2 * 3, 12, { ...p, stone: p.ink, light: p.middle }, 1200 + i, -5));
    } else if (id === 'ruins') {
      for (let i = 0; i < 4; i++) wrapped(g, 18 + i * 138, x => { for (let k = 0; k < 4; k++) line(g, [[x + k, 184], [x + k - 2, 176], [x + k + 1, 169 - k % 2 * 3]], p.ink, .8, .8); });
    } else if (id === 'hollow') {
      for (let i = 0; i < 4; i++) wrapped(g, 55 + i * 130, x => line(g, [[x - 20, 182], [x - 8, 177], [x + 6, 176], [x + 15, 168]], p.ink, 1.3, .85));
    }
  });
}
function scene(id: AreaId): Scene {
  let s = scenes.get(id);
  if (s) { scenes.delete(id); scenes.set(id, s); return s; }
  const p = COLOURS[id];
  s = { sky: skyLayer(id, p), far: farLayer(id, p), middle: middleLayer(id, p), floor: floorLayer(id, p), front: frontLayer(id, p) };
  scenes.set(id, s);
  // Bound full-resolution scene memory while retaining the area last visited.
  if (scenes.size > 2) {
    const first = scenes.keys().next().value!;
    const old = scenes.get(first)!;
    for (const layer of Object.values(old)) { layer.width = 1; layer.height = 1; }
    scenes.delete(first);
  }
  return s;
}
function paper(g: Ctx): void {
  if (!grain) {
    grain = canvas(W, H, q => {
      const r = rng(7331);
      for (let i = 0; i < 19000; i++) {
        q.fillStyle = i % 3 ? 'rgba(245,227,196,.055)' : 'rgba(15,12,20,.09)';
        q.fillRect(r() * W, r() * H, .12 + r() * .3, .1 + r() * .15);
      }
      for (let i = 0; i < 210; i++) { const x = r() * W, y = r() * H; line(q, [[x, y], [x + .5 + r() * 2, y + r() * .2]], '#c9bca9', .12, .09); }
    });
  }
  g.drawImage(grain, 0, 0, W, H);
}
function vignette(g: Ctx, strength = .3): void {
  const v = g.createRadialGradient(200, 104, 76, 200, 95, 230); v.addColorStop(0, 'rgba(9,8,16,0)'); v.addColorStop(1, `rgba(9,8,16,${strength})`); g.fillStyle = v; g.fillRect(0, 0, W, H);
}
function ambience(g: Ctx, id: AreaId, scroll: number, time: number, front: boolean): void {
  const p = COLOURS[id], n = id === 'rimeholt' ? 27 : 13;
  for (let i = 0; i < n; i++) {
    const phase = (time * (id === 'rimeholt' ? .055 : .032) + i * .6180339) % 1;
    const x = ((i * 47.71 + Math.sin(time * .3 + i) * 6 - scroll * (front ? .9 : .28)) % W + W) % W;
    let y = id === 'rimeholt' ? phase * 190 - 5 : 139 - phase * 117;
    if (front && y > 85 && y < 160) continue; // keep spell/telegraph silhouettes unobstructed
    const alpha = Math.sin(phase * Math.PI) * (front ? .48 : .28);
    if (id === 'ruins') {
      if (front) continue;
      y = 126 + Math.sin(time * .7 + i) * 2;
      line(g, [[x - 4, y], [x + 5, y]], p.light, .3, .12);
    } else if (id === 'rimeholt') {
      ellipse(g, x, y, .24 + i % 3 * .08, .24 + i % 3 * .08, p.light, alpha);
    } else {
      ellipse(g, x, y, .3 + i % 3 * .08, id === 'ashwood' || id === 'heart' ? .65 : .32, p.accent, alpha);
      if (i % 5 === 0) glow(g, x, y, 2.2, p.accent, alpha * .15);
    }
  }
}

/** No units or HUD are painted here. Scroll and time are the game's existing world/simulation values. */
export function drawStoryAreaBackground(g: Ctx, areaId: AreaId, scroll: number, time: number): void {
  const s = scene(areaId); g.save(); g.imageSmoothingEnabled = true;
  g.drawImage(s.sky, 0, 0, W, H);
  tile(g, s.far, scroll * .2); tile(g, s.middle, scroll * .54);
  ambience(g, areaId, scroll, time, false);
  tile(g, s.floor, scroll); paper(g); vignette(g, .23); g.restore();
}
export function drawStoryAreaForeground(g: Ctx, areaId: AreaId, scroll: number, time: number): void {
  g.save(); g.imageSmoothingEnabled = true; tile(g, scene(areaId).front, scroll * 1.15); ambience(g, areaId, scroll, time, true); g.restore();
}

function lantern(g: Ctx, x: number, y: number, time: number, scale = 1): void {
  g.save(); g.translate(x, y); g.scale(scale, scale);
  glow(g, 0, 0, 17, '#ffc780', .3 + Math.sin(time * 5) * .025);
  paint(g, [[-2.4, -3], [2.4, -3], [2, 3], [-2, 3]], '#c0935b', '#2c282b', 1881, false, .5);
  ellipse(g, 0, .5, .9, 2, '#ffe4a6', .96);
  line(g, [[-2.3, -3], [0, -4.7], [2.3, -3]], '#29272b', .55);
  line(g, [[0, -4.5], [0, -7]], '#29272b', .45);
  line(g, [[-2.4, -3], [2.4, -3]], '#e8bb7d', .3, .7);
  g.restore();
}
function fire(g: Ctx, x: number, y: number, time: number): void {
  const flicker = .92 + Math.sin(time * 8.3) * Math.sin(time * 5.9) * .08;
  glow(g, x, y - 4, 62, '#f5ae6f', .24 * flicker, .45);
  glow(g, x, y - 8, 25, '#ffd5a0', .18 * flicker);
  for (let i = 0; i < 7; i++) {
    const a = i / 6 * Math.PI; ellipse(g, x + Math.cos(a) * 9, y + Math.sin(a) * 2, 2.3, 1.5, i % 2 ? '#8b8177' : '#676366');
  }
  line(g, [[x - 7, y], [x + 6, y - 3]], '#342a28', 2.4); line(g, [[x - 7, y - .5], [x + 6, y - 3.5]], '#937157', .6);
  line(g, [[x + 7, y], [x - 5, y - 3]], '#44312a', 2.3); line(g, [[x + 7, y - .5], [x - 5, y - 3.5]], '#b58355', .6);
  for (let i = 0; i < 4; i++) {
    const xx = x - 4 + i * 2.3, h = 8 + Math.sin(time * 7 + i * 2) * 2 + (i === 2 ? 4 : 0), bend = Math.sin(time * 4 + i) * 2;
    g.beginPath(); g.moveTo(xx - 2.5, y - 2); g.bezierCurveTo(xx - 4, y - h * .5, xx + bend - 1, y - h * .8, xx + bend, y - h); g.bezierCurveTo(xx + bend + .2, y - h * .6, xx + 5, y - h * .3, xx + 2, y - 2); g.closePath();
    g.fillStyle = i % 2 ? '#efac67' : '#d88350'; g.fill(); g.strokeStyle = '#b86c49'; g.lineWidth = .35; g.stroke();
  }
  ellipse(g, x + .5, y - 3.8, 2, 3.2, '#ffe2a0', .95);
  for (let i = 0; i < 11; i++) {
    const t = (time * .31 + i * .223) % 1;
    ellipse(g, x + Math.sin(i * 2 + time) * (2 + t * 8), y - 6 - t * 47, .22, .42, '#f4c589', (1 - t) * .75);
  }
}
function campLayer(): HTMLCanvasElement {
  return canvas(W, H, g => {
    const p = COLOURS.ashwood;
    // A cloth tent, rolled blankets and a hanging lantern; space around the fire is left for the party.
    paint(g, [[293, 150], [318, 115], [350, 150]], '#62534f', '#272630', 1601, true, .75);
    paint(g, [[293, 150], [318, 115], [320, 150]], '#86715e', '#302b2d', 1602, true, .55);
    paint(g, [[312, 150], [318, 128], [327, 150]], '#272630', '#272630', 1603, false, .4);
    line(g, [[318, 115], [321, 111]], p.ink, .65); line(g, [[319, 116], [355, 151]], '#a18c73', .35, .7);
    line(g, [[292, 149], [288, 153]], '#a18c73', .4); line(g, [[350, 149], [356, 153]], '#a18c73', .4);
    for (let i = 0; i < 3; i++) line(g, [[298 + i * 5, 145], [317, 121 + i * 5]], '#3b3232', .3, .5);
    line(g, [[103, 151], [104, 118], [113, 118]], '#28262a', 1.1); line(g, [[104, 120], [111, 118]], '#7c6553', .45);
    for (const x of [140, 239]) {
      paint(g, [[x - 10, 147], [x + 10, 146], [x + 10, 150], [x - 9, 151]], '#5d4840', '#29272a', 1701 + x, true, .5);
      ellipse(g, x - 9, 149, 1.2, 2, '#9b7e5e');
      line(g, [[x - 6, 148], [x + 8, 147.3]], '#a08360', .3, .6);
    }
    paint(g, [[278, 147], [277, 143], [283, 141], [290, 143], [291, 148]], '#5b6561', '#2c2c30', 1771);
    line(g, [[279, 144], [289, 144]], '#a3aa91', .45, .6);
  });
}
export function drawStoryCampBackground(g: Ctx, save: SaveData, time: number): void {
  g.save(); drawStoryAreaBackground(g, save.selectedArea ?? 'ashwood', 0, time * .5);
  g.fillStyle = 'rgba(15,18,33,.31)'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 32; i++) ellipse(g, (i * 79.41) % W, 7 + i * 29.73 % 55, .18, .18, '#eee1c8', .16 + Math.sin(time * .6 + i) ** 2 * .25);
  camp ??= campLayer(); g.drawImage(camp, 0, 0, W, H);
  lantern(g, 111, 125, time); fire(g, 200, 149, time); vignette(g, .35); g.restore();
}
function titleLayer(): HTMLCanvasElement {
  return canvas(W, H, g => {
    const p = COLOURS.ashwood;
    const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#171a2a'); grad.addColorStop(.65, '#514653'); grad.addColorStop(1, '#302d39'); g.fillStyle = grad; g.fillRect(0, 0, W, H);
    glow(g, 286, 46, 65, '#ddc9a3', .16); ellipse(g, 286, 46, 14, 14, '#c6b79e', .62); ellipse(g, 291, 42, 13, 13, '#343345', .9);
    ridge(g, 123, 10, '#343342', 5);
    const cp = { ...COLOURS.rimeholt, stone: '#454252', middle: '#343242', ink: '#282735', light: '#807276' };
    for (const [x, h, w] of [[258, 39, 12], [280, 57, 13], [302, 46, 11], [322, 65, 13]] as const) spire(g, x, 125, h, w, cp, x);
    for (let x = 250; x < 333; x += 7) paint(g, [[x, 125], [x, 104], [x + 4, 104], [x + 4, 125]], '#454252', '#282735', x + 900, false, .3);
    for (let i = 0; i < 13; i++) tree(g, i * 36 + 4, 145, 35 + i % 3 * 15, 1.8, '#35323e', '#292733', 1900 + i);
    const hill: Pt[] = [[0, H]]; for (let x = 0; x <= W; x += 4) hill.push([x, 145 + Math.sin(x * .019) * 6 - Math.exp(-(((x - 325) / 59) ** 2)) * 12]); hill.push([W, H]); paint(g, hill, '#342f36', '#25232c', 2001, true, .45);
    tree(g, 19, 171, 190, 8.2, '#28262f', '#1e2029', 2002);
    tree(g, 388, 170, 198, 9, '#28262f', '#1e2029', 2003);
    line(g, [[329, 141], [329, 102], [341, 102]], '#26232b', 1.3); line(g, [[330, 103], [340, 102]], '#8f7258', .35);
    for (let i = 0; i < 44; i++) { const x = i * 9.9; const y = 161 + Math.sin(x * .04) * 5; line(g, [[x, y + 7], [x - 1, y], [x - 3, y - 2]], '#211f29', .5, .7); }
    paper(g); vignette(g, .4);
  });
}
export function drawStoryTitleBackground(g: Ctx, time: number): void {
  g.save(); g.imageSmoothingEnabled = true; title ??= titleLayer(); g.drawImage(title, 0, 0, W, H);
  lantern(g, 339, 110, time, 1.5);
  for (let i = 0; i < 30; i++) ellipse(g, (i * 57.3) % W, 6 + (i * 23.7) % 77, .2, .2, '#eee2c8', .2 + Math.sin(time * .7 + i) ** 2 * .3);
  ambience(g, 'ashwood', 0, time, true); g.restore();
}
