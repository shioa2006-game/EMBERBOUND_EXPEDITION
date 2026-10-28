// Hand-drawn scenery in 400 × 180 game coordinates. The caller supplies a high-resolution canvas.
// Adapted from the Studio's pencil/ink/paint vocabulary: uneven contours, edge shading,
// clipped pencil hatching, stippled colour, masonry courses, and independent parallax layers.
// Each area bakes its layers once (sky, distant, far, middle, near, floor, front top/bottom, mist);
// per frame only light sources, drifting mist, particles and the party's lantern light are drawn.
// Drawing randomness is local and deterministic; it never touches the simulation RNG.
import type { AreaId, SaveData } from '../../core/types.ts';

type Ctx = CanvasRenderingContext2D;
type Pt = readonly [number, number];
type Random = () => number;
interface Colours {
  sky: string; horizon: string; far: string; middle: string; stone: string;
  soil: string; ink: string; light: string; accent: string; glow: string;
}
/** A baked strip drawn at world y with height h, repeated every w. */
interface Layer { c: HTMLCanvasElement; y: number; h: number; w: number }
/** A light baked into a layer (tile coordinates); it glows, flickers, pulses or beats every frame. */
interface Light { x: number; y: number; r: number; a: number; kind: 'flicker' | 'pulse' | 'beat'; phase: number; color: string; smoke?: boolean }
interface Lights { distant: Light[]; far: Light[]; middle: Light[]; near: Light[]; floor: Light[] }
interface Scene {
  sky: Layer; distant: Layer; far: Layer; middle: Layer; near: Layer; floor: Layer;
  frontTop: Layer; frontBottom: Layer; mist: Layer; lights: Lights;
}

/** What the battle tells the scenery: how much lantern is left and where the party carries it. */
export interface SceneMood {
  /** Lantern remaining, 0–1. The less is left, the closer the dark creeps in. */
  lantern: number;
  /** 0–1 burst after a Lantern Flare (the renderer lets it decay). */
  flare: number;
  /** World x of the lantern (the party's centre). */
  lightX: number;
  overdrive: boolean;
}
const CALM: SceneMood = { lantern: 1, flare: 0, lightX: 108, overdrive: false };

const W = 400, H = 180, TILE = 480, SCALE = 4, TAU = Math.PI * 2;
/** Scroll speed of each layer relative to the fighting plane. */
const PAR = { distant: .1, far: .2, mist: .35, middle: .54, near: .8, floor: 1, ground: .95, front: 1.15 } as const;
const COLOURS: Record<AreaId, Colours> = {
  ashwood: { sky: '#191b29', horizon: '#76605d', far: '#45434c', middle: '#4c4244', stone: '#746359', soil: '#55483e', ink: '#211f25', light: '#c8ab88', accent: '#f6b76d', glow: '#ff9a4c' },
  ruins: { sky: '#14272e', horizon: '#547c79', far: '#34575b', middle: '#3c6465', stone: '#72918b', soil: '#4c6561', ink: '#203739', light: '#b8cbb4', accent: '#a0e4ce', glow: '#9cf2dc' },
  glimmer: { sky: '#211d35', horizon: '#625274', far: '#3e3b58', middle: '#4d4565', stone: '#7c7392', soil: '#51495b', ink: '#292536', light: '#c8badb', accent: '#b8acf2', glow: '#d9a9ff' },
  rimeholt: { sky: '#202c40', horizon: '#8597ad', far: '#53677e', middle: '#64778a', stone: '#95a4ad', soil: '#939eab', ink: '#344357', light: '#e0e7e5', accent: '#c2e6f0', glow: '#ffcf8c' },
  hollow: { sky: '#141322', horizon: '#454052', far: '#302e42', middle: '#3b394e', stone: '#686271', soil: '#48414c', ink: '#211e2c', light: '#a8a3b4', accent: '#bfd29d', glow: '#d2e894' },
  heart: { sky: '#2d1a26', horizon: '#a6664b', far: '#69434a', middle: '#734d4b', stone: '#977361', soil: '#6f4e44', ink: '#39272c', light: '#e1b889', accent: '#ffd097', glow: '#ff9842' },
};
/** Strength of the drifting mist per area (smoke in the forest, silt in the ruins, …). */
const MIST: Record<AreaId, number> = { ashwood: .5, ruins: .42, glimmer: .3, rimeholt: .42, hollow: .55, heart: .4 };
const scenes = new Map<AreaId, Scene>();
let camp: HTMLCanvasElement | null = null;
let title: HTMLCanvasElement | null = null;
let grain: HTMLCanvasElement | null = null;

function rng(seed: number): Random {
  let s = seed >>> 0;
  return () => { s = Math.imul(1664525, s) + 1013904223 | 0; return (s >>> 0) / 4294967296; };
}
function mix(a: string, b: string, t: number): string {
  return '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
}
function hexAlpha(hex: string, a: number): string {
  return `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a})`;
}
const frac = (v: number): number => v - Math.floor(v);
const wrapX = (x: number, span = W + 40): number => ((x + 20) % span + span) % span - 20;
function canvas(width: number, height: number, draw: (g: Ctx) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width * SCALE; c.height = height * SCALE;
  const g = c.getContext('2d')!;
  g.scale(SCALE, SCALE); g.lineCap = 'round'; g.lineJoin = 'round';
  draw(g);
  return c;
}
/** Bake only the band y0–y1 of a strip `width` wide; far, hazy layers use a lower scale. */
function layer(width: number, y0: number, y1: number, scale: number, draw: (g: Ctx) => void): Layer {
  const c = document.createElement('canvas');
  c.width = Math.ceil(width * scale); c.height = Math.ceil((y1 - y0) * scale);
  const g = c.getContext('2d')!;
  g.scale(scale, scale); g.translate(0, -y0); g.lineCap = 'round'; g.lineJoin = 'round';
  draw(g);
  return { c, y: y0, h: y1 - y0, w: width };
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
/** Positions spread over one tile with irregular gaps, so set pieces never line up like wallpaper. */
function spots(seed: number, n: number, jitter = .7): number[] {
  const r = rng(seed), step = TILE / n;
  return Array.from({ length: n }, (_, i) => (i + .5) * step + (r() - .5) * jitter * step);
}
function tile(g: Ctx, layerToDraw: Layer, scroll: number): void {
  const x = -((scroll % layerToDraw.w + layerToDraw.w) % layerToDraw.w);
  g.drawImage(layerToDraw.c, x, layerToDraw.y, layerToDraw.w, layerToDraw.h);
  if (x + layerToDraw.w < W) g.drawImage(layerToDraw.c, x + layerToDraw.w, layerToDraw.y, layerToDraw.w, layerToDraw.h);
}
/** Draw a strip at any height and opacity (the mist is reused for clouds and ground fog). */
function band(g: Ctx, strip: Layer, offset: number, y: number, h: number, alpha: number): void {
  const x = -((offset % strip.w + strip.w) % strip.w);
  g.save(); g.globalAlpha = alpha;
  g.drawImage(strip.c, x, y, strip.w, h);
  if (x + strip.w < W) g.drawImage(strip.c, x + strip.w, y, strip.w, h);
  g.restore();
}
const ridgeY = (x: number, base: number, height: number, seed: number): number => {
  const a = x / TILE * TAU;
  return base + Math.sin(a * 3 + seed) * height + Math.sin(a * 7 + seed * 2) * height * .35;
};
function ridge(g: Ctx, base: number, height: number, color: string, seed: number): void {
  const pts: Pt[] = [[0, H]];
  for (let x = 0; x <= TILE; x += 3) pts.push([x, ridgeY(x, base, height, seed)]);
  pts.push([TILE, H]); trace(g, pts); g.fillStyle = color; g.fill();
}
/** Light falling from above catches the tops of everything already drawn on this layer. */
function topLight(g: Ctx, color: string, alpha: number, y0: number, y1: number): void {
  g.save(); g.globalCompositeOperation = 'source-atop';
  const l = g.createLinearGradient(0, y0, 0, y1); l.addColorStop(0, hexAlpha(color, alpha)); l.addColorStop(1, hexAlpha(color, 0));
  g.fillStyle = l; g.fillRect(0, y0, TILE, y1 - y0); g.restore();
}
/** Atmospheric perspective: distant shapes melt into the horizon colour, more so near the ground. */
function haze(g: Ctx, color: string, alpha: number, y0: number, y1: number): void {
  g.save(); g.globalCompositeOperation = 'source-atop';
  const l = g.createLinearGradient(0, y0, 0, y1); l.addColorStop(0, hexAlpha(color, alpha * .55)); l.addColorStop(1, hexAlpha(color, alpha));
  g.fillStyle = l; g.fillRect(0, y0, TILE, y1 - y0); g.restore();
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
/** A low hump (snow drift, rubble heap, ash mound). */
function mound(g: Ctx, x: number, base: number, width: number, height: number, fill: string, ink: string, seed: number, edge = .4): void {
  const pts: Pt[] = [[x - width / 2, base + .5]];
  for (let k = 1; k < 8; k++) { const t = k / 8; pts.push([x - width / 2 + width * t, base - Math.sin(t * Math.PI) * height * (.85 + rng(seed + k)() * .3)]); }
  pts.push([x + width / 2, base + .5]);
  paint(g, pts, fill, ink, seed, false, edge);
}

function skyLayer(id: AreaId, p: Colours): Layer {
  return layer(W, 0, H, 3, g => {
    const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, p.sky); grad.addColorStop(.7, p.horizon); grad.addColorStop(1, p.soil); g.fillStyle = grad; g.fillRect(0, 0, W, H);
    if (id === 'ashwood' || id === 'rimeholt' || id === 'hollow') {
      const r = rng(77);
      for (let i = 0; i < (id === 'rimeholt' ? 70 : 42); i++) { const s = .16 + r() * .24; ellipse(g, r() * W, r() * 78, s, s, p.light, .1 + r() * .3); }
    }
    if (id === 'ashwood' || id === 'rimeholt') {
      glow(g, 314, 36, 70, p.light, .1);
      glow(g, 314, 36, 46, p.light, .13);
      ellipse(g, 314, 36, 12, 12, id === 'ashwood' ? '#ccb298' : '#d3dfdf', .75);
      ellipse(g, 318, 33, 10.8, 10.8, p.sky, .7);
      const r = rng(44); for (let i = 0; i < 16; i++) ellipse(g, 304 + r() * 17, 26 + r() * 20, .3 + r() * 1.3, .3 + r(), p.sky, .14);
    }
    if (id === 'ruins') {
      // The surface far above: a bright, rippling ceiling of light.
      const s = g.createLinearGradient(0, 0, 0, 34); s.addColorStop(0, hexAlpha(p.light, .26)); s.addColorStop(1, hexAlpha(p.light, 0)); g.fillStyle = s; g.fillRect(0, 0, W, 34);
      for (let i = 0; i < 9; i++) line(g, [[i * 47 - 10, 6 + i % 3 * 3], [i * 47 + 8, 4 + i % 2 * 3], [i * 47 + 30, 7 + i % 3 * 2]], p.light, .5, .18);
    }
    if (id === 'glimmer') {
      // A dim glow from deeper in the cave behind the crystal ranks.
      glow(g, 140, 112, 120, p.glow, .09, .5); glow(g, 330, 104, 90, '#e3a0c8', .07, .5);
    }
    if (id === 'hollow') {
      glow(g, 270, 55, 80, p.accent, .06); glow(g, 270, 55, 59, p.accent, .1); ellipse(g, 270, 55, 28, 28, p.accent, .12); ellipse(g, 270, 55, 25.7, 25.7, p.sky, .98);
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
/** The farthest silhouettes: hills, a sunken temple, mountains, floating rock. Pale and slow. */
function distantLayer(id: AreaId, p: Colours, lights: Lights): Layer {
  return layer(TILE, 24, 142, 2, g => {
    const r = rng(1300 + id.length * 31), tone = mix(p.far, p.horizon, .45), ink = mix(p.far, p.sky, .3);
    if (id === 'ashwood') {
      ridge(g, 118, 8, tone, 9);
      for (let i = 0; i < 48; i++) {
        const x = r() * TILE, h = 8 + r() * 15, y = ridgeY(x, 118, 8, 9) + 2, lean = (r() - .5) * 3;
        wrapped(g, x, xx => { line(g, [[xx, y], [xx + lean, y - h]], ink, .55, .75); line(g, [[xx + lean * .5, y - h * .55], [xx + lean * .5 + 3, y - h * .75]], ink, .3, .7); line(g, [[xx + lean * .7, y - h * .7], [xx + lean - 2.5, y - h * .95]], ink, .3, .7); });
      }
    } else if (id === 'ruins') {
      ridge(g, 126, 4, tone, 4);
      // A drowned temple on the far bank: a dome, a colonnade and a leaning tower.
      wrapped(g, 330, x => {
        paint(g, [[x - 36, 128], [x - 36, 104], [x + 36, 104], [x + 36, 128]], tone, ink, 1311, false, .3);
        const dome: Pt[] = []; for (let k = 0; k <= 12; k++) { const a = Math.PI + k / 12 * Math.PI; dome.push([x + Math.cos(a) * 22, 104 + Math.sin(a) * 18]); }
        paint(g, dome, tone, ink, 1312, false, .3);
        for (let k = 0; k < 7; k++) line(g, [[x - 30 + k * 10, 127], [x - 30 + k * 10, 107]], ink, .7, .5);
      });
      wrapped(g, 118, x => { paint(g, [[x - 7, 130], [x - 6, 68], [x - 1, 58], [x + 5, 67], [x + 8, 130]], tone, ink, 1313, false, .3); for (let y = 76; y < 128; y += 9) ellipse(g, x + 1, y, .9, 1.8, ink, .6); });
      for (const x of spots(1314, 6)) wrapped(g, x, xx => paint(g, [[xx - 3, 129], [xx - 3, 106 + (x % 11)], [xx + 3, 103 + (x % 7)], [xx + 3, 129]], tone, ink, 1315 + Math.round(x), false, .25));
    } else if (id === 'glimmer') {
      // The cave's back wall with stalagmites; a few crystals catch light far away.
      ridge(g, 104, 12, tone, 6);
      for (const x of spots(1320, 11)) {
        const h = 10 + r() * 22, y = ridgeY(x, 104, 12, 6) + 4;
        wrapped(g, x, xx => paint(g, [[xx - 5, y + 2], [xx - 1, y - h], [xx + 5, y + 2]], tone, ink, 1321 + Math.round(x), false, .3));
      }
      for (let i = 0; i < 7; i++) { const x = r() * TILE; lights.distant.push({ x, y: ridgeY(x, 104, 12, 6) + 6 + r() * 14, r: 5 + r() * 4, a: .45, kind: 'pulse', phase: r() * TAU, color: i % 2 ? p.glow : '#ff9bd0' }); }
    } else if (id === 'rimeholt') {
      // A snowy range behind the castle.
      const peaks = spots(1330, 7, .9);
      for (const x of peaks) {
        const h = 34 + r() * 30, w = 30 + r() * 26, base = 128;
        wrapped(g, x, xx => {
          paint(g, [[xx - w, base], [xx - w * .35, base - h * .62], [xx, base - h], [xx + w * .28, base - h * .7], [xx + w, base]], tone, ink, 1331 + Math.round(x), false, .3);
          paint(g, [[xx - w * .3, base - h * .6], [xx, base - h], [xx + w * .26, base - h * .68], [xx + w * .1, base - h * .55], [xx - w * .08, base - h * .66]], mix(p.light, p.horizon, .3), ink, 1332 + Math.round(x), false, .2);
        });
      }
    } else if (id === 'hollow') {
      ridge(g, 124, 6, tone, 2);
      // Rock torn loose, hanging in the void.
      for (const x of spots(1340, 5, .9)) {
        const y = 52 + r() * 40, w = 9 + r() * 12, d = 7 + r() * 9;
        wrapped(g, x, xx => {
          paint(g, [[xx - w, y], [xx - w * .4, y - 3], [xx + w * .6, y - 2.5], [xx + w, y + .5], [xx + w * .3, y + d * .6], [xx, y + d], [xx - w * .35, y + d * .55]], tone, ink, 1341 + Math.round(x), false, .3);
          for (let k = 0; k < 3; k++) ellipse(g, xx + (k - 1) * w * .5, y + d + 4 + k * 3, .8, .6, tone, .8);
        });
      }
    } else {
      ridge(g, 116, 10, tone, 7);
      for (const x of spots(1350, 7)) {
        const h = 26 + r() * 24, y = ridgeY(x, 116, 10, 7) + 6;
        wrapped(g, x, xx => { paint(g, [[xx - 5, y], [xx - 3, y - h], [xx + 1, y - h - 4], [xx + 4, y - h], [xx + 6, y]], tone, ink, 1351 + Math.round(x), false, .3); line(g, [[xx, y - 2], [xx - 1, y - h * .5], [xx + 1, y - h + 3]], p.accent, .5, .4); });
        lights.distant.push({ x, y: y - h * .5, r: 6, a: .35, kind: 'beat', phase: r() * .4, color: p.glow });
      }
    }
    haze(g, p.horizon, .42, 24, 142);
  });
}
function farLayer(id: AreaId, p: Colours, lights: Lights): Layer {
  return layer(TILE, 0, 142, 3, g => {
    const r = rng(100 + id.length);
    ridge(g, 111, 11, p.far, 3);
    if (id === 'ashwood') {
      for (let i = 0; i < 29; i++) {
        const height = 40 + r() * 32, width = 1.2 + r(), x = i * TILE / 29 + (r() - .5) * 9;
        wrapped(g, x, xx => { g.save(); g.globalAlpha = .65; tree(g, xx, 128, height, width, p.far, p.sky, 600 + i); g.restore(); });
      }
    } else if (id === 'ruins') {
      spots(410, 6, .5).forEach((x, i) => wrapped(g, x, xx => { const q = { ...p, stone: p.far, ink: p.sky }; arch(g, xx, 133, 14 + i % 3 * 2, 60 + (i * 7) % 20, q, 411 + i); }));
      for (let i = 0; i < 5; i++) line(g, [[0, 118 + i * 3.3], [TILE, 118 + i * 3.3]], p.light, .45, .1);
    } else if (id === 'glimmer') {
      for (let i = 0; i < 20; i++) { const x = i * 24 + (r() - .5) * 12; wrapped(g, x, xx => crystal(g, xx, 133, 25 + (i * 17 % 39), 13 + i % 3 * 3, { ...p, stone: p.far, ink: p.sky, light: p.middle }, 500 + i, i % 2 ? 8 : -9)); }
      for (let i = 0; i < 11; i++) { const x = i * 44 + (r() - .5) * 16; wrapped(g, x, xx => paint(g, [[xx - 22, -3], [xx + 18, -3], [xx + 12, 19], [xx + 4, 47 + i % 3 * 7], [xx - 2, 21], [xx - 16, 34]], p.far, p.sky, 600 + i)); }
    } else if (id === 'rimeholt') {
      ridge(g, 96, 21, p.far, 1);
      spots(700, 9, .6).forEach((x, i) => {
        const h = 43 + (i * 5) % 3 * 16;
        wrapped(g, x, xx => spire(g, xx, 130, h, 16, { ...p, stone: p.far, middle: p.far, ink: p.sky, light: p.horizon }, 700 + i, true));
        if (i % 3 === 0) lights.far.push({ x, y: 130 - h * .45, r: 5, a: .5, kind: 'flicker', phase: i * 1.7, color: p.glow });
      });
    } else if (id === 'hollow') {
      spots(800, 14, .6).forEach((x, i) => wrapped(g, x, xx => {
        const h = 40 + i * 19 % 47;
        paint(g, [[xx - 7, 134], [xx - 5, 134 - h * .7], [xx + 1, 134 - h], [xx + 4, 134 - h * .6], [xx + 6, 134]], p.far, p.sky, 800 + i);
      }));
    } else {
      spots(900, 9, .6).forEach((x, i) => wrapped(g, x, xx => {
        const h = 49 + i % 3 * 15;
        paint(g, [[xx - 14, 137], [xx - 11, 137 - h], [xx - 3, 127 - h], [xx + 9, 137 - h], [xx + 16, 137]], p.far, p.sky, 900 + i);
        line(g, [[xx - 3, 134], [xx - 4, 108], [xx + 3, 96], [xx, 137 - h]], p.accent, .6, .35);
      }));
    }
    haze(g, p.horizon, .2, 0, 142);
    topLight(g, p.light, id === 'ruins' ? .14 : .08, 0, 120);
  });
}
function middleLayer(id: AreaId, p: Colours, lights: Lights): Layer {
  return layer(TILE, 0, 150, SCALE, g => {
    const r = rng(140 + id.length * 3);
    if (id === 'ashwood') {
      spots(120, 6, .6).forEach((x, i) => {
        const height = 88 + (i * 7) % 3 * 17 + r() * 8, wide = 3.2 + i % 2 * 1.4 + r() * .5;
        wrapped(g, x, xx => tree(g, xx, 137, height, wide, p.middle, p.ink, 120 + i, true));
        // Two of the burned trees still smoulder inside their hollows.
        if (i % 3 === 1) {
          const hx = x + wide * .15, hy = 137 - height * .42;
          wrapped(g, hx, xx => { ellipse(g, xx, hy, wide * .2, wide * .62, '#e0773e', .85); ellipse(g, xx, hy + .4, wide * .1, wide * .35, '#ffd08a', .9); });
          lights.middle.push({ x: hx, y: hy, r: 13, a: .55, kind: 'flicker', phase: i * 2.3, color: p.glow });
        }
      });
      for (let i = 0; i < 22; i++) wrapped(g, i * 23 + (r() - .5) * 8, x => {
        for (let k = 0; k < 4; k++) line(g, [[x, 139], [x + k - 2, 132 - k % 2 * 2], [x + (k - 2) * 3, 128 - k % 3 * 3]], p.ink, .4, .6);
      });
    } else if (id === 'ruins') {
      spots(150, 4, .45).forEach((x, i) => wrapped(g, x, xx => {
        if (i % 2 === 0) arch(g, xx, 137, 20 + i % 3 * 3, 90 + (i * 5) % 12, p, 151 + i);
        else { pillar(g, xx - 20, 137, 60 + (i * 3) % 12, p, 176 + i, true); pillar(g, xx + 28, 137, 88, p, 198 + i, true); }
        for (let k = 0; k < 4; k++) line(g, [[xx - 23 + k * 2, 50 + k], [xx - 24 + k * 2, 70], [xx - 20 + k * 2, 84 + k * 4]], p.ink, .4, .65);
        const cx = xx + 25;
        for (let k = 0; k < 5; k++) line(g, [[cx, 138], [cx + k - 2, 128], [cx + (k - 2) * 2, 124 - k % 2 * 5]], '#a47b70', .7, .75);
      }));
      for (let i = 0; i < 18; i++) wrapped(g, i * 28, x => ellipse(g, x, 139, 11, 1.1, p.accent, .12));
    } else if (id === 'glimmer') {
      spots(250, 6, .6).forEach((x, i) => {
        wrapped(g, x, xx => {
          paint(g, [[xx - 23, 139], [xx - 19, 126], [xx - 6, 118], [xx + 14, 124], [xx + 25, 140]], p.middle, p.ink, 250 + i);
          crystal(g, xx - 4, 133, 31 + i % 3 * 8, 17, p, 270 + i, -8);
          crystal(g, xx + 12, 137, 20 + i % 2 * 11, 13, { ...p, stone: '#766984', accent: '#e3a0c8' }, 290 + i, 10);
          crystal(g, xx - 15, 137, 16, 10, p, 310 + i, -8);
        });
        lights.middle.push({ x: x - 7, y: 133 - (31 + i % 3 * 8) * .5, r: 20, a: .4, kind: 'pulse', phase: i * 1.9, color: p.glow });
        lights.middle.push({ x: x + 14, y: 137 - (20 + i % 2 * 11) * .55, r: 12, a: .35, kind: 'pulse', phase: i * 2.7 + 1, color: '#ff9bd0' });
      });
      for (let i = 0; i < 6; i++) wrapped(g, 45 + i * 87 + (r() - .5) * 20, x => paint(g, [[x - 31, -2], [x + 21, -2], [x + 16, 12], [x + 8, 16], [x + 4, 37], [x - 3, 18], [x - 12, 24], [x - 18, 11]], p.middle, p.ink, 330 + i));
    } else if (id === 'rimeholt') {
      spots(400, 4, .4).forEach((x, i) => {
        const q = { ...p, stone: p.middle };
        wrapped(g, x, xx => {
          spire(g, xx, 137, 92 + i % 2 * 18, 22, q, 400 + i, true);
          paint(g, [[xx + 11, 137], [xx + 11, 99], [xx + 65, 99], [xx + 65, 137]], p.middle, p.ink, 422 + i);
          for (let k = 0; k < 6; k++) { stone(g, xx + 12 + k * 9, 96, 6, 6, q, 445 + k); line(g, [[xx + 12 + k * 9, 96], [xx + 18 + k * 9, 96]], p.light, 1.3, .8); }
          for (let y = 106; y < 137; y += 7) line(g, [[xx + 11, y], [xx + 65, y]], p.ink, .28, .6);
          line(g, [[xx + 11, 102], [xx + 65, 102]], p.light, .85, .65);
          for (let k = 0; k < 5; k++) paint(g, [[xx + 15 + k * 10, 101], [xx + 17 + k * 10, 101], [xx + 16 + k * 10, 108 + k % 2 * 5]], p.light, p.ink, 470 + k, false, .15);
          // Lit windows: someone still keeps a fire in the frozen keep.
          for (const [wx, wy] of [[xx + 26, 116], [xx + 48, 120]] as const) {
            paint(g, [[wx - 2.2, wy + 4], [wx - 2.2, wy - 1], [wx, wy - 3], [wx + 2.2, wy - 1], [wx + 2.2, wy + 4]], '#f1c27f', p.ink, 480 + i, false, .35);
            line(g, [[wx, wy - 2.5], [wx, wy + 4]], p.ink, .3, .7);
          }
        });
        lights.middle.push({ x: x + 26, y: 117, r: 11, a: .5, kind: 'flicker', phase: i * 1.3, color: p.glow });
        lights.middle.push({ x: x + 48, y: 121, r: 11, a: .45, kind: 'flicker', phase: i * 2.1 + .7, color: p.glow });
      });
    } else if (id === 'hollow') {
      spots(510, 5, .55).forEach((x, i) => {
        const h = 50 + i % 3 * 18;
        wrapped(g, x, xx => {
          paint(g, [[xx - 10, 138], [xx - 9, 138 - h], [xx + 3, 131 - h], [xx + 10, 135 - h], [xx + 13, 138]], p.middle, p.ink, 510 + i);
          for (let k = 0; k < 4; k++) { const y = 139 - h + k * 7; line(g, [[xx - 2, y], [xx + 2, y + 2], [xx - 1, y + 4], [xx + 3, y + 5]], p.accent, .45, .55); }
          line(g, [[xx - 10, 116], [xx - 28, 129], [xx - 32, 137]], p.ink, .75);
          line(g, [[xx + 10, 110], [xx + 26, 128], [xx + 37, 132]], p.ink, .7);
        });
        lights.middle.push({ x: x + .5, y: 139 - h + 12, r: 13, a: .4, kind: 'pulse', phase: i * 1.4, color: p.glow });
      });
      for (let i = 0; i < 3; i++) wrapped(g, 90 + i * 161 + (r() - .5) * 30, x => { g.save(); g.globalAlpha = .55; arch(g, x, 137, 21, 81, { ...p, stone: p.middle }, 550 + i); g.restore(); });
    } else {
      spots(610, 4, .4).forEach((x, i) => wrapped(g, x, xx => {
        arch(g, xx, 139, 27, 95 + i % 2 * 11, { ...p, stone: p.middle }, 610 + i);
        for (const dir of [-1, 1]) {
          const bx = xx + dir * 32;
          line(g, [[bx, 139], [bx + dir * 2, 111], [bx - dir * 3, 102], [bx + dir * 2, 89], [bx, 70]], p.accent, .75, .5);
        }
      }));
      // The ember altar repeats slowly behind the fighting plane.
      wrapped(g, 291, x => {
        glow(g, x, 72, 35, p.accent, .15);
        const pts: Pt[] = [[x, 48], [x + 11, 59], [x + 10, 76], [x, 91], [x - 10, 76], [x - 11, 59]];
        paint(g, pts, '#ae7954', p.ink, 671, false, .65);
        paint(g, [[x, 53], [x + 5, 66], [x + 3, 76], [x, 83], [x - 4, 70]], '#e4bb7d', '#8e573e', 672, false, .35);
        for (const dx of [-16, 16]) line(g, [[x + dx, 30], [x + dx * .6, 53]], p.ink, .65);
      });
      lights.middle.push({ x: 291, y: 70, r: 42, a: .5, kind: 'beat', phase: 0, color: p.glow });
    }
    topLight(g, p.light, id === 'ruins' ? .16 : .1, 0, 125);
    // A thin wash makes intricate scenery recede behind the party and health bars.
    const mist = g.createLinearGradient(0, 80, 0, 145); mist.addColorStop(0, hexAlpha(p.horizon, 0)); mist.addColorStop(.6, hexAlpha(p.horizon, .08)); mist.addColorStop(1, hexAlpha(p.horizon, .25)); g.fillStyle = mist; g.fillRect(0, 80, TILE, 65);
  });
}
/** Props just behind the fighting plane: stumps, rubble, drifts. Low, so the party stays readable. */
function nearLayer(id: AreaId, p: Colours, lights: Lights): Layer {
  return layer(TILE, 92, 150, SCALE, g => {
    const r = rng(2100 + id.length * 13), dark = mix(p.middle, p.ink, .3);
    if (id === 'ashwood') {
      for (const x of [95 + r() * 40, 330 + r() * 40]) wrapped(g, x, xx => {
        paint(g, [[xx - 24, 140], [xx - 23, 133.5], [xx + 21, 133], [xx + 23, 139.5]], dark, p.ink, 2101 + Math.round(x), true, .5);
        ellipse(g, xx + 22, 136.3, 1.7, 3.1, '#6b5546'); ellipse(g, xx + 22, 136.3, .8, 1.6, '#3d322e');
        line(g, [[xx - 18, 134.5], [xx + 14, 134]], p.light, .3, .3);
      });
      spots(2110, 3, .5).forEach((x, i) => {
        wrapped(g, x, xx => {
          paint(g, [[xx - 7, 140], [xx - 6.5, 128], [xx - 3, 125.5], [xx, 128.5], [xx + 3, 124.8], [xx + 6.5, 127.6], [xx + 7, 140]], mix(p.middle, p.ink, .15), p.ink, 2111 + i, true, .55);
          ellipse(g, xx, 127.2, 4, 1.3, '#e0773e', .85); ellipse(g, xx + .5, 126.9, 2, .6, '#ffd08a', .9);
          line(g, [[xx - 2, 129], [xx - 1, 134], [xx - 2.5, 138]], '#c06a3a', .45, .6);
        });
        lights.near.push({ x, y: 126.5, r: 13, a: .55, kind: 'flicker', phase: i * 2.1, color: p.glow, smoke: true });
      });
      for (const x of spots(2120, 4, .8)) wrapped(g, x, xx => {
        for (let k = 0; k < 6; k++) {
          const tip: Pt = [xx + (k - 2.5) * 3.6, 131 - (2.5 - Math.abs(k - 2.5)) * 2.4];
          line(g, [[xx, 140], [xx + (k - 2.5) * 1.6, 135], tip], p.ink, .55, .8);
          line(g, [[tip[0] - 1.5, tip[1] + 2], [tip[0], tip[1] + .5], [tip[0] + 1.5, tip[1] + 2]], p.ink, .35, .7);
        }
      });
    } else if (id === 'ruins') {
      // A toppled statue's head lies half-sunk in the silt.
      wrapped(g, 250, x => {
        paint(g, [[x - 18, 140], [x - 19, 128], [x - 12, 117], [x + 2, 114], [x + 14, 118], [x + 19, 128], [x + 17, 140]], mix(p.stone, p.ink, .32), p.ink, 2131, true, .6);
        line(g, [[x - 8, 124], [x - 3, 125.5]], p.ink, .55); line(g, [[x + 4, 125.5], [x + 9, 124]], p.ink, .55);
        line(g, [[x + .5, 125], [x - 1, 131], [x + 1.5, 132]], p.ink, .45); line(g, [[x - 4, 135], [x + 4, 135.4]], p.ink, .45);
        line(g, [[x + 10, 116], [x + 7, 121], [x + 11, 127]], p.ink, .4, .7);
        for (let k = 0; k < 5; k++) line(g, [[x - 17 + k * 2, 139], [x - 18 + k * 2, 132], [x - 15 + k * 3, 127 - k % 2 * 3]], mix(p.accent, p.ink, .45), .6, .75);
      });
      for (const x of [70 + r() * 30, 395 + r() * 30]) wrapped(g, x, xx => {
        paint(g, [[xx - 14, 140], [xx - 14, 132], [xx + 12, 132], [xx + 12, 140]], p.stone, p.ink, 2140 + Math.round(x), true, .5);
        ellipse(g, xx + 12, 136, 2.2, 4, mix(p.stone, p.light, .2)); ellipse(g, xx + 12, 136, 1.2, 2.4, p.ink, .35);
        for (let k = 1; k < 4; k++) line(g, [[xx - 14 + k * 6.5, 132.4], [xx - 14 + k * 6.5, 139.6]], p.ink, .3, .5);
      });
      for (const x of spots(2150, 3, .9)) wrapped(g, x, xx => { stone(g, xx - 8, 135, 9, 5, p, 2151 + Math.round(x)); stone(g, xx, 136, 7, 4, p, 2152 + Math.round(x)); stone(g, xx - 4, 131.5, 7, 4, p, 2153 + Math.round(x)); });
    } else if (id === 'glimmer') {
      spots(2160, 4, .7).forEach((x, i) => {
        wrapped(g, x, xx => {
          paint(g, [[xx - 14, 140], [xx - 11, 133], [xx - 2, 130], [xx + 9, 133], [xx + 13, 140]], dark, p.ink, 2161 + i, true, .5);
          crystal(g, xx - 3, 137, 13 + i % 2 * 5, 7, p, 2165 + i, -3);
          crystal(g, xx + 5, 138, 9, 5, { ...p, accent: '#e3a0c8' }, 2169 + i, 4);
        });
        lights.near.push({ x: x - 3, y: 131, r: 10, a: .4, kind: 'pulse', phase: i * 1.6 + .4, color: i % 2 ? '#ff9bd0' : p.glow });
      });
    } else if (id === 'rimeholt') {
      for (const x of spots(2180, 4, .8)) wrapped(g, x, xx => mound(g, xx, 140, 30 + (x % 13), 5 + (x % 4), mix(p.light, p.horizon, .3), mix(p.ink, p.horizon, .3), 2181 + Math.round(x), .35));
      for (const x of [150 + r() * 40, 420 + r() * 30]) wrapped(g, x, xx => {
        paint(g, [[xx - 7, 140], [xx - 7, 129], [xx + 7, 129], [xx + 7, 140]], '#6d6a6e', p.ink, 2190 + Math.round(x), true, .5);
        line(g, [[xx - 7, 134.5], [xx + 7, 134.5]], p.ink, .35, .6); line(g, [[xx - 7.5, 129], [xx + 7.5, 129]], p.light, 1.4, .9);
      });
      spots(2200, 2, .4).forEach((x, i) => {
        wrapped(g, x, xx => {
          line(g, [[xx, 140], [xx, 104]], p.ink, 1); line(g, [[xx, 105], [xx + 5, 103]], p.ink, .6);
          paint(g, [[xx + 3, 103], [xx + 7, 103], [xx + 6.5, 109], [xx + 3.5, 109]], '#f1c27f', p.ink, 2201 + i, false, .4);
          line(g, [[xx + 2.5, 103], [xx + 7.5, 103]], p.light, .9, .8);
        });
        lights.near.push({ x: x + 5, y: 106, r: 17, a: .6, kind: 'flicker', phase: i * 3.1, color: p.glow });
      });
    } else if (id === 'hollow') {
      spots(2220, 3, .6).forEach((x, i) => {
        const h = 16 + i * 5;
        wrapped(g, x, xx => {
          paint(g, [[xx - 7, 140], [xx - 6, 140 - h], [xx - 1, 140 - h - 3], [xx + 3, 140 - h + 2], [xx + 7, 140]], dark, p.ink, 2221 + i, true, .5);
          line(g, [[xx - 1.5, 140 - h + 5], [xx + 1.5, 140 - h + 7], [xx - 1, 140 - h + 9], [xx + 2, 140 - h + 11]], p.accent, .5, .7);
        });
        lights.near.push({ x, y: 140 - h + 8, r: 9, a: .5, kind: 'pulse', phase: i * 1.7 + .9, color: p.glow });
      });
      for (const x of spots(2230, 2, .5)) wrapped(g, x, xx => {
        line(g, [[xx - 12, 140], [xx - 12, 121]], p.ink, .9); line(g, [[xx + 12, 140], [xx + 12, 124]], p.ink, .9);
        for (let k = 0; k <= 8; k++) { const t = k / 8, cx = xx - 12 + 24 * t, cy = 122 + Math.sin(t * Math.PI) * 9 + t * 2; g.save(); g.strokeStyle = p.light; g.globalAlpha = .55; g.lineWidth = .35; g.beginPath(); g.ellipse(cx, cy, 1.4, .9, k % 2 ? .3 : -.3, 0, TAU); g.stroke(); g.restore(); }
      });
    } else {
      spots(2240, 4, .7).forEach((x, i) => {
        wrapped(g, x, xx => {
          paint(g, [[xx - 9, 140], [xx - 7, 131], [xx - 1, 127], [xx + 6, 130], [xx + 9, 140]], '#3a2a2e', p.ink, 2241 + i, true, .5);
          line(g, [[xx - 5, 131], [xx - 2, 134], [xx - 4, 137], [xx, 139.5]], p.accent, .6, .8);
          line(g, [[xx + 2, 129.5], [xx + 4, 133], [xx + 3, 136]], p.glow, .45, .7);
        });
        lights.near.push({ x: x - 1, y: 134, r: 11, a: .5, kind: 'beat', phase: i * .07, color: p.glow });
      });
      for (const x of [180 + r() * 30, 420 + r() * 30]) {
        wrapped(g, x, xx => {
          line(g, [[xx - 5, 140], [xx - 3, 129]], p.ink, .8); line(g, [[xx + 5, 140], [xx + 3, 129]], p.ink, .8);
          paint(g, [[xx - 7, 127], [xx + 7, 127], [xx + 5, 131], [xx - 5, 131]], '#5c4038', p.ink, 2250 + Math.round(x), false, .5);
          paint(g, [[xx - 4, 127], [xx - 2.5, 121], [xx, 124], [xx + 1.5, 118.5], [xx + 3, 123], [xx + 4.5, 127]], '#f0a35c', '#b86c49', 2251 + Math.round(x), false, .35);
        });
        lights.near.push({ x, y: 124, r: 16, a: .6, kind: 'flicker', phase: x, color: p.glow, smoke: true });
      }
    }
    topLight(g, p.light, .08, 92, 132);
  });
}
function floorLayer(id: AreaId, p: Colours, lights: Lights): Layer {
  return layer(TILE, 134, H, SCALE, g => {
    const grad = g.createLinearGradient(0, 135, 0, H); grad.addColorStop(0, p.soil); grad.addColorStop(.45, mix(p.soil, p.light, .12)); grad.addColorStop(1, mix(p.soil, p.ink, .55));
    g.fillStyle = grad; g.fillRect(0, 138, TILE, H - 138);
    const edge: Pt[] = []; for (let x = 0; x <= TILE; x += 4) edge.push([x, 138 + Math.sin(x / TILE * TAU * 9) * .65]);
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
    // Where the back props meet the ground, a soft contact shadow; the front bank falls into shade.
    const contact = g.createLinearGradient(0, 138, 0, 147); contact.addColorStop(0, hexAlpha(p.ink, .4)); contact.addColorStop(1, hexAlpha(p.ink, 0)); g.fillStyle = contact; g.fillRect(0, 138, TILE, 9);
    line(g, edge, p.ink, .5, .7);
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
    if (id === 'ashwood') {
      for (let i = 0; i < 14; i++) wrapped(g, r() * TILE, x => ellipse(g, x, 142 + (i * 7) % 30, 9 + i % 4 * 4, 1.2, p.light, .07));
      for (let i = 0; i < 6; i++) { const x = r() * TILE, y = 141 + r() * 32; wrapped(g, x, xx => line(g, [[xx, y], [xx + 5, y + 1.5], [xx + 9, y + 1], [xx + 14, y + 3]], '#3b2e29', .7, .7)); }
      for (let i = 0; i < 34; i++) wrapped(g, r() * TILE, x => ellipse(g, x, 140 + (i * 13) % 36, .35, .25, p.glow, .55));
      for (let i = 0; i < 6; i++) lights.floor.push({ x: r() * TILE, y: 142 + r() * 30, r: 5, a: .35, kind: 'flicker', phase: i * 1.9, color: p.glow });
    }
    if (id === 'glimmer') {
      spots(1160, 6, .9).forEach((x, i) => {
        const y = 145 + (i * 11) % 26;
        wrapped(g, x, xx => crystal(g, xx, y, 4 + i % 3 * 2, 3, p, 1161 + i, i % 2 ? 2 : -2));
        lights.floor.push({ x, y: y - 2, r: 6, a: .35, kind: 'pulse', phase: i * 2.3, color: i % 2 ? '#ff9bd0' : p.glow });
      });
    }
    if (id === 'rimeholt') {
      for (let i = 0; i < 18; i++) wrapped(g, i * 28, x => ellipse(g, x, i % 2 ? 140 : 164, 11 + i % 3 * 3, 1.3 + i % 2, p.light, .35));
      for (let i = 0; i < 9; i++) wrapped(g, r() * TILE, x => line(g, [[x, 150 + (i * 7) % 24], [x + 12, 150 + (i * 7) % 24 - .5]], '#ffffff', .4, .2));
    }
    if (id === 'ruins') for (let i = 0; i < 12; i++) wrapped(g, i * 42, x => {
      const y = 143 + i % 3 * 9;
      ellipse(g, x, y, 8 + i % 3 * 4, 1.1, mix(p.accent, p.sky, .3), .16); ellipse(g, x - 1, y - .2, 5 + i % 2 * 3, .5, p.light, .14);
      line(g, [[x - 6, y], [x + 5, y]], p.light, .25, .25);
    });
    if (id === 'hollow' || id === 'heart') {
      // Glowing fissures: a wandering main crack with a short branch; the light shows only in the middle.
      const hot = id === 'heart';
      spots(hot ? 1190 : 1180, hot ? 7 : 5, .8).forEach((x, i) => {
        const cr = rng((hot ? 1191 : 1181) + i), y = 143 + (i * 9) % 28, main: Pt[] = [];
        let cx = x - 10, cy = y;
        for (let k = 0; k < 7; k++) { main.push([cx, cy]); cx += 2.4 + cr() * 2.2; cy += (cr() - .5) * 2.4; }
        const fork = main[3], branch: Pt[] = [fork, [fork[0] + 2 + cr() * 2, fork[1] + 1.8 + cr()], [fork[0] + 4 + cr() * 3, fork[1] + 3 + cr()]];
        wrapped(g, 0, dx => {
          const m = main.map(([a, b]) => [a + dx, b] as Pt), b = branch.map(([a, c]) => [a + dx, c] as Pt);
          line(g, m, p.ink, hot ? 1.3 : 1.1, .85); line(g, b, p.ink, .7, .8);
          line(g, m.slice(1, -1), hot ? p.accent : p.accent, hot ? .5 : .32, hot ? .7 : .55);
          line(g, b.slice(0, 2), p.accent, .25, .5);
        });
        lights.floor.push({ x: x + 4, y, r: hot ? 9 : 7, a: hot ? .42 : .3, kind: hot ? 'beat' : 'pulse', phase: hot ? i * .05 : i * 1.3, color: p.glow });
      });
    }
  });
}
/** Sparse foreground at the very top and bottom edges; the fighting band stays clear. */
function frontLayers(id: AreaId, p: Colours): { top: Layer; bottom: Layer } {
  const top = layer(TILE, 0, 44, SCALE, g => {
    if (id === 'ashwood') {
      wrapped(g, 170, x => { line(g, [[x - 40, -3], [x, 5], [x + 36, 9], [x + 59, 4]], p.ink, 2.5); line(g, [[x + 10, 7], [x + 15, 16], [x + 32, 19]], p.ink, 1); });
    } else if (id === 'ruins') {
      // Kelp trailing down from a ledge just above the view.
      for (const x of spots(1210, 3, .8)) wrapped(g, x, xx => {
        for (let k = 0; k < 4; k++) {
          const len = 16 + (k * 7 + Math.round(x)) % 14, bx = xx + k * 4.5 - 7, sway = k % 2 ? 2.2 : -1.8, w = 1.3 + (k % 3) * .35;
          const blade: Pt[] = [[bx - w, -2], [bx + w, -2], [bx + w * .8 + sway, len * .45], [bx + .4 + sway * .4, len], [bx - w * .6 + sway, len * .5]];
          paint(g, blade, mix(p.middle, p.ink, .35 + k % 2 * .15), p.ink, 1211 + k * 7 + Math.round(x), false, .35);
          line(g, [[bx, 0], [bx + sway * .7, len * .5], [bx + .3 + sway * .4, len - 1]], mix(p.accent, p.ink, .3), .25, .5);
        }
      });
    } else if (id === 'glimmer') {
      for (const x of spots(1220, 2, .6)) wrapped(g, x, xx => paint(g, [[xx - 11, -2], [xx + 10, -2], [xx + 4, 12], [xx + 1, 28], [xx - 2, 13], [xx - 7, 18]], p.ink, '#161322', 1221 + Math.round(x), true, .6));
    } else if (id === 'rimeholt') {
      // A frosted stone lintel of the gate the party walks under, hung with icicles.
      for (const x of spots(1230, 2, .7)) wrapped(g, x, xx => {
        paint(g, [[xx - 30, -3], [xx + 32, -3], [xx + 31, 4.5], [xx - 29, 5]], mix(p.ink, p.middle, .35), p.ink, 1230 + Math.round(x), true, .55);
        line(g, [[xx - 29, 4.6], [xx + 31, 4.2]], p.light, .6, .7);
        const r = rng(1232 + Math.round(x));
        for (let ix = xx - 26; ix < xx + 29; ix += 3 + r() * 4) {
          const len = 3 + r() * 13, w = .7 + r() * 1.1;
          paint(g, [[ix - w, 4.3], [ix + w, 4.3], [ix + w * .25, 4.3 + len * .8], [ix, 4.3 + len]], mix(p.accent, '#ffffff', .25), mix(p.ink, p.horizon, .3), 1233 + Math.round(ix * 10), false, .22);
          line(g, [[ix - w * .4, 5], [ix - w * .1, 3.5 + len * .7]], '#ffffff', .25, .6);
        }
      });
    } else if (id === 'heart') {
      for (const x of spots(1240, 2, .6)) wrapped(g, x, xx => {
        for (let k = 0; k <= 9; k++) { g.save(); g.strokeStyle = p.ink; g.lineWidth = .7; g.beginPath(); g.ellipse(xx + Math.sin(k * .5) * 1.2, k * 3.4, 1.1, 1.8, 0, 0, TAU); g.stroke(); g.restore(); }
        ellipse(g, xx, 33, 3, 2, p.ink);
      });
    }
  });
  const bottom = layer(TILE, 150, H, SCALE, g => {
    if (id === 'ashwood') {
      for (let i = 0; i < 3; i++) wrapped(g, 21 + i * 177, x => {
        for (let k = 0; k < 5; k++) {
          const tip: Pt = [x + (k - 2) * 5.5, 166 - (2 - Math.abs(k - 2)) * 3];
          line(g, [[x, 185], [x + (k - 2) * 3, 174], tip], p.ink, .7, .8);
          for (let j = 0; j < 4; j++) { const t = .3 + j * .15, px = x + (tip[0] - x) * t, py = 185 + (tip[1] - 185) * t; line(g, [[px - 2.5, py - 3], [px, py], [px + 2.5, py - 3]], p.ink, .55, .75); }
        }
      });
    } else if (id === 'glimmer') {
      for (let i = 0; i < 4; i++) wrapped(g, 20 + i * 137, x => crystal(g, x, 184, 14 + i % 2 * 3, 12, { ...p, stone: p.ink, light: p.middle }, 1200 + i, -5));
    } else if (id === 'ruins') {
      for (let i = 0; i < 4; i++) wrapped(g, 18 + i * 138, x => { for (let k = 0; k < 4; k++) line(g, [[x + k, 184], [x + k - 2, 176], [x + k + 1, 169 - k % 2 * 3]], p.ink, .8, .8); });
    } else if (id === 'hollow') {
      for (let i = 0; i < 4; i++) wrapped(g, 55 + i * 130, x => line(g, [[x - 20, 182], [x - 8, 177], [x + 6, 176], [x + 15, 168]], p.ink, 1.3, .85));
    } else if (id === 'rimeholt') {
      for (const x of spots(1250, 2, .8)) wrapped(g, x, xx => {
        mound(g, xx, 183, 40, 9, mix(p.light, p.horizon, .38), mix(p.ink, p.horizon, .2), 1251 + Math.round(x), .5);
        for (let k = 0; k < 4; k++) line(g, [[xx - 14 + k * 9, 181], [xx - 11 + k * 9, 177 + k % 2]], p.ink, .3, .35);
      });
    } else {
      for (const x of spots(1260, 3, .8)) wrapped(g, x, xx => {
        for (let k = 0; k < 4; k++) { const bx = xx + (k - 1.5) * 6, h = 8 + (k * 5 + x) % 9; paint(g, [[bx - 3, 183], [bx - .5, 183 - h], [bx + 3, 183]], '#2b1e22', '#170f12', 1261 + k, false, .5); line(g, [[bx - .5, 183 - h + 1], [bx + 2, 182]], p.glow, .35, .5); }
      });
    }
  });
  return { top, bottom };
}
function mistLayer(id: AreaId, p: Colours): Layer {
  return layer(TILE, 0, 40, 2, g => {
    const r = rng(1500 + id.length * 3), tint = mix(p.horizon, p.light, id === 'ashwood' || id === 'heart' ? .15 : .35);
    for (let i = 0; i < 26; i++) {
      const x = r() * TILE, y = 13 + r() * 14, rx = 24 + r() * 46, ry = 5 + r() * 7;
      wrapped(g, x, xx => {
        g.save(); g.translate(xx, y); g.scale(1, ry / rx);
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, rx); grad.addColorStop(0, hexAlpha(tint, .24)); grad.addColorStop(1, hexAlpha(tint, 0));
        g.fillStyle = grad; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
      });
    }
  });
}
function scene(id: AreaId): Scene {
  let s = scenes.get(id);
  if (s) { scenes.delete(id); scenes.set(id, s); return s; }
  const p = COLOURS[id], lights: Lights = { distant: [], far: [], middle: [], near: [], floor: [] };
  const front = frontLayers(id, p);
  s = {
    sky: skyLayer(id, p), distant: distantLayer(id, p, lights), far: farLayer(id, p, lights), middle: middleLayer(id, p, lights),
    near: nearLayer(id, p, lights), floor: floorLayer(id, p, lights), frontTop: front.top, frontBottom: front.bottom, mist: mistLayer(id, p), lights,
  };
  scenes.set(id, s);
  // Bound full-resolution scene memory while retaining the area last visited.
  if (scenes.size > 2) {
    const first = scenes.keys().next().value!;
    const old = scenes.get(first)!;
    for (const value of Object.values(old)) if ('c' in value) { value.c.width = 1; value.c.height = 1; }
    scenes.delete(first);
  }
  return s;
}

// ───────────────────────────── per-frame light and motion ─────────────────────────────

const sprites = new Map<string, HTMLCanvasElement>();
/** A soft round light, cached per colour and stamped with drawImage (much cheaper than a gradient per light). */
function shine(g: Ctx, x: number, y: number, radius: number, color: string, alpha: number, squash = 1): void {
  if (alpha <= .004) return;
  let c = sprites.get(color);
  if (!c) {
    c = document.createElement('canvas'); c.width = c.height = 64;
    const q = c.getContext('2d')!, grad = q.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, hexAlpha(color, 1)); grad.addColorStop(.28, hexAlpha(color, .45)); grad.addColorStop(1, hexAlpha(color, 0));
    q.fillStyle = grad; q.fillRect(0, 0, 64, 64); sprites.set(color, c);
  }
  g.globalAlpha = Math.min(1, alpha);
  g.drawImage(c, x - radius, y - radius * squash, radius * 2, radius * 2 * squash);
}
/** Ember-heart rhythm: a strong beat and a softer echo. */
function beat(t: number): number {
  const f = frac(t * .85);
  return Math.exp(-((f - .02) ** 2) / .0025) + .55 * Math.exp(-((f - .22) ** 2) / .003);
}
function strength(l: Light, time: number): number {
  if (l.kind === 'flicker') return .74 + Math.sin(time * 9.1 + l.phase) * .13 + Math.sin(time * 5.3 + l.phase * 2) * .11;
  if (l.kind === 'beat') return .45 + .55 * beat(time + l.phase);
  return .58 + Math.sin(time * 1.3 + l.phase) * .42;
}
function shineAll(g: Ctx, list: Light[], scroll: number, parallax: number, time: number, boost: number): void {
  if (!list.length) return;
  const off = ((scroll * parallax) % TILE + TILE) % TILE;
  for (const l of list) {
    const k = strength(l, time) * boost;
    for (const dx of [-TILE, 0, TILE]) {
      const x = l.x - off + dx;
      if (x < -l.r || x > W + l.r) continue;
      shine(g, x, l.y, l.r, l.color, l.a * k);
      shine(g, x, l.y, l.r * .32, '#fff4dc', l.a * k * .35);
    }
  }
}
/** Smoke curling up from the smouldering stumps and braziers. */
function smoke(g: Ctx, list: Light[], scroll: number, time: number, color: string): void {
  const off = ((scroll * PAR.near) % TILE + TILE) % TILE;
  for (const l of list) {
    if (!l.smoke) continue;
    for (let k = 0; k < 5; k++) {
      const t = frac(time * .11 + k * .2 + l.phase * .13);
      for (const dx of [-TILE, 0, TILE]) {
        const x = l.x - off + dx + Math.sin(t * 5 + l.phase + k) * 3 + t * 9;
        if (x < -20 || x > W + 20) continue;
        ellipse(g, x, l.y - 3 - t * 44, 2.4 + t * 9, 1.6 + t * 5, color, Math.sin(t * Math.PI) * .11);
      }
    }
  }
}
/** Sky movement: smoke clouds, the drowned temple's light shafts, an aurora, the black sun's pull. */
function skyMotion(g: Ctx, id: AreaId, p: Colours, s: Scene, scroll: number, time: number): void {
  if (id === 'ashwood' || id === 'heart') band(g, s.mist, time * 1.6 + scroll * .05, 16, 46, id === 'ashwood' ? .55 : .4);
  if (id === 'rimeholt') {
    band(g, s.mist, time * 2.2 + scroll * .05, 30, 40, .35);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      const color = k ? '#b6a6ff' : '#93e6c8';
      g.beginPath();
      for (let x = -10; x <= W + 10; x += 8) { const y = 22 + k * 13 + Math.sin(x * .018 + time * .17 + k * 2) * 7 + Math.sin(x * .043 - time * .11) * 3; x < 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.strokeStyle = hexAlpha(color, .05 + .02 * Math.sin(time * .4 + k)); g.lineWidth = 11; g.stroke();
      g.strokeStyle = hexAlpha(color, .07); g.lineWidth = 2.5; g.stroke();
    }
    g.restore();
  }
  if (id === 'ruins') {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 5; k++) {
      const x = wrapX(40 + k * 92 - scroll * .15 + Math.sin(time * .19 + k) * 12, W + 120);
      const a = .05 + .035 * Math.sin(time * .5 + k * 1.3);
      const grad = g.createLinearGradient(0, 0, 0, 150); grad.addColorStop(0, hexAlpha(p.light, a)); grad.addColorStop(1, hexAlpha(p.light, 0));
      g.fillStyle = grad; g.beginPath(); g.moveTo(x - 6, -2); g.lineTo(x + 8, -2); g.lineTo(x + 52, 150); g.lineTo(x + 18, 150); g.closePath(); g.fill();
    }
    g.restore();
  }
  if (id === 'hollow') {
    g.save();
    for (let k = 0; k < 2; k++) {
      const t = frac(time * .12 + k * .5);
      g.strokeStyle = hexAlpha(p.accent, (1 - t) * .14); g.lineWidth = .5;
      g.beginPath(); g.ellipse(270, 55, 30 + t * 46, 29 + t * 42, -.3, 0, TAU); g.stroke();
    }
    g.restore();
  }
}
/** Seeded particles whose positions are pure functions of time: no state, nothing to reset. */
function particles(n: number, seed: number, each: (i: number, a: number, b: number, c: number) => void): void {
  const r = rng(seed);
  for (let i = 0; i < n; i++) each(i, r(), r(), r());
}
function motion(g: Ctx, id: AreaId, p: Colours, scroll: number, time: number, front: boolean): void {
  // Front particles keep clear of the band where units and attack telegraphs are read.
  const clear = (y: number): boolean => !front || y < 85 || y > 160;
  const lit = (x: number, y: number, r: number, color: string, a: number): void => {
    g.save(); g.globalCompositeOperation = 'lighter'; shine(g, x, y, r, color, a); g.restore();
  };
  if (id === 'ashwood' || id === 'heart') {
    const hot = id === 'heart';
    particles(front ? 5 : hot ? 28 : 18, front ? 61 : 60, (i, a, b, c) => {
      const t = frac(time * ((hot ? .07 : .05) + a * .05) + b), y = 158 - t * 140;
      const x = wrapX(c * (W + 40) + Math.sin(time * .9 + i * 1.7) * 7 + t * 24 - scroll * (front ? .95 : .6));
      if (!clear(y)) return;
      const alpha = Math.sin(t * Math.PI) * (front ? .9 : .75);
      ellipse(g, x, y, front ? .6 : .38, front ? .6 : .38, i % 3 ? p.glow : p.accent, alpha);
      lit(x, y, front ? 5 : 3.2, p.glow, alpha * .35);
    });
    particles(front ? 4 : 12, front ? 63 : 62, (i, a, b, c) => {
      const t = frac(time * (.025 + a * .02) + b), y = -6 + t * 170;
      const x = wrapX(c * (W + 40) + Math.sin(time * .7 + i * 2.3) * 11 - scroll * (front ? 1 : .4));
      if (!clear(y)) return;
      ellipse(g, x, y, front ? 1 : .55, front ? .45 : .26, mix(p.light, '#888888', .4), Math.sin(t * Math.PI) * .32);
    });
    if (hot && !front) particles(5, 64, (i, a, b) => {
      // Heat shimmer: faint wavering strands rising off the floor.
      const t = frac(time * .09 + a), x = wrapX(b * W - scroll * .8), y = 150 - t * 70;
      line(g, [[x, y], [x + Math.sin(time * 3 + i) * 2, y - 8], [x - Math.sin(time * 2.6 + i) * 2, y - 16]], p.light, .5, Math.sin(t * Math.PI) * .07);
    });
  } else if (id === 'ruins') {
    particles(front ? 4 : 14, front ? 71 : 70, (i, a, b, c) => {
      const t = frac(time * (.05 + a * .05) + b), y = 172 - t * 175;
      const x = wrapX(c * (W + 40) + Math.sin(time * 2.2 + i * 3) * 2.2 - scroll * (front ? 1 : .55));
      if (!clear(y)) return;
      const rad = front ? 1.4 : .45 + a * .7;
      g.save(); g.globalAlpha = Math.sin(t * Math.PI) * .45; g.strokeStyle = p.light; g.lineWidth = .3;
      g.beginPath(); g.arc(x, y, rad, 0, TAU); g.stroke(); g.restore();
    });
    if (!front) {
      particles(10, 72, (i, a, b) => {
        const x = wrapX(a * (W + 40) - scroll * .28 + Math.sin(time * .3 + i) * 6), y = 126 + Math.sin(time * .7 + i) * 2 + b * 6;
        line(g, [[x - 4, y], [x + 5, y]], p.light, .3, .12);
      });
      // Caustics: the surface light ripples across the flagstones.
      g.save(); g.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 16; k++) {
        const x = wrapX(k * 29 - scroll + Math.sin(time * .8 + k * 1.9) * 7), y = 142 + (k * 11) % 34;
        const a = .06 + .05 * Math.sin(time * 1.4 + k * 2.1);
        line(g, [[x - 7, y], [x - 3, y - 1 - Math.sin(time * 1.1 + k)], [x + 2, y + .6], [x + 7, y - .5]], p.accent, .6, Math.max(0, a));
      }
      g.restore();
    }
  } else if (id === 'glimmer') {
    particles(front ? 6 : 22, front ? 81 : 80, (i, a, b, c) => {
      const t = frac(time * (.02 + a * .02) + b), y = 150 - t * 130 + Math.sin(time * .8 + i) * 4;
      const x = wrapX(c * (W + 40) + Math.sin(time * .5 + i * 1.3) * 10 - scroll * (front ? 1 : .45));
      if (!clear(y)) return;
      const alpha = Math.sin(t * Math.PI) * (.35 + .35 * Math.sin(time * 2 + i));
      ellipse(g, x, y, .32, .32, i % 2 ? p.glow : '#ffc4e4', alpha);
      lit(x, y, 2.6, p.glow, alpha * .3);
    });
  } else if (id === 'rimeholt') {
    const wind = .7 + .35 * Math.sin(time * .35) + .2 * Math.sin(time * 1.3);
    const tiers = front ? [[16, .58, .085, 1.05, 91]] : [[30, .2, .03, .3, 92], [20, .34, .05, .6, 93]];
    for (const [n, size, speed, par, seed] of tiers) particles(n, seed, (i, a, b, c) => {
      const t = frac(time * (speed + a * speed * .6) + b), y = -6 + t * 196;
      const x = wrapX(c * (W + 40) - t * 70 * wind * (size * 2.5) + Math.sin(time * 1.1 + i * 2) * 3 - scroll * par);
      if (!clear(y)) return;
      ellipse(g, x, y, size, size, p.light, .55 + a * .4);
    });
    if (!front) particles(6, 94, (i, a, b) => {
      // Gusts drag loose snow across the floor.
      const t = frac(time * (.22 + a * .1) * wind + b), x = W + 30 - t * (W + 80) - scroll * .2, y = 148 + (i * 5) % 26;
      line(g, [[x, y], [x + 10 + a * 8, y - .4]], '#ffffff', .45, Math.sin(t * Math.PI) * .22);
    });
  } else {
    particles(front ? 3 : 20, front ? 101 : 100, (i, a, b, c) => {
      if (front) {
        // Debris drifting just above the floor.
        const x = wrapX(c * (W + 40) - scroll * 1.05 + Math.sin(time * .4 + i) * 4), y = 168 + Math.sin(time * .9 + i * 2) * 2.5;
        g.save(); g.translate(x, y); g.rotate(time * .3 + i);
        g.fillStyle = p.ink; g.beginPath(); g.moveTo(-2.2, 0); g.lineTo(0, -1.6); g.lineTo(2.4, -.2); g.lineTo(.6, 1.6); g.closePath(); g.fill();
        g.restore();
        return;
      }
      // Motes drawn up toward the black sun, spiralling as they go.
      const t = frac(time * (.035 + a * .03) + b), ease = t * t * (3 - 2 * t);
      const sx = c * W, sy = 160, ex = 270, ey = 55;
      const x = sx + (ex - sx) * ease + Math.sin(t * TAU + i) * 18 * (1 - t), y = sy + (ey - sy) * ease + Math.cos(t * TAU + i) * 8 * (1 - t);
      const alpha = Math.sin(t * Math.PI) * .5;
      ellipse(g, x, y, .35, .35, p.accent, alpha);
      lit(x, y, 2.6, p.glow, alpha * .25);
    });
  }
}
/**
 * The lantern the party carries lights the ground around it; the rest of the scenery sinks
 * into the dark as the lantern burns down. Applied to the scenery only (units stay readable).
 */
function lanternLight(g: Ctx, mood: SceneMood, time: number): void {
  const lit = Math.max(0, Math.min(1, mood.lantern)), flare = Math.max(0, Math.min(1, mood.flare));
  const flick = 1 + Math.sin(time * 7.3) * .015 + Math.sin(time * 3.1) * .02;
  const reach = (150 + lit * 120 + flare * 90 + (mood.overdrive ? 30 : 0)) * flick;
  const dark = Math.max(0, .1 + (1 - lit) * .48 - flare * .12);
  const x = mood.lightX, y = 126;
  const shade = g.createRadialGradient(x, y, reach * .2, x, y, reach);
  shade.addColorStop(0, 'rgba(8,7,14,0)'); shade.addColorStop(1, `rgba(8,7,14,${dark})`);
  g.fillStyle = shade; g.fillRect(0, 0, W, H);
  g.save(); g.globalCompositeOperation = 'lighter';
  const warm = (.55 + lit * .45) * flick;
  shine(g, x, 142, 64, '#ff9f55', (.075 + flare * .12) * warm, .5);
  shine(g, x, 128, 34, '#ffd59a', (.04 + flare * .1) * warm);
  g.restore();
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

/**
 * No units or HUD are painted here. Scroll and time are the game's existing world/simulation values;
 * `mood` carries the lantern (camp and previews use a calm, full lantern).
 */
export function drawStoryAreaBackground(g: Ctx, areaId: AreaId, scroll: number, time: number, mood: SceneMood = CALM): void {
  const s = scene(areaId), p = COLOURS[areaId], mist = MIST[areaId];
  g.save(); g.imageSmoothingEnabled = true;
  g.drawImage(s.sky.c, 0, 0, W, H);
  skyMotion(g, areaId, p, s, scroll, time);
  tile(g, s.distant, scroll * PAR.distant);
  tile(g, s.far, scroll * PAR.far);
  band(g, s.mist, scroll * PAR.mist + time * 3.5, 98, 40, mist);
  tile(g, s.middle, scroll * PAR.middle);
  motion(g, areaId, p, scroll, time, false);
  tile(g, s.near, scroll * PAR.near);
  smoke(g, s.lights.near, scroll, time, mix(p.horizon, p.light, .25));
  tile(g, s.floor, scroll * PAR.floor);
  band(g, s.mist, scroll * PAR.ground + time * 6, 128, 26, mist * .55);
  lanternLight(g, mood, time);
  // Light sources glow through the dark (drawn after the lantern's shade).
  g.save(); g.globalCompositeOperation = 'lighter';
  const boost = 1 + (1 - Math.max(0, Math.min(1, mood.lantern))) * .35;
  shineAll(g, s.lights.distant, scroll, PAR.distant, time, boost);
  shineAll(g, s.lights.far, scroll, PAR.far, time, boost);
  shineAll(g, s.lights.middle, scroll, PAR.middle, time, boost);
  shineAll(g, s.lights.near, scroll, PAR.near, time, boost);
  shineAll(g, s.lights.floor, scroll, PAR.floor, time, boost);
  g.restore();
  paper(g); vignette(g, .23); g.restore();
}
export function drawStoryAreaForeground(g: Ctx, areaId: AreaId, scroll: number, time: number): void {
  const s = scene(areaId);
  g.save(); g.imageSmoothingEnabled = true;
  tile(g, s.frontTop, scroll * PAR.front); tile(g, s.frontBottom, scroll * PAR.front);
  motion(g, areaId, COLOURS[areaId], scroll, time, true);
  g.restore();
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
/** At camp the fire, not the lantern, lights the clearing. */
const CAMP_MOOD: SceneMood = { lantern: 1, flare: 0, lightX: 200, overdrive: false };
export function drawStoryCampBackground(g: Ctx, save: SaveData, time: number): void {
  g.save(); drawStoryAreaBackground(g, save.selectedArea ?? 'ashwood', 0, time * .5, CAMP_MOOD);
  g.fillStyle = 'rgba(15,18,33,.27)'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 32; i++) ellipse(g, (i * 79.41) % W, 7 + i * 29.73 % 55, .18, .18, '#eee1c8', .16 + Math.sin(time * .6 + i) ** 2 * .25);
  camp ??= campLayer(); g.drawImage(camp, 0, 0, W, H);
  lantern(g, 111, 125, time); fire(g, 200, 149, time); vignette(g, .35); g.restore();
}
function titleLayer(): HTMLCanvasElement {
  return canvas(W, H, g => {
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
  motion(g, 'ashwood', COLOURS.ashwood, 0, time, true); g.restore();
}
