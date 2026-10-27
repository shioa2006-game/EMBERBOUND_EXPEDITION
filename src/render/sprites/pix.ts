// DOM-free pixel buffers + operations used to bake the procedural pixel art.
// Everything here runs in Node too (scripts/sprite-preview.ts writes PNG contact sheets from it).

export interface Pix {
  w: number;
  h: number;
  /** RGBA bytes, row-major. */
  d: Uint8ClampedArray;
}

export type Palette = Record<string, string | null | undefined>;

export function makePix(w: number, h: number): Pix {
  return { w, h, d: new Uint8ClampedArray(Math.max(0, w * h * 4)) };
}

export function clonePix(p: Pix): Pix {
  return { w: p.w, h: p.h, d: new Uint8ClampedArray(p.d) };
}

// ---------------------------------------------------------------------------
// Colours
// ---------------------------------------------------------------------------

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

const colorCache = new Map<string, RGBA>();

/** Parse '#rgb', '#rrggbb' or '#rrggbbaa'. */
export function parseColor(hex: string): RGBA {
  let c = colorCache.get(hex);
  if (c) return c;
  let s = hex.startsWith('#') ? hex.slice(1) : hex;
  if (s.length === 3 || s.length === 4) s = s.split('').map((ch) => ch + ch).join('');
  const n = parseInt(s.slice(0, 6), 16);
  const a = s.length >= 8 ? parseInt(s.slice(6, 8), 16) : 255;
  c = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a };
  colorCache.set(hex, c);
  return c;
}

function hx(v: number): string {
  const n = Math.max(0, Math.min(255, Math.round(v)));
  return n.toString(16).padStart(2, '0');
}

export function toHex(c: RGBA): string {
  return `#${hx(c.r)}${hx(c.g)}${hx(c.b)}${c.a < 255 ? hx(c.a) : ''}`;
}

/** Linear mix of two colours (t = 0 → a, 1 → b). */
export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  return toHex({
    r: ca.r + (cb.r - ca.r) * t,
    g: ca.g + (cb.g - ca.g) * t,
    b: ca.b + (cb.b - ca.b) * t,
    a: ca.a + (cb.a - ca.a) * t,
  });
}

/** Multiply brightness (f < 1 darker, f > 1 lighter towards white). */
export function shade(hex: string, f: number): string {
  if (f >= 1) return mix(hex, '#ffffff', Math.min(1, f - 1));
  const c = parseColor(hex);
  return toHex({ r: c.r * f, g: c.g * f, b: c.b * f, a: c.a });
}

export function withAlpha(hex: string, a: number): string {
  const c = parseColor(hex);
  return toHex({ r: c.r, g: c.g, b: c.b, a: a * 255 });
}

// ---------------------------------------------------------------------------
// Pixel access
// ---------------------------------------------------------------------------

export function getA(p: Pix, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return 0;
  return p.d[(y * p.w + x) * 4 + 3];
}

export function setPx(p: Pix, x: number, y: number, c: RGBA): void {
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return;
  const i = (y * p.w + x) * 4;
  p.d[i] = c.r;
  p.d[i + 1] = c.g;
  p.d[i + 2] = c.b;
  p.d[i + 3] = c.a;
}

/** Source-over blend of one colour into a pixel (alpha 0..1 multiplies the colour's alpha). */
export function blendPx(p: Pix, x: number, y: number, c: RGBA, alpha = 1): void {
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return;
  const a = (c.a / 255) * alpha;
  if (a <= 0) return;
  const i = (y * p.w + x) * 4;
  const d = p.d;
  const da = d[i + 3] / 255;
  const oa = a + da * (1 - a);
  if (oa <= 0) return;
  d[i] = (c.r * a + d[i] * da * (1 - a)) / oa;
  d[i + 1] = (c.g * a + d[i + 1] * da * (1 - a)) / oa;
  d[i + 2] = (c.b * a + d[i + 2] * da * (1 - a)) / oa;
  d[i + 3] = oa * 255;
}

/** Additive blend (light). */
export function addPx(p: Pix, x: number, y: number, c: RGBA, alpha = 1): void {
  if (x < 0 || y < 0 || x >= p.w || y >= p.h) return;
  const a = (c.a / 255) * alpha;
  if (a <= 0) return;
  const i = (y * p.w + x) * 4;
  const d = p.d;
  d[i] = d[i] + c.r * a;
  d[i + 1] = d[i + 1] + c.g * a;
  d[i + 2] = d[i + 2] + c.b * a;
  d[i + 3] = Math.max(d[i + 3], a * 255);
}

// ---------------------------------------------------------------------------
// ASCII maps
// ---------------------------------------------------------------------------

/** Normalise a set of ASCII rows: strip common indentation is NOT done — rows are used verbatim. */
export function mapSize(rows: readonly string[]): { w: number; h: number } {
  let w = 0;
  for (const r of rows) w = Math.max(w, r.length);
  return { w, h: rows.length };
}

/**
 * Paint ASCII rows into `dst` at (ox, oy). '.' and ' ' are transparent; chars missing from the palette or
 * mapped to null are transparent too. Chars listed in `only` restrict painting to those chars; chars in
 * `skip` are not painted.
 */
export function paintMap(dst: Pix, rows: readonly string[], pal: Palette, ox = 0, oy = 0, skip?: string, only?: string): void {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      if (skip && skip.includes(ch)) continue;
      if (only && !only.includes(ch)) continue;
      const col = pal[ch];
      if (!col) continue;
      setPx(dst, ox + x, oy + y, parseColor(col));
    }
  }
}

export function mapToPix(rows: readonly string[], pal: Palette, w?: number, h?: number): Pix {
  const sz = mapSize(rows);
  const p = makePix(w ?? sz.w, h ?? sz.h);
  paintMap(p, rows, pal, 0, (h ?? sz.h) - sz.h);
  return p;
}

// ---------------------------------------------------------------------------
// Compositing / transforms
// ---------------------------------------------------------------------------

/** Copy opaque pixels of src into dst at (dx, dy) (alpha-blended). */
export function blit(dst: Pix, src: Pix, dx: number, dy: number, alpha = 1): void {
  dx = Math.round(dx);
  dy = Math.round(dy);
  for (let y = 0; y < src.h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.w) continue;
      const i = (y * src.w + x) * 4;
      const a = src.d[i + 3];
      if (a === 0) continue;
      const c = { r: src.d[i], g: src.d[i + 1], b: src.d[i + 2], a };
      if (a === 255 && alpha >= 1) setPx(dst, tx, ty, c);
      else blendPx(dst, tx, ty, c, alpha);
    }
  }
}

export function blitAdd(dst: Pix, src: Pix, dx: number, dy: number, alpha = 1): void {
  dx = Math.round(dx);
  dy = Math.round(dy);
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      const a = src.d[i + 3];
      if (a === 0) continue;
      addPx(dst, dx + x, dy + y, { r: src.d[i], g: src.d[i + 1], b: src.d[i + 2], a }, alpha);
    }
  }
}

/** Expand the canvas by `l,t,r,b` transparent pixels. */
export function pad(p: Pix, l: number, t: number, r: number, b: number): Pix {
  const o = makePix(p.w + l + r, p.h + t + b);
  blit(o, p, l, t);
  return o;
}

/** Add a 1px outline around opaque pixels (4-neighbourhood). Canvas grows by 1 on each side. */
export function outline(p: Pix, color: string): Pix {
  const o = pad(p, 1, 1, 1, 1);
  const c = parseColor(color);
  const src = clonePix(o);
  for (let y = 0; y < o.h; y++) {
    for (let x = 0; x < o.w; x++) {
      if (getA(src, x, y) > 0) continue;
      if (getA(src, x - 1, y) > 40 || getA(src, x + 1, y) > 40 || getA(src, x, y - 1) > 40 || getA(src, x, y + 1) > 40) setPx(o, x, y, c);
    }
  }
  return o;
}

export function flipH(p: Pix): Pix {
  const o = makePix(p.w, p.h);
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const si = (y * p.w + x) * 4;
      const di = (y * p.w + (p.w - 1 - x)) * 4;
      o.d[di] = p.d[si];
      o.d[di + 1] = p.d[si + 1];
      o.d[di + 2] = p.d[si + 2];
      o.d[di + 3] = p.d[si + 3];
    }
  }
  return o;
}

/** Rotate 90° clockwise (cw = true) or counter-clockwise. */
export function rot90(p: Pix, cw: boolean): Pix {
  const o = makePix(p.h, p.w);
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const si = (y * p.w + x) * 4;
      const nx = cw ? p.h - 1 - y : y;
      const ny = cw ? x : p.w - 1 - x;
      const di = (ny * o.w + nx) * 4;
      o.d[di] = p.d[si];
      o.d[di + 1] = p.d[si + 1];
      o.d[di + 2] = p.d[si + 2];
      o.d[di + 3] = p.d[si + 3];
    }
  }
  return o;
}

/** Per-row horizontal offsets (shear / lean). `fn(y)` returns the integer shift for row y. */
export function shiftRows(p: Pix, fn: (y: number) => number): Pix {
  const o = makePix(p.w, p.h);
  for (let y = 0; y < p.h; y++) {
    const s = Math.round(fn(y));
    for (let x = 0; x < p.w; x++) {
      const nx = x + s;
      if (nx < 0 || nx >= p.w) continue;
      const si = (y * p.w + x) * 4;
      const di = (y * p.w + nx) * 4;
      o.d[di] = p.d[si];
      o.d[di + 1] = p.d[si + 1];
      o.d[di + 2] = p.d[si + 2];
      o.d[di + 3] = p.d[si + 3];
    }
  }
  return o;
}

/** Shift whole image by (dx, dy) within the same canvas. */
export function shift(p: Pix, dx: number, dy: number): Pix {
  const o = makePix(p.w, p.h);
  blit(o, p, dx, dy);
  return o;
}

/** "Breathing": rows above `row` move down by `n` pixels (the rows just above `row` are squashed away). */
export function breathe(p: Pix, row: number, n = 1): Pix {
  const o = makePix(p.w, p.h);
  for (let y = 0; y < p.h; y++) {
    const sy = y < row ? y - n : y;
    if (sy < 0) continue;
    for (let x = 0; x < p.w; x++) {
      const si = (sy * p.w + x) * 4;
      const di = (y * p.w + x) * 4;
      o.d[di] = p.d[si];
      o.d[di + 1] = p.d[si + 1];
      o.d[di + 2] = p.d[si + 2];
      o.d[di + 3] = p.d[si + 3];
    }
  }
  return o;
}

/** Map every opaque pixel's colour through fn. */
export function recolor(p: Pix, fn: (c: RGBA, x: number, y: number) => RGBA): Pix {
  const o = clonePix(p);
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      const i = (y * p.w + x) * 4;
      if (p.d[i + 3] === 0) continue;
      const c = fn({ r: p.d[i], g: p.d[i + 1], b: p.d[i + 2], a: p.d[i + 3] }, x, y);
      o.d[i] = c.r;
      o.d[i + 1] = c.g;
      o.d[i + 2] = c.b;
      o.d[i + 3] = c.a;
    }
  }
  return o;
}

/** Desaturate + darken (used for dead poses). */
export function dim(p: Pix, sat: number, bright: number, tint = '#3a2a44'): Pix {
  const t = parseColor(tint);
  return recolor(p, (c) => {
    const l = c.r * 0.3 + c.g * 0.55 + c.b * 0.15;
    const r = (l + (c.r - l) * sat) * bright;
    const g = (l + (c.g - l) * sat) * bright;
    const b = (l + (c.b - l) * sat) * bright;
    return { r: r * 0.8 + t.r * 0.2, g: g * 0.8 + t.g * 0.2, b: b * 0.8 + t.b * 0.2, a: c.a };
  });
}

/** Fill every opaque pixel with a solid colour (silhouettes / hit flash). */
export function silhouette(p: Pix, color: string): Pix {
  const c = parseColor(color);
  return recolor(p, (s) => ({ r: c.r, g: c.g, b: c.b, a: Math.round((s.a * c.a) / 255) }));
}

/** Rim light: opaque pixels whose neighbour at (dx, dy) is transparent take `color`. */
export function rimLight(p: Pix, color: string, dx: number, dy: number): Pix {
  const c = parseColor(color);
  const o = clonePix(p);
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (getA(p, x, y) === 0) continue;
      if (getA(p, x + dx, y + dy) === 0) setPx(o, x, y, c);
    }
  }
  return o;
}

/** Crop a rectangle (out-of-range areas are transparent). */
export function crop(p: Pix, x: number, y: number, w: number, h: number): Pix {
  const o = makePix(w, h);
  blit(o, p, -x, -y);
  return o;
}

/** Nearest-neighbour integer upscale. */
export function scaleInt(p: Pix, k: number): Pix {
  const o = makePix(p.w * k, p.h * k);
  for (let y = 0; y < o.h; y++) {
    for (let x = 0; x < o.w; x++) {
      const si = (((y / k) | 0) * p.w + ((x / k) | 0)) * 4;
      const di = (y * o.w + x) * 4;
      o.d[di] = p.d[si];
      o.d[di + 1] = p.d[si + 1];
      o.d[di + 2] = p.d[si + 2];
      o.d[di + 3] = p.d[si + 3];
    }
  }
  return o;
}

function same(p: Pix, x1: number, y1: number, x2: number, y2: number): boolean {
  const inside1 = x1 >= 0 && y1 >= 0 && x1 < p.w && y1 < p.h;
  const inside2 = x2 >= 0 && y2 >= 0 && x2 < p.w && y2 < p.h;
  if (!inside1 || !inside2) return !inside1 && !inside2;
  const i = (y1 * p.w + x1) * 4;
  const j = (y2 * p.w + x2) * 4;
  if (p.d[i + 3] === 0 && p.d[j + 3] === 0) return true;
  return p.d[i] === p.d[j] && p.d[i + 1] === p.d[j + 1] && p.d[i + 2] === p.d[j + 2] && p.d[i + 3] === p.d[j + 3];
}

/** Scale3x (AdvMAME3x) — edge-aware 3x upscale for pixel art. */
export function scale3x(p: Pix): Pix {
  const o = makePix(p.w * 3, p.h * 3);
  const cp = (dx: number, dy: number, sx: number, sy: number): void => {
    if (sx < 0 || sy < 0 || sx >= p.w || sy >= p.h) return;
    const si = (sy * p.w + sx) * 4;
    const di = (dy * o.w + dx) * 4;
    o.d[di] = p.d[si];
    o.d[di + 1] = p.d[si + 1];
    o.d[di + 2] = p.d[si + 2];
    o.d[di + 3] = p.d[si + 3];
  };
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      // A B C / D E F / G H I
      const pt = (dx: number, dy: number): [number, number] => [x + dx, y + dy];
      const A = pt(-1, -1), B = pt(0, -1), C = pt(1, -1), D = pt(-1, 0), E = pt(0, 0), F = pt(1, 0), G = pt(-1, 1), H = pt(0, 1), I = pt(1, 1);
      const eq = (a: [number, number], b: [number, number]): boolean => same(p, a[0], a[1], b[0], b[1]);
      const out: [number, number][] = [E, E, E, E, E, E, E, E, E];
      if (!eq(B, H) && !eq(D, F)) {
        out[0] = eq(D, B) ? D : E;
        out[1] = (eq(D, B) && !eq(E, C)) || (eq(B, F) && !eq(E, A)) ? B : E;
        out[2] = eq(B, F) ? F : E;
        out[3] = (eq(D, B) && !eq(E, G)) || (eq(D, H) && !eq(E, A)) ? D : E;
        out[4] = E;
        out[5] = (eq(B, F) && !eq(E, I)) || (eq(H, F) && !eq(E, C)) ? F : E;
        out[6] = eq(D, H) ? D : E;
        out[7] = (eq(D, H) && !eq(E, I)) || (eq(H, F) && !eq(E, G)) ? H : E;
        out[8] = eq(H, F) ? F : E;
      }
      for (let k = 0; k < 9; k++) cp(x * 3 + (k % 3), y * 3 + ((k / 3) | 0), out[k][0], out[k][1]);
    }
  }
  return o;
}

/** 1.5x upscale: Scale3x then pick every second pixel. Keeps diagonals smooth-ish. */
export function scale1_5(p: Pix): Pix {
  const s = scale3x(p);
  const o = makePix(Math.floor(s.w / 2), Math.floor(s.h / 2));
  for (let y = 0; y < o.h; y++) {
    for (let x = 0; x < o.w; x++) {
      const si = ((y * 2 + 1) * s.w + (x * 2 + 1)) * 4;
      const di = (y * o.w + x) * 4;
      o.d[di] = s.d[si];
      o.d[di + 1] = s.d[si + 1];
      o.d[di + 2] = s.d[si + 2];
      o.d[di + 3] = s.d[si + 3];
    }
  }
  return o;
}

/** Bounding box of opaque pixels. */
export function bbox(p: Pix): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = p.w, y0 = p.h, x1 = -1, y1 = -1;
  for (let y = 0; y < p.h; y++) {
    for (let x = 0; x < p.w; x++) {
      if (p.d[(y * p.w + x) * 4 + 3] === 0) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1 };
}

// ---------------------------------------------------------------------------
// Deterministic noise helpers (for procedural textures)
// ---------------------------------------------------------------------------

export function hash2(x: number, y: number, seed = 0): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hash1(x: number, seed = 0): number {
  return hash2(x, 0x5bd1, seed);
}

/** 4x4 Bayer matrix threshold in [0,1). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
export function bayer(x: number, y: number): number {
  return (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16;
}

/** Smooth periodic value noise along x (period p) — for tileable silhouettes. */
export function pnoise(x: number, period: number, cells: number, seed: number): number {
  const f = (((x % period) + period) % period) / period * cells;
  const i = Math.floor(f);
  const t = f - i;
  const a = hash1(i % cells, seed);
  const b = hash1((i + 1) % cells, seed);
  const s = t * t * (3 - 2 * t);
  return a + (b - a) * s;
}
