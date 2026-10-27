/**
 * EMBERBOUND EXPEDITION — parts for non-humanoid characters (beasts, flames, trees).
 *
 * Creatures are drawn in a local frame facing right: x forward, y down, the feet (or the bottom of a floating
 * body) at y = 0. `face(direction)` gives f = +1 (right) or −1 (left); every point goes through `pts(f, …)` so a
 * left-facing creature is mirrored point by point while its shading still falls on the lower right (the
 * Studio's light comes from the upper left). Parts are drawn in depth order with stable seeds by renderRig.
 */
import { renderRig, paint, paintA, ellipsePts, taperPts, cLine, strokePath, DRAW, PAL, TAU } from '../../../src/authoring.js';
import { withTilt, FALL } from './actions.js';

export const face = direction => direction === 'L' ? -1 : 1;
/** Mirror [x, y] pairs for the facing. */
export const pts = (f, list) => list.map(([x, y]) => [f * x, y]);
/** Mirror one point. */
export const pt = (f, x, y) => ({ x: f * x, y });

/** Painted shape in local coordinates (mirrored by f). */
export const blob = (ctx, f, list, fill, o = {}) => paintA(ctx, pts(f, list), { fill, w: 1.6, depth: 1.8, light: .15, speck: .8, speckScale: .32, amp: .3, ...o });
export const disc = (ctx, f, x, y, rx, ry, fill, o = {}) => paint(ctx, ellipsePts(f * x, y, rx, ry, 22), { fill, w: 1.2, depth: 1, speck: .4, speckScale: .3, amp: .2, ...o });
export const line = (ctx, f, list, w = .7) => cLine(ctx, pts(f, list), w);

/** Fur edge: a contour with small zigzag tufts along it (every `step` px, `len` px out). */
export function tufted(list, step = 6, len = 3) {
  const out = [];
  for (let i = 0; i < list.length - 1; i++) {
    const [x0, y0] = list[i], [x1, y1] = list[i + 1], L = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.round(L / step));
    const nx = (y1 - y0) / (L || 1), ny = -(x1 - x0) / (L || 1);
    for (let k = 0; k < n; k++) {
      const u = k / n, x = x0 + (x1 - x0) * u, y = y0 + (y1 - y0) * u;
      out.push([x, y], [x + (x1 - x0) / n * .5 + nx * len, y + (y1 - y0) / n * .5 + ny * len]);
    }
  }
  out.push(list[list.length - 1]);
  return out;
}

/**
 * Flame shape (local [x, y] pairs): a teardrop with a round bottom of width w resting on (cx, by) and a curling
 * tip h above it, leaning by `lean` × h (− = trailing backward). The edges wobble with time t; `seed` varies it.
 */
export function flamePts(cx, by, w, h, t, lean = 0, seed = 0) {
  const r = w / 2, cy = by - r, tip = [cx + lean * h, by - h], out = [];
  const wob = (u, k) => Math.sin(t * (9 + k) + seed * 1.7 + u * 7) * w * .05 * Math.sin(Math.PI * u);
  // Round bottom: a half circle from the left side under to the right side.
  for (let i = 0; i <= 8; i++) { const a = Math.PI * (1 - i / 8); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * .9]); }
  // Right (leading) side up to the tip: a gentle bulge, then the tip curls back.
  const bez = (p0, c, p1, u) => [(1 - u) ** 2 * p0[0] + 2 * (1 - u) * u * c[0] + u * u * p1[0], (1 - u) ** 2 * p0[1] + 2 * (1 - u) * u * c[1] + u * u * p1[1]];
  const cR = [cx + r * 1.05 + lean * h * .35, by - h * .62], cL = [cx - r * .9 + lean * h * .75, by - h * .5];
  // Licks: where the edge pulls in and flicks out again, so the outline reads as separate tongues.
  const lick = (u, a, b, depth) => u > a && u < b ? Math.sin((u - a) / (b - a) * Math.PI) * depth : 0;
  for (let i = 1; i <= 14; i++) {
    const u = i / 14, p = bez([cx + r, cy], cR, tip, u), k = lick(u, .5, .68, w * .14);
    out.push([p[0] + wob(u, 0) - k, p[1] - k * .5]);
  }
  // Left (trailing) side back down, with two licks that make extra tongues.
  for (let i = 13; i >= 1; i--) {
    const u = i / 14, p = bez([cx - r, cy], cL, tip, u), k = lick(u, .3, .48, w * .26) + lick(u, .58, .76, w * .2);
    out.push([p[0] + wob(u, 2) + k * .8, p[1] - k * .55]);
  }
  return out;
}

/** Three-tone flame (outer, middle, core) with an ink outline, plus two smaller tongues licking up behind it. */
export const FLAME = Object.freeze({ outer: '#ec7d33', mid: '#f6a948', core: '#ffe08c', spark: '#f39a3b' });
export function flame(ctx, f, cx, by, w, h, t, lean = 0, seed = 0, o = {}) {
  const outline = { w: o.w ?? 1.4, depth: 1.2, light: .2, speck: .5, amp: .15 };
  if (o.tongues !== false) {
    blob(ctx, f, flamePts(cx - w * .32, by - h * .12, w * .5, h * .62, t, lean * 1.25 - .15, seed + 3), o.outer ?? FLAME.outer, outline);
    blob(ctx, f, flamePts(cx + w * .3, by - h * .08, w * .42, h * .5, t, lean * .9 + .1, seed + 5), o.outer ?? FLAME.outer, outline);
  }
  blob(ctx, f, flamePts(cx, by, w, h, t, lean, seed), o.outer ?? FLAME.outer, outline);
  blob(ctx, f, flamePts(cx + lean * h * .04, by - h * .05, w * .66, h * .72, t, lean, seed + 1.3), o.mid ?? FLAME.mid, { w: 0, depth: .6, speck: .3, amp: .1 });
  blob(ctx, f, flamePts(cx + lean * h * .06, by - h * .08, w * .36, h * .42, t, lean, seed + 2.1), o.core ?? FLAME.core, { w: 0, depth: 0, speck: 0, amp: .08 });
}

/** Small drifting sparks above a flame (positions cycle with time, so cached frames loop). */
export function sparks(ctx, f, cx, cy, spread, rise, t, n = 4, seed = 0) {
  for (let i = 0; i < n; i++) {
    const u = ((t * .9 + i / n + seed) % 1 + 1) % 1, x = cx + Math.sin(i * 2.3 + seed) * spread, y = cy - u * rise;
    const r = 1.6 * (1 - u) + .5;
    ctx.save(); ctx.globalAlpha = 1 - u * .7;
    paint(ctx, ellipsePts(f * x, y, r, r * 1.3, 10), { fill: FLAME.spark, w: .6, depth: 0, speck: 0, amp: .1 });
    ctx.restore();
  }
}

/** Glowing ember spots or cracks: small orange shapes without outline. */
export function embers(ctx, f, list, color = '#e8742e') {
  for (const [x, y, rx, ry = rx * .7] of list) paint(ctx, ellipsePts(f * x, y, rx, ry, 12), { fill: color, w: 0, depth: 0, speck: 0, amp: .25 });
}
export function crack(ctx, f, list, color = '#ef8a3a') {
  strokePath(ctx, pts(f, list).map(([x, y]) => ({ x, y })), 2.2 * DRAW.lw, false, PAL.ink);
  strokePath(ctx, pts(f, list).map(([x, y]) => ({ x, y })), 1.2, false, color);
}

/** Two-segment leg from hip to foot, bending by `bend` px at the knee (+ = knee forward). Returns the knee. */
export function leg(ctx, f, hip, foot, r0, r1, fill, bend = 0, o = {}) {
  const [hx, hy] = hip, [fx, fy] = foot, mx = (hx + fx) / 2, my = (hy + fy) / 2, L = Math.hypot(fx - hx, fy - hy) || 1;
  // Perpendicular to hip → foot; for a leg pointing down it is +x, so + bend moves the knee forward.
  const knee = [mx + (fy - hy) / L * bend, my - (fx - hx) / L * bend];
  const P = ([x, y]) => ({ x: f * x, y });
  paint(ctx, taperPts(P(hip), P(knee), r0, (r0 + r1) / 2), { fill, w: 1.5, depth: 1.5, speck: .7, speckScale: .3, amp: .3 });
  paint(ctx, taperPts(P(knee), P(foot), (r0 + r1) / 2, r1), { fill, w: 1.5, depth: 1.3, speck: .6, speckScale: .3, amp: .3 });
  if (o.paw) {                                        // paw with three claws
    blob(ctx, f, [[fx - r1 * 1.1, fy], [fx - r1, fy - r1 * 1.2], [fx + r1 * 1.4, fy - r1 * 1.1], [fx + r1 * 2, fy - .5], [fx + r1 * 1.6, fy + .8]], o.paw, { w: 1.4, depth: 1 });
    for (const dx of [.6, 1.2, 1.8]) line(ctx, f, [[fx + r1 * dx, fy - 1.2], [fx + r1 * dx + 1.4, fy + .8]], .6);
  }
  if (o.hoof) blob(ctx, f, [[fx - r1 * 1.1, fy - r1 * 1.6], [fx + r1 * 1.1, fy - r1 * 1.6], [fx + r1 * 1.5, fy + .6], [fx - r1 * 1.3, fy + .6]], o.hoof, { w: 1.4, depth: 1, speck: .3 });
  if (o.claws) for (const dx of [-.6, .4, 1.4]) blob(ctx, f, [[fx + r1 * dx - 1, fy - 1], [fx + r1 * dx + 1.5, fy - 1.5], [fx + r1 * dx + 2.6, fy + .8]], o.claws, { w: .7, depth: .2, speck: 0 });
  return knee;
}

/** Tapering limb (branch, root, tentacle) along a polyline, the radius going from r0 to r1. */
export function limb(ctx, f, list, r0, r1, fill, o = {}) {
  const P = ([x, y]) => ({ x: f * x, y }), n = list.length - 1;
  for (let i = 0; i < n; i++) {
    const ra = r0 + (r1 - r0) * i / n, rb = r0 + (r1 - r0) * (i + 1) / n;
    paint(ctx, taperPts(P(list[i]), P(list[i + 1]), ra, rb), { fill, w: o.w ?? 1.5, depth: o.depth ?? 1.4, speck: .7, speckScale: .3, amp: .3 });
  }
}

/** Bark grain: wavy vertical lines across a trunk (x0..x1, from y0 down to y1), `n` lines. */
export function bark(ctx, f, x0, x1, y0, y1, n = 4, seed = 0, w = .6) {
  for (let i = 0; i < n; i++) {
    const x = x0 + (x1 - x0) * (i + .5) / n, list = [];
    for (let k = 0; k <= 4; k++) list.push([x + Math.sin(seed + i * 1.9 + k * 1.3) * (x1 - x0) / n * .25, y0 + (y1 - y0) * (k / 4) * (.6 + .3 * Math.abs(Math.sin(seed + i)))]);
    line(ctx, f, list, w);
  }
}

/**
 * Draw a creature's parts, tilted for hurt (and dead) with the shared tilt. `fall` sets the pivot (local px
 * behind the rear feet) for wide bodies.
 */
export function drawCreature(ctx, x, y, f, scale, parts, prefix, tilt = 0, fall = FALL) {
  withTilt(ctx, x, y, scale, f, tilt, false, () => renderRig(ctx, x, y, scale, parts, { prefix, boil: 0, shadow: false }), fall);
}

export { TAU };

/** Crystal colors shared by the cave creatures (area 3). */
export const CRYSTAL = Object.freeze({ lilac: '#c6aee9', blue: '#b9e0ee', pink: '#f0c0d6', white: '#f4f2fa', deep: '#9677c6', rock: '#7d7383', rockDark: '#5f5766', rockLight: '#a69bab' });

/**
 * A crystal: a hexagonal prism from its base (x, y) toward angle `a` (local radians, −π/2 = straight up), length
 * `len`, width `w`, with a pale upper-left face and facet lines. `o.glow` (0–1) brightens it.
 */
export function crystal(ctx, f, x, y, a, len, w, fill = CRYSTAL.lilac, o = {}) {
  const c = Math.cos(a), s = Math.sin(a), P = (u, v) => [x + c * u - s * v, y + s * u + c * v];
  const k = o.shoulder ?? .7;
  blob(ctx, f, [P(-2, -w / 2), P(len * k, -w / 2), P(len, 0), P(len * k, w / 2), P(-2, w / 2)], fill, { w: o.w ?? 1.4, depth: .9, light: .35, speck: .25, amp: .05 });
  ctx.save(); ctx.globalAlpha = .55 + (o.glow ?? 0) * .4;
  blob(ctx, f, [P(0, -w / 2), P(len * k, -w / 2), P(len - 1, -.5), P(len * k * .85, -w * .08), P(0, -w * .12)], CRYSTAL.white, { w: 0, depth: 0, speck: 0, amp: .04 });
  ctx.restore();
  line(ctx, f, [P(len * k, -w / 2), P(len * k * .9, 0), P(len * k, w / 2)], .5);
  line(ctx, f, [P(len * k * .9, 0), P(len - 1, 0)], .45);
  line(ctx, f, [P(len * .15, w * .1), P(len * k * .85, w * .05)], .4);
}

/** An angular rock plate: a jittered polygon around (x, y), radii rx × ry, with a few pale specks. */
export function rock(ctx, f, x, y, rx, ry, fill = CRYSTAL.rock, seed = 0, o = {}) {
  const n = o.n ?? 7, list = [];
  for (let i = 0; i < n; i++) {
    const a = (i + .5 * Math.sin(seed + i * 2.1)) / n * Math.PI * 2 + (o.rot ?? 0), j = .82 + .18 * Math.sin(seed * 1.7 + i * 3.3);
    list.push([x + Math.cos(a) * rx * j, y + Math.sin(a) * ry * j]);
  }
  blob(ctx, f, list, fill, { w: o.w ?? 1.6, depth: o.depth ?? 2, light: .25, speck: 1.2, amp: .08 });
  for (let i = 0; i < 2; i++) disc(ctx, f, x + Math.sin(seed + i * 4) * rx * .4, y + Math.cos(seed * 2 + i) * ry * .35, 1.1, .9, CRYSTAL.rockLight, { w: 0, depth: 0, speck: 0 });
  return list;
}

/** Charred bark colors shared by the tree creatures (Cinder Sapling, Gnarlwood). */
export const TREE = Object.freeze({ bark: '#5d4636', barkDark: '#3f3027', barkLight: '#7d6150', hollow: '#2a1f19', glow: '#ef8a3a', ink: PAL.ink });
