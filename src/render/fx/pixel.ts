// Crisp pixel-space drawing helpers for the low-res world canvas (400 x 180) plus small
// caches derived from sprite canvases (silhouettes, opaque bounds, pixel lists, glows, vignettes).
import { clamp01 } from './util.ts';
import { canvasDensity, canvasWidth, canvasHeight, registerDensity } from '../storybook/surface.ts';

type Ctx = CanvasRenderingContext2D;

function mk(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
}

// ───────────────────────────── primitives ─────────────────────────────

/** Bresenham line, 1 world pixel thick (thickness > 1 draws squares). */
export function pxLine(g: Ctx, x0: number, y0: number, x1: number, y1: number, t = 1): void {
  g.save(); g.strokeStyle = g.fillStyle; g.lineWidth = Math.max(.35, t * .72); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x0, y0);
  const bend = Math.sin(x0 * .17 + y0 * .13 + x1 * .09) * .23;
  g.quadraticCurveTo((x0+x1)/2 + bend, (y0+y1)/2 - bend, x1, y1); g.stroke(); g.restore();
}

export function pxDashed(g: Ctx, x0: number, y0: number, x1: number, y1: number, dash: number, gap: number, phase: number): void {
  g.save(); g.strokeStyle = g.fillStyle; g.lineWidth = .65; g.lineCap = 'round';
  g.setLineDash([dash,gap]); g.lineDashOffset = -phase;
  g.beginPath(); g.moveTo(x0,y0); g.lineTo(x1,y1); g.stroke(); g.restore();
}

export function pxRing(g: Ctx, cx: number, cy: number, rx: number, ry: number, t = 1): void {
  if (rx <= 0 || ry <= 0) return;
  g.save(); g.strokeStyle = g.fillStyle; g.lineWidth = Math.max(.35,t*.7);
  g.beginPath();
  for (let i=0; i<=64; i++) {
    const a=i*Math.PI/32, ink=1 + .008*Math.sin(a*7 + cx*.1);
    const x=cx+Math.cos(a)*rx*ink, y=cy+Math.sin(a)*ry*ink;
    if (!i) g.moveTo(x,y); else g.lineTo(x,y);
  }
  g.closePath(); g.stroke(); g.restore();
}

export function pxArc(g: Ctx, cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, t = 1): void {
  if (rx <= 0 || ry <= 0) return;
  g.save(); g.strokeStyle = g.fillStyle; g.lineWidth = Math.max(.35,t*.78); g.lineCap='round';
  g.beginPath(); g.ellipse(cx,cy,rx,ry,0,a0,a1,a1<a0); g.stroke(); g.restore();
}

export function pxEllipse(g: Ctx, cx: number, cy: number, rx: number, ry: number): void {
  if (rx <= 0 || ry <= 0) return;
  g.beginPath(); g.ellipse(cx,cy,rx,ry,0,0,Math.PI*2); g.fill();
}

export function pxStar(g: Ctx, x: number, y: number, size: number): void {
  const r=Math.max(1,size+.5);
  g.beginPath();
  for (let i=0;i<8;i++) { const a=i*Math.PI/4, q=i%2?r*.23:r; const xx=x+Math.cos(a)*q, yy=y+Math.sin(a)*q; if(!i)g.moveTo(xx,yy);else g.lineTo(xx,yy); }
  g.closePath(); g.fill();
}

export function pxHex(g: Ctx, cx: number, cy: number, rx: number, ry: number, rot: number): void {
  let px = 0;
  let py = 0;
  for (let i = 0; i <= 6; i++) {
    const a = rot + (i / 6) * Math.PI * 2;
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    if (i > 0) pxLine(g, px, py, x, y);
    px = x;
    py = y;
  }
}

/** Jagged lightning polyline between two points. `seed` changes the jitter pattern. */
export function pxLightning(g: Ctx, x0: number, y0: number, x1: number, y1: number, seed: number, amp: number, t = 1): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const segs = Math.max(3, Math.min(14, Math.round(len / 9)));
  const nx = len > 0 ? -dy / len : 0;
  const ny = len > 0 ? dx / len : 0;
  let px = x0;
  let py = y0;
  let s = seed | 0;
  for (let i = 1; i <= segs; i++) {
    const f = i / segs;
    s = (Math.imul(s ^ 0x5bd1e995, 0x27d4eb2d) + i) | 0;
    const j = i === segs ? 0 : (((s >>> 8) & 0xff) / 255 - 0.5) * 2 * amp;
    const x = x0 + dx * f + nx * j;
    const y = y0 + dy * f + ny * j;
    pxLine(g, px, py, x, y, t);
    px = x;
    py = y;
  }
}

// ───────────────────────────── caches ─────────────────────────────

const silCache = new WeakMap<HTMLCanvasElement, Map<string, HTMLCanvasElement>>();

/** Solid-colour silhouette of a sprite canvas (tints, ghosts, shadows). */
export function silhouette(src: HTMLCanvasElement, color: string): HTMLCanvasElement {
  let m = silCache.get(src);
  if (!m) {
    m = new Map();
    silCache.set(src, m);
  }
  let c = m.get(color);
  if (!c) {
    c = mk(src.width, src.height);
    const g = c.getContext('2d')!;
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    registerDensity(c, canvasDensity(src));
    m.set(color, c);
  }
  return c;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const boundsCache = new WeakMap<HTMLCanvasElement, Bounds>();

/** Opaque pixel bounds of a sprite canvas (in canvas pixels). */
export function spriteBounds(src: HTMLCanvasElement): Bounds {
  let b = boundsCache.get(src);
  if (b) return b;
  b = { left: 0, top: 0, right: src.width, bottom: src.height };
  try {
    const d = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
    let l = src.width;
    let t = src.height;
    let r = -1;
    let bo = -1;
    for (let y = 0; y < src.height; y++) {
      for (let x = 0; x < src.width; x++) {
        if (d[(y * src.width + x) * 4 + 3] > 40) {
          if (x < l) l = x;
          if (x > r) r = x;
          if (y < t) t = y;
          if (y > bo) bo = y;
        }
      }
    }
    if (r >= 0) b = { left: l, top: t, right: r + 1, bottom: bo + 1 };
  } catch {
    // tainted / unavailable: fall back to the full canvas
  }
  const density = canvasDensity(src);
  b = { left: b.left / density, top: b.top / density, right: b.right / density, bottom: b.bottom / density };
  boundsCache.set(src, b);
  return b;
}

export interface PixelList {
  n: number;
  xs: Float32Array;
  ys: Float32Array;
  cols: string[];
}

const pixCache = new WeakMap<HTMLCanvasElement, PixelList>();

/** All opaque pixels of a sprite (row-major, top → bottom) with their colours. */
export function spritePixels(src: HTMLCanvasElement): PixelList {
  let p = pixCache.get(src);
  if (p) return p;
  const xs: number[] = [];
  const ys: number[] = [];
  const cols: string[] = [];
  const colorIds = new Map<number, string>();
  try {
    const d = src.getContext('2d')!.getImageData(0, 0, src.width, src.height).data;
    const density = canvasDensity(src);
    const step = Math.max(1, Math.round(density));
    for (let y = 0; y < src.height; y += step) {
      for (let x = 0; x < src.width; x += step) {
        const i = (y * src.width + x) * 4;
        if (d[i + 3] < 100) continue;
        const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
        let s = colorIds.get(key);
        if (!s) {
          s = `rgb(${d[i]},${d[i + 1]},${d[i + 2]})`;
          colorIds.set(key, s);
        }
        xs.push(x / density);
        ys.push(y / density);
        cols.push(s);
      }
    }
  } catch {
    // ignore
  }
  p = { n: xs.length, xs: Float32Array.from(xs), ys: Float32Array.from(ys), cols };
  pixCache.set(src, p);
  return p;
}

const glowCache = new Map<string, (HTMLCanvasElement | undefined)[]>();

/**
 * Banded radial glow sprite (pixel-art friendly). Size = 2r+1. Draw with 'lighter' for light.
 * Radius is quantised so the cache stays small. Lookup is allocation-free.
 */
export function glowSprite(color: string, radius: number): HTMLCanvasElement {
  const r = Math.max(1, Math.min(48, Math.round(radius)));
  let arr = glowCache.get(color);
  if (!arr) {
    arr = [];
    glowCache.set(color, arr);
  }
  let c = arr[r];
  if (c) return c;
  const size = r * 2 + 1;
  c = mk(size, size);
  const g = c.getContext('2d')!;
  const wash = g.createRadialGradient(r+.5,r+.5,0,r+.5,r+.5,r);
  wash.addColorStop(0,color); wash.addColorStop(.28,color); wash.addColorStop(1,'transparent');
  g.globalAlpha=.5; g.fillStyle=wash; g.fillRect(0,0,size,size);
  arr[r] = c;
  return c;
}

const vigCache = new Map<string, HTMLCanvasElement>();

/** Full-world (400x180) edge vignette in `color`; draw with globalAlpha for intensity. */
export function vignette(color: string, w: number, h: number): HTMLCanvasElement {
  const key = `${color}|${w}|${h}`;
  let c = vigCache.get(key);
  if (c) return c;
  c = mk(w, h);
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.62);
  grd.addColorStop(0, 'rgba(0,0,0,0)');
  grd.addColorStop(1, color);
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  // edge band for a firmer frame
  g.globalAlpha = 0.6;
  g.fillStyle = color;
  g.fillRect(0, 0, w, 2);
  g.fillRect(0, h - 2, w, 2);
  g.fillRect(0, 0, 2, h);
  g.fillRect(w - 2, 0, 2, h);
  vigCache.set(key, c);
  return c;
}

/** Tiny pixel pattern painter: rows of chars, '.' = empty, other chars mapped via `colors`. */
export function pxPattern(g: Ctx, x: number, y: number, rows: readonly string[], colors: Record<string, string>, alpha = 1): void {
  const a0 = g.globalAlpha;
  g.globalAlpha = a0 * clamp01(alpha);
  x = Math.round(x);
  y = Math.round(y);
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const ch = row[i];
      if (ch === '.') continue;
      const col = colors[ch];
      if (!col) continue;
      g.fillStyle = col;
      g.fillRect(x + i, y + j, 1, 1);
    }
  }
  g.globalAlpha = a0;
}

/** Pre-rendered pixel pattern (for frequently drawn tiny icons). */
const patCache = new Map<string, HTMLCanvasElement>();
export function patternCanvas(id: string, rows: readonly string[], colors: Record<string, string>): HTMLCanvasElement {
  let c = patCache.get(id);
  if (c) return c;
  let w = 0;
  for (const r of rows) w = Math.max(w, r.length);
  c = mk(w, rows.length);
  pxPattern(c.getContext('2d')!, 0, 0, rows, colors);
  patCache.set(id, c);
  return c;
}
