// DOM-free unit sprite baking: ASCII maps + palettes → posed, outlined, cached pixel frames.
import {
  bbox, blit, breathe, dim, flipH, hash2, makePix, outline, paintMap, parseColor, pad, rot90, scale1_5, setPx, shift, shiftRows,
  type Palette, type Pix,
} from './pix.ts';
import { HERO_ART } from './data/heroes.ts';
import { ENEMY_ART } from './data/enemies.ts';
import { DEEP_ENEMY_ART } from './data/enemies_deep.ts';
import { ELITE_ART } from './data/elites.ts';
import { BOSS_ART } from './data/bosses.ts';

export type Pose = 'idle' | 'walk' | 'attack' | 'cast' | 'hurt' | 'dead';

/** A map: full rows, or a patch of another named map of the same unit. */
export type MapSpec =
  | readonly string[]
  | {
      from: string;
      /** Replace the last N rows. */
      bottom?: readonly string[];
      /** Replace the first N rows. */
      top?: readonly string[];
      /** Overlays: '.' keeps the base char, ',' erases, anything else replaces. */
      over?: readonly { x: number; y: number; rows: readonly string[] }[];
    };

export interface UnitArt {
  maps: Record<string, MapSpec>;
  pal: Palette | ((tier: number) => Palette);
  /** Facing of the ASCII art ('R' = looking right). */
  face: 'L' | 'R';
  /** Anchor column in map space (feet centre). Default: half the map width. */
  ax?: number;
  /** Chars painted after the outline (light / glow pixels, no dark border). */
  glow?: string;
  /** Outline colour. */
  out?: string;
  /** Idle frame 2 when no 'idle2' map: rows above this move down 1px. 0 → whole sprite bobs. */
  breath?: number;
  /** Map names per pose. Missing poses are derived from 'idle'. */
  poses?: Partial<Record<Pose, readonly string[]>>;
  /** Dead pose style when no 'dead' map. */
  dead?: 'topple' | 'slump';
  /** Lean amount for derived attack poses (default 2). */
  lean?: number;
  /** Upscale: 1.5 = Scale3x then every second pixel (smooth 1.5x, used by the shadow heroes). */
  scale?: 1 | 1.5;
  /** Post-process hook on the coloured (un-outlined) frame. */
  post?: (p: Pix, pose: Pose, frame: number, tier: number) => Pix;
  /** Mirror the finished frame (e.g. shadow heroes reuse right-facing hero maps but face left). */
  flip?: boolean;
  /** Tier aura (hero radiant tier). */
  aura?: (tier: number) => string | null;
}

export interface UnitFrame {
  pix: Pix;
  ax: number;
  ay: number;
}

const MARGIN = 3;

const ALL_ART: Record<string, UnitArt> = { ...HERO_ART, ...ENEMY_ART, ...DEEP_ENEMY_ART, ...ELITE_ART, ...BOSS_ART };

export function unitArt(key: string): UnitArt | null {
  return ALL_ART[key] ?? null;
}

export function unitKeys(): string[] {
  return Object.keys(ALL_ART);
}

// ---------------------------------------------------------------------------
// Map resolution (char level)
// ---------------------------------------------------------------------------

function resolveMap(art: UnitArt, name: string, depth = 0): string[] {
  const spec = art.maps[name];
  if (!spec) throw new Error(`sprite map missing: ${name}`);
  if (depth > 8) throw new Error('sprite map recursion');
  if (Array.isArray(spec)) return [...(spec as readonly string[])];
  const s = spec as Exclude<MapSpec, readonly string[]>;
  const rows = resolveMap(art, s.from, depth + 1);
  if (s.bottom) {
    const n = s.bottom.length;
    for (let i = 0; i < n; i++) rows[rows.length - n + i] = s.bottom[i];
  }
  if (s.top) for (let i = 0; i < s.top.length; i++) rows[i] = s.top[i];
  if (s.over) {
    for (const o of s.over) {
      for (let dy = 0; dy < o.rows.length; dy++) {
        const y = o.y + dy;
        while (rows.length <= y) rows.push('');
        let row = rows[y];
        const src = o.rows[dy];
        for (let dx = 0; dx < src.length; dx++) {
          const ch = src[dx];
          if (ch === '.') continue;
          const x = o.x + dx;
          while (row.length <= x) row += '.';
          row = row.slice(0, x) + (ch === ',' ? '.' : ch) + row.slice(x + 1);
        }
        rows[y] = row;
      }
    }
  }
  return rows;
}

interface Grid {
  w: number;
  h: number;
  /** Anchor column in normalised grid space. */
  ax: number;
  maps: Map<string, string[]>;
}

const gridCache = new Map<UnitArt, Grid>();

/**
 * All maps of a unit normalised to one size: bottom aligned, and aligned on the unit's BACK edge
 * (left edge for right-facing art, right edge for left-facing art) so wider pose maps extend forward.
 */
function unitGrid(art: UnitArt): Grid {
  let g = gridCache.get(art);
  if (g) return g;
  const maps = new Map<string, string[]>();
  const widths = new Map<string, number>();
  let w = 0;
  let h = 0;
  for (const name of Object.keys(art.maps)) {
    const rows = resolveMap(art, name);
    const mw = Math.max(0, ...rows.map((r) => r.length));
    maps.set(name, rows.map((r) => r.padEnd(mw, '.')));
    widths.set(name, mw);
    h = Math.max(h, rows.length);
    w = Math.max(w, mw);
  }
  const right = art.face === 'L';
  for (const [name, rows] of maps) {
    const padded = rows.map((r) => (right ? r.padStart(w, '.') : r.padEnd(w, '.')));
    while (padded.length < h) padded.unshift('.'.repeat(w));
    maps.set(name, padded);
  }
  const iw = widths.get('idle') ?? w;
  const ax = (right ? w - iw : 0) + (art.ax ?? Math.floor(iw / 2));
  g = { w, h, ax, maps };
  gridCache.set(art, g);
  return g;
}

// ---------------------------------------------------------------------------
// Pose tables
// ---------------------------------------------------------------------------

type FrameRecipe = { map: string; op: 'none' | 'breathe' | 'bob' | 'lean' | 'recoil' | 'dead' };

function recipes(art: UnitArt, pose: Pose): FrameRecipe[] {
  const has = (n: string): boolean => n in art.maps;
  const named = art.poses?.[pose];
  if (named && named.length) return named.map((m) => ({ map: m, op: 'none' }));
  const idle: FrameRecipe[] = [
    { map: 'idle', op: 'none' },
    has('idle2') ? { map: 'idle2', op: 'none' } : { map: 'idle', op: art.breath ? 'breathe' : 'bob' },
  ];
  switch (pose) {
    case 'idle':
      return idle;
    case 'walk':
      if (has('walk1')) return [{ map: 'walk1', op: 'none' }, { map: has('walk2') ? 'walk2' : 'idle', op: 'none' }];
      return idle;
    case 'attack':
      if (has('attack1')) {
        const r: FrameRecipe[] = [{ map: 'attack1', op: 'none' }];
        if (has('attack2')) r.push({ map: 'attack2', op: 'none' });
        return r;
      }
      return [{ map: 'idle', op: 'lean' }];
    case 'cast':
      if (has('cast')) return has('cast2') ? [{ map: 'cast', op: 'none' }, { map: 'cast2', op: 'none' }] : [{ map: 'cast', op: 'none' }];
      return recipes(art, 'attack');
    case 'hurt':
      return [has('hurt') ? { map: 'hurt', op: 'none' } : { map: 'idle', op: 'recoil' }];
    case 'dead':
      return [has('dead') ? { map: 'dead', op: 'none' } : { map: 'idle', op: 'dead' }];
  }
}

export function unitFrameCount(key: string, pose: Pose): number {
  const art = unitArt(key);
  if (!art) return pose === 'idle' || pose === 'walk' ? 2 : 1;
  return recipes(art, pose).length;
}

// ---------------------------------------------------------------------------
// Baking
// ---------------------------------------------------------------------------

function paletteFor(art: UnitArt, tier: number): Palette {
  return typeof art.pal === 'function' ? art.pal(tier) : art.pal;
}

const frameCache = new Map<string, UnitFrame>();

/** Placeholder for unknown keys: a small magenta-ish blob so missing art is obvious but harmless. */
function unknownFrame(): UnitFrame {
  const p = makePix(12, 12);
  const c = parseColor('#8a4a9a');
  for (let y = 2; y < 12; y++) for (let x = 2; x < 10; x++) setPx(p, x, y, c);
  return { pix: outline(p, '#140c18'), ax: 7, ay: 13 };
}

export function unitFrame(key: string, pose: Pose, frame: number, tier = 0): UnitFrame {
  const art = unitArt(key);
  if (!art) return unknownFrame();
  const list = recipes(art, pose);
  const fi = ((frame % list.length) + list.length) % list.length;
  const t = Math.max(0, Math.min(5, tier | 0));
  const id = `${key}|${pose}|${fi}|${t}`;
  let f = frameCache.get(id);
  if (!f) {
    f = bake(art, pose, list[fi], fi, t);
    frameCache.set(id, f);
  }
  return f;
}

function bake(art: UnitArt, pose: Pose, r: FrameRecipe, fi: number, tier: number): UnitFrame {
  const g = unitGrid(art);
  const pal = paletteFor(art, tier);
  const rows = g.maps.get(r.map)!;
  const glowChars = art.glow ?? '';
  const M = MARGIN;
  let body = makePix(g.w + M * 2, g.h + M * 2);
  let light = makePix(g.w + M * 2, g.h + M * 2);
  paintMap(body, rows, pal, M, M, glowChars);
  if (glowChars) paintMap(light, rows, pal, M, M, undefined, glowChars);
  let ax = M + g.ax;
  let ay = M + g.h;
  const dir = art.face === 'R' ? 1 : -1;
  const H = g.h;
  const lean = art.lean ?? 2;

  const both = (fn: (p: Pix) => Pix): void => {
    body = fn(body);
    light = fn(light);
  };
  switch (r.op) {
    case 'breathe':
      both((p) => breathe(p, M + (art.breath ?? 0), 1));
      break;
    case 'bob':
      both((p) => shift(p, 0, -1));
      break;
    case 'lean':
      both((p) => shift(shiftRows(p, (y) => dir * Math.round(lean * Math.max(0, 1 - (y - M) / H))), dir * lean, 0));
      break;
    case 'recoil':
      both((p) => shift(shiftRows(p, (y) => -dir * Math.round(2 * Math.max(0, 1 - (y - M) / H))), -dir, 0));
      break;
    case 'dead': {
      const style = art.dead ?? 'topple';
      if (style === 'topple') {
        const cw = dir < 0;
        const bb = bbox(body);
        const crop = makePix(bb.x1 - bb.x0 + 1, bb.y1 - bb.y0 + 1);
        blit(crop, body, -bb.x0, -bb.y0);
        const rot = rot90(crop, cw);
        body = pad(rot, M, M, M, M);
        light = makePix(body.w, body.h);
        ax = Math.floor(body.w / 2);
        ay = M + rot.h;
      } else {
        // slump: squash vertically to ~60%, keep feet on the ground
        const bb = bbox(body);
        const hh = bb.y1 - bb.y0 + 1;
        const nh = Math.max(4, Math.round(hh * 0.6));
        const o = makePix(body.w, body.h);
        for (let y = 0; y < nh; y++) {
          const sy = bb.y0 + Math.floor((y / nh) * hh);
          const ty = bb.y1 - nh + 1 + y;
          for (let x = 0; x < body.w; x++) {
            const si = (sy * body.w + x) * 4;
            if (body.d[si + 3] === 0) continue;
            const di = (ty * body.w + x) * 4;
            o.d[di] = body.d[si];
            o.d[di + 1] = body.d[si + 1];
            o.d[di + 2] = body.d[si + 2];
            o.d[di + 3] = body.d[si + 3];
          }
        }
        body = shiftRows(o, (y) => (y > bb.y1 - nh / 2 ? 0 : dir * -1));
        light = makePix(body.w, body.h);
      }
      body = dim(body, 0.45, 0.75);
      break;
    }
    case 'none':
      if (pose === 'dead') {
        body = dim(body, 0.5, 0.8);
        light = makePix(body.w, body.h);
      }
      break;
  }

  if (art.post) body = art.post(body, pose, fi, tier);

  if (art.scale && art.scale !== 1) {
    body = scale1_5(body);
    light = scale1_5(light);
    ax = Math.round(ax * 1.5);
    ay = Math.round(ay * 1.5);
  }

  let out = outline(body, art.out ?? '#140c18');
  blit(out, light, 1, 1);
  ax += 1;
  ay += 1;

  const auraCol = pose === 'dead' ? null : art.aura?.(tier) ?? null;
  if (auraCol) {
    out = addAura(out, auraCol, fi + (pose === 'idle' ? 0 : 3));
    ax += 1;
    ay += 1;
  }

  if (art.flip) {
    out = flipH(out);
    ax = out.w - ax;
  }
  return { pix: out, ax, ay };
}

/** Sparkling aura pixels just outside the silhouette (radiant gear tier). */
function addAura(p: Pix, color: string, seed: number): Pix {
  const o = pad(p, 1, 1, 1, 1);
  const c = parseColor(color);
  const src = pad(p, 1, 1, 1, 1);
  const op = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < src.w && y < src.h && src.d[(y * src.w + x) * 4 + 3] > 0;
  for (let y = 0; y < o.h; y++) {
    for (let x = 0; x < o.w; x++) {
      if (op(x, y)) continue;
      const near = op(x - 1, y) || op(x + 1, y) || op(x, y - 1) || op(x, y + 1);
      if (!near) continue;
      const r = hash2(x, y, seed);
      if (r < 0.16 && y < o.h - 4) setPx(o, x, y, { r: c.r, g: c.g, b: c.b, a: r < 0.06 ? 255 : 150 });
    }
  }
  return o;
}
