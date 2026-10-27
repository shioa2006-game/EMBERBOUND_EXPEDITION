/**
 * EMBERBOUND EXPEDITION — Ice Wraith (game id `ice_wraith`), a new floating ghost after the user's reference image:
 * a tall pointed hood whose tip curls up and back, a white mask with dark hollow eyes and mouth deep in the hood,
 * a cowl wrapped round the neck, two wide bell sleeves reaching forward, and a long robe that hangs from the
 * shoulders and streams down and back. Pale icy cloth darkens to blue toward the hems; the torn edges are kept
 * simple. It has no legs; the robe floats a little above the ground.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (floating, the robe rippling), attack (a short lunge, the sleeves
 * raking forward; contact at 0.15 s), `cast` = Blizzard, the wind-up the game loops (sleeves raised, snow swirling
 * round it), and the shared hurt.
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, drawCreature } from '../shared/emberbound/creature.js';

const C = { cloth: '#e6eef5', clothMid: '#b6cbe0', clothDark: '#6f90b5', inner: '#34496a', mask: '#eef3f7', hole: '#232c3d', ink: PAL.ink };
const IDLE_T = 2.4;
export const WRAITH_ATTACK_T = .3;    // lunge: the sleeves rake through at u = .5
export const WRAITH_BLIZZARD_T = .6;  // Blizzard wind-up: a loop

export function wraithPose(action, t) {
  const s = Math.sin(TAU * phase(t, IDLE_T));
  const P = { bob: s * 3, wave: t, shift: 0, reach: 0, raise: 0, lean: 0, snow: -1 };
  if (action === 'attack') {
    const u = phase(t, WRAITH_ATTACK_T);
    P.shift = sample([[0, [0]], [.25, [-5]], [.5, [14]], [.7, [11]], [1, [0]]], u);
    P.reach = sample([[0, [0]], [.25, [-6]], [.5, [12]], [.7, [9]], [1, [0]]], u);
    P.raise = sample([[0, [0]], [.25, [10]], [.5, [-4]], [1, [0]]], u);
    P.lean = sample([[0, [0]], [.5, [4]], [1, [0]]], u);
  } else if (action === 'cast') {
    // Blizzard: both sleeves raised, the body swaying, snow circling; periodic in u.
    const u = phase(t, WRAITH_BLIZZARD_T), w = Math.sin(TAU * u);
    P.raise = 20 + w * 2; P.reach = -4; P.bob = w * 2; P.snow = u;
  }
  return P;
}

/** A gently torn edge from p to q: shallow tongues hanging toward (nx, ny), swaying with time. */
function hem(p, q, n, depth, t, seed = 0) {
  const out = [], dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, nx = dy / L, ny = -dx / L;
  for (let i = 0; i <= n * 2; i++) {
    const u = i / (n * 2), d = i % 2 ? depth * (.6 + .4 * Math.abs(Math.sin(seed + i * 1.3))) : 0, sw = Math.sin(t * 3 + i * .7 + seed) * 1.2;
    out.push([p[0] + dx * u + nx * d + sw, p[1] + dy * u + ny * d]);
  }
  return out;
}

export function drawWraith(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = wraithPose(action, t), f = face(direction), sx = P.shift, by = -P.bob, wv = Math.sin(P.wave * 2) * 3;
  // Upper points lean forward with P.lean and everything bobs.
  const U = ([px, py]) => [px + sx + P.lean * Math.max(0, -py - 30) / 70, py + by];
  const parts = [];
  // A wide bell sleeve from the shoulder reaching forward, widening to an open, slightly torn cuff.
  const sleeve = (sh, near) => {
    const k = near ? 1 : .9, cx = sh[0] + (40 + P.reach) * k, cy = sh[1] + (near ? 16 : 10) - P.raise, col = near ? C.cloth : C.clothMid;
    const under = hem([cx + 3, cy + 15], [cx - 16, cy + 24], 3, 6, P.wave, near ? 1 : 2);
    blob(ctx, f, [[sh[0] - 3, sh[1] - 5], [sh[0] + 12, sh[1] - 7], [cx - 6, cy - 13], [cx + 5, cy - 8], [cx + 8, cy + 6], ...under, [cx - 26, cy + 12], [sh[0] + 6, sh[1] + 8], [sh[0] - 4, sh[1] + 5]].map(U), col, { w: 1.8, depth: 2, speck: .7 });
    // The open cuff, dark inside; the lower half of the sleeve shades to blue.
    blob(ctx, f, [[cx + 5, cy - 9], [cx + 7, cy], [cx + 5, cy + 9], [cx, cy + 4], [cx, cy - 6]].map(U), C.inner, { w: 1.1, depth: 0, speck: 0 });
    blob(ctx, f, [[cx, cy + 6], [cx + 6, cy + 10], ...under, [cx - 25, cy + 11], [cx - 14, cy + 8]].map(U), C.clothDark, { w: 0, depth: .5, speck: .4 });
    for (const dy of [-4, 2]) line(ctx, f, [U([sh[0] + 8, sh[1] + dy]), U([cx - 8, cy + dy - 2])], .5);
  };
  parts.push({ id: 'farSleeve', d: -6, draw: () => sleeve([8, -70], false) });
  parts.push({ id: 'robe', d: -2, draw: () => {
    // The robe hangs from the shoulders and streams down and back in long folds; the hem is torn a little.
    const bottom = hem([14, -30], [-56, -10], 6, 7, P.wave, 3);
    const tail = hem([-56, -10], [-96, -30 + wv], 3, 7, P.wave, 5);
    const robe = [[-22, -86], [6, -80], [18, -64], [20, -44], ...bottom, ...tail, [-88, -44 + wv], [-64, -54], [-40, -70]];
    blob(ctx, f, robe.map(U), C.cloth, { w: 2, depth: 3, light: .25, speck: 1.2 });
    // Blue toward the hems, then a deeper blue on the lower folds.
    blob(ctx, f, [[20, -46], ...bottom, ...tail, [-86, -42 + wv], [-60, -36], [-32, -34], [-4, -40]].map(U), C.clothMid, { w: 0, depth: .8, speck: .6 });
    blob(ctx, f, [...bottom.map(([px, py]) => [px, py - 2]), ...tail.map(([px, py]) => [px, py - 2]), [-80, -30 + wv], [-50, -22], [-18, -22], [8, -26]].map(U), C.clothDark, { w: 0, depth: .6, speck: .5 });
    // Long folds following the flow.
    for (const pts of [[[6, -72], [4, -50], [0, -30]], [[-12, -76], [-20, -50], [-26, -24]], [[-32, -66], [-46, -42], [-52, -20]], [[-54, -56], [-70, -40], [-80, -30]]]) line(ctx, f, pts.map(U), .65);
  } });
  parts.push({ id: 'hood', d: 4, draw: () => {
    // The cowl wrapped round the neck, under the hood.
    blob(ctx, f, [[-24, -88], [-6, -80], [16, -78], [26, -72], [18, -64], [0, -64], [-18, -70], [-28, -78]].map(U), C.clothMid, { w: 1.6, depth: 1.4, speck: .6 });
    for (const pts of [[[-16, -76], [0, -70], [16, -70]], [[-20, -82], [-2, -76], [18, -76]]]) line(ctx, f, pts.map(U), .55);
    // The tall hood: its tip curls up and back.
    const tip = [[-20, -128], [-30, -140 + wv * .4], [-42, -142 + wv * .4], [-34, -136 + wv * .3], [-26, -126]];
    blob(ctx, f, [[28, -104], [16, -118], [0, -124], ...tip, [-24, -112], [-26, -94], [-18, -80], [2, -72], [22, -72], [34, -86]].map(U), C.cloth, { w: 2, depth: 2.4, speck: .8 });
    line(ctx, f, [[-8, -118], [-22, -126], [-32, -136]].map(U), .55);
    // The deep opening, then the white mask inside it: dark eyes and mouth.
    blob(ctx, f, [[16, -112], [30, -98], [31, -80], [20, -72], [4, -78], [2, -96], [8, -108]].map(U), C.inner, { w: 1.3, depth: 0, speck: 0 });
    blob(ctx, f, [[14, -106], [26, -98], [29, -84], [24, -74], [14, -76], [8, -90]].map(U), C.mask, { w: 1.4, depth: .9, speck: .2 });
    for (const [ex, ey] of [[15, -94], [23, -92]]) disc(ctx, f, ...U([ex, ey]), 2.5, 4, C.hole, { w: .5, depth: 0, speck: 0 });
    disc(ctx, f, ...U([21, -81]), 1.9, 2.8, C.hole, { w: .5, depth: 0, speck: 0 });
    line(ctx, f, [[-18, -108], [-14, -94], [-6, -84]].map(U), .6);
  } });
  parts.push({ id: 'nearSleeve', d: 8, draw: () => sleeve([-6, -62], true) });
  parts.push({ id: 'snow', d: 12, draw: () => {
    if (P.snow < 0) return;
    // Snow and ice flakes swirling round it as the blizzard gathers (they cycle with the loop).
    for (let i = 0; i < 7; i++) {
      const u = (P.snow + i / 7) % 1, a = TAU * u + i, r = 38 + (i % 3) * 10, fx = Math.cos(a) * r - 14, fy = -66 + Math.sin(a) * r * .55 - u * 16;
      ctx.save(); ctx.globalAlpha = Math.sin(Math.PI * u);
      for (let k = 0; k < 3; k++) { const b = k * Math.PI / 3; line(ctx, f, [[fx - Math.cos(b) * 4, fy - Math.sin(b) * 4], [fx + Math.cos(b) * 4, fy + Math.sin(b) * 4]], .6); }
      disc(ctx, f, fx, fy, 1.2, 1.2, '#f4f8fc', { w: 0, depth: 0, speck: 0 });
      ctx.restore();
    }
  } });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-ice-wraith', fallTilt(action, t), { pivot: 30, toe: 30, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-ice-wraith', label: 'Ice Wraith — EMBERBOUND', kind: 'creature', directional: true, draw: drawWraith,
  actions: { idle: { period: IDLE_T, frames: 12 },
    attack: { period: WRAITH_ATTACK_T, keys: [0, .12, .25, .38, .5, .6, .7, .85], once: true },
    cast: { period: WRAITH_BLIZZARD_T, frames: 8 },
    hurt: hurtAction },
  frameBox: { x0: -140, x1: 140, y0: -170, y1: 14 },
  emberbound: { gameId: 'ice_wraith', heightPx: 21, facing: 'L' },
});
export const studio = Object.freeze({ order: 26, name: 'Ice Wraith（氷の亡霊）', category: 'EMBERBOUND 第4エリア',
  description: '氷色の布のフードと長衣をまとって浮かぶ亡霊。白い仮面に暗い目と口の穴、大きな袖。吹雪 Blizzard で全体を凍えさせる。',
  preview: { direction: 'L', phase: 0 } });
