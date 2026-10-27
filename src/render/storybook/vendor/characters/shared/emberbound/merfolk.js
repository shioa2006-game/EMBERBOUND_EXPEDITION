/**
 * EMBERBOUND EXPEDITION — parts for the sea folk whose lower body is a tail (Siren's fish tail, the Coilscale
 * Matriarch's serpent coils). Same local frame as creature.js: facing right, ground at y = 0, every point
 * mirrored by f.
 */
import { paint, taperPts, strokePath, DRAW, PAL } from '../../../src/authoring.js';
import { blob, disc, line, pts } from './creature.js';

/** Catmull-Rom points through `list` (n steps per span), carrying `widths` along. */
function smooth(list, widths, n = 6) {
  const out = [], ws = [];
  for (let i = 0; i < list.length - 1; i++) {
    const p0 = list[Math.max(0, i - 1)], p1 = list[i], p2 = list[i + 1], p3 = list[Math.min(list.length - 1, i + 2)];
    for (let k = 0; k < n; k++) {
      const t = k / n, t2 = t * t, t3 = t2 * t;
      const c = (a, b, cc, d) => .5 * (2 * b + (-a + cc) * t + (2 * a - 5 * b + 4 * cc - d) * t2 + (-a + 3 * b - 3 * cc + d) * t3);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
      ws.push(widths[i] + (widths[i + 1] - widths[i]) * t);
    }
  }
  out.push(list[list.length - 1]); ws.push(widths[widths.length - 1]);
  return { out, ws };
}

/**
 * A scaled tube along a spine (a tail or a serpent body). `widths` per spine point. The belly band lies on the
 * `bellySide` (+1 = the left of the travel direction in the local frame) and covers `belly` of the half width.
 * Returns the smoothed spine and widths for placing a fin at the end.
 */
export function tube(ctx, f, spine, widths, o = {}) {
  const { out, ws } = smooth(spine, widths, o.steps ?? 6), L = [], R = [], B = [], N = [];
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)], b = out[Math.min(out.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const n = [-dy / l, dx / l], w = ws[i] / 2, p = out[i];
    N.push(n); L.push([p[0] + n[0] * w, p[1] + n[1] * w]); R.push([p[0] - n[0] * w, p[1] - n[1] * w]);
    const s = o.bellySide ?? 1, k = 1 - 2 * (o.belly ?? .45);
    B.push([p[0] + n[0] * w * s * k, p[1] + n[1] * w * s * k]);
  }
  // `openEnds` ('start' | 'end' | 'both') leaves the cut end(s) without an ink line, so a piece that continues
  // under another piece of the same body joins it without a seam.
  const open = o.openEnds, w = o.w ?? 2;
  blob(ctx, f, [...L, ...R.slice().reverse()], o.fill, { w: open ? 0 : w, depth: o.depth ?? 3, light: .2, speck: 1.4, amp: .2 });
  if (open) {
    const ink = list => strokePath(ctx, pts(f, list).map(([x, y]) => ({ x, y })), w * DRAW.lw, false);
    if (open === 'both') { ink(L); ink(R); }
    else if (open === 'start') ink([...L, ...R.slice().reverse()]);
    else ink([...L.slice().reverse(), ...R]);
  }
  if (o.bellyFill) {
    const edge = (o.bellySide ?? 1) > 0 ? L : R;
    blob(ctx, f, [...edge, ...B.slice().reverse()], o.bellyFill, { w: 0, depth: .8, speck: .6, amp: .15 });
    // Belly plates: short bars across the band.
    for (let i = 2; i < out.length - 1; i += 2) line(ctx, f, [edge[i], B[i]], .5);
  }
  if (o.scale) {
    // Scale arcs across the back of the tube.
    const step = o.scaleStep ?? 3;
    for (let i = 1; i < out.length - 1; i += step) {
      const w = ws[i] / 2, n = N[i], p = out[i], s = -(o.bellySide ?? 1);
      for (const k of [.15, .55]) {
        const c = [p[0] + n[0] * w * s * k, p[1] + n[1] * w * s * k], r = Math.max(1.2, w * .22);
        line(ctx, f, [[c[0] - n[1] * r - n[0] * r * .4, c[1] + n[0] * r - n[1] * r * .4], [c[0] + n[0] * r * .5, c[1] + n[1] * r * .5], [c[0] + n[1] * r - n[0] * r * .4, c[1] - n[0] * r - n[1] * r * .4]], .45);
      }
    }
  }
  return { out, ws, N };
}

/** A fan fin at `base` opening toward angle `a` (radians in the local frame), span `spread`, length `len`. */
export function fanFin(ctx, f, base, a, len, spread, fill, light, o = {}) {
  const list = [base];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8, ang = a - spread / 2 + spread * t, r = len * (1 - .18 * Math.sin(Math.PI * t * 2) ** 2) * (i % 2 ? .92 : 1);
    list.push([base[0] + Math.cos(ang) * r, base[1] + Math.sin(ang) * r]);
  }
  blob(ctx, f, list, fill, { w: o.w ?? 1.6, depth: 1.4, light: .3, speck: .6, amp: .2 });
  if (light) blob(ctx, f, [base, ...list.slice(3, 7).map(([x, y]) => [base[0] + (x - base[0]) * .7, base[1] + (y - base[1]) * .7])], light, { w: 0, depth: .3, speck: .3 });
  for (let i = 1; i < 8; i++) {
    const [x, y] = list[i + 1];
    line(ctx, f, [base, [base[0] + (x - base[0]) * .85, base[1] + (y - base[1]) * .85]], .45);
  }
}

/** A slender arm: shoulder → elbow → hand, with a small open hand (fingers along the forearm direction). */
export function arm(ctx, f, s, e, h, skin, o = {}) {
  const P = ([x, y]) => ({ x: f * x, y });
  paint(ctx, taperPts(P(s), P(e), o.r0 ?? 4.6, o.r1 ?? 3.8), { fill: skin, w: 1.5, depth: 1.3, speck: .5, speckScale: .3, amp: .2 });
  paint(ctx, taperPts(P(e), P(h), o.r1 ?? 3.8, o.r2 ?? 3.2), { fill: skin, w: 1.5, depth: 1.1, speck: .4, speckScale: .3, amp: .2 });
  const dx = h[0] - e[0], dy = h[1] - e[1], l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l, k = o.hand ?? 4;
  if (o.grip) { disc(ctx, f, h[0], h[1], k * 1.05, k, skin, { w: 1.3, depth: .6, speck: 0 }); return; }
  // Open hand: a palm and four short fingers fanning out.
  disc(ctx, f, h[0] + ux * k * .4, h[1] + uy * k * .4, k, k * .85, skin, { w: 1.3, depth: .6, speck: 0 });
  for (const d of [-.7, -.25, .2, .65]) {
    const a = Math.atan2(uy, ux) + d + (o.splay ?? 0), b0 = [h[0] + ux * k * .9, h[1] + uy * k * .9];
    paint(ctx, taperPts(P(b0), P([b0[0] + Math.cos(a) * k * 1.4, b0[1] + Math.sin(a) * k * 1.4]), k * .32, k * .24), { fill: skin, w: 1, depth: .3, speck: 0, amp: .1 });
  }
}

/** Big dark chibi eyes (with lashes and a glint) at the given centres; `closed` draws arcs. */
export function eyes(ctx, f, list, rx, ry, o = {}) {
  for (const [x, y] of list) {
    if (o.closed) { line(ctx, f, [[x - rx, y], [x, y + ry * .3], [x + rx, y]], 1.1); continue; }
    disc(ctx, f, x, y, rx, ry, PAL.ink, { w: .5, depth: 0, speck: 0 });
    disc(ctx, f, x - rx * .3, y - ry * .4, rx * .3, ry * .22, '#ffffff', { w: 0, depth: 0, speck: 0 });
    if (o.lash) line(ctx, f, [[x + rx * .6, y - ry * .7], [x + rx * 1.3, y - ry * 1.1]], .7);
    if (o.brow) line(ctx, f, o.brow([x, y]), 1.1);
  }
}

export { pts };
