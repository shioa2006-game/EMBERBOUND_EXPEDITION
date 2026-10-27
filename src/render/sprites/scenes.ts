// DOM-free scene painters: area backdrops (parallax), foreground ambience, camp and title scenes.
// Static layers are baked once into Pix buffers (SoftGfx); per-frame work is a handful of image blits plus
// a few dozen particle rects, drawn through the Gfx interface (canvas in the game, SoftGfx in the preview).
import type { AreaId, SaveData } from '../../core/types.ts';
import { HERO_ORDER } from '../../core/types.ts';
import { gearTier } from '../../core/balance.ts';
import { AREAS } from '../../data/areas.ts';
import { disc, drawTiled, glow, SoftGfx, type Gfx } from './gfx.ts';
import {
  bayer, crop, flipH, hash1, makePix, mix, parseColor, rimLight, scale1_5, setPx, shade, silhouette, type Pix,
} from './pix.ts';
import { unitFrame, type UnitFrame } from './units.ts';

const W = 400;
const H = 180;
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Baking helpers (operate on SoftGfx / Pix directly)
// ---------------------------------------------------------------------------

function bake(w: number, h: number, fn: (g: SoftGfx) => void): Pix {
  const g = new SoftGfx(w, h);
  fn(g);
  return g.pix;
}

/** Vertical gradient through colour stops with 4x4 ordered dithering between neighbouring stops. */
function vgrad(g: SoftGfx, y0: number, y1: number, stops: readonly string[], x0 = 0, x1 = g.w): void {
  const n = stops.length - 1;
  const cols = stops.map(parseColor);
  for (let y = y0; y < y1; y++) {
    const t = ((y - y0) / Math.max(1, y1 - y0 - 1)) * n;
    const i = Math.min(n - 1, Math.floor(t));
    const f = t - i;
    for (let x = x0; x < x1; x++) setPx(g.pix, x, y, f > bayer(x, y) ? cols[i + 1] : cols[i]);
  }
}

/** Fill everything below the curve y = top(x) (for x in the layer) with a colour; optional 1px rim on the edge. */
function ridge(g: SoftGfx, top: (x: number) => number, color: string, rim?: string, y1 = H): void {
  for (let x = 0; x < g.w; x++) {
    const y = Math.round(top(x));
    if (y >= y1) continue;
    g.rect(x, y, 1, y1 - y, color);
    if (rim) g.rect(x, y, 1, 1, rim);
  }
}

/** Periodic sum of sines (period = layer width) for seamless silhouettes. */
function waves(x: number, terms: readonly (readonly [number, number, number])[]): number {
  let v = 0;
  for (const [k, amp, ph] of terms) v += Math.sin((x / W) * TAU * k + ph) * amp;
  return v;
}

function gline(g: Gfx, x0: number, y0: number, x1: number, y1: number, color: string, alpha = 1): void {
  x0 = Math.round(x0);
  y0 = Math.round(y0);
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < 2000; guard++) {
    g.rect(x0, y0, 1, 1, color, alpha);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x0 += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y0 += sy;
    }
  }
}

/** Run a painter at x and its wrapped copies so a W-wide layer tiles seamlessly. */
function wrap(x: number, fn: (xx: number) => void): void {
  for (const dx of [-W, 0, W]) {
    const xx = x + dx;
    if (xx > -80 && xx < W + 80) fn(xx);
  }
}

function polyFill(g: Gfx, pts: readonly (readonly [number, number])[], color: string, alpha = 1): void {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of pts) {
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  for (let y = Math.floor(y0); y <= Math.ceil(y1); y++) {
    const yc = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) / (by - ay)) * (bx - ax));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = Math.round(xs[k]);
      const b = Math.round(xs[k + 1]);
      if (b > a) g.rect(a, y, b - a, 1, color, alpha);
    }
  }
}

/** Crystal shard (light left face, dark right face, bright edge). */
function shard(g: Gfx, x: number, base: number, w: number, h: number, light: string, dark: string, edge: string, lean = 0): void {
  const tipX = x + w / 2 + lean;
  polyFill(g, [[x, base], [tipX, base - h], [tipX, base]], light);
  polyFill(g, [[tipX, base - h], [x + w, base], [tipX, base]], dark);
  gline(g, tipX, base - h + 1, tipX, base - 1, edge);
}

// ---------------------------------------------------------------------------
// Area layers
// ---------------------------------------------------------------------------

interface AreaLayers {
  sky: Pix;
  far: Pix;
  mid: Pix;
  ground: Pix;
  /** Points used by ambient animation (crystal glints, windows, lava falls...). */
  spots: { x: number; y: number; layer: 'far' | 'mid' }[];
}

const GROUND_TOP = 140;
const layerCache = new Map<AreaId, AreaLayers>();

function areaLayers(id: AreaId): AreaLayers {
  let L = layerCache.get(id);
  if (!L) {
    L = BAKERS[id]();
    layerCache.set(id, L);
  }
  return L;
}

/** Shared ground band: top edge + dithered depth gradient + speckles. */
function groundBase(g: SoftGfx, top: string, mid: string, low: string, speck: string, edge: (x: number) => number, seed: number): void {
  for (let x = 0; x < W; x++) {
    const y0 = Math.round(edge(x));
    for (let y = y0; y < H; y++) {
      const t = (y - GROUND_TOP) / (H - GROUND_TOP);
      const c = t < 0.35 ? (t / 0.35 > bayer(x, y) ? mid : top) : (t - 0.35) / 0.65 > bayer(x, y) + 0.15 ? low : mid;
      g.rect(x, y, 1, 1, c);
    }
  }
  for (let i = 0; i < 260; i++) {
    const x = Math.floor(hash1(i, seed) * W);
    const y = GROUND_TOP + 4 + Math.floor(hash1(i, seed + 1) ** 0.8 * (H - GROUND_TOP - 4));
    const len = 1 + Math.floor(hash1(i, seed + 2) * 3);
    g.rect(x, y, len, 1, speck, 0.5 + hash1(i, seed + 3) * 0.4);
  }
}

// ── Ashwood Hollow ──────────────────────────────────────────────────────────

function bakeAshwood(): AreaLayers {
  const p = AREAS.ashwood.palette;
  const spots: AreaLayers['spots'] = [];
  const sky = bake(W, H, (g) => {
    vgrad(g, 0, 128, ['#120a12', shade(p.sky, 0.8), p.sky, mix(p.sky, '#6a2a22', 0.6), mix(p.sky, p.accent, 0.35)]);
    vgrad(g, 128, H, [mix(p.sky, p.accent, 0.35), '#5a2a1e']);
    // blood moon behind haze
    disc(g, 300, 42, 17, '#c8643a');
    disc(g, 297, 39, 15, '#e08048');
    disc(g, 304, 46, 6, '#b8583a', 0.6);
    disc(g, 292, 36, 3, '#f0a060', 0.7);
    // smoke banks
    for (let i = 0; i < 9; i++) {
      const cx = hash1(i, 11) * W;
      const cy = 30 + hash1(i, 12) * 70;
      for (let k = 0; k < 5; k++) disc(g, cx + k * 9 - 18, cy + Math.sin(k) * 2, 6 + hash1(i * 7 + k, 13) * 5, '#1e1218', 0.35);
    }
  });
  const far = bake(W, H, (g) => {
    const top = (x: number): number => 104 + waves(x, [[3, 5, 1], [7, 3, 2], [13, 1.5, 0.3]]);
    ridge(g, top, p.far);
    // dead tree spikes
    for (let i = 0; i < 46; i++) {
      const x = Math.floor(hash1(i, 21) * W);
      const h = 14 + hash1(i, 22) * 26;
      wrap(x, (xx) => {
        const base = top(x) + 2;
        g.rect(xx, base - h, 1, h, p.far);
        if (hash1(i, 23) > 0.4) g.rect(xx + 1, base - h * 0.6, 1, h * 0.6, p.far);
        gline(g, xx, base - h * 0.55, xx - 4, base - h * 0.75, p.far);
        gline(g, xx + 1, base - h * 0.35, xx + 5, base - h * 0.55, p.far);
      });
    }
    // distant fires
    for (let i = 0; i < 7; i++) {
      const x = hash1(i, 24) * W;
      spots.push({ x, y: top(x) + 4, layer: 'far' });
      wrap(x, (xx) => {
        g.rect(xx, top(x) + 3, 2, 1, p.accent);
        g.rect(xx - 1, top(x) + 4, 4, 1, '#c8501e');
      });
    }
  });
  const mid = bake(W, H, (g) => {
    const trunk = (x: number, w: number, top: number, crack: boolean, seed: number): void => {
      wrap(x, (xx) => {
        g.rect(xx, top, w, GROUND_TOP + 4 - top, p.mid);
        g.rect(xx + w - 2, top, 2, GROUND_TOP + 4 - top, shade(p.mid, 0.7));
        g.rect(xx + 1, top, 1, GROUND_TOP + 4 - top, mix(p.mid, '#8a5a4a', 0.4));
        // bark grooves
        for (let k = 0; k < 4; k++) {
          const gx = xx + 2 + Math.floor(hash1(seed * 9 + k, 31) * (w - 3));
          const gy = top + 10 + hash1(seed * 9 + k, 32) * 60;
          g.rect(gx, gy, 1, 8 + hash1(seed * 9 + k, 33) * 18, shade(p.mid, 0.6));
        }
        // flared roots
        polyFill(g, [[xx - 5, GROUND_TOP + 4], [xx, GROUND_TOP - 8], [xx + w, GROUND_TOP - 8], [xx + w + 5, GROUND_TOP + 4]], p.mid);
        // broken top & branch stubs
        polyFill(g, [[xx, top], [xx + w * 0.3, top - 6], [xx + w * 0.6, top + 1], [xx + w, top - 3], [xx + w, top + 2], [xx, top + 2]], p.mid);
        gline(g, xx, top + 24, xx - 9, top + 12, p.mid);
        gline(g, xx, top + 25, xx - 9, top + 13, p.mid);
        gline(g, xx + w, top + 40, xx + w + 8, top + 30, p.mid);
        if (crack) {
          const cx = xx + Math.floor(w / 2);
          gline(g, cx, top + 30, cx + 1, top + 44, p.accent);
          gline(g, cx + 1, top + 44, cx - 1, top + 58, '#ff6a2a');
          spots.push({ x: cx - (xx - x), y: top + 44, layer: 'mid' });
        }
      });
    };
    const trunks: [number, number, number, boolean][] = [[18, 11, 20, true], [96, 8, 44, false], [170, 14, 8, true], [262, 9, 36, false], [330, 12, 14, true]];
    trunks.forEach(([x, w, t, c], i) => trunk(x, w, t, c, i));
  });
  const ground = bake(W, H, (g) => {
    const edge = (x: number): number => GROUND_TOP + waves(x, [[9, 1.2, 0], [23, 0.8, 1]]);
    groundBase(g, '#3a2620', p.ground, '#1c120f', '#6a5048', edge, 41);
    // burnt grass tufts along the edge
    for (let i = 0; i < 60; i++) {
      const x = Math.floor(hash1(i, 42) * W);
      const h = 2 + Math.floor(hash1(i, 43) * 4);
      wrap(x, (xx) => {
        g.rect(xx, edge(x) - h, 1, h, '#1e1210');
        g.rect(xx + 2, edge(x) - h + 1, 1, h - 1, '#1e1210');
      });
    }
    // ember specks
    for (let i = 0; i < 40; i++) g.rect(hash1(i, 44) * W, GROUND_TOP + 6 + hash1(i, 45) * 34, 1, 1, i % 3 ? '#c8501e' : p.accent);
  });
  return { sky, far, mid, ground, spots };
}

// ── Drowned Ruins ───────────────────────────────────────────────────────────

function bakeRuins(): AreaLayers {
  const p = AREAS.ruins.palette;
  const spots: AreaLayers['spots'] = [];
  const sky = bake(W, H, (g) => {
    vgrad(g, 0, 140, ['#3a8a8a', '#256a72', mix(p.sky, '#256a72', 0.4), p.sky, '#0a1e26']);
    vgrad(g, 140, H, ['#0a1e26', '#081820']);
    // surface shimmer band
    for (let x = 0; x < W; x++) if ((x * 7) % 13 < 5) g.rect(x, 1 + Math.round(Math.sin(x * 0.2)), 1, 1, '#9af0e8', 0.5);
  });
  const far = bake(W, H, (g) => {
    const top = (x: number): number => 112 + waves(x, [[2, 3, 0.5], [5, 2, 1.2]]);
    ridge(g, top, p.far);
    // temple silhouettes: domes + ziggurat + arches
    const dome = (x: number, y: number, r: number): void => wrap(x, (xx) => {
      disc(g, xx, y, r, p.far);
      g.rect(xx - r, y, r * 2 + 1, 120 - y, p.far);
      g.rect(xx, y - r - 5, 1, 5, p.far);
    });
    dome(60, 92, 13);
    dome(250, 96, 10);
    for (const [x, w] of [[140, 60], [330, 44]]) {
      wrap(x, (xx) => {
        for (let s = 0; s < 5; s++) g.rect(xx + s * 5, 116 - s * 7, w - s * 10, 7, p.far);
      });
    }
    for (const x of [200, 300]) {
      wrap(x, (xx) => {
        g.rect(xx, 84, 4, 40, p.far);
        g.rect(xx + 20, 84, 4, 40, p.far);
        for (let a = 0; a <= 12; a++) g.rect(xx + 2 + a, 84 - Math.round(Math.sin((a / 12) * Math.PI) * 9), 9, 3, p.far);
      });
    }
  });
  const mid = bake(W, H, (g) => {
    const col = (x: number, top: number, broken: boolean): void => wrap(x, (xx) => {
      const light = mix(p.mid, '#7ad0c8', 0.35);
      const dark = shade(p.mid, 0.65);
      g.rect(xx, top, 12, GROUND_TOP + 2 - top, p.mid);
      for (let f = 0; f < 12; f += 3) g.rect(xx + f, top, 1, GROUND_TOP + 2 - top, f < 4 ? light : dark);
      g.rect(xx + 10, top, 2, GROUND_TOP + 2 - top, dark);
      g.rect(xx - 3, GROUND_TOP - 6, 18, 6, p.mid);
      g.rect(xx - 3, GROUND_TOP - 6, 18, 1, light);
      if (broken) {
        polyFill(g, [[xx, top], [xx + 3, top - 5], [xx + 7, top - 1], [xx + 12, top - 7], [xx + 12, top + 1], [xx, top + 1]], p.mid);
      } else {
        g.rect(xx - 3, top - 6, 18, 6, p.mid);
        g.rect(xx - 3, top - 6, 18, 1, light);
        g.rect(xx - 2, top - 1, 16, 1, dark);
      }
      // seaweed
      for (let k = 0; k < 3; k++) gline(g, xx + 2 + k * 4, top + 2, xx + 1 + k * 4 + (k % 2), top + 14 + k * 5, '#2a8a6a');
    });
    col(30, 52, false);
    col(128, 74, true);
    col(214, 40, false);
    col(316, 66, true);
    // fallen block rubble
    for (const [x, w] of [[90, 16], [258, 12], [372, 18]]) {
      wrap(x, (xx) => {
        g.rect(xx, GROUND_TOP - 7, w, 8, p.mid);
        g.rect(xx, GROUND_TOP - 7, w, 1, mix(p.mid, '#7ad0c8', 0.35));
      });
    }
  });
  const ground = bake(W, H, (g) => {
    const edge = (x: number): number => GROUND_TOP + waves(x, [[11, 0.8, 0]]);
    groundBase(g, '#24524f', p.ground, '#0e2626', '#3a7a74', edge, 51);
    // flagstone seams
    for (let row = 0; row < 4; row++) {
      const y = GROUND_TOP + 8 + row * 9;
      g.rect(0, y, W, 1, '#0f2a2c', 0.8);
      for (let x = (row * 13) % 26; x < W; x += 26) g.rect(x, y - 8, 1, 8, '#0f2a2c', 0.7);
    }
    // coral & weed tufts
    for (let i = 0; i < 18; i++) {
      const x = Math.floor(hash1(i, 52) * W);
      const c = i % 3 === 0 ? '#ff8a8a' : '#2a9a7a';
      wrap(x, (xx) => {
        gline(g, xx, edge(x), xx - 1, edge(x) - 4, c);
        gline(g, xx + 1, edge(x), xx + 3, edge(x) - 3, c);
      });
    }
  });
  return { sky, far, mid, ground, spots };
}

// ── Glimmerdeep ─────────────────────────────────────────────────────────────

function bakeGlimmer(): AreaLayers {
  const p = AREAS.glimmer.palette;
  const spots: AreaLayers['spots'] = [];
  const sky = bake(W, H, (g) => {
    vgrad(g, 0, H, ['#0a0614', p.sky, mix(p.sky, p.far, 0.6), p.far, mix(p.far, p.accent, 0.15), '#120c22']);
    glow(g, 110, 96, 80, '#6a4ac8', 0.22, 6);
    glow(g, 310, 88, 66, '#2a7ac8', 0.2, 6);
    glow(g, 210, 110, 40, '#c86ad8', 0.12, 4);
  });
  const far = bake(W, H, (g) => {
    // ceiling + stalactites
    ridge(g, () => 0, p.far, undefined, 0);
    for (let x = 0; x < W; x++) g.rect(x, 0, 1, 10 + waves(x, [[5, 4, 0], [11, 2, 1]]), shade(p.far, 0.85));
    for (let i = 0; i < 26; i++) {
      const x = hash1(i, 61) * W;
      const h = 10 + hash1(i, 62) * 26;
      wrap(x, (xx) => polyFill(g, [[xx - 3, 8], [xx + 3, 8], [xx, 8 + h]], shade(p.far, 0.85)));
    }
    const top = (x: number): number => 108 + waves(x, [[3, 6, 0.2], [8, 3, 1.4]]);
    const wallC = shade(p.far, 0.62);
    ridge(g, top, wallC, mix(wallC, p.accent, 0.3));
    // stalagmites on the far floor
    for (let i = 0; i < 14; i++) {
      const x = hash1(i, 65) * W;
      const h = 10 + hash1(i, 66) * 22;
      wrap(x, (xx) => polyFill(g, [[xx - 5, top(x) + 3], [xx + 1, top(x) - h], [xx + 6, top(x) + 3]], wallC));
    }
    // glowing crystal clusters in the distance
    for (let i = 0; i < 10; i++) {
      const x = hash1(i, 63) * W;
      const cyan = i % 2 === 0;
      wrap(x, (xx) => {
        const b = top(x) + 2;
        shard(g, xx, b, 5, 12 + hash1(i, 64) * 8, cyan ? '#5ab8d8' : '#8a6ad8', cyan ? '#2a6a9a' : '#4a3a8a', '#c8f0ff');
        shard(g, xx + 4, b, 4, 7, cyan ? '#5ab8d8' : '#8a6ad8', cyan ? '#2a6a9a' : '#4a3a8a', '#c8f0ff', 1);
      });
      spots.push({ x: x + 2, y: top(x) - 8, layer: 'far' });
    }
  });
  const mid = bake(W, H, (g) => {
    // big stalactites
    for (let i = 0; i < 8; i++) {
      const x = hash1(i, 71) * W;
      const h = 20 + hash1(i, 72) * 30;
      wrap(x, (xx) => {
        polyFill(g, [[xx - 6, 0], [xx + 6, 0], [xx, h]], p.mid);
        gline(g, xx - 5, 0, xx - 1, h - 4, mix(p.mid, p.accent, 0.3));
      });
    }
    // large crystal formations
    // rock columns joining floor and ceiling
    for (const [x, w] of [[96, 22], [292, 18]]) {
      wrap(x, (xx) => {
        const rock = shade(p.mid, 0.72);
        polyFill(g, [[xx - w, GROUND_TOP + 2], [xx - w * 0.35, 92], [xx - w * 0.25, 40], [xx - w * 0.55, 0], [xx + w * 0.55, 0], [xx + w * 0.3, 44], [xx + w * 0.4, 96], [xx + w, GROUND_TOP + 2]], rock);
        gline(g, xx - w * 0.35, 92, xx - w, GROUND_TOP + 2, mix(rock, p.accent, 0.35));
        gline(g, xx - w * 0.25, 40, xx - w * 0.35, 92, mix(rock, p.accent, 0.25));
        for (let k = 0; k < 5; k++) g.rect(xx - w * 0.3 + hash1(k + x, 73) * w * 0.6, 20 + k * 22, 1, 6 + k, shade(rock, 0.8));
      });
    }
    const cluster = (x: number, s: number, hue: 'c' | 'v' | 'p'): void => wrap(x, (xx) => {
      const [L, D, E] = hue === 'c' ? ['#7ae0ff', '#2a8ac8', '#ffffff'] : hue === 'v' ? ['#b890ff', '#5a3aa8', '#f0e0ff'] : ['#ff9ad8', '#a04a9a', '#fff0fa'];
      shard(g, xx - 9 * s, GROUND_TOP + 2, 8 * s, 22 * s, L, D, E, -4 * s);
      shard(g, xx, GROUND_TOP + 2, 11 * s, 38 * s, L, D, E, 1);
      shard(g, xx + 9 * s, GROUND_TOP + 2, 7 * s, 18 * s, L, D, E, 4 * s);
      spots.push({ x: xx - (xx - x) + 5 * s, y: GROUND_TOP + 2 - 30 * s, layer: 'mid' });
    });
    cluster(36, 1.3, 'c');
    cluster(124, 0.7, 'p');
    cluster(176, 0.9, 'v');
    cluster(236, 1.6, 'v');
    cluster(318, 0.8, 'c');
    cluster(362, 1.1, 'p');
  });
  const ground = bake(W, H, (g) => {
    const edge = (x: number): number => GROUND_TOP + waves(x, [[7, 1.4, 0], [19, 0.6, 2]]);
    groundBase(g, '#2c2246', p.ground, '#100a1c', '#4a3a6a', edge, 81);
    for (let i = 0; i < 26; i++) {
      const x = hash1(i, 82) * W;
      const y = GROUND_TOP + 6 + hash1(i, 83) * 30;
      shard(g, x, y, 3, 4 + hash1(i, 84) * 4, i % 2 ? '#7ae0ff' : '#b890ff', i % 2 ? '#2a8ac8' : '#5a3aa8', '#ffffff');
    }
  });
  return { sky, far, mid, ground, spots };
}

// ── Rimeholt Citadel ────────────────────────────────────────────────────────

function bakeRimeholt(): AreaLayers {
  const p = AREAS.rimeholt.palette;
  const spots: AreaLayers['spots'] = [];
  const sky = bake(W, H, (g) => {
    vgrad(g, 0, 130, ['#0c1426', '#14203a', p.sky, mix(p.sky, p.far, 0.6), mix(p.far, '#8ab0d0', 0.3)]);
    vgrad(g, 130, H, [mix(p.far, '#8ab0d0', 0.3), p.far]);
    for (let i = 0; i < 70; i++) g.rect(hash1(i, 91) * W, hash1(i, 92) * 80, 1, 1, '#e8f4ff', 0.3 + hash1(i, 93) * 0.6);
    disc(g, 82, 34, 9, '#e8f4ff', 0.9);
    disc(g, 85, 32, 8, '#14203a');
  });
  const far = bake(W, H, (g) => {
    const top = (x: number): number => 92 + waves(x, [[2, 10, 0.3], [5, 8, 1.7], [11, 4, 0.9], [17, 2, 2.2]]);
    ridge(g, top, p.far);
    // snow caps
    for (let x = 0; x < W; x++) {
      const y = Math.round(top(x));
      if (y < 92) g.rect(x, y, 1, Math.max(1, Math.round((92 - y) * 0.45)), '#c8dcf0');
    }
  });
  const mid = bake(W, H, (g) => {
    const wall = mix(p.mid, p.far, 0.2);
    const tower = (x: number, w: number, top: number, roof: boolean): void => wrap(x, (xx) => {
      g.rect(xx, top, w, GROUND_TOP + 2 - top, p.mid);
      g.rect(xx + w - 2, top, 2, GROUND_TOP + 2 - top, shade(p.mid, 0.75));
      g.rect(xx, top, 1, GROUND_TOP + 2 - top, mix(p.mid, '#c8e0f8', 0.3));
      if (roof) {
        polyFill(g, [[xx - 3, top], [xx + w / 2, top - w * 1.3], [xx + w + 3, top]], '#2a3e5e');
        polyFill(g, [[xx - 3, top], [xx + w / 2, top - w * 1.3], [xx + w / 2, top]], '#e8f4ff');
      } else {
        for (let k = 0; k < w; k += 4) g.rect(xx + k, top - 3, 2, 3, p.mid);
        g.rect(xx - 1, top - 1, w + 2, 2, '#e8f4ff');
      }
      // windows
      for (let k = 0; k < 3; k++) {
        const wy = top + 10 + k * 16;
        if (wy > GROUND_TOP - 10) break;
        g.rect(xx + Math.floor(w / 2) - 1, wy, 2, 4, '#0c1426');
        if (hash1(x + k, 95) > 0.5) {
          g.rect(xx + Math.floor(w / 2) - 1, wy + 1, 2, 3, '#9ad8ff');
          spots.push({ x: x + Math.floor(w / 2), y: wy + 2, layer: 'mid' });
        }
      }
      // icicles under the roof line
      for (let k = 1; k < w - 1; k += 2) g.rect(xx + k, top + 1, 1, 1 + (k % 3), '#e8f4ff');
    });
    // curtain wall
    for (let x = 0; x < W; x++) g.rect(x, 104, 1, GROUND_TOP + 2 - 104, wall);
    for (let x = 0; x < W; x += 6) g.rect(x, 100, 3, 4, wall);
    g.rect(0, 103, W, 1, '#c8dcf0');
    tower(20, 16, 52, true);
    tower(110, 12, 74, false);
    tower(186, 22, 34, true);
    tower(286, 14, 64, true);
    tower(350, 12, 82, false);
  });
  const ground = bake(W, H, (g) => {
    const edge = (x: number): number => GROUND_TOP - 1 + waves(x, [[6, 1.6, 0], [15, 0.7, 1]]);
    groundBase(g, '#e8f2fa', p.ground, '#6a86a4', '#ffffff', edge, 101);
    for (let i = 0; i < 14; i++) {
      const x = hash1(i, 102) * W;
      const y = GROUND_TOP + 10 + hash1(i, 103) * 26;
      g.rect(x, y, 10 + hash1(i, 104) * 14, 1, '#8ab0d0', 0.6);
    }
  });
  return { sky, far, mid, ground, spots };
}

// ── The Hollow ──────────────────────────────────────────────────────────────

function bakeHollow(): AreaLayers {
  const p = AREAS.hollow.palette;
  const spots: AreaLayers['spots'] = [];
  const sky = bake(W, H, (g) => {
    // inverted light: black above, sick glow rising from below
    vgrad(g, 0, 140, ['#0c0616', '#120a20', '#160c28', mix(p.far, '#2a3a18', 0.4), mix(p.mid, p.accent, 0.25)]);
    vgrad(g, 140, H, [mix(p.mid, p.accent, 0.25), '#0a0612']);
    // the void eclipse
    disc(g, 120, 52, 21, mix(p.accent, p.sky, 0.55));
    disc(g, 120, 52, 19, mix(p.accent, p.sky, 0.25));
    disc(g, 120, 52, 17, '#020104');
  });
  const far = bake(W, H, (g) => {
    // hanging inverted peaks
    const ceil = (x: number): number => 14 + waves(x, [[3, 7, 0.4], [8, 5, 1.1], [19, 2, 0.2]]);
    for (let x = 0; x < W; x++) {
      g.rect(x, 0, 1, ceil(x), '#030106');
      g.rect(x, ceil(x), 1, 1, '#2a4a1a');
    }
    for (let i = 0; i < 9; i++) {
      const x = hash1(i, 111) * W;
      const h = 20 + hash1(i, 112) * 34;
      wrap(x, (xx) => {
        polyFill(g, [[xx - 7, 10], [xx + 7, 10], [xx + 1, 10 + h]], '#030106');
        gline(g, xx - 6, 12, xx + 1, 9 + h, '#2a4a1a');
      });
    }
    const top = (x: number): number => 116 + waves(x, [[4, 4, 0.7], [9, 3, 2]]);
    ridge(g, top, p.far, mix(p.far, p.accent, 0.35));
    // floating rock islands lit from below
    for (let i = 0; i < 4; i++) {
      const x = 40 + i * 100 + hash1(i, 113) * 40;
      const y = 58 + hash1(i, 114) * 28;
      const w = 26 + hash1(i, 115) * 18;
      wrap(x, (xx) => {
        const rock = mix(p.far, p.mid, 0.7);
        polyFill(g, [[xx, y + 2], [xx + w * 0.2, y - 3], [xx + w * 0.7, y - 4], [xx + w, y + 1], [xx + w * 0.7, y + w * 0.45], [xx + w * 0.45, y + w * 0.7], [xx + w * 0.25, y + w * 0.4]], rock);
        gline(g, xx + 1, y + 3, xx + w * 0.45, y + w * 0.7, mix(rock, p.accent, 0.55));
        gline(g, xx + w * 0.45, y + w * 0.7, xx + w * 0.7, y + w * 0.45, mix(rock, p.accent, 0.35));
        for (let k = 0; k < 4; k++) gline(g, xx + w * (0.3 + k * 0.12), y + w * 0.5, xx + w * (0.28 + k * 0.12), y + w * 0.5 + 6 + k * 3, '#2a1a3a');
        g.rect(xx + w * 0.2, y - 4, w * 0.5, 1, shade(rock, 0.6));
      });
    }
  });
  const mid = bake(W, H, (g) => {
    const rim = mix(p.mid, p.accent, 0.45);
    const spire = (x: number, w: number, h: number, bend: number): void => wrap(x, (xx) => {
      const b = GROUND_TOP + 2;
      const pts: [number, number][] = [
        [xx - w * 0.3, b], [xx + w * 0.1, b - h * 0.3], [xx + bend * 0.4, b - h * 0.55], [xx + w * 0.25 + bend * 0.8, b - h * 0.8],
        [xx + w * 0.4 + bend, b - h - 6], [xx + w * 0.6 + bend, b - h], [xx + w * 0.7 + bend * 0.6, b - h * 0.62],
        [xx + w * 0.95 + bend * 0.3, b - h * 0.35], [xx + w * 1.3, b],
      ];
      polyFill(g, pts, p.mid);
      // light from below: rim along the lower-left edges
      for (let k = 0; k < 4; k++) gline(g, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], rim);
      gline(g, xx + w * 0.5, b - h * 0.2, xx + w * 0.55 + bend * 0.5, b - h * 0.7, shade(p.mid, 0.7));
      spots.push({ x: x + w / 2, y: GROUND_TOP - h * 0.5, layer: 'mid' });
    });
    spire(30, 18, 70, 6);
    spire(130, 14, 48, -5);
    spire(222, 24, 96, 8);
    spire(322, 16, 58, -4);
  });
  const ground = bake(W, H, (g) => {
    const edge = (x: number): number => GROUND_TOP + waves(x, [[8, 1, 0]]);
    groundBase(g, '#1e1430', p.ground, '#06030a', '#2a1e3a', edge, 121);
    // glowing veins
    for (let i = 0; i < 9; i++) {
      let x = hash1(i, 122) * W;
      let y = GROUND_TOP + 6 + hash1(i, 123) * 26;
      for (let k = 0; k < 7; k++) {
        const nx = x + 3 + hash1(i * 10 + k, 124) * 6;
        const ny = y + (hash1(i * 10 + k, 125) - 0.5) * 6;
        gline(g, x, y, nx, ny, k % 3 ? '#4ea82a' : p.accent);
        x = nx;
        y = Math.max(GROUND_TOP + 4, Math.min(H - 2, ny));
      }
    }
  });
  return { sky, far, mid, ground, spots };
}

// ── The Ember Heart ─────────────────────────────────────────────────────────

function bakeHeart(): AreaLayers {
  const p = AREAS.heart.palette;
  const spots: AreaLayers['spots'] = [];
  const sky = bake(W, H, (g) => {
    vgrad(g, 0, 140, ['#140402', p.sky, mix(p.sky, p.far, 0.7), mix(p.far, '#c8501e', 0.4), mix(p.mid, p.accent, 0.45)]);
    vgrad(g, 140, H, [mix(p.mid, p.accent, 0.45), p.mid]);
    // the ember heart: a great molten core in the distance
    glow(g, 268, 70, 46, '#ff8a3d', 0.35, 6);
    disc(g, 268, 70, 16, '#ffb040');
    disc(g, 266, 68, 12, '#ffd36a');
    disc(g, 264, 66, 6, '#fff2b0');
  });
  const far = bake(W, H, (g) => {
    for (let x = 0; x < W; x++) g.rect(x, 0, 1, 18 + waves(x, [[4, 8, 0.5], [9, 4, 1.2]]), '#1a0604');
    const top = (x: number): number => 100 + waves(x, [[3, 7, 0.2], [7, 4, 1.4], [15, 2, 0.4]]);
    ridge(g, top, p.far, mix(p.far, p.accent, 0.4));
    // lava falls
    for (const x of [44, 150, 352]) {
      spots.push({ x, y: 30, layer: 'far' });
      wrap(x, (xx) => {
        g.rect(xx, 18, 3, top(x) - 18, '#ff8a3d');
        g.rect(xx + 1, 18, 1, top(x) - 18, '#ffd36a');
        disc(g, xx + 1, top(x), 4, '#ff6a2a', 0.8);
      });
    }
  });
  const mid = bake(W, H, (g) => {
    const pillar = (x: number, w: number, top: number): void => wrap(x, (xx) => {
      polyFill(g, [[xx, GROUND_TOP + 2], [xx + 2, top + 6], [xx + w / 2, top], [xx + w - 2, top + 4], [xx + w, GROUND_TOP + 2]], '#1e0a08');
      gline(g, xx + 1, GROUND_TOP, xx + 2, top + 7, '#4a1e10');
      // golden veins
      let vx = xx + w / 2;
      for (let y = top + 8; y < GROUND_TOP; y += 6) {
        const nx = xx + 3 + hash1(y + x, 131) * (w - 6);
        gline(g, vx, y, nx, y + 6, '#ffb040');
        vx = nx;
      }
    });
    pillar(26, 16, 40);
    pillar(118, 11, 70);
    pillar(204, 20, 24);
    pillar(300, 13, 58);
    pillar(370, 10, 84);
  });
  const ground = bake(W, H, (g) => {
    const edge = (x: number): number => GROUND_TOP + waves(x, [[10, 1.1, 0.5]]);
    groundBase(g, '#3a140a', p.ground, '#120402', '#5a2412', edge, 141);
    // lava channels
    for (let i = 0; i < 6; i++) {
      let x = hash1(i, 142) * W;
      let y = GROUND_TOP + 8 + hash1(i, 143) * 24;
      for (let k = 0; k < 9; k++) {
        const nx = x + 4 + hash1(i * 10 + k, 144) * 5;
        const ny = Math.max(GROUND_TOP + 5, Math.min(H - 3, y + (hash1(i * 10 + k, 145) - 0.5) * 5));
        gline(g, x, y, nx, ny, '#ff6a2a');
        gline(g, x, y - 1, nx, ny - 1, '#ffb040', 0.7);
        x = nx;
        y = ny;
      }
      spots.push({ x, y, layer: 'mid' });
    }
  });
  return { sky, far, mid, ground, spots };
}

const BAKERS: Record<AreaId, () => AreaLayers> = {
  ashwood: bakeAshwood,
  ruins: bakeRuins,
  glimmer: bakeGlimmer,
  rimeholt: bakeRimeholt,
  hollow: bakeHollow,
  heart: bakeHeart,
};

// ---------------------------------------------------------------------------
// Ambient animation
// ---------------------------------------------------------------------------

const FAR_RATE = 0.12;
const MID_RATE = 0.38;

function wrapX(x: number): number {
  return ((x % W) + W) % W;
}

/** Rising / falling particle field. Deterministic in time, no state. */
function particles(
  g: Gfx, n: number, seed: number, time: number, scroll: number,
  opt: { vy: number; vx: number; sway: number; y0: number; y1: number; colors: readonly string[]; size?: number; alpha?: number; rate?: number; flicker?: boolean },
): void {
  const span = opt.y1 - opt.y0;
  for (let i = 0; i < n; i++) {
    const r = hash1(i, seed);
    const speed = 0.6 + hash1(i, seed + 1) * 0.8;
    const ph = hash1(i, seed + 2) * 1000;
    const prog = (((hash1(i, seed + 3) + (opt.vy * speed * time) / span) % 1) + 1) % 1;
    const y = opt.y0 + prog * span;
    const x = wrapX(r * W + opt.vx * speed * time + Math.sin(time * 1.3 + ph) * opt.sway - scroll * (opt.rate ?? 0.8));
    const c = opt.colors[i % opt.colors.length];
    const fl = opt.flicker ? 0.55 + 0.45 * Math.sin(time * 9 + ph) : 1;
    const big = opt.size && hash1(i, seed + 4) > 0.75 ? opt.size : 1;
    g.rect(x, y, big, big, c, (opt.alpha ?? 1) * fl);
  }
}

function ambientBack(g: Gfx, id: AreaId, scroll: number, time: number, L: AreaLayers): void {
  switch (id) {
    case 'ashwood': {
      for (const s of L.spots) {
        if (s.layer !== 'far') continue;
        const x = wrapX(s.x - scroll * FAR_RATE);
        glow(g, x, s.y, 10, '#ff6a2a', 0.18 + 0.08 * Math.sin(time * 3 + s.x), 3);
      }
      break;
    }
    case 'ruins': {
      // god rays
      for (let i = 0; i < 5; i++) {
        const x0 = wrapX(i * 90 + 30 - scroll * 0.05 + Math.sin(time * 0.3 + i) * 10);
        const a = 0.05 + 0.035 * Math.sin(time * 0.7 + i * 1.7);
        polyFill(g, [[x0, 0], [x0 + 14, 0], [x0 + 54, 150], [x0 + 26, 150]], '#bff8f0', a);
      }
      break;
    }
    case 'rimeholt': {
      // aurora ribbons
      for (let x = 0; x < W; x += 2) {
        const y = 24 + Math.sin(x * 0.02 + time * 0.4) * 8 + Math.sin(x * 0.05 - time * 0.3) * 4;
        const a = 0.1 + 0.08 * Math.sin(x * 0.03 + time);
        g.rect(x, y, 2, 6, '#7affc8', a);
        g.rect(x, y + 6, 2, 6, '#7ad8ff', a * 0.6);
      }
      break;
    }
    case 'hollow': {
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.3);
      glow(g, 120, 52, 30, '#b4ff6a', 0.08 + 0.08 * pulse, 4);
      break;
    }
    case 'heart': {
      const pulse = 0.5 + 0.5 * Math.sin(time * 2.1);
      glow(g, 268, 70, 30 + pulse * 6, '#ffd36a', 0.12 + 0.1 * pulse, 4);
      break;
    }
    default:
      break;
  }
}

function ambientMid(g: Gfx, id: AreaId, scroll: number, time: number, L: AreaLayers): void {
  if (id === 'ashwood') {
    // drifting smoke between the layers
    for (let i = 0; i < 6; i++) {
      const x = wrapX(hash1(i, 151) * W + time * 4 - scroll * 0.25);
      const y = 70 + hash1(i, 152) * 50 + Math.sin(time * 0.5 + i) * 4;
      disc(g, x, y, 9, '#5a4a52', 0.07);
      disc(g, x + 8, y - 3, 7, '#5a4a52', 0.06);
    }
  } else if (id === 'heart') {
    // flame tongues along the far horizon
    for (let i = 0; i < 18; i++) {
      const x = wrapX(hash1(i, 161) * W - scroll * FAR_RATE);
      const base = 100 + waves(x + scroll * FAR_RATE, [[3, 7, 0.2], [7, 4, 1.4], [15, 2, 0.4]]) + 2;
      const k = hash1(i, 162);
      const h = (3 + 7 * k) * (0.55 + 0.45 * Math.sin(time * (5 + k * 4) + i * 2.3));
      g.rect(x, base - h, 2, h, '#ff8a3d', 0.7);
      g.rect(x + (i % 2), base - h - 1, 1, 1, '#ffd36a', 0.6);
      g.rect(x, base - h * 0.45, 2, h * 0.45, '#ffd36a', 0.8);
    }
    for (const s of L.spots) {
      if (s.layer !== 'far') continue;
      const x = wrapX(s.x - scroll * FAR_RATE);
      for (let k = 0; k < 3; k++) g.rect(x + (k % 2), ((time * 40 + k * 23 + s.x) % 70) + 20, 1, 3, '#fff2b0', 0.8);
    }
  } else if (id === 'rimeholt') {
    for (const s of L.spots) {
      const x = wrapX(s.x - scroll * MID_RATE);
      g.rect(x - 1, s.y - 1, 2, 3, '#9ad8ff', 0.25 + 0.2 * Math.sin(time * 2 + s.x));
    }
  }
}

function ambientFront(g: Gfx, id: AreaId, scroll: number, time: number, L: AreaLayers): void {
  switch (id) {
    case 'ashwood':
      particles(g, 34, 171, time, scroll, { vy: -14, vx: 3, sway: 6, y0: 10, y1: 160, colors: ['#ffb040', '#ff6a2a', '#ffd27a'], size: 2, flicker: true });
      break;
    case 'ruins': {
      // bubbles
      for (let i = 0; i < 18; i++) {
        const sp = 10 + hash1(i, 181) * 14;
        const y = 150 - (((hash1(i, 182) * 150 + time * sp) % 150 + 150) % 150);
        const x = wrapX(hash1(i, 183) * W + Math.sin(time * 2 + i) * 3 - scroll * 0.6);
        const r = hash1(i, 184) > 0.7 ? 2 : 1;
        if (r === 2) {
          g.rect(x - 1, y, 1, 1, '#bff8f0', 0.6);
          g.rect(x + 1, y, 1, 1, '#bff8f0', 0.6);
          g.rect(x, y - 1, 1, 1, '#ffffff', 0.7);
          g.rect(x, y + 1, 1, 1, '#bff8f0', 0.5);
        } else g.rect(x, y, 1, 1, '#bff8f0', 0.7);
      }
      // caustics on the floor
      for (let y = GROUND_TOP + 2; y < 172; y += 2) {
        for (let x = 0; x < W; x += 2) {
          const wx = x + scroll;
          const v = Math.sin(wx * 0.11 + time * 1.4 + Math.sin(y * 0.3 + time) * 2) + Math.sin(wx * 0.07 - time * 1.1 + y * 0.21);
          if (v > 1.45) g.rect(x, y, 2, 1, '#7af0e0', 0.22 * (v - 1.4) * 3);
        }
      }
      // swaying kelp
      for (let i = 0; i < 6; i++) {
        const bx = wrapX(i * 71 + 20 - scroll * 0.9);
        for (let k = 0; k < 12; k++) {
          const sw = Math.sin(time * 1.6 + i + k * 0.35) * (k * 0.35);
          g.rect(bx + sw, GROUND_TOP + 1 - k * 2, 1, 2, k % 4 === 0 ? '#3ac89a' : '#2a8a6a');
        }
      }
      break;
    }
    case 'glimmer': {
      for (const s of L.spots) {
        const rate = s.layer === 'far' ? FAR_RATE : MID_RATE;
        const x = wrapX(s.x - scroll * rate);
        const tw = Math.sin(time * 2.5 + s.x * 0.37 + s.y);
        if (tw < 0.2) continue;
        const a = (tw - 0.2) / 0.8;
        g.rect(x, s.y - 2, 1, 5, '#ffffff', a * 0.9);
        g.rect(x - 2, s.y, 5, 1, '#ffffff', a * 0.9);
        glow(g, x, s.y, 6, '#c8a8ff', 0.15 * a, 2);
      }
      particles(g, 22, 191, time, scroll, { vy: -4, vx: 2, sway: 8, y0: 20, y1: 150, colors: ['#b890ff', '#7ae0ff'], alpha: 0.6, flicker: true });
      break;
    }
    case 'rimeholt':
      particles(g, 50, 201, time, scroll, { vy: 12, vx: -7, sway: 5, y0: 0, y1: 178, colors: ['#ffffff', '#d8ecff'], alpha: 0.85 });
      particles(g, 20, 202, time, scroll, { vy: 22, vx: -12, sway: 7, y0: 0, y1: 178, colors: ['#ffffff'], size: 2, alpha: 0.9, rate: 1.1 });
      break;
    case 'hollow':
      particles(g, 36, 211, time, scroll, { vy: -6, vx: 1, sway: 5, y0: 20, y1: 172, colors: ['#b4ff6a', '#8a5ad8', '#6ac83a'], alpha: 0.75, flicker: true });
      for (const s of L.spots) {
        const x = wrapX(s.x - scroll * MID_RATE);
        g.rect(x, s.y + Math.sin(time + s.x) * 3, 1, 1, '#d8ff9a', 0.6);
      }
      break;
    case 'heart': {
      particles(g, 40, 221, time, scroll, { vy: -22, vx: 4, sway: 4, y0: 10, y1: 165, colors: ['#ffd36a', '#ff8a3d', '#fff2b0'], size: 2, flicker: true });
      for (const s of L.spots) {
        if (s.layer !== 'mid') continue;
        const x = wrapX(s.x - scroll);
        glow(g, x, s.y, 7, '#ff6a2a', 0.12 + 0.1 * Math.sin(time * 3 + s.x), 2);
      }
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Public painters
// ---------------------------------------------------------------------------

/** Full 400x180 backdrop for an area. `scroll` grows while the party walks. */
export function paintArea(g: Gfx, id: AreaId, scroll: number, time: number): void {
  const L = areaLayers(id);
  g.image(L.sky, 0, 0);
  ambientBack(g, id, scroll, time, L);
  drawTiled(g, L.far, scroll * FAR_RATE, 0);
  ambientMid(g, id, scroll, time, L);
  drawTiled(g, L.mid, scroll * MID_RATE, 0);
  drawTiled(g, L.ground, scroll, 0);
  ambientFront(g, id, scroll, time, L);
}

/** Sparse front-layer particles kept above (y < 64) and below (y > 160) the unit band. */
export function paintAreaForeground(g: Gfx, id: AreaId, scroll: number, time: number): void {
  const top = { y0: 0, y1: 62 };
  const low = { y0: 162, y1: 180 };
  switch (id) {
    case 'ashwood':
      particles(g, 6, 301, time, scroll, { vy: -10, vx: 6, sway: 8, ...top, colors: ['#ffd27a', '#ff8a3d'], size: 2, flicker: true, rate: 1.3 });
      particles(g, 5, 302, time, scroll, { vy: -3, vx: 4, sway: 3, ...low, colors: ['#ff6a2a'], flicker: true, rate: 1.3 });
      break;
    case 'ruins':
      particles(g, 5, 311, time, scroll, { vy: -9, vx: 0, sway: 4, ...top, colors: ['#e8fff8'], alpha: 0.7, rate: 1.3 });
      break;
    case 'glimmer':
      particles(g, 6, 321, time, scroll, { vy: -3, vx: 3, sway: 6, ...top, colors: ['#f0e0ff', '#a8f4ff'], flicker: true, rate: 1.3 });
      break;
    case 'rimeholt':
      particles(g, 10, 331, time, scroll, { vy: 26, vx: -16, sway: 6, ...top, colors: ['#ffffff'], size: 2, alpha: 0.95, rate: 1.4 });
      particles(g, 6, 332, time, scroll, { vy: 10, vx: -16, sway: 6, ...low, colors: ['#ffffff'], alpha: 0.9, rate: 1.4 });
      break;
    case 'hollow':
      particles(g, 6, 341, time, scroll, { vy: -4, vx: 1, sway: 6, ...top, colors: ['#b4ff6a', '#c890ff'], flicker: true, rate: 1.3 });
      break;
    case 'heart':
      particles(g, 8, 351, time, scroll, { vy: -16, vx: 5, sway: 5, ...top, colors: ['#fff2b0', '#ffb040'], size: 2, flicker: true, rate: 1.3 });
      particles(g, 5, 352, time, scroll, { vy: -4, vx: 2, sway: 2, ...low, colors: ['#ff8a3d'], flicker: true, rate: 1.3 });
      break;
  }
}

// ---------------------------------------------------------------------------
// Camp
// ---------------------------------------------------------------------------

const flipCache = new WeakMap<Pix, Pix>();
function flipped(p: Pix): Pix {
  let f = flipCache.get(p);
  if (!f) {
    f = flipH(p);
    flipCache.set(p, f);
  }
  return f;
}

/** Draw a unit frame with its feet at (x, y). `face` = -1 mirrors it. */
function drawUnit(g: Gfx, f: UnitFrame, x: number, y: number, face: 1 | -1, alpha = 1): void {
  if (face === 1) g.image(f.pix, Math.round(x - f.ax), Math.round(y - f.ay), alpha);
  else g.image(flipped(f.pix), Math.round(x - (f.pix.w - f.ax)), Math.round(y - f.ay), alpha);
}

const seatCache = new Map<string, UnitFrame>();
/** Seated variant: the legs are cut off so the hero sits on a log drawn in front. */
function seated(key: string, frame: number, tier: number, cut: number): UnitFrame {
  const id = `${key}|${frame}|${tier}|${cut}`;
  let s = seatCache.get(id);
  if (!s) {
    const f = unitFrame(key, 'idle', frame, tier);
    s = { pix: crop(f.pix, 0, 0, f.pix.w, f.ay - cut), ax: f.ax, ay: f.ay - cut };
    seatCache.set(id, s);
  }
  return s;
}

let campDark: Pix[] | null = null;
/** Night darkness with a dithered hole of light around the fire (3 flicker radii). */
function campDarkness(): Pix[] {
  if (campDark) return campDark;
  const c = parseColor('#06040c');
  campDark = [92, 98, 104].map((r) => {
    const p = makePix(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const d = Math.hypot(x - 200, (y - 142) * 1.7) / r;
        const a = Math.min(0.78, Math.max(0, (d - 0.45) * 0.9));
        const q = Math.floor(a * 6 + bayer(x, y)) / 6;
        if (q > 0) setPx(p, x, y, { r: c.r, g: c.g, b: c.b, a: Math.round(q * 255) });
      }
    }
    return p;
  });
  return campDark;
}

function campfireFlames(g: Gfx, cx: number, base: number, time: number): void {
  const cols = ['#fff2b0', '#ffd27a', '#ff9a3a', '#e0501e', '#a02a14'];
  for (let dx = -6; dx <= 6; dx++) {
    const env = Math.cos((dx / 7) * (Math.PI / 2));
    const n = 0.65 + 0.35 * Math.sin(time * 11 + dx * 1.9) * Math.sin(time * 7.3 - dx * 0.7);
    const h = Math.max(1, Math.round((6 + 12 * env) * n));
    for (let k = 0; k < h; k++) {
      const t = k / h;
      const ci = Math.min(cols.length - 1, Math.floor(t * cols.length + (Math.abs(dx) > 3 ? 1 : 0)));
      g.rect(cx + dx, base - k, 1, 1, cols[ci]);
    }
  }
  // detached licks
  for (let i = 0; i < 4; i++) {
    const ph = (time * 2.2 + i * 0.27) % 1;
    const x = cx + Math.sin(time * 5 + i * 2) * 4;
    g.rect(x, base - 14 - ph * 10, 1, 2, ph < 0.5 ? '#ffd27a' : '#ff6a2a', 1 - ph);
  }
}

export function paintCamp(g: Gfx, save: SaveData, time: number): void {
  const area = save.selectedArea ?? 'ashwood';
  paintArea(g, area, 0, time * 0.5);
  // night tint over the backdrop
  g.rect(0, 0, W, H, '#0a0818', 0.55);
  // stars
  for (let i = 0; i < 60; i++) {
    const tw = 0.4 + 0.6 * Math.abs(Math.sin(time * (0.6 + hash1(i, 401)) + i));
    g.rect(hash1(i, 402) * W, hash1(i, 403) * 70, 1, 1, '#f4ecff', tw * 0.8);
  }
  const fx = 200;
  const fy = 150;
  const flick = 0.85 + 0.15 * Math.sin(time * 13) * Math.sin(time * 7.7);
  // warm light on the ground
  glow(g, fx, fy - 4, 84, '#ff8a3d', 0.28 * flick, 8);
  // tent (right) & lantern pole (left)
  polyFill(g, [[296, 150], [326, 118], [356, 150]], '#3a2a2e');
  polyFill(g, [[296, 150], [326, 118], [326, 150]], '#4e383a');
  polyFill(g, [[318, 150], [326, 132], [334, 150]], '#120a10');
  gline(g, 326, 118, 330, 113, '#2a1e20');
  g.rect(104, 124, 2, 26, '#3a2a22');
  g.rect(101, 124, 8, 2, '#3a2a22');
  g.rect(106, 126, 3, 5, '#ffd27a');
  glow(g, 107, 129, 14, '#ffb040', 0.25 * flick, 3);
  // heroes around the fire
  const spots: { hero: string; x: number; face: 1 | -1; sit: number }[] = [
    { hero: 'guardian', x: 164, face: 1, sit: 0 },
    { hero: 'ranger', x: 140, face: 1, sit: 6 },
    { hero: 'arcanist', x: 238, face: -1, sit: 6 },
    { hero: 'oracle', x: 262, face: -1, sit: 0 },
  ];
  const fr = Math.floor(time * 1.6) % 2;
  for (const s of spots) {
    const hs = save.heroes?.[s.hero as (typeof HERO_ORDER)[number]];
    if (!hs?.recruited) continue;
    const tier = gearTier(hs.level);
    if (s.sit > 0) {
      const f = seated(s.hero, fr, tier, s.sit);
      drawUnit(g, f, s.x, fy - 3, s.face);
      // log seat
      g.rect(s.x - 10, fy - 4, 20, 5, '#4a3024');
      g.rect(s.x - 10, fy - 4, 20, 1, '#6a4a34');
      g.rect(s.x - 10, fy - 4, 2, 5, '#8a6a4a');
    } else {
      drawUnit(g, unitFrame(s.hero, 'idle', fr, tier), s.x, fy, s.face);
    }
  }
  // stone ring + logs
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI;
    const sx = fx + Math.cos(a) * 11 - 2;
    const sy = fy - 1 + Math.sin(a) * 2;
    g.rect(sx, sy, 4, 3, i % 2 ? '#5a5258' : '#6e6670');
    g.rect(sx, sy, 4, 1, '#8a828c');
  }
  gline(g, fx - 8, fy - 1, fx + 7, fy - 4, '#5a3a26');
  gline(g, fx - 8, fy - 2, fx + 7, fy - 5, '#7a5236');
  gline(g, fx + 8, fy - 1, fx - 7, fy - 4, '#4a3020');
  gline(g, fx + 8, fy - 2, fx - 7, fy - 5, '#6a4a30');
  // darkness falloff, then the fire itself on top
  const dark = campDarkness();
  g.image(dark[Math.floor(time * 7) % dark.length], 0, 0);
  campfireFlames(g, fx, fy - 4, time);
  glow(g, fx, fy - 10, 16, '#ffd27a', 0.22 * flick, 3);
  // sparks
  for (let i = 0; i < 14; i++) {
    const ph = ((time * (0.35 + hash1(i, 411) * 0.3) + hash1(i, 412)) % 1 + 1) % 1;
    const x = fx + Math.sin(time * 2 + i * 1.7) * (4 + ph * 10) + (hash1(i, 413) - 0.5) * 8;
    const y = fy - 10 - ph * 70;
    g.rect(x, y, 1, 1, ph < 0.4 ? '#fff2b0' : '#ff8a3d', 1 - ph);
  }
}

// ---------------------------------------------------------------------------
// Title
// ---------------------------------------------------------------------------

let titleLayers: { sky: Pix; far: Pix; near: Pix; heroes: { pix: Pix; x: number; y: number }[] } | null = null;

function hillY(x: number): number {
  return 128 - Math.exp(-(((x - 286) / 70) ** 2)) * 26 + Math.sin(x * 0.03) * 2;
}

function bakeTitle(): NonNullable<typeof titleLayers> {
  const sky = bake(W, H, (g) => {
    vgrad(g, 0, 150, ['#05040c', '#0c0a1c', '#16102a', '#24183a', '#3a2440', '#5a3040']);
    vgrad(g, 150, H, ['#5a3040', '#3a2030']);
    // faint nebula band
    for (let x = 0; x < W; x++) {
      const y = 40 + Math.sin(x * 0.012) * 18;
      for (let k = -6; k <= 6; k++) if (bayer(x, Math.round(y + k)) < 0.18 - Math.abs(k) * 0.025) g.rect(x, y + k, 1, 1, '#6a4a8a', 0.6);
    }
  });
  const far = bake(W, H, (g) => {
    ridge(g, (x) => 112 + waves(x, [[2, 9, 1], [5, 6, 0.3], [13, 2, 2]]), '#1c1630');
    // distant ruins on the ridge
    for (const [x, h] of [[46, 22], [58, 30], [72, 16], [150, 18]]) {
      const b = 112 + waves(x, [[2, 9, 1], [5, 6, 0.3], [13, 2, 2]]);
      g.rect(x, b - h, 6, h + 2, '#1c1630');
      for (let k = 0; k < 6; k += 2) g.rect(x + k, b - h - 2, 1, 2, '#1c1630');
      g.rect(x + 2, b - h + 5, 1, 3, '#0c0a1c');
    }
    ridge(g, (x) => 126 + waves(x, [[3, 5, 2], [7, 3, 0.7]]), '#130f22');
  });
  const near = bake(W, H, (g) => {
    ridge(g, hillY, '#08060e', '#1e1424');
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(hash1(i, 501) * W);
      const h = 2 + Math.floor(hash1(i, 502) * 5);
      g.rect(x, hillY(x) - h, 1, h, '#08060e');
    }
    // lantern post
    g.rect(323, hillY(324) - 30, 2, 31, '#120c14');
    g.rect(318, hillY(324) - 30, 10, 2, '#120c14');
    g.rect(319, hillY(324) - 28, 1, 3, '#120c14');
  });
  const heroes: { pix: Pix; x: number; y: number }[] = [];
  const xs = [300, 264, 230, 196];
  HERO_ORDER.forEach((h, i) => {
    const f = unitFrame(h, 'idle', 0, 0);
    const big = scale1_5(silhouette(f.pix, '#05030a'));
    const sil = rimLight(rimLight(big, '#ffb066', 1, 0), '#3a2440', 0, -1);
    const x = xs[i];
    heroes.push({ pix: sil, x: x - Math.round(f.ax * 1.5), y: Math.round(hillY(x)) + 3 - Math.round(f.ay * 1.5) });
  });
  return { sky, far, near, heroes };
}

export function paintTitle(g: Gfx, time: number): void {
  if (!titleLayers) titleLayers = bakeTitle();
  const T = titleLayers;
  g.image(T.sky, 0, 0);
  for (let i = 0; i < 90; i++) {
    const tw = 0.3 + 0.7 * Math.abs(Math.sin(time * (0.4 + hash1(i, 511) * 0.8) + i * 1.3));
    const big = hash1(i, 512) > 0.93;
    const x = hash1(i, 513) * W;
    const y = hash1(i, 514) ** 1.4 * 110;
    g.rect(x, y, 1, 1, '#f4ecff', tw);
    if (big) {
      g.rect(x - 1, y, 3, 1, '#f4ecff', tw * 0.4);
      g.rect(x, y - 1, 1, 3, '#f4ecff', tw * 0.4);
    }
  }
  drawTiled(g, T.far, time * 1.5, 0);
  // drifting mist
  for (let i = 0; i < 7; i++) {
    const x = wrapX(hash1(i, 521) * W + time * (3 + i));
    disc(g, x, 120 + hash1(i, 522) * 8, 14, '#5a3a5a', 0.06);
  }
  const lx = 324;
  const ly = hillY(324) - 27;
  const flick = 0.85 + 0.15 * Math.sin(time * 9) * Math.sin(time * 5.3);
  glow(g, lx, ly, 70, '#ff9a4a', 0.22 * flick, 6);
  g.image(T.near, 0, 0);
  glow(g, lx, ly + 24, 46, '#ff8a3d', 0.1 * flick, 4);
  for (const h of T.heroes) g.image(h.pix, h.x, h.y);
  // the lantern
  g.rect(lx - 3, ly - 1, 6, 1, '#3a2418');
  g.rect(lx - 3, ly, 6, 7, '#5a3a20');
  g.rect(lx - 2, ly + 1, 4, 5, '#ffd27a');
  g.rect(lx - 1, ly + 2, 2, 3, '#fff2b0');
  g.rect(lx - 3, ly + 7, 6, 1, '#3a2418');
  glow(g, lx, ly + 3, 12, '#ffd27a', 0.35 * flick, 3);
  // embers drifting from the lantern
  for (let i = 0; i < 16; i++) {
    const ph = ((time * (0.12 + hash1(i, 531) * 0.1) + hash1(i, 532)) % 1 + 1) % 1;
    const x = lx - ph * 160 + Math.sin(time * 1.5 + i) * 6;
    const y = ly - ph * 60 - Math.sin(ph * 6 + i) * 6;
    g.rect(x, y, 1, 1, ph < 0.5 ? '#ffd27a' : '#ff8a3d', (1 - ph) * 0.9);
  }
  // fireflies in the foreground grass
  for (let i = 0; i < 6; i++) {
    const x = wrapX(hash1(i, 541) * W + Math.sin(time * 0.7 + i) * 12);
    const y = 150 + hash1(i, 542) * 24 + Math.sin(time * 1.1 + i * 2) * 3;
    g.rect(x, y, 1, 1, '#ffe08a', 0.4 + 0.4 * Math.sin(time * 3 + i));
  }
}
