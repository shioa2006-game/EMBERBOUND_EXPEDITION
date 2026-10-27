/**
 * EMBERBOUND EXPEDITION — Cinder Phoenix (game id `cinder_phoenix`), a new burning bird after the user's reference
 * image, seen from the side: a golden head with a swept crest of flame-tipped feathers, a hooked beak and a dark
 * eye, a pale yellow breast, two great raised wings layered red, orange and gold whose feather tips flicker into
 * flame, dark talons, and a long tail of flowing flame plumes. The game raises flying enemies 18 px, so the talons
 * hang at about y = 0 here.
 * Actions (plan/EMBERBOUND_PRODUCTION.md): idle (slow, strong wingbeats, a loop), attack (a fireball spat at a
 * random hero — the game fires the spell at the start, so it leaves the beak at u = .15, 0.045 s), the shared hurt.
 * (Its rebirth from the ashes is the game's own effect.)
 */
import { TAU, PAL } from '../../src/authoring.js';
import { hurtAction, phase, sample, fallTilt } from '../shared/emberbound/actions.js';
import { face, blob, disc, line, limb, tufted, flame, drawCreature } from '../shared/emberbound/creature.js';

const C = {
  red: '#c4432f', redDark: '#93301f', orange: '#ec7d33', gold: '#f3b14a', yellow: '#f8d77e', breast: '#f6e2a0',
  beak: '#e9b85a', eye: '#3a1d12', talon: '#5a3a2a', ink: PAL.ink,
};
const FIRE = { outer: '#ec7d33', mid: '#f6a948', core: '#ffe08c' };
const FLAP_T = .6;
export const PHOENIX_ATTACK_T = .3;   // the fireball leaves the beak at u = .15

export function phoenixPose(action, t) {
  const fl = Math.sin(TAU * phase(t, FLAP_T));
  const P = { flap: fl, bob: -fl * 3, shift: 0, rise: 0, beak: 0, bolt: -1, t };
  if (action === 'attack') {
    const u = phase(t, PHOENIX_ATTACK_T);
    P.shift = sample([[0, [0]], [.08, [-5]], [.15, [6]], [.5, [4]], [1, [0]]], u);
    P.rise = sample([[0, [0]], [.08, [-4]], [.15, [2]], [1, [0]]], u);
    P.flap = sample([[0, [0]], [.08, [1]], [.2, [-.8]], [.6, [0]], [1, [0]]], u);
    P.bob = 0; P.beak = sample([[0, [0]], [.1, [1]], [.3, [.4]], [1, [0]]], u);
    P.bolt = u >= .15 && u < .75 ? (u - .15) / .6 : -1;
  }
  return P;
}

/** Rotate points (relative to o) about o by a. */
const turn = (pts, o, a) => pts.map(([px, py]) => [o[0] + px * Math.cos(a) - py * Math.sin(a), o[1] + px * Math.sin(a) + py * Math.cos(a)]);

/** A smooth tapering plume along a cubic curve p0 → p3 (controls p1, p2), from width w0 to w1, its edge rippling. */
function plume(ctx, f, [p0, p1, p2, p3], w0, w1, fill, t, seed) {
  const L = [], R = [], n = 18;
  for (let i = 0; i <= n; i++) {
    const u = i / n, v = 1 - u, at = k => v * v * v * p0[k] + 3 * v * v * u * p1[k] + 3 * v * u * u * p2[k] + u * u * u * p3[k];
    const d = k => -3 * v * v * p0[k] + 3 * (v * v - 2 * u * v) * p1[k] + 3 * (2 * u * v - u * u) * p2[k] + 3 * u * u * p3[k];
    const dx = d(0), dy = d(1), l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, w = (w0 + (w1 - w0) * u) * (1 + .12 * Math.sin(u * 14 + t * 6 + seed));
    L.push([at(0) + nx * w, at(1) + ny * w]); R.push([at(0) - nx * w * .8, at(1) - ny * w * .8]);
  }
  blob(ctx, f, [...L, ...R.reverse()], fill, { w: 1.4, depth: 1.4, light: .25, speck: .8, amp: .2 });
}

/**
 * A raised wing from its root o, turned by a: a red outer band of long feathers with scalloped tips, an orange
 * middle band, gold coverts near the root, and flames flickering at the outermost tips. `k` scales it.
 */
function wing(ctx, f, o, a, t, k, dark) {
  const S = pts => turn(pts.map(([px, py]) => [px * k, py * k]), o, a);
  const outer = [[0, 0], [-6, -30], [-14, -60], [-24, -86], [-34, -100], [-44, -94], [-46, -80], [-56, -76], [-58, -62], [-68, -56], [-66, -42], [-74, -34], [-68, -22], [-72, -10], [-58, -8], [-40, -4], [-18, 2]];
  blob(ctx, f, S(outer), dark ? C.redDark : C.red, { w: 1.7, depth: 2, light: .2, speck: 1 });
  blob(ctx, f, S([[0, 0], [-6, -28], [-14, -54], [-24, -74], [-34, -80], [-38, -66], [-48, -58], [-50, -44], [-56, -34], [-48, -22], [-30, -12], [-12, -2]]), dark ? C.red : C.orange, { w: 1.2, depth: 1.4, speck: .8 });
  blob(ctx, f, S(tufted([[0, 0], [-6, -24], [-16, -42], [-26, -46], [-30, -34], [-24, -18], [-10, -4]], 5, 2)), dark ? C.orange : C.gold, { w: 1, depth: 1, speck: .6 });
  for (const p of [[-30, -84], [-44, -64], [-56, -44], [-62, -26]]) line(ctx, f, S([[p[0] * .45, p[1] * .45], p]), .5);
  // Flames flickering from the outermost feather tips.
  for (const [px, py, s] of [[-34, -100, 1], [-58, -62, .8], [-72, -10, .7]]) { const [q] = S([[px, py]]); flame(ctx, f, q[0], q[1] + 6, 10 * k * s, 20 * k * s, t, -.4, px, { ...FIRE, tongues: false, w: 1 }); }
}

export function drawPhoenix(ctx, x, y, direction, action, t, scale = 1, opts = {}) {
  const P = phoenixPose(action, t), f = face(direction), cx = P.shift, cy = -40 + P.bob - P.rise, fa = P.flap * .32;
  const sh = [cx - 2, cy - 12];
  const parts = [];
  // The far wing rises behind the body, a little forward and darker.
  parts.push({ id: 'farWing', d: -8, draw: () => wing(ctx, f, [sh[0] + 8, sh[1] - 2], fa * 1.1 + .25, P.t, .74, true) });
  parts.push({ id: 'tail', d: -6, draw: () => {
    // Long flowing plumes trailing back and down in S-curves, each ending in a flame.
    const sway = Math.sin(P.t * 2.2) * 4;
    [[0, 1, C.red], [14, .9, C.orange], [-12, .82, C.gold]].forEach(([o, k, col], i) => {
      const b0 = [cx - 16, cy + 8], q = ([px, py]) => [b0[0] + px * k, b0[1] + py];
      const pts = [q([0, 0]), q([-50, 6 + o]), q([-6 + sway, 50 + o]), q([-62 + sway * 1.5, 84 + o * 1.4])];
      plume(ctx, f, pts, 10 * k, 3 * k, col, P.t, i * 2);
      const e = pts[3];
      flame(ctx, f, e[0], e[1] + 8, 12 * k, 22 * k, P.t, -.6, i + 3, { ...FIRE, tongues: false, w: 1.1 });
    });
  } });
  parts.push({ id: 'body', d: 0, draw: () => {
    // Talons, then the body: a red back, a pale breast.
    for (const [dx, col] of [[2, C.talon], [8, C.talon]]) {
      const hip = [cx + dx, cy + 14], foot = [cx + dx + 2, cy + 30];
      limb(ctx, f, [hip, foot], 2.4, 2, col, { w: 1, depth: .3 });
      for (const a of [-.6, 0, .6]) line(ctx, f, [foot, [foot[0] + Math.cos(a + .8) * 5, foot[1] + Math.sin(a + .8) * 5]], .9);
    }
    blob(ctx, f, tufted([[cx - 22, cy + 8], [cx - 16, cy - 10], [cx, cy - 18], [cx + 14, cy - 14], [cx + 20, cy], [cx + 14, cy + 14], [cx - 4, cy + 18]], 5, 2.4), C.orange, { w: 1.8, depth: 2.2, speck: 1.2 });
    blob(ctx, f, tufted([[cx + 4, cy - 10], [cx + 18, cy - 4], [cx + 18, cy + 8], [cx + 8, cy + 16], [cx - 4, cy + 14], [cx - 2, cy]], 4, 2), C.breast, { w: 0, depth: .8, speck: .8 });
  } });
  parts.push({ id: 'head', d: 4, draw: () => {
    const hx = cx + 22, hy = cy - 24;
    // The neck, the swept crest of flame-tipped feathers, the head, the hooked beak and the eye.
    blob(ctx, f, [[cx + 4, cy - 14], [hx - 6, hy - 6], [hx + 6, hy + 4], [cx + 18, cy - 2]], C.gold, { w: 1.6, depth: 1.4, speck: .8 });
    for (const [dx, dy, l, a] of [[-6, -8, 24, -2.4], [-2, -10, 28, -2.1], [3, -10, 22, -1.8]]) {
      const tip = [hx + dx + Math.cos(a) * l, hy + dy + Math.sin(a) * l];
      blob(ctx, f, [[hx + dx - 3, hy + dy], [tip[0], tip[1]], [hx + dx + 3, hy + dy]], C.orange, { w: 1.2, depth: .6, speck: .4 });
      flame(ctx, f, tip[0], tip[1] + 5, 7, 13, P.t, -.5, dx, { ...FIRE, tongues: false, w: .9 });
    }
    blob(ctx, f, tufted([[hx - 10, hy + 2], [hx - 8, hy - 8], [hx + 2, hy - 11], [hx + 11, hy - 6], [hx + 12, hy + 4], [hx + 4, hy + 9], [hx - 6, hy + 8]], 4, 1.6), C.gold, { w: 1.7, depth: 1.6 });
    const bk = P.beak * 3;
    blob(ctx, f, [[hx + 9, hy - 3], [hx + 20, hy - 1], [hx + 22, hy + 3], [hx + 18, hy + 2], [hx + 10, hy + 2]], C.beak, { w: 1.2, depth: .4, speck: 0 });
    blob(ctx, f, [[hx + 10, hy + 2], [hx + 18, hy + 3 + bk * .5], [hx + 11, hy + 5 + bk]], C.beak, { w: 1, depth: .3, speck: 0 });
    disc(ctx, f, hx + 5, hy - 2, 2.2, 2.4, C.eye, { w: .7, depth: 0, speck: 0 });
    disc(ctx, f, hx + 5.6, hy - 2.8, .7, .7, '#ffffff', { w: 0, depth: 0, speck: 0 });
    line(ctx, f, [[hx + 1, hy - 5], [hx + 8, hy - 5.6]], .9);
  } });
  parts.push({ id: 'nearWing', d: 6, draw: () => wing(ctx, f, sh, fa, P.t, .86, false) });
  parts.push({ id: 'fireball', d: 12, draw: () => {
    if (P.bolt < 0) return;
    // The fireball spat from the beak, flying forward and fading.
    const u = P.bolt, bx = cx + 48 + u * 80, by = cy - 22 + u * 10, r = 9 * (1 - u * .3);
    ctx.save(); ctx.globalAlpha = 1 - u * .6;
    flame(ctx, f, bx, by + r, r * 2, r * 2.6, P.t, -1.2, 9, { ...FIRE, w: 1.2 });
    ctx.restore();
  } });
  drawCreature(ctx, x, y, f, scale, parts, 'eb-cinder-phoenix', fallTilt(action, t), { pivot: 10, toe: 10, shift: 0 });
  return { pose: P, order: parts.map(p => p.id) };
}

export const character = Object.freeze({
  id: 'eb-cinder-phoenix', label: 'Cinder Phoenix — EMBERBOUND', kind: 'creature', directional: true, draw: drawPhoenix,
  actions: { idle: { period: FLAP_T, frames: 8 },
    attack: { period: PHOENIX_ATTACK_T, keys: [0, .08, .15, .25, .35, .5, .7, .85], once: true, releaseAt: .15 },
    hurt: hurtAction },
  frameBox: { x0: -170, x1: 170, y0: -200, y1: 90 },
  emberbound: { gameId: 'cinder_phoenix', heightPx: 23, facing: 'L' },
});
export const studio = Object.freeze({ order: 38, name: 'Cinder Phoenix（燠の不死鳥）', category: 'EMBERBOUND 第6エリア',
  description: '黄から橙に燃える鳥。大きな翼と長く流れる炎の尾羽。火の玉で攻撃し、倒れても灰から蘇る。',
  preview: { direction: 'L', phase: 0 } });
